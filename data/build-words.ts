/**
 * build-words.ts — clean + compile raw wordbook JSON into a normalized
 * import-ready JSON that `wordbookRepository.upsert` + `wordRepository.insertMany`
 * can ingest directly.
 *
 * The pipeline is intentionally explicit so that future scripts
 * (gen-ai-content, audio-fetch, etc.) can plug into the same artifacts:
 *
 *   data/raw/<book>.json
 *     → validate schema, normalize spellings
 *     → enrich with deterministic UUIDs and book_id
 *     → validate phonetic shape, deduplicate
 *     → emit data/dist/<book>.compiled.json
 *     → print a small report (counts, dropped rows, warnings)
 *
 * Usage:
 *   pnpm data:build cet4              # build a single book
 *   pnpm data:build --all             # build every data/raw/*.json
 *
 * The script never talks to the network; AI content and audio live in
 * separate scripts (data/gen-ai-content.ts, data/fetch-audio.ts).
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { MeaningEntry, NewWord } from '../src/db/schema';

export interface RawMeaning {
  pos?: string;
  def?: string;
  examples?: string[];
}

export interface RawWord {
  spelling: string;
  phonetic_uk?: string;
  phonetic_us?: string;
  meanings: RawMeaning[];
  /** Some upstream lists put a `definition` string at the top level. */
  definition?: string;
  /** Some upstream lists put meanings on a single `meaning` field. */
  meaning?: string;
}

export interface CompiledWordbook {
  book: { id: string; code: string; name: string; wordCount: number };
  words: NewWord[];
}

export interface BuildReport {
  source: string;
  total: number;
  accepted: number;
  dropped: { spelling: string; reason: string }[];
  warnings: string[];
}

const PHONETIC_RE = /^\/[^/]+\/$/; // loosely: must start and end with a slash

/** Throws on the first validation error; we want hard failure, not silent truncation. */
function validateRaw(words: unknown, source: string): asserts words is RawWord[] {
  if (!Array.isArray(words)) {
    throw new Error(`${source}: top-level must be an array of word objects`);
  }
  for (const [i, w] of words.entries()) {
    if (typeof w !== 'object' || w === null) {
      throw new Error(`${source}: row #${i} is not an object`);
    }
    const word = w as Record<string, unknown>;
    if (typeof word.spelling !== 'string' || word.spelling.trim().length === 0) {
      throw new Error(`${source}: row #${i} is missing \`spelling\``);
    }
    if (
      !Array.isArray(word.meanings) &&
      typeof word.meaning !== 'string' &&
      typeof word.definition !== 'string'
    ) {
      throw new Error(
        `${source}: row "${word.spelling}" has neither \`meanings\` nor \`meaning\`/\`definition\``,
      );
    }
  }
}

function normalizeMeanings(raw: RawWord): MeaningEntry[] {
  // Some upstream lists ship a single `meaning` / `definition` string. Lift
  // those into a proper `meanings` array so the schema check downstream is
  // happy. We don't split on semicolons — that loses nuance.
  if (Array.isArray(raw.meanings) && raw.meanings.length > 0) {
    return raw.meanings
      .map((m) => ({
        pos: (m.pos ?? '').trim(),
        def: (m.def ?? '').trim(),
        examples: Array.isArray(m.examples) ? m.examples : undefined,
      }))
      .filter((m) => m.def.length > 0);
  }
  const fallback = raw.meaning ?? raw.definition ?? '';
  if (fallback.trim().length > 0) {
    return [{ pos: '', def: fallback.trim() }];
  }
  return [];
}

export function normalizePhonetic(p: string | undefined): string | null {
  if (!p) return null;
  const trimmed = p.trim();
  if (trimmed.length === 0) return null;
  if (PHONETIC_RE.test(trimmed)) return trimmed;
  // Many raw lists ship phonetics without the surrounding slashes; add
  // them so the schema invariant is satisfied.
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}/`;
}

export function compileWords(
  raw: RawWord[],
  bookId: string,
): { words: NewWord[]; report: Omit<BuildReport, 'source'> } {
  const seen = new Set<string>();
  const accepted: NewWord[] = [];
  const dropped: BuildReport['dropped'] = [];
  const warnings: string[] = [];

  for (const row of raw) {
    const spelling = row.spelling.trim().toLowerCase();
    if (spelling.length === 0) {
      dropped.push({ spelling: '', reason: 'empty spelling' });
      continue;
    }
    if (seen.has(spelling)) {
      dropped.push({ spelling, reason: 'duplicate within source' });
      continue;
    }
    const meanings = normalizeMeanings(row);
    if (meanings.length === 0) {
      dropped.push({ spelling, reason: 'no meanings after normalization' });
      continue;
    }

    const phoneticUk = normalizePhonetic(row.phonetic_uk);
    const phoneticUs = normalizePhonetic(row.phonetic_us);
    if (!phoneticUk && !phoneticUs) {
      warnings.push(`"${spelling}": no phonetic available`);
    }

    accepted.push({
      id: randomUUID(),
      bookId,
      spelling,
      phoneticUk,
      phoneticUs,
      meanings,
      examples: [],
      rootAffix: null,
      audioStatus: 'pending',
    });
    seen.add(spelling);
  }

  return {
    words: accepted,
    report: { total: raw.length, accepted: accepted.length, dropped, warnings },
  };
}

export function deriveBookMeta(code: string, wordCount: number) {
  const NAMES: Record<string, string> = {
    cet4: 'CET-4 大学英语四级',
    cet6: 'CET-6 大学英语六级',
    kaoyan: '考研英语',
    toefl: 'TOEFL 托福',
    ielts: 'IELTS 雅思',
    gre: 'GRE',
  };
  return {
    id: `wb-${code}`,
    code,
    name: NAMES[code] ?? code.toUpperCase(),
    wordCount,
  };
}

export async function buildBookFromFile(rawPath: string): Promise<{
  artifact: CompiledWordbook;
  report: BuildReport;
}> {
  const code = rawPath
    .split('/')
    .pop()!
    .replace(/\.json$/, '')
    .replace(/-sample$/, '');
  const raw = JSON.parse(await readFile(rawPath, 'utf8'));
  validateRaw(raw, rawPath);
  const book = deriveBookMeta(code, 0);
  const { words, report } = compileWords(raw, book.id);
  book.wordCount = words.length;
  return {
    artifact: { book, words },
    report: { source: rawPath, ...report },
  };
}

function formatReport(report: BuildReport): string {
  const lines: string[] = [];
  lines.push(`Source: ${report.source}`);
  lines.push(`  total:   ${report.total}`);
  lines.push(`  accepted: ${report.accepted}`);
  lines.push(`  dropped:  ${report.dropped.length}`);
  for (const d of report.dropped.slice(0, 10)) {
    lines.push(`    - "${d.spelling}": ${d.reason}`);
  }
  if (report.dropped.length > 10) lines.push(`    ... +${report.dropped.length - 10} more`);
  if (report.warnings.length > 0) {
    lines.push(`  warnings: ${report.warnings.length}`);
    for (const w of report.warnings.slice(0, 5)) {
      lines.push(`    ! ${w}`);
    }
    if (report.warnings.length > 5) lines.push(`    ... +${report.warnings.length - 5} more`);
  }
  return lines.join('\n');
}

export async function main(argv: string[]): Promise<void> {
  const ROOT = resolve(process.cwd());
  const RAW_DIR = join(ROOT, 'data', 'raw');
  const DIST_DIR = join(ROOT, 'data', 'dist');
  await mkdir(DIST_DIR, { recursive: true });

  const targets =
    argv.includes('--all') || argv.length === 0
      ? await listRawBooks(RAW_DIR)
      : argv.map((code) => join(RAW_DIR, `${code}.json`));

  if (targets.length === 0) {
    console.warn('No raw wordbook JSONs found. Add files under data/raw/.');
    return;
  }

  let totalAccepted = 0;
  for (const path of targets) {
    try {
      const { artifact, report } = await buildBookFromFile(path);
      const outPath = join(DIST_DIR, `${artifact.book.code}.compiled.json`);
      await writeFile(outPath, JSON.stringify(artifact, null, 2), 'utf8');
      console.log(formatReport(report));
      console.log(`  → wrote ${outPath}\n`);
      totalAccepted += report.accepted;
    } catch (err) {
      console.error(`✖ ${path}: ${(err as Error).message}\n`);
      process.exitCode = 1;
    }
  }
  console.log(`Done. ${totalAccepted} words compiled across ${targets.length} book(s).`);
}

async function listRawBooks(rawDir: string): Promise<string[]> {
  const files = await readdir(rawDir);
  return files.filter((f) => f.endsWith('.json')).map((f) => join(rawDir, f));
}

// Run when invoked as a script (not when imported by tests).
// We check whether process.argv[1] ends with this filename; the leading
// component may differ between platforms (`./data/build-words.ts` vs an
// absolute path on Windows), so we match on the basename.
const invokedDirectly = (() => {
  const arg = process.argv[1];
  if (!arg) return false;
  return arg.replace(/\\/g, '/').endsWith('data/build-words.ts');
})();
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
