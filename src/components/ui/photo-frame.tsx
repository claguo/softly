import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DimensionValue, LayoutChangeEvent } from 'react-native';

import { fonts, useTheme } from '@/theme';

/** The two frames the design draws: square, and the 4/5 portrait used in grids. */
export type PhotoAspect = '1/1' | '4/5';

export type PhotoFrameProps = {
  /** Image URL. Omit to render the striped placeholder — a missing photo is a first-class state, not an error. */
  src?: string;
  /** Placeholder caption naming what belongs here; doubles as the photo's accessibility label. */
  label?: string;
  aspect?: PhotoAspect;
  /** Frame width. Defaults to filling the parent. */
  width?: DimensionValue;
  /**
   * A colour to lay over the photograph — the skein's own, where the knitter
   * has said what it is. See `tint` below for what that actually does, and
   * `tintFor` for where the colour comes from.
   */
  tint?: string;
};

const ASPECT: Record<PhotoAspect, number> = { '1/1': 1, '4/5': 4 / 5 };

/** Stripe geometry from the handoff: 6px bands, 12px repeat, on the 135° diagonal. */
const STRIPE = 6;
const PERIOD = STRIPE * 2;

/** Frames user photography, or stripes the hole where it will go. */
export function PhotoFrame({
  src,
  label = 'photo',
  aspect = '1/1',
  width = '100%',
  tint,
}: PhotoFrameProps) {
  const { colors } = useTheme();
  const ratio = ASPECT[aspect];
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);

  if (src) {
    return (
      <View
        style={[
          styles.frame,
          { width, aspectRatio: ratio, backgroundColor: colors.surfaceSunk },
          // Keeps the blend below inside this frame rather than letting it
          // reach the paper behind it.
          tint ? styles.isolated : null,
        ]}>
        <Image source={src} contentFit="cover" accessibilityLabel={label} style={styles.fill} />
        {tint ? (
          <View
            pointerEvents="none"
            style={[styles.fill, styles.tint, { backgroundColor: tint }]}
          />
        ) : null}
      </View>
    );
  }

  // A skein whose colour is known but whose photograph is not: paint the frame
  // rather than stripe it. The stripes mean "no picture yet", and that is still
  // true, but a knitter scanning a list is looking for the colour first — and
  // this is the one thing the app knows for certain about this skein.
  if (tint) {
    return (
      <View
        accessible
        accessibilityLabel={label}
        style={[
          styles.frame,
          { width, aspectRatio: ratio, backgroundColor: tint },
        ]}>
        <View style={[styles.ring, { borderColor: colors.hairline }]} />
      </View>
    );
  }

  // A numeric width is known before layout, so the stripes paint on the first
  // frame; a percentage width waits one pass for onLayout.
  const size = measured ?? (typeof width === 'number' ? { w: width, h: width / ratio } : null);

  // RN has no repeating gradient: the stripes are a rotated stack of bands,
  // oversized to the frame's diagonal so the clip never exposes a corner.
  const rows = size ? Math.ceil((Math.hypot(size.w, size.h) + PERIOD * 2) / PERIOD) : 0;
  const side = rows * PERIOD;

  const onLayout = (event: LayoutChangeEvent) => {
    const { width: w, height: h } = event.nativeEvent.layout;
    setMeasured((prev) =>
      prev && Math.abs(prev.w - w) < 1 && Math.abs(prev.h - h) < 1 ? prev : { w, h },
    );
  };

  return (
    <View
      onLayout={onLayout}
      accessible
      accessibilityLabel={label}
      style={[styles.frame, { width, aspectRatio: ratio, backgroundColor: colors.photoA }]}>
      {size ? (
        <View
          style={[
            styles.stack,
            { width: side, height: side, left: (size.w - side) / 2, top: (size.h - side) / 2 },
          ]}>
          {Array.from({ length: rows }, (_, i) => (
            // One view per 12px repeat: the 6px top border is stripe A, the
            // background beneath it is stripe B. Half the views of a band each.
            <View
              key={i}
              style={[styles.band, { backgroundColor: colors.photoB, borderTopColor: colors.photoA }]}
            />
          ))}
        </View>
      ) : null}

      <View style={[styles.ring, { borderColor: colors.hairline }]} />

      <View style={styles.captionWrap}>
        <Text
          numberOfLines={2}
          style={[styles.caption, { backgroundColor: colors.surface, color: colors.ink3 }]}>
          {label}
        </Text>
      </View>
    </View>
  );
}

/** RN 0.86's types no longer expose `StyleSheet.absoluteFillObject`. */
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    flexShrink: 0,
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  isolated: {
    // Without this the blend below composites against everything behind the
    // frame, not just the photograph in it.
    isolation: 'isolate',
  },
  tint: {
    position: 'absolute',
    /**
     * `color` takes the hue and saturation of this layer and keeps the
     * *luminosity* of the photograph underneath — so the yarn is recoloured
     * with its twist, shadow and halo intact, the way a dyer's photograph of
     * the same skein would look. A flat wash would just hide it.
     *
     * The opacity is not belt and braces, it is the fallback: where the blend
     * mode is not honoured this degrades to a translucent glaze that still
     * reads as the right colour and still shows the photograph, rather than to
     * an opaque rectangle that hides it.
     */
    mixBlendMode: 'color',
    opacity: 0.72,
  },
  stack: {
    position: 'absolute',
    transform: [{ rotate: '-45deg' }],
    pointerEvents: 'none',
  },
  band: {
    height: PERIOD,
    borderTopWidth: STRIPE,
  },
  ring: {
    ...FILL,
    borderWidth: 1,
    pointerEvents: 'none',
  },
  captionWrap: {
    ...FILL,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    pointerEvents: 'none',
  },
  caption: {
    fontFamily: fonts.ui,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0.3,
    textAlign: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
});
