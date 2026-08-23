/**
 * The row a counter is drawn as, in both places one is drawn.
 *
 * Two screens want it and they want it at two sizes. The project's record has
 * room: the counter takes a line for its name and a line for its number, sits
 * in the section rhythm and carries its own hairline like the yarn and the
 * needles above it. The bar over the PDF has no room at all — it is floating on
 * top of somebody's pattern — so the same two facts go on one line and the rule
 * belongs to the bar rather than to the row. `compact` is that difference and
 * the whole of it; everything else, the steppers most of all, is deliberately
 * identical, because a counter that behaves differently depending on which
 * screen it is on is two counters.
 *
 * The steppers are not `Button`s. That control is the one thing on a screen
 * that commits, filled with the ground inverted, and there is exactly one per
 * screen — counting is not committing, it is where the knitter is. So they take
 * the outline the chips and the secondary buttons take, and they are square,
 * because a single glyph in a control padded for a word is a lopsided box and
 * this is the target being hit in the dark at the end of a row.
 */

import { Pressable, StyleSheet, Text, View } from "react-native";

import type { RowCounterRow } from "@/data";
import {
  counterDone,
  counterReading,
  counterTitle,
} from "@/features/counters/counter";
import { haptics } from "@/haptics";
import { fonts, radius, space, tap, trackSmall, type, useTheme } from "@/theme";

export type CounterRowProps = {
  counter: RowCounterRow;
  /** One row, plus or minus. Never more: a counter moves a row at a time. */
  onAdjust: (delta: number) => void;
  /** Opens the sheet that edits it. Omitted where there is nowhere to go. */
  onOpen?: () => void;
  /** The reader's bar: one line, no rule of its own. See the module note. */
  compact?: boolean;
  /**
   * The bottom hairline, where `compact` has not already taken it away. It is a
   * separator, and the caller is the one that knows when there is nothing to
   * separate — a section counts its counters and passes false on the last, so
   * it ends clean instead of doubling with the next section's own rule.
   */
  ruled?: boolean;
};

/**
 * A stepper: one square, one glyph, one row of knitting.
 *
 * `tap.min` on both sides rather than a drawn size with slop around it, because
 * the box and the target being the same thing is the point — this is pressed
 * without being looked at, and slop is invisible.
 *
 * It does not speak for itself, which is the one place a stepper defers. Only
 * the row knows whether a press is an ordinary row or the row that arrives, so
 * the feel is said at the two call sites below rather than here — both of them
 * ten lines down and both in view, which is the whole reason that is safe.
 */
function Stepper({
  glyph,
  label,
  disabled = false,
  onPress,
}: {
  glyph: string;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.stepper,
        {
          backgroundColor:
            pressed && !disabled ? colors.surfaceSunk : colors.surface,
          borderColor: colors.hairlineStrong,
        },
        disabled && styles.spent,
      ]}
    >
      <Text style={[styles.glyph, { color: colors.ink }]}>{glyph}</Text>
    </Pressable>
  );
}

/** One counter: what it is called, where it has got to, and the two taps. */
export function CounterRow({
  counter,
  onAdjust,
  onOpen,
  compact = false,
  ruled = true,
}: CounterRowProps) {
  const { colors } = useTheme();

  const title = counterTitle(counter);
  const reading = counterReading(counter);
  const done = counterDone(counter);

  // Whether the next row is the one that gets there. `done` is false, so the
  // count is still short of the total, and short by exactly one is the only way
  // a single row can close the gap — every tick after this one is past it.
  const arriving = !done && counter.count + 1 === counter.maxRows;

  // Two ways to lose the rule and they mean different things: the reader's bar
  // never had one to lose, and a lone counter in a section has one that
  // separates nothing.
  const rule = !compact && ruled;

  return (
    <View
      style={[
        styles.row,
        rule ? styles.ruled : null,
        rule ? { borderBottomColor: colors.hairline } : null,
      ]}
    >
      <Pressable
        accessibilityRole={onOpen ? "button" : undefined}
        accessibilityLabel={`${title}, ${reading}`}
        disabled={onOpen === undefined}
        onPress={() => {
          haptics.tap();
          onOpen?.();
        }}
        style={({ pressed }) => [
          styles.body,
          compact ? styles.bodyCompact : styles.bodyStacked,
          pressed && onOpen
            ? { backgroundColor: colors.surfaceSunk }
            : null,
        ]}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.title,
            compact ? styles.titleCompact : null,
            { color: compact ? colors.ink2 : colors.ink },
          ]}
        >
          {title}
        </Text>
        {/* Spruce for a counter that has arrived — the system's colour for
            committed and complete, exactly as `Badge tone="committed"` resolves
            it, and the only colour a counter ever takes. The number keeps
            reading honestly past the total: "123 / 120" is a sentence about a
            sweater, not an error. */}
        <Text
          numberOfLines={1}
          style={[styles.reading, { color: done ? colors.spruce : colors.ink }]}
        >
          {reading}
        </Text>
      </Pressable>

      {/* Minus at nought has nowhere to go, and says so rather than taking a
          tap that does nothing. Plus is never spent: see `adjustRowCounter`. */}
      <Stepper
        glyph="−"
        label={`Take a row off ${title}`}
        disabled={counter.count === 0}
        onPress={() => {
          haptics.count();
          onAdjust(-1);
        }}
      />
      <Stepper
        glyph="+"
        label={`Add a row to ${title}`}
        onPress={() => {
          // The row that gets there is the one press a counter is allowed to
          // answer differently, and it happens once: the ticks past the total
          // are counting again, because that is what they are.
          if (arriving) {
            haptics.success();
          } else {
            haptics.count();
          }
          onAdjust(1);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s2,
    // The steppers pad themselves off the right edge; the words pad themselves
    // off the left, so the pressed field runs to the edge of the screen the way
    // a row's pressed field does everywhere else.
    paddingRight: space.s3,
  },
  ruled: { borderBottomWidth: 1 },
  body: {
    flex: 1,
    minWidth: 0,
    paddingLeft: space.s3,
    paddingVertical: space.s2,
    minHeight: tap.min,
  },
  // A column, so `justifyContent` is what holds the two lines in the middle of
  // a box the steppers beside them have already made 48 tall.
  bodyStacked: {
    gap: 2,
    justifyContent: "center",
  },
  // A row, where the same property would centre the words across the whole
  // width instead. They start at the left margin and `alignItems` does the
  // holding.
  bodyCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s3,
  },
  title: {
    fontFamily: fonts.uiMedium,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
  titleCompact: {
    // Stamped and shrinking: on one line with the number, the name is the part
    // that can be cut short, and the number never is.
    flexShrink: 1,
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
  },
  reading: {
    // The one number on the row, at heading size in the medium cut: it is read
    // at arm's length, over a lap full of knitting.
    fontFamily: fonts.uiSemiBold,
    fontSize: type.heading.fontSize,
    lineHeight: type.heading.lineHeight,
  },
  stepper: {
    width: tap.min,
    height: tap.min,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  glyph: {
    fontFamily: fonts.uiMedium,
    fontSize: type.heading.fontSize,
    lineHeight: type.heading.lineHeight,
  },
  /** The same 0.45 `Button` spends a disabled control at. */
  spent: { opacity: 0.45 },
});
