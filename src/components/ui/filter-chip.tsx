import { Pressable, StyleSheet, Text } from 'react-native';

import { radius, fonts, trackMicro, type, useTheme } from '@/theme';

export type FilterChipProps = {
  label: string;
  /** The set value, stamped, e.g. "1,240 yd" or "4.5 mm". */
  value?: string;
  active?: boolean;
  /** Shows the dismissal "×" at 0.6 opacity; pressing the chip clears it. */
  removable?: boolean;
  /**
   * Rail mode: no outer margin, and the chip pulls 1px left so it shares the
   * previous chip's border. The results rail sets this on every chip.
   */
  flush?: boolean;
  onPress?: () => void;
};

/** One filter in the rail above results: square, hairline-edged, brass when set. */
export function FilterChip({
  label,
  value,
  active = false,
  removable = false,
  flush = false,
  onPress,
}: FilterChipProps) {
  const { colors } = useTheme();
  const fg = active ? colors.brass : colors.ink2;
  const border = active ? colors.brass : colors.hairlineStrong;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={value ? `${label} ${value}` : label}
      onPress={onPress}
      // 40pt by the handoff; the slop restores the 48pt hit box.
      hitSlop={{ top: 4, bottom: 4 }}
      style={({ pressed }) => [
        styles.chip,
        flush ? styles.flush : styles.spaced,
        {
          backgroundColor: active || pressed ? colors.brassTint : colors.surface,
          borderColor: border,
        },
      ]}>
      <Text numberOfLines={1} style={[styles.label, { color: fg }]}>
        {label}
      </Text>
      {value ? (
        <Text numberOfLines={1} style={[styles.value, { color: fg }]}>
          {value}
        </Text>
      ) : null}
      {removable ? <Text style={[styles.remove, { color: fg }]}>×</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  spaced: {
    marginRight: 8,
  },
  flush: {
    marginLeft: -1,
  },
  label: {
    fontFamily: fonts.uiMedium,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
  },
  value: {
    fontFamily: fonts.ui,
    fontSize: type.micro.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackMicro,
    opacity: 0.9,
  },
  remove: {
    fontFamily: fonts.ui,
    fontSize: 14,
    lineHeight: 16,
    opacity: 0.6,
    marginLeft: 1,
  },
});
