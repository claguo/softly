import { StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { fonts, radius, trackMicro, type, useTheme } from '@/theme';

export type BadgeTone = 'library' | 'offline' | 'queued' | 'committed' | 'attention' | 'neutral';

export type BadgeProps = {
  /** Sentence-case label, e.g. "in library", "on device". */
  children?: ReactNode;
  /** Fixed meanings: library (brass), offline/queued (slate), committed (spruce), attention (clay), neutral. */
  tone?: BadgeTone;
  /** Leading 5px status dot — the only round shape in the system besides the tab pill. */
  dot?: boolean;
};

/** Stamped status marker: a shop label, square and quiet, never shouting. */
export function Badge({ children, tone = 'neutral', dot = false }: BadgeProps) {
  const { colors } = useTheme();
  const skin: Record<BadgeTone, { bg: string; fg: string }> = {
    library: { bg: colors.brassTint, fg: colors.brass },
    offline: { bg: colors.slateTint, fg: colors.slate },
    queued: { bg: colors.slateTint, fg: colors.slate },
    committed: { bg: colors.spruceTint, fg: colors.spruce },
    attention: { bg: colors.clayTint, fg: colors.clay },
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
    fontSize: type.micro.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
  },
});
