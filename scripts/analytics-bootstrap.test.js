const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

const bootstrapSource = readFileSync('src/assets/analytics-bootstrap.js', 'utf8');

function runBootstrap({
  hostname,
  search = '',
  hash = '',
  pathname = '/MicrobeTrace/',
  protocol = 'https:',
  referrer = '',
  enableLocalTesting = false,
}) {
  const source = bootstrapSource.replace(
    /const analyticsDisabledForLocalHost = (?:true|false);/,
    `const analyticsDisabledForLocalHost = ${enableLocalTesting ? 'false' : 'true'};`,
  );
  const appendedScripts = [];
  const origin = hostname ? `${protocol}//${hostname}` : 'file://';
  const href = `${origin}${pathname}${search}${hash}`;
  const scriptUrl = `${origin}${pathname.replace(/\/?$/, '/')}assets/analytics-bootstrap.js`;
  const window = {
    location: { hash, hostname, href, origin, pathname, protocol, search },
  };
  const document = {
    baseURI: `${origin}${pathname}`,
    currentScript: { src: scriptUrl },
    referrer,
    createElement() {
      return {};
    },
    head: {
      appendChild(script) {
        appendedScripts.push(script);
      },
    },
  };

  vm.runInNewContext(source, {
    Date,
    document,
    Set,
    URL,
    URLSearchParams,
    window,
  });

  return {
    appendedScripts,
    calls: (window.dataLayer || []).map((entry) => JSON.parse(JSON.stringify(Array.from(entry)))),
    window,
  };
}

test('routes the official deployment to the production property', () => {
  const result = runBootstrap({ hostname: 'microbetrace.cdc.gov' });

  assert.equal(result.window.microbeTraceAnalyticsDisabled, false);
  assert.equal(
    result.appendedScripts[0]?.src,
    'https://www.googletagmanager.com/gtag/js?id=G-0MWHB1NG2M',
  );
  assert.deepEqual(result.calls[1], [
    'config',
    'G-0MWHB1NG2M',
    {
      send_page_view: false,
      page_location: 'https://microbetrace.cdc.gov/MicrobeTrace',
    },
  ]);
});

test('routes an open-source partner deployment to the production property', () => {
  const result = runBootstrap({ hostname: 'microbetrace.partner.example' });

  assert.equal(result.window.microbeTraceAnalyticsDisabled, false);
  assert.equal(
    result.appendedScripts[0]?.src,
    'https://www.googletagmanager.com/gtag/js?id=G-0MWHB1NG2M',
  );
  assert.equal(result.calls[1]?.[1], 'G-0MWHB1NG2M');
});

test('keeps local analytics disabled by default', () => {
  for (const hostname of ['localhost', 'app.localhost', '127.0.0.1', '127.4.3.2', '::1', '[::1]', '']) {
    const result = runBootstrap({ hostname });

    assert.equal(result.window.microbeTraceAnalyticsDisabled, true, hostname || 'file URL');
    assert.equal(result.appendedScripts.length, 0, hostname || 'file URL');
    assert.equal(result.window.dataLayer, undefined, hostname || 'file URL');
  }
});

test('routes an explicitly enabled local test only to the test property', () => {
  const result = runBootstrap({
    hostname: 'localhost',
    enableLocalTesting: true,
  });

  assert.equal(result.window.microbeTraceAnalyticsDisabled, false);
  assert.equal(
    result.appendedScripts[0]?.src,
    'https://www.googletagmanager.com/gtag/js?id=G-J7STWPNKC0',
  );
  assert.deepEqual(result.calls[1], [
    'config',
    'G-J7STWPNKC0',
    {
      send_page_view: false,
      page_location: 'https://localhost/MicrobeTrace',
    },
  ]);
});

test('tracks the GitHub Pages deployment with a sanitized base URL', () => {
  const result = runBootstrap({
    hostname: 'cdcgov.github.io',
    search: '?url=https%3A%2F%2Fsensitive.example%2Fdata.json&partnerId=private',
    hash: '#/?handoff=private',
    referrer: 'https://partner.example/launch?dataset=private',
  });

  assert.equal(result.window.microbeTraceAnalyticsDisabled, false);
  assert.deepEqual(result.calls[1], [
    'config',
    'G-0MWHB1NG2M',
    {
      send_page_view: false,
      page_location: 'https://cdcgov.github.io/MicrobeTrace',
      page_referrer: 'https://partner.example',
    },
  ]);
  assert.doesNotMatch(JSON.stringify(result.calls), /sensitive|dataset|partnerId|handoff|private/);
});

test('tracks handoff flows without forwarding their query or hash values', () => {
  const handoff = runBootstrap({
    hostname: 'microbetrace.partner.example',
    search: '?handoff=session-secret&url=https%3A%2F%2Fsensitive.example',
    hash: '#/?partnerId=private',
  });

  assert.equal(handoff.window.microbeTraceAnalyticsDisabled, false);
  assert.equal(handoff.appendedScripts.length, 1);
  assert.equal(handoff.calls[1]?.[2]?.page_location, 'https://microbetrace.partner.example/MicrobeTrace');
  assert.doesNotMatch(JSON.stringify(handoff.calls), /session-secret|sensitive|partnerId|private/);
});
