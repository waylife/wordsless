/**
 * Tests for `data/readApiKey.ts` — the Node-only helper that reads the
 * MiniMax key from `process.env` or a `.env`-style file.
 *
 * Lives under `data/__tests__/` (not `src/`) for the same reason the
 * source lives under `data/`: keeping it out of the app bundle graph so
 * Metro never resolves the `node:fs` import.
 */
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { readApiKey } from '../readApiKey';

describe('readApiKey', () => {
  it('returns env value if non-empty', () => {
    expect(readApiKey('abc')).toBe('abc');
    expect(readApiKey('  abc  ')).toBe('abc');
    expect(readApiKey('   ')).toBe('');
  });

  it('falls back to .env file when env is empty', () => {
    const dir = join(tmpdir(), 'wordsless-test');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'test.env');
    writeFileSync(path, '# comment\nMINIMAX_API_KEY=sk-test-123\nOTHER=ignore\n', 'utf8');
    try {
      expect(readApiKey('', path)).toBe('sk-test-123');
      expect(readApiKey(undefined, path)).toBe('sk-test-123');
    } finally {
      try {
        unlinkSync(path);
      } catch {
        // ignore
      }
    }
  });

  it('returns empty string when nothing is set', () => {
    expect(readApiKey(undefined, '/definitely/does/not/exist')).toBe('');
  });
});
