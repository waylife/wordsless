/**
 * Catalog of every wordbook the app knows about, in display order.
 *
 * The actual word contents live in the SQLite database (after import);
 * this constant is the surface the UI uses to render the picker and to
 * look up a book's display name. Codes here must match the
 * `WordbookCode` enum in `@/db/schema`.
 */
import { WordbookCode, type WordbookCodeValue } from '@/db/schema';

export interface WordbookCatalogEntry {
  code: WordbookCodeValue;
  name: string;
  shortName: string;
  /** One-sentence positioning shown under the title in the picker. */
  blurb: string;
  /** Approximate target word count, used for the "X days at 30/day" hint. */
  approxWordCount: number;
  /**
   * True when the binary content ships with the dev build (i.e. is
   * importable from a Metro-resolved asset). Toggled in CI per release;
   * the picker disables the "下载" button when false.
   */
  bundled: boolean;
}

export const WORDBOOK_CATALOG: WordbookCatalogEntry[] = [
  {
    code: 'cet4',
    name: 'CET-4 大学英语四级',
    shortName: '四级',
    blurb: '高考之后到四级的常用词,约 2600 词,大一到大二主攻。',
    approxWordCount: 2607,
    bundled: true,
  },
  {
    code: 'cet6',
    name: 'CET-6 大学英语六级',
    shortName: '六级',
    blurb: '六级核心词,约 5500 词,出国/考研前的台阶。',
    approxWordCount: 5500,
    bundled: false,
  },
  {
    code: 'kaoyan',
    name: '考研英语',
    shortName: '考研',
    blurb: '考研大纲核心 + 高频词,约 5500 词,真题导向。',
    approxWordCount: 5500,
    bundled: false,
  },
  {
    code: 'toefl',
    name: 'TOEFL 托福',
    shortName: 'TOEFL',
    blurb: 'TPO 高频词 + 学科词汇,约 8000 词。',
    approxWordCount: 8000,
    bundled: false,
  },
  {
    code: 'ielts',
    name: 'IELTS 雅思',
    shortName: 'IELTS',
    blurb: '雅思考官范文 + 真题词频,约 6000 词。',
    approxWordCount: 6000,
    bundled: false,
  },
  {
    code: 'gre',
    name: 'GRE',
    shortName: 'GRE',
    blurb: 'GRE 核心 + 数学词汇,约 8000 词。',
    approxWordCount: 8000,
    bundled: false,
  },
];

export const WORDBOOK_CODES = WordbookCode;

export function daysAtRate(wordCount: number, perDay: number): number {
  return Math.max(1, Math.ceil(wordCount / perDay));
}
