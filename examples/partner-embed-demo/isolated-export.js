(function () {
  'use strict';

  var DB_NAME = 'microbetrace-partner-export';
  var DB_VERSION = 1;
  var STORE_NAME = 'handoffs';
  var TTL_MS = 5 * 60 * 1000;
  var button = document.getElementById('stage-export');
  var status = document.getElementById('status');
  var isolationState = document.getElementById('isolation-state');

  isolationState.textContent = String(window.crossOriginIsolated);
  isolationState.dataset.ready = String(window.crossOriginIsolated);

  function openDatabase() {
    return new Promise(function (resolve, reject) {
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        var database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('Unable to open the export database.')); };
    });
  }

  function storeRecord(record) {
    return openDatabase().then(function (database) {
      return new Promise(function (resolve, reject) {
        var transaction = database.transaction(STORE_NAME, 'readwrite');
        var store = transaction.objectStore(STORE_NAME);
        var cursorRequest = store.openCursor();

        cursorRequest.onsuccess = function () {
          var cursor = cursorRequest.result;
          if (!cursor) {
            store.put(record);
            return;
          }
          if (!cursor.value || Number(cursor.value.expiresAt) <= Date.now()) {
            cursor.delete();
          }
          cursor.continue();
        };
        transaction.oncomplete = function () {
          database.close();
          resolve();
        };
        transaction.onerror = function () {
          database.close();
          reject(transaction.error || new Error('Unable to stage the export.'));
        };
      });
    });
  }

  function buildOptions() {
    return {
      partnerId: 'local-dev',
      files: [{
        name: 'bridge-tree.nwk',
        kind: 'newick',
        mimeType: 'text/plain',
        contents: '(sample-a:0.0,(sample-b:0.1,sample-c:0.1):0.1);'
      }],
      metadata: {
        datasetName: 'Isolated bridge demo',
        sourceApp: 'Local cross-origin-isolated partner demo'
      },
      launch: {
        datasetName: 'Isolated bridge demo',
        defaultView: 'Phylogenetic Tree'
      }
    };
  }

  button.addEventListener('click', function () {
    var bridgeWindow = window.open('about:blank', '_blank');
    if (!bridgeWindow) {
      status.textContent = 'The export bridge tab or window was blocked.';
      return;
    }

    button.disabled = true;
    status.textContent = 'Staging a short-lived export in IndexedDB…';
    var id = crypto.randomUUID();
    status.dataset.handoffId = id;
    var now = Date.now();
    var record = {
      id: id,
      version: 1,
      createdAt: now,
      expiresAt: now + TTL_MS,
      options: buildOptions()
    };

    storeRecord(record).then(function () {
      bridgeWindow.location.replace('/microbetrace-export.html#handoff=' + encodeURIComponent(id));
      status.textContent = 'Export staged. Continue in the non-isolated bridge window.';
    }).catch(function (error) {
      bridgeWindow.close();
      status.textContent = error && error.message ? error.message : String(error);
    }).finally(function () {
      button.disabled = false;
    });
  });
}());
