import {
  applySigmaIconCanvasTransform,
  assignSigmaOverviewPositions,
  clipSigmaEdgeSegment,
  selectSigmaLayoutBackbone,
  SigmaNetworkRendererAdapter,
} from './sigma-network-renderer.adapter';

describe('Sigma network renderer adapter', () => {
  it('flips custom SVG paths upright while centering them on the Sigma canvas', () => {
    const context = {
      translate: jasmine.createSpy('translate'),
      scale: jasmine.createSpy('scale'),
    } as Pick<CanvasRenderingContext2D, 'translate' | 'scale'>;

    applySigmaIconCanvasTransform(context, { x: 120, y: 80 }, 0.5, {
      width: 300,
      height: 200,
    });

    expect(context.translate).toHaveBeenCalledWith(120, 80);
    expect(context.scale).toHaveBeenCalledOnceWith(0.5, -0.5);
    expect(context.translate).toHaveBeenCalledWith(-150, -100);
  });

  it('clips supplemental straight edges to node boundaries', () => {
    const horizontal = clipSigmaEdgeSegment(
      { x: 0, y: 0, radius: 10, shape: 'circle' },
      { x: 100, y: 0, radius: 20, shape: 'circle' },
    );
    const diagonalSquare = clipSigmaEdgeSegment(
      { x: 0, y: 0, radius: 10, shape: 'square' },
      { x: 100, y: 100, radius: 10, shape: 'square' },
    );
    const covered = clipSigmaEdgeSegment(
      { x: 0, y: 0, radius: 10, shape: 'circle' },
      { x: 15, y: 0, radius: 10, shape: 'circle' },
    );

    expect(horizontal).toEqual({
      source: { x: 10, y: 0 },
      target: { x: 80, y: 0 },
    });
    expect(diagonalSquare!.source.x).toBeCloseTo(10, 6);
    expect(diagonalSquare!.source.y).toBeCloseTo(10, 6);
    expect(diagonalSquare!.target.x).toBeCloseTo(90, 6);
    expect(diagonalSquare!.target.y).toBeCloseTo(90, 6);
    expect(covered).toBeNull();
  });

  it('keeps small graph layouts exact while returning safe link copies', () => {
    const links = [{ id: 'a-b', source: 'a', target: 'b', distance: 0.1 }];

    const backbone = selectSigmaLayoutBackbone(links, 2);

    expect(backbone).toEqual(links);
    expect(backbone[0]).not.toBe(links[0]);
  });

  it('uses a compact distance-ranked backbone for dense graph layout', () => {
    const links: Array<{ id: string; source: string; target: string; distance: number }> = [];
    for (let source = 0; source < 80; source++) {
      for (let target = source + 1; target < 80; target++) {
        links.push({
          id: `${source}-${target}`,
          source: String(source),
          target: String(target),
          distance: Math.abs(source - target),
        });
      }
    }

    const backbone = selectSigmaLayoutBackbone(links, 3);
    const representedNodes = new Set(backbone.flatMap(link => [link.source, link.target]));
    const backboneDegree = new Map<string, number>();
    backbone.forEach(link => {
      backboneDegree.set(link.source, (backboneDegree.get(link.source) || 0) + 1);
      backboneDegree.set(link.target, (backboneDegree.get(link.target) || 0) + 1);
    });

    expect(links.length).toBeGreaterThan(2500);
    expect(backbone.length).toBeLessThan(links.length / 10);
    expect(representedNodes.size).toBe(80);
    expect(Math.max(...Array.from(backboneDegree.values()))).toBeLessThanOrEqual(6);
    expect(backbone.some(link => link.id === '0-1')).toBeTrue();
    expect(links[0].source).toBe('0');
  });

  it('separates five dense distance cohorts without changing graph membership', () => {
    const nodes = Array.from({ length: 100 }, (_value, index) => ({ id: String(index) }));
    const links: Array<{ id: string; source: string; target: string; distance: number }> = [];
    for (let source = 0; source < nodes.length; source++) {
      for (let target = source + 1; target < nodes.length; target++) {
        const sameCohort = Math.floor(source / 20) === Math.floor(target / 20);
        links.push({
          id: `${source}-${target}`,
          source: String(source),
          target: String(target),
          distance: sameCohort ? 0.1 : 1,
        });
      }
    }

    const result = assignSigmaOverviewPositions(nodes, links);

    expect(result).toEqual({ applied: true, cohortCount: 5, method: 'distance-cohorts' });
    expect(nodes.every(node => Number.isFinite((node as any).x) && Number.isFinite((node as any).y))).toBeTrue();
    expect(new Set(nodes.map(node => (node as any)._sigmaLayoutGroup)).size).toBe(5);
    expect(new Set(nodes.map(node =>
      `${(node as any)._sigmaLayoutAnchorX}:${(node as any)._sigmaLayoutAnchorY}`)).size).toBe(5);
    const firstCohort = nodes.slice(0, 20);
    const firstAnchor = {
      x: (firstCohort[0] as any)._sigmaLayoutAnchorX,
      y: (firstCohort[0] as any)._sigmaLayoutAnchorY,
    };
    const organicRadii = new Set(firstCohort.map(node => Math.round(Math.hypot(
      Number((node as any).x) - firstAnchor.x,
      Number((node as any).y) - firstAnchor.y,
    ))));
    expect(organicRadii.size).toBeGreaterThan(8);
    expect(nodes.length).toBe(100);
    expect(links.length).toBe(4950);
  });

  it('scales dense overview spacing with the configured link length', () => {
    const createGraph = () => {
      const nodes = Array.from({ length: 80 }, (_value, index) => ({ id: String(index) }));
      const links: Array<{ id: string; source: string; target: string; distance: number }> = [];
      for (let source = 0; source < nodes.length; source++) {
        for (let target = source + 1; target < nodes.length; target++) {
          links.push({
            id: `${source}-${target}`,
            source: String(source),
            target: String(target),
            distance: Math.floor(source / 20) === Math.floor(target / 20) ? 0.1 : 1,
          });
        }
      }
      return { nodes, links };
    };
    const compact = createGraph();
    const expanded = createGraph();

    assignSigmaOverviewPositions(compact.nodes, compact.links, null, 50);
    assignSigmaOverviewPositions(expanded.nodes, expanded.links, null, 100);

    const radius = (nodes: Array<Record<string, any>>) => Math.max(...nodes.map(node => (
      Math.hypot(Number(node.x), Number(node.y))
    )));
    expect(radius(expanded.nodes)).toBeGreaterThan(radius(compact.nodes) * 1.8);
  });

  it('severs view callbacks and DOM references when destroyed', () => {
    const container = document.createElement('div');
    container.appendChild(document.createElement('canvas'));
    const owner = { selectedNodeIds: new Set(['node-1']) };
    const adapter = new SigmaNetworkRendererAdapter(container, '#ff2d55', {
      onNodeSelectionChange: selectedNodeIds => {
        owner.selectedNodeIds = new Set(selectedNodeIds);
      },
    });

    adapter.destroy();

    expect(container.childElementCount).toBe(0);
    expect((adapter as any).callbacks).toEqual({});
    expect((adapter as any).container).not.toBe(container);
    expect(adapter.getRenderer()).toBeNull();
    expect(adapter.getGraph().order).toBe(0);
    expect(adapter.getDisplayGraph().order).toBe(0);
  });

  it('does not republish an unchanged programmatic selection', () => {
    const container = document.createElement('div');
    let callbackCount = 0;
    const adapter = new SigmaNetworkRendererAdapter(container, '#ff2d55', {
      onNodeSelectionChange: () => callbackCount++,
    });
    (adapter.getGraph() as any).addNode('node-1', { selected: false });

    adapter.selectNodes(['node-1']);
    adapter.selectNodes(['node-1']);

    expect(adapter.getSelectedNodeIds()).toEqual(['node-1']);
    expect(callbackCount).toBe(1);
  });

  it('only projects a hovered neighborhood when neighbor highlighting is enabled', () => {
    const adapter = new SigmaNetworkRendererAdapter(document.createElement('div'), '#ff2d55');
    const graph = adapter.getGraph() as any;
    graph.addNode('a', {});
    graph.addNode('b', {});
    graph.addNode('c', {});
    graph.addEdgeWithKey('a-b', 'a', 'b', {});
    graph.addEdgeWithKey('b-c', 'b', 'c', {});
    (adapter as any).rankedEdges = [
      { id: 'a-b', sourceId: 'a', targetId: 'b', isBackbone: false },
      { id: 'b-c', sourceId: 'b', targetId: 'c', isBackbone: false },
    ];
    (adapter as any).incidentEdgeIdsByNode = new Map([
      ['a', ['a-b']],
      ['b', ['a-b', 'b-c']],
      ['c', ['b-c']],
    ]);
    (adapter as any).hoveredNodeId = 'a';
    (adapter as any).resolveViewportNodes = () => ({
      core: new Set(['a', 'b', 'c']),
      overscan: new Set(['a', 'b', 'c']),
    });
    (adapter as any).resolveDisplayEdgeBudget = () => 10;

    adapter.setNeighborHighlighting(false);
    expect(Array.from((adapter as any).selectDisplayEdgeIds()).sort()).toEqual(['a-b', 'b-c']);
    expect(Array.from((adapter as any).hoveredNeighborhood)).toEqual([]);

    adapter.setNeighborHighlighting(true);
    expect(Array.from((adapter as any).selectDisplayEdgeIds())).toEqual(['a-b']);
    expect(Array.from((adapter as any).hoveredNeighborhood).sort()).toEqual(['a', 'b']);
  });
});
