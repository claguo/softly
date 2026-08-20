import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { radius, useTheme } from '@/theme';

export type SwitchProps = {
  /** Whether the thing this switch names is on. */
  on: boolean;
};

/**
 * A switch in this app's own language: a square hairline track and a square
 * thumb that slides between two ends of it.
 *
 * Drawn rather than imported, for the same reason `tab-glyph` draws its five
 * shapes and the filter sheet's tick is two borders and a rotation: React
 * Native's stock `Switch` is a rounded pill in a system colour, and this art
 * direction is square corners, hairlines instead of shadows, and no accent at
 * all. A platform pill dropped in here would read as belonging to some other
 * program, which is exactly the mistake a fallback glyph made on this screen
 * once already.
 *
 * "On" is said the way `FilterChip` says "set", because they are the same claim
 * and a system should only have one way of making it: three things move at
 * once rather than one colour appearing. The field sinks, the border comes up
 * from `hairlineStrong` to full ink, and the thumb comes up from `ink2` to full
 * ink. No hue is involved — in this palette colour means state, and a switch is
 * not a state, it is a position — so the difference is carried by weight and
 * depth, both of which survive being colour-blind or in bright sun.
 *
 * Only the thumb animates. The track's two colours snap, which is what every
 * other control in this app does when it changes, and a track that cross-faded
 * while the thumb slid would be two motions where the design has one.
 *
 * **It is deliberately not pressable, and not focusable.** A switch is never
 * alone: it belongs to the sentence beside it, and that sentence has to be the
 * thing a finger lands on and the thing a screen reader announces. So the row
 * that labels this owns the `Pressable`, carries `accessibilityRole="switch"`,
 * `accessibilityState={{ checked }}` and the label as its accessible name, and
 * this component is the part that shows. Giving it its own press target would
 * put two controls on screen where the knitter can see one.
 */
export function Switch({ on }: SwitchProps) {
  const { colors } = useTheme();

  // Reanimated reads `on` out of this render and eases to whichever end it
  // names. The dependency is listed rather than left implicit: on native the
  // Babel plugin finds it either way, but this app also builds for web
  // (`react-native-web`, and `app.json` sets a static web output), and the
  // explicit list is what the docs say carries it there.
  const thumb = useAnimatedStyle(
    () => ({ transform: [{ translateX: withTiming(on ? TRAVEL : 0, TIMING) }] }),
    [on],
  );

  return (
    <View
      style={[
        styles.track,
        {
          backgroundColor: on ? colors.surfaceSunk : colors.surface,
          borderColor: on ? colors.ink : colors.hairlineStrong,
        },
      ]}>
      <Animated.View
        style={[styles.thumb, { backgroundColor: on ? colors.ink : colors.ink2 }, thumb]}
      />
    </View>
  );
}

const TRACK_WIDTH = 44;
const TRACK_HEIGHT = 24;
/** Space between the thumb and the track on all four sides. */
const INSET = 2;
const THUMB = 18;

/**
 * How far the thumb goes: the track's width less its two 1pt borders, less the
 * inset at each end, less the thumb itself. Stated as the subtraction rather
 * than as 20 so that changing any of the three above moves the thumb with them.
 */
const TRAVEL = TRACK_WIDTH - 2 - INSET * 2 - THUMB;

/** The register the filter sheet set: ~200ms, quadratic out, nothing springy. */
const TIMING = { duration: 200, easing: Easing.out(Easing.quad) };

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    paddingHorizontal: INSET,
    borderWidth: 1,
    borderRadius: radius.sm,
    // The row above owns the touch. A plain view would pass the tap up anyway,
    // but saying so is what keeps a later edit from hanging a handler here.
    pointerEvents: 'none',
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radius.sm,
  },
});
