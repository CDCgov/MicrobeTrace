export const PROTOTYPE_SENSITIVE_PROPERTY_NAMES = new Set([
  '__proto__',
  'constructor',
  'prototype'
]);

export function defineEnumerableOwnProperty(
  target: object,
  propertyName: PropertyKey,
  value: any
): void {
  Object.defineProperty(target, propertyName, {
    configurable: true,
    enumerable: true,
    value,
    writable: true
  });
}

export function assignEnumerableOwnProperties<T extends object>(
  target: T,
  ...sources: any[]
): T {
  sources.forEach(source => {
    if (source === undefined || source === null) {
      return;
    }

    Object.keys(Object(source)).forEach(propertyName => {
      defineEnumerableOwnProperty(target, propertyName, source[propertyName]);
    });
  });

  return target;
}

export function withoutPrototypeSensitiveOwnProperties(source: any): Record<string, any> {
  const result = Object.create(null);

  Object.keys(source || {}).forEach(propertyName => {
    if (!PROTOTYPE_SENSITIVE_PROPERTY_NAMES.has(propertyName)) {
      defineEnumerableOwnProperty(result, propertyName, source[propertyName]);
    }
  });

  return result;
}

export function assignPrototypeSensitiveOwnProperties<T extends object>(target: T, source: any): T {
  Object.keys(source || {}).forEach(propertyName => {
    if (PROTOTYPE_SENSITIVE_PROPERTY_NAMES.has(propertyName)) {
      defineEnumerableOwnProperty(target, propertyName, source[propertyName]);
    }
  });

  return target;
}
