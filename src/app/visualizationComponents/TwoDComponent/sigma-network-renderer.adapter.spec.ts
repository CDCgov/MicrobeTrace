import { assignSigmaOverviewPositions, selectSigmaLayoutBackbone } from './sigma-network-renderer.adapter';

describe('Sigma network renderer adapter', () => {
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

    expect(links.length).toBeGreaterThan(2500);
    expect(backbone.length).toBeLessThan(links.length / 10);
    expect(representedNodes.size).toBe(80);
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
    expect(nodes.length).toBe(100);
    expect(links.length).toBe(4950);
  });
});
