/**
 * A row that slides aside to show one button.
 *
 * The lists in this app are made of cards that fill their width and say
 * everything they have to say, so there is nowhere in a row to put a control
 * that takes the row away. Swiping is where that control lives instead: it is
 * off the screen until a finger asks for it, which is the right amount of
 * presence for the least likely thing anybody came to the list to do.
 *
 * Colour is not available to say "this one is dangerous" — the palette has no
 * red and is not getting one — so the drawer says it with ground instead. At
 * rest the button is `surfaceSunk`, the same recess a pressed row sinks into,
 * reading as something the paper was lifted off. Armed, it becomes the app's
 * one filled rectangle: ink, with paper lettering. That inversion is what a
 * committing button looks like everywhere else here, and a delete that has been
 * armed is exactly that.
 *
 * Asking twice is optional and per call site. `confirmLabel` present means the
 * first tap only arms it and flips the label, the way the edit sheets do for the
 * two writes Ravelry cannot undo; absent means one tap is the whole of it, which
 * is right for the reversible ones and for the rows this app wrote itself.
 *
 * The busy window is the honest part. Nothing here deletes optimistically —
 * the mirror only changes once the network call has landed and the refresh
 * behind it has come back — so from the commit until that settles the row is
 * dimmed and takes no touches. A row whose write landed is gone from the list
 * along with this component; a row that is still here when `busy` goes false is
 * one that failed, so that is the moment it closes and goes back to rest.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";

import { haptics } from "@/haptics";
import { fonts, space, tap, trackSmall, type, useTheme } from "@/theme";

/**
 * Wide enough for "Tap again" on one line at the stamped size, and well past
 * the 48pt floor. The height is whatever the row came out — none of these
 * cards is a fixed height, and the drawer is drawn behind the whole of it.
 */
const ACTION_WIDTH = 96;

/**
 * The one row that is open, app-wide.
 *
 * Two open drawers is a list that has lost track of what the finger meant, so
 * opening one closes the last. This is a module-level handle rather than
 * anything threaded through the screens on purpose: every list here is built
 * out of memoised rows, and a prop that changed whenever some other row opened
 * would defeat every one of them.
 */
let openRow: SwipeableMethods | null = null;

function claimOpen(row: SwipeableMethods | null): void {
  if (openRow !== null && openRow !== row) {
    openRow.close();
  }
  openRow = row;
}

function releaseOpen(row: SwipeableMethods | null): void {
  if (openRow === row) {
    openRow = null;
  }
}

export type SwipeRowProps = {
  /** The row itself — a card, drawn exactly as it is drawn without this. */
  children: ReactNode;
  /** The revealed button at rest. Sentence case: "Delete", "Unsave". */
  label: string;
  /**
   * Given, the button asks twice: the first tap arms it and flips the label to
   * this, and only the second one commits. Omitted, one tap is the whole of it.
   */
  confirmLabel?: string;
  /** What the button is called before it is armed. Defaults to `label`. */
  accessibilityLabel?: string;
  /** And after. Defaults to `confirmLabel`. */
  confirmAccessibilityLabel?: string;
  /** The tap that means it. Called once, on the committing tap. */
  onCommit: () => void;
  /**
   * True from the commit until the write and its refresh have settled. The row
   * dims and stops taking touches; it does not disappear, because only the
   * mirror catching up can do that.
   */
  busy?: boolean;
  /**
   * False and there is no drawer at all and no gesture watching for one — for
   * the rows that have nothing to reveal, like a needle Ravelry owns.
   */
  enabled?: boolean;
  /** Passed to the swipeable's own container, for a caller that insets rows. */
  containerStyle?: StyleProp<ViewStyle>;
};

export function SwipeRow({
  children,
  label,
  confirmLabel,
  accessibilityLabel,
  confirmAccessibilityLabel,
  onCommit,
  busy = false,
  enabled = true,
  containerStyle,
}: SwipeRowProps) {
  const { colors } = useTheme();
  const row = useRef<SwipeableMethods | null>(null);
  const [armed, setArmed] = useState(false);

  // See the head of this file: a busy row that is still here when the busy goes
  // away is a row whose delete did not happen, so it closes rather than sitting
  // open over a drawer whose button has already been pressed.
  const wasBusy = useRef(false);

  useEffect(() => {
    if (wasBusy.current && !busy) {
      row.current?.close();
    }
    wasBusy.current = busy;
  }, [busy]);

  // A row that vanished while it was the open one would otherwise leave the
  // handle above pointing at a component nobody can see or close.
  useEffect(() => {
    const self = row;
    return () => releaseOpen(self.current);
  }, []);

  const press = useCallback(() => {
    if (busy) {
      return;
    }

    if (confirmLabel !== undefined && !armed) {
      setArmed(true);
      haptics.tap();
      return;
    }

    // No haptic of its own. What this press means is said afterwards by whether
    // it worked — a warning when the row goes, an error when it comes back —
    // and the row dimming under the finger is the acknowledgement in between.
    onCommit();
  }, [armed, busy, confirmLabel, onCommit]);

  const willOpen = useCallback(() => claimOpen(row.current), []);

  const willClose = useCallback(() => setArmed(false), []);

  const closed = useCallback(() => releaseOpen(row.current), []);

  const renderRightActions = useCallback(
    () => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          armed
            ? (confirmAccessibilityLabel ?? confirmLabel)
            : (accessibilityLabel ?? label)
        }
        accessibilityState={{ busy, disabled: busy }}
        disabled={busy}
        onPress={press}
        style={({ pressed }) => [
          styles.action,
          {
            backgroundColor: armed
              ? pressed
                ? colors.actionPressed
                : colors.action
              : pressed
                ? colors.surface
                : colors.surfaceSunk,
          },
          busy ? styles.spent : null,
        ]}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.actionLabel,
            { color: armed ? colors.onAction : colors.ink },
          ]}
        >
          {armed ? confirmLabel : label}
        </Text>
      </Pressable>
    ),
    [
      accessibilityLabel,
      armed,
      busy,
      colors.action,
      colors.actionPressed,
      colors.ink,
      colors.onAction,
      colors.surface,
      colors.surfaceSunk,
      confirmAccessibilityLabel,
      confirmLabel,
      label,
      press,
    ],
  );

  // Nothing to reveal: no gesture, no drawer, no animated view. The row is the
  // row, and the list pays nothing for the rows that cannot be swiped.
  if (!enabled) {
    return <View style={containerStyle}>{children}</View>;
  }

  return (
    <ReanimatedSwipeable
      ref={row}
      containerStyle={containerStyle}
      // The cards carry no ground of their own — they sit straight on the paper
      // and draw their own bottom hairline — so the sliding half is given one
      // here, or the drawer behind it would show through a row at rest.
      childrenContainerStyle={{ backgroundColor: colors.paper }}
      // One button, so there is nothing past it worth pulling into.
      overshootRight={false}
      renderRightActions={renderRightActions}
      // A row in the middle of its own delete is not one to drag further.
      enabled={!busy}
      onSwipeableWillOpen={willOpen}
      onSwipeableWillClose={willClose}
      onSwipeableClose={closed}
    >
      {/* The dimming sits on a view of this component's own rather than on the
          swipeable's children container, because that container's `style`
          carries a `useAnimatedStyle` that already writes `pointerEvents` from
          the UI thread — a static one alongside it would be arguing with a
          worklet over the same property. */}
      <View style={busy ? styles.busy : null}>{children}</View>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  action: {
    width: ACTION_WIDTH,
    minHeight: tap.min,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.s2,
  },
  actionLabel: {
    // The stamped label, the same recipe as every other action in this app that
    // is only words: small size, small tracking, no weight bump, sentence case.
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
  },
  /** The button that has already been pressed, waiting on the network. */
  spent: {
    opacity: 0.45,
  },
  /** And the row it belongs to, which cannot be touched until that lands. */
  busy: {
    opacity: 0.45,
    pointerEvents: "none",
  },
});
