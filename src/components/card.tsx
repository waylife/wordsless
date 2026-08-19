/**
 * Card — surface container that groups related content.
 *
 * Variants:
 *   elevated - subtle shadow + background, used for floating panels
 *   flat     - solid background color, used in lists
 *   outlined - transparent with a hairline border, used for grouping in dense screens
 */
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { Colors, Radii, Spacing } from '@/constants/theme';

export type CardVariant = 'elevated' | 'flat' | 'outlined';

export interface CardProps extends ViewProps {
  variant?: CardVariant;
  padding?: keyof typeof Spacing | 'none';
  radius?: keyof typeof Radii;
  style?: StyleProp<ViewStyle>;
}

export function Card({
  variant = 'elevated',
  padding = 'four',
  radius = 'lg',
  style,
  children,
  ...rest
}: CardProps) {
  return (
    <View
      style={[
        styles.base,
        { padding: padding === 'none' ? 0 : Spacing[padding], borderRadius: Radii[radius] },
        variant === 'elevated' && styles.elevated,
        variant === 'flat' && styles.flat,
        variant === 'outlined' && styles.outlined,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: Colors.light.background,
  },
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  flat: {
    backgroundColor: Colors.light.backgroundElement,
  },
  outlined: {
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
  },
});
