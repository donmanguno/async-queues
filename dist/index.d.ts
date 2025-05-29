export type Processor<T, R> = (...args: T[]) => Promise<R>;
export interface QueuedItem<T, R> {
    args: T[];
    thisArg?: {};
    processor: (...args: T[]) => Promise<R>;
    resolve: (value: R | PromiseLike<R>) => void;
    reject: (reason?: any) => void;
}
export declare class AsyncQueue<T, R> {
    private _queue;
    private _interval;
    private _queueProcessor?;
    private _thisArg?;
    private _processing;
    private _processed;
    private _paused;
    constructor(processor?: Processor<T, R>, interval?: number, thisArg?: {});
    enqueue(args?: T[], processor?: Processor<T, R>, thisArg?: {}): Promise<R>;
    private _processQueue;
    pause(): void;
    resume(): void;
    get size(): number;
    get processed(): number;
    get interval(): number;
    set interval(interval: number);
    get processor(): Processor<T, R> | undefined;
    set processor(processor: Processor<T, R>);
}
export declare class AsyncQueues<T, R> {
    private _queues;
    private _defaultProcessor;
    private _defaultInterval;
    private _defaultThisArg;
    constructor(processor?: Processor<T, R>, interval?: number, thisArg?: {});
    create(name: string, processor?: Processor<T, R>, interval?: number, thisArg?: object | undefined): AsyncQueue<T, R> | undefined;
    enqueue(name: string, args: T[], processor?: Processor<T, R>, thisArg?: {}): Promise<R>;
    getQueue(name: string): AsyncQueue<T, R> | undefined;
    getSize(name?: string): number;
    getProcessed(name?: string): number;
    getQueueInterval(name: string): number | undefined;
    setQueueInterval(name: string, interval: number): number | undefined;
    get interval(): number | undefined;
    set interval(interval: number);
    get processor(): Processor<T, R> | undefined;
    set processor(processor: Processor<T, R>);
}
//# sourceMappingURL=index.d.ts.map