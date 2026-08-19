/**
 * UUID helper tests — verify shape, uniqueness, and the predicate.
 */

// jsdom's crypto is incomplete; stub expo-crypto with a Node implementation.
// jest.mock is hoisted by jest so its syntactic position is fine;
// disable import/first to silence the linter. The factory uses require()
// because jest disallows out-of-scope variables in mock factories.
jest.mock('expo-crypto', () => ({
  __esModule: true,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  randomUUID: () => require('node:crypto').randomUUID(),
}));

// eslint-disable-next-line import/first
import { isUuid, uuid } from '@/core/uuid';

describe('uuid', () => {
  it('returns a v4-looking string', () => {
    const id = uuid();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('produces unique values across calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => uuid()));
    expect(ids.size).toBe(100);
  });
});

describe('isUuid', () => {
  it('accepts well-formed ids', () => {
    expect(isUuid('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
  });

  it('rejects malformed inputs', () => {
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(123)).toBe(false);
  });
});
