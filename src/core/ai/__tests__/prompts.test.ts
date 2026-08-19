/**
 * Prompt + response validation tests. These are the safety net for the
 * model output: if the server sends back prose instead of JSON, or
 * returns the wrong shape, we'd write garbage into the AI cache.
 */
import {
  buildChatOptions,
  buildUserPrompt,
  extractJsonObject,
  validateGenerated,
} from '@/core/ai/prompts';

describe('extractJsonObject', () => {
  it('parses a plain JSON object', () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it('tolerates surrounding prose and code fences', () => {
    expect(extractJsonObject('Sure! ```json\n{"a":1}\n``` done.')).toEqual({ a: 1 });
  });

  it('returns null on no braces', () => {
    expect(extractJsonObject('just a thought')).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    expect(extractJsonObject('{not json')).toBeNull();
  });
});

describe('validateGenerated', () => {
  it('accepts a complete shape', () => {
    const v = validateGenerated({
      example: { en: 'I felt afraid.', cn: '我感到害怕。' },
      root: 'a- + bond',
      mnemonic: 'He abandoned the bond.',
    });
    expect(v).toEqual({
      example: { en: 'I felt afraid.', cn: '我感到害怕。' },
      root: 'a- + bond',
      mnemonic: 'He abandoned the bond.',
    });
  });

  it('trims whitespace', () => {
    const v = validateGenerated({
      example: { en: '  Hello.  ', cn: ' 你好。' },
      root: '  root  ',
      mnemonic: '  mem  ',
    });
    expect(v?.example.en).toBe('Hello.');
    expect(v?.root).toBe('root');
  });

  it('rejects when example is missing or empty', () => {
    expect(validateGenerated({ example: { en: '', cn: '' }, root: 'r', mnemonic: 'm' })).toBeNull();
    expect(validateGenerated({ root: 'r', mnemonic: 'm' })).toBeNull();
  });

  it('rejects when root or mnemonic are not strings', () => {
    expect(validateGenerated({ example: { en: 'x', cn: 'y' }, root: 1, mnemonic: 'm' })).toBeNull();
    expect(
      validateGenerated({ example: { en: 'x', cn: 'y' }, root: 'r', mnemonic: null }),
    ).toBeNull();
  });
});

describe('buildUserPrompt', () => {
  it('includes spelling and gloss', () => {
    const p = buildUserPrompt('abandon', 'to give up');
    expect(p).toContain('abandon');
    expect(p).toContain('to give up');
  });
});

describe('buildChatOptions', () => {
  it('uses a non-streaming, low-temperature config by default', () => {
    const opts = buildChatOptions('https://x', 'k', 'm', 'abandon', 'give up');
    expect(opts.stream).toBe(false);
    expect(opts.temperature).toBe(0.3);
    expect(opts.messages[0]?.role).toBe('system');
    expect(opts.messages[1]?.role).toBe('user');
  });

  it('lets the caller override temperature/timeout', () => {
    const opts = buildChatOptions('https://x', 'k', 'm', 'a', 'b', {
      temperature: 0.9,
      timeoutMs: 5_000,
    });
    expect(opts.temperature).toBe(0.9);
    expect(opts.timeoutMs).toBe(5_000);
  });
});
