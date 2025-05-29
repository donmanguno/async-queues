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
  */
  pause() {
    this._paused = true;
    this._processing = false;
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
  * Set a new queue interval
  */
  set interval(interval: number) {
    this._interval = interval;
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
		if (!interval) interval = this._defaultInterval;
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
	* 
	* @param name Name of the queue
	* @returns the interval in ms of the named queue
	*/
	getQueueInterval(name: string): number | undefined {
		const queue = this._queues.get(name);
		if (queue) {
			return queue.interval;
		} else {
			console.warn(`no queue with name ${name}`);
		}
	}
	
	/**
	* 
	* @param name Name of the queue
	* @param interval New interval in ms
	* @returns the new interval of the named queue
	*/
	setQueueInterval(name: string, interval: number): number | undefined {
		const queue = this._queues.get(name);
		if (queue) {
			queue.interval = interval;
			return queue.interval;
		} else {
			console.warn(`no queue with name ${name}`);
		}
	}

	/**
	* @returns The current default interval
	*/
	get interval(): number | undefined {
		return this._defaultInterval;
	}
	
	/**
	* Set a new default interval
	*/
	set interval(interval: number) {
		this._defaultInterval = interval;
	}

	/**
	 * get the default processor function
	 */
	get processor(): Processor<T, R> | undefined {
		return this._defaultProcessor;
	}

	/**
	 * Set a new default processor function
	 * This will only apply to newly-created queues (without their own processor)
	 */
	set processor(processor: Processor<T, R>) {
		this._defaultProcessor = processor;
	}
}