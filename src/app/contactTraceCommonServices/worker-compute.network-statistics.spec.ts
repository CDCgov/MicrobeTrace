import { computeNetworkStatistics, NetworkStatisticsProgress } from './network-statistics';
import { WorkerComputeService } from './worker-compute.service';

class ControlledStatisticsWorker {
  readonly postMessage = jasmine.createSpy('postMessage');
  readonly terminate = jasmine.createSpy('terminate');
  private readonly listeners = {
    message: new Set<EventListenerOrEventListenerObject>(),
    error: new Set<EventListenerOrEventListenerObject>(),
  };

  addEventListener(type: 'message' | 'error', listener: EventListenerOrEventListenerObject): void {
    this.listeners[type].add(listener);
  }

  removeEventListener(type: 'message' | 'error', listener: EventListenerOrEventListenerObject): void {
    this.listeners[type].delete(listener);
  }

  emit(type: 'message' | 'error', event: Event): void {
    this.listeners[type].forEach((listener) => {
      if (typeof listener === 'function') {
        listener(event);
      } else {
        listener.handleEvent(event);
      }
    });
  }
}

describe('WorkerComputeService network statistics', () => {
  let worker: ControlledStatisticsWorker;
  let service: WorkerComputeService;

  beforeEach(() => {
    worker = new ControlledStatisticsWorker();
    service = new WorkerComputeService({
      getNetworkStatisticsWorker: () => worker,
    } as any);
  });

  it('forwards progress and resolves the final worker result', async () => {
    const progressUpdates: NetworkStatisticsProgress[] = [];
    const request = {
      nodes: [{ _id: 'A' }, { _id: 'B' }],
      links: [{ source: 'A', target: 'B' }],
    };
    const expectedResult = computeNetworkStatistics(request);
    const resultPromise = service.computeNetworkStatistics(request, {
      onProgress: (progress) => progressUpdates.push(progress),
    });

    expect(worker.postMessage).toHaveBeenCalledWith({
      request,
      reportProgress: true,
    });

    const progress = {
      completedSourceCount: 1,
      totalSourceCount: 2,
      percentage: 50,
    };
    worker.emit('message', new MessageEvent('message', {
      data: { networkStatisticsProgress: progress },
    }));
    worker.emit('message', new MessageEvent('message', {
      data: {
        networkStatistics: new TextEncoder().encode(JSON.stringify(expectedResult)).buffer,
      },
    }));

    await expectAsync(resultPromise).toBeResolvedTo(expectedResult);
    expect(progressUpdates).toEqual([progress]);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('terminates the dedicated worker and rejects with AbortError when cancelled', async () => {
    const controller = new AbortController();
    const resultPromise = service.computeNetworkStatistics({ nodes: [], links: [] }, {
      signal: controller.signal,
    });

    controller.abort();

    await expectAsync(resultPromise).toBeRejectedWith(jasmine.objectContaining({ name: 'AbortError' }));
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});
