export interface ClusterSizeLayoutNode {
  id: string;
  x: number;
  y: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  count: number;
}

export interface ClusterSizeLayoutLink {
  source: string;
  target: string;
}

/** Packs connected components without changing the positions within a component.
 * Coordinates use a downward-positive Y axis; renderers adapt their coordinates
 * at the boundary so row order is the same on screen.
 */
export function layoutClustersBySize(
  nodes: ClusterSizeLayoutNode[],
  links: ClusterSizeLayoutLink[],
  spacing: number,
  containerWidth: number,
) {
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const adjacentNodeIds = new Map(nodes.map(node => [node.id, new Set<string>()]));
  links.forEach(({ source, target }) => {
    if (source === target || !nodeById.has(source) || !nodeById.has(target)) return;
    adjacentNodeIds.get(source)!.add(target);
    adjacentNodeIds.get(target)!.add(source);
  });

  type Component = {
    key: string;
    nodes: ClusterSizeLayoutNode[];
    size: number;
    minX: number;
    minY: number;
    width: number;
    height: number;
  };
  const components: Component[] = [];
  const visited = new Set<string>();
  Array.from(nodeById.keys()).sort().forEach(startId => {
    if (visited.has(startId)) return;
    const members: ClusterSizeLayoutNode[] = [];
    const pending = [startId];
    visited.add(startId);
    while (pending.length) {
      const id = pending.pop()!;
      members.push(nodeById.get(id)!);
      adjacentNodeIds.get(id)!.forEach(neighbor => {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          pending.push(neighbor);
        }
      });
    }
    const bounds = members.reduce((result, node) => ({
      minX: Math.min(result.minX, node.minX),
      minY: Math.min(result.minY, node.minY),
      maxX: Math.max(result.maxX, node.maxX),
      maxY: Math.max(result.maxY, node.maxY),
      size: result.size + node.count,
    }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, size: 0 });
    components.push({
      key: startId,
      nodes: members,
      size: bounds.size,
      minX: bounds.minX,
      minY: bounds.minY,
      width: Math.max(spacing, bounds.maxX - bounds.minX),
      height: Math.max(spacing, bounds.maxY - bounds.minY),
    });
  });
  components.sort((left, right) => left.size - right.size || left.key.localeCompare(right.key));

  const columnGap = spacing * 1.25;
  const bandGap = spacing * 2;
  const rowGap = spacing * 1.5;
  const targetWidth = components.reduce(
    (width, component) => Math.max(width, component.width),
    (Math.max(1, containerWidth) - 60) / 0.75,
  );
  const gap = (left: Component, right: Component) => left.size === right.size ? columnGap : bandGap;
  type Row = { items: Component[]; width: number; height: number };
  const rows: Row[] = [];
  let row: Row = { items: [], width: 0, height: 0 };
  components.forEach(component => {
    const previous = row.items[row.items.length - 1];
    const nextWidth = row.width + (previous ? gap(previous, component) : 0) + component.width;
    if (row.items.length && nextWidth > targetWidth) {
      rows.push(row);
      row = { items: [], width: 0, height: 0 };
    }
    const rowPrevious = row.items[row.items.length - 1];
    row.width += (rowPrevious ? gap(rowPrevious, component) : 0) + component.width;
    row.height = Math.max(row.height, component.height);
    row.items.push(component);
  });
  if (row.items.length) rows.push(row);

  const positions = new Map<string, { x: number; y: number }>();
  let y = 0;
  rows.forEach(row => {
    let x = 0;
    row.items.forEach((component, index) => {
      if (index) x += gap(row.items[index - 1], component);
      const offsetX = x - component.minX;
      const offsetY = y + (row.height - component.height) / 2 - component.minY;
      component.nodes.forEach(node => positions.set(node.id, {
        x: node.x + offsetX,
        y: node.y + offsetY,
      }));
      x += component.width;
    });
    y += row.height + rowGap;
  });
  return {
    positions,
    clusters: components.length,
    rows: rows.length,
    targetWidth,
    clusterSizes: Array.from(new Set(components.map(component => component.size))),
  };
}
