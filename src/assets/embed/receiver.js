(function () {
  'use strict';

  var ALLOWED_KINDS = new Set(['node', 'link', 'matrix', 'fasta', 'newick', 'auspice']);
  var ALLOWED_DEFAULT_VIEWS = new Set([
    '2D Network',
    'Epi Curve',
    'Sankey',
    'Table',
    'Crosstab',
    'Map',
    'Bubble',
    'Gantt Chart',
    'Phylogenetic Tree',
    'Alignment View',
    'Heatmap',
    'Waterfall'
  ]);
  var ALLOWED_DISTANCE_METRICS = new Set(['snps', 'tn93']);
  var ALLOWED_AMBIGUITY_STRATEGIES = new Set(['AVERAGE', 'RESOLVE', 'SKIP', 'GAPMM', 'HIVTRACE-G']);
  var ALLOWED_NODE_SHAPES = new Set([
    'ellipse',
    'triangle',
    'rectangle',
    'barrel',
    'rhomboid',
    'diamond',
    'pentagon',
    'hexagon',
    'heptagon',
    'octagon',
    'star',
    'tag',
    'vee'
  ]);
  var ALLOWED_TN93_DISTANCE_DISPLAY_FORMATS = new Set(['decimal', 'percentage']);
  var FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  var HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
  var READY_TYPE = 'MT_HANDOFF_READY';
  var TRANSFER_TYPE = 'MT_HANDOFF_TRANSFER';
  var ERROR_TYPE = 'MT_HANDOFF_ERROR';
  var HANDOFF_STORAGE_PREFIX = 'handoff:';
  var DEFAULT_HANDOFF_TTL_MS = 900000;
  var UNSUPPORTED_WEB_CRYPTO_MESSAGE = 'MicrobeTrace partner handoff requires a modern browser with Web Crypto support.';
  var statusNode = document.getElementById('status');
  var detailsNode = document.getElementById('details');
  var params = new URLSearchParams(window.location.search);
  var openerWindow = window.opener;
  var partnerId = params.get('partnerId');
  var nonce = params.get('nonce');
  var openerOrigin = normalizeMessageOrigin(params.get('openerOrigin')) || normalizeMessageOrigin(document.referrer);
  var handled = false;
  var timeoutId = null;
  var allowlistConfig = null;
  var allowedTargetOrigins = [];

  function normalizeMessageOrigin(value) {
    if (typeof value !== 'string' || !value.trim()) {
      return '';
    }

    try {
      var parsed = new URL(value);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return '';
      }
      return parsed.origin;
    } catch (error) {
      return '';
    }
  }

  function setStatus(status, details) {
    if (statusNode) {
      statusNode.textContent = status;
    }
    if (detailsNode) {
      detailsNode.textContent = details;
    }
  }

  function postMessageToOpener(message, targetOrigin) {
    if (targetOrigin && openerWindow && !openerWindow.closed) {
      openerWindow.postMessage(message, targetOrigin);
    }
  }

  function postMessageToAllowedOrigins(message, targetOrigins) {
    if (!Array.isArray(targetOrigins)) {
      return;
    }
    targetOrigins.forEach(function (targetOrigin) {
      postMessageToOpener(message, targetOrigin);
    });
  }

  function fail(message, targetOrigins) {
    if (handled) {
      return;
    }
    handled = true;
    window.clearTimeout(timeoutId);
    setStatus('Unable to load this partner handoff.', message);
    var replyOrigins = Array.isArray(targetOrigins) ? targetOrigins : (openerOrigin ? [openerOrigin] : []);
    postMessageToAllowedOrigins({
      type: ERROR_TYPE,
      partnerId: partnerId,
      nonce: nonce,
      message: message
    }, replyOrigins);
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
      if (FORBIDDEN_KEYS.has(key)) {
        throw new Error('Forbidden object key at "' + path + '.' + key + '".');
      }
      output[key] = sanitizeValue(value[key], path + '.' + key);
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

  function buildSecureId(prefix) {
    if (window.crypto && window.crypto.randomUUID) {
      return prefix + window.crypto.randomUUID();
    }
    if (window.crypto && window.crypto.getRandomValues) {
      var bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      return prefix + Array.prototype.map.call(bytes, function (byte) {
        return byte.toString(16).padStart(2, '0');
      }).join('');
    }
    throw new Error(UNSUPPORTED_WEB_CRYPTO_MESSAGE);
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
    return buildSecureId('');
  }

  function buildRedirectUrl(handoffId) {
    var appRoot = new URL('../../', window.location.href);
    appRoot.hash = 'handoff=' + encodeURIComponent(handoffId);
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

  function normalizeOrigin(origin) {
    if (typeof origin !== 'string' || !origin.trim() || origin.trim() === '*') {
      return null;
    }

    try {
      var parsed = new URL(origin);
      return parsed.origin === origin.trim() ? parsed.origin : null;
    } catch (error) {
      return null;
    }
  }

  function getPartnerOrigins(config) {
    var partners = isPlainObject(config.partners) ? config.partners : {};
    var partnerConfig = partners[partnerId];

    if (!partnerConfig || !Array.isArray(partnerConfig.origins)) {
      throw new Error('The requested partner is not configured for handoff.');
    }

    var origins = partnerConfig.origins.map(normalizeOrigin).filter(Boolean);
    if (!origins.length) {
      throw new Error('The requested partner does not have any approved handoff origins.');
    }

    return origins;
  }

  function validatePartner(config, origin) {
    var defaults = isPlainObject(config.defaults) ? config.defaults : {};
    var partners = isPlainObject(config.partners) ? config.partners : {};
    var partnerConfig = partners[partnerId];
    var origins = getPartnerOrigins(config);

    if (!origins.includes(origin)) {
      throw new Error('The calling origin is not approved for this partner handoff.');
    }

    return {
      maxFiles: Number(partnerConfig.maxFiles || defaults.maxFiles || 10),
      maxFileBytes: Number(partnerConfig.maxFileBytes || defaults.maxFileBytes || 20971520),
      maxTotalBytes: Number(partnerConfig.maxTotalBytes || defaults.maxTotalBytes || 52428800),
      ttlMs: Number(defaults.ttlMs || 900000)
    };
  }

  function shouldRemoveStoredHandoff(stored, now) {
    if (!stored) {
      return true;
    }

    try {
      var parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
      var sanitized = sanitizeValue(parsed, 'handoff');

      if (!isPlainObject(sanitized)) {
        return true;
      }

      var version = Number(sanitized.version);
      var createdAt = Number(sanitized.createdAt);
      var expiresAt = Number(sanitized.expiresAt);

      if (version !== 1) {
        return true;
      }
      if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) {
        return true;
      }
      if (expiresAt < now) {
        return true;
      }
      if (expiresAt - createdAt > DEFAULT_HANDOFF_TTL_MS) {
        return true;
      }

      return !Array.isArray(sanitized.files) || sanitized.files.length === 0;
    } catch (error) {
      return true;
    }
  }

  async function cleanupExpiredStoredHandoffs(now) {
    if (!window.localforage || typeof window.localforage.keys !== 'function') {
      return;
    }

    var keys = await window.localforage.keys();
    var handoffKeys = keys.filter(function (key) {
      return typeof key === 'string' && key.indexOf(HANDOFF_STORAGE_PREFIX) === 0;
    });

    await Promise.all(handoffKeys.map(async function (key) {
      try {
        var stored = await window.localforage.getItem(key);
        if (shouldRemoveStoredHandoff(stored, now)) {
          await window.localforage.removeItem(key);
        }
      } catch (error) {
        try {
          await window.localforage.removeItem(key);
        } catch (removeError) {
          // Best-effort cleanup; validation still protects the active handoff.
        }
      }
    }));
  }

  function buildReceiptFiles(files) {
    return files.map(function (file) {
      var receipt = {
        name: file.name,
        bytes: measureBytes(file.contents)
      };

      if (typeof file.kind === 'string') {
        receipt.kind = file.kind;
      }

      return receipt;
    });
  }

  function requireAllowedLaunchString(value, allowedValues, fieldName) {
    if (typeof value !== 'string' || !allowedValues.has(value.trim())) {
      throw new Error('Launch option "' + fieldName + '" used an unsupported value.');
    }

    return value.trim();
  }

  function requireNonNegativeFiniteNumber(value, fieldName) {
    var numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      throw new Error('Launch option "' + fieldName + '" must be a non-negative finite number.');
    }
    return numericValue;
  }

  function normalizeVariableColorScale(value, fieldName) {
    if (!isPlainObject(value)) {
      throw new Error('Launch option "' + fieldName + '" must be an object.');
    }

    var allowedModes = new Set(['auto', 'categorical', 'continuous']);
    if (typeof value.mode !== 'string' || !allowedModes.has(value.mode)) {
      throw new Error('Launch option "' + fieldName + '.mode" used an unsupported value.');
    }

    var normalized = { mode: value.mode };
    if (typeof value.domain !== 'undefined') {
      if (!isPlainObject(value.domain)) {
        throw new Error('Launch option "' + fieldName + '.domain" must contain finite min and max values.');
      }
      var min = Number(value.domain.min);
      var max = Number(value.domain.max);
      if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
        throw new Error('Launch option "' + fieldName + '.domain" must have finite min less than max.');
      }
      normalized.domain = { min: min, max: max };
    }

    if (typeof value.stops !== 'undefined') {
      if (!normalized.domain) {
        throw new Error('Launch option "' + fieldName + '.stops" requires a custom domain.');
      }
      if (!Array.isArray(value.stops) || value.stops.length < 2) {
        throw new Error('Launch option "' + fieldName + '.stops" must contain at least two stops.');
      }
      normalized.stops = value.stops.map(function (stop, index) {
        if (!isPlainObject(stop)) {
          throw new Error('Launch option "' + fieldName + '.stops[' + index + ']" must be an object.');
        }
        var stopValue = Number(stop.value);
        if (!Number.isFinite(stopValue) || typeof stop.color !== 'string' || !HEX_COLOR_PATTERN.test(stop.color.trim())) {
          throw new Error('Launch option "' + fieldName + '.stops[' + index + ']" must have a finite value and 6-digit hex color.');
        }
        return { value: stopValue, color: stop.color.trim() };
      });
      var strictlyIncreasing = normalized.stops.every(function (stop, index) {
        return index === 0 || stop.value > normalized.stops[index - 1].value;
      });
      if (!strictlyIncreasing
        || normalized.stops[0].value !== normalized.domain.min
        || normalized.stops[normalized.stops.length - 1].value !== normalized.domain.max) {
        throw new Error('Launch option "' + fieldName + '.stops" must increase strictly and span the custom domain.');
      }
    }

    if (typeof value.missingColor !== 'undefined') {
      if (typeof value.missingColor !== 'string' || !HEX_COLOR_PATTERN.test(value.missingColor.trim())) {
        throw new Error('Launch option "' + fieldName + '.missingColor" must be a 6-digit hex color.');
      }
      normalized.missingColor = value.missingColor.trim();
    }

    if (normalized.mode === 'categorical' && (normalized.domain || normalized.stops)) {
      throw new Error('Launch option "' + fieldName + '" cannot use a domain or stops in categorical mode.');
    }
    return normalized;
  }

  function normalizeLaunchGlobalSettings(globalSettings) {
    if (!isPlainObject(globalSettings)) {
      throw new Error('Launch option "globalSettings" must be an object.');
    }

    var normalized = {};
    ['nodeColorBy', 'linkColorBy', 'nodeShapeBy'].forEach(function (fieldName) {
      var value = globalSettings[fieldName];
      if (typeof value === 'undefined') {
        return;
      }
      if (typeof value !== 'string') {
        throw new Error('Launch global setting "' + fieldName + '" must be a string.');
      }
      if (value.trim()) {
        normalized[fieldName] = value.trim();
      }
    });

    ['nodeColor', 'linkColor', 'selectedColor', 'backgroundColor'].forEach(function (fieldName) {
      var value = globalSettings[fieldName];
      if (typeof value === 'undefined') {
        return;
      }
      if (typeof value !== 'string' || !HEX_COLOR_PATTERN.test(value.trim())) {
        throw new Error('Launch global setting "' + fieldName + '" must be a 6-digit hex color.');
      }
      normalized[fieldName] = value.trim();
    });

    ['nodeColorScale', 'linkColorScale'].forEach(function (fieldName) {
      if (typeof globalSettings[fieldName] !== 'undefined') {
        normalized[fieldName] = normalizeVariableColorScale(globalSettings[fieldName], 'globalSettings.' + fieldName);
      }
    });

    if (normalized.nodeColorScale && (!normalized.nodeColorBy || normalized.nodeColorBy === 'None')) {
      throw new Error('Launch global setting "nodeColorScale" requires "nodeColorBy".');
    }
    if (normalized.linkColorScale && (!normalized.linkColorBy || normalized.linkColorBy === 'None')) {
      throw new Error('Launch global setting "linkColorScale" requires "linkColorBy".');
    }

    if (typeof globalSettings.nodeShape !== 'undefined') {
      normalized.nodeShape = requireAllowedLaunchString(globalSettings.nodeShape, ALLOWED_NODE_SHAPES, 'globalSettings.nodeShape');
    }

    if (typeof globalSettings.clusterMinimumSize !== 'undefined') {
      normalized.clusterMinimumSize = requireNonNegativeFiniteNumber(globalSettings.clusterMinimumSize, 'clusterMinimumSize');
    }

    if (typeof globalSettings.tn93DistanceDisplayFormat !== 'undefined') {
      normalized.tn93DistanceDisplayFormat = requireAllowedLaunchString(
        String(globalSettings.tn93DistanceDisplayFormat).toLowerCase(),
        ALLOWED_TN93_DISTANCE_DISPLAY_FORMATS,
        'globalSettings.tn93DistanceDisplayFormat'
      );
    }

    return normalized;
  }

  function normalizeLaunchOptions(launch) {
    if (!launch) {
      return undefined;
    }

    if (!isPlainObject(launch)) {
      throw new Error('The partner handoff launch options are malformed.');
    }

    var normalized = {};

    if (typeof launch.datasetName !== 'undefined') {
      if (typeof launch.datasetName !== 'string') {
        throw new Error('Launch option "datasetName" must be a string.');
      }
      if (launch.datasetName.trim()) {
        normalized.datasetName = launch.datasetName.trim();
      }
    }

    if (typeof launch.defaultView !== 'undefined') {
      normalized.defaultView = requireAllowedLaunchString(launch.defaultView, ALLOWED_DEFAULT_VIEWS, 'defaultView');
    }

    if (typeof launch.distanceMetric !== 'undefined') {
      normalized.distanceMetric = requireAllowedLaunchString(String(launch.distanceMetric).toLowerCase(), ALLOWED_DISTANCE_METRICS, 'distanceMetric');
    }

    if (typeof launch.linkThreshold !== 'undefined') {
      normalized.linkThreshold = requireNonNegativeFiniteNumber(launch.linkThreshold, 'linkThreshold');
    }

    if (typeof launch.ambiguityStrategy !== 'undefined') {
      normalized.ambiguityStrategy = requireAllowedLaunchString(String(launch.ambiguityStrategy).toUpperCase(), ALLOWED_AMBIGUITY_STRATEGIES, 'ambiguityStrategy');
    }

    if (typeof launch.ambiguityThreshold !== 'undefined') {
      normalized.ambiguityThreshold = requireNonNegativeFiniteNumber(launch.ambiguityThreshold, 'ambiguityThreshold');
    }

    if (typeof launch.globalSettings !== 'undefined') {
      normalized.globalSettings = normalizeLaunchGlobalSettings(launch.globalSettings);
    }

    return Object.keys(normalized).length ? normalized : undefined;
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

    sanitized.launch = normalizeLaunchOptions(sanitized.launch);

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

    if (openerOrigin && event.origin !== openerOrigin) {
      fail('The partner handoff origin did not match the expected opener origin.', openerOrigin);
      return;
    }

    try {
      var limits = validatePartner(allowlistConfig, event.origin);
      var payload = validatePayload(event.data, limits);
      var createdAt = Date.now();
      await cleanupExpiredStoredHandoffs(createdAt);
      var handoffId = buildHandoffId();
      var expiresAt = createdAt + limits.ttlMs;
      var record = {
        version: 1,
        handoffId: handoffId,
        partnerId: payload.partnerId,
        nonce: payload.nonce,
        metadata: payload.metadata,
        launch: payload.launch,
        createdAt: createdAt,
        expiresAt: expiresAt,
        files: payload.files
      };

      setStatus('Validating partner handoff…', 'Saving the dataset for MicrobeTrace to load.');
      await window.localforage.setItem('handoff:' + handoffId, record);
      postMessageToOpener({
        type: TRANSFER_TYPE,
        status: 'stored',
        partnerId: partnerId,
        nonce: nonce,
        handoffId: handoffId,
        createdAt: createdAt,
        expiresAt: expiresAt,
        launch: payload.launch,
        files: buildReceiptFiles(payload.files)
      }, event.origin);
      handled = true;
      window.clearTimeout(timeoutId);
      window.location.replace(buildRedirectUrl(handoffId));
    } catch (error) {
      var replyOrigins = allowedTargetOrigins.includes(event.origin) ? [event.origin] : [];
      fail(error instanceof Error ? error.message : 'Unable to validate the partner handoff payload.', replyOrigins);
    }
  }

  async function initialize() {
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

    try {
      allowlistConfig = await loadAllowlist();
      allowedTargetOrigins = getPartnerOrigins(allowlistConfig);
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Unable to load the partner allowlist configuration.');
      return;
    }

    if (openerOrigin) {
      if (!allowedTargetOrigins.includes(openerOrigin)) {
        fail('The calling origin is not approved for this partner handoff.', []);
        return;
      }
      allowedTargetOrigins = [openerOrigin];
    }

    window.addEventListener('message', function (event) {
      handleTransfer(event);
    });

    timeoutId = window.setTimeout(function () {
      fail('Timed out waiting for the partner page to send the dataset.', allowedTargetOrigins);
    }, 30000);

    postMessageToAllowedOrigins({
      type: READY_TYPE,
      partnerId: partnerId,
      nonce: nonce
    }, allowedTargetOrigins);
  }

  initialize();
})();
