(function (global) {
  'use strict';

  var READY_TYPE = 'MT_HANDOFF_READY';
  var TRANSFER_TYPE = 'MT_HANDOFF_TRANSFER';
  var ERROR_TYPE = 'MT_HANDOFF_ERROR';
  var DEFAULT_TIMEOUT_MS = 15000;

  function normalizeTarget(target) {
    if (typeof target !== 'string' || !target.trim()) {
      throw new Error('MicrobeTraceEmbed.open requires a target URL.');
    }
    var url = new URL(target, global.location && global.location.href ? global.location.href : undefined);
    if (!url.pathname.endsWith('/')) {
      url.pathname = url.pathname + '/';
    }
    return url;
  }

  function buildReceiverUrl(targetUrl, partnerId, nonce) {
    var receiverUrl = new URL('assets/embed/receiver.html', targetUrl);
    receiverUrl.searchParams.set('partnerId', partnerId);
    receiverUrl.searchParams.set('nonce', nonce);
    return receiverUrl;
  }

  function buildNonce() {
    if (global.crypto && global.crypto.randomUUID) {
      return global.crypto.randomUUID();
    }
    return 'nonce-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function resolveElements(selectorOrElement) {
    if (typeof selectorOrElement === 'string') {
      return Array.prototype.slice.call(document.querySelectorAll(selectorOrElement));
    }
    if (selectorOrElement instanceof Element) {
      return [selectorOrElement];
    }
    if (selectorOrElement && typeof selectorOrElement.length === 'number') {
      return Array.prototype.slice.call(selectorOrElement);
    }
    return [];
  }

  function normalizeOptions(options) {
    if (!options || typeof options !== 'object') {
      throw new Error('MicrobeTraceEmbed.open requires an options object.');
    }
    if (typeof options.partnerId !== 'string' || !options.partnerId.trim()) {
      throw new Error('MicrobeTraceEmbed.open requires a partnerId.');
    }
    if (!Array.isArray(options.files) || !options.files.length) {
      throw new Error('MicrobeTraceEmbed.open requires at least one file.');
    }
    return options;
  }

  function open(options) {
    var normalizedOptions = normalizeOptions(options);
    var targetUrl = normalizeTarget(normalizedOptions.target);
    var nonce = buildNonce();
    var receiverUrl = buildReceiverUrl(targetUrl, normalizedOptions.partnerId, nonce);
    var receiverOrigin = receiverUrl.origin;
    var popup = global.open(receiverUrl.toString(), '_blank', 'popup=yes,width=960,height=720');

    if (!popup) {
      return Promise.reject(new Error('The partner handoff window was blocked by the browser.'));
    }

    return new Promise(function (resolve, reject) {
      var settled = false;
      var timeoutId = global.setTimeout(function () {
        cleanup();
        reject(new Error('Timed out waiting for the partner handoff receiver.'));
      }, DEFAULT_TIMEOUT_MS);

      function cleanup() {
        if (settled) {
          return;
        }
        settled = true;
        global.clearTimeout(timeoutId);
        global.removeEventListener('message', handleMessage);
      }

      function handleMessage(event) {
        if (event.source !== popup || event.origin !== receiverOrigin || !event.data || event.data.partnerId !== normalizedOptions.partnerId || event.data.nonce !== nonce) {
          return;
        }

        if (event.data.type === READY_TYPE) {
          popup.postMessage({
            type: TRANSFER_TYPE,
            version: 1,
            partnerId: normalizedOptions.partnerId,
            nonce: nonce,
            metadata: normalizedOptions.metadata,
            files: normalizedOptions.files
          }, receiverOrigin);
          return;
        }

        if (event.data.type === TRANSFER_TYPE && event.data.status === 'stored') {
          cleanup();
          resolve({
            handoffId: event.data.handoffId,
            receiverUrl: receiverUrl.toString()
          });
          return;
        }

        if (event.data.type === ERROR_TYPE) {
          cleanup();
          reject(new Error(event.data.message || 'The partner handoff failed.'));
        }
      }

      global.addEventListener('message', handleMessage);
    });
  }

  function attachButton(selectorOrElement, options) {
    var elements = resolveElements(selectorOrElement);

    if (!elements.length) {
      throw new Error('MicrobeTraceEmbed.attachButton did not match any elements.');
    }

    var clickHandler = function (event) {
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }

      open(options).then(function (result) {
        if (typeof options.onSuccess === 'function') {
          options.onSuccess(result);
        }
      }).catch(function (error) {
        if (typeof options.onError === 'function') {
          options.onError(error);
        } else {
          throw error;
        }
      });
    };

    elements.forEach(function (element) {
      element.addEventListener('click', clickHandler);
    });

    return function detach() {
      elements.forEach(function (element) {
        element.removeEventListener('click', clickHandler);
      });
    };
  }

  global.MicrobeTraceEmbed = {
    version: '1.0.0',
    open: open,
    attachButton: attachButton
  };
})(window);
