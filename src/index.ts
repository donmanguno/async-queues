import { setTimeout } from 'timers/promises';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

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

export class AsyncQueue<T, R, C = undefined> extends EventEmitter {
  private _queue: QueuedItem<T, R, C>[] = [];

  private _startTime?: number;
  private _interval: number;
  private _queueProcessor?: Processor<T, R, C>;
  private _thisArg?: C;

  private _processed: number = 0;
  private _paused: boolean = false;
  private _concurrency: number = 1;
  private _running: number = 0;
  
  /**
  * @param processor The default processor function for this queue
  * @param interval how long to wait between processing queue items
  * @param thisArg the default "this" context for the processor execution
  * @param concurrency how many items to process in parallel (default 1)
  */
  constructor(processor?: Processor<T, R, C>, interval: number = 0, thisArg?: C, concurrency: number = 1) {
    super();
    this._queueProcessor = processor;
    this._interval = interval;
    this._thisArg = thisArg;
    this._concurrency = concurrency;
  }
  
  /**
  * Add an item to the queue. This item should be whatever argument the Processor function expects.
  * @param item This item should be whatever argument the Processor function expects.
  * @param processor A custom processor for this queue item
  * @param thisArg the "this" context for the processor execution for this queue item
  * @returns An object with the unique id and a Promise that resolves after the item is processed.
  *
  * @emits enqueue
  */
  enqueue(args: T[] = [], processor?: Processor<T, R, C>, thisArg?: C): { id: string, promise: Promise<R> } {
    if (!processor) processor = this._queueProcessor;
    if (!thisArg) thisArg = this._thisArg;
    const id = randomUUID();
    const promise = new Promise<R>((resolve, reject) => {
      if (!processor) return reject(`no processor!`)
      const item: QueuedItem<T, R, C> = { id, processor, args, thisArg, resolve, reject };
      this._queue.push(item);
      this.emit('enqueue', item);
      this._tryProcessNext();
    });
    return { id, promise };
  }

  /**
   * Cancel a pending item by its id. If found and not yet processing, removes it and rejects its promise.
   * @param id The id of the item to cancel.
   * @returns true if cancelled, false if not found or already processing.
   */
  cancel(id: string): boolean {
    const idx = this._queue.findIndex(item => item.id === id);
    if (idx !== -1) {
      const [item] = this._queue.splice(idx, 1);
      item.reject(new Error('Cancelled'));
      return true;
    }
    return false;
  }

  /**
   * Clear all pending (not yet processing) items from the queue, rejecting their promises.
   */
  clear(): void {
    while (this._queue.length > 0) {
      const item = this._queue.shift()!;
      item.reject(new Error('Flushed'));
    }
  }

  private _tryProcessNext() {
    // Start as many as possible up to concurrency
    while (
      this._running < this._concurrency &&
      this._queue.length > 0 &&
      !this._paused
    ) {
      this._processQueue();
    }
  }

  private async _processQueue(): Promise<void> {
    if (this._paused || this._running >= this._concurrency || this._queue.length === 0) {
      return;
    }
    this._running++;
    // set the start time when processing the first item
    if (this._processed == 0) this._startTime = new Date().getTime();
    // no delay on the first loop
    if (this._interval > 0 && this._processed > 0) { await setTimeout(this._interval) }
    const item = this._queue.shift()!;
    this.emit('dequeue', item);
    const { processor, args, thisArg, resolve, reject } = item;
    try {
      const result = await processor.apply(thisArg as C, args);
      resolve(result); // Resolve the promise associated with this item
      this.emit('processed', result, item);
    } catch (error) {
      console.error("Error processing queue item:", error);
      reject(error); // Reject the promise associated with this item
      if (this.listenerCount('error') > 0) {
        this.emit('error', error, item);
      } else {
        console.error('Unhandled queue error:', error, item);
      }
    } finally {
      this._processed++;
      this._running--;
      // Try to process more if possible
      this._tryProcessNext();
    }
  }
  
  /**
  * pause the queue
  * @param ms how long to pause for
  *
  * @emits pause
  */
  pause(ms?: number) {
    this._paused = true;
    this.emit('pause');
    if (ms) (async function (that: AsyncQueue<T,R,C>, ms: number) {
      await setTimeout(ms);
      that.resume();
    })(this, ms);
  }
  
  /**
  * resume the queue
  *
  * @emits resume
  */
  resume() {
    this._paused = false;
    this.emit('resume');
    this._tryProcessNext();
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
  get processor(): Processor<T, R, C> | undefined {
    return this._queueProcessor;
  }

  /**
   * Set a new queue processor function
   * This will only apply to newly-enqueued items (without their own processor)
   */
  set processor(processor: Processor<T, R, C>) {
    this._queueProcessor = processor;
  }

  /**
   * Get the current concurrency value
   */
  get concurrency(): number {
    return this._concurrency;
  }

  /**
   * Set a new concurrency value
   */
  set concurrency(value: number) {
    this._concurrency = Math.max(1, value);
    this._tryProcessNext();
  }
}


/**
* @param processor The default processor function for this set of queues
* @param interval The default interval for this set of queues
*/
export class AsyncQueues<T, R, C> {
	private _queues: Map<string, AsyncQueue<T, R, C>> = new Map();
	private _idToQueue: Map<string, AsyncQueue<T, R, C>> = new Map();

	private _defaultProcessor: Processor<T, R, C> | undefined;
	private _defaultInterval: number | undefined;
	private _defaultThisArg: C | undefined;
	
	constructor (processor?: Processor<T, R, C>, interval?: number, thisArg?: C) {
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
	create(name: string, processor?: Processor<T, R, C>, interval?: number, thisArg?: C): AsyncQueue<T, R, C> | undefined {
		if (!processor) processor = this._defaultProcessor;
		if (!interval && interval != 0) interval = this._defaultInterval;
		if (!thisArg) thisArg = this._defaultThisArg;

		let queue = new AsyncQueue(processor, interval, thisArg);
		this._queues.set(name, queue);
    // Listen for processed, cancelled, and flushed items to clean up the id map
    queue.on('processed', (_result, item) => {
      this._idToQueue.delete(item.id);
    });
    queue.on('error', (_err, item) => {
      this._idToQueue.delete(item.id);
    });
    // Also clean up on clear/cancel, but those will emit error
		return queue;
	}
	
	/**
	* Add an item to the named queue.
	* @param name Name of the queue.
	* @param args This item should be an array of whatever arguments the Processor function expects.
	* @param processor A custom processor for this queue item
	* @returns An object with the unique id and a Promise that resolves after the item is processed.
	*/
	enqueue(name: string, args: T[], processor?: Processor<T, R, C>, thisArg?: C): { id: string, promise: Promise<R> } {
		const queue = this._queues.get(name);
		if (!queue) {
			throw new Error(`No queue with name "${name}"`);
		}
		const { id, promise } = queue.enqueue(args, processor, thisArg);
    this._idToQueue.set(id, queue);
		return { id, promise };
	}
	
	/**
	* @param name  Name of the queue.
	* @returns a queue
	*/
	getQueue(name: string): AsyncQueue<T, R, C> | undefined {
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
\t${name ? '' : 'Default '}Processor: ${name ? this.getQueue(name)?.processor?.name : this.defaultProcessor?.name}
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
	get defaultProcessor(): Processor<T, R, C> | undefined {
		return this._defaultProcessor;
	}

	/**
	 * Set a new default processor function
	 * This will only apply to newly-created queues (without their own processor)
	 */
	set defaultProcessor(processor: Processor<T, R, C>) {
		this._defaultProcessor = processor;
	}

	/**
	 * Cancel a pending item in a named queue by its id.
	 * @param name Name of the queue.
	 * @param id The id of the item to cancel.
	 * @returns true if cancelled, false if not found or already processing.
	 */
	cancel(name: string, id: string): boolean {
		const queue = this._queues.get(name);
		if (!queue) return false;
		return queue.cancel(id);
	}

	/**
	 * Cancel a pending item by its id, searching all managed queues.
	 * @param id The id of the item to cancel.
	 * @returns true if cancelled, false if not found or already processing.
	 */
	cancelById(id: string): boolean {
		const queue = this._idToQueue.get(id);
		if (!queue) return false;
		return queue.cancel(id);
	}

	/**
	 * Remove a named queue and flush all its pending items.
	 * @param name Name of the queue to remove.
	 * @returns true if removed, false if not found.
	 */
	remove(name: string): boolean {
		const queue = this._queues.get(name);
		if (!queue) return false;
		queue.clear();
		this._queues.delete(name);
		return true;
	}

	/**
	 * Clear (flush) all pending items in the named queue.
	 * @param name Name of the queue to clear.
	 * @returns true if cleared, false if not found.
	 */
	clear(name: string): boolean {
		const queue = this._queues.get(name);
		if (!queue) return false;
		queue.clear();
		return true;
	}

	/**
	 * Pause all queues if no name is provided, or the named queue.
	 * @param name Optional name of the queue to pause. If not provided, pauses all queues.
	 */
	pause(name?: string): void {
		if (name) {
			const queue = this._queues.get(name);
			if (queue) queue.pause();
		} else {
			for (const queue of this._queues.values()) {
				queue.pause();
			}
		}
	}

	/**
	 * Resume all queues if no name is provided, or the named queue.
	 * @param name Optional name of the queue to resume. If not provided, resumes all queues.
	 */
	resume(name?: string): void {
		if (name) {
			const queue = this._queues.get(name);
			if (queue) queue.resume();
		} else {
			for (const queue of this._queues.values()) {
				queue.resume();
			}
		}
	}
}