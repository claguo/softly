import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { radius, fonts, tap, type, useTheme } from '@/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = {
  /** The label. Sentence case, as short as it can be said. */
  children?: ReactNode;
  /** primary = the ground turned inside out, and there is only one per screen. */
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

/**
 * The one control that commits: square, hairline-edged, and filled with the
 * ground inverted when it is the action — near-black on light paper, near-white
 * on dark. It is the only solid rectangle on a screen made of hairlines, which
 * is what makes it the action; no colour is involved, because colour here means
 * state and committing is not a state.
 */
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
      bg: colors.action,
      fg: colors.onAction,
      border: 'transparent',
      pressedBg: colors.actionPressed,
    },
    secondary: {
      bg: colors.surface,
      fg: colors.ink,
      border: colors.hairlineStrong,
      pressedBg: colors.surfaceSunk,
    },
    // A label, not a filled control, so it takes the link colour: the two
    // tappable things that are only words read the same everywhere.
    quiet: {
      bg: 'transparent',
      fg: colors.link,
      border: 'transparent',
      pressedBg: colors.surfaceSunk,
    },
    ghost: {
      bg: 'transparent',
      fg: colors.ink2,
      border: 'transparent',
      pressedBg: colors.surfaceSunk,
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
