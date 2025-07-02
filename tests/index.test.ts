import { AsyncQueue, AsyncQueues, Processor } from '../src/index';

describe('AsyncQueue', () => {
  it('emits events for enqueue, dequeue, processed, pause, resume, and error', async () => {
    const events: string[] = [];
    const processedResults: number[] = [];
    const errors: any[] = [];
    const queue = new AsyncQueue<number, number, undefined>(async (x) => x * 2);
    queue.on('error', () => {}); // Prevent ERR_UNHANDLED_ERROR

    queue.on('enqueue', (item) => { events.push('enqueue'); });
    queue.on('dequeue', (item) => { events.push('dequeue'); });
    queue.on('processed', (result, item) => { events.push('processed'); processedResults.push(result); });
    queue.on('pause', () => { events.push('pause'); });
    queue.on('resume', () => { events.push('resume'); });
    queue.on('error', (err, item) => { events.push('error'); errors.push(err); });

    // Enqueue a successful item
    await queue.enqueue([5]).promise;
    expect(events).toContain('enqueue');
    expect(events).toContain('dequeue');
    expect(events).toContain('processed');
    expect(processedResults).toContain(10);

    // Pause and resume
    queue.pause();
    expect(events).toContain('pause');
    queue.resume();
    expect(events).toContain('resume');

    // Enqueue an item that throws
    const errorQueue = new AsyncQueue<number, number, undefined>(async () => { throw new Error('fail'); });
    errorQueue.on('error', () => {}); // Prevent ERR_UNHANDLED_ERROR
    const errorEvents: string[] = [];
    let errorCaught = false;
    errorQueue.on('error', (err) => { errorEvents.push('error'); });
    errorQueue.on('enqueue', () => { errorEvents.push('enqueue'); });
    errorQueue.on('dequeue', () => { errorEvents.push('dequeue'); });
    errorQueue.on('processed', () => { errorEvents.push('processed'); });
    try {
      await errorQueue.enqueue([1]).promise;
    } catch (e) {
      errorCaught = true;
    }
    expect(errorCaught).toBe(true);
    expect(errorEvents).toEqual(['enqueue', 'dequeue', 'error']);
  });

  it('processes a single item', async () => {
    const processor: Processor<number, number, undefined> = async (x) => x * 2;
    const queue = new AsyncQueue(processor);
    queue.on('error', () => {}); // Prevent ERR_UNHANDLED_ERROR
    const result = await queue.enqueue([5]).promise;
    expect(result).toBe(10);
    expect(queue.size).toBe(0);
    expect(queue.processed).toBe(1);
  });

  it('processes multiple items in order', async () => {
    const results: number[] = [];
    const processor: Processor<number, number, undefined> = async (x) => { results.push(x); return x; };
    const queue = new AsyncQueue(processor);
    queue.on('error', () => {}); // Prevent ERR_UNHANDLED_ERROR
    const items = [queue.enqueue([1]).promise, queue.enqueue([2]).promise, queue.enqueue([3]).promise];
    await Promise.all(items);
    expect(results).toEqual([1, 2, 3]);
    expect(queue.size).toBe(0);
    expect(queue.processed).toBe(3);
  });

  it('supports custom thisArg', async () => {
    interface Ctx { base: number; }
    const processor: Processor<number, number, Ctx> = async function (this: Ctx, x) { return this.base + x; };
    const queue = new AsyncQueue(processor, 0, { base: 10 });
    queue.on('error', () => {}); // Prevent ERR_UNHANDLED_ERROR
    const result = await queue.enqueue([5]).promise;
    expect(result).toBe(15);
  });

  it('respects interval between items', async () => {
    const times: number[] = [];
    const processor: Processor<undefined, void, undefined> = async () => { times.push(Date.now()); };
    const queue = new AsyncQueue(processor, 100);
    queue.on('error', () => {}); // Prevent ERR_UNHANDLED_ERROR
    await queue.enqueue([]).promise;
    await queue.enqueue([]).promise;
    expect(times.length).toBe(2);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(90); // allow some leeway
  });

  it('can pause and resume', async () => {
    let processed = 0;
    const processor: Processor<undefined, void, undefined> = async () => { processed++; };
    const queue = new AsyncQueue(processor);
    queue.on('error', () => {}); // Prevent ERR_UNHANDLED_ERROR
    queue.pause();
    const { promise } = queue.enqueue([]);
    expect(queue.size).toBe(1);
    expect(processed).toBe(0);
    queue.resume();
    await promise;
    expect(processed).toBe(1);
  });

  it('rejects if no processor is provided', async () => {
    const queue = new AsyncQueue();
    queue.on('error', () => {}); // Prevent ERR_UNHANDLED_ERROR
    const { promise } = queue.enqueue([1]);
    await expect(promise).rejects.toMatch('no processor');
  });

  it('handles processor errors', async () => {
    const processor: Processor<undefined, void, undefined> = async () => { throw new Error('fail'); };
    const queue = new AsyncQueue(processor);
    queue.on('error', () => {}); // Prevent ERR_UNHANDLED_ERROR
    const { promise } = queue.enqueue([]);
    await expect(promise).rejects.toThrow('fail');
  });

  it('processes items concurrently up to the concurrency limit', async () => {
    const concurrency = 3;
    const delay = 100;
    let running = 0;
    let maxRunning = 0;
    const processor: Processor<number, number, undefined> = async (x) => {
      running++;
      if (running > maxRunning) maxRunning = running;
      await new Promise(res => setTimeout(res, delay));
      running--;
      return x * 2;
    };
    const queue = new AsyncQueue(processor, 0, undefined, concurrency);
    queue.on('error', () => {});
    const start = Date.now();
    const items = [
      queue.enqueue([1]),
      queue.enqueue([2]),
      queue.enqueue([3]),
      queue.enqueue([4]),
      queue.enqueue([5]),
      queue.enqueue([6]),
    ];
    const results = await Promise.all(items.map(i => i.promise));
    const elapsed = Date.now() - start;
    // With concurrency 3 and 6 items, should take a bit more than 2 * delay
    expect(elapsed).toBeGreaterThanOrEqual(2 * delay);
    expect(elapsed).toBeLessThan(3 * delay + 50); // allow some leeway
    expect(maxRunning).toBe(concurrency);
    expect(results).toEqual([2, 4, 6, 8, 10, 12]);
  });

  it('returns a unique UUID for each enqueued item', async () => {
    const queue = new AsyncQueue<number, number, undefined>(async (x) => x * 2);
    queue.on('error', () => {});
    const ids = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const { id, promise } = queue.enqueue([i]);
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(10); // UUIDs are long
      ids.add(id);
      await promise;
    }
    expect(ids.size).toBe(10);
  });

  it('can cancel a pending item by id', async () => {
    const queue = new AsyncQueue<number, number, undefined>(async (x) => x * 2);
    queue.on('error', () => {});
    queue.pause();
    const { id, promise } = queue.enqueue([1]);
    const cancelled = queue.cancel(id);
    expect(cancelled).toBe(true);
    await expect(promise).rejects.toThrow('Cancelled');
  });

  it('cannot cancel an item that is already processing or processed', async () => {
    const queue = new AsyncQueue<number, number, undefined>(async (x) => x * 2);
    queue.on('error', () => {});
    const { id, promise } = queue.enqueue([2]);
    await promise;
    const cancelled = queue.cancel(id);
    expect(cancelled).toBe(false);
  });

  it('clear() flushes all pending items and rejects their promises', async () => {
    const queue = new AsyncQueue<number, number, undefined>(async (x) => x * 2);
    queue.on('error', () => {});
    // Pause so items stay pending
    queue.pause();
    const items = [queue.enqueue([1]), queue.enqueue([2]), queue.enqueue([3])];
    queue.clear();
    for (const { promise } of items) {
      await expect(promise).rejects.toThrow('Flushed');
    }
    expect(queue.size).toBe(0);
  });
});

describe('AsyncQueues', () => {
  it('creates and retrieves named queues', () => {
    const queues = new AsyncQueues();
    const q = queues.create('test');
    expect(queues.getQueue('test')).toBe(q);
  });

  it('enqueues to named queue', async () => {
    const processor: Processor<number, number, undefined> = async (x) => x + 1;
    const queues = new AsyncQueues(processor);
    queues.create('a');
    const result = await queues.enqueue('a', [5]).promise;
    expect(result).toBe(6);
  });

  it('returns 0 for non-existent queue size/processed', () => {
    const queues = new AsyncQueues();
    expect(queues.getSize('nope')).toBe(0);
    expect(queues.getProcessed('nope')).toBe(0);
  });

  it('aggregates size and processed across all queues', async () => {
    const processor: Processor<number, number, undefined> = async (x) => x;
    const queues = new AsyncQueues(processor);
    queues.create('a');
    queues.create('b');
    await queues.enqueue('a', [1]).promise;
    await queues.enqueue('b', [2]).promise;
    expect(queues.getSize()).toBe(0);
    expect(queues.getProcessed()).toBe(2);
  });

  it('getReport returns a string', () => {
    const queues = new AsyncQueues();
    queues.create('a');
    expect(typeof queues.getReport('a')).toBe('string');
    expect(typeof queues.getReport()).toBe('string');
  });

  it('can cancel a pending item by id without knowing the queue name', async () => {
    const queues = new AsyncQueues<number, number, undefined>();
    const queueName = 'test';
    const queue = queues.create(queueName, async (x) => x * 2);
    queue!.on('error', () => {});
    queue!.pause(); // Ensure item stays pending
    const { id, promise } = queues.enqueue(queueName, [5]);
    const cancelled = queues.cancelById(id);
    expect(cancelled).toBe(true);
    await expect(promise).rejects.toThrow('Cancelled');
  });

  it('cannot cancel an item by id if it is already processed', async () => {
    const queues = new AsyncQueues<number, number, undefined>();
    const queueName = 'test';
    const queue = queues.create(queueName, async (x) => x * 2);
    queue!.on('error', () => {});
    const { id, promise } = queues.enqueue(queueName, [10]);
    await promise;
    const cancelled = queues.cancelById(id);
    expect(cancelled).toBe(false);
  });

  it('cancelById returns false for unknown ids', () => {
    const queues = new AsyncQueues<number, number, undefined>();
    expect(queues.cancelById('not-a-real-id')).toBe(false);
  });

  it('remove(name) flushes and deletes the queue', async () => {
    const queues = new AsyncQueues<number, number, undefined>();
    const queue = queues.create('a', async (x) => x * 2);
    queue!.on('error', () => {});
    queue!.pause();
    const { promise } = queues.enqueue('a', [1]);
    const removed = queues.remove('a');
    expect(removed).toBe(true);
    await expect(promise).rejects.toThrow('Flushed');
    expect(queues.getQueue('a')).toBeUndefined();
  });

  it('clear(name) flushes all pending items in the named queue', async () => {
    const queues = new AsyncQueues<number, number, undefined>();
    const queue = queues.create('a', async (x) => x * 2);
    queue!.on('error', () => {});
    queue!.pause();
    const items = [queues.enqueue('a', [1]), queues.enqueue('a', [2])];
    const cleared = queues.clear('a');
    expect(cleared).toBe(true);
    for (const { promise } of items) {
      await expect(promise).rejects.toThrow('Flushed');
    }
    expect(queue!.size).toBe(0);
  });

  it('pause(name) and resume(name) only affect the named queue', async () => {
    const queues = new AsyncQueues<number, number, undefined>();
    const queueA = queues.create('a', async (x) => x * 2);
    const queueB = queues.create('b', async (x) => x * 3);
    queueA!.on('error', () => {});
    queueB!.on('error', () => {});
    queues.pause('a');
    const { promise: pa } = queues.enqueue('a', [1]);
    const { promise: pb } = queues.enqueue('b', [2]);
    // queueA is paused, so pa should not resolve until resumed
    let bResolved = false;
    pb.then(() => { bResolved = true; });
    await new Promise(res => setTimeout(res, 50));
    expect(bResolved).toBe(true);
    queues.resume('a');
    await expect(pa).resolves.toBe(2);
  });

  it('pause() and resume() affect all queues', async () => {
    const queues = new AsyncQueues<number, number, undefined>();
    const queueA = queues.create('a', async (x) => x * 2);
    const queueB = queues.create('b', async (x) => x * 3);
    queueA!.on('error', () => {});
    queueB!.on('error', () => {});
    queues.pause();
    const { promise: pa } = queues.enqueue('a', [1]);
    const { promise: pb } = queues.enqueue('b', [2]);
    // Both queues are paused, so neither should resolve until resumed
    let resolved = false;
    Promise.all([pa, pb]).then(() => { resolved = true; });
    await new Promise(res => setTimeout(res, 50));
    expect(resolved).toBe(false);
    queues.resume();
    await expect(pa).resolves.toBe(2);
    await expect(pb).resolves.toBe(6);
  });
}); 