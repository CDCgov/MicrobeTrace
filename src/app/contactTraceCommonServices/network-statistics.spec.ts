import {
  buildNetworkStatisticsExportSections,
  computeNetworkStatistics,
  serializeNetworkStatisticsCsv,
} from './network-statistics';

describe('computeNetworkStatistics', () => {
  it('computes a fully clustered triangle', () => {
    const result = computeNetworkStatistics({
      nodes: [{ _id: 'A' }, { _id: 'B' }, { _id: 'C' }],
      links: [
        { source: 'A', target: 'B', visible: true },
        { source: 'A', target: 'C', visible: true },
        { source: 'B', target: 'C', visible: true },
      ],
    });

    expect(result.summary.nodeCount).toBe(3);
    expect(result.summary.linkCount).toBe(3);
    expect(result.summary.componentCount).toBe(1);
    expect(result.summary.clusterCount).toBe(1);
    expect(result.summary.averageLocalClusteringCoefficient).toBe(1);
    expect(result.summary.transitivity).toBe(1);
    expect(result.centrality.every((row) => row.degree === 2)).toBeTrue();
  });

  it('ranks the center of a path highest by betweenness', () => {
    const result = computeNetworkStatistics({
      nodes: [{ _id: 'A' }, { _id: 'B' }, { _id: 'C' }],
      links: [
        { source: 'A', target: 'B', visible: true },
        { source: 'B', target: 'C', visible: true },
      ],
    });

    expect(result.centrality[0].nodeId).toBe('B');
    expect(result.centrality[0].degree).toBe(2);
    expect(result.centrality[0].betweenness).toBeGreaterThan(0);
    expect(result.summary.diameter).toBe(2);
  });

  it('ranks the center of a star highest by degree and betweenness', () => {
    const result = computeNetworkStatistics({
      nodes: [{ _id: 'S' }, { _id: 'A' }, { _id: 'B' }, { _id: 'C' }],
      links: [
        { source: 'S', target: 'A', visible: true },
        { source: 'S', target: 'B', visible: true },
        { source: 'S', target: 'C', visible: true },
      ],
    });

    expect(result.centrality[0].nodeId).toBe('S');
    expect(result.centrality[0].degree).toBe(3);
    expect(result.centrality[0].betweenness).toBeGreaterThan(result.centrality[1].betweenness);
  });

  it('handles disconnected components and singletons', () => {
    const result = computeNetworkStatistics({
      nodes: [{ _id: 'A' }, { _id: 'B' }, { _id: 'C' }, { _id: 'D' }],
      links: [
        { source: 'A', target: 'B', visible: true },
      ],
    });

    expect(result.summary.componentCount).toBe(3);
    expect(result.summary.clusterCount).toBe(1);
    expect(result.summary.singletonCount).toBe(2);
    expect(result.summary.averagePathLength).toBe(1);
    expect(result.components.find((component) => component.nodeCount === 1)?.diameter).toBe(0);
  });

  it('recomputes from filtered visible links only', () => {
    const result = computeNetworkStatistics({
      nodes: [{ _id: 'A' }, { _id: 'B' }, { _id: 'C' }],
      links: [
        { source: 'A', target: 'B', visible: true },
        { source: 'B', target: 'C', visible: false },
      ],
    });

    expect(result.summary.linkCount).toBe(1);
    expect(result.summary.componentCount).toBe(2);
    expect(result.centrality.find((row) => row.nodeId === 'C')?.degree).toBe(0);
  });

  it('marks sampled metrics approximate when configured above cap', () => {
    const nodes = Array.from({ length: 6 }, (_, index) => ({ _id: `N${index}` }));
    const links = nodes.slice(1).map((node, index) => ({
      source: nodes[index]._id,
      target: node._id,
      visible: true,
    }));

    const result = computeNetworkStatistics({
      nodes,
      links,
      approximation: {
        exactNodeLimit: 3,
        exactLinkLimit: 3,
        sampleSize: 2,
      },
    });

    expect(result.summary.approximateBetweenness).toBeTrue();
    expect(result.summary.approximatePathMetrics).toBeTrue();
    expect(result.summary.sampledSourceCount).toBe(2);
  });

  it('serializes network statistics as human-readable CSV sections', () => {
    const result = computeNetworkStatistics({
      nodes: [{ _id: 'A' }, { _id: 'B' }, { _id: 'C' }],
      links: [
        { source: 'A', target: 'B', visible: true },
      ],
    });

    const csv = serializeNetworkStatisticsCsv(result);

    expect(csv).toContain('Network Statistics Summary\r\nMetric,Value');
    expect(csv).toContain('Clusters,1');
    expect(csv).toContain('Singletons,1');
    expect(csv).toContain('Degree Distribution\r\nDegree,Node Count,Fraction');
    expect(csv).toContain('Node Centrality\r\nNode ID,Cluster ID,Degree,Normalized Degree,Betweenness,Normalized Betweenness');
    expect(csv).toContain('Clusters\r\nCluster ID,Node Count,Link Count,Density,Average Degree,Max Degree,Diameter,Diameter Approximate,Member IDs');
    expect(csv).not.toContain('record_type');
    expect(csv).not.toContain('component_id');
  });

  it('builds separate export sections for workbook sheets', () => {
    const result = computeNetworkStatistics({
      nodes: [{ _id: 'A' }, { _id: 'B' }, { _id: 'C' }],
      links: [
        { source: 'A', target: 'B', visible: true },
      ],
    });

    const sections = buildNetworkStatisticsExportSections(result);

    expect(sections.map((section) => section.sheetName)).toEqual([
      'Summary',
      'Degree Distribution',
      'Node Centrality',
      'Clusters',
    ]);
    expect(sections[0].rows[0]).toEqual(['Metric', 'Value']);
    expect(sections[0].rows).toContain(['Nodes', 3]);
    expect(sections[1].rows[0]).toEqual(['Degree', 'Node Count', 'Fraction']);
    expect(sections[2].rows[0]).toEqual([
      'Node ID',
      'Cluster ID',
      'Degree',
      'Normalized Degree',
      'Betweenness',
      'Normalized Betweenness',
    ]);
    expect(sections[3].rows[0]).toEqual([
      'Cluster ID',
      'Node Count',
      'Link Count',
      'Density',
      'Average Degree',
      'Max Degree',
      'Diameter',
      'Diameter Approximate',
      'Member IDs',
    ]);
  });
});
