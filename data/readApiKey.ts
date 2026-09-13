/**
 * readApiKey — Node-only helper for loading the MiniMax API key at build
 * time.
 *
 * Why this lives under `data/` and NOT under `src/`: the app runtime never
 * calls this. The Expo/Metro bundle resolver statically analyses every
 * `require('...')` it can see in the module graph, and it fails with
 * "node:fs could not be found" the moment it encounters `require('node:fs')`
 * (even when the call is buried in a function the app never executes).
 * Keeping this file out of `src/` means no runtime app code imports it, so
 * Metro never sees the Node built-in at all.
 *
 * Runtime app code uses `core/ai/runtime.getApiKey()` (SecureStore); this
 * is only for the local data/* scripts that need to read `.env.local`.
 */
import { readFileSync } from 'node:fs';

export function readApiKey(envValue: string | undefined, dotenvPath?: string): string {
  if (envValue && envValue.trim().length > 0) return envValue.trim();
  if (!dotenvPath) return '';
  try {
    const text = readFileSync(dotenvPath, 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?MINIMAX_API_KEY\s*=\s*"?([^"\s]+)"?\s*$/);
      if (m) return m[1]!.trim();
    }
  } catch {
    // .env missing — caller will see the empty string and warn.
  }
  return '';
}
