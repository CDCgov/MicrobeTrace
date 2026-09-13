export type SelectableTableType = 'node' | 'link' | 'cluster';

function normalizedId(value: any): string {
  return String(value ?? '');
}

/**
 * Applies a node or cluster table-row selection to the shared node records.
 *
 * Cluster IDs are normalized because imported session data can represent the
 * same ID as either a number or a string.
 */
export function applyTableRowSelectionToNodes(
  tableType: SelectableTableType,
  row: any,
  isSelected: boolean,
  nodes: any[] = [],
  filteredNodes: any[] = []
): boolean {
  if (!row || (tableType !== 'node' && tableType !== 'cluster')) {
    return false;
  }

  const matchesRow = tableType === 'node'
    ? (node: any) => node.index === row.index
    : (node: any) => normalizedId(node.cluster) === normalizedId(row.id);

  let matchedNode = false;
  [nodes, filteredNodes].forEach(nodeCollection => {
    nodeCollection.forEach(node => {
      if (!matchesRow(node)) return;

      node.selected = isSelected;
      matchedNode = true;
    });
  });

  return matchedNode;
}

/**
 * Returns clusters whose complete membership is selected.
 */
export function getFullySelectedClusterIds(nodes: any[] = []): Set<string> {
  const clusterSelection = new Map<string, { total: number; selected: number }>();

  nodes.forEach(node => {
    const clusterId = normalizedId(node.cluster);
    const counts = clusterSelection.get(clusterId) || { total: 0, selected: 0 };

    counts.total++;
    if (node.selected) {
      counts.selected++;
    }

    clusterSelection.set(clusterId, counts);
  });

  return new Set(
    Array.from(clusterSelection.entries())
      .filter(([, counts]) => counts.total > 0 && counts.selected === counts.total)
      .map(([clusterId]) => clusterId)
  );
}
