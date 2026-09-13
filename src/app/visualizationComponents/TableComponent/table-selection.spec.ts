import {
  applyTableRowSelectionToNodes,
  getFullySelectedClusterIds
} from './table-selection';

describe('table selection', () => {
  it('selects every node in a cluster without changing other clusters', () => {
    const nodes = [
      { index: 0, cluster: 1, selected: false },
      { index: 1, cluster: 1, selected: false },
      { index: 2, cluster: 2, selected: true }
    ];
    const filteredNodes = nodes.map(node => ({ ...node }));

    const matched = applyTableRowSelectionToNodes(
      'cluster',
      { id: '1' },
      true,
      nodes,
      filteredNodes
    );

    expect(matched).toBeTrue();
    expect(nodes.map(node => node.selected)).toEqual([true, true, true]);
    expect(filteredNodes.map(node => node.selected)).toEqual([true, true, true]);
  });

  it('unselects only the nodes in the chosen cluster', () => {
    const nodes = [
      { index: 0, cluster: 1, selected: true },
      { index: 1, cluster: 1, selected: true },
      { index: 2, cluster: 2, selected: true }
    ];

    applyTableRowSelectionToNodes('cluster', { id: 1 }, false, nodes);

    expect(nodes.map(node => node.selected)).toEqual([false, false, true]);
  });

  it('preserves node-row selection behavior', () => {
    const nodes = [
      { index: 0, cluster: 1, selected: false },
      { index: 1, cluster: 1, selected: false }
    ];

    applyTableRowSelectionToNodes('node', { index: 1 }, true, nodes);

    expect(nodes.map(node => node.selected)).toEqual([false, true]);
  });

  it('identifies only clusters whose complete membership is selected', () => {
    const selectedClusterIds = getFullySelectedClusterIds([
      { cluster: 0, selected: true },
      { cluster: 0, selected: true },
      { cluster: 1, selected: true },
      { cluster: 1, selected: false },
      { cluster: '2', selected: true }
    ]);

    expect(Array.from(selectedClusterIds)).toEqual(['0', '2']);
  });
});
