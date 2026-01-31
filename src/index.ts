export type TokenBucketOptions = {
  capacity: number
  interval: number // in milliseconds
  fill?: number // default 1
  initial?: number // default size of capacity
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
}

export class TokenBucket {
  capacity: number
  interval: number // in milliseconds
  fill: number
  initial: number
  private buckets: Map<string, BucketState> = new Map()

  constructor(options: TokenBucketOptions) {
    this.capacity = options.capacity
    this.interval = options.interval
    this.fill = options.fill ?? 1
    this.initial = options.initial ?? this.capacity
  }

  private get_bucket(key: string): BucketState {
    let bucket = this.buckets.get(key)
    if (!bucket) {
      bucket = { tokens: this.initial, last_refill: Date.now() }
      this.buckets.set(key, bucket)
    }
    return bucket
  }

  private refill_bucket(bucket: BucketState): void {
    let now = Date.now()
    let elapsed = now - bucket.last_refill
    let refill_amount = (elapsed / this.interval) * this.fill
    bucket.tokens = Math.min(this.capacity, bucket.tokens + refill_amount)
    bucket.last_refill = now
  }

  private calc_wait_time(tokens: number, amount: number): number {
    if (tokens >= amount) return 0
    let needed = amount - tokens
    return (needed / this.fill) * this.interval
  }

  check(key: string, amount: number = 1): TokenBucketResult {
    let bucket = this.get_bucket(key)
    this.refill_bucket(bucket)
    return {
      wait_time: this.calc_wait_time(bucket.tokens, amount),
    }
  }

  consume(key: string, amount: number = 1): TokenBucketResult {
    let bucket = this.get_bucket(key)
    this.refill_bucket(bucket)
    let wait_time = this.calc_wait_time(bucket.tokens, amount)
    if (wait_time === 0) {
      bucket.tokens -= amount
    }
    return { wait_time }
  }

  reset(key: string): void {
    this.buckets.delete(key)
  }

  reset_all(): void {
    this.buckets.clear()
  }
}
