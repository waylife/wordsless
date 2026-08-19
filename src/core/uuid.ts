/**
 * UUID helper — wraps `expo-crypto.randomUUID` with a non-null assertion
 * and a tiny bit of shape-checking so the rest of the codebase can
 * `import { uuid } from '@/core/uuid'` without thinking about it.
 *
 * The function throws if the runtime can't produce a UUID. That should
 * never happen on a real device, but failing loudly in development beats
 * silently inserting `undefined` as a primary key.
 */
import { randomUUID } from 'expo-crypto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuid(): string {
  const id = randomUUID();
  if (!UUID_RE.test(id)) {
    throw new Error(`uuid(): expo-crypto produced a malformed id: ${id}`);
  }
  return id;
}

/** Predicate — handy in tests and in places that load rows from disk. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
