/**
 * ProgressRing — circular progress indicator.
 *
 * Implemented with two overlapping half-circles (`Animated.View` with
 * `rotate`) so the app ships with zero extra native dependencies. For
 * more complex shapes (gauges, ring-with-bullet) we'll graduate to
 * `react-native-svg` later.
 *
 * Props:
 *   progress - 0..1
 *   size     - outer diameter in points
 *   stroke   - ring thickness in points
 *   color    - filled portion color
 *   trackColor - background ring color
 *   children - optional center label (e.g. "12/30")
 */
import { type ReactNode, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

import { Colors, FontSize, FontWeight, SemanticColors } from '@/constants/theme';

export interface ProgressRingProps {
  progress: number;
  size?: number;
  stroke?: number;
  color?: string;
  trackColor?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function ProgressRing({
  progress,
  size = 96,
  stroke = 8,
  color = SemanticColors.primary,
  trackColor = Colors.light.backgroundElement,
  children,
  style,
  labelStyle,
}: ProgressRingProps) {
  const clamped = clamp01(progress);
  // Two halves: when progress <= 0.5 the right half rotates, then the left.
  // Simpler visual: rotate a single half on top of a full track.
  const halfRotation = useMemo(() => Math.min(clamped, 0.5) * 360, [clamped]);
  const overflow = clamped > 0.5 ? Math.min((clamped - 0.5) * 360, 180) : 0;

  const halfSize = size / 2;

  return (
    <View
      testID="progress-ring"
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[styles.wrapper, { width: size, height: size }, style]}
    >
      {/* Track */}
      <View
        style={[
          styles.track,
          {
            width: size,
            height: size,
            borderRadius: halfSize,
            borderWidth: stroke,
            borderColor: trackColor,
          },
        ]}
      />
      {/* Right half: rotated to reveal the colored portion of the right side */}
      <View
        style={[
          styles.halfWrapper,
          {
            width: halfSize,
            height: size,
            right: 0,
            top: 0,
            transform: [
              { translateX: halfSize / 2 },
              { rotate: `${halfRotation}deg` },
              { translateX: -halfSize / 2 },
            ],
          },
        ]}
      >
        <View
          style={[
            styles.half,
            {
              width: halfSize,
              height: size,
              borderTopRightRadius: halfSize,
              borderBottomRightRadius: halfSize,
              borderWidth: stroke,
              borderColor: color,
              borderLeftWidth: 0,
            },
          ]}
        />
      </View>
      {/* Left half: only visible when progress > 0.5, also rotates */}
      {overflow > 0 ? (
        <View
          style={[
            styles.halfWrapper,
            {
              width: halfSize,
              height: size,
              left: 0,
              top: 0,
              transform: [
                { translateX: -halfSize / 2 },
                { rotate: `${overflow - 180}deg` },
                { translateX: halfSize / 2 },
              ],
            },
          ]}
        >
          <View
            style={[
              styles.half,
              {
                width: halfSize,
                height: size,
                borderTopLeftRadius: halfSize,
                borderBottomLeftRadius: halfSize,
                borderWidth: stroke,
                borderColor: color,
                borderRightWidth: 0,
              },
            ]}
          />
        </View>
      ) : null}
      <View style={[styles.label, { width: size, height: size }]}>
        {typeof children === 'string' ? (
          <Text style={[styles.labelText, labelStyle]}>{children}</Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    position: 'absolute',
    backgroundColor: 'transparent',
  },
  halfWrapper: {
    position: 'absolute',
    overflow: 'hidden',
  },
  half: {
    backgroundColor: 'transparent',
  },
  label: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelText: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
    color: Colors.light.text,
  },
});
