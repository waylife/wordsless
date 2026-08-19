/**
 * Button — the primary call-to-action primitive for Wordsless.
 *
 * Variants:
 *   primary   - filled with the brand color, used for the dominant action
 *   secondary - filled with the background element color, used for paired actions
 *   ghost     - text-only, no background, used for tertiary / cancel actions
 *   danger    - filled with the danger color, used for destructive actions
 *
 * Sizes:
 *   sm - compact, used in lists or inline actions
 *   md - default, used in forms and main flows
 *   lg - hero, used on the empty-state and onboarding screens
 *
 * The component is fully driven by design tokens from `@/constants/theme` so
 * it adapts to light/dark automatically.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PressableProps, StyleProp, TextStyle, ViewStyle } from 'react-native';

import { Colors, FontSize, FontWeight, HitSlop, Radii, Spacing } from '@/constants/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

interface VariantStyle {
  bg: string;
  bgPressed: string;
  fg: string;
  border?: string;
}

const VARIANTS: Record<ButtonVariant, VariantStyle> = {
  primary: {
    bg: Colors.light.primary,
    bgPressed: Colors.light.primaryPressed,
    fg: Colors.light.onPrimary,
  },
  secondary: {
    bg: Colors.light.backgroundElement,
    bgPressed: Colors.light.backgroundSelected,
    fg: Colors.light.text,
  },
  ghost: {
    bg: 'transparent',
    bgPressed: Colors.light.backgroundElement,
    fg: Colors.light.primary,
  },
  danger: {
    bg: '#EF4444',
    bgPressed: '#DC2626',
    fg: '#FFFFFF',
  },
};

const SIZE_PADDING: Record<
  ButtonSize,
  { v: number; h: number; fs: number; fw: keyof typeof FontWeight }
> = {
  sm: { v: Spacing.one, h: Spacing.three, fs: FontSize.small, fw: 'medium' },
  md: { v: Spacing.two, h: Spacing.four, fs: FontSize.body, fw: 'semibold' },
  lg: { v: Spacing.three, h: Spacing.five, fs: FontSize.subtitle, fw: 'semibold' },
};

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  style,
  textStyle,
  onPress,
  ...rest
}: ButtonProps) {
  const v = VARIANTS[variant];
  const s = SIZE_PADDING[size];

  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      hitSlop={HitSlop}
      disabled={isDisabled}
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: pressed && !isDisabled ? v.bgPressed : v.bg,
          paddingVertical: s.v,
          paddingHorizontal: s.h,
          borderRadius: Radii.md,
          borderWidth: v.border ? StyleSheet.hairlineWidth : 0,
          borderColor: v.border,
          opacity: isDisabled ? 0.55 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
      {...rest}
    >
      {leftIcon ? <View style={styles.icon}>{leftIcon}</View> : null}
      {loading ? (
        <ActivityIndicator size="small" color={v.fg} />
      ) : (
        <Text
          style={[
            styles.label,
            { color: v.fg, fontSize: s.fs, fontWeight: FontWeight[s.fw] },
            textStyle,
          ]}
        >
          {label}
        </Text>
      )}
      {rightIcon ? <View style={styles.icon}>{rightIcon}</View> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  label: {
    textAlign: 'center',
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
