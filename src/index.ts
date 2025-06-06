import { setTimeout } from 'timers/promises';

export type Processor<T, R> = (...args: T[]) => Promise<R>;

export interface QueuedItem<T, R> {
  args: T[];
  thisArg?: {};
  processor: (...args: T[]) => Promise<R>;
  resolve: (value: R | PromiseLike<R>) => void;
  reject: (reason?: any) => void;
}

export class AsyncQueue<T, R> {
  private _queue: QueuedItem<T, R>[] = [];

	private _startTime?: number;
  private _interval: number;
  private _queueProcessor?: Processor<T, R>;
  private _thisArg?: {};

  private _processing: boolean = false;
  private _processed: number = 0;
  private _paused: boolean = false;
  
  /**
  * @param processor The default processor function for this queue
  * @param interval how long to wait between processing queue items
  * @param thisArg the default "this" context for the processor execution
  */
  constructor(processor?: Processor<T, R>, interval: number = 0, thisArg?: {}) {
    this._queueProcessor = processor;
    this._interval = interval;
    this._thisArg = thisArg;
  }
  
  /**
  * Add an item to the queue. This item should be whatever argument the Processor function expects.
  * @param item This item should be whatever argument the Processor function expects.
  * @param processor A custom processor for this queue item
  * @param thisArg the "this" context for the processor execution for this queue item
  * @returns A Promise that resolves after the item is processed.
  */
  enqueue(args: T[] = [], processor?: Processor<T, R>, thisArg?: {}): Promise<R> {
    if (!processor) processor = this._queueProcessor;
    if (!thisArg) thisArg = this._thisArg;
    return new Promise((resolve, reject) => {
      if (!processor) return reject(`no processor!`)
      this._queue.push({ processor, args, thisArg, resolve, reject });
      this._processQueue();
    });
  }
  
  private async _processQueue(): Promise<void> {
    if (this._processing) {
      return;
    }
    
    this._processing = true;
    while (this._queue.length > 0 && this._paused == false) {
			// set the start time when processing the first item
			if (this._processed == 0) this._startTime = new Date().getTime();
      // no delay on the first loop
      if (this._interval > 0 && this._processed > 0) { await setTimeout(this._interval) }
      const { processor, args, thisArg, resolve, reject } = this._queue.shift()!;
      try {
        const result = processor.apply(thisArg, args)
        resolve(result); // Resolve the promise associated with this item
      } catch (error) {
        console.error("Error processing queue item:", error);
        reject(error); // Reject the promise associated with this item
      } finally {
        this._processed++
			}
    }
    this._processing = false;
  }
  
  /**
  * pause the queue
	* @param ms how long to pause for
  */
  pause(ms?: number) {
    this._paused = true;
    this._processing = false;
		if (ms) (async function (that: AsyncQueue<T,R>, ms: number) {
			await setTimeout(ms);
			that.resume();
		})(this, ms);
  }
  
  /**
  * resume the queue
  */
  resume() {
    this._paused = false;
    this._processQueue();
  }
  
  /**
  * @returns The number of items in the queue.
  */
  get size(): number {
    return this._queue.length;
  }
  
  /**
  * @returns The number of items that have been procssed.
  */
  get processed(): number {
    return this._processed;
  }
  
  /**
  * @returns The current queue interval
  */
  get interval(): number {
    return this._interval;
  }

	/** 
	 * @returns The number of milliseconds remaining
	 */
	get timeleft(): number {
		return this.size * this.interval;
	}
  
  /**
  * Set a new queue interval
  */
  set interval(interval: number) {
    this._interval = interval;
  }

	/**
	 * Get the time that this queue's first item was processed.  Returns undefined if nothing has been processed
	 */
	get startTime(): number | undefined {
		return this._startTime
	}

  /**
   * get the queue processor function
   */
  get processor(): Processor<T, R> | undefined {
    return this._queueProcessor;
  }

  /**
   * Set a new queue processor function
   * This will only apply to newly-enqueued items (without their own processor)
   */
  set processor(processor: Processor<T, R>) {
    this._queueProcessor = processor;
  }
}


/**
* @param processor The default processor function for this set of queues
* @param interval The default interval for this set of queues
*/
export class AsyncQueues<T, R> {
	private _queues: Map<string, AsyncQueue<T, R>> = new Map();

	private _defaultProcessor: Processor<T, R> | undefined;
	private _defaultInterval: number | undefined;
	private _defaultThisArg: object | undefined;
	
	constructor (processor?: Processor<T, R>, interval?: number, thisArg?: {}) {
		this._defaultProcessor = processor;
		this._defaultInterval = interval;
		this._defaultThisArg = thisArg;
	}
	
	/**
	* Creates a new named asynchronous queue.
	* @param name Name of the queue.
	* @param processor Processor function
	* @param interval how long to wait between processing queue items
	* @param thisArg the "this" context for the processor execution
	* @returns The newly created AsyncQueue.
	*/
	create(name: string, processor?: Processor<T, R>, interval?: number, thisArg?: object | undefined): AsyncQueue<T, R> | undefined {
		if (!processor) processor = this._defaultProcessor;
		if (!interval && interval != 0) interval = this._defaultInterval;
		if (!thisArg) thisArg = this._defaultThisArg;

		let queue = new AsyncQueue(processor, interval, thisArg);
		this._queues.set(name, queue);
		return queue;
	}
	
	/**
	* Add an item to the named queue.
	* @param name Name of the queue.
	* @param args This item should be an array of whatever arguments the Processor function expects.
	* @param processor A custom processor for this queue item
	* @returns A Promise that resolves after the item is processed.
	*/
	enqueue(name: string, args: T[], processor?: Processor<T, R>, thisArg?: {}): Promise<R> {
		const queue = this._queues.get(name);
		if (!queue) {
			return Promise.reject(new Error(`No queue with name "${name}"`));
		}
		return queue.enqueue(args, processor, thisArg);
	}
	
	/**
	* @param name  Name of the queue.
	* @returns a queue
	*/
	getQueue(name: string): AsyncQueue<T, R> | undefined {
		const queue = this._queues.get(name)
		return queue;
	}
	
	/**
	* Gets the size of a named queue or the total size of all queues.
	* @param name Name of the queue. If not provided, all queue sizes will be totaled.
	* @returns The size of the specified queue or the total size of all queues.
	*/
	getSize(name?: string): number {
		if (name) {
			const queue = this._queues.get(name);
			if (queue) {
				return queue.size;
			} else {
				console.warn(`no queue with name ${name}`);
				return 0;
			}
		} else {
			let size = 0;
			this._queues.forEach(queue => {
				size += queue.size;
			});
			return size;
		}
	}
	
	/**
	* Gets the number of items processed by a named queue, or the total of all queues.
	* @param name Name of the queue. If not provided, all queue processed counts will be totaled.
	* @returns The number of processed items for the specified queue or the total for all queues.
	*/
	getProcessed(name?: string): number {
		if (name) {
			const queue = this._queues.get(name);
			if (queue) {
				return queue.processed;
			} else {
				console.warn(`no queue with name ${name}`);
				return 0;
			}
		} else {
			let processed = 0;
			this._queues.forEach(queue => {
				processed += queue.processed;
			});
			return processed;
		}
	}	
	
	/**
	* Gets the size of a named queue or the total size of all queues.
	* @param name Name of the queue. If not provided, max time left will be returned.
	* @returns The amount of time left for the queue, or the max for all queues
	*/
	getTimeLeft(name?: string): number {
		if (name) {
			const queue = this._queues.get(name);
			if (queue) {
				return queue.timeleft;
			} else {
				console.warn(`no queue with name ${name}`);
				return 0;
			}
		} else {
			let timeleft = 0;
			this._queues.forEach(queue => {
				timeleft = Math.max(timeleft, queue.timeleft);
			});
			return timeleft;
		}
	}

	/**
	 * Gets the start time for the named queue, or the queue that started first.
	 * @param name Name of the queue. If not provided, the earliest start time will be returned.
	 * @returns The epoch timestamp when the queue was started. Undefined if queue not started.
	 */
	getStartTime(name?: string): number | undefined {
		if (name) {
			const queue = this._queues.get(name);
			if (queue) {
				return queue.startTime;
			} else {
				console.warn(`no queue with name ${name}`);
				return;
			}
		} else {
			let startTime: number | undefined;
			this._queues.forEach(queue => {
				if (queue.startTime) {
					startTime = startTime ? Math.min(startTime, queue.startTime) : queue.startTime
				}
			})
			return startTime;
		}
	}

	/**
	 * Generates a report on the named queue or all queues
	 * @param name Optional queue name on which to report
	 * @returns a report on the named queue, or on all queues if no name provided
	 */
	getReport(name?: string): string {
		let startTime = this.getStartTime(name);

		return `QUEUE REPORT${name ? `: ${name}` : ''}
\t${name ? '' : 'Default '}Processor: ${name ? this.getQueue(name)?.processor : this.defaultProcessor}
\tStarted: ${startTime ? new Date(startTime).toLocaleString() : 'not started'}
\tElapsed: ${startTime ? Math.round((new Date().getTime() - startTime)/600)/100 + ' minutes' : 'not started'}
\t${name ? '' : 'Default '}Interval: ${name ? this.getQueue(name)?.interval : this.defaultInterval}
\tProcessed: ${this.getProcessed(name)}
\tIn queue: ${this.getSize(name)}
\tTime to flush current queue: ${Math.round(this.getTimeLeft(name)/600)/100} minutes`
	}

	/**
	* @returns The current default interval
	*/
	get defaultInterval(): number | undefined {
		return this._defaultInterval;
	}
	
	/**
	* Set a new default interval
	*/
	set defaultInterval(interval: number) {
		this._defaultInterval = interval;
	}

	/**
	 * get the default processor function
	 */
	get defaultProcessor(): Processor<T, R> | undefined {
		return this._defaultProcessor;
	}

	/**
	 * Set a new default processor function
	 * This will only apply to newly-created queues (without their own processor)
	 */
	set defaultProcessor(processor: Processor<T, R>) {
		this._defaultProcessor = processor;
	}
}