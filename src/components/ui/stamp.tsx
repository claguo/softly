import { StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { fonts, trackSmall, type, useTheme } from '@/theme';

/** `spruce` is the committed state; everything else is a plain measurement. */
export type StampTone = 'ink' | 'spruce';

export type StampProps = {
  /** The measurement itself, e.g. "4.5 mm", "820 yd". */
  children?: ReactNode;
  /** Tiny sentence-case caption above the value, e.g. "needle". */
  label?: string;
  tone?: StampTone;
};

/** A measurement, stamped: tiny caption above, tracked serif value below. */
export function Stamp({ children, label, tone = 'ink' }: StampProps) {
  const { colors } = useTheme();
  const fg = tone === 'spruce' ? colors.spruce : colors.ink;

  return (
    <View style={styles.stamp}>
      {label ? <Text style={[styles.label, { color: colors.ink2 }]}>{label}</Text> : null}
      <Text style={[styles.value, { color: fg }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stamp: {
    flexDirection: 'column',
    gap: 2,
  },
  label: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
  },
  value: {
    fontFamily: fonts.uiMedium,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    // Numbers line up column to column when several stamps sit in a row.
    fontVariant: ['tabular-nums'],
  },
});
