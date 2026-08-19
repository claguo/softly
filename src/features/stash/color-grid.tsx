/**
 * Ravelry's colour families, as a wrap of swatches, with a tuner behind them.
 *
 * The one field in this app that is picked rather than typed or chosen from a
 * list of words, because a colour is the thing a knitter recognises fastest and
 * slowest to say: "Blue-purple" is four syllables for something the eye settles
 * on immediately. So the swatches are the control and the names are underneath
 * it — read out to a screen reader on every one, and printed for the chosen one
 * so the sighted knitter can see which of two close blues they landed on.
 *
 * Two taps, two different questions:
 *
 * - **Tap a swatch** to file the skein under that family. That is the part
 *   Ravelry keeps, and the part other knitters can search.
 * - **Tap the chosen swatch again** to open the tuner and move the colour to
 *   where the ball in your hand actually is. That part is this device's — see
 *   `yarn-colors.ts` for why it has to be — and it is what tints the
 *   thumbnails, so it is worth the second tap.
 *
 * The paint on the twenty swatches is this app's too. `/color_families.json`
 * names them and gives every one `color: null`, so `COLOR_FAMILIES` carries the
 * hex; only the id is ever posted.
 */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLOR_FAMILIES, colorFamily } from '@/data';
import { ColorTuner } from '@/features/stash/color-tuner';
import { fonts, radius, space, trackMicro, type, useTheme } from '@/theme';

export type ColorGridProps = {
  /** Ravelry's `color_family_id`, or null for nothing chosen. */
  selected: number | null;
  /**
   * The shade dialled in for this skein, or null to sit on the family's own
   * swatch. What the tuner edits.
   */
  hex: string | null;
  onSelect: (id: number | null) => void;
  onTweak: (hex: string | null) => void;
  disabled?: boolean;
};

/**
 * 44pt drawn, 48 to the finger.
 *
 * The gap between swatches is 8, so 4pt of slop on each side meets the app's
 * `tap.min` exactly without two neighbouring targets ever overlapping — which
 * would be worse than a small target, since the wrong colour would be as easy
 * to hit as the right one. Six to a row on the narrowest phone this supports.
 */
const SWATCH = 44;
const GAP = space.s2;
const SLOP = { top: 2, bottom: 2, left: GAP / 2, right: GAP / 2 };

export function ColorGrid({
  selected,
  hex,
  onSelect,
  onTweak,
  disabled = false,
}: ColorGridProps) {
  const { colors } = useTheme();
  const chosen = colorFamily(selected);
  const [wantsTuner, setWantsTuner] = useState(false);

  // Derived rather than corrected: there is nothing to tune once nothing is
  // chosen, so the tuner is folded away by the same fact that closes it rather
  // than by an effect chasing the change. That also means clearing the colour
  // can never leave a tuner behind editing a shade of a family nobody picked.
  const tuning = wantsTuner && selected !== null;

  // What the tuner opens on: the dialled-in shade if there is one, otherwise
  // the family's own swatch, which is exactly the "that one, but not quite"
  // the second tap means.
  const tuned = hex ?? chosen?.swatch ?? null;

  const press = (id: number) => {
    if (id !== selected) {
      // A different family. The old shade belonged to the old family, so it
      // goes with it rather than being dragged onto a colour it was never
      // matched against.
      onSelect(id);
      onTweak(null);
      setWantsTuner(false);
      return;
    }

    setWantsTuner((open) => !open);
  };

  const clear = () => {
    onSelect(null);
    onTweak(null);
    setWantsTuner(false);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.grid}>
        {COLOR_FAMILIES.map((family) => {
          const active = family.id === selected;

          return (
            <Pressable
              key={family.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled, expanded: active ? tuning : undefined }}
              accessibilityLabel={active ? `${family.label}, tap again to adjust` : family.label}
              disabled={disabled}
              hitSlop={SLOP}
              onPress={() => press(family.id)}
              style={({ pressed }) => [
                styles.swatch,
                {
                  // The dialled-in shade replaces the family's paint on its own
                  // swatch, so the grid shows what this skein actually is
                  // rather than where it was filed.
                  backgroundColor: active && tuned !== null ? tuned : family.swatch,
                  // Every swatch is ringed, or the pale ones — White, Natural —
                  // would have no edge at all against the paper. The chosen one
                  // takes brass and a heavier ring; the rest take the hairline.
                  borderColor: active ? colors.brass : colors.hairline,
                  borderWidth: active ? 2 : 1,
                  opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
                },
              ]}
            />
          );
        })}
      </View>

      <View style={styles.nameRow}>
        <Text
          style={[styles.name, { color: chosen === null ? colors.ink3 : colors.ink2 }]}>
          {chosen === null
            ? 'No colour chosen'
            : hex === null
              ? `${chosen.label} · tap again to adjust`
              : `${chosen.label} · adjusted`}
        </Text>

        {chosen === null || disabled ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear colour"
            onPress={clear}
            hitSlop={{ top: space.s2, bottom: space.s2, left: space.s2, right: space.s2 }}>
            {({ pressed }) => (
              <Text style={[styles.clear, { color: pressed ? colors.ink : colors.ink3 }]}>
                Clear
              </Text>
            )}
          </Pressable>
        )}
      </View>

      {tuning && tuned !== null ? (
        <ColorTuner hex={tuned} onChange={onTweak} disabled={disabled} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.s2,
    // Aligned with the field labels rather than with any photograph, like the
    // size grid: a wrap of swatches is a field, not a run of rows.
    paddingVertical: space.s3,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
    paddingHorizontal: space.s4,
  },
  swatch: {
    width: SWATCH,
    height: SWATCH,
    borderRadius: radius.sm,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.s3,
    paddingHorizontal: space.s4,
  },
  name: {
    flexShrink: 1,
    fontFamily: fonts.ui,
    fontSize: type.micro.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
  },
  clear: {
    fontFamily: fonts.ui,
    fontSize: type.micro.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
  },
});
