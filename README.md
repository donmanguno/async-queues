# async-queues

A robust, type-safe, and extensible asynchronous queue and queue manager for Node.js and TypeScript. Supports concurrency, event emission, cancellation, queue management, and more.

## Features
- Asynchronous task queue with configurable concurrency
- Multiple named queues via AsyncQueues manager
- EventEmitter integration for observability
- Per-item and per-queue cancellation
- Queue flushing and removal
- Pause/resume (per-queue or all queues)
- TypeScript-first API

## Installation

```bash
npm install async-queues
```

## Usage

### Basic AsyncQueue
```ts
import { AsyncQueue } from 'async-queues';

const processor = async (x: number) => x * 2;
const queue = new AsyncQueue(processor);

const { promise } = queue.enqueue([5]);
const result = await promise; // 10
```

### Concurrency
```ts
const queue = new AsyncQueue(processor, 0, undefined, 3); // concurrency = 3
```

### Events
```ts
queue.on('processed', (result, item) => {
  console.log('Processed:', result, 'from', item.args);
});
queue.on('error', (err, item) => {
  console.error('Error:', err, 'for', item.args);
});
```

### Cancellation
```ts
const { id, promise } = queue.enqueue([42]);
queue.cancel(id); // Cancels the item if still pending
await promise.catch(err => console.log(err.message)); // 'Cancelled'
```

### Queue Flushing
```ts
queue.clear(); // Cancels all pending items
```

### AsyncQueues Manager
```ts
import { AsyncQueues } from 'async-queues';

const queues = new AsyncQueues(processor);
queues.create('emails');
queues.create('uploads', async (file) => uploadFile(file), 1000);

const { id, promise } = queues.enqueue('emails', ['hello@example.com']);

// Cancel by id (without knowing the queue name)
queues.cancelById(id);
```

### Pause/Resume
```ts
queues.pause(); // Pause all queues
queues.resume('emails'); // Resume only the 'emails' queue
```

## API Overview

### AsyncQueue
- `constructor(processor, interval = 0, thisArg?, concurrency = 1)`
- `enqueue(args, processor?, thisArg?) => { id, promise }`
- `cancel(id)`
- `clear()`
- `pause(ms?)`
- `resume()`
- Events: `'enqueue'`, `'dequeue'`, `'processed'`, `'error'`, `'pause'`, `'resume'`

### AsyncQueues
- `constructor(processor?, interval?, thisArg?)`
- `create(name, processor?, interval?, thisArg?)`
- `enqueue(name, args, processor?, thisArg?) => { id, promise }`
- `cancel(name, id)`
- `cancelById(id)`
- `remove(name)`
- `clear(name)`
- `pause(name?)`
- `resume(name?)`

## License
MIT 