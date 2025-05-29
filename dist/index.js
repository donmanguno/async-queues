import { setTimeout } from 'timers/promises';
export class AsyncQueue {
    _queue = [];
    _interval;
    _queueProcessor;
    _thisArg;
    _processing = false;
    _processed = 0;
    _paused = false;
    constructor(processor, interval = 0, thisArg) {
        this._queueProcessor = processor;
        this._interval = interval;
        this._thisArg = thisArg;
    }
    enqueue(args = [], processor, thisArg) {
        if (!processor)
            processor = this._queueProcessor;
        if (!thisArg)
            thisArg = this._thisArg;
        return new Promise((resolve, reject) => {
            if (!processor)
                return reject(`no processor!`);
            this._queue.push({ processor, args, thisArg, resolve, reject });
            this._processQueue();
        });
    }
    async _processQueue() {
        if (this._processing) {
            return;
        }
        this._processing = true;
        while (this._queue.length > 0 && this._paused == false) {
            if (this._interval > 0 && this._processed > 0) {
                await setTimeout(this._interval);
            }
            const { processor, args, thisArg, resolve, reject } = this._queue.shift();
            try {
                const result = processor.apply(thisArg, args);
                resolve(result);
            }
            catch (error) {
                console.error("Error processing queue item:", error);
                reject(error);
            }
            finally {
                this._processed++;
            }
        }
        this._processing = false;
    }
    pause() {
        this._paused = true;
        this._processing = false;
    }
    resume() {
        this._paused = false;
        this._processQueue();
    }
    get size() {
        return this._queue.length;
    }
    get processed() {
        return this._processed;
    }
    get interval() {
        return this._interval;
    }
    set interval(interval) {
        this._interval = interval;
    }
    get processor() {
        return this._queueProcessor;
    }
    set processor(processor) {
        this._queueProcessor = processor;
    }
}
export class AsyncQueues {
    _queues = new Map();
    _defaultProcessor;
    _defaultInterval;
    _defaultThisArg;
    constructor(processor, interval, thisArg) {
        this._defaultProcessor = processor;
        this._defaultInterval = interval;
        this._defaultThisArg = thisArg;
    }
    create(name, processor, interval, thisArg) {
        if (!processor)
            processor = this._defaultProcessor;
        if (!interval)
            interval = this._defaultInterval;
        if (!thisArg)
            thisArg = this._defaultThisArg;
        let queue = new AsyncQueue(processor, interval, thisArg);
        this._queues.set(name, queue);
        return queue;
    }
    enqueue(name, args, processor, thisArg) {
        const queue = this._queues.get(name);
        if (!queue) {
            return Promise.reject(new Error(`No queue with name "${name}"`));
        }
        return queue.enqueue(args, processor, thisArg);
    }
    getQueue(name) {
        const queue = this._queues.get(name);
        return queue;
    }
    getSize(name) {
        if (name) {
            const queue = this._queues.get(name);
            if (queue) {
                return queue.size;
            }
            else {
                console.warn(`no queue with name ${name}`);
                return 0;
            }
        }
        else {
            let size = 0;
            this._queues.forEach(queue => {
                size += queue.size;
            });
            return size;
        }
    }
    getProcessed(name) {
        if (name) {
            const queue = this._queues.get(name);
            if (queue) {
                return queue.processed;
            }
            else {
                console.warn(`no queue with name ${name}`);
                return 0;
            }
        }
        else {
            let processed = 0;
            this._queues.forEach(queue => {
                processed += queue.processed;
            });
            return processed;
        }
    }
    getQueueInterval(name) {
        const queue = this._queues.get(name);
        if (queue) {
            return queue.interval;
        }
        else {
            console.warn(`no queue with name ${name}`);
        }
    }
    setQueueInterval(name, interval) {
        const queue = this._queues.get(name);
        if (queue) {
            queue.interval = interval;
            return queue.interval;
        }
        else {
            console.warn(`no queue with name ${name}`);
        }
    }
    get interval() {
        return this._defaultInterval;
    }
    set interval(interval) {
        this._defaultInterval = interval;
    }
    get processor() {
        return this._defaultProcessor;
    }
    set processor(processor) {
        this._defaultProcessor = processor;
    }
}
