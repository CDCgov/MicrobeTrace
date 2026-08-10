import { computeNetworkStatistics, NetworkStatisticsResult } from '@app/contactTraceCommonServices/network-statistics';
import { WorkerComputeService } from '@app/contactTraceCommonServices/worker-compute.service';
import { NetworkStatisticsComponent } from './network-statistics-plugin.component';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: any) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void;
  let reject: (reason?: any) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve: resolve!, reject: reject! };
}

describe('NetworkStatisticsComponent background exact calculation', () => {
  let component: NetworkStatisticsComponent;
  let workerComputeService: jasmine.SpyObj<WorkerComputeService>;
  let commonService: any;
  let changeDetector: jasmine.SpyObj<any>;
  let scheduledFrame: FrameRequestCallback | null;
  let approximateResult: NetworkStatisticsResult;
  let exactResult: NetworkStatisticsResult;

  beforeEach(() => {
    const nodes = [{ _id: 'A' }, { _id: 'B' }, { _id: 'C' }];
    const links = [
      { source: 'A', target: 'B', visible: true },
      { source: 'B', target: 'C', visible: true },
    ];
    approximateResult = computeNetworkStatistics({
      nodes,
      links,
      approximation: { forceApproximate: true, sampleSize: 1 },
    });
    exactResult = computeNetworkStatistics({
      nodes,
      links,
      approximation: { forceExact: true },
    });

    commonService = {
      visuals: {},
      session: {
        data: { nodes, links },
        style: {
          widgets: {
            'link-sort-variable': 'Distance',
            'default-distance-metric': 'tn93',
            'link-threshold': 1,
          },
        },
      },
      getVisibleNodes: () => commonService.session.data.nodes,
      formatDisplayedDistanceValue: (value: number) => String(value),
    };
    workerComputeService = jasmine.createSpyObj<WorkerComputeService>('WorkerComputeService', [
      'computeNetworkStatistics',
    ]);
    changeDetector = jasmine.createSpyObj('ChangeDetectorRef', ['detectChanges']);
    scheduledFrame = null;
    spyOn(window, 'requestAnimationFrame').and.callFake((callback: FrameRequestCallback) => {
      scheduledFrame = callback;
      return 1;
    });
    spyOn(window, 'cancelAnimationFrame');

    component = new NetworkStatisticsComponent(
      { on: () => undefined } as any,
      { nativeElement: document.createElement('div') } as any,
      changeDetector,
      commonService,
      { setNetworkRendered: jasmine.createSpy('setNetworkRendered') } as any,
      workerComputeService,
      { pushTag: jasmine.createSpy('pushTag') } as any,
    );
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  it('renders the approximation, starts exact work after a frame, reports progress, and replaces the result', async () => {
    const exactCompletion = deferred<NetworkStatisticsResult>();
    workerComputeService.computeNetworkStatistics.and.returnValues(
      Promise.resolve(approximateResult),
      exactCompletion.promise,
    );

    await component.refreshNetworkStatistics();

    expect(component.networkStatisticsResult).toBe(approximateResult);
    expect(component.networkStatisticsLoading).toBeFalse();
    expect(scheduledFrame).not.toBeNull();
    scheduledFrame!(0);
    await Promise.resolve();

    expect(component.networkStatisticsExactState).toBe('running');
    const exactOptions = workerComputeService.computeNetworkStatistics.calls.argsFor(1)[1];
    exactOptions.onProgress!({
      completedSourceCount: 2,
      totalSourceCount: 3,
      percentage: 200 / 3,
    });
    expect(component.networkStatisticsExactProgress?.completedSourceCount).toBe(2);

    exactCompletion.resolve(exactResult);
    await exactCompletion.promise;
    await Promise.resolve();

    expect(component.networkStatisticsResult).toBe(exactResult);
    expect(component.networkStatisticsExactState).toBe('complete');
    expect(component.networkStatisticsExactProgress).toBeNull();
  });

  it('cancels exact work and allows the user to start it again', async () => {
    let exactSignal: AbortSignal | undefined;
    workerComputeService.computeNetworkStatistics.and.callFake((_request, options = {}) => {
      if (workerComputeService.computeNetworkStatistics.calls.count() === 1) {
        return Promise.resolve(approximateResult);
      }
      exactSignal = options.signal;
      return new Promise<NetworkStatisticsResult>((resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          const error = new Error('cancelled');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
        if (workerComputeService.computeNetworkStatistics.calls.count() > 2) {
          resolve(exactResult);
        }
      });
    });

    await component.refreshNetworkStatistics();
    const firstExactAttempt = component.startExactNetworkStatistics();
    component.cancelExactNetworkStatistics();
    await firstExactAttempt;

    expect(exactSignal?.aborted).toBeTrue();
    expect(component.networkStatisticsExactState).toBe('cancelled');
    expect(component.networkStatisticsResult).toBe(approximateResult);

    await component.startExactNetworkStatistics();
    expect(component.networkStatisticsExactState).toBe('complete');
    expect(component.networkStatisticsResult).toBe(exactResult);
  });

  it('does not restart an unchanged request but cancels scheduled work for changed data', async () => {
    workerComputeService.computeNetworkStatistics.and.returnValue(Promise.resolve(approximateResult));

    await component.refreshNetworkStatistics();
    await component.refreshNetworkStatistics();
    expect(workerComputeService.computeNetworkStatistics).toHaveBeenCalledTimes(1);

    commonService.session.data.nodes = [...commonService.session.data.nodes, { _id: 'D' }];
    await component.refreshNetworkStatistics();

    expect(window.cancelAnimationFrame).toHaveBeenCalled();
    expect(workerComputeService.computeNetworkStatistics).toHaveBeenCalledTimes(2);
  });

  it('continues valid exact work while hidden and cancels it when hidden inputs change', async () => {
    let firstExactSignal: AbortSignal | undefined;
    workerComputeService.computeNetworkStatistics.and.callFake((_request, options = {}) => {
      if (workerComputeService.computeNetworkStatistics.calls.count() === 1) {
        return Promise.resolve(approximateResult);
      }
      if (workerComputeService.computeNetworkStatistics.calls.count() === 2) {
        firstExactSignal = options.signal;
        return new Promise<NetworkStatisticsResult>((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            const error = new Error('cancelled');
            error.name = 'AbortError';
            reject(error);
          }, { once: true });
        });
      }
      return Promise.resolve(approximateResult);
    });

    await component.refreshNetworkStatistics();
    scheduledFrame!(0);
    await Promise.resolve();
    component.viewActive = false;

    await component.refreshNetworkStatistics();
    expect(workerComputeService.computeNetworkStatistics).toHaveBeenCalledTimes(2);
    expect(firstExactSignal?.aborted).toBeFalse();

    commonService.session.data.nodes = [...commonService.session.data.nodes, { _id: 'D' }];
    await component.refreshNetworkStatistics();

    expect(firstExactSignal?.aborted).toBeTrue();
    expect(workerComputeService.computeNetworkStatistics).toHaveBeenCalledTimes(3);
  });

  it('retains approximate values and offers retry state after exact calculation fails', async () => {
    workerComputeService.computeNetworkStatistics.and.returnValues(
      Promise.resolve(approximateResult),
      Promise.reject(new Error('worker failed')),
    );

    await component.refreshNetworkStatistics();
    await component.startExactNetworkStatistics();

    expect(component.networkStatisticsResult).toBe(approximateResult);
    expect(component.networkStatisticsExactState).toBe('failed');
    expect(component.networkStatisticsExactError).toContain('could not be calculated');
  });
});
