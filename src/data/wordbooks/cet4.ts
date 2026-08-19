/**
 * Static import of the CET-4 sample wordbook JSON. The file is rebuilt
 * by `pnpm data:build cet4-sample`; the in-tree copy is what ships
 * with the dev build so the picker can be exercised end-to-end without
 * a network round-trip.
 *
 * Other books will get the same treatment in Phase 1.5.
 */
import type { CompiledWordbook } from '@/db/seed';
import type { WordbookCodeValue } from '@/db/schema';

const cet4: CompiledWordbook = require('../../data/dist/cet4.compiled.json') as CompiledWordbook;

// Defensive: the seed function is code-narrowed, so we re-narrow here.
// If someone ships the wrong code in the JSON, the cast below is the
// single place we know we trust.
if (cet4.book.code !== ('cet4' as WordbookCodeValue)) {
  throw new Error(
    `data/dist/cet4.compiled.json declares code="${cet4.book.code}", expected "cet4"`,
  );
}

export const cet4Wordbook: CompiledWordbook = cet4;
