import {
  CommonService,
  NetworkSubsetFilterRule,
  NetworkSubsetFilterState,
} from './common.service';

describe('CommonService network subset filtering', () => {
  const nodes = [
    { _id: 'A', profession: 'Healthcare', type: 'Person' },
    { _id: 'B', profession: 'Education', type: 'Person' },
    { _id: 'C', profession: 'Healthcare', type: 'Person' },
    { _id: 'D', profession: 'Education', type: 'Place' },
  ];

  const links = [
    { id: 'A-B', source: 'A', target: 'B', contactType: 'classroom' },
    { id: 'A-C', source: 'A', target: 'C', contactType: 'sports team' },
    { id: 'B-D', source: 'B', target: 'D', contactType: 'classroom' },
    { id: 'C-D', source: 'C', target: 'D', contactType: 'sports team' },
  ];

  const createService = (networkSubsetFilter: NetworkSubsetFilterState): any => {
    const service = Object.create(CommonService.prototype) as any;
    service.session = {
      state: { networkSubsetFilter },
      data: { nodes, links },
    };
    return service;
  };

  const activeRule = (field: string, value: string): NetworkSubsetFilterRule => ({
    enabled: true,
    field,
    operator: 'equals',
    value,
  });

  it('intersects node and link rules, including only endpoints of matching links', () => {
    const service = createService({
      node: activeRule('type', 'Person'),
      link: activeRule('contactType', 'classroom'),
    });

    const result = service.resolveNetworkSubsetFilter();

    expect(Array.from(result.visibleNodeIds).sort()).toEqual(['A', 'B']);
    expect(Array.from(result.visibleLinkKeys).sort()).toEqual(['A-B']);
  });

  it('keeps all node matches and links between them for a node-only rule', () => {
    const service = createService({
      node: activeRule('type', 'Person'),
    });

    const result = service.resolveNetworkSubsetFilter();

    expect(Array.from(result.visibleNodeIds).sort()).toEqual(['A', 'B', 'C']);
    expect(Array.from(result.visibleLinkKeys).sort()).toEqual(['A-B', 'A-C']);
  });

  it('keeps matching links and their incident nodes for a link-only rule', () => {
    const service = createService({
      link: activeRule('contactType', 'classroom'),
    });

    const result = service.resolveNetworkSubsetFilter();

    expect(Array.from(result.visibleNodeIds).sort()).toEqual(['A', 'B', 'D']);
    expect(Array.from(result.visibleLinkKeys).sort()).toEqual(['A-B', 'B-D']);
  });

  it('resolves node ids from object-shaped link endpoints', () => {
    const service = createService({
      link: activeRule('contactType', 'classroom'),
    });
    service.session.data.links = [{
      id: 'object-link',
      source: { _id: 'A' },
      target: { data: { id: 'B' } },
      contactType: 'classroom',
    }];

    const result = service.resolveNetworkSubsetFilter();

    expect(Array.from(result.visibleNodeIds).sort()).toEqual(['A', 'B']);
    expect(Array.from(result.visibleLinkKeys)).toEqual(['object-link']);
  });

  it('does not coerce missing or blank values to zero for numeric rules', () => {
    const service = createService({});

    expect(service.networkSubsetValueMatches(undefined, 'lt', '1')).toBeFalse();
    expect(service.networkSubsetValueMatches(null, 'lt', '1')).toBeFalse();
    expect(service.networkSubsetValueMatches('', 'lt', '1')).toBeFalse();
    expect(service.networkSubsetValueMatches('   ', 'lt', '1')).toBeFalse();
    expect(service.networkSubsetValueMatches('0', 'lt', '1')).toBeTrue();
  });

  it('reads link origins from the canonical origin collection', () => {
    const service = createService({});
    const link = {
      origin: ['threshold-visible-origin'],
      _originAll: ['uploaded-links.csv', 'computed-distance'],
    };

    expect(service.getNetworkSubsetFieldValue(link, 'link', 'origin')).toEqual([
      'uploaded-links.csv',
      'computed-distance',
    ]);
  });

  it('disables persisted rules that target derived visibility fields', () => {
    const service = createService({
      node: activeRule('visible', 'true'),
      link: activeRule('nn', 'true'),
    });

    const normalized = service.ensureNetworkSubsetFilterState();
    const disabledRule = {
      enabled: false,
      field: 'None',
      operator: 'equals',
      value: '',
    };

    expect(normalized).toEqual({
      node: disabledRule,
      link: disabledRule,
    });
    expect(service.session.state.networkSubsetFilter).toEqual(normalized);
  });
});
