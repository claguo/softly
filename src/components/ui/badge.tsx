import { StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { fonts, radius, trackSmall, type, useTheme } from '@/theme';

export type BadgeTone = 'library' | 'offline' | 'queued' | 'committed' | 'attention' | 'neutral';

export type BadgeProps = {
  /** Sentence-case label, e.g. "in library", "on device". */
  children?: ReactNode;
  /**
   * Fixed meanings. Only the three states get a colour: offline/queued is aqua,
   * committed is spruce, attention is mustard. `library` and `neutral` are facts
   * rather than states, so they share the sunk field and separate on weight of
   * ink — library at full strength, neutral quieter.
   */
  tone?: BadgeTone;
  /** Leading 5px status dot — the only round shape in the system besides the tab pill. */
  dot?: boolean;
};

/** Stamped status marker: a shop label, square and quiet, never shouting. */
export function Badge({ children, tone = 'neutral', dot = false }: BadgeProps) {
  const { colors } = useTheme();
  const skin: Record<BadgeTone, { bg: string; fg: string }> = {
    library: { bg: colors.surfaceSunk, fg: colors.ink },
    offline: { bg: colors.aquaTint, fg: colors.aqua },
    queued: { bg: colors.aquaTint, fg: colors.aqua },
    committed: { bg: colors.spruceTint, fg: colors.spruce },
    attention: { bg: colors.mustardTint, fg: colors.mustard },
    neutral: { bg: colors.surfaceSunk, fg: colors.ink2 },
  };
  const { bg, fg } = skin[tone];

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {dot ? <View style={[styles.dot, { backgroundColor: fg }]} /> : null}
      <Text numberOfLines={1} style={[styles.label, { color: fg }]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: radius.pill,
  },
  label: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
  },
});
