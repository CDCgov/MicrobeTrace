const HANDOFF_PREFIX = 'handoff:';
const HANDOFF_TTL_MS = 15 * 60 * 1000;

describe('partner handoff URL handling', () => {
  it('loads and clears fragment handoff URLs', () => {
    const handoffId = 'cypress-fragment-handoff';

    visitAndSeedHandoff(handoffId);
    cy.visit(`/#handoff=${handoffId}`);

    assertHandoffLoadedAndUrlCleaned(handoffId);
  });

  it('keeps legacy query handoff URLs compatible', () => {
    const handoffId = 'cypress-query-handoff';

    visitAndSeedHandoff(handoffId);
    cy.visit(`/?handoff=${handoffId}&skipDemoSession=1`);

    assertHandoffLoadedAndUrlCleaned(handoffId);
  });
});

function visitAndSeedHandoff(handoffId: string): void {
  cy.visit('/?skipDemoSession=1');
  cy.window().then((win) => seedHandoff(win, handoffId));
}

function assertHandoffLoadedAndUrlCleaned(handoffId: string): void {
  cy.window({ timeout: 30000 }).should((win) => {
    const commonService = (win as any).commonService;

    expect(commonService?.session?.files?.map((file) => file.name)).to.include('nodes.csv');
  });

  cy.location('href').should('not.contain', `handoff=${handoffId}`);
  cy.window().then((win) => getIndexedDbValue(win, `${HANDOFF_PREFIX}${handoffId}`))
    .should('not.exist');
}

function seedHandoff(win: Cypress.AUTWindow, handoffId: string): Cypress.Chainable<void> {
  const createdAt = Date.now();
  const record = {
    version: 1,
    partnerId: 'local-dev',
    handoffId,
    createdAt,
    expiresAt: createdAt + HANDOFF_TTL_MS,
    files: [
      {
        name: 'nodes.csv',
        kind: 'node',
        mimeType: 'text/csv',
        contents: 'id,seq\nA,ACTG\n',
      },
    ],
  };

  return cy.wrap(indexedDbPut(win, `${HANDOFF_PREFIX}${handoffId}`, record), { log: false });
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
