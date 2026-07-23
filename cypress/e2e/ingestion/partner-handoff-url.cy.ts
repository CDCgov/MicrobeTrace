const HANDOFF_PREFIX = 'handoff:';
const HANDOFF_TTL_MS = 15 * 60 * 1000;

describe('partner handoff URL handling', () => {
  it('loads and clears fragment handoff URLs', () => {
    const handoffId = 'cypress-fragment-handoff';

    visitAndSeedHandoff(handoffId);
    cy.visit(`/#handoff=${handoffId}`);

    assertHandoffLoadedAndUrlCleaned(handoffId, {
      distanceMetric: 'tn93',
      linkThreshold: 0.02,
      tn93DistanceDisplayFormat: 'percentage',
    });
  });

  it('keeps legacy query handoff URLs compatible', () => {
    const handoffId = 'cypress-query-handoff';

    visitAndSeedHandoff(handoffId);
    cy.visit(`/?handoff=${handoffId}&skipDemoSession=1`);

    assertHandoffLoadedAndUrlCleaned(handoffId, {
      distanceMetric: 'tn93',
      linkThreshold: 0.02,
      tn93DistanceDisplayFormat: 'percentage',
    });
  });

  it('uses the metric default threshold only when no custom launch threshold is supplied', () => {
    const handoffId = 'cypress-metric-default-threshold-handoff';

    visitAndSeedHandoff(handoffId, {
      launchOverrides: {
        distanceMetric: 'snps',
        linkThreshold: undefined,
        globalSettings: {
          tn93DistanceDisplayFormat: undefined,
        },
      },
    });
    cy.visit(`/#handoff=${handoffId}`);

    assertHandoffLoadedAndUrlCleaned(handoffId, {
      distanceMetric: 'snps',
      linkThreshold: 16,
      tn93DistanceDisplayFormat: undefined,
    });
  });
});

type HandoffSeedOptions = {
  launchOverrides?: Record<string, unknown>;
};

type ExpectedLaunchState = {
  distanceMetric: 'snps' | 'tn93';
  linkThreshold: number;
  tn93DistanceDisplayFormat?: 'decimal' | 'percentage';
};

function visitAndSeedHandoff(handoffId: string, options: HandoffSeedOptions = {}): void {
  cy.visit('/?skipDemoSession=1');
  cy.window().then((win) => seedHandoff(win, handoffId, options));
}

function assertHandoffLoadedAndUrlCleaned(handoffId: string, expected: ExpectedLaunchState): void {
  cy.window({ timeout: 30000 }).should((win) => {
    const commonService = (win as any).commonService;

    expect(commonService?.session?.files?.map((file) => file.name)).to.include('nodes.csv');
  });

  cy.window({ timeout: 30000 }).should((win) => {
    const widgets = (win as any).commonService?.session?.style?.widgets;
    const meta = (win as any).commonService?.session?.meta;

    expect(meta?.partnerEmbed?.datasetName).to.equal('Cypress Partner Dataset');
    expect(widgets?.['default-view']).to.equal('Table');
    expect(widgets?.['default-distance-metric']).to.equal(expected.distanceMetric);
    expect(widgets?.['link-threshold']).to.equal(expected.linkThreshold);
    expect(widgets?.['ambiguity-resolution-strategy']).to.equal('RESOLVE');
    expect(widgets?.['ambiguity-threshold']).to.equal(0.1);
    expect(widgets?.['node-color-variable']).to.equal('group');
    expect(widgets?.['link-color-variable']).to.equal('distance');
    expect(widgets?.['node-symbol-variable']).to.equal('seq');
    expect(widgets?.['node-color']).to.equal('#123456');
    expect(widgets?.['link-color']).to.equal('#654321');
    expect(widgets?.['node-symbol']).to.equal('diamond');
    expect(widgets?.['selected-color']).to.equal('#ff00aa');
    expect(widgets?.['cluster-minimum-size']).to.equal(3);
    expect(widgets?.['background-color']).to.equal('#abcdef');
    if (expected.tn93DistanceDisplayFormat) {
      expect(widgets?.['tn93-distance-display-format']).to.equal(expected.tn93DistanceDisplayFormat);
    }
  });

  cy.location('href').should('not.contain', `handoff=${handoffId}`);
  cy.window().then((win) => getIndexedDbValue(win, `${HANDOFF_PREFIX}${handoffId}`))
    .should('not.exist');
}

function seedHandoff(win: Cypress.AUTWindow, handoffId: string, options: HandoffSeedOptions = {}): Cypress.Chainable<void> {
  const createdAt = Date.now();
  const launch = mergeLaunchOptions({
    datasetName: 'Cypress Partner Dataset',
    defaultView: 'Table',
    distanceMetric: 'tn93',
    linkThreshold: 0.02,
    ambiguityStrategy: 'RESOLVE',
    ambiguityThreshold: 0.1,
    globalSettings: {
      nodeColorBy: 'group',
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
  }, options.launchOverrides || {});
  const record = {
    version: 1,
    partnerId: 'local-dev',
    handoffId,
    createdAt,
    expiresAt: createdAt + HANDOFF_TTL_MS,
    metadata: {
      datasetName: 'Legacy Cypress Dataset',
    },
    launch,
    files: [
      {
        name: 'nodes.csv',
        kind: 'node',
        mimeType: 'text/csv',
        contents: 'id,seq,group\nA,ACTG,alpha\nB,ACTA,beta\n',
      },
      {
        name: 'links.csv',
        kind: 'link',
        mimeType: 'text/csv',
        contents: 'source,target,distance\nA,B,0.02\n',
      },
    ],
  };

  return cy.wrap(indexedDbPut(win, `${HANDOFF_PREFIX}${handoffId}`, record), { log: false });
}

function mergeLaunchOptions(base: Record<string, unknown>, overrides: Record<string, unknown>): Record<string, unknown> {
  const merged = {
    ...base,
    ...overrides,
    globalSettings: {
      ...((base.globalSettings as Record<string, unknown>) || {}),
      ...((overrides.globalSettings as Record<string, unknown>) || {}),
    },
  };

  removeUndefinedProperties(merged);
  removeUndefinedProperties(merged.globalSettings as Record<string, unknown>);

  return merged;
}

function removeUndefinedProperties(value: Record<string, unknown>): void {
  Object.keys(value).forEach((key) => {
    if (typeof value[key] === 'undefined') {
      delete value[key];
    }
  });
}

function getIndexedDbValue(win: Cypress.AUTWindow, key: string): Cypress.Chainable<unknown> {
  return cy.wrap(indexedDbGet(win, key), { log: false });
}

function indexedDbPut(win: Cypress.AUTWindow, key: string, value: unknown): Promise<void> {
  return withLocalForageStore(win, 'readwrite', (store) => {
    store.put(value, key);
  });
}

function indexedDbGet(win: Cypress.AUTWindow, key: string): Promise<unknown> {
  return withLocalForageStore(win, 'readonly', (store) => store.get(key));
}

function withLocalForageStore<T>(
  win: Cypress.AUTWindow,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | void> {
  return openLocalForageDb(win).then((db) => new Cypress.Promise((resolve, reject) => {
    const transaction = db.transaction('keyvaluepairs', mode);
    const store = transaction.objectStore('keyvaluepairs');
    const request = work(store);

    transaction.oncomplete = () => {
      db.close();
      resolve(request && 'result' in request ? request.result : undefined);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  }));
}

function openLocalForageDb(win: Cypress.AUTWindow): Promise<IDBDatabase> {
  return new Cypress.Promise((resolve, reject) => {
    const openRequest = win.indexedDB.open('localforage');

    openRequest.onupgradeneeded = () => {
      const db = openRequest.result;
      if (!db.objectStoreNames.contains('keyvaluepairs')) {
        db.createObjectStore('keyvaluepairs');
      }
    };
    openRequest.onerror = () => reject(openRequest.error);
    openRequest.onsuccess = () => {
      const db = openRequest.result;

      if (db.objectStoreNames.contains('keyvaluepairs')) {
        resolve(db);
        return;
      }

      const nextVersion = db.version + 1;
      db.close();

      const upgradeRequest = win.indexedDB.open('localforage', nextVersion);
      upgradeRequest.onupgradeneeded = () => {
        const upgradedDb = upgradeRequest.result;
        if (!upgradedDb.objectStoreNames.contains('keyvaluepairs')) {
          upgradedDb.createObjectStore('keyvaluepairs');
        }
      };
      upgradeRequest.onerror = () => reject(upgradeRequest.error);
      upgradeRequest.onsuccess = () => resolve(upgradeRequest.result);
    };
  });
}
