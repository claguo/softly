/**
 * The fine-tune picker: three strips and a big swatch.
 *
 * It opens by tapping a colour family that is already chosen, which is the
 * moment a knitter has just said "that one, but not quite" — the family is the
 * coarse answer and this is the rest of it. Hue, saturation and lightness get a
 * strip each because those are the three ways the ball in your hand differs
 * from a swatch on a screen: a different red, a greyer red, a darker red.
 *
 * Built out of plain Views and the touch responder props. There is no gradient
 * primitive in this project and no library for one, so each strip is a run of
 * thin bands — enough of them that the eye reads a gradient, few enough that a
 * drag stays cheap. The bands are `pointerEvents: none` so the strip itself is
 * always the touch target, which is what makes `locationX` mean what it says.
 *
 * Nothing here is written to Ravelry. It has colour *families* and no field for
 * a shade — see `yarn-colors.ts` — so this is the app's own record of what the
 * knitter is actually holding, and it is what tints the thumbnails.
 */

import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';

import { hexToHsl, hslToHex, readableOn, type Hsl } from '@/features/stash/color';
import { fonts, radius, space, trackMicro, type, useTheme } from '@/theme';

/**
 * Bands per strip.
 *
 * Thirty-two is where the banding stops being visible at the width a phone
 * gives these — about 10pt each — and every one is a plain `View`, so the cost
 * of another is a layout node rather than a draw call on a bitmap.
 */
const BANDS = 32;

const STRIP_HEIGHT = 28;

export type ColorTunerProps = {
  /** The colour being tuned, `#rrggbb`. */
  hex: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
};

export function ColorTuner({ hex, onChange, disabled = false }: ColorTunerProps) {
  const { colors } = useTheme();
  const hsl = useMemo(() => hexToHsl(hex), [hex]);

  const change = (next: Partial<Hsl>) => {
    onChange(hslToHex({ ...hsl, ...next }));
  };

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.preview,
          { backgroundColor: hex, borderColor: colors.hairline },
        ]}>
        <Text style={[styles.previewHex, { color: readableOn(hex) }]}>{hex}</Text>
      </View>

      <Strip
        label="Hue"
        value={hsl.h / 360}
        disabled={disabled}
        // Full-strength hues: this strip is asking which colour, not how much
        // of it, so it stays at the saturation and lightness the other two set.
        bandAt={(t) => hslToHex({ h: t * 360, s: Math.max(hsl.s, 45), l: 50 })}
        onChange={(t) => change({ h: t * 360 })}
      />

      <Strip
        label="Saturation"
        value={hsl.s / 100}
        disabled={disabled}
        bandAt={(t) => hslToHex({ h: hsl.h, s: t * 100, l: hsl.l })}
        onChange={(t) => change({ s: t * 100 })}
      />

      <Strip
        label="Lightness"
        value={hsl.l / 100}
        disabled={disabled}
        bandAt={(t) => hslToHex({ h: hsl.h, s: hsl.s, l: t * 100 })}
        onChange={(t) => change({ l: t * 100 })}
      />
    </View>
  );
}

type StripProps = {
  label: string;
  /** Where the thumb sits, 0–1. */
  value: number;
  bandAt: (t: number) => string;
  onChange: (t: number) => void;
  disabled: boolean;
};

function Strip({ label, value, bandAt, onChange, disabled }: StripProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);

  /**
   * The raw responder props rather than a `PanResponder`.
   *
   * A `PanResponder` has to be built once and then reach for the current width
   * and handler through a ref, which is a lot of machinery to end up with
   * values a render already has. These props are read off the view at event
   * time, so they close over this render and are always current.
   *
   * `onResponderTerminationRequest` returning false is the load-bearing one:
   * these strips sit inside the edit sheet's `ScrollView`, and without it a
   * drag that wanders a few degrees off horizontal is taken away mid-adjust and
   * turns into a scroll.
   */
  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  const pick = (event: GestureResponderEvent) => {
    if (disabled || width <= 0) {
      return;
    }

    onChange(Math.min(1, Math.max(0, event.nativeEvent.locationX / width)));
  };

  const clamped = Math.min(1, Math.max(0, value));

  return (
    <View style={styles.strip}>
      <Text style={[styles.stripLabel, { color: colors.ink3 }]}>{label}</Text>

      <View
        onLayout={onLayout}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
        accessibilityState={{ disabled }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          if (disabled) {
            return;
          }
          // A screen reader has no drag, so the strip moves in twentieths.
          const step = event.nativeEvent.actionName === 'increment' ? 0.05 : -0.05;
          onChange(Math.min(1, Math.max(0, clamped + step)));
        }}
        style={[
          styles.track,
          { borderColor: colors.hairline, opacity: disabled ? 0.5 : 1 },
        ]}
        onStartShouldSetResponder={() => !disabled}
        onMoveShouldSetResponder={() => !disabled}
        onResponderTerminationRequest={() => false}
        onResponderGrant={pick}
        onResponderMove={pick}>
        <View pointerEvents="none" style={styles.bands}>
          {Array.from({ length: BANDS }, (_, i) => (
            <View
              key={i}
              style={[styles.band, { backgroundColor: bandAt(i / (BANDS - 1)) }]}
            />
          ))}
        </View>

        {width > 0 ? (
          <View
            pointerEvents="none"
            style={[
              styles.thumb,
              {
                // Held inside the track at both ends, so the marker is still
                // whole when the value is 0 or 1.
                left: Math.min(width - THUMB, Math.max(0, clamped * width - THUMB / 2)),
                borderColor: colors.paper,
                backgroundColor: colors.ink,
              },
            ]}
          />
        ) : null}
      </View>
    </View>
  );
}

const THUMB = 10;

const styles = StyleSheet.create({
  wrap: {
    gap: space.s3,
    paddingHorizontal: space.s4,
    paddingBottom: space.s3,
  },
  preview: {
    height: 56,
    borderWidth: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewHex: {
    fontFamily: fonts.ui,
    fontSize: type.micro.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
  },
  strip: { gap: space.s1 },
  stripLabel: {
    fontFamily: fonts.ui,
    fontSize: type.micro.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
  },
  track: {
    height: STRIP_HEIGHT,
    borderWidth: 1,
    borderRadius: radius.sm,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  bands: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flexDirection: 'row',
  },
  band: { flex: 1 },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: STRIP_HEIGHT,
    borderWidth: 2,
  },
});
