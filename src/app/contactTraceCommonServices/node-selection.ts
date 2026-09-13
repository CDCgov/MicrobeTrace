export function getNodeSelectionId(node: any): string | null {
  const id = node?._id ?? node?.id;
  return id === null || id === undefined ? null : String(id);
}

export function getSelectedNodeIds(nodes: any[] = []): Set<string> {
  return new Set(
    nodes
      .filter(node => node?.selected)
      .map(getNodeSelectionId)
      .filter((id): id is string => id !== null)
  );
}

/**
 * Synchronizes a view's selected node IDs to both shared node collections.
 * Returns true when at least one shared node's selection state changed.
 */
export function syncSelectedNodeIds(
  nodes: any[] = [],
  filteredNodes: any[] = [],
  selectedIds: ReadonlySet<string>,
): boolean {
  let selectionChanged = false;

  [nodes, filteredNodes].forEach(collection => {
    collection.forEach(node => {
      const id = getNodeSelectionId(node);
      const shouldBeSelected = id !== null && selectedIds.has(id);
      if (Boolean(node?.selected) !== shouldBeSelected) {
        node.selected = shouldBeSelected;
        selectionChanged = true;
      }
    });
  });

  return selectionChanged;
}

/**
 * Synchronizes shared node selection into a Cytoscape graph.
 *
 * Exact ID lookup is intentional: imported node IDs can contain characters
 * that have special meaning in Cytoscape selectors.
 */
export function syncCytoscapeNodeSelection(
  cy: any,
  nodes: any[] = [],
): string[] {
  if (!cy) return [];

  const selectedIds = getSelectedNodeIds(nodes);
  const renderedSelectedIds: string[] = [];

  cy.batch(() => {
    cy.elements().unselect();

    selectedIds.forEach(id => {
      const cyNode = cy.getElementById(id);
      if (!cyNode || cyNode.empty() || !cyNode.isNode()) return;

      cyNode.select();
      renderedSelectedIds.push(id);
    });
  });

  return renderedSelectedIds;
}

/**
 * Applies the single-select/additive-select behavior used by interactive views.
 */
export function applyNodeClickSelection(
  nodes: any[] = [],
  filteredNodes: any[] = [],
  clickedNodeId: string,
  additive: boolean,
): boolean {
  const selectedIds = additive ? getSelectedNodeIds(nodes) : new Set<string>();

  if (additive && selectedIds.has(clickedNodeId)) {
    selectedIds.delete(clickedNodeId);
  } else {
    selectedIds.add(clickedNodeId);
  }

  return syncSelectedNodeIds(nodes, filteredNodes, selectedIds);
}
