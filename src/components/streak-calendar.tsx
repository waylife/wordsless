/**
 * StreakCalendar — a heatmap-style grid showing the last N days of
 * study activity. Renders as a square grid so it stays compact; each
 * cell is a soft square that gets darker the more cards the user
 * reviewed that day. The future is greyed out.
 *
 * The component is data-driven: callers pass in a `Map<isoDate, count>`
 * (or anything `get`-able) and a `today` reference. It does not
 * reach into the database itself — that keeps it trivially testable
 * and reusable on the Stats / Checkin pages.
 */
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';

import { FontSize, FontWeight, Radii, SemanticColors, Spacing } from '@/constants/theme';

export interface StreakCalendarProps {
  /** ISO date `YYYY-MM-DD` → total cards reviewed (or any positive number). */
  counts: Map<string, number> | Record<string, number>;
  /** How many days to show, ending today. Default 28 (4 weeks). */
  days?: number;
  /** Reference "today" — useful for tests; defaults to `new Date()`. */
  today?: Date;
  /** Accessibility label override. */
  accessibilityLabel?: string;
}

const PALETTE = [
  'transparent',
  '#DCFCE7', // 1-9: very soft green
  '#86EFAC', // 10-29: medium
  '#22C55E', // 30-99: brand
  '#15803D', // 100+: deep
] as const;

function bucket(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count < 10) return 1;
  if (count < 30) return 2;
  if (count < 100) return 3;
  return 4;
}

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function StreakCalendar({
  counts,
  days = 28,
  today = new Date(),
  accessibilityLabel,
}: StreakCalendarProps) {
  const grid = useMemo(() => buildGrid(counts, days, today), [counts, days, today]);
  const cellSize = 18;
  const cellGap = 4;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? `近 ${days} 天打卡日历`}
      style={styles.wrap}
    >
      <View style={styles.row}>
        {grid.weeks.map((week, wi) => (
          <View
            key={`w-${wi}`}
            style={[styles.col, { marginRight: wi === grid.weeks.length - 1 ? 0 : cellGap }]}
          >
            {week.cells.map((cell, ci) => {
              const isToday = cell.iso === grid.todayIso;
              const fill = PALETTE[cell.bucket];
              const isFuture = cell.isFuture;
              return (
                <View
                  key={`c-${wi}-${ci}`}
                  style={[
                    styles.cell,
                    {
                      width: cellSize,
                      height: cellSize,
                      marginBottom: ci === week.cells.length - 1 ? 0 : cellGap,
                      backgroundColor: isFuture ? 'transparent' : fill,
                      borderColor: isToday ? SemanticColors.primary : 'transparent',
                      borderWidth: isToday ? 1.5 : 0,
                      borderRadius: Radii.sm,
                      opacity: isFuture ? 0.35 : 1,
                    },
                  ]}
                />
              );
            })}
          </View>
        ))}
      </View>
      <View style={[styles.legendRow, { marginTop: Spacing.two }]}>
        <Text style={[styles.legendLabel, { color: themeSubtle() }]}>少</Text>
        {PALETTE.map((color, i) => (
          <View
            key={`lg-${i}`}
            style={[
              styles.legendCell,
              {
                backgroundColor: color,
                borderColor: 'transparent',
                borderWidth: 0,
                borderRadius: 3,
                marginLeft: i === 0 ? Spacing.one : 3,
              },
            ]}
          />
        ))}
        <Text style={[styles.legendLabel, { color: themeSubtle(), marginLeft: Spacing.one }]}>
          多
        </Text>
      </View>
    </View>
  );
}

interface Cell {
  iso: string;
  bucket: 0 | 1 | 2 | 3 | 4;
  isFuture: boolean;
}
interface Week {
  cells: Cell[];
}
interface Grid {
  weeks: Week[];
  todayIso: string;
}

function buildGrid(
  counts: Map<string, number> | Record<string, number>,
  days: number,
  today: Date,
): Grid {
  const get = (key: string): number => {
    if (counts instanceof Map) return counts.get(key) ?? 0;
    return (counts as Record<string, number>)[key] ?? 0;
  };
  const todayStart = startOfDay(today);
  const todayIso = isoDay(todayStart);

  // Walk back from today; if today-of-week is mid-week, pad the front
  // so the grid always starts on Monday (ISO week).
  const dow = (todayStart.getDay() + 6) % 7; // 0=Mon
  const startDate = new Date(todayStart);
  startDate.setDate(startDate.getDate() - (days - 1) - dow);

  const cells: Cell[] = [];
  const total = dow + days;
  for (let i = 0; i < total; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const iso = isoDay(d);
    const isFuture = d.getTime() > todayStart.getTime();
    cells.push({
      iso,
      bucket: isFuture ? 0 : bucket(get(iso)),
      isFuture,
    });
  }
  const weeks: Week[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push({ cells: cells.slice(i, i + 7) });
  }
  return { weeks, todayIso };
}

function themeSubtle(): string {
  return SemanticColors.excluded;
}

const styles: { [k: string]: ViewStyle | TextStyle } = {
  wrap: {
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
  },
  col: {
    flexDirection: 'column',
  },
  cell: {
    // size is set inline; remaining styles come from inline `style`.
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendCell: {
    width: 10,
    height: 10,
  },
  legendLabel: {
    fontSize: FontSize.caption,
    fontWeight: FontWeight.regular,
  },
};
