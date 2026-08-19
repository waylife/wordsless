/**
 * Seed helper — install a compiled wordbook into the device SQLite db.
 *
 * The compiled JSON lives in the bundle (loaded via Metro's JSON support)
 * so the import path is static. We map every entry to the schema's
 * `NewWord` shape (UUIDs are assigned here, not at build time, so the
 * device-side copy is independent of any other install).
 *
 * Idempotency: we look up the wordbook by code, so re-running with the
 * same payload is a no-op for the `wordbooks` row; word rows are
 * upserted by (book_id, spelling) unique key.
 */
import { wordbookRepository } from './repositories/wordbooks';
import { wordRepository } from './repositories/words';
import type { Db } from './client';
import type { MeaningEntry, NewWord, WordbookCodeValue } from './schema';

export interface CompiledWordbook {
  book: { id: string; code: WordbookCodeValue; name: string; wordCount: number };
  words: NewWord[];
}

export interface SeedResult {
  code: WordbookCodeValue;
  bookId: string;
  wordsInserted: number;
  alreadyInstalled: boolean;
}

export async function seedWordbook(db: Db, compiled: CompiledWordbook): Promise<SeedResult> {
  const { book, words } = compiled;
  const existing = await wordbookRepository.findByCode(db, book.code);
  const alreadyInstalled = existing != null && existing.downloaded;

  // Ensure the wordbook row exists, then mark it downloaded.
  await wordbookRepository.upsert(db, {
    id: book.id,
    code: book.code,
    name: book.name,
    wordCount: words.length,
    downloaded: true,
    description: null,
  });

  // Re-key words to point at this book id and let the repository's
  // chunked insert handle the SQL.
  const rekeyed: NewWord[] = words.map((w) => ({
    ...w,
    bookId: book.id,
    // Re-validate the meanings shape — defensive, since we got the
    // payload from a JSON asset and want to surface type drift loudly.
    meanings: w.meanings as MeaningEntry[],
  }));

  await wordRepository.insertMany(db, rekeyed);

  return {
    code: book.code,
    bookId: book.id,
    wordsInserted: rekeyed.length,
    alreadyInstalled,
  };
}
