/// <reference types="cypress" />

export type TwoDRendererMode = 'sigma' | 'cytoscape-canvas';

export interface TwoDRendererCase {
  label: string;
  mode: TwoDRendererMode;
}

export interface TwoDNodeSnapshot {
  id: string;
  raw: any;
  label: string;
  diameter: number;
  borderWidth: number;
  color: string;
  opacity: number;
  shapeKey: string;
  selected: boolean;
  x: number;
  y: number;
}

export interface TwoDEdgeSnapshot {
  id: string;
  raw: any;
  source: string;
  target: string;
  label: string;
  width: number;
  opacity: number;
  color: string;
  head: 'arrow' | 'none';
  tail: 'arrow' | 'none';
}

export interface TwoDGroupSnapshot {
  key: string;
  nodeIds: string[];
  color: string;
  opacity: number;
}

export const TWO_D_RENDERER_CASES: TwoDRendererCase[] = [
  { label: 'Sigma production renderer', mode: 'sigma' },
  { label: 'Cytoscape Canvas fallback', mode: 'cytoscape-canvas' },
];

const numberFromStyle = (value: unknown, fallback = 0): number => {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getTwoD = (win: any): any => {
  const twoD = win.commonService?.visuals?.twoD;
  expect(twoD, '2D component').to.exist;
  return twoD;
};

export const rendererVisitOptions = (mode: TwoDRendererMode) => ({
  extraQuery: { renderer: mode },
});

export function getActiveTwoDRendererMode(win: any): TwoDRendererMode {
  return getTwoD(win).sigmaActive ? 'sigma' : 'cytoscape-canvas';
}

export function refreshTwoDRendererData(win: any): Promise<void> {
  return getTwoD(win)._partialUpdate();
}

export function assertTwoDRendererReady(mode: TwoDRendererMode, timeout = 60000): void {
  const selector = mode === 'sigma' ? '[data-testid="sigma-network"]' : '#cy';
  cy.get(selector, { timeout }).should('be.visible');
  cy.window({ timeout }).should((win: any) => {
    const twoD = getTwoD(win);
    expect(getActiveTwoDRendererMode(win), 'active renderer').to.equal(mode);
    expect(twoD.isRendererReady(), 'renderer ready').to.equal(true);

    if (mode === 'sigma') {
      expect(twoD.sigmaRenderer, 'Sigma adapter').to.exist;
      expect(twoD.cy, 'no Cytoscape allocation on Sigma path').not.to.exist;
    } else {
      expect(twoD.cy, 'Cytoscape instance').to.exist;
      expect(twoD.sigmaRenderer, 'no Sigma allocation on fallback path').not.to.exist;
    }
  });
}

export function getTwoDNodeSnapshots(win: any): TwoDNodeSnapshot[] {
  const twoD = getTwoD(win);
  if (twoD.sigmaActive) {
    const graph = twoD.sigmaRenderer.getGraph();
    return graph.nodes().map((nodeId: string) => {
      const attributes = graph.getNodeAttributes(nodeId);
      const raw = attributes.raw?.raw ?? attributes.raw ?? {};
      return {
        id: String(nodeId),
        raw,
        label: String(attributes.label ?? ''),
        diameter: Number(attributes.size) * 2,
        borderWidth: Number(attributes.borderWidth) || 0,
        color: String(attributes.color ?? ''),
        opacity: Number(attributes.opacity),
        shapeKey: String(attributes.shapeKey ?? attributes.shape ?? ''),
        selected: attributes.selected === true,
        x: Number(attributes.x),
        y: Number(attributes.y),
      };
    });
  }

  return twoD.cy.nodes(':visible')
    .filter((node: any) => !node.hasClass('parent') && node.children().length === 0)
    .map((node: any) => {
      const data = node.data();
      const position = node.position();
      return {
        id: String(node.id()),
        raw: data,
        label: String(data.label ?? ''),
        diameter: numberFromStyle(node.style('width')),
        borderWidth: numberFromStyle(node.style('border-width')),
        color: String(data.nodeColor ?? node.style('background-color') ?? ''),
        opacity: numberFromStyle(data.bgOpacity ?? node.style('background-opacity'), 1),
        shapeKey: String(data.shapeKey ?? data.shape ?? node.style('shape') ?? ''),
        selected: node.selected(),
        x: Number(position.x),
        y: Number(position.y),
      };
    });
}

export function getTwoDEdgeSnapshots(win: any): TwoDEdgeSnapshot[] {
  const twoD = getTwoD(win);
  if (twoD.sigmaActive) {
    const graph = twoD.sigmaRenderer.getGraph();
    return graph.edges().map((edgeId: string) => {
      const attributes = graph.getEdgeAttributes(edgeId);
      const [source, target] = graph.extremities(edgeId);
      const raw = attributes.raw?.raw ?? attributes.raw ?? {};
      return {
        id: String(edgeId),
        raw,
        source: String(source),
        target: String(target),
        label: String(attributes.label ?? ''),
        width: Number(attributes.size),
        opacity: Number(attributes.opacity),
        color: String(attributes.color ?? ''),
        head: attributes.head === 'arrow' ? 'arrow' : 'none',
        tail: attributes.tail === 'arrow' ? 'arrow' : 'none',
      };
    });
  }

  return twoD.cy.edges(':visible').map((edge: any) => {
    const data = edge.data();
    return {
      id: String(edge.id()),
      raw: data,
      source: String(edge.source().id()),
      target: String(edge.target().id()),
      label: String(data.label ?? ''),
      width: numberFromStyle(edge.style('width')),
      opacity: numberFromStyle(data.lineOpacity ?? edge.style('line-opacity'), 1),
      color: String(data.lineColor ?? edge.style('line-color') ?? ''),
      head: edge.style('target-arrow-shape') === 'triangle' ? 'arrow' : 'none',
      tail: edge.style('source-arrow-shape') === 'triangle' ? 'arrow' : 'none',
    };
  });
}

export function getTwoDGroupSnapshots(win: any): TwoDGroupSnapshot[] {
  const twoD = getTwoD(win);
  if (twoD.sigmaActive) {
    return ((twoD.sigmaRenderer as any).groupHulls || []).map((group: any) => ({
      key: String(group.label),
      nodeIds: [...group.nodeIds].map(String).sort(),
      color: String(group.color ?? ''),
      opacity: Number(group.opacity),
    }));
  }

  return twoD.cy.nodes('.parent:visible').map((parent: any) => ({
    key: String(parent.data('label') ?? parent.id().replace(/^group-/, '')),
    nodeIds: parent.children().map((node: any) => String(node.id())).sort(),
    color: String(parent.data('nodeColor') ?? parent.style('background-color') ?? ''),
    opacity: numberFromStyle(parent.data('bgOpacity') ?? parent.style('background-opacity'), 1),
  }));
}

export function selectTwoDNodesFromExternalView(win: any, nodeIds: string[]): void {
  const selectedIds = new Set(nodeIds.map(String));
  for (const collection of [
    win.commonService.session.data.nodes,
    win.commonService.session.data.nodeFilteredValues,
  ]) {
    (collection || []).forEach((node: any) => {
      node.selected = selectedIds.has(String(node._id ?? node.id));
    });
  }
  win.document.dispatchEvent(new win.Event('node-selected'));
}

export function getSelectedTwoDNodeIds(win: any): string[] {
  const twoD = getTwoD(win);
  return twoD.sigmaActive
    ? twoD.sigmaRenderer.getSelectedNodeIds().map(String).sort()
    : twoD.cy.nodes(':selected').map((node: any) => String(node.id())).sort();
}

export function hoverTwoDNode(win: any, nodeId: string, show: boolean): void {
  const twoD = getTwoD(win);
  if (twoD.sigmaActive) {
    (twoD.sigmaRenderer as any).handleNodeHover(
      show ? String(nodeId) : null,
      new win.MouseEvent(show ? 'mousemove' : 'mouseout', { clientX: 120, clientY: 120 }),
    );
    return;
  }
  win.Cypress.test.hoverNode(show ? 'show' : 'hide', String(nodeId));
}

export function getHighlightedIncidentEdgeCount(win: any, nodeId: string): number {
  const twoD = getTwoD(win);
  if (twoD.sigmaActive) {
    const adapter = twoD.sigmaRenderer as any;
    const graph = adapter.getDisplayGraph();
    const renderer = adapter.getRenderer();
    return graph.edges(String(nodeId)).filter((edgeId: string) => (
      renderer.getEdgeDisplayData(edgeId)?.color === adapter.selectedColor
    )).length;
  }
  return twoD.cy.getElementById(String(nodeId)).connectedEdges('.highlighted').length;
}

export function dragTwoDNodeBy(win: any, nodeId: string, dx: number, dy: number): { x: number; y: number } {
  const twoD = getTwoD(win);
  if (!twoD.sigmaActive) {
    return win.Cypress.test.dragNodeDelta(String(nodeId), dx, dy);
  }

  const adapter = twoD.sigmaRenderer as any;
  const renderer = adapter.getRenderer();
  const attributes = adapter.getGraph().getNodeAttributes(String(nodeId));
  const start = renderer.graphToViewport({ x: Number(attributes.x), y: Number(attributes.y) });
  const event = (x: number, y: number) => ({
    node: String(nodeId),
    draggedNode: String(nodeId),
    allDraggedNodes: [String(nodeId)],
    event: { x, y },
  });
  renderer.emit('nodeDragStart', event(start.x, start.y));
  renderer.emit('nodeDrag', event(start.x + dx, start.y + dy));
  renderer.emit('nodeDragEnd', event(start.x + dx, start.y + dy));
  const updated = adapter.getGraph().getNodeAttributes(String(nodeId));
  return { x: Number(updated.x), y: Number(updated.y) };
}

export function openTwoDNodeContextMenu(win: any, nodeId: string): void {
  const twoD = getTwoD(win);
  const original = new win.MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: 160,
    clientY: 120,
  });

  if (twoD.sigmaActive) {
    (twoD.sigmaRenderer as any).getRenderer().emit('rightClickNode', {
      node: String(nodeId),
      event: { original },
      preventSigmaDefault: () => undefined,
    });
    return;
  }

  const node = twoD.cy.getElementById(String(nodeId));
  node.emit('cxttap', {
    target: node,
    originalEvent: original,
  });
}
