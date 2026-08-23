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
  /**
   * A trailing chevron, for the rare badge that is also the way into something.
   *
   * The badge itself does not change: it is still a stamp, still square, still
   * the same weight of ink. The chevron is the one hint that this particular
   * stamp opens something, and it is the smallest hint that can be given —
   * anything more and the label starts arguing with the buttons on the screen
   * about which of them is the action.
   */
  disclosure?: boolean;
};

/**
 * The chevron, drawn rather than set.
 *
 * Solway Light carries 224 codepoints and no down-chevron is among them —
 * not U+2304, not U+02C5, not U+25BC. Set as text, the character
 * would miss the face entirely, fall through to whatever the platform
 * substitutes, and arrive in a typeface belonging to some other program. So it
 * follows `Mark` in `filter-sheet.tsx` and the glyphs in `tab-glyph.tsx`: a box
 * wearing two of its four borders, turned a quarter of the way round so the
 * corner becomes the point. 1.25 is the same stroke `Mark` settled on, heavier
 * than the type it annotates and light enough not to shout.
 *
 * The alignment box is 12×12 and always the same size, so a badge that gains a
 * chevron does not push its own label sideways.
 */
function Chevron({ color }: { color: string }) {
  return (
    <View style={styles.chevronBox}>
      <View style={[styles.chevron, { borderColor: color }]} />
    </View>
  );
}

/** Stamped status marker: a shop label, square and quiet, never shouting. */
export function Badge({
  children,
  tone = 'neutral',
  dot = false,
  disclosure = false,
}: BadgeProps) {
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
      {disclosure ? <Chevron color={fg} /> : null}
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
  chevronBox: {
    // Sized to the 18pt label line it sits beside, and fixed, so the chip does
    // not reflow the day it gains a chevron. See the note on `Chevron`.
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevron: {
    // The two arms before the turn: a square wearing its right and bottom
    // borders, rotated a quarter turn so the corner points down. Square
    // corners hold — nothing here is rounded.
    width: 6.5,
    height: 6.5,
    borderRightWidth: 1.25,
    borderBottomWidth: 1.25,
    // The ink is all down the right edge and along the bottom, so the shape's
    // centre of mass hangs below the bounding box's centre. The lift puts the
    // point in the middle of the box. It comes first: a translate listed after
    // the rotation would be measured in the rotated frame and go off at 45°.
    transform: [{ translateY: -1.5 }, { rotate: '45deg' }],
  },
});
