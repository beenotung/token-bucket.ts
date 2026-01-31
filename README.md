# token-bucket.ts

A simple, lightweight token bucket rate limiter for TypeScript/JavaScript.

[![npm Package Version](https://img.shields.io/npm/v/token-bucket.ts)](https://www.npmjs.com/package/token-bucket.ts)
[![Minified Package Size](https://img.shields.io/bundlephobia/min/token-bucket.ts)](https://bundlephobia.com/package/token-bucket.ts)
[![Minified and Gzipped Package Size](https://img.shields.io/bundlephobia/minzip/token-bucket.ts)](https://bundlephobia.com/package/token-bucket.ts)

## Features

- Zero dependencies
- Continuous refill (lazy evaluation, no timers)
- Per-key buckets (rate limit by IP, user ID, etc.)
- Optional cooldown (minimum time between consumes)
- TypeScript with full type definitions
- Works in Node.js and browsers

## Installation

```bash
npm install token-bucket.ts
```

You can also install with [pnpm](https://pnpm.io/), [yarn](https://yarnpkg.com/), or [slnpm](https://github.com/beenotung/slnpm)

## Usage

```typescript
import { TokenBucket } from 'token-bucket.ts'

// Create a bucket: 5 tokens capacity, refill 1 token per second
let bucket = new TokenBucket({
  capacity: 5, // max number of token for each key
  initial: 3, // can be different from capacity
  interval: 1000, // ms, refill interval for each token
  cooldown: 1000, // ms, minimum time between successful consumes,
})

// Consume a token
let { wait_time } = bucket.consume('user:123')
if (wait_time > 0) {
  // Rate limited - wait_time ms until a token is available
  throw new Error(`Rate limited. Try again in ${Math.ceil(wait_time / 1000)}s`)
}

// Check without consuming
let result = bucket.check('user:123')

// Consume multiple tokens
bucket.consume('user:123', 3)

// Reset a specific key, you don't need to reset it manually, but you can
bucket.reset('user:123')

// Reset all keys
bucket.reset_all()

// Get number of tracked buckets
console.log(bucket.size)

// Remove fully-recovered buckets to free memory
bucket.prune()
```

## API

### `new TokenBucket(options)`

| Option     | Type   | Default  | Description                                   |
| ---------- | ------ | -------- | --------------------------------------------- |
| `capacity` | number | required | Maximum tokens in bucket                      |
| `interval` | number | required | Refill interval in milliseconds               |
| `fill`     | number | 1        | Tokens to add per interval                    |
| `initial`  | number | capacity | Starting tokens for new buckets               |
| `cooldown` | number | 0        | Minimum time (ms) between successful consumes |

### Methods

| Method                  | Description                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `check(key, amount?)`   | Check if tokens available (doesn't consume). `amount` defaults to 1, can be 0 to check only cooldown |
| `consume(key, amount?)` | Consume tokens if available. `amount` defaults to 1, must be > 0                                     |
| `reset(key)`            | Reset a specific key's bucket                                                                        |
| `reset_all()`           | Reset all buckets                                                                                    |
| `prune()`               | Remove fully-recovered buckets. Returns number removed. Only works when `initial >= capacity`        |
| `size`                  | Get number of tracked buckets                                                                        |

### Return Value

```typescript
{
  wait_time: number
} // 0 = allowed, >0 = wait this many ms
```

### Validation

Both `check` and `consume` throw errors for invalid amounts:

- `amount must be a number` - NaN provided
- `amount must be >= 0` (check) or `amount must be > 0` (consume)
- `amount must be <= capacity` - Cannot request more than bucket capacity

## Examples

### API Rate Limiting

```typescript
let apiLimit = new TokenBucket({ capacity: 60, interval: 1000 })

function handleRequest(ip: string) {
  let { wait_time } = apiLimit.consume(ip)
  if (wait_time > 0) {
    return { status: 429, message: 'Too many requests' }
  }
  // Process request...
}
```

### SMS Verification with Cooldown

```typescript
let smsLimit = new TokenBucket({
  capacity: 5, // Allow burst of 5
  interval: 60000, // Refill 1 per minute
  cooldown: 60000, // Minimum 60s between sends
})

function sendSMS(phone: string) {
  let { wait_time } = smsLimit.consume(phone)
  if (wait_time > 0) {
    throw new Error(`Please wait ${Math.ceil(wait_time / 1000)} seconds`)
  }
  // Send SMS...
}
```

### Gradual Trust (Lower Initial Tokens)

```typescript
let newUserLimit = new TokenBucket({
  capacity: 10,
  interval: 1000,
  initial: 3, // New users start with fewer tokens
})
```

## License

This project is licensed with [BSD-2-Clause](./LICENSE)

This is free, libre, and open-source software. It comes down to four essential freedoms [[ref]](https://seirdy.one/2021/01/27/whatsapp-and-the-domestication-of-users.html#fnref:2):

- The freedom to run the program as you wish, for any purpose
- The freedom to study how the program works, and change it so it does your computing as you wish
- The freedom to redistribute copies so you can help others
- The freedom to distribute copies of your modified versions to others
