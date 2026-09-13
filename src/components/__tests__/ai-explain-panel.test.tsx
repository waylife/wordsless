/**
 * Unit tests for the streaming parser used by AiExplainPanel.
 *
 * The parser is deliberately tolerant: it must handle partial JSON as the
 * stream lands, mixed key order within an example object, and multiple
 * examples in an array. Everything here is pure-string input — no network,
 * no React, no runtime imports.
 */
import { parseSections } from '../ai-explain-panel';

describe('parseSections', () => {
  it('returns an empty shape for an empty string', () => {
    expect(parseSections('')).toEqual({
      root: '',
      mnemonic: '',
      examples: [],
      raw: '',
    });
  });

  it('extracts root and mnemonic when present', () => {
    const s = parseSections('{"root":"serendip + ity","mnemonic":"serene + dip + city"}');
    expect(s.root).toBe('serendip + ity');
    expect(s.mnemonic).toBe('serene + dip + city');
    expect(s.examples).toEqual([]);
  });

  it('parses a single example in the "examples" array', () => {
    const s = parseSections(
      '{"examples":[{"en":"Finding this cafe was serendipity.","cn":"找到这家咖啡馆纯属意外。"}]}',
    );
    expect(s.examples).toEqual([
      { en: 'Finding this cafe was serendipity.', cn: '找到这家咖啡馆纯属意外。' },
    ]);
  });

  it('parses 3-5 examples in order', () => {
    const s = parseSections(
      JSON.stringify({
        examples: [
          { en: 'a', cn: '甲' },
          { en: 'b', cn: '乙' },
          { en: 'c', cn: '丙' },
          { en: 'd', cn: '丁' },
          { en: 'e', cn: '戊' },
        ],
      }),
    );
    expect(s.examples).toHaveLength(5);
    expect(s.examples.map((x) => x.en)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('stops cleanly when the last example is only half-streamed', () => {
    const partial =
      '{"examples":[{"en":"complete one.","cn":"完整一条。"},' + '{"en":"partial one only"}'; // no cn yet, brace still open
    const s = parseSections(partial);
    expect(s.examples).toHaveLength(1);
    expect(s.examples[0].en).toBe('complete one.');
  });

  it('tolerates whitespace and escaped quotes', () => {
    const s = parseSections(
      '{"examples":[{"en":"He said \\"hello\\" at dawn.", "cn":"他在黎明时说\\"你好\\"。"}]}',
    );
    expect(s.examples[0].en).toBe('He said "hello" at dawn.');
    expect(s.examples[0].cn).toBe('他在黎明时说"你好"。');
  });

  it('ignores example-like keys outside the examples block', () => {
    // "en" and "cn" appear as top-level keys — parser should not treat them
    // as an example entry since they live outside an array.
    const s = parseSections(
      '{"note":"hello","examples":[{"en":"only this one.", "cn":"只有这一条。"}]}',
    );
    expect(s.examples).toHaveLength(1);
    expect(s.examples[0].en).toBe('only this one.');
  });
});
