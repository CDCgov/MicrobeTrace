import { TestBed } from '@angular/core/testing';
import { WorkerModule } from '../workers/workModule';
import {
  buildPatristicEdgeDensityWarning,
  PATRISTIC_DENSE_EDGE_WARNING_THRESHOLD,
  WorkerComputeService,
} from './worker-compute.service';

class FakePatristicWorker {
  public messages: any[] = [];
  public terminated = false;
  private listeners = new Map<string, Set<(event: MessageEvent<any>) => void>>();

  public addEventListener(eventName: string, handler: (event: MessageEvent<any>) => void): void {
    const handlers = this.listeners.get(eventName) ?? new Set();
    handlers.add(handler);
    this.listeners.set(eventName, handlers);
  }

  public removeEventListener(eventName: string, handler: (event: MessageEvent<any>) => void): void {
    const handlers = this.listeners.get(eventName);
    if (!handlers) {
      return;
    }
    handlers.delete(handler);
    if (handlers.size === 0) {
      this.listeners.delete(eventName);
    }
  }

  public postMessage(message: unknown): void {
    this.messages.push(message);
  }

  public terminate(): void {
    this.terminated = true;
  }

  public emit(eventName: string, data: any): void {
    const handlers = this.listeners.get(eventName);
    if (!handlers) {
      return;
    }
    for (const handler of handlers) {
      handler({ data } as MessageEvent<any>);
    }
  }

  public reset(): void {
    this.messages = [];
    this.listeners.clear();
    this.terminated = false;
  }

  public lastMessageOfType(type: string): any {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].type === type) {
        return this.messages[i];
      }
    }
    return undefined;
  }
}

class WorkerModuleStub {
  public readonly fakeWorker = new FakePatristicWorker();

  public getPatristicWorker(): Worker {
    return this.fakeWorker as unknown as Worker;
  }

  public terminatePatristicWorker(): void {
    this.fakeWorker.terminate();
  }

  public terminatePatricicWorker(): void {
    this.fakeWorker.terminate();
  }
}

const FINAL_BUILD_STATS = {
  totalLeafPairs: 1,
  accountedLeafPairs: 1,
  evaluatedLeafPairs: 1,
  prunedLeafPairs: 0,
  prunedSubtreeComparisons: 0,
};

describe('WorkerComputeService Patristic Integration', () => {
  let service: WorkerComputeService;
  let workerStub: WorkerModuleStub;
  let fakeWorker: FakePatristicWorker;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        WorkerComputeService,
        { provide: WorkerModule, useClass: WorkerModuleStub },
      ],
    });

    service = TestBed.inject(WorkerComputeService);
    workerStub = TestBed.inject(WorkerModule) as unknown as WorkerModuleStub;
    fakeWorker = workerStub.fakeWorker;
    fakeWorker.reset();
  });

  it('resolves links and metadata on happy-path edge batches', async () => {
    const addLink = jasmine.createSpy('addLink').and.returnValue(1);

    const run = service.computePatristicEdges(
      '(A:1,B:1);',
      2.5,
      addLink,
      (value: string) => `safe:${value}`,
      {
        origin: ['unit-test'],
        distanceOrigin: 'unit-distance',
      }
    );

    const initMessage = fakeWorker.lastMessageOfType('INIT_TREE');
    expect(initMessage).toBeTruthy();
    expect(initMessage.type).toBe('INIT_TREE');
    expect(initMessage.newickString).toBe('(A:1,B:1);');

    fakeWorker.emit('message', {
      type: 'TREE_READY',
      jobId: initMessage.jobId,
      leafCount: 2,
      nodeCount: 3,
      leafNames: ['A', 'B'],
      maxRootDepth: 4,
    });
    await Promise.resolve();

    const batchMessage = fakeWorker.lastMessageOfType('BUILD_EDGES');
    expect(batchMessage).toBeTruthy();
    expect(batchMessage.type).toBe('BUILD_EDGES');
    expect(batchMessage.threshold).toBe(2.5);

    fakeWorker.emit('message', {
      type: 'EDGE_BATCH',
      jobId: batchMessage.jobId,
      sources: new Uint32Array([0]),
      targets: new Uint32Array([1]),
      distances: new Float32Array([0.4]),
      totalEmitted: 1,
      done: false,
    });
    fakeWorker.emit('message', {
      type: 'EDGE_BATCH',
      jobId: batchMessage.jobId,
      sources: new Uint32Array([1]),
      targets: new Uint32Array([0]),
      distances: new Float32Array([1.6]),
      totalEmitted: 2,
      done: true,
      buildStats: FINAL_BUILD_STATS,
    });

    const result = await run;

    const calls = addLink.calls.allArgs().map((call) => call[0]);
    expect(calls.length).toBe(2);
    expect(calls[0]).toEqual(
      jasmine.objectContaining({
        source: 'safe:A',
        target: 'safe:B',
        origin: ['unit-test'],
        distanceOrigin: 'unit-distance',
        hasDistance: true,
      })
    );
    expect(calls[1]).toEqual(
      jasmine.objectContaining({
        source: 'safe:B',
        target: 'safe:A',
        origin: ['unit-test'],
        distanceOrigin: 'unit-distance',
        hasDistance: true,
      })
    );
    expect(calls[0].distance).toBeCloseTo(0.4);
    expect(calls[1].distance).toBeCloseTo(1.6);
    expect(result).toEqual({
      newLinks: 2,
      totalLinks: 2,
      leafNames: ['safe:A', 'safe:B'],
      maxRootDepth: 4,
      buildStats: FINAL_BUILD_STATS,
    });
    expect(service.getLastPatristicBuildStats()).toEqual(FINAL_BUILD_STATS);
  });

  it('forwards progress updates from both INIT_TREE and BUILD_EDGES', async () => {
    const addLink = jasmine.createSpy('addLink').and.returnValue(1);
    const onProgress = jasmine.createSpy('onProgress');

    const run = service.computePatristicEdges(
      '(A:1,B:1);',
      2.5,
      addLink,
      (value: string) => `safe:${value}`,
      {
        onProgress,
      }
    );

    const initMessage = fakeWorker.lastMessageOfType('INIT_TREE');
    expect(initMessage).toBeTruthy();
    expect(initMessage.type).toBe('INIT_TREE');

    fakeWorker.emit('message', {
      type: 'PROGRESS',
      jobId: initMessage.jobId,
      phase: 'parse',
      percent: 0,
    });
    fakeWorker.emit('message', {
      type: 'PROGRESS',
      jobId: initMessage.jobId,
      phase: 'flatten',
      percent: 25,
    });
    fakeWorker.emit('message', {
      type: 'PROGRESS',
      jobId: initMessage.jobId,
      phase: 'lca',
      percent: 50,
    });

    fakeWorker.emit('message', {
      type: 'TREE_READY',
      jobId: initMessage.jobId,
      leafCount: 2,
      nodeCount: 3,
      leafNames: ['A', 'B'],
      maxRootDepth: 4,
    });

    await Promise.resolve();

    const buildMessage = fakeWorker.lastMessageOfType('BUILD_EDGES');
    expect(buildMessage).toBeTruthy();
    expect(buildMessage.type).toBe('BUILD_EDGES');

    fakeWorker.emit('message', {
      type: 'PROGRESS',
      jobId: buildMessage.jobId,
      phase: 'pairs',
      percent: 10,
    });

    fakeWorker.emit('message', {
      type: 'EDGE_BATCH',
      jobId: buildMessage.jobId,
      sources: new Uint32Array([0]),
      targets: new Uint32Array([1]),
      distances: new Float32Array([0.4]),
      totalEmitted: 1,
      done: true,
      buildStats: FINAL_BUILD_STATS,
    });

    await run;

    expect(onProgress).toHaveBeenCalled();
    const phases = onProgress.calls.allArgs().map((arg) => arg[0].phase);

    expect(phases).toContain('parse');
    expect(phases).toContain('flatten');
    expect(phases).toContain('lca');
    expect(phases).toContain('pairs');
  });

  it('rejects when init returns an ERROR response', async () => {
    const addLink = jasmine.createSpy('addLink').and.returnValue(1);
    const run = service.computePatristicEdges('(bad', 1, addLink, (value: string) => value);

    const initMessage = fakeWorker.lastMessageOfType('INIT_TREE');
    expect(initMessage.type).toBe('INIT_TREE');

    fakeWorker.emit('message', {
      type: 'ERROR',
      jobId: initMessage.jobId,
      message: 'Invalid Newick',
    });

    await expectAsync(run).toBeRejectedWithError('Invalid Newick');
    expect(fakeWorker.messages.filter((message: any) => message.type === 'BUILD_EDGES').length).toBe(0);
    expect(addLink).not.toHaveBeenCalled();
  });

  it('posts CANCEL for an in-flight patristic job when requested', async () => {
    const addLink = jasmine.createSpy('addLink').and.returnValue(1);
    let settled = false;
    let rejected = false;

    const run = service.computePatristicEdges('(A:1,B:1);', 2.5, addLink, (value: string) => value);
    run.then(
      () => {
        settled = true;
      },
      () => {
        rejected = true;
      }
    );

    const initMessage = fakeWorker.lastMessageOfType('INIT_TREE');
    expect(initMessage.type).toBe('INIT_TREE');
    fakeWorker.emit('message', {
      type: 'TREE_READY',
      jobId: initMessage.jobId,
      leafCount: 2,
      nodeCount: 3,
      leafNames: ['A', 'B'],
      maxRootDepth: 4,
    });
    await Promise.resolve();

    const buildMessage = fakeWorker.lastMessageOfType('BUILD_EDGES');
    expect(buildMessage.type).toBe('BUILD_EDGES');

    service.cancelPatristicJob();
    const cancelMessage = fakeWorker.lastMessageOfType('CANCEL');
    expect(cancelMessage).toEqual({
      type: 'CANCEL',
      jobId: buildMessage.jobId,
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

    expect(settled).toBe(false);
    expect(rejected).toBe(false);
    expect(addLink).not.toHaveBeenCalled();

    fakeWorker.emit('message', {
      type: 'ERROR',
      jobId: buildMessage.jobId,
      message: 'Cancelled',
    });
    await expectAsync(run).toBeRejectedWithError('Cancelled');
    expect(settled).toBe(false);
    expect(rejected).toBe(true);
  });

  it('reuses cached patristic tree when threshold changes on equivalent Newick input', async () => {
    const addLink = jasmine.createSpy('addLink').and.returnValue(1);

    const firstRun = service.computePatristicEdges(
      '(A:1,B:1);',
      2.5,
      addLink,
      (value: string) => `safe:${value}`
    );

    const firstInitMessage = fakeWorker.lastMessageOfType('INIT_TREE');
    expect(firstInitMessage).toBeTruthy();
    expect(firstInitMessage.newickString).toBe('(A:1,B:1);');

    fakeWorker.emit('message', {
      type: 'TREE_READY',
      jobId: firstInitMessage.jobId,
      leafCount: 2,
      nodeCount: 3,
      leafNames: ['A', 'B'],
      maxRootDepth: 4,
    });
    await Promise.resolve();

    const firstBuildMessage = fakeWorker.lastMessageOfType('BUILD_EDGES');
    expect(firstBuildMessage.threshold).toBe(2.5);

    fakeWorker.emit('message', {
      type: 'EDGE_BATCH',
      jobId: firstBuildMessage.jobId,
      sources: new Uint32Array([0]),
      targets: new Uint32Array([1]),
      distances: new Float32Array([0.4]),
      totalEmitted: 1,
      done: true,
      buildStats: FINAL_BUILD_STATS,
    });
    const firstResult = await firstRun;
    expect(firstResult.totalLinks).toBe(1);
    expect(firstResult.leafNames).toEqual(['safe:A', 'safe:B']);

    const cachedInitCount = fakeWorker.messages.filter((message: any) => message.type === 'INIT_TREE').length;
    const firstBuildJobId = firstBuildMessage.jobId;

    const secondRun = service.computePatristicEdges(
      '(A:1,B:1);\n',
      1.0,
      addLink,
      (value: string) => `safe:${value}`
    );

    expect(fakeWorker.messages.filter((message: any) => message.type === 'INIT_TREE').length).toBe(
      cachedInitCount
    );

    const secondBuildMessage = fakeWorker.lastMessageOfType('BUILD_EDGES');
    expect(secondBuildMessage.threshold).toBe(1.0);
    expect(secondBuildMessage.jobId).not.toBe(firstBuildJobId);

    fakeWorker.emit('message', {
      type: 'EDGE_BATCH',
      jobId: secondBuildMessage.jobId,
      sources: new Uint32Array([1]),
      targets: new Uint32Array([0]),
      distances: new Float32Array([0.9]),
      totalEmitted: 1,
      done: true,
      buildStats: FINAL_BUILD_STATS,
    });

    const secondResult = await secondRun;
    expect(secondResult.totalLinks).toBe(1);
    expect(secondResult.leafNames).toEqual(['safe:A', 'safe:B']);
    expect(addLink.calls.allArgs().length).toBe(2);
    expect(addLink.calls.argsFor(0)[0]).toEqual(
      jasmine.objectContaining({
        source: 'safe:A',
        target: 'safe:B',
        origin: ['Newick Tree'],
        distanceOrigin: 'Newick Tree',
      })
    );
    expect(addLink.calls.argsFor(0)[0].distance).toBeCloseTo(0.4);
    expect(addLink.calls.argsFor(1)[0]).toEqual(
      jasmine.objectContaining({
        source: 'safe:B',
        target: 'safe:A',
        origin: ['Newick Tree'],
        distanceOrigin: 'Newick Tree',
      })
    );
    expect(addLink.calls.argsFor(1)[0].distance).toBeCloseTo(0.9);
  });

  it('streams full patristic matrix export rows without reinitializing an equivalent cached tree', async () => {
    const firstRun = service.exportPatristicDistanceMatrix('(A:1,B:1,C:2);');

    const firstInitMessage = fakeWorker.lastMessageOfType('INIT_TREE');
    expect(firstInitMessage).toBeTruthy();
    expect(firstInitMessage.newickString).toBe('(A:1,B:1,C:2);');

    fakeWorker.emit('message', {
      type: 'TREE_READY',
      jobId: firstInitMessage.jobId,
      leafCount: 3,
      nodeCount: 5,
      leafNames: ['A', 'B', 'C'],
      maxRootDepth: 2,
    });
    await Promise.resolve();

    const exportMessage = fakeWorker.lastMessageOfType('EXPORT_MATRIX');
    expect(exportMessage).toBeTruthy();
    expect(exportMessage.type).toBe('EXPORT_MATRIX');

    fakeWorker.emit('message', {
      type: 'MATRIX_CHUNK',
      jobId: exportMessage.jobId,
      row: 0,
      values: new Float64Array([0, 2, 3]),
      done: false,
    });
    fakeWorker.emit('message', {
      type: 'MATRIX_CHUNK',
      jobId: exportMessage.jobId,
      row: 1,
      values: new Float64Array([2, 0, 4]),
      done: false,
    });
    fakeWorker.emit('message', {
      type: 'MATRIX_CHUNK',
      jobId: exportMessage.jobId,
      row: 2,
      values: new Float64Array([3, 4, 0]),
      done: true,
    });

    const firstResult = await firstRun;
    expect(firstResult).toEqual({
      dm: [
        [0, 2, 3],
        [2, 0, 4],
        [3, 4, 0],
      ],
      labels: ['A', 'B', 'C'],
      maxRootDepth: 2,
    });

    const initCount = fakeWorker.messages.filter((message: any) => message.type === 'INIT_TREE').length;

    const secondRun = service.exportPatristicDistanceMatrix('(A:1,B:1,C:2);\n');
    expect(fakeWorker.messages.filter((message: any) => message.type === 'INIT_TREE').length).toBe(initCount);

    const secondExportMessage = fakeWorker.lastMessageOfType('EXPORT_MATRIX');
    expect(secondExportMessage.jobId).not.toBe(exportMessage.jobId);
    fakeWorker.emit('message', {
      type: 'MATRIX_CHUNK',
      jobId: secondExportMessage.jobId,
      row: 0,
      values: new Float64Array([0, 2, 3]),
      done: false,
    });
    fakeWorker.emit('message', {
      type: 'MATRIX_CHUNK',
      jobId: secondExportMessage.jobId,
      row: 1,
      values: new Float64Array([2, 0, 4]),
      done: false,
    });
    fakeWorker.emit('message', {
      type: 'MATRIX_CHUNK',
      jobId: secondExportMessage.jobId,
      row: 2,
      values: new Float64Array([3, 4, 0]),
      done: true,
    });

    const secondResult = await secondRun;
    expect(secondResult.dm[2][1]).toBe(4);
    expect(secondResult.labels).toEqual(['A', 'B', 'C']);
  });

  it('builds a dense-edge warning when threshold spans the tree diameter on a large tree', () => {
    const warning = buildPatristicEdgeDensityWarning(142, 1, 2);

    expect(warning).toEqual(jasmine.objectContaining({
      leafCount: 142,
      potentialEdgeCount: 10011,
      threshold: 2,
      treeDiameterUpperBound: 2,
      displayEdgeLimit: PATRISTIC_DENSE_EDGE_WARNING_THRESHOLD,
    }));
    expect(warning?.message).toContain('10,011');
    expect(warning?.message).toContain('142 taxa');
    expect(warning?.message).toContain('Only the first 10,000 qualifying patristic edges will be displayed');
    expect(buildPatristicEdgeDensityWarning(141, 1, 2)).toBeNull();
    expect(buildPatristicEdgeDensityWarning(142, 1, 1.999)).toBeNull();
  });

  it('emits dense-edge guardrail callbacks before building dense patristic runs', async () => {
    const addLink = jasmine.createSpy('addLink').and.returnValue(1);
    const onGuardrail = jasmine.createSpy('onGuardrail');
    const denseLeafNames = Array.from({ length: 142 }, (_, index) => `N${index}`);

    const run = service.computePatristicEdges(
      '(A:1,B:1);',
      2,
      addLink,
      (value: string) => value,
      { onGuardrail }
    );

    const initMessage = fakeWorker.lastMessageOfType('INIT_TREE');
    expect(initMessage.type).toBe('INIT_TREE');
    fakeWorker.emit('message', {
      type: 'TREE_READY',
      jobId: initMessage.jobId,
      leafCount: denseLeafNames.length,
      nodeCount: denseLeafNames.length * 2 - 1,
      leafNames: denseLeafNames,
      maxRootDepth: 1,
    });
    await Promise.resolve();

    expect(onGuardrail).toHaveBeenCalledTimes(1);
    expect(onGuardrail).toHaveBeenCalledWith(jasmine.objectContaining({
      leafCount: 142,
      potentialEdgeCount: 10011,
      threshold: 2,
      treeDiameterUpperBound: 2,
    }));

    const buildMessage = fakeWorker.lastMessageOfType('BUILD_EDGES');
    expect(buildMessage.type).toBe('BUILD_EDGES');
    expect(buildMessage.maxEdges).toBe(PATRISTIC_DENSE_EDGE_WARNING_THRESHOLD);
    fakeWorker.emit('message', {
      type: 'EDGE_BATCH',
      jobId: buildMessage.jobId,
      sources: new Uint32Array(),
      targets: new Uint32Array(),
      distances: new Float32Array(),
      totalEmitted: 0,
      done: true,
      buildStats: {
        totalLeafPairs: 10011,
        accountedLeafPairs: 0,
        evaluatedLeafPairs: 0,
        prunedLeafPairs: 0,
        prunedSubtreeComparisons: 0,
        maxEdgesReached: false,
      },
    });

    const result = await run;
    expect(result.totalLinks).toBe(0);
    expect(addLink).not.toHaveBeenCalled();
  });

  it('falls back to default origin/distanceOrigin when options are omitted', async () => {
    const addLink = jasmine.createSpy('addLink').and.returnValue(1);
    const run = service.computePatristicEdges('(A:1,B:1);', 2.5, addLink, (value: string) => `safe:${value}`);

    const initMessage = fakeWorker.lastMessageOfType('INIT_TREE');
    expect(initMessage.type).toBe('INIT_TREE');
    fakeWorker.emit('message', {
      type: 'TREE_READY',
      jobId: initMessage.jobId,
      leafCount: 2,
      nodeCount: 3,
      leafNames: ['A', 'B'],
      maxRootDepth: 4,
    });
    await Promise.resolve();

    const buildMessage = fakeWorker.lastMessageOfType('BUILD_EDGES');
    expect(buildMessage.type).toBe('BUILD_EDGES');
    fakeWorker.emit('message', {
      type: 'EDGE_BATCH',
      jobId: buildMessage.jobId,
      sources: new Uint32Array([0]),
      targets: new Uint32Array([1]),
      distances: new Float32Array([0.4]),
      totalEmitted: 1,
      done: true,
      buildStats: FINAL_BUILD_STATS,
    });

    const result = await run;
    expect(result.maxRootDepth).toBe(4);
    expect(result.totalLinks).toBe(1);
    expect(addLink).toHaveBeenCalledTimes(1);
    expect(addLink).toHaveBeenCalledWith(
      jasmine.objectContaining({
        source: 'safe:A',
        target: 'safe:B',
        origin: ['Newick Tree'],
        distanceOrigin: 'Newick Tree',
      }),
      false
    );
  });

  it('clears cached patristic metadata on terminate', async () => {
    const addLink = jasmine.createSpy('addLink').and.returnValue(1);
    const run = service.computePatristicEdges('(A:1,B:1);', 2.5, addLink, (value: string) => `safe:${value}`);

    const initMessage = fakeWorker.lastMessageOfType('INIT_TREE');
    expect(initMessage.type).toBe('INIT_TREE');
    fakeWorker.emit('message', {
      type: 'TREE_READY',
      jobId: initMessage.jobId,
      leafCount: 2,
      nodeCount: 3,
      leafNames: ['A', 'B'],
      maxRootDepth: 4,
    });
    await Promise.resolve();

    expect(service.getPatristicLeafNames()).toEqual(['A', 'B']);
    service.terminatePatristicWorker();
    expect(fakeWorker.terminated).toBeTrue();
    expect(service.getPatristicLeafNames()).toEqual([]);
    expect(service.getLastPatristicBuildStats()).toBeNull();

    run.catch(() => {});
  });
});
