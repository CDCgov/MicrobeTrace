import Ajv, { ErrorObject } from 'ajv';

export const MICROBETRACE_STYLE_FILE_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://microbetrace.cdc.gov/schemas/style-file-v1.json',
  title: 'MicrobeTrace style file',
  description: 'Validates the stable style-file envelope and versioned variable color-scale extension.',
  type: 'object',
  required: ['widgets'],
  additionalProperties: true,
  properties: {
    widgets: {
      type: 'object',
      additionalProperties: true
    },
    linkAlphas: { type: 'array' },
    linkColors: { type: 'array' },
    linkValueNames: { type: 'object' },
    keyTableColumnNames: { type: 'object' },
    nodeAlphas: { type: 'array' },
    nodeColors: { type: 'array' },
    nodeColorAssignments: { type: 'object' },
    linkColorAssignments: { type: 'object' },
    nodeColorsTable: { type: 'object' },
    nodeColorsTableHistory: { type: 'object' },
    nodeColorsTableKeys: { type: 'object' },
    linkColorsTable: { type: 'object' },
    linkColorsTableHistory: { type: 'object' },
    linkColorsTableKeys: { type: 'object' },
    nodeSymbols: { type: 'array' },
    nodeSymbolsTable: { type: 'object' },
    nodeSymbolsTableKeys: { type: 'object' },
    nodeValueNames: { type: 'object' },
    polygonAlphas: { type: 'array' },
    polygonColors: { type: 'array' },
    polygonValueNames: { type: 'object' },
    overwrite: { type: 'object' },
    variableColorScales: { $ref: '#/definitions/variableColorScaleState' }
  },
  definitions: {
    color: {
      type: 'string',
      pattern: '^#[0-9a-fA-F]{6}$'
    },
    colorStop: {
      type: 'object',
      required: ['value', 'color'],
      additionalProperties: false,
      properties: {
        value: { type: 'number' },
        color: { $ref: '#/definitions/color' }
      }
    },
    automaticDomain: {
      type: 'object',
      required: ['kind'],
      additionalProperties: false,
      properties: {
        kind: { const: 'auto' }
      }
    },
    customDomain: {
      type: 'object',
      required: ['kind', 'min', 'max'],
      additionalProperties: false,
      properties: {
        kind: { const: 'custom' },
        min: { type: 'number' },
        max: { type: 'number' }
      }
    },
    variableColorScaleConfig: {
      type: 'object',
      required: ['mode', 'domain', 'missingColor'],
      additionalProperties: false,
      properties: {
        mode: { enum: ['auto', 'categorical', 'continuous'] },
        domain: {
          oneOf: [
            { $ref: '#/definitions/automaticDomain' },
            { $ref: '#/definitions/customDomain' }
          ]
        },
        stops: {
          type: 'array',
          minItems: 2,
          items: { $ref: '#/definitions/colorStop' }
        },
        missingColor: { $ref: '#/definitions/color' }
      }
    },
    variableColorScaleTarget: {
      type: 'object',
      additionalProperties: { $ref: '#/definitions/variableColorScaleConfig' }
    },
    variableColorScaleState: {
      type: 'object',
      required: ['version', 'node', 'link'],
      additionalProperties: false,
      properties: {
        version: { const: 1 },
        node: { $ref: '#/definitions/variableColorScaleTarget' },
        link: { $ref: '#/definitions/variableColorScaleTarget' }
      }
    }
  }
} as const;

export interface StyleFileSchemaValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const ajv = new Ajv({ allErrors: true, strict: false });
const validateAgainstSchema = ajv.compile(MICROBETRACE_STYLE_FILE_SCHEMA as any);
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

function decodeJsonPointer(pointer: string): string[] {
  if (!pointer) {
    return [];
  }

  return pointer
    .split('/')
    .slice(1)
    .map(segment => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function formatPath(pointer: string, suffix?: string): string {
  const segments = decodeJsonPointer(pointer);
  if (suffix) {
    segments.push(suffix);
  }
  return segments.length ? segments.join('.') : 'style';
}

function formatFatalError(error: ErrorObject): string {
  if (error.keyword === 'required') {
    const missingProperty = String((error.params as any).missingProperty || 'property');
    return `${formatPath(error.instancePath, missingProperty)} is required.`;
  }

  if (error.keyword === 'type') {
    return `${formatPath(error.instancePath)} must be ${String((error.params as any).type)}.`;
  }

  return `${formatPath(error.instancePath)} ${error.message || 'is invalid'}.`;
}

function getScaleConfigPath(pointer: string): string {
  const segments = decodeJsonPointer(pointer);
  const targetIndex = segments.findIndex(segment => segment === 'node' || segment === 'link');
  if (targetIndex >= 0 && segments[targetIndex + 1]) {
    return segments.slice(0, targetIndex + 2).join('.');
  }
  return 'variableColorScales';
}

function formatScaleWarning(error: ErrorObject): string {
  const path = formatPath(error.instancePath);
  const configPath = getScaleConfigPath(error.instancePath);
  const missingProperty = error.keyword === 'required'
    ? String((error.params as any).missingProperty || '')
    : '';
  const additionalProperty = error.keyword === 'additionalProperties'
    ? String((error.params as any).additionalProperty || '')
    : '';

  if (additionalProperty) {
    return `${formatPath(error.instancePath, additionalProperty)} is not part of the style schema and was ignored.`;
  }

  if (path === 'variableColorScales' || error.instancePath === '/variableColorScales') {
    if (missingProperty === 'version') {
      return 'variableColorScales.version is missing; version 1 was assumed.';
    }
    if (missingProperty === 'node' || missingProperty === 'link') {
      return `variableColorScales.${missingProperty} is missing; an empty ${missingProperty} scale collection was used.`;
    }
    if (error.keyword === 'type') {
      return 'variableColorScales is not an object; legacy categorical behavior was used.';
    }
  }

  if (error.instancePath === '/variableColorScales/version') {
    return 'variableColorScales.version is unsupported; recognized settings were normalized to version 1.';
  }

  if (missingProperty === 'mode' || error.instancePath.endsWith('/mode')) {
    return `${configPath}.mode is invalid or missing; Auto mode was used.`;
  }

  if (missingProperty === 'domain') {
    return `${configPath}.domain is invalid or missing; the automatic data domain was used.`;
  }

  if (missingProperty === 'missingColor' || error.instancePath.endsWith('/missingColor')) {
    return `${configPath}.missingColor is invalid or missing; the default missing-value color was used.`;
  }

  if (error.instancePath === '/variableColorScales/node' || error.instancePath === '/variableColorScales/link') {
    return `${path} is invalid; an empty scale collection was used.`;
  }

  if (error.keyword === 'type' && configPath === path) {
    return `${configPath} is not an object; default Auto scale settings were used.`;
  }

  return `${path} does not match the style schema and was normalized.`;
}

function getScaleConfigs(style: any): Array<{ path: string; config: any }> {
  const configs: Array<{ path: string; config: any }> = [];
  const state = style?.variableColorScales;
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return configs;
  }

  (['node', 'link'] as const).forEach(target => {
    const targetState = state[target];
    if (!targetState || typeof targetState !== 'object' || Array.isArray(targetState)) {
      return;
    }

    Object.entries(targetState).forEach(([field, config]) => {
      configs.push({
        path: `variableColorScales.${target}.${field}`,
        config
      });
    });
  });

  return configs;
}

function collectStopNormalizationWarnings(style: any): string[] {
  const warnings: string[] = [];
  getScaleConfigs(style).forEach(({ path, config }) => {
    if (!config || typeof config !== 'object' || Array.isArray(config) || config.stops === undefined) {
      return;
    }

    if (!Array.isArray(config.stops)) {
      warnings.push(`${path}.stops is not an array; the default ramp was used.`);
      return;
    }

    const normalizedStops = config.stops
      .map((stop: any) => ({
        raw: stop,
        value: Number(stop?.value),
        color: typeof stop?.color === 'string' ? stop.color.trim() : ''
      }));
    const validStops = normalizedStops.filter(stop =>
      Number.isFinite(stop.value) && HEX_COLOR_PATTERN.test(stop.color)
    );
    const invalidCount = normalizedStops.length - validStops.length;
    const convertedCount = validStops.filter(stop => typeof stop.raw?.value !== 'number').length;
    const extraPropertyCount = validStops.filter(stop =>
      stop.raw
      && typeof stop.raw === 'object'
      && !Array.isArray(stop.raw)
      && Object.keys(stop.raw).some(key => key !== 'value' && key !== 'color')
    ).length;

    if (convertedCount) {
      warnings.push(`${path}.stops had ${convertedCount} numeric value${convertedCount === 1 ? '' : 's'} converted to numbers.`);
    }
    if (extraPropertyCount) {
      warnings.push(`${path}.stops had unsupported properties removed from ${extraPropertyCount} stop${extraPropertyCount === 1 ? '' : 's'}.`);
    }
    if (invalidCount) {
      warnings.push(`${path}.stops had ${invalidCount} invalid ${invalidCount === 1 ? 'entry' : 'entries'} removed.`);
    }

    const values = validStops.map(stop => stop.value);
    if (validStops.length < 2) {
      warnings.push(`${path}.stops has fewer than two valid stops; the default ramp was used.`);
      return;
    }
    if (new Set(values).size !== values.length) {
      warnings.push(`${path}.stops contains duplicate values; the default ramp was used.`);
      return;
    }
    if (values.some((value, index) => index > 0 && value < values[index - 1])) {
      warnings.push(`${path}.stops was out of order and was sorted by value.`);
    }
  });

  return warnings;
}

function collectDomainNormalizationWarnings(style: any): string[] {
  const warnings: string[] = [];
  getScaleConfigs(style).forEach(({ path, config }) => {
    if (!config || typeof config !== 'object' || Array.isArray(config) || config.domain === undefined) {
      return;
    }

    const domain = config.domain;
    if (!domain || typeof domain !== 'object' || Array.isArray(domain)) {
      warnings.push(`${path}.domain is invalid; the automatic data domain was used.`);
      return;
    }

    if (domain.kind === 'auto') {
      const ignoredKeys = Object.keys(domain).filter(key => key !== 'kind');
      if (ignoredKeys.length) {
        warnings.push(`${path}.domain ignored unsupported ${ignoredKeys.length === 1 ? 'property' : 'properties'}: ${ignoredKeys.join(', ')}.`);
      }
      return;
    }

    if (domain.kind !== 'custom') {
      warnings.push(`${path}.domain.kind is invalid or missing; the automatic data domain was used.`);
      return;
    }

    const min = Number(domain.min);
    const max = Number(domain.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
      warnings.push(`${path}.domain must have finite values with min less than max; the automatic data domain was used.`);
      return;
    }

    const convertedBounds = [domain.min, domain.max].filter(value => typeof value !== 'number').length;
    if (convertedBounds) {
      warnings.push(`${path}.domain had ${convertedBounds} ${convertedBounds === 1 ? 'bound' : 'bounds'} converted to numbers.`);
    }
    const ignoredKeys = Object.keys(domain).filter(key => key !== 'kind' && key !== 'min' && key !== 'max');
    if (ignoredKeys.length) {
      warnings.push(`${path}.domain ignored unsupported ${ignoredKeys.length === 1 ? 'property' : 'properties'}: ${ignoredKeys.join(', ')}.`);
    }
  });

  return warnings;
}

export function validateStyleFileSchema(style: unknown): StyleFileSchemaValidationResult {
  const schemaValid = validateAgainstSchema(style);
  const errors = new Set<string>();
  const warnings = new Set<string>();

  if (!schemaValid) {
    (validateAgainstSchema.errors || []).forEach(error => {
      if (error.instancePath === '/variableColorScales' || error.instancePath.startsWith('/variableColorScales/')) {
        // Domain and stop errors are summarized from the raw values below so
        // warnings describe the normalizer's actual repair rather than noisy
        // oneOf branch failures from JSON Schema.
        if (!error.instancePath.includes('/domain') && !error.instancePath.includes('/stops')) {
          warnings.add(formatScaleWarning(error));
        }
      } else {
        errors.add(formatFatalError(error));
      }
    });
  }

  if (style && typeof style === 'object' && !Array.isArray(style)) {
    collectStopNormalizationWarnings(style).forEach(warning => warnings.add(warning));
    collectDomainNormalizationWarnings(style).forEach(warning => warnings.add(warning));
  }

  return {
    valid: errors.size === 0,
    errors: Array.from(errors),
    warnings: Array.from(warnings)
  };
}
