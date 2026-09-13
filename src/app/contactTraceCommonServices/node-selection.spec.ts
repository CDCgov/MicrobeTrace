import {
  applyNodeClickSelection,
  getSelectedNodeIds,
  syncCytoscapeNodeSelection,
  syncSelectedNodeIds,
} from './node-selection';
import cytoscape from 'cytoscape';

describe('node selection', () => {
  it('synchronizes selected IDs to the main and filtered node collections', () => {
    const nodes = [
      { _id: 'a', selected: true },
      { _id: 'b', selected: false },
    ];
    const filteredNodes = [
      { _id: 'a', selected: true },
      { _id: 'b', selected: false },
    ];

    expect(syncSelectedNodeIds(nodes, filteredNodes, new Set(['b']))).toBeTrue();
    expect(getSelectedNodeIds(nodes)).toEqual(new Set(['b']));
    expect(getSelectedNodeIds(filteredNodes)).toEqual(new Set(['b']));
    expect(syncSelectedNodeIds(nodes, filteredNodes, new Set(['b']))).toBeFalse();
  });

  it('supports single selection and additive toggling', () => {
    const nodes = [
      { _id: 'a', selected: true },
      { _id: 'b', selected: false },
      { _id: 'c', selected: false },
    ];
    const filteredNodes = nodes.map(node => ({ ...node }));

    applyNodeClickSelection(nodes, filteredNodes, 'b', false);
    expect(getSelectedNodeIds(nodes)).toEqual(new Set(['b']));

    applyNodeClickSelection(nodes, filteredNodes, 'c', true);
    expect(getSelectedNodeIds(nodes)).toEqual(new Set(['b', 'c']));

    applyNodeClickSelection(nodes, filteredNodes, 'b', true);
    expect(getSelectedNodeIds(nodes)).toEqual(new Set(['c']));
    expect(getSelectedNodeIds(filteredNodes)).toEqual(new Set(['c']));
  });

  it('restores rendered selection with exact IDs after Cytoscape creation', () => {
    const cy = cytoscape({
      headless: true,
      elements: [
        { data: { id: 'plain-id' } },
        { data: { id: 'sample:1/a.b' } },
      ],
    });
    cy.getElementById('plain-id').select();

    const renderedSelectedIds = syncCytoscapeNodeSelection(cy, [
      { _id: 'plain-id', selected: false },
      { _id: 'sample:1/a.b', selected: true },
      { _id: 'not-rendered', selected: true },
    ]);

    expect(renderedSelectedIds).toEqual(['sample:1/a.b']);
    expect(cy.getElementById('plain-id').selected()).toBeFalse();
    expect(cy.getElementById('sample:1/a.b').selected()).toBeTrue();
    expect(cy.nodes(':selected').map(node => node.id())).toEqual(['sample:1/a.b']);

    cy.destroy();
  });
});
