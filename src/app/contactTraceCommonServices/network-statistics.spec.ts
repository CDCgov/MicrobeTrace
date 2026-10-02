import {
  buildNetworkStatisticsNarrative,
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
    expect(result.summary.medianDegree).toBe(2);
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
    expect(result.summary.medianDegree).toBe(1);
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
    expect(result.summary.componentMetrics.clusteredFraction).toBe(0.5);
    expect(result.summary.componentMetrics.singletonFraction).toBe(0.5);
    expect(result.summary.componentMetrics.largestClusterFraction).toBe(0.5);
    expect(result.summary.componentMetrics.giniCoefficient).toBeCloseTo(1 / 6, 10);
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

  it('counts visible molecular, epidemiologic, and duo-link evidence after endpoint deduplication', () => {
    const result = computeNetworkStatistics({
      nodes: [{ _id: 'A' }, { _id: 'B' }, { _id: 'C' }, { _id: 'D' }],
      links: [
        { source: 'A', target: 'B', visible: true, hasMolecularEvidence: true },
        { source: 'B', target: 'A', visible: true, hasEpidemiologicEvidence: true },
        { source: 'B', target: 'C', visible: true, hasMolecularEvidence: true },
        { source: 'C', target: 'D', visible: true, hasEpidemiologicEvidence: true },
        { source: 'A', target: 'D', visible: true },
      ],
    });

    expect(result.summary.linkCount).toBe(4);
    expect(result.summary.linkEvidence).toEqual({
      molecularOnlyLinkCount: 1,
      epidemiologicOnlyLinkCount: 1,
      duoLinkCount: 1,
      unclassifiedLinkCount: 1,
    });
  });

  it('builds a deterministic interpretation without causal claims', () => {
    const result = computeNetworkStatistics({
      nodes: [{ _id: 'A' }, { _id: 'B' }, { _id: 'C' }],
      links: [
        {
          source: 'A',
          target: 'B',
          visible: true,
          hasMolecularEvidence: true,
          hasEpidemiologicEvidence: true,
        },
        { source: 'B', target: 'C', visible: true, hasMolecularEvidence: true },
      ],
    });

    const narrative = buildNetworkStatisticsNarrative(result);
    const narrativeText = [
      narrative.headline,
      narrative.calculationMode,
      ...narrative.sections.map((section) => section.text),
      narrative.caveat,
      ...narrative.methodology,
    ].join(' ');

    expect(narrative.calculationMode).toBe('Exact calculation');
    expect(narrative.headline).toBe('All 3 nodes in the visible network are connected in one component.');
    expect(narrativeText).toContain('1 molecular-only (50%), 0 epidemiologic-only (0%), 1 duo-link (50%)');
    expect(narrativeText).toContain('Each visible node pair counts as one link');
    expect(narrativeText).toContain('Node B has the highest degree (2)');
    expect(narrativeText).toContain('all displayed metrics are calculated exactly');
    expect(narrativeText).toContain('do not establish transmission direction or causality');
    expect(narrativeText.toLowerCase()).not.toContain('artificial intelligence');
    expect(narrativeText.toLowerCase()).not.toContain('superspreader');
  });

  it('describes fragmentation, dyads, and evidence overlap with fixed rules', () => {
    const result = computeNetworkStatistics({
      nodes: Array.from({ length: 8 }, (_, index) => ({ _id: String.fromCharCode(65 + index) })),
      links: [
        { source: 'A', target: 'B', visible: true, hasMolecularEvidence: true, hasEpidemiologicEvidence: true },
        { source: 'C', target: 'D', visible: true, hasMolecularEvidence: true },
      ],
    });

    const narrative = buildNetworkStatisticsNarrative(result);
    const narrativeText = [narrative.headline, ...narrative.sections.map((section) => section.text)].join(' ');

    expect(narrative.headline).toContain('highly fragmented across 6 components');
    expect(narrativeText).toContain('2 components are two-node dyads');
    expect(narrativeText).toContain('Molecular and epidemiologic evidence overlap on 1 visible pair');
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
    expect(buildNetworkStatisticsNarrative(result).calculationMode)
      .toBe('Sampled path and betweenness metrics from 2 source nodes');
  });

  it('uses singular wording for one isolated visible node', () => {
    const result = computeNetworkStatistics({
      nodes: [{ _id: 'A' }],
      links: [],
    });

    expect(buildNetworkStatisticsNarrative(result).sections[0].text)
      .toBe('1 visible node has no visible links. All visible nodes are singletons.');
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
    expect(csv).toContain('Non-singleton Components,1');
    expect(csv).toContain('Singletons,1');
    expect(csv).toContain('Largest Component Fraction (L1)');
    expect(csv).toContain('Component-size Gini');
    expect(csv).toContain('Degree Distribution\r\nDegree,Node Count,Fraction');
    expect(csv).toContain('Node Centrality\r\nNode ID,Component ID,Degree,Normalized Degree,Betweenness,Normalized Betweenness');
    expect(csv).toContain('Components\r\nComponent ID,Node Count,Link Count,Density,Average Degree,Max Degree,Diameter,Diameter Approximate,Member IDs');
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
      'Components',
      'Interpretation',
    ]);
    expect(sections[0].rows[0]).toEqual(['Metric', 'Value']);
    expect(sections[0].rows).toContain(['Nodes', 3]);
    expect(sections[1].rows[0]).toEqual(['Degree', 'Node Count', 'Fraction']);
    expect(sections[2].rows[0]).toEqual([
      'Node ID',
      'Component ID',
      'Degree',
      'Normalized Degree',
      'Betweenness',
      'Normalized Betweenness',
    ]);
    expect(sections[3].rows[0]).toEqual([
      'Component ID',
      'Node Count',
      'Link Count',
      'Density',
      'Average Degree',
      'Max Degree',
      'Diameter',
      'Diameter Approximate',
      'Member IDs',
    ]);
    expect(sections[4].rows[0]).toEqual(['Section', 'Interpretation']);
    const interpretationLimits = sections[4].rows.find((row) => row[0] === 'Interpretation limits');
    expect(interpretationLimits?.[1]).toContain('do not establish transmission direction or causality');
  });
});
