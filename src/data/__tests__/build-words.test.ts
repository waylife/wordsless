/**
 * Tests for the data/build-words.ts pipeline.
 *
 * Covers: phonetic normalization, meaning lift from `meaning`/`definition`,
 * duplicate detection, empty-after-normalization rejection, and the report
 * shape. Integration (reading a real file under data/raw/) is exercised by
 * the script's own self-test when run via `pnpm data:build`.
 */
import {
  buildBookFromFile,
  compileWords,
  deriveBookMeta,
  normalizePhonetic,
  type RawWord,
} from '../../../data/build-words';

const BOOK_ID = 'wb-test';

function raw(over: Partial<RawWord> & Pick<RawWord, 'spelling'>): RawWord {
  return {
    meanings: [{ pos: 'n.', def: 'x' }],
    ...over,
  } as RawWord;
}

describe('normalizePhonetic', () => {
  it('returns null on null / empty / whitespace', () => {
    expect(normalizePhonetic(undefined)).toBeNull();
    expect(normalizePhonetic('')).toBeNull();
    expect(normalizePhonetic('   ')).toBeNull();
  });

  it('keeps already-wrapped phonetics', () => {
    expect(normalizePhonetic('/əˈbændən/')).toBe('/əˈbændən/');
  });

  it('wraps unwrapped phonetics in slashes', () => {
    expect(normalizePhonetic('əˈbændən')).toBe('/əˈbændən/');
    expect(normalizePhonetic('  /foo/  ')).toBe('/foo/');
  });
});

describe('compileWords', () => {
  it('accepts a clean batch and assigns UUIDs + bookId', () => {
    const { words, report } = compileWords(
      [raw({ spelling: 'abandon' }), raw({ spelling: 'ability' })],
      BOOK_ID,
    );
    expect(report.total).toBe(2);
    expect(report.accepted).toBe(2);
    expect(report.dropped).toEqual([]);
    expect(words).toHaveLength(2);
    for (const w of words) {
      expect(w.bookId).toBe(BOOK_ID);
      expect(w.id).toMatch(/[0-9a-f-]{36}/);
    }
  });

  it('lowercases and trims spellings, de-dupes case-insensitively', () => {
    const { words, report } = compileWords(
      [
        raw({ spelling: '  AbAndOn  ' }),
        raw({ spelling: 'abandon' }),
        raw({ spelling: 'ability' }),
      ],
      BOOK_ID,
    );
    expect(report.accepted).toBe(2);
    expect(report.dropped).toHaveLength(1);
    expect(report.dropped[0]?.reason).toMatch(/duplicate/);
    expect(words[0]?.spelling).toBe('abandon');
  });

  it('rejects words with no usable meanings', () => {
    // Force the meaning-bearing fields empty so the spread default doesn't leak in.
    const rows: RawWord[] = [
      { spelling: 'a', meanings: [] },
      { spelling: 'b', meanings: [{ pos: '', def: '   ' }] },
      { spelling: 'c', meanings: [], meaning: '' },
      { spelling: 'd', meanings: [], definition: '' },
    ];
    const { report } = compileWords(rows, BOOK_ID);
    expect(report.accepted).toBe(0);
    expect(report.dropped.map((d) => d.reason)).toEqual([
      'no meanings after normalization',
      'no meanings after normalization',
      'no meanings after normalization',
      'no meanings after normalization',
    ]);
  });

  it('lifts a top-level `meaning` or `definition` string into meanings[0]', () => {
    const { words } = compileWords(
      [raw({ spelling: 'a', meanings: [], meaning: 'fallback def' })],
      BOOK_ID,
    );
    expect(words[0]?.meanings).toEqual([{ pos: '', def: 'fallback def' }]);
  });

  it('warns when neither UK nor US phonetic is available', () => {
    const { report } = compileWords([raw({ spelling: 'silent' })], BOOK_ID);
    expect(report.warnings).toContain('"silent": no phonetic available');
  });
});

describe('deriveBookMeta', () => {
  it('uses canonical Chinese name for known codes', () => {
    expect(deriveBookMeta('cet4', 100)).toEqual({
      id: 'wb-cet4',
      code: 'cet4',
      name: 'CET-4 大学英语四级',
      wordCount: 100,
    });
  });

  it('falls back to uppercased code for unknown codes', () => {
    expect(deriveBookMeta('xyz', 0)).toEqual({
      id: 'wb-xyz',
      code: 'xyz',
      name: 'XYZ',
      wordCount: 0,
    });
  });
});

describe('buildBookFromFile (integration)', () => {
  it('compiles the 50-word CET-4 sample fixture end-to-end', async () => {
    const { artifact, report } = await buildBookFromFile('data/raw/cet4-sample.json');
    expect(report.accepted).toBe(50);
    expect(report.dropped).toEqual([]);
    expect(artifact.book).toMatchObject({ code: 'cet4', name: 'CET-4 大学英语四级' });
    expect(artifact.words).toHaveLength(50);
    expect(artifact.words[0]?.spelling).toBe('abandon');
  });
});
