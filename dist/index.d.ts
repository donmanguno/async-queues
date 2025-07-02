import { EventEmitter } from 'events';
export type Processor<T, R, C> = (this: C, ...args: T[]) => Promise<R>;
export interface QueuedItem<T, R, C> {
    id: string;
    args: T[];
    thisArg?: C;
    processor: Processor<T, R, C>;
    resolve: (value: R | PromiseLike<R>) => void;
    reject: (reason?: any) => void;
}
export type AsyncQueueEvents<T, R, C> = {
    enqueue: (item: QueuedItem<T, R, C>) => void;
    dequeue: (item: QueuedItem<T, R, C>) => void;
    processed: (result: R, item: QueuedItem<T, R, C>) => void;
    error: (error: any, item: QueuedItem<T, R, C>) => void;
    pause: () => void;
    resume: () => void;
};
export declare class AsyncQueue<T, R, C = undefined> extends EventEmitter {
    private _queue;
    private _startTime?;
    private _interval;
    private _queueProcessor?;
    private _thisArg?;
    private _processed;
    private _paused;
    private _concurrency;
    private _running;
    constructor(processor?: Processor<T, R, C>, interval?: number, thisArg?: C, concurrency?: number);
    enqueue(args?: T[], processor?: Processor<T, R, C>, thisArg?: C): {
        id: string;
        promise: Promise<R>;
    };
    cancel(id: string): boolean;
    clear(): void;
    private _tryProcessNext;
    private _processQueue;
    pause(ms?: number): void;
    resume(): void;
    get size(): number;
    get processed(): number;
    get interval(): number;
    get timeleft(): number;
    set interval(interval: number);
    get startTime(): number | undefined;
    get processor(): Processor<T, R, C> | undefined;
    set processor(processor: Processor<T, R, C>);
    get concurrency(): number;
    set concurrency(value: number);
}
export declare class AsyncQueues<T, R, C> {
    private _queues;
    private _idToQueue;
    private _defaultProcessor;
    private _defaultInterval;
    private _defaultThisArg;
    constructor(processor?: Processor<T, R, C>, interval?: number, thisArg?: C);
    create(name: string, processor?: Processor<T, R, C>, interval?: number, thisArg?: C): AsyncQueue<T, R, C> | undefined;
    enqueue(name: string, args: T[], processor?: Processor<T, R, C>, thisArg?: C): {
        id: string;
        promise: Promise<R>;
    };
    getQueue(name: string): AsyncQueue<T, R, C> | undefined;
    getSize(name?: string): number;
    getProcessed(name?: string): number;
    getTimeLeft(name?: string): number;
    getStartTime(name?: string): number | undefined;
    getReport(name?: string): string;
    get defaultInterval(): number | undefined;
    set defaultInterval(interval: number);
    get defaultProcessor(): Processor<T, R, C> | undefined;
    set defaultProcessor(processor: Processor<T, R, C>);
    cancel(name: string, id: string): boolean;
    cancelById(id: string): boolean;
    remove(name: string): boolean;
    clear(name: string): boolean;
    pause(name?: string): void;
    resume(name?: string): void;
}
