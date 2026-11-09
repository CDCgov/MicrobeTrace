(function () {
  'use strict';

  var DB_NAME = 'microbetrace-partner-export';
  var DB_VERSION = 1;
  var STORE_NAME = 'handoffs';
  var button = document.getElementById('continue');
  var summary = document.getElementById('summary');
  var status = document.getElementById('status');
  var isolationState = document.getElementById('isolation-state');
  var record;

  isolationState.textContent = String(window.crossOriginIsolated);

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

  function withRecord(id, mode, action) {
    return openDatabase().then(function (database) {
      return new Promise(function (resolve, reject) {
        var transaction = database.transaction(STORE_NAME, mode);
        var request = action(transaction.objectStore(STORE_NAME));
        request.onsuccess = function () { resolve(request.result); };
        request.onerror = function () { reject(request.error || new Error('Unable to access the staged export.')); };
        transaction.oncomplete = function () { database.close(); };
        transaction.onerror = function () {
          database.close();
          reject(transaction.error || new Error('Unable to access the staged export.'));
        };
      });
    });
  }

  function deleteRecord(id) {
    return withRecord(id, 'readwrite', function (store) { return store.delete(id); });
  }

  function validateRecord(value, id) {
    if (!value || value.id !== id || value.version !== 1 || !value.options || !Array.isArray(value.options.files)) {
      throw new Error('The staged export is missing or malformed.');
    }
    if (!Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now()) {
      throw new Error('The staged export has expired. Return to the analysis page and try again.');
    }
    return value;
  }

  var handoffId = new URLSearchParams(window.location.hash.slice(1)).get('handoff');
  if (!handoffId || !/^[a-z0-9-]{16,128}$/i.test(handoffId)) {
    summary.textContent = 'The bridge URL did not contain a valid handoff identifier.';
  } else {
    withRecord(handoffId, 'readonly', function (store) { return store.get(handoffId); })
      .then(function (value) {
        record = validateRecord(value, handoffId);
        var names = record.options.files.map(function (file) { return file.name; });
        summary.textContent = 'Ready to send ' + names.join(', ') + '.';
        if (!window.MicrobeTraceEmbed) {
          throw new Error('The MicrobeTrace SDK did not load. Start MicrobeTrace on localhost:4200.');
        }
        button.disabled = false;
      })
      .catch(function (error) {
        status.textContent = error && error.message ? error.message : String(error);
        deleteRecord(handoffId).catch(function () {});
      });
  }

  button.addEventListener('click', function () {
    if (!record || !window.MicrobeTraceEmbed) return;

    button.disabled = true;
    status.textContent = 'Opening MicrobeTrace…';
    var openPromise = window.MicrobeTraceEmbed.open(record.options);
    deleteRecord(record.id).catch(function () {});

    openPromise.then(function (result) {
      status.textContent = 'MicrobeTrace accepted handoff ' + result.handoffId + '.';
    }).catch(function (error) {
      status.textContent = error && error.message ? error.message : String(error);
      button.disabled = false;
    });
  });
}());
