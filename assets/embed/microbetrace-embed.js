(function (global) {
  'use strict';

  var READY_TYPE = 'MT_HANDOFF_READY';
  var TRANSFER_TYPE = 'MT_HANDOFF_TRANSFER';
  var ERROR_TYPE = 'MT_HANDOFF_ERROR';
  var DEFAULT_TIMEOUT_MS = 15000;
  var UNSUPPORTED_WEB_CRYPTO_MESSAGE = 'MicrobeTraceEmbed requires a modern browser with Web Crypto support.';

  function getSdkScriptUrl() {
    if (document.currentScript && document.currentScript.src) {
      return new URL(document.currentScript.src, global.location && global.location.href ? global.location.href : undefined);
    }

    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i -= 1) {
      if (scripts[i].src && /(?:^|\/)microbetrace-embed\.js(?:\?|$)/.test(scripts[i].src)) {
        return new URL(scripts[i].src, global.location && global.location.href ? global.location.href : undefined);
      }
    }

    return null;
  }

  function inferTargetFromScript() {
    var scriptUrl = getSdkScriptUrl();
    return scriptUrl ? new URL('../../', scriptUrl) : null;
  }

  function normalizeAllowedTargetOrigins(options) {
    var origins = [];
    var configuredOrigins = Array.isArray(options.allowedTargetOrigins) ? options.allowedTargetOrigins : [];

    configuredOrigins.forEach(function (origin) {
      if (typeof origin !== 'string' || !origin.trim() || origin.trim() === '*') {
        throw new Error('MicrobeTraceEmbed.open received an invalid allowedTargetOrigins entry.');
      }

      var parsed = new URL(origin);
      if (parsed.origin !== origin.trim()) {
        throw new Error('MicrobeTraceEmbed.open allowedTargetOrigins entries must be exact origins.');
      }
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new Error('MicrobeTraceEmbed.open allowedTargetOrigins entries must use http or https.');
      }

      origins.push(parsed.origin);
    });

    return origins;
  }

  function normalizeTarget(options) {
    var sdkTargetUrl = inferTargetFromScript();
    var sdkOrigin = sdkTargetUrl ? sdkTargetUrl.origin : null;
    var target = typeof options.target === 'string' ? options.target.trim() : '';
    var url;

    if (target) {
      if (target === '*') {
        throw new Error('MicrobeTraceEmbed.open requires an exact target URL.');
      }
      url = new URL(target, global.location && global.location.href ? global.location.href : undefined);
    } else if (sdkTargetUrl) {
      url = sdkTargetUrl;
    } else {
      throw new Error('MicrobeTraceEmbed.open requires a target URL when the SDK script origin cannot be inferred.');
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('MicrobeTraceEmbed.open target must use http or https.');
    }
    if (url.username || url.password) {
      throw new Error('MicrobeTraceEmbed.open target may not include credentials.');
    }

    var allowedTargetOrigins = normalizeAllowedTargetOrigins(options);
    if (!sdkOrigin && !allowedTargetOrigins.includes(url.origin)) {
      throw new Error('MicrobeTraceEmbed.open cannot verify the target origin because the SDK script origin could not be inferred.');
    }
    if (sdkOrigin && url.origin !== sdkOrigin && !allowedTargetOrigins.includes(url.origin)) {
      throw new Error('MicrobeTraceEmbed.open target origin must match the SDK origin unless allowedTargetOrigins includes it.');
    }

    if (!url.pathname.endsWith('/')) {
      url.pathname = url.pathname + '/';
    }
    return url;
  }

  function resolveOpenerOrigin() {
    if (global.location && global.location.origin) {
      return global.location.origin;
    }
    if (global.location && global.location.protocol && global.location.host) {
      return global.location.protocol + '//' + global.location.host;
    }
    throw new Error('MicrobeTraceEmbed.open requires a browser origin.');
  }

  function buildReceiverUrl(targetUrl, partnerId, nonce, openerOrigin) {
    var receiverUrl = new URL('assets/embed/receiver.html', targetUrl);
    receiverUrl.searchParams.set('partnerId', partnerId);
    receiverUrl.searchParams.set('nonce', nonce);
    receiverUrl.searchParams.set('openerOrigin', openerOrigin);
    return receiverUrl;
  }

  function buildNonce() {
    if (global.crypto && global.crypto.randomUUID) {
      return global.crypto.randomUUID();
    }
    if (global.crypto && global.crypto.getRandomValues) {
      var bytes = new Uint8Array(16);
      global.crypto.getRandomValues(bytes);
      return Array.prototype.map.call(bytes, function (byte) {
        return byte.toString(16).padStart(2, '0');
      }).join('');
    }
    throw new Error(UNSUPPORTED_WEB_CRYPTO_MESSAGE);
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
    var targetUrl = normalizeTarget(normalizedOptions);
    var nonce = buildNonce();
    var openerOrigin = resolveOpenerOrigin();
    var receiverUrl = buildReceiverUrl(targetUrl, normalizedOptions.partnerId, nonce, openerOrigin);
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
            partnerId: event.data.partnerId,
            handoffId: event.data.handoffId,
            createdAt: event.data.createdAt,
            expiresAt: event.data.expiresAt,
            receiverUrl: receiverUrl.toString(),
            launch: event.data.launch,
            files: Array.isArray(event.data.files) ? event.data.files : []
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
