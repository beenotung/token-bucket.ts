export type TokenBucketOptions = {
  capacity: number
  interval: number // in milliseconds
  refill?: number // default 1
  initial?: number // default size of capacity
  cooldown?: number // minimum time between consumes (in milliseconds), default to 0 (no cooldown)
}

export type TokenBucketResult = {
  /**
   * - in milliseconds
   * - if zero, means no wait is needed
   */
  wait_time: number
}

type BucketState = {
  tokens: number
  last_refill: number
  last_consume: number
}

export class TokenBucket {
  capacity: number
  interval: number // in milliseconds
  refill: number
  initial: number
  cooldown: number // in milliseconds
  private buckets: Map<string, BucketState> = new Map()

  constructor(options: TokenBucketOptions) {
    this.capacity = options.capacity
    this.interval = options.interval
    this.refill = options.refill ?? 1
    this.initial = options.initial ?? this.capacity
    this.cooldown = options.cooldown ?? 0
  }

  private get_bucket(key: string): BucketState {
    let bucket = this.buckets.get(key)
    if (!bucket) {
      bucket = {
        tokens: this.initial,
        last_refill: Date.now(),
        last_consume: -Infinity,
      }
      this.buckets.set(key, bucket)
    }
    return bucket
  }

  private refill_bucket(bucket: BucketState): void {
    let now = Date.now()
    let elapsed = now - bucket.last_refill
    let refill_amount = (elapsed / this.interval) * this.refill
    bucket.tokens = Math.min(this.capacity, bucket.tokens + refill_amount)
    bucket.last_refill = now
  }

  private calc_token_wait_time(tokens: number, amount: number): number {
    if (tokens >= amount) return 0
    let needed = amount - tokens
    return (needed / this.refill) * this.interval
  }

  private calc_cooldown_wait_time(bucket: BucketState): number {
    if (this.cooldown === 0) return 0
    let now = Date.now()
    let elapsed = now - bucket.last_consume
    if (elapsed >= this.cooldown) return 0
    return this.cooldown - elapsed
  }

  check(key: string, amount: number = 1): TokenBucketResult {
    if (Number.isNaN(amount)) {
      throw new Error('amount must be a number')
    }
    if (amount < 0) {
      throw new Error('amount must be >= 0')
    }
    if (amount > this.capacity) {
      throw new Error('amount must be <= capacity')
    }
    let bucket = this.get_bucket(key)
    this.refill_bucket(bucket)
    let cooldown_wait = this.calc_cooldown_wait_time(bucket)
    let token_wait = this.calc_token_wait_time(bucket.tokens, amount)
    return {
      wait_time: Math.max(cooldown_wait, token_wait),
    }
  }

  consume(key: string, amount: number = 1): TokenBucketResult {
    if (Number.isNaN(amount)) {
      throw new Error('amount must be a number')
    }
    if (amount <= 0) {
      throw new Error('amount must be > 0')
    }
    if (amount > this.capacity) {
      throw new Error('amount must be <= capacity')
    }
    let bucket = this.get_bucket(key)
    this.refill_bucket(bucket)
    let cooldown_wait = this.calc_cooldown_wait_time(bucket)
    let token_wait = this.calc_token_wait_time(bucket.tokens, amount)
    let wait_time = Math.max(cooldown_wait, token_wait)
    if (wait_time === 0) {
      bucket.tokens -= amount
      bucket.last_consume = Date.now()
    }
    return { wait_time }
  }

  reset(key: string): void {
    this.buckets.delete(key)
  }

  reset_all(): void {
    this.buckets.clear()
  }

  get size(): number {
    return this.buckets.size
  }

  /**
   * Remove stale buckets that have fully recovered.
   * Only prunes if initial >= capacity to avoid losing accumulated tokens.
   * A bucket is pruned when it has full capacity and cooldown has passed.
   * @returns number of buckets removed
   */
  prune(): number {
    let capacity = this.capacity
    if (this.initial < capacity) {
      console.warn(
        "TokenBucket.prune(): initial < capacity, won't prune to avoid losing accumulated tokens",
      )
      return 0 // Don't prune - would lose accumulated tokens
    }
    let removed = 0
    for (let [key, bucket] of this.buckets) {
      this.refill_bucket(bucket)
      let cooldown_wait = this.calc_cooldown_wait_time(bucket)
      if (bucket.tokens < capacity || cooldown_wait > 0) {
        continue
      }
      this.buckets.delete(key)
      removed++
    }
    return removed
  }
}
