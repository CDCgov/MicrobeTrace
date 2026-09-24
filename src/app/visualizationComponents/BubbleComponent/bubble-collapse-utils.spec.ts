import { getBubbleCollapseGroupKey, groupVisibleNodesByBubbleAxes } from './bubble-collapse-utils';

describe('Bubble collapse grouping', () => {
  it('keeps every visible cluster category when collapsed', () => {
    const nodes = [
      { id: 'sample-1', cluster: 0 },
      { id: 'sample-2', cluster: 1 },
      { id: 'sample-3', cluster: 2 },
      { id: 'sample-4', cluster: 3 },
      { id: 'sample-5', cluster: 3 }
    ];

    const groups = groupVisibleNodesByBubbleAxes(
      nodes,
      'cluster',
      'None',
      [0, 1, 2, 3],
      [undefined]
    );

    expect(groups.map(group => [group.Xgroup, group.nodes.length])).toEqual([
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 2]
    ]);
    expect(groups.reduce((total, group) => total + group.nodes.length, 0)).toBe(nodes.length);
  });

  it('groups by both axes and does not create off-canvas groups for stale categories', () => {
    const groups = groupVisibleNodesByBubbleAxes(
      [
        { cluster: 1, region: 'A' },
        { cluster: 1, region: 'B' },
        { cluster: 2, region: 'A' },
        { cluster: 3, region: 'missing' }
      ],
      'cluster',
      'region',
      [1, 2, 3],
      ['A', 'B']
    );

    expect(groups.map(group => getBubbleCollapseGroupKey(group.Xgroup, group.Ygroup))).toEqual([
      '0:0',
      '0:1',
      '1:0'
    ]);
  });
});
