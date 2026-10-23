import {
  assignEnumerableOwnProperties,
  assignPrototypeSensitiveOwnProperties,
  withoutPrototypeSensitiveOwnProperties
} from './safe-object-properties';

describe('safe object property helpers', () => {
  it('copies prototype-sensitive metadata as ordinary own properties', () => {
    const source = JSON.parse(`{
      "__proto__": { "polluted": true },
      "constructor": "metadata-constructor",
      "prototype": "metadata-prototype",
      "safe": "metadata-safe"
    }`);
    const target: Record<string, any> = {};

    assignEnumerableOwnProperties(target, source);

    expect(Object.getPrototypeOf(target)).toBe(Object.prototype);
    expect((Object.prototype as any).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(target, '__proto__')).toBeTrue();
    expect(target['__proto__']).toEqual({ polluted: true });
    expect(target['constructor']).toBe('metadata-constructor');
    expect(target['prototype']).toBe('metadata-prototype');
    expect(target['safe']).toBe('metadata-safe');
    expect(Object.keys(target)).toEqual(['__proto__', 'constructor', 'prototype', 'safe']);
  });

  it('separates prototype-sensitive properties from deep-merge input', () => {
    const source = JSON.parse(`{
      "__proto__": "metadata-proto",
      "constructor": { "prototype": { "polluted": true } },
      "prototype": "metadata-prototype",
      "safe": { "value": 1 }
    }`);
    const mergeable = withoutPrototypeSensitiveOwnProperties(source);
    const target: Record<string, any> = {};

    expect(Object.keys(mergeable)).toEqual(['safe']);

    assignPrototypeSensitiveOwnProperties(target, source);

    expect(Object.getPrototypeOf(target)).toBe(Object.prototype);
    expect((Object.prototype as any).polluted).toBeUndefined();
    expect(target['__proto__']).toBe('metadata-proto');
    expect(target['constructor']).toEqual({ prototype: { polluted: true } });
    expect(target['prototype']).toBe('metadata-prototype');
  });
});
