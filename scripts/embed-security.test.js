const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { TextEncoder } = require('node:util');
const { validatePartnerAllowlist } = require('./validate-partner-allowlist');

const repoRoot = path.resolve(__dirname, '..');
const sdkCode = fs.readFileSync(path.join(repoRoot, 'src/assets/embed/microbetrace-embed.js'), 'utf8');
const receiverCode = fs.readFileSync(path.join(repoRoot, 'src/assets/embed/receiver.js'), 'utf8');

test('SDK fails closed without Web Crypto', () => {
  const context = createSdkContext({ crypto: undefined });

  assert.throws(() => {
    context.MicrobeTraceEmbed.open({
      partnerId: 'local-dev',
      files: [{ name: 'nodes.csv', contents: 'id\nA\n' }],
    });
  }, /Web Crypto/);
});

test('SDK infers target from its script source', () => {
  const context = createSdkContext();

  context.MicrobeTraceEmbed.open({
    partnerId: 'local-dev',
    files: [{ name: 'nodes.csv', contents: 'id\nA\n' }],
  });

  assert.equal(
    context.__openedUrl,
    'https://microbetrace.cdc.gov/MicrobeTrace/assets/embed/receiver.html?partnerId=local-dev&nonce=nonce-test&openerOrigin=https%3A%2F%2Fpartner.example'
  );
});

test('SDK rejects mismatched target origins unless explicitly allowed', () => {
  const blockedContext = createSdkContext();

  assert.throws(() => {
    blockedContext.MicrobeTraceEmbed.open({
      target: 'https://example.org/MicrobeTrace/',
      partnerId: 'local-dev',
      files: [{ name: 'nodes.csv', contents: 'id\nA\n' }],
    });
  }, /target origin/);

  const allowedContext = createSdkContext();
  allowedContext.MicrobeTraceEmbed.open({
    target: 'https://example.org/MicrobeTrace/',
    allowedTargetOrigins: ['https://example.org'],
    partnerId: 'local-dev',
    files: [{ name: 'nodes.csv', contents: 'id\nA\n' }],
  });

  assert.equal(
    allowedContext.__openedUrl,
    'https://example.org/MicrobeTrace/assets/embed/receiver.html?partnerId=local-dev&nonce=nonce-test&openerOrigin=https%3A%2F%2Fpartner.example'
  );
});

test('SDK rejects target when script origin is unavailable unless explicitly allowed', () => {
  const documentWithoutScriptOrigin = {
    currentScript: null,
    getElementsByTagName: () => [],
    querySelectorAll: () => [],
  };
  const blockedContext = createSdkContext({ document: documentWithoutScriptOrigin });

  assert.throws(() => {
    blockedContext.MicrobeTraceEmbed.open({
      target: 'https://example.org/MicrobeTrace/',
      partnerId: 'local-dev',
      files: [{ name: 'nodes.csv', contents: 'id\nA\n' }],
    });
  }, /cannot verify the target origin/);

  const allowedContext = createSdkContext({ document: documentWithoutScriptOrigin });
  allowedContext.MicrobeTraceEmbed.open({
    target: 'https://example.org/MicrobeTrace/',
    allowedTargetOrigins: ['https://example.org'],
    partnerId: 'local-dev',
    files: [{ name: 'nodes.csv', contents: 'id\nA\n' }],
  });

  assert.equal(
    allowedContext.__openedUrl,
    'https://example.org/MicrobeTrace/assets/embed/receiver.html?partnerId=local-dev&nonce=nonce-test&openerOrigin=https%3A%2F%2Fpartner.example'
  );
});

test('receiver cleanup removes expired handoff records before storing a new handoff', async () => {
  const context = createReceiverContext();
  const now = Date.now();
  context.__store.set('handoff:expired', {
    version: 1,
    handoffId: 'expired',
    partnerId: 'local-dev',
    createdAt: now - 1000000,
    expiresAt: now - 1,
    files: [{ name: 'old.csv', contents: 'id\nA\n' }],
  });
  context.__store.set('unrelated', { expiresAt: now - 1 });

  await waitForReceiverReady(context);
  await sendReceiverTransfer(context);
  await settle();

  assert.equal(context.__store.has('handoff:expired'), false);
  assert.equal(context.__store.has('unrelated'), true);
  assert.equal(context.__store.has('handoff:handoff-test-id'), true);
});

test('receiver returns a non-sensitive handoff receipt', async () => {
  const context = createReceiverContext();

  await waitForReceiverReady(context);
  await sendReceiverTransfer(context);
  await settle();

  const storedMessage = context.__openerMessages.find((message) => message.message.status === 'stored');
  assert.ok(storedMessage);
  assert.equal(storedMessage.origin, 'http://localhost:4200');
  assert.equal(storedMessage.message.partnerId, 'local-dev');
  assert.equal(storedMessage.message.handoffId, 'handoff-test-id');
  assert.equal(typeof storedMessage.message.createdAt, 'number');
  assert.equal(typeof storedMessage.message.expiresAt, 'number');
  assert.deepEqual(JSON.parse(JSON.stringify(storedMessage.message.files)), [{ name: 'nodes.csv', bytes: 5, kind: 'node' }]);
  assert.equal(Object.prototype.hasOwnProperty.call(storedMessage.message.files[0], 'contents'), false);
});

test('receiver stores normalized launch options and includes them in the receipt', async () => {
  const context = createReceiverContext();

  await waitForReceiverReady(context);
  await sendReceiverTransfer(context, `
      launch: {
        datasetName: ' Partner Launch ',
        defaultView: 'Table',
        distanceMetric: 'TN93',
        linkThreshold: '0.02',
        ambiguityStrategy: 'resolve',
        ambiguityThreshold: '0.1',
        globalSettings: {
          nodeColorBy: 'id',
          linkColorBy: 'distance',
          nodeShapeBy: 'seq',
          nodeColor: '#123456',
          linkColor: '#654321',
          nodeShape: 'diamond',
          selectedColor: '#ff00aa',
          clusterMinimumSize: '3',
          backgroundColor: '#abcdef',
          tn93DistanceDisplayFormat: 'PERCENTAGE'
        }
      },
  `);
  await settle();

  const storedRecord = context.__store.get('handoff:handoff-test-id');
  const storedMessage = context.__openerMessages.find((message) => message.message.status === 'stored');
  const expectedLaunch = {
    datasetName: 'Partner Launch',
    defaultView: 'Table',
    distanceMetric: 'tn93',
    linkThreshold: 0.02,
    ambiguityStrategy: 'RESOLVE',
    ambiguityThreshold: 0.1,
    globalSettings: {
      nodeColorBy: 'id',
      linkColorBy: 'distance',
      nodeShapeBy: 'seq',
      nodeColor: '#123456',
      linkColor: '#654321',
      nodeShape: 'diamond',
      selectedColor: '#ff00aa',
      clusterMinimumSize: 3,
      backgroundColor: '#abcdef',
      tn93DistanceDisplayFormat: 'percentage',
    },
  };

  assert.deepEqual(JSON.parse(JSON.stringify(storedRecord.launch)), expectedLaunch);
  assert.deepEqual(JSON.parse(JSON.stringify(storedMessage.message.launch)), expectedLaunch);
});

test('receiver rejects invalid launch options before storage', async () => {
  const context = createReceiverContext();

  await waitForReceiverReady(context);
  await sendReceiverTransfer(context, `
      launch: {
        defaultView: 'Shell'
      },
  `);
  await settle();

  const errorMessage = context.__openerMessages.find((message) => message.message.type === 'MT_HANDOFF_ERROR');
  assert.equal(context.__store.has('handoff:handoff-test-id'), false);
  assert.match(errorMessage.message.message, /defaultView/);
});

test('receiver continues to reject full session payloads', async () => {
  const context = createReceiverContext();

  await waitForReceiverReady(context);
  await sendReceiverTransfer(context, `
      session: { files: [] },
  `);
  await settle();

  const errorMessage = context.__openerMessages.find((message) => message.message.type === 'MT_HANDOFF_ERROR');
  assert.equal(context.__store.has('handoff:handoff-test-id'), false);
  assert.match(errorMessage.message.message, /Full session imports/);
});

test('partner allowlist validator rejects shared origins', () => {
  const errors = validatePartnerAllowlist({
    version: 1,
    defaults: {
      maxFiles: 10,
      maxFileBytes: 100,
      maxTotalBytes: 1000,
      ttlMs: 900000,
    },
    partners: {
      first: { origins: ['https://example.org'] },
      second: { origins: ['https://example.org'] },
    },
  });

  assert.ok(errors.some((error) => error.includes('Use one partnerId per security boundary')));
});

function createSdkContext(overrides = {}) {
  const listeners = {};
  const context = {
    URL,
    Promise,
    Element: function Element() {},
    document: Object.prototype.hasOwnProperty.call(overrides, 'document')
      ? overrides.document
      : {
        currentScript: {
          src: 'https://microbetrace.cdc.gov/MicrobeTrace/assets/embed/microbetrace-embed.js',
        },
        getElementsByTagName: () => [],
        querySelectorAll: () => [],
      },
    location: {
      href: 'https://partner.example/app',
      origin: 'https://partner.example',
    },
    crypto: Object.prototype.hasOwnProperty.call(overrides, 'crypto')
      ? overrides.crypto
      : { randomUUID: () => 'nonce-test' },
    open(url) {
      context.__openedUrl = url;
      return context.__popup;
    },
    setTimeout: () => 1,
    clearTimeout: () => {},
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    removeEventListener(type) {
      delete listeners[type];
    },
    __popup: {
      postMessage() {},
    },
    __listeners: listeners,
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(sdkCode, context);
  return context;
}

function createReceiverContext() {
  const listeners = {};
  const store = new Map();
  const openerMessages = [];
  const opener = {
    closed: false,
    postMessage(message, origin) {
      openerMessages.push({ message, origin });
    },
  };
  let context;
  context = {
    URL,
    URLSearchParams,
    TextEncoder,
    console,
    document: {
      getElementById: () => ({ textContent: '' }),
    },
    location: {
      href: 'https://microbetrace.cdc.gov/MicrobeTrace/assets/embed/receiver.html?partnerId=local-dev&nonce=nonce-test',
      search: '?partnerId=local-dev&nonce=nonce-test',
      replace(url) {
        context.__replacedUrl = url;
      },
    },
    opener,
    top: null,
    self: null,
    crypto: {
      randomUUID: () => 'handoff-test-id',
    },
    localforage: {
      keys: async () => Array.from(store.keys()),
      getItem: async (key) => store.get(key) ?? null,
      setItem: async (key, value) => {
        store.set(key, value);
        return value;
      },
      removeItem: async (key) => {
        store.delete(key);
      },
    },
    fetch: async () => ({
      ok: true,
      json: async () => vm.runInContext(`({
        version: 1,
        defaults: {
          maxFiles: 10,
          maxFileBytes: 20971520,
          maxTotalBytes: 52428800,
          ttlMs: 900000
        },
        partners: {
          'local-dev': {
            origins: ['http://localhost:4200']
          }
        }
      })`, context),
    }),
    setTimeout: () => 1,
    clearTimeout: () => {},
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    __listeners: listeners,
    __store: store,
    __openerMessages: openerMessages,
  };
  context.window = context;
  context.top = context;
  context.self = context;
  vm.createContext(context);
  vm.runInContext(receiverCode, context);
  return context;
}

async function sendReceiverTransfer(context, extraPayloadFields = '') {
  vm.runInContext(`__listeners.message({
    source: opener,
    origin: 'http://localhost:4200',
    data: {
      type: 'MT_HANDOFF_TRANSFER',
      version: 1,
      partnerId: 'local-dev',
      nonce: 'nonce-test',
      ${extraPayloadFields}
      files: [
        {
          name: 'nodes.csv',
          kind: 'node',
          mimeType: 'text/csv',
          contents: 'id\\nA\\n'
        }
      ]
    }
  })`, context);
}

function settle() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function waitForReceiverReady(context) {
  for (let i = 0; i < 10; i += 1) {
    if (typeof context.__listeners.message === 'function') {
      return;
    }
    await settle();
  }

  throw new Error('Receiver did not install its message listener.');
}
