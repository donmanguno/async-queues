import { setTimeout } from 'timers/promises';
export class AsyncQueue {
    _queue = [];
    _startTime;
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
            if (this._processed == 0)
                this._startTime = new Date().getTime();
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
    pause(ms) {
        this._paused = true;
        this._processing = false;
        if (ms)
            (async function (that, ms) {
                await setTimeout(ms);
                that.resume();
            })(this, ms);
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
        if (!interval && interval != 0)
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
        let processor;
        if (name)
            processor = this.getQueue(name)?.processor;
        return `QUEUE REPORT${name ? `: ${name}` : ''}
\t${name ? '' : 'Default '}Processor: ${processor ? processor.name : this.defaultProcessor?.name}
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
}
