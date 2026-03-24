(function () {
  'use strict';

  var ALLOWED_KINDS = new Set(['node', 'link', 'matrix', 'fasta', 'newick', 'auspice']);
  var FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  var READY_TYPE = 'MT_HANDOFF_READY';
  var TRANSFER_TYPE = 'MT_HANDOFF_TRANSFER';
  var ERROR_TYPE = 'MT_HANDOFF_ERROR';
  var statusNode = document.getElementById('status');
  var detailsNode = document.getElementById('details');
  var params = new URLSearchParams(window.location.search);
  var openerWindow = window.opener;
  var partnerId = params.get('partnerId');
  var nonce = params.get('nonce');
  var handled = false;
  var timeoutId = null;

  function setStatus(status, details) {
    if (statusNode) {
      statusNode.textContent = status;
    }
    if (detailsNode) {
      detailsNode.textContent = details;
    }
  }

  function postMessageToOpener(message, targetOrigin) {
    if (openerWindow && !openerWindow.closed) {
      openerWindow.postMessage(message, targetOrigin);
    }
  }

  function fail(message, targetOrigin) {
    if (handled) {
      return;
    }
    handled = true;
    window.clearTimeout(timeoutId);
    setStatus('Unable to load this partner handoff.', message);
    postMessageToOpener({
      type: ERROR_TYPE,
      partnerId: partnerId,
      nonce: nonce,
      message: message
    }, targetOrigin || '*');
  }

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value instanceof ArrayBuffer) {
      return false;
    }
    var proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function sanitizeValue(value, path) {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    if (value instanceof ArrayBuffer) {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(function (entry, index) {
        return sanitizeValue(entry, path + '[' + index + ']');
      });
    }
    if (!isPlainObject(value)) {
      throw new Error('Unsupported object type at "' + path + '".');
    }
    var output = {};
    Object.keys(value).forEach(function (key) {
      if (!FORBIDDEN_KEYS.has(key)) {
        output[key] = sanitizeValue(value[key], path + '.' + key);
      }
    });
    return output;
  }

  function measureBytes(value) {
    if (value instanceof ArrayBuffer) {
      return value.byteLength;
    }
    var text = typeof value === 'string' ? value : JSON.stringify(value);
    return new TextEncoder().encode(text).length;
  }

  function containsBlockedMarkup(text) {
    return /^\s*<(?:!doctype|html|svg|script|body|iframe)/i.test(text);
  }

  function normalizeExtension(extension) {
    return String(extension || '').replace(/^\.+/, '').trim().toLowerCase();
  }

  function determineExtension(file) {
    var optionExtension = file.options && typeof file.options.extension === 'string'
      ? normalizeExtension(file.options.extension)
      : '';

    if (optionExtension) {
      return optionExtension;
    }

    if (typeof file.name === 'string' && file.name.indexOf('.') > -1) {
      return normalizeExtension(file.name.split('.').pop());
    }

    if (typeof file.mimeType === 'string') {
      var mimeType = file.mimeType.toLowerCase();
      if (mimeType.indexOf('sheet') > -1 || mimeType.indexOf('excel') > -1) {
        return 'xlsx';
      }
      if (mimeType.indexOf('json') > -1) {
        return 'json';
      }
    }

    if (file.contents instanceof ArrayBuffer) {
      return 'xlsx';
    }

    if (typeof file.contents === 'string') {
      var trimmed = file.contents.trim();
      if (trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[') {
        return 'json';
      }
      if (trimmed.charAt(0) === '>') {
        return 'fasta';
      }
      if (trimmed.charAt(0) === '(' && trimmed.charAt(trimmed.length - 1) === ';') {
        return 'nwk';
      }
    }

    return 'csv';
  }

  function looksLikeAuspicePayload(contents) {
    if (isPlainObject(contents)) {
      return !!contents.meta && !!contents.tree;
    }

    if (typeof contents !== 'string') {
      return false;
    }

    var trimmed = contents.trim();
    if (!trimmed || trimmed.charAt(0) !== '{') {
      return false;
    }

    try {
      var parsed = JSON.parse(trimmed);
      return isPlainObject(parsed) && !!parsed.meta && !!parsed.tree;
    } catch (error) {
      return false;
    }
  }

  function looksLikeFastaText(contents) {
    return typeof contents === 'string' && contents.trim().charAt(0) === '>';
  }

  function looksLikeNewickText(contents) {
    if (typeof contents !== 'string') {
      return false;
    }
    var trimmed = contents.trim();
    return trimmed.charAt(0) === '(' && trimmed.charAt(trimmed.length - 1) === ';';
  }

  function looksLikeTabularJson(contents) {
    if (typeof contents !== 'string') {
      return false;
    }

    var trimmed = contents.trim();
    if (!trimmed || (trimmed.charAt(0) !== '{' && trimmed.charAt(0) !== '[')) {
      return false;
    }

    try {
      var parsed = JSON.parse(trimmed);
      var rows = Array.isArray(parsed) ? parsed : [parsed];
      return !!rows.length && isPlainObject(rows[0]);
    } catch (error) {
      return false;
    }
  }

  function looksLikeDelimitedText(contents) {
    if (typeof contents !== 'string') {
      return false;
    }

    var lines = contents.split(/\r?\n/).map(function (line) {
      return line.trim();
    }).filter(Boolean);

    if (lines.length < 2) {
      return false;
    }

    return lines[0].indexOf(',') > -1 || lines[0].indexOf('\t') > -1;
  }

  function normalizeKind(file, index) {
    var explicitKind = typeof file.kind === 'string' ? file.kind.trim().toLowerCase() : '';
    var extension = determineExtension(file);

    if (explicitKind && explicitKind !== 'auto') {
      if (!ALLOWED_KINDS.has(explicitKind)) {
        throw new Error('File ' + (index + 1) + ' used an unsupported kind.');
      }
      return explicitKind;
    }

    if (looksLikeAuspicePayload(file.contents)) {
      return 'auspice';
    }

    if (looksLikeFastaText(file.contents) || /^(fa|faa|fasta|fas|fna)$/i.test(extension)) {
      return 'fasta';
    }

    if (looksLikeNewickText(file.contents) || /^(nwk|newick|tree|tre)$/i.test(extension)) {
      return 'newick';
    }

    if (file.contents instanceof ArrayBuffer) {
      if (!(extension === 'xlsx' || extension === 'xls')) {
        throw new Error('Binary contents are only allowed for Excel-backed imports.');
      }
      return undefined;
    }

    if (looksLikeTabularJson(file.contents) || looksLikeDelimitedText(file.contents)) {
      return undefined;
    }

    throw new Error('File ' + (index + 1) + ' did not declare a kind and MicrobeTrace could not infer one.');
  }

  function buildHandoffId() {
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    return 'handoff-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function buildRedirectUrl(handoffId) {
    var appRoot = new URL('../../', window.location.href);
    appRoot.searchParams.set('handoff', handoffId);
    appRoot.searchParams.set('skipDemoSession', '1');
    return appRoot.toString();
  }

  function loadAllowlist() {
    return fetch('./partner-allowlist.json', { cache: 'no-store' }).then(function (response) {
      if (!response.ok) {
        throw new Error('Unable to load the partner allowlist configuration.');
      }
      return response.json();
    });
  }

  function validatePartner(config, origin) {
    var defaults = isPlainObject(config.defaults) ? config.defaults : {};
    var partners = isPlainObject(config.partners) ? config.partners : {};
    var partnerConfig = partners[partnerId];

    if (!partnerConfig || !Array.isArray(partnerConfig.origins) || !partnerConfig.origins.includes(origin)) {
      throw new Error('The calling origin is not approved for this partner handoff.');
    }

    return {
      maxFiles: Number(partnerConfig.maxFiles || defaults.maxFiles || 10),
      maxFileBytes: Number(partnerConfig.maxFileBytes || defaults.maxFileBytes || 20971520),
      maxTotalBytes: Number(partnerConfig.maxTotalBytes || defaults.maxTotalBytes || 52428800),
      ttlMs: Number(defaults.ttlMs || 900000)
    };
  }

  function validatePayload(payload, limits) {
    var sanitized = sanitizeValue(payload, 'payload');

    if (!isPlainObject(sanitized)) {
      throw new Error('The partner handoff payload is malformed.');
    }

    if (sanitized.session || sanitized.tabs) {
      throw new Error('Full session imports are not allowed in the partner handoff flow.');
    }

    if (Number(sanitized.version) !== 1) {
      throw new Error('Unsupported partner handoff version.');
    }

    if (typeof sanitized.partnerId !== 'string' || sanitized.partnerId !== partnerId) {
      throw new Error('The payload partnerId did not match the receiver context.');
    }

    if (typeof sanitized.nonce !== 'string' || sanitized.nonce !== nonce) {
      throw new Error('The partner handoff nonce did not match.');
    }

    if (!Array.isArray(sanitized.files) || !sanitized.files.length) {
      throw new Error('The partner handoff did not include any files.');
    }

    if (sanitized.files.length > limits.maxFiles) {
      throw new Error('The partner handoff exceeded the maximum file count.');
    }

    var totalBytes = 0;

    sanitized.files.forEach(function (file, index) {
      if (!isPlainObject(file)) {
        throw new Error('File ' + (index + 1) + ' is malformed.');
      }

      if (typeof file.name !== 'string' || !file.name.trim()) {
        throw new Error('File ' + (index + 1) + ' is missing a name.');
      }

      if (typeof file.mimeType !== 'undefined' && typeof file.mimeType !== 'string') {
        throw new Error('File ' + (index + 1) + ' had an invalid mimeType.');
      }

      if (typeof file.options !== 'undefined' && !isPlainObject(file.options)) {
        throw new Error('File ' + (index + 1) + ' had invalid options.');
      }

      var normalizedKind = normalizeKind(file, index);
      if (normalizedKind) {
        file.kind = normalizedKind;
      } else {
        delete file.kind;
      }

      if (file.kind === 'auspice') {
        if (typeof file.contents === 'string') {
          var parsed = JSON.parse(file.contents);
          if (!isPlainObject(parsed) || !parsed.meta || !parsed.tree) {
            throw new Error('Auspice payloads must include "meta" and "tree".');
          }
        } else if (!isPlainObject(file.contents) || !file.contents.meta || !file.contents.tree) {
          throw new Error('Auspice payloads must include "meta" and "tree".');
        }
      } else if (file.contents instanceof ArrayBuffer) {
        var extension = (file.options && typeof file.options.extension === 'string' ? file.options.extension : '').toLowerCase();
        if (!(extension === 'xlsx' || extension === 'xls' || /\.xlsx?$/i.test(file.name))) {
          throw new Error('Binary contents are only allowed for Excel-backed imports.');
        }
      } else if (typeof file.contents === 'string') {
        if (!file.contents.trim()) {
          throw new Error('File ' + (index + 1) + ' may not be empty.');
        }
        if (containsBlockedMarkup(file.contents)) {
          throw new Error('HTML, SVG, and script-like payloads are not allowed.');
        }
      } else {
        throw new Error('Only text, Excel binaries, and Auspice objects are allowed.');
      }

      var fileBytes = measureBytes(file.contents);
      totalBytes += fileBytes;

      if (fileBytes > limits.maxFileBytes) {
        throw new Error('File ' + (index + 1) + ' exceeded the per-file size limit.');
      }
    });

    if (totalBytes > limits.maxTotalBytes) {
      throw new Error('The partner handoff exceeded the total payload size limit.');
    }

    return sanitized;
  }

  async function handleTransfer(event) {
    if (handled || event.source !== openerWindow) {
      return;
    }

    if (!event.data || event.data.type !== TRANSFER_TYPE || event.data.status) {
      return;
    }

    try {
      var config = await loadAllowlist();
      var limits = validatePartner(config, event.origin);
      var payload = validatePayload(event.data, limits);
      var createdAt = Date.now();
      var handoffId = buildHandoffId();
      var record = {
        version: 1,
        handoffId: handoffId,
        partnerId: payload.partnerId,
        nonce: payload.nonce,
        metadata: payload.metadata,
        createdAt: createdAt,
        expiresAt: createdAt + limits.ttlMs,
        files: payload.files
      };

      setStatus('Validating partner handoff…', 'Saving the dataset for MicrobeTrace to load.');
      await window.localforage.setItem('handoff:' + handoffId, record);
      postMessageToOpener({
        type: TRANSFER_TYPE,
        status: 'stored',
        partnerId: partnerId,
        nonce: nonce,
        handoffId: handoffId
      }, event.origin);
      handled = true;
      window.clearTimeout(timeoutId);
      window.location.replace(buildRedirectUrl(handoffId));
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Unable to validate the partner handoff payload.', event.origin);
    }
  }

  if (window.top !== window.self) {
    fail('This page cannot run inside an embedded frame.');
    return;
  }

  if (!openerWindow) {
    fail('This page must be opened by an approved partner application.');
    return;
  }

  if (!partnerId || !nonce) {
    fail('The receiver is missing required partner handoff parameters.');
    return;
  }

  window.addEventListener('message', function (event) {
    handleTransfer(event);
  });

  timeoutId = window.setTimeout(function () {
    fail('Timed out waiting for the partner page to send the dataset.');
  }, 30000);

  postMessageToOpener({
    type: READY_TYPE,
    partnerId: partnerId,
    nonce: nonce
  }, '*');
})();
