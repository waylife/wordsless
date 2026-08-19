/**
 * gen-ai-content.ts — walk through a compiled wordbook JSON and call
 * MiniMax once per word to produce AI explanations (example, root,
 * mnemonic). Designed for a single-developer batch run:
 *
 *   - 5 req/s soft cap (configurable via --rps)
 *   - exponential backoff on 429/5xx, up to 3 retries per word
 *   - resume from disk: we cache results under data/ai-cache/<code>.json
 *     after every successful word, so a Ctrl-C can pick up where it
 *     left off
 *   - strict JSON validation: a model response that doesn't parse is
 *     dropped with a warning, not retried forever
 *   - when MINIMAX_API_KEY is missing, the script is a no-op and prints
 *     a one-line guide so first-time users know what to set
 *
 * The output file matches `ai_content` rows in src/db/schema.ts; Phase
 * 1.4 will wire a small loader to ingest it into the SQLite db.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { chatCompletion, readApiKey } from '../src/core/ai/client';
import {
  buildChatOptions,
  extractJsonObject,
  validateGenerated,
  type AiGenerated,
} from '../src/core/ai/prompts';
import { RateLimiter } from '../src/core/ai/rate-limiter';

interface CompiledWord {
  id: string;
  spelling: string;
  meanings: { pos: string; def: string }[];
}

interface CompiledWordbook {
  book: { id: string; code: string; name: string; wordCount: number };
  words: CompiledWord[];
}

interface CacheEntry {
  wordId: string;
  spelling: string;
  generated: AiGenerated;
  model: string;
  generatedAt: number;
}

interface CacheFile {
  book: { id: string; code: string };
  entries: Record<string, CacheEntry>;
}

interface CliArgs {
  code: string;
  rps: number;
  limit?: number;
  model: string;
  baseUrl: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val && !val.startsWith('--')) {
        args[key] = val;
        i++;
      } else {
        args[key] = 'true';
      }
    } else if (!args.code) {
      args.code = a;
    }
  }
  return {
    code: args.code ?? '',
    rps: Number(args.rps ?? 5),
    limit: args.limit ? Number(args.limit) : undefined,
    model: args.model ?? 'MiniMax-M2',
    baseUrl: args.baseurl ?? 'https://api.minimaxi.com/v1',
  };
}

async function loadCompiled(ROOT: string, code: string): Promise<CompiledWordbook> {
  const path = join(ROOT, 'data', 'dist', `${code}.compiled.json`);
  if (!existsSync(path)) {
    throw new Error(`Compiled wordbook not found: ${path}. Run \`pnpm data:build ${code}\` first.`);
  }
  return JSON.parse(await readFile(path, 'utf8')) as CompiledWordbook;
}

async function loadCache(ROOT: string, code: string): Promise<CacheFile> {
  const path = join(ROOT, 'data', 'ai-cache', `${code}.json`);
  if (!existsSync(path)) {
    return { book: { id: '', code }, entries: {} };
  }
  return JSON.parse(await readFile(path, 'utf8')) as CacheFile;
}

async function saveCache(ROOT: string, code: string, cache: CacheFile): Promise<void> {
  const dir = join(ROOT, 'data', 'ai-cache');
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${code}.json`);
  await writeFile(path, JSON.stringify(cache, null, 2), 'utf8');
}

function primaryDefinition(word: CompiledWord): string {
  const m = word.meanings[0];
  if (!m) return '';
  return `${m.pos ? m.pos + ' ' : ''}${m.def}`.trim();
}

async function withRetries<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  let backoffMs = 800;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // Only retry on 429/5xx; surface 4xx to the caller immediately.
      const status = (err as { status?: number })?.status;
      if (status && status >= 400 && status < 500 && status !== 429) throw err;
      if (i === attempts - 1) break;
      await new Promise((r) => setTimeout(r, backoffMs));
      backoffMs *= 2;
    }
  }
  throw lastErr;
}

export async function generateForWord(
  word: CompiledWord,
  apiKey: string,
  baseUrl: string,
  model: string,
  limiter: RateLimiter,
): Promise<AiGenerated | null> {
  const def = primaryDefinition(word);
  if (!def) return null;

  await limiter.acquire();
  const result = await withRetries(() =>
    chatCompletion(buildChatOptions(baseUrl, apiKey, model, word.spelling, def)),
  );

  const parsed = extractJsonObject(result.text);
  return validateGenerated(parsed);
}

export async function main(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const ROOT = resolve(process.cwd());
  const args = parseArgs(argv);
  if (!args.code) {
    console.error('usage: pnpm data:ai <code> [--rps N] [--limit N] [--model ID]');
    process.exitCode = 2;
    return;
  }

  const apiKey = readApiKey(env.MINIMAX_API_KEY, join(ROOT, '.env.local'));
  if (!apiKey) {
    console.warn(
      '⚠  MINIMAX_API_KEY is not set. The AI step is a no-op; the rest of the\n' +
        '   pipeline still works (the data flows through to the device without\n' +
        '   AI enrichment). Set MINIMAX_API_KEY in your env or .env.local to\n' +
        '   run the AI step.',
    );
    return;
  }

  const compiled = await loadCompiled(ROOT, args.code);
  const cache = await loadCache(ROOT, args.code);
  cache.book = { id: compiled.book.id, code: compiled.book.code };

  const todo = compiled.words
    .filter((w) => !cache.entries[w.id])
    .slice(0, args.limit ?? compiled.words.length);

  console.log(
    `Book: ${compiled.book.code} (${compiled.book.name}) — ${todo.length}/${compiled.words.length} words need AI enrichment`,
  );
  if (todo.length === 0) {
    console.log('Nothing to do (cache is already current).');
    return;
  }

  const limiter = new RateLimiter(args.rps, 1000);
  let ok = 0;
  let dropped = 0;
  const failures: { spelling: string; reason: string }[] = [];

  for (const [i, word] of todo.entries()) {
    process.stdout.write(`[${i + 1}/${todo.length}] ${word.spelling}…`);
    try {
      const generated = await generateForWord(word, apiKey, args.baseUrl, args.model, limiter);
      if (!generated) {
        process.stdout.write(' drop (bad JSON)\n');
        dropped += 1;
        failures.push({ spelling: word.spelling, reason: 'invalid JSON / missing fields' });
        continue;
      }
      cache.entries[word.id] = {
        wordId: word.id,
        spelling: word.spelling,
        generated,
        model: args.model,
        generatedAt: Date.now(),
      };
      await saveCache(ROOT, args.code, cache);
      ok += 1;
      process.stdout.write(' ok\n');
    } catch (err) {
      const reason = (err as Error).message;
      process.stdout.write(` fail (${reason})\n`);
      dropped += 1;
      failures.push({ spelling: word.spelling, reason });
    }
  }

  console.log(
    `\nDone. ok=${ok} dropped=${dropped} (cache total: ${Object.keys(cache.entries).length}/${compiled.words.length})`,
  );
  if (failures.length > 0) {
    console.log('Failures:');
    for (const f of failures.slice(0, 10)) {
      console.log(`  - ${f.spelling}: ${f.reason}`);
    }
    if (failures.length > 10) console.log(`  … +${failures.length - 10} more`);
  }
}

const invokedDirectly = (() => {
  const arg = process.argv[1];
  if (!arg) return false;
  return arg.replace(/\\/g, '/').endsWith('data/gen-ai-content.ts');
})();
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
