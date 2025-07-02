import { setTimeout } from 'timers/promises';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
export class AsyncQueue extends EventEmitter {
    constructor(processor, interval = 0, thisArg, concurrency = 1) {
        super();
        this._queue = [];
        this._processed = 0;
        this._paused = false;
        this._concurrency = 1;
        this._running = 0;
        this._queueProcessor = processor;
        this._interval = interval;
        this._thisArg = thisArg;
        this._concurrency = concurrency;
    }
    enqueue(args = [], processor, thisArg) {
        if (!processor)
            processor = this._queueProcessor;
        if (!thisArg)
            thisArg = this._thisArg;
        const id = randomUUID();
        let rejectRef;
        const promise = new Promise((resolve, reject) => {
            rejectRef = reject;
            if (!processor)
                return reject(`no processor!`);
            const item = { id, processor, args, thisArg, resolve, reject };
            this._queue.push(item);
            this.emit('enqueue', item);
            this._tryProcessNext();
        });
        promise._reject = rejectRef;
        return { id, promise };
    }
    cancel(id) {
        const idx = this._queue.findIndex(item => item.id === id);
        if (idx !== -1) {
            const [item] = this._queue.splice(idx, 1);
            item.reject(new Error('Cancelled'));
            return true;
        }
        return false;
    }
    clear() {
        while (this._queue.length > 0) {
            const item = this._queue.shift();
            item.reject(new Error('Flushed'));
        }
    }
    _tryProcessNext() {
        while (this._running < this._concurrency &&
            this._queue.length > 0 &&
            !this._paused) {
            this._processQueue();
        }
    }
    async _processQueue() {
        if (this._paused || this._running >= this._concurrency || this._queue.length === 0) {
            return;
        }
        this._running++;
        if (this._processed == 0)
            this._startTime = new Date().getTime();
        if (this._interval > 0 && this._processed > 0) {
            await setTimeout(this._interval);
        }
        const item = this._queue.shift();
        this.emit('dequeue', item);
        const { processor, args, thisArg, resolve, reject } = item;
        try {
            const result = await processor.apply(thisArg, args);
            resolve(result);
            this.emit('processed', result, item);
        }
        catch (error) {
            console.error("Error processing queue item:", error);
            reject(error);
            if (this.listenerCount('error') > 0) {
                this.emit('error', error, item);
            }
            else {
                console.error('Unhandled queue error:', error, item);
            }
        }
        finally {
            this._processed++;
            this._running--;
            this._tryProcessNext();
        }
    }
    pause(ms) {
        this._paused = true;
        this.emit('pause');
        if (ms)
            (async function (that, ms) {
                await setTimeout(ms);
                that.resume();
            })(this, ms);
    }
    resume() {
        this._paused = false;
        this.emit('resume');
        this._tryProcessNext();
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
    get timeleft() {
        return this.size * this.interval;
    }
    set interval(interval) {
        this._interval = interval;
    }
    get startTime() {
        return this._startTime;
    }
    get processor() {
        return this._queueProcessor;
    }
    set processor(processor) {
        this._queueProcessor = processor;
    }
    get concurrency() {
        return this._concurrency;
    }
    set concurrency(value) {
        this._concurrency = Math.max(1, value);
        this._tryProcessNext();
    }
}
export class AsyncQueues {
    constructor(processor, interval, thisArg) {
        this._queues = new Map();
        this._idToQueue = new Map();
        this._defaultProcessor = processor;
        this._defaultInterval = interval;
        this._defaultThisArg = thisArg;
    }
    create(name, processor, interval, thisArg) {
        if (!processor)
            processor = this._defaultProcessor;
        if (!interval && interval != 0)
            interval = this._defaultInterval;
        if (!thisArg)
            thisArg = this._defaultThisArg;
        let queue = new AsyncQueue(processor, interval, thisArg);
        this._queues.set(name, queue);
        queue.on('processed', (_result, item) => {
            this._idToQueue.delete(item.id);
        });
        queue.on('error', (_err, item) => {
            this._idToQueue.delete(item.id);
        });
        return queue;
    }
    enqueue(name, args, processor, thisArg) {
        const queue = this._queues.get(name);
        if (!queue) {
            throw new Error(`No queue with name "${name}"`);
        }
        const { id, promise } = queue.enqueue(args, processor, thisArg);
        this._idToQueue.set(id, queue);
        return { id, promise };
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
    getTimeLeft(name) {
        if (name) {
            const queue = this._queues.get(name);
            if (queue) {
                return queue.timeleft;
            }
            else {
                console.warn(`no queue with name ${name}`);
                return 0;
            }
        }
        else {
            let timeleft = 0;
            this._queues.forEach(queue => {
                timeleft = Math.max(timeleft, queue.timeleft);
            });
            return timeleft;
        }
    }
    getStartTime(name) {
        if (name) {
            const queue = this._queues.get(name);
            if (queue) {
                return queue.startTime;
            }
            else {
                console.warn(`no queue with name ${name}`);
                return;
            }
        }
        else {
            let startTime;
            this._queues.forEach(queue => {
                if (queue.startTime) {
                    startTime = startTime ? Math.min(startTime, queue.startTime) : queue.startTime;
                }
            });
            return startTime;
        }
    }
    getReport(name) {
        let startTime = this.getStartTime(name);
        return `QUEUE REPORT${name ? `: ${name}` : ''}
\t${name ? '' : 'Default '}Processor: ${name ? this.getQueue(name)?.processor : this.defaultProcessor}
\tStarted: ${startTime ? new Date(startTime).toLocaleString() : 'not started'}
\tElapsed: ${startTime ? Math.round((new Date().getTime() - startTime) / 600) / 100 + ' minutes' : 'not started'}
\t${name ? '' : 'Default '}Interval: ${name ? this.getQueue(name)?.interval : this.defaultInterval}
\tProcessed: ${this.getProcessed(name)}
\tIn queue: ${this.getSize(name)}
\tTime to flush current queue: ${Math.round(this.getTimeLeft(name) / 600) / 100} minutes`;
    }
    get defaultInterval() {
        return this._defaultInterval;
    }
    set defaultInterval(interval) {
        this._defaultInterval = interval;
    }
    get defaultProcessor() {
        return this._defaultProcessor;
    }
    set defaultProcessor(processor) {
        this._defaultProcessor = processor;
    }
    cancel(name, id) {
        const queue = this._queues.get(name);
        if (!queue)
            return false;
        return queue.cancel(id);
    }
    cancelById(id) {
        const queue = this._idToQueue.get(id);
        if (!queue)
            return false;
        return queue.cancel(id);
    }
    remove(name) {
        const queue = this._queues.get(name);
        if (!queue)
            return false;
        queue.clear();
        this._queues.delete(name);
        return true;
    }
    clear(name) {
        const queue = this._queues.get(name);
        if (!queue)
            return false;
        queue.clear();
        return true;
    }
    pause(name) {
        if (name) {
            const queue = this._queues.get(name);
            if (queue)
                queue.pause();
        }
        else {
            for (const queue of this._queues.values()) {
                queue.pause();
            }
        }
    }
    resume(name) {
        if (name) {
            const queue = this._queues.get(name);
            if (queue)
                queue.resume();
        }
        else {
            for (const queue of this._queues.values()) {
                queue.resume();
            }
        }
    }
}
