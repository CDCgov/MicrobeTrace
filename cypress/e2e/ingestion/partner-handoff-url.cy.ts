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

  it('preserves Auspice launch defaults through rendering', () => {
    const handoffId = 'cypress-auspice-launch-handoff';

    cy.fixture('nextstrain-yellow-fever-small.json').then((dataset) => {
      visitAndSeedHandoff(handoffId, {
        files: [{
          name: 'partner-auspice.json',
          kind: 'auspice',
          mimeType: 'application/json',
          contents: dataset,
        }],
        launchOverrides: {
          linkThreshold: 0.025,
          globalSettings: {
            nodeColorBy: '_id',
            nodeShapeBy: '_id',
          },
        },
      });
      cy.visit(`/#handoff=${handoffId}`);

      cy.window({ timeout: 120000 })
        .its('commonService.session.network.isFullyLoaded')
        .should('equal', true);

      assertHandoffLoadedAndUrlCleaned(handoffId, {
        fileName: 'partner-auspice.json',
        distanceMetric: 'tn93',
        linkThreshold: 0.025,
        nodeColorBy: '_id',
        nodeShapeBy: '_id',
        tn93DistanceDisplayFormat: 'percentage',
      });

      cy.window().its('commonService.session.data.links').should('have.length', 6);
      cy.window().its('commonService.activeTab').should('equal', 'Table');
      cy.get('[data-testid="partner-dataset-name"]')
        .should('be.visible')
        .and('contain.text', 'Cypress Partner Dataset');
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

  it('uses MAPLE distances while retaining Newick as tree-only data', () => {
    const handoffId = 'cypress-maple-network-source-handoff';

    visitAndSeedHandoff(handoffId, {
      files: [
        {
          name: 'syrup-tree.nwk',
          kind: 'newick',
          mimeType: 'text/plain',
          contents: '(A:0.1,B:0.1);',
        },
        {
          name: 'syrup-alignment.maple',
          kind: 'maple',
          mimeType: 'text/x-maple',
          contents: '>REF\nAAAA\n>A\n>B\nT\t1\n',
        },
      ],
      launchOverrides: {
        defaultView: '2D Network',
        networkDistanceSource: 'sequences',
        distanceMetric: 'snps',
        linkThreshold: 16,
        globalSettings: {
          nodeColorBy: 'None',
          linkColorBy: 'None',
          nodeShapeBy: 'None',
        },
      },
    });
    cy.visit(`/#handoff=${handoffId}`);

    cy.window({ timeout: 120000 }).should((win) => {
      const session = (win as any).commonService.session;
      const handoffError = win.document.querySelector('.alert-danger')?.textContent?.trim();
      const files = session.files?.map((file) => file.name).join(', ') || 'none';
      expect(
        session.meta?.partnerEmbed?.networkDistanceSource,
        `handoff error: ${handoffError || 'none'}; files: ${files}`
      ).to.equal('sequences');
    });
    cy.window({ timeout: 120000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('equal', true);

    cy.window().should((win) => {
      const session = (win as any).commonService.session;
      expect(session.meta.partnerEmbed.networkDistanceSource).to.equal('sequences');
      expect(session.data.newickString).to.contain('(A:0.1,B:0.1)');
      expect(session.data.links).to.have.length(1);
      expect(session.data.links[0].origin).to.deep.equal(['Genetic Distance']);
      expect(session.data.links[0].distanceOrigin).to.equal('Genetic Distance');
    });
  });

  it('uses thresholded molten links without recomputing MAPLE or Newick distances', () => {
    const handoffId = 'cypress-molten-network-source-handoff';

    visitAndSeedHandoff(handoffId, {
      files: [
        {
          name: 'syrup-tree.nwk',
          kind: 'newick',
          mimeType: 'text/plain',
          contents: '(A:0.1,B:0.1,C:0.2);',
        },
        {
          name: 'thresholded-molten.tsv',
          kind: 'link',
          mimeType: 'text/tab-separated-values',
          contents: 'sequence_1\tsequence_2\tdistance\nA\tA\t0\nA\tB\t1\nB\tA\t1\n',
          options: {
            extension: 'tsv',
            field1: 'sequence_1',
            field2: 'sequence_2',
            field3: 'distance',
          },
        },
        {
          name: 'syrup-alignment.maple',
          kind: 'maple',
          mimeType: 'text/x-maple',
          contents: '>REF\nAAAA\n>A\n>B\nT\t1\n>C\nG\t2\n',
        },
      ],
      launchOverrides: {
        defaultView: '2D Network',
        networkDistanceSource: 'links',
        distanceMetric: 'snps',
        linkThreshold: 1,
        globalSettings: {
          nodeColorBy: 'None',
          linkColorBy: 'None',
          nodeShapeBy: 'None',
        },
      },
    });
    cy.visit(`/#handoff=${handoffId}`);

    cy.window({ timeout: 120000 })
      .its('commonService.session.meta.partnerEmbed.networkDistanceSource')
      .should('equal', 'links');
    cy.window({ timeout: 120000 })
      .its('commonService.session.network.isFullyLoaded')
      .should('equal', true);

    cy.window().should((win) => {
      const session = (win as any).commonService.session;
      expect(session.meta.partnerEmbed.networkDistanceSource).to.equal('links');
      expect(session.data.newickString).to.contain('(A:0.1,B:0.1,C:0.2)');
      expect(session.data.links).to.have.length(1);
      expect(session.data.links[0].origin).to.deep.equal(['thresholded-molten.tsv']);
      expect(session.data.links[0].distance).to.equal(1);
    });
  });
});

type HandoffSeedOptions = {
  files?: Array<Record<string, unknown>>;
  launchOverrides?: Record<string, unknown>;
};

type ExpectedLaunchState = {
  distanceMetric: 'snps' | 'tn93';
  fileName?: string;
  linkThreshold: number;
  nodeColorBy?: string;
  nodeShapeBy?: string;
  tn93DistanceDisplayFormat?: 'decimal' | 'percentage';
};

function visitAndSeedHandoff(handoffId: string, options: HandoffSeedOptions = {}): void {
  cy.visit('/?skipDemoSession=1');
  cy.window().then((win) => seedHandoff(win, handoffId, options));
}

function assertHandoffLoadedAndUrlCleaned(handoffId: string, expected: ExpectedLaunchState): void {
  cy.window({ timeout: 30000 }).should((win) => {
    const commonService = (win as any).commonService;

    expect(commonService?.session?.files?.map((file) => file.name)).to.include(expected.fileName ?? 'nodes.csv');
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
    expect(widgets?.['node-color-variable']).to.equal(expected.nodeColorBy ?? 'group');
    expect(widgets?.['link-color-variable']).to.equal('distance');
    expect(widgets?.['node-symbol-variable']).to.equal(expected.nodeShapeBy ?? 'seq');
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
    files: options.files ?? [
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
