# async-queues

A robust, type-safe, and extensible asynchronous queue and queue manager for Node.js and TypeScript. Supports concurrency, event emission, cancellation, queue management, and more.

## Table of Contents
- [Features](#features)
- [Installation](#installation)
- [Full Example](#full-example)
- [Usage](#usage)
- [Advanced Usage](#advanced-usage)
- [Event Reference](#event-reference)
- [Error Handling](#error-handling)
- [API Overview](#api-overview)
- [License](#license)

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

## Full Example
```ts
import { AsyncQueue, AsyncQueues } from 'async-queues';

// Define a processor function
async function double(x: number) {
  await new Promise(res => setTimeout(res, 100)); // simulate async work
  return x * 2;
}

// Create a queue with concurrency 2
const queue = new AsyncQueue(double, 0, undefined, 2);

// Listen for events
queue.on('processed', (result, item) => {
  console.log(`Processed: ${item.args[0]} => ${result}`);
});
queue.on('error', (err, item) => {
  console.error(`Error processing ${item.args[0]}:`, err.message);
});

// Enqueue some items
const items = [queue.enqueue([1]), queue.enqueue([2]), queue.enqueue([3])];
const results = await Promise.all(items.map(i => i.promise));
console.log('All results:', results);

// Cancel a pending item
const { id, promise } = queue.enqueue([99]);
queue.cancel(id);
try {
  await promise;
} catch (e) {
  console.log('Cancelled item:', e.message);
}

// Manager usage
const manager = new AsyncQueues(double);
manager.create('fast');
manager.create('slow', async (x) => { await new Promise(res => setTimeout(res, 500)); return x * 10; });
manager.enqueue('fast', [5]);
manager.enqueue('slow', [2]);
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

## Advanced Usage

### Custom thisArg
```ts
interface Ctx { base: number; }
const processor = async function (this: Ctx, x: number) { return this.base + x; };
const queue = new AsyncQueue(processor, 0, { base: 10 });
const { promise } = queue.enqueue([5]);
const result = await promise; // 15
```

### Dynamic Concurrency
```ts
queue.concurrency = 5; // Change concurrency on the fly
```

### Multi-Queue Coordination
```ts
const manager = new AsyncQueues();
manager.create('api', async (x) => callApi(x), 100, undefined);
manager.create('db', async (x) => saveToDb(x), 0, undefined);

// Pause all queues for maintenance
manager.pause();
// Resume only the 'api' queue
manager.resume('api');
```

## Event Reference

### AsyncQueue Events
| Event      | Payload(s)                        | When Fired                                      |
|------------|-----------------------------------|-------------------------------------------------|
| enqueue    | item                              | When an item is added to the queue              |
| dequeue    | item                              | When an item is about to be processed           |
| processed  | result, item                      | When an item is successfully processed          |
| error      | error, item                       | When processing an item throws                  |
| pause      |                                   | When the queue is paused                        |
| resume     |                                   | When the queue is resumed                       |

### Example
```ts
queue.on('enqueue', item => { ... });
queue.on('dequeue', item => { ... });
queue.on('processed', (result, item) => { ... });
queue.on('error', (err, item) => { ... });
queue.on('pause', () => { ... });
queue.on('resume', () => { ... });
```

## Error Handling

- **Processor errors:** If your processor throws or rejects, the queue emits an `'error'` event and the promise returned by `enqueue` is rejected.
- **No error listener:** If you do not attach an `'error'` listener, the queue will log the error to the console but will not crash your process.
- **Cancellation/Flushing:** Cancelled or flushed items have their promises rejected with an appropriate error message (`'Cancelled'` or `'Flushed'`).
- **Best practice:** Always attach an `'error'` listener to your queues, especially in production.

```ts
queue.on('error', (err, item) => {
  // Handle or log errors here
});
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