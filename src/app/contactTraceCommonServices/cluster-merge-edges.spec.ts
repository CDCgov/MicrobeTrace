import { CommonService } from './common.service';

describe('Genetic source data for cluster positioning', () => {
  const createService = (links: any[] = []) => {
    const service = Object.create(CommonService.prototype) as any;
    const nodes = ['A', 'B', 'C'].map(_id => ({ _id }));
    service.session = { style: { widgets: { 'link-sort-variable': 'distance', 'link-show-nn': false } },
      data: { nodes, newickString: '(A:1,B:1,C:1);' }, files: [{ format: 'auspice' }] };
    service.dataLoadGeneration = 1;
    service.getThresholdSensitivityCohort = () => ({ nodes, links });
    service.resolveNetworkSubsetFilter = () => ({ linkRuleActive: false });
    service.getAnalysisCache = () => ({ patristicDistanceCache: {} });
    service.workerComputeService = {
      getPatristicLeafNames: () => ['A', 'B', 'C'],
      collectPatristicDistanceAnalysisEdges: jasmine.createSpy('collect tree merge edges').and.resolveTo({
        edges: [{ sourceIndex: 0, targetIndex: 1, value: 6 }, { sourceIndex: 1, targetIndex: 2, value: 20 }],
      }),
    };
    return service;
  };

  it('caches a complete tree merge backbone without altering analytical link or threshold caches', async () => {
    const service = createService();
    const first = await service.getClusterMergeLayoutEdges(['A', 'B', 'C']);
    const second = await service.getClusterMergeLayoutEdges(['A', 'B', 'C']);
    expect(first).toEqual([{ source: 'A', target: 'B', distance: 6 }, { source: 'B', target: 'C', distance: 20 }]);
    expect(second).toEqual(first);
    expect(service.workerComputeService.collectPatristicDistanceAnalysisEdges).toHaveBeenCalledTimes(1);
    expect(service.workerComputeService.collectPatristicDistanceAnalysisEdges).toHaveBeenCalledWith(service.session, { maxPairs: 0 });
    expect(service.getAnalysisCache().patristicDistanceCache).toEqual({});
  });

  it('rejects epi-only, missing, blank, negative, and non-finite distances without treating them as zero', async () => {
    const service = createService([
      { source: 'A', target: 'B', hasDistance: true, distance: 0 },
      { source: 'A', target: 'C', hasDistance: false, distance: 0 },
      ...[null, '', ' ', Number.NaN, Number.POSITIVE_INFINITY, -1, false].map(distance => ({
        source: 'B', target: 'C', hasDistance: true, distance,
      })),
    ]);
    service.session.data.newickString = '';
    expect(await service.getClusterMergeLayoutEdges(['A', 'B', 'C']))
      .toEqual([{ source: 'A', target: 'B', distance: 0 }]);
  });

  it('does not bridge through hidden samples or bypass link subset and nearest-neighbor filters', async () => {
    const service = createService();
    expect(await service.getClusterMergeLayoutEdges(['A', 'B'])).toEqual([]);
    service.resolveNetworkSubsetFilter = () => ({ linkRuleActive: true });
    expect(await service.getClusterMergeLayoutEdges(['A', 'B', 'C'])).toEqual([]);
    service.resolveNetworkSubsetFilter = () => ({ linkRuleActive: false });
    service.session.style.widgets['link-show-nn'] = true;
    expect(await service.getClusterMergeLayoutEdges(['A', 'B', 'C'])).toEqual([]);
    expect(service.workerComputeService.collectPatristicDistanceAnalysisEdges).not.toHaveBeenCalled();
  });

  it('discards an old tree result when a different dataset loads during its calculation', async () => {
    const service = createService();
    let complete: (result: any) => void;
    service.workerComputeService.collectPatristicDistanceAnalysisEdges.and.returnValue(new Promise(resolve => { complete = resolve; }));
    const pending = service.getClusterMergeLayoutEdges(['A', 'B', 'C']);
    service.dataLoadGeneration++;
    complete!({ edges: [{ sourceIndex: 0, targetIndex: 1, value: 6 }] });
    expect(await pending).toEqual([]);
  });
});
