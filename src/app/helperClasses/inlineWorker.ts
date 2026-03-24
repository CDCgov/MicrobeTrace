import { Observable, Subject } from 'rxjs';

import type { ComputeWorkerRequest, ComputeWorkerTask } from '../workers/compute-worker.types';

export class InlineWorker {

    private static nextJobId = 0;
    private static sharedWorkers = new Map<ComputeWorkerTask, Worker>();

    private readonly worker: Worker;
    private readonly jobId: number;
    private onMessage = new Subject<MessageEvent>();
    private onError = new Subject<ErrorEvent>();
    private readonly listenerWrappers = {
        message: new Map<EventListenerOrEventListenerObject, EventListener>(),
        error: new Map<EventListenerOrEventListenerObject, EventListener>()
    };

    constructor(private readonly task: ComputeWorkerTask) {
        const WORKER_ENABLED = !!(Worker);

        if (!WORKER_ENABLED) {
            throw new Error('WebWorker is not enabled');
        }

        this.worker = InlineWorker.getWorker(task);
        this.jobId = InlineWorker.nextJobId++;

        this.worker.addEventListener('message', this.handleMessage);
        this.worker.addEventListener('error', this.handleError);
    }

    private static getWorker(task: ComputeWorkerTask): Worker {
        let worker = InlineWorker.sharedWorkers.get(task);
        if (!worker) {
            worker = new Worker(
                new URL('../workers/compute.worker', import.meta.url),
                { type: 'module', name: `mt-${task}` }
            );
            InlineWorker.sharedWorkers.set(task, worker);
        }
        return worker;
    }

    private handleMessage = (data: MessageEvent) => {
        if (data.data?.jobId !== this.jobId) {
            return;
        }
        this.onMessage.next(data);
    };

    private handleError = (data: ErrorEvent) => {
        this.onError.next(data);
    };

    addEventListener(type: 'message' | 'error', listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
        const wrappedListener: EventListener = (event: Event) => {
            if (type === 'message') {
                const messageEvent = event as MessageEvent;
                if (messageEvent.data?.jobId !== this.jobId) {
                    return;
                }
            }

            if (typeof listener === 'function') {
                listener.call(this.worker, event);
                return;
            }

            listener.handleEvent(event);
        };

        this.listenerWrappers[type].set(listener, wrappedListener);
        this.worker.addEventListener(type, wrappedListener, options);
    }

    removeEventListener(type: 'message' | 'error', listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) {
        const wrappedListener = this.listenerWrappers[type].get(listener);
        if (!wrappedListener) {
            return;
        }

        this.worker.removeEventListener(type, wrappedListener, options);
        this.listenerWrappers[type].delete(listener);
    }

    postMessage(data) {
        const message: ComputeWorkerRequest = {
            jobId: this.jobId,
            task: this.task,
            payload: data
        };
        this.worker.postMessage(message);
    }

    onmessage(): Observable<MessageEvent> {
        return this.onMessage.asObservable();
    }

    onerror(): Observable<ErrorEvent> {
        return this.onError.asObservable();
    }

    terminate() {
        this.listenerWrappers.message.forEach((wrappedListener) => {
            this.worker.removeEventListener('message', wrappedListener);
        });
        this.listenerWrappers.error.forEach((wrappedListener) => {
            this.worker.removeEventListener('error', wrappedListener);
        });
        this.listenerWrappers.message.clear();
        this.listenerWrappers.error.clear();
        this.worker.removeEventListener('message', this.handleMessage);
        this.worker.removeEventListener('error', this.handleError);
        this.onMessage.complete();
        this.onError.complete();
    }

}
