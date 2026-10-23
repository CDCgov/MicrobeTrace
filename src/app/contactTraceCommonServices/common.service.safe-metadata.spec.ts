import { CommonService } from './common.service';

function createService(): CommonService {
  const service = Object.create(CommonService.prototype) as CommonService;
  (service as any).session = {
    data: {
      links: [],
      nodeExclusions: [],
      nodes: []
    },
    style: {
      widgets: {
        'link-origin-array-order': []
      }
    }
  };
  (service as any).temp = {
    analysis: {
      patristicDistanceCache: {},
      storedDistanceCache: {},
      thresholdSweepCache: {},
      version: 0
    },
    matrix: {}
  };
  return service;
}

describe('CommonService prototype-sensitive metadata', () => {
  it('preserves prototype-sensitive node fields during insertion and duplicate-node merges', () => {
    const service = createService();
    const importedNode = JSON.parse(`{
      "_id": "node-a",
      "origin": ["nodes.json"],
      "__proto__": "node-proto-metadata",
      "constructor": "node-constructor-metadata",
      "prototype": "node-prototype-metadata"
    }`);

    expect(service.addNode(importedNode, true)).toBe(1);

    const duplicateNode = JSON.parse(`{
      "_id": "node-a",
      "origin": ["nodes-second.json"],
      "__proto__": "updated-node-proto-metadata",
      "constructor": "updated-node-constructor-metadata",
      "prototype": "updated-node-prototype-metadata"
    }`);

    expect(service.addNode(duplicateNode, true)).toBe(0);

    const node = service.session.data.nodes[0];
    expect(Object.getPrototypeOf(node)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(node, '__proto__')).toBeTrue();
    expect(node['__proto__']).toBe('updated-node-proto-metadata');
    expect(node['constructor']).toBe('updated-node-constructor-metadata');
    expect(node['prototype']).toBe('updated-node-prototype-metadata');
    expect(node.origin).toEqual(['nodes-second.json', 'nodes.json']);
  });

  it('preserves prototype-sensitive link fields during duplicate-link merges', () => {
    const service = createService();
    const baseLink = {
      source: 'node-a',
      target: 'node-b',
      origin: ['base.csv'],
      hasDistance: false
    };
    const importedLink = JSON.parse(`{
      "source": "node-a",
      "target": "node-b",
      "origin": ["links.json"],
      "hasDistance": false,
      "__proto__": { "polluted": true },
      "constructor": "link-constructor-metadata",
      "prototype": "link-prototype-metadata"
    }`);

    expect(service.addLink(baseLink, true)).toBe(1);
    expect(service.addLink(importedLink, true)).toBe(0);

    const link = service.session.data.links[0];
    expect(Object.getPrototypeOf(link)).toBe(Object.prototype);
    expect((Object.prototype as any).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(link, '__proto__')).toBeTrue();
    expect(link['__proto__']).toEqual({ polluted: true });
    expect(link['constructor']).toBe('link-constructor-metadata');
    expect(link['prototype']).toBe('link-prototype-metadata');
  });
});
