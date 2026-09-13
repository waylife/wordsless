/**
 * AiExplainPanel — streaming AI explainer for a single word.
 *
 * Wraps `core/ai/runtime.streamExplain` and renders the incremental
 * text. The parent owns "is the panel open" / "which word to ask
 * about"; this component owns the request lifecycle.
 *
 * Output is expected to be JSON shaped as
 *   { root, mnemonic, examples: [{ en, cn }, …] }
 * (see RUNTIME_SYSTEM_PROMPT in `core/ai/runtime.ts`). We parse what we
 * can from the partial text and render the sections as the stream lands —
 * that way the user gets feedback before the model finishes. We render as
 * many complete examples as we've seen; partial ones wait for the next
 * delta.
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';

import { streamExplain } from '@/core/ai/runtime';
import type { Word } from '@/db/schema';
import { Colors, FontSize, FontWeight, Radii, SemanticColors, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type AiStatus = 'idle' | 'streaming' | 'done' | 'error' | 'no-key';

export interface AiExplainPanelProps {
  word: Word;
  /** First gloss — used in the user prompt. */
  gloss: string;
  /** Auto-start on mount. Default: true. */
  autoStart?: boolean;
  onStatusChange?: (status: AiStatus) => void;
}

interface ParsedSections {
  root: string;
  mnemonic: string;
  examples: { en: string; cn: string }[];
  raw: string;
}

export function parseSections(text: string): ParsedSections {
  // Use JSON.parse to unescape \" \\ \n etc. reliably; fall back to a
  // naive unescape if the stream is mid-token.
  const unescape = (s: string) => {
    try {
      return JSON.parse(`"${s}"`) as string;
    } catch {
      return s.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
  };
  // We accept a partial parse — the model streams tokens and we want to
  // surface the earliest possible structured view.
  const grab = (key: string): string => {
    const re = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 's');
    const m = text.match(re);
    return m ? unescape(m[1]) : '';
  };
  // Grab every complete {en, cn} pair inside the "examples" array. We
  // tolerate either key order and stop at the first un-terminated string
  // (which is what you get mid-stream). Each match becomes one example.
  const exampleRe = /"en"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"cn"\s*:\s*"((?:\\.|[^"\\])*)"/g;
  const examples: { en: string; cn: string }[] = [];
  for (const m of text.matchAll(exampleRe)) {
    const en = unescape(m[1]);
    const cn = unescape(m[2]);
    if (en && cn) examples.push({ en, cn });
  }
  return {
    root: grab('root'),
    mnemonic: grab('mnemonic'),
    examples,
    raw: text,
  };
}

export function AiExplainPanel({
  word,
  gloss,
  autoStart = true,
  onStatusChange,
}: AiExplainPanelProps) {
  const theme = useTheme();
  const [status, setStatus] = useState<AiStatus>('idle');
  const [text, setText] = useState('');
  const abortRef = useRef(false);

  useEffect(() => {
    abortRef.current = false;
    // Reset the streamed buffer when the target word changes. The
    // linter flags this as "setState in effect" but it's a legitimate
    // synchronisation: a new word id means a fresh stream.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText('');
    if (!autoStart) return;
    void run();
    return () => {
      abortRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word.id]);

  async function run() {
    setStatus('streaming');
    onStatusChange?.('streaming');
    const prompt = `Word: ${word.spelling}\nGloss: ${gloss}\nProduce the JSON.`;
    await streamExplain(
      { word: { spelling: word.spelling, gloss }, prompt },
      {
        onDelta: (delta) => {
          if (abortRef.current) return;
          setText((prev) => prev + delta);
        },
        onDone: () => {
          if (abortRef.current) return;
          setStatus('done');
          onStatusChange?.('done');
        },
        onError: (err) => {
          if (abortRef.current) return;
          if (err.message.includes('API Key')) {
            setStatus('no-key');
            onStatusChange?.('no-key');
          } else {
            setStatus('error');
            onStatusChange?.('error');
          }
        },
      },
    );
  }

  const sections = parseSections(text);
  const hasAny = Boolean(sections.root || sections.mnemonic || sections.examples.length > 0);

  return (
    <View testID="ai-explain-panel" style={[styles.wrap, { borderColor: theme.border }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.text }]}>AI 解释</Text>
        {status === 'streaming' ? (
          <ActivityIndicator size="small" color={Colors.light.primary} />
        ) : null}
        {status === 'done' ? (
          <Text style={[styles.tag, { color: SemanticColors.success }]}>完成</Text>
        ) : null}
        {status === 'error' ? (
          <Text style={[styles.tag, { color: SemanticColors.danger }]}>出错</Text>
        ) : null}
        {status === 'no-key' ? (
          <Text style={[styles.tag, { color: SemanticColors.warning }]}>未配 Key</Text>
        ) : null}
        {status === 'done' || status === 'error' ? (
          <Pressable
            onPress={() => {
              setText('');
              setStatus('idle');
              void run();
            }}
            style={({ pressed }) => [styles.regen, pressed && styles.regenPressed]}
          >
            <Text style={styles.regenLabel}>重新生成</Text>
          </Pressable>
        ) : null}
      </View>

      {status === 'no-key' ? (
        <Text style={[styles.empty, { color: theme.textSecondary }]}>
          未配置 MiniMax API Key,请到「设置」页填入后重试。
        </Text>
      ) : status === 'error' ? (
        <Text style={[styles.empty, { color: theme.textSecondary }]}>
          生成失败,请检查网络或稍后重试。
        </Text>
      ) : !hasAny && status === 'streaming' ? (
        <Text style={[styles.empty, { color: theme.textSecondary }]}>模型正在思考…</Text>
      ) : null}

      {hasAny ? (
        <View style={styles.sections}>
          {sections.root ? <Section title="词源" body={sections.root} /> : null}
          {sections.mnemonic ? <Section title="助记" body={sections.mnemonic} /> : null}
          {sections.examples.length > 0 ? (
            <Section title={`例句 (${sections.examples.length})`} body="" />
          ) : null}
          {sections.examples.map((ex, i) => (
            <View key={`${i}-${ex.en.slice(0, 24)}`} style={styles.exampleRow}>
              <Text style={[styles.exampleIndex, { color: SemanticColors.primary }]}>{i + 1}</Text>
              <View style={styles.exampleBody}>
                <Text style={[styles.exampleEn, { color: theme.text }]}>{ex.en}</Text>
                {ex.cn ? (
                  <Text style={[styles.exampleCn, { color: theme.textSecondary }]}>{ex.cn}</Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: SemanticColors.primary }]}>{title}</Text>
      {body ? <Text style={[styles.sectionBody, { color: Colors.light.text }]}>{body}</Text> : null}
    </View>
  );
}

const styles: { [k: string]: ViewStyle | TextStyle } = {
  wrap: {
    borderRadius: Radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    fontSize: FontSize.subtitle,
    fontWeight: FontWeight.bold,
    flex: 1,
  },
  tag: {
    fontSize: FontSize.caption,
    fontWeight: FontWeight.semibold,
  },
  regen: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Radii.pill,
    backgroundColor: Colors.light.backgroundElement,
  },
  regenPressed: {
    backgroundColor: Colors.light.backgroundSelected,
  },
  regenLabel: {
    fontSize: FontSize.small,
    color: Colors.light.primary,
    fontWeight: FontWeight.semibold,
  },
  empty: {
    fontSize: FontSize.body,
  },
  sections: {
    gap: Spacing.three,
  },
  section: {
    gap: Spacing.half,
  },
  sectionTitle: {
    fontSize: FontSize.small,
    fontWeight: FontWeight.semibold,
  },
  sectionBody: {
    fontSize: FontSize.body,
    lineHeight: 22,
  },
  exampleRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingLeft: Spacing.three,
    paddingVertical: Spacing.half,
  },
  exampleIndex: {
    fontSize: FontSize.small,
    fontWeight: FontWeight.bold,
    minWidth: 14,
    marginTop: 2,
  },
  exampleBody: {
    flex: 1,
    gap: 2,
  },
  exampleEn: {
    fontSize: FontSize.body,
    lineHeight: 20,
  },
  exampleCn: {
    fontSize: FontSize.small,
    lineHeight: 18,
  },
};
