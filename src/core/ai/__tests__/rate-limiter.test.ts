/**
 * RateLimiter tests — we don't actually wait seconds in unit tests
 * (the limiter is rps=10 with a 1000ms window in the rest of the
 * codebase); we use a tight window and a 2-RPS budget so a small
 * number of acquire()s saturate it deterministically.
 */
import { RateLimiter } from '@/core/ai/rate-limiter';

describe('RateLimiter', () => {
  it('rejects non-positive rps at construction', () => {
    expect(() => new RateLimiter(0)).toThrow(/positive/);
    expect(() => new RateLimiter(-1)).toThrow(/positive/);
  });

  it('lets the first N acquires through immediately', async () => {
    const rl = new RateLimiter(2, 1000);
    const start = Date.now();
    await rl.acquire();
    await rl.acquire();
    expect(Date.now() - start).toBeLessThan(50);
  });

  it('blocks the (N+1)th acquire until the window rolls over', async () => {
    const rl = new RateLimiter(2, 200);
    await rl.acquire();
    await rl.acquire();
    const start = Date.now();
    await rl.acquire();
    const elapsed = Date.now() - start;
    // We should have slept until the first timestamp fell out of the
    // 200ms window — allow some slack.
    expect(elapsed).toBeGreaterThanOrEqual(150);
    expect(elapsed).toBeLessThan(400);
  });

  it('prunes old timestamps so a sustained caller stays in budget', async () => {
    const rl = new RateLimiter(2, 100);
    // 5 acquires spaced 60ms apart — window is 100ms, so each call
    // should observe a fresh window and not block.
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      await rl.acquire();
      expect(Date.now() - start).toBeLessThan(80);
      await new Promise((r) => setTimeout(r, 60));
    }
  });
});
