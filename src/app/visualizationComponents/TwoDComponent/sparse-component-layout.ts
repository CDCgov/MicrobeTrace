export interface SparseComponentLayoutNode {
  id: string;
  x: number;
  y: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface SparseComponentLayoutLink {
  source: string | { id?: string; _id?: string };
  target: string | { id?: string; _id?: string };
}

export interface SparseComponentLayoutResult {
  applied: boolean;
  positions: Map<string, { x: number; y: number }>;
  components: number;
  connectedComponents: number;
  singletons: number;
  rows: number;
  targetWidth: number;
}

const endpointId = (endpoint: SparseComponentLayoutLink['source']): string => (
  typeof endpoint === 'object' && endpoint !== null
    ? String(endpoint.id ?? endpoint._id ?? '')
    : String(endpoint ?? '')
);

/**
 * Tiles graphs dominated by disconnected samples while preserving the force-directed
 * shape inside every linked component. This mirrors COSE's disconnected-component
 * tiling without making Sigma depend on Cytoscape.
 */
export function layoutSparseDisconnectedComponents(
  nodes: SparseComponentLayoutNode[],
  links: SparseComponentLayoutLink[],
  spacing: number,
  containerWidth: number,
  containerHeight: number,
): SparseComponentLayoutResult {
  const unchanged = (components = 0, connectedComponents = 0, singletons = 0): SparseComponentLayoutResult => ({
    applied: false,
    positions: new Map(),
    components,
    connectedComponents,
    singletons,
    rows: 0,
    targetWidth: 0,
  });
  if (nodes.length === 0 || links.length === 0) return unchanged();

  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const adjacentNodeIds = new Map(nodes.map(node => [node.id, new Set<string>()]));
  links.forEach(link => {
    const source = endpointId(link.source);
    const target = endpointId(link.target);
    if (!source || !target || source === target || !nodeById.has(source) || !nodeById.has(target)) return;
    adjacentNodeIds.get(source)!.add(target);
    adjacentNodeIds.get(target)!.add(source);
  });

  type Component = {
    key: string;
    nodes: SparseComponentLayoutNode[];
    minX: number;
    minY: number;
    width: number;
    height: number;
    linked: boolean;
  };
  const components: Component[] = [];
  const visited = new Set<string>();
  nodeById.forEach((_node, startId) => {
    if (visited.has(startId)) return;
    const members: SparseComponentLayoutNode[] = [];
    const pending = [startId];
    visited.add(startId);
    while (pending.length > 0) {
      const id = pending.pop()!;
      members.push(nodeById.get(id)!);
      adjacentNodeIds.get(id)!.forEach(neighbor => {
        if (visited.has(neighbor)) return;
        visited.add(neighbor);
        pending.push(neighbor);
      });
    }

    const bounds = members.reduce((result, node) => ({
      minX: Math.min(result.minX, node.minX),
      minY: Math.min(result.minY, node.minY),
      maxX: Math.max(result.maxX, node.maxX),
      maxY: Math.max(result.maxY, node.maxY),
    }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    components.push({
      key: startId,
      nodes: members,
      minX: bounds.minX,
      minY: bounds.minY,
      width: Math.max(spacing, bounds.maxX - bounds.minX),
      height: Math.max(spacing, bounds.maxY - bounds.minY),
      linked: members.length > 1,
    });
  });

  const singletons = components.filter(component => !component.linked).length;
  const connectedComponents = components.length - singletons;
  const singletonRatio = singletons / nodes.length;
  if (connectedComponents === 0 || components.length < 8 || singletons < 12 || singletonRatio < 0.5) {
    return unchanged(components.length, connectedComponents, singletons);
  }

  // Give every real cluster its own cell and distribute those cells through
  // the singleton field. This keeps clusters visible without relegating all of
  // them to one edge of the canvas. Stable keys make repeated layouts deterministic.
  const linkedComponents = components
    .filter(component => component.linked)
    .sort((left, right) => right.nodes.length - left.nodes.length || left.key.localeCompare(right.key));
  const singletonComponents = components
    .filter(component => !component.linked)
    .sort((left, right) => left.key.localeCompare(right.key));
  const orderedComponents = [...singletonComponents];
  linkedComponents.forEach((component, index) => {
    const insertionIndex = Math.round(
      ((index + 1) * (singletonComponents.length + linkedComponents.length))
      / (linkedComponents.length + 1),
    );
    orderedComponents.splice(Math.min(insertionIndex, orderedComponents.length), 0, component);
  });
  components.splice(0, components.length, ...orderedComponents);

  const gap = Math.max(8, spacing * 0.3);
  const viewportAspect = Math.max(0.75, Math.min(
    2.5,
    Number(containerWidth) > 0 && Number(containerHeight) > 0
      ? Number(containerWidth) / Number(containerHeight)
      : 16 / 9,
  ));
  const totalArea = components.reduce(
    (area, component) => area + (component.width + gap) * (component.height + gap),
    0,
  );
  const targetWidth = Math.max(
    ...components.map(component => component.width),
    Math.sqrt(totalArea * viewportAspect),
  );

  type Row = { items: Component[]; width: number; height: number };
  const rows: Row[] = [];
  let row: Row = { items: [], width: 0, height: 0 };
  components.forEach(component => {
    const nextWidth = row.width + (row.items.length > 0 ? gap : 0) + component.width;
    if (row.items.length > 0 && nextWidth > targetWidth) {
      rows.push(row);
      row = { items: [], width: 0, height: 0 };
    }
    row.width += (row.items.length > 0 ? gap : 0) + component.width;
    row.height = Math.max(row.height, component.height);
    row.items.push(component);
  });
  if (row.items.length > 0) rows.push(row);

  const positions = new Map<string, { x: number; y: number }>();
  let y = 0;
  rows.forEach(currentRow => {
    let x = 0;
    currentRow.items.forEach((component, index) => {
      if (index > 0) x += gap;
      const contentWidth = component.nodes.reduce(
        (width, node) => Math.max(width, node.maxX),
        -Infinity,
      ) - component.minX;
      const contentHeight = component.nodes.reduce(
        (height, node) => Math.max(height, node.maxY),
        -Infinity,
      ) - component.minY;
      const offsetX = x + (component.width - contentWidth) / 2 - component.minX;
      const offsetY = y + (currentRow.height - contentHeight) / 2 - component.minY;
      component.nodes.forEach(node => positions.set(node.id, {
        x: node.x + offsetX,
        y: node.y + offsetY,
      }));
      x += component.width;
    });
    y += currentRow.height + gap;
  });

  const laidOutNodes = nodes.map(node => ({ node, position: positions.get(node.id)! }));
  const minX = Math.min(...laidOutNodes.map(({ node, position }) => position.x + node.minX - node.x));
  const maxX = Math.max(...laidOutNodes.map(({ node, position }) => position.x + node.maxX - node.x));
  const minY = Math.min(...laidOutNodes.map(({ node, position }) => position.y + node.minY - node.y));
  const maxY = Math.max(...laidOutNodes.map(({ node, position }) => position.y + node.maxY - node.y));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  positions.forEach(position => {
    position.x -= centerX;
    position.y -= centerY;
  });

  return {
    applied: true,
    positions,
    components: components.length,
    connectedComponents,
    singletons,
    rows: rows.length,
    targetWidth,
  };
}
