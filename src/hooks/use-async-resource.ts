/**
 * Shared loading/error data hook for the wordbook-related UI surfaces.
 *
 * The pattern: the picker and the per-book browser both need to read
 * the SQLite db; the read is async and the screen may mount before the
 * connection is open. We use a tiny shared hook so every screen gets
 * the same loading / error UX without reaching for a bigger state
 * library this early.
 */
import { useCallback, useEffect, useState, useTransition } from 'react';

import { getDb } from '@/db/client';

export interface AsyncResource<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

export function useAsyncResource<T>(
  loader: (db: Awaited<ReturnType<typeof getDb>>) => Promise<T>,
): AsyncResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [isPending, startTransition] = useTransition();

  const reload = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // useTransition lets us flag the reload as a non-urgent update
    // without calling setState synchronously in the effect body.
    startTransition(() => {
      setError(null);
      (async () => {
        try {
          const db = await getDb();
          const result = await loader(db);
          if (!cancelled) {
            startTransition(() => {
              setData(result);
            });
          }
        } catch (err) {
          if (!cancelled) {
            startTransition(() => {
              setError(err as Error);
            });
          }
        }
      })();
    });
    return () => {
      cancelled = true;
    };
    // We intentionally re-run on reload key change; the loader itself is
    // expected to be stable (defined inline with useCallback or hoisted).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  return { data, loading: isPending && data == null, error, reload };
}
