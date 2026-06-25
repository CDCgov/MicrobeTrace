import {
  applyNetworkSubsetVisibility,
  describeNetworkSubsetFilter,
  evaluateNetworkSubsetRule,
  normalizeNetworkSubsetFilterState,
} from './network-subset-filter';

describe('network subset filter', () => {
  it('leaves every record subset-visible when no filter is active', () => {
    const nodes: any[] = [{ _id: 'a' }];
    const links: any[] = [{ source: 'missing-a', target: 'missing-b' }];

    const result = applyNetworkSubsetVisibility(nodes, links, { node: null, link: null });

    expect(result.visibleNodes).toBe(1);
    expect(result.visibleLinks).toBe(1);
    expect(nodes[0]._subsetVisible).toBeTrue();
    expect(links[0]._subsetVisible).toBeTrue();
  });

  it('filters nodes and keeps only links between matching nodes', () => {
    const nodes: any[] = [
      { _id: 'a', state: 'Texas' },
      { _id: 'b', state: 'Texas' },
      { _id: 'c', state: 'Georgia' },
    ];
    const links: any[] = [
      { source: 'a', target: 'b', institution: 'CDC' },
      { source: 'a', target: 'c', institution: 'CDC' },
    ];

    const result = applyNetworkSubsetVisibility(nodes, links, {
      node: { target: 'node', field: 'state', operator: 'equals', value: 'texas' },
      link: null,
    });

    expect(result.visibleNodes).toBe(2);
    expect(result.visibleLinks).toBe(1);
    expect(nodes.map(node => node._subsetVisible)).toEqual([true, true, false]);
    expect(links.map(link => link._subsetVisible)).toEqual([true, false]);
  });

  it('filters links and keeps the nodes connected by matching links', () => {
    const nodes: any[] = [
      { _id: 'a' },
      { _id: 'b' },
      { _id: 'c' },
    ];
    const links: any[] = [
      { source: 'a', target: 'b', institution: 'CDC Atlanta' },
      { source: 'b', target: 'c', institution: 'State Lab' },
    ];

    const result = applyNetworkSubsetVisibility(nodes, links, {
      node: null,
      link: { target: 'link', field: 'institution', operator: 'contains', value: 'cdc' },
    });

    expect(result.visibleNodes).toBe(2);
    expect(result.visibleLinks).toBe(1);
    expect(nodes.map(node => node._subsetVisible)).toEqual([true, true, false]);
    expect(links.map(link => link._subsetVisible)).toEqual([true, false]);
  });

  it('supports numeric operators', () => {
    expect(evaluateNetworkSubsetRule(
      { distance: '0.012' },
      { target: 'link', field: 'distance', operator: 'less-than-or-equal', value: '0.015' }
    )).toBeTrue();
    expect(evaluateNetworkSubsetRule(
      { distance: '0.02' },
      { target: 'link', field: 'distance', operator: 'less-than', value: '0.015' }
    )).toBeFalse();
  });

  it('normalizes empty saved filters and describes active filters', () => {
    const state = normalizeNetworkSubsetFilterState({
      node: { target: 'node', field: 'state', operator: 'equals', value: 'Texas' },
      link: { target: 'link', field: 'institution', operator: 'contains', value: '' },
    });

    expect(state.link).toBeNull();
    expect(describeNetworkSubsetFilter(state, field => field.toUpperCase())).toBe('Node STATE equals Texas');
  });
});
