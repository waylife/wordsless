/**
 * A simple token-less rate limiter.
 *
 * A "rps" budget of N means: at most N calls per second, averaged over
 * a 1-second window. We sleep on the hot path so callers don't have to
 * check. Implemented as a moving-window queue — every call timestamp is
 * recorded, and we drop any older than `windowMs`.
 *
 * This is intentionally a 30-line class and not a leaky-bucket
 * implementation. We don't need precise scheduling, just "don't hammer
 * the API."
 */
export class RateLimiter {
  private readonly timestamps: number[] = [];

  constructor(
    /** Max operations per `windowMs` milliseconds. */
    public readonly rps: number,
    /** Window length in ms; defaults to 1000 (true per-second budget). */
    public readonly windowMs: number = 1000,
  ) {
    if (rps <= 0) throw new Error('RateLimiter: rps must be positive');
  }

  /** Wait until it's OK to make the next call, then reserve a slot. */
  async acquire(): Promise<void> {
    const now = Date.now();
    this.prune(now);
    if (this.timestamps.length < this.rps) {
      this.timestamps.push(now);
      return;
    }
    // We are at capacity. Sleep until the oldest timestamp falls out of
    // the window, then claim its slot.
    const wait = this.windowMs - (now - this.timestamps[0]!);
    await sleep(Math.max(wait, 0));
    this.prune(Date.now());
    this.timestamps.push(Date.now());
  }

  /** Drop timestamps that are older than the current window. */
  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    while (this.timestamps.length > 0 && this.timestamps[0]! < cutoff) {
      this.timestamps.shift();
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
