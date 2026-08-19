import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { fonts, space, tap, trackMicro, type, useTheme } from "@/theme";

export type BackBarProps = {
  /**
   * Optional, and left off almost everywhere: a screen with a display line of
   * its own does not need its name twice.
   */
  title?: string;
  /**
   * The one text action for the screen, right-aligned in brass — `ScreenHeader`'s
   * `action`, on the pushed screens. Left off unless a screen has something to
   * do with what it is showing; the way *out* of a screen is still not it.
   */
  action?: string;
  onAction?: () => void;
};

/**
 * The header a pushed screen gets: one quiet way back, a hairline, nothing
 * else.
 *
 * It is `ScreenHeader`'s metrics exactly — same padding, same hairline, same
 * stamped label at the same 48pt hit box pulled back into the padding — so a
 * detail screen sits at the same height as the list it came from. It takes an
 * optional title and nothing else: still no subtitle, still no brass action,
 * because the one brass thing per screen is not the way out of it. Titleless
 * stays the default, since most screens carry their title as their own display
 * line below and only want a name up here when that line is spoken for.
 */
export function BackBar({ title, action, onAction }: BackBarProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: colors.paper, borderBottomColor: colors.hairline },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => router.back()}
        style={styles.back}
      >
        {({ pressed }) => (
          <Text style={[styles.label, { color: pressed ? colors.ink : colors.ink2 }]}>
            ‹ Back
          </Text>
        )}
      </Pressable>

      {title === undefined ? null : (
        <View pointerEvents="none" style={styles.titleBox}>
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={[styles.title, { color: colors.ink }]}
          >
            {title}
          </Text>
        </View>
      )}

      {action === undefined ? null : (
        // After the spacer, so it sits on the right edge; drawn after the title
        // overlay so a long name ellipsising underneath cannot reach it.
        <>
          <View style={styles.spacer} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action}
            onPress={onAction}
            style={styles.action}
          >
            {({ pressed }) => (
              <Text
                style={[
                  styles.label,
                  { color: pressed ? colors.brassPressed : colors.brass },
                ]}
              >
                {action}
              </Text>
            )}
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingTop: space.s5,
    paddingHorizontal: space.s4,
    paddingBottom: space.s3,
    flexDirection: "row",
    alignItems: "flex-end",
    borderBottomWidth: 1,
  },
  back: {
    // The same honest 48pt box `ScreenHeader` gives its action, pulled back
    // into the bar's own padding so the chrome does not grow to hold it. The
    // padding runs right rather than left: this control is on the left edge.
    minHeight: tap.min,
    justifyContent: "center",
    marginVertical: -space.s2,
    paddingRight: space.s3,
  },
  /** Pushes the action to the right edge without disturbing the title overlay. */
  spacer: { flex: 1 },
  action: {
    // `back` mirrored: the same honest box, padded on the side the finger
    // approaches from, which on this edge is the left.
    minHeight: tap.min,
    justifyContent: "center",
    marginVertical: -space.s2,
    paddingLeft: space.s3,
  },
  label: {
    // Stamped, like every other label in the chrome: micro size, micro
    // tracking, no weight bump, sentence case.
    fontFamily: fonts.ui,
    fontSize: type.micro.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
  },
  titleBox: {
    // Centred on the screen rather than in what the Back control leaves over:
    // that control is content-width, so a row would hang the title half its
    // width off the middle. An overlay instead, bottom-aligned on the bar's own
    // `paddingBottom` so it sits on the same line the bar's `flex-end` puts the
    // Back label on, padded in far enough that a long name ellipsises well
    // before it can reach that label, and deaf to touches so the way out stays
    // tappable underneath it.
    position: "absolute",
    left: 0,
    right: 0,
    bottom: space.s3,
    paddingHorizontal: space.s10 + space.s5,
    alignItems: "center",
  },
  title: {
    // Body, not display: on the screens that ask for this the display line has
    // moved down into the content, and the bar is chrome again.
    fontFamily: fonts.ui,
    fontSize: type.body.fontSize,
  },
});
