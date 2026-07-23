#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

if (require.main === module) {
  const allowlistPath = path.resolve(process.cwd(), process.argv[2] || 'src/assets/embed/partner-allowlist.json');
  const violations = validatePartnerAllowlist(readJson(allowlistPath));

  if (violations.length > 0) {
    console.error('Partner embed allowlist validation failed:');
    violations.forEach((violation) => console.error(`- ${violation}`));
    process.exit(1);
  }

  console.log(`Partner embed allowlist validation passed for ${allowlistPath}.`);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Unable to read ${filePath}: ${error.message}`);
    process.exit(1);
  }
}

function validatePartnerAllowlist(config) {
  const errors = [];
  const originOwners = new Map();

  if (!isPlainObject(config)) {
    return ['Allowlist must be a JSON object.'];
  }

  if (Number(config.version) !== 1) {
    errors.push('Allowlist version must be 1.');
  }

  const defaults = isPlainObject(config.defaults) ? config.defaults : {};
  validateLimits(defaults, 'defaults', errors);

  const partners = isPlainObject(config.partners) ? config.partners : null;
  if (!partners || Object.keys(partners).length === 0) {
    errors.push('Allowlist must define at least one partner.');
    return errors;
  }

  Object.entries(partners).forEach(([partnerId, partnerConfig]) => {
    if (!/^[A-Za-z0-9._-]+$/.test(partnerId)) {
      errors.push(`Partner "${partnerId}" contains unsupported characters.`);
    }
    if (!isPlainObject(partnerConfig)) {
      errors.push(`Partner "${partnerId}" must be an object.`);
      return;
    }
    if (!Array.isArray(partnerConfig.origins) || partnerConfig.origins.length === 0) {
      errors.push(`Partner "${partnerId}" must include at least one origin.`);
      return;
    }

    validateLimits(partnerConfig, `partners.${partnerId}`, errors, true);

    partnerConfig.origins.forEach((origin) => {
      const normalizedOrigin = normalizeExactOrigin(origin);
      if (!normalizedOrigin) {
        errors.push(`Partner "${partnerId}" origin "${origin}" must be an exact http(s) origin with no path, query, fragment, wildcard, or credentials.`);
        return;
      }

      const isLocalOrigin = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(normalizedOrigin);
      if (partnerId === 'local-dev' && !isLocalOrigin) {
        errors.push('Partner "local-dev" may only contain localhost or 127.0.0.1 origins.');
      }
      if (partnerId !== 'local-dev' && isLocalOrigin) {
        errors.push(`Partner "${partnerId}" may not contain local development origin "${normalizedOrigin}".`);
      }

      const existingOwner = originOwners.get(normalizedOrigin);
      if (existingOwner && existingOwner !== partnerId) {
        errors.push(`Origin "${normalizedOrigin}" is shared by "${existingOwner}" and "${partnerId}". Use one partnerId per security boundary.`);
      } else {
        originOwners.set(normalizedOrigin, partnerId);
      }
    });
  });

  return errors;
}

function validateLimits(config, label, errors, optional = false) {
  ['maxFiles', 'maxFileBytes', 'maxTotalBytes', 'ttlMs'].forEach((field) => {
    if (optional && typeof config[field] === 'undefined') {
      return;
    }

    const value = Number(config[field]);
    if (!Number.isFinite(value) || value <= 0 || Math.floor(value) !== value) {
      errors.push(`${label}.${field} must be a positive integer.`);
    }
  });

  if (
    Number.isFinite(Number(config.maxFileBytes)) &&
    Number.isFinite(Number(config.maxTotalBytes)) &&
    Number(config.maxFileBytes) > Number(config.maxTotalBytes)
  ) {
    errors.push(`${label}.maxFileBytes may not exceed ${label}.maxTotalBytes.`);
  }
}

function normalizeExactOrigin(origin) {
  if (typeof origin !== 'string' || !origin.trim() || origin.includes('*')) {
    return null;
  }

  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      return null;
    }
    return parsed.origin === origin.trim().replace(/\/$/, '') ? parsed.origin : null;
  } catch {
    return null;
  }
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

module.exports = {
  validatePartnerAllowlist,
};
