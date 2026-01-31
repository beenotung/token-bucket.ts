import { expect } from 'chai'
import sinon from 'sinon'
import { TokenBucket } from './index'

describe('TokenBucket', () => {
  describe('constructor', () => {
    it('should set capacity and interval', () => {
      let bucket = new TokenBucket({ capacity: 10, interval: 1000 })
      expect(bucket.capacity).to.equal(10)
      expect(bucket.interval).to.equal(1000)
    })

    it('should default fill to 1', () => {
      let bucket = new TokenBucket({ capacity: 10, interval: 1000 })
      expect(bucket.fill).to.equal(1)
    })

    it('should default initial to capacity', () => {
      let bucket = new TokenBucket({ capacity: 10, interval: 1000 })
      expect(bucket.initial).to.equal(10)
    })

    it('should allow custom fill', () => {
      let bucket = new TokenBucket({ capacity: 10, interval: 1000, fill: 2 })
      expect(bucket.fill).to.equal(2)
    })

    it('should allow custom initial', () => {
      let bucket = new TokenBucket({ capacity: 10, interval: 1000, initial: 5 })
      expect(bucket.initial).to.equal(5)
    })

    it('should default cooldown to 0', () => {
      let bucket = new TokenBucket({ capacity: 10, interval: 1000 })
      expect(bucket.cooldown).to.equal(0)
    })

    it('should allow custom cooldown', () => {
      let bucket = new TokenBucket({ capacity: 10, interval: 1000, cooldown: 500 })
      expect(bucket.cooldown).to.equal(500)
    })
  })

  describe('consume', () => {
    it('should allow consume when tokens available', () => {
      let bucket = new TokenBucket({ capacity: 5, interval: 1000 })
      let result = bucket.consume('key1')
      expect(result.wait_time).to.equal(0)
    })

    it('should consume multiple tokens', () => {
      let bucket = new TokenBucket({ capacity: 5, interval: 1000 })
      let result = bucket.consume('key1', 3)
      expect(result.wait_time).to.equal(0)
    })

    it('should block when not enough tokens', () => {
      let bucket = new TokenBucket({ capacity: 2, interval: 1000 })
      bucket.consume('key1', 2) // use all tokens
      let result = bucket.consume('key1')
      expect(result.wait_time).to.be.greaterThan(0)
    })

    it('should return correct wait time', () => {
      let bucket = new TokenBucket({ capacity: 1, interval: 1000 })
      bucket.consume('key1') // use the 1 token
      let result = bucket.consume('key1')
      // wait_time should be close to 1000ms (1 token needed, 1 token per 1000ms)
      expect(result.wait_time).to.be.closeTo(1000, 50)
    })

    it('should track separate keys independently', () => {
      let bucket = new TokenBucket({ capacity: 1, interval: 1000 })
      bucket.consume('key1')
      let result = bucket.consume('key2')
      expect(result.wait_time).to.equal(0) // key2 has its own bucket
    })

    it('should not consume tokens when blocked', () => {
      let bucket = new TokenBucket({ capacity: 2, interval: 1000, initial: 1 })
      let result = bucket.consume('key1', 2) // try to consume 2, only have 1
      expect(result.wait_time).to.be.greaterThan(0)
      // tokens should still be 1, not consumed
      let check = bucket.check('key1', 1)
      expect(check.wait_time).to.equal(0) // can still consume 1
    })
  })

  describe('check', () => {
    it('should not consume tokens', () => {
      let bucket = new TokenBucket({ capacity: 1, interval: 1000 })
      bucket.check('key1')
      bucket.check('key1')
      let result = bucket.consume('key1')
      expect(result.wait_time).to.equal(0) // token still available
    })

    it('should return same wait_time as consume would', () => {
      let bucket = new TokenBucket({ capacity: 1, interval: 1000 })
      bucket.consume('key1')
      let check = bucket.check('key1')
      let consume = bucket.consume('key1')
      expect(check.wait_time).to.be.closeTo(consume.wait_time, 10)
    })
  })

  describe('reset', () => {
    it('should reset a specific key', () => {
      let bucket = new TokenBucket({ capacity: 1, interval: 1000 })
      bucket.consume('key1')
      bucket.reset('key1')
      let result = bucket.consume('key1')
      expect(result.wait_time).to.equal(0)
    })

    it('should not affect other keys', () => {
      let bucket = new TokenBucket({ capacity: 1, interval: 1000 })
      bucket.consume('key1')
      bucket.consume('key2')
      bucket.reset('key1')
      let result = bucket.consume('key2')
      expect(result.wait_time).to.be.greaterThan(0)
    })
  })

  describe('reset_all', () => {
    it('should reset all keys', () => {
      let bucket = new TokenBucket({ capacity: 1, interval: 1000 })
      bucket.consume('key1')
      bucket.consume('key2')
      bucket.reset_all()
      expect(bucket.consume('key1').wait_time).to.equal(0)
      expect(bucket.consume('key2').wait_time).to.equal(0)
    })
  })

  describe('refill', () => {
    let clock: sinon.SinonFakeTimers

    beforeEach(() => {
      clock = sinon.useFakeTimers()
    })

    afterEach(() => {
      clock.restore()
    })

    it('should refill tokens over time', () => {
      let bucket = new TokenBucket({ capacity: 2, interval: 100 })
      bucket.consume('key1', 2) // use all tokens
      clock.tick(150) // should have 1.5 tokens after 150ms
      let result = bucket.consume('key1', 2)
      expect(result.wait_time).to.equal(50) // should wait 50ms for the pending 0.5 tokens
    })

    it('should not exceed capacity', () => {
      let bucket = new TokenBucket({ capacity: 2, interval: 100 })
      clock.tick(500) // wait long time
      bucket.consume('key1')
      bucket.consume('key1')
      let result = bucket.consume('key1')
      expect(result.wait_time).to.equal(100) // only 2 capacity, all used up
    })

    it('should refill with custom fill rate', () => {
      let bucket = new TokenBucket({ capacity: 10, interval: 100, fill: 2 })
      bucket.consume('key1', 10) // use all tokens
      clock.tick(150) // wait 1.5 intervals, should get 3 tokens (1.5 * 2)
      let result = bucket.consume('key1', 3)
      expect(result.wait_time).to.equal(0)
    })
  })

  describe('cooldown', () => {
    let clock: sinon.SinonFakeTimers

    beforeEach(() => {
      clock = sinon.useFakeTimers()
    })

    afterEach(() => {
      clock.restore()
    })

    it('should block consume during cooldown', () => {
      let bucket = new TokenBucket({ capacity: 10, interval: 1000, cooldown: 100 })
      bucket.consume('key1')
      let result = bucket.consume('key1')
      expect(result.wait_time).to.equal(100) // must wait for cooldown
    })

    it('should allow consume after cooldown', () => {
      let bucket = new TokenBucket({ capacity: 10, interval: 1000, cooldown: 100 })
      bucket.consume('key1')
      clock.tick(100)
      let result = bucket.consume('key1')
      expect(result.wait_time).to.equal(0)
    })

    it('should return remaining cooldown time', () => {
      let bucket = new TokenBucket({ capacity: 10, interval: 1000, cooldown: 100 })
      bucket.consume('key1')
      clock.tick(30)
      let result = bucket.consume('key1')
      expect(result.wait_time).to.equal(70) // 100 - 30
    })

    it('should track cooldown per key independently', () => {
      let bucket = new TokenBucket({ capacity: 10, interval: 1000, cooldown: 100 })
      bucket.consume('key1')
      let result = bucket.consume('key2')
      expect(result.wait_time).to.equal(0) // key2 has no cooldown yet
    })

    it('should return max of cooldown and token wait', () => {
      let bucket = new TokenBucket({ capacity: 1, interval: 1000, cooldown: 50 })
      bucket.consume('key1') // 0 tokens left, cooldown active
      let result = bucket.consume('key1')
      expect(result.wait_time).to.equal(1000) // token wait (1000) > cooldown (50)
    })

    it('should refill tokens during cooldown (independent)', () => {
      let bucket = new TokenBucket({ capacity: 2, interval: 100, cooldown: 200 })
      bucket.consume('key1', 2) // 0 tokens, cooldown starts
      clock.tick(150) // 1.5 tokens refilled, cooldown still active (50ms left)
      let result = bucket.check('key1')
      expect(result.wait_time).to.equal(50) // blocked by cooldown, not tokens
    })
  })
})
