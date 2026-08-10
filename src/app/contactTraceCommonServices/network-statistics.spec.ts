import {
  buildNetworkStatisticsExportSections,
  computeNetworkStatistics,
  NetworkStatisticsProgress,
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

  it('keeps the default approximation thresholds exclusive and applies either trigger', () => {
    const nodesAtLimit = Array.from({ length: 2000 }, (_, index) => ({ _id: `N${index}` }));
    const nodesAboveLimit = [...nodesAtLimit, { _id: 'N2000' }];

    const atNodeLimit = computeNetworkStatistics({ nodes: nodesAtLimit, links: [] });
    const aboveNodeLimit = computeNetworkStatistics({ nodes: nodesAboveLimit, links: [] });

    expect(atNodeLimit.summary.approximatePathMetrics).toBeFalse();
    expect(aboveNodeLimit.summary.approximatePathMetrics).toBeTrue();
    expect(aboveNodeLimit.summary.sampledSourceCount).toBe(256);

    const denseNodes = Array.from({ length: 142 }, (_, index) => ({ _id: `D${index}` }));
    const denseLinks: Array<{ source: string; target: string; visible: boolean }> = [];
    for (let source = 0; source < denseNodes.length && denseLinks.length < 10001; source++) {
      for (let target = source + 1; target < denseNodes.length && denseLinks.length < 10001; target++) {
        denseLinks.push({
          source: denseNodes[source]._id,
          target: denseNodes[target]._id,
          visible: true,
        });
      }
    }

    const atLinkLimit = computeNetworkStatistics({ nodes: denseNodes, links: denseLinks.slice(0, 10000) });
    const aboveLinkLimit = computeNetworkStatistics({
      nodes: denseNodes,
      links: denseLinks,
      approximation: { sampleSize: 8 },
    });

    expect(atLinkLimit.summary.approximatePathMetrics).toBeFalse();
    expect(aboveLinkLimit.summary.approximatePathMetrics).toBeTrue();
    expect(aboveLinkLimit.summary.sampledSourceCount).toBe(8);
  });

  it('keeps the 256-source heuristic deterministic and prioritizes high-degree nodes', () => {
    const nodes = Array.from({ length: 300 }, (_, index) => ({ _id: `N${index}` }));
    const links = nodes.slice(1).map((node) => ({
      source: nodes[0]._id,
      target: node._id,
      visible: true,
    }));
    const request = {
      nodes,
      links,
      approximation: { forceApproximate: true },
    };

    const first = computeNetworkStatistics(request);
    const second = computeNetworkStatistics(request);
    const { generatedAtIso: firstGeneratedAt, ...firstComparable } = first;
    const { generatedAtIso: secondGeneratedAt, ...secondComparable } = second;

    expect(first.summary.sampledSourceCount).toBe(256);
    expect(firstComparable).toEqual(secondComparable);
    expect(firstGeneratedAt).toBeTruthy();
    expect(secondGeneratedAt).toBeTruthy();

    const hubOnlySample = computeNetworkStatistics({
      nodes: nodes.slice(0, 6),
      links: links.slice(0, 5),
      approximation: { forceApproximate: true, sampleSize: 1 },
    });
    expect(hubOnlySample.summary.averagePathLength).toBe(1);

    const pathNodes = Array.from({ length: 6 }, (_, index) => ({ _id: `P${index}` }));
    const distributedSample = computeNetworkStatistics({
      nodes: pathNodes,
      links: pathNodes.slice(1).map((node, index) => ({
        source: pathNodes[index]._id,
        target: node._id,
      })),
      approximation: { forceApproximate: true, sampleSize: 4 },
    });
    expect(distributedSample.summary.averagePathLength).toBe(2.3);

    const summarySection = buildNetworkStatisticsExportSections(first)[0];
    expect(summarySection.rows).toContain([
      'Calculation Mode',
      'Approximate sampled metrics from 256 source nodes',
    ]);
  });

  it('forces exact metrics with bounded monotonic progress', () => {
    const nodes = Array.from({ length: 125 }, (_, index) => ({ _id: `N${index}` }));
    const links = nodes.slice(1).map((node, index) => ({
      source: nodes[index]._id,
      target: node._id,
      visible: true,
    }));
    const progress: NetworkStatisticsProgress[] = [];

    const result = computeNetworkStatistics({
      nodes,
      links,
      approximation: {
        exactNodeLimit: 1,
        exactLinkLimit: 1,
        forceApproximate: true,
        forceExact: true,
      },
    }, (update) => progress.push(update));

    expect(result.summary.approximateBetweenness).toBeFalse();
    expect(result.summary.approximatePathMetrics).toBeFalse();
    expect(result.summary.sampledSourceCount).toBe(nodes.length);
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.length).toBeLessThanOrEqual(100);
    expect(progress.every((update, index) => (
      index === 0 || update.completedSourceCount > progress[index - 1].completedSourceCount
    ))).toBeTrue();
    expect(progress[progress.length - 1]).toEqual({
      completedSourceCount: nodes.length,
      totalSourceCount: nodes.length,
      percentage: 100,
    });

    const summarySection = buildNetworkStatisticsExportSections(result)[0];
    expect(summarySection.rows).toContain(['Calculation Mode', 'Exact']);
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
