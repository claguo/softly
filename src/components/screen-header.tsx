import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { haptics } from '@/haptics';
import { fonts, space, tap, trackSmall, type, useTheme } from '@/theme';

export type ScreenHeaderProps = {
  /** Screen title, set in the display serif. */
  title: string;
  /** Stamped count beside the title, e.g. "6 active". */
  count?: string | number;
  /** The one text action for the screen, right-aligned and set in the link colour. */
  action?: string;
  onAction?: () => void;
  /**
   * The same one action slot, handed over whole — for a screen whose action has
   * to be a native view and so cannot be described by a string.
   *
   * Mutually exclusive with `action`: pass one or the other, never both. If
   * both turn up this one is drawn, because a caller who built a view meant it,
   * but that is a bug being tolerated rather than a second action being
   * allowed. Whatever comes in gets the same 48pt box the words get.
   */
  right?: ReactNode;
};

/**
 * The one place per screen where the brand voice speaks: a serif title, a
 * stamped count, one action, a hairline underneath. There is deliberately no
 * sub-line — the design contract does not have the prop.
 *
 * Still exactly one action; no longer always words, and no longer always this
 * component's to draw. Given `action` it is words and nothing else, coloured as
 * a link rather than drawn as a filled control — the filled one belongs to the
 * content below. Given `right` the slot is the caller's, which is what a system
 * menu needs: iOS will only hang one off a native view, not off a Pressable.
 */
export function ScreenHeader({ title, count, action, onAction, right }: ScreenHeaderProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.header,
        { backgroundColor: colors.paper, borderBottomColor: colors.hairline },
      ]}>
      <View style={styles.titleGroup}>
        <Text numberOfLines={1} style={[styles.title, { color: colors.ink }]}>
          {title}
        </Text>
        {count !== undefined && count !== null ? (
          <Text style={[styles.count, { color: colors.ink2 }]}>{count}</Text>
        ) : null}
      </View>

      {right ? (
        // The caller's view, in the box the words would have had, so the header
        // comes out the same height either way and the slot sits where the eye
        // already looks for it. Nothing else is done to it: what it is and how
        // it is pressed are the caller's, and this one has a whole native menu
        // behind it.
        <View style={styles.action}>{right}</View>
      ) : action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action}
          onPress={() => {
            haptics.tap();
            onAction?.();
          }}
          style={styles.action}>
          {({ pressed }) => (
            <Text
              style={[styles.actionLabel, { color: pressed ? colors.linkPressed : colors.link }]}>
              {action}
            </Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: space.s5,
    paddingHorizontal: space.s4,
    paddingBottom: space.s3,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.s3,
    borderBottomWidth: 1,
  },
  titleGroup: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  title: {
    flexShrink: 1,
    fontFamily: fonts.display,
    fontSize: type.title.fontSize,
    lineHeight: type.title.lineHeight,
  },
  count: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
  },
  action: {
    // A real 48pt touch box, pulled back into the header's own padding so the
    // hit area is honest without inflating the header past the design's height.
    minHeight: tap.min,
    justifyContent: 'center',
    marginVertical: -space.s2,
    paddingLeft: space.s3,
  },
  actionLabel: {
    // Stamped, per the handoff: the label face at small size with small
    // tracking — no weight bump, sentence case.
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
  },
});
