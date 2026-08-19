import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { radius, fonts, tap, type, useTheme } from '@/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = {
  /** The label. Sentence case, as short as it can be said. */
  children?: ReactNode;
  /** primary = brass hardware, and there is only one brass thing per screen. */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to the container's width. */
  full?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  /** Small trailing glyph, e.g. an arrow. */
  trailing?: ReactNode;
  accessibilityLabel?: string;
};

const SIZES: Record<ButtonSize, { height: number; paddingHorizontal: number; fontSize: number; lineHeight: number }> = {
  sm: { height: 40, paddingHorizontal: 12, ...type.body },
  md: { height: tap.min, paddingHorizontal: 18, ...type.heading },
  lg: { height: tap.lg, paddingHorizontal: 24, ...type.heading },
};

/** The one control that commits: square, hairline-edged, brass when it is the action. */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  full = false,
  disabled = false,
  onPress,
  trailing,
  accessibilityLabel,
}: ButtonProps) {
  const { colors } = useTheme();
  const metrics = SIZES[size];

  const skin: Record<ButtonVariant, { bg: string; fg: string; border: string; pressedBg: string }> = {
    primary: {
      bg: colors.brass,
      fg: colors.onBrass,
      border: 'transparent',
      pressedBg: colors.brassPressed,
    },
    secondary: {
      bg: colors.surface,
      fg: colors.ink,
      border: colors.hairlineStrong,
      pressedBg: colors.brassTint,
    },
    quiet: {
      bg: 'transparent',
      fg: colors.brass,
      border: 'transparent',
      pressedBg: colors.brassTint,
    },
    ghost: {
      bg: 'transparent',
      fg: colors.ink2,
      border: 'transparent',
      pressedBg: colors.brassTint,
    },
  };
  const { bg, fg, border, pressedBg } = skin[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      // `sm` is 40pt by the handoff — the slop restores the 48pt hit box the
      // art direction demands without inflating the drawn button.
      hitSlop={size === 'sm' ? { top: 4, bottom: 4 } : undefined}
      style={({ pressed }) => [
        styles.button,
        {
          height: metrics.height,
          paddingHorizontal: metrics.paddingHorizontal,
          backgroundColor: pressed && !disabled ? pressedBg : bg,
          borderColor: border,
        },
        full ? styles.full : styles.inline,
        disabled && styles.disabled,
      ]}>
      <Text
        numberOfLines={1}
        style={[styles.label, { color: fg, fontSize: metrics.fontSize, lineHeight: metrics.lineHeight }]}>
        {children}
      </Text>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  full: {
    alignSelf: 'stretch',
    width: '100%',
  },
  inline: {
    alignSelf: 'flex-start',
  },
  disabled: {
    opacity: 0.45,
  },
  label: {
    fontFamily: fonts.uiSemiBold,
    letterSpacing: 0.08,
  },
  trailing: {
    opacity: 0.8,
  },
});
