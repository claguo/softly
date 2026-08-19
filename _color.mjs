/**
 * Hex and HSL, both ways.
 *
 * The picker works in HSL because that is how a knitter describes the gap
 * between a swatch and the ball in their hand — the same red but deeper, the
 * same blue but greyer — and those are one axis each in HSL and three tangled
 * ones in RGB. What is stored is still hex, because that is what a `View`
 * takes and what `yarn_colors` holds.
 *
 * Pure, so the picker can convert on every frame of a drag without touching
 * anything outside itself.
 */



function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function pair(value) {
  return clamp(Math.round(value), 0, 255)
    .toString(16)
    .padStart(2, '0');
}

/** `{h, s, l}` as `#rrggbb`. */
function hslToHex(({h,s,l})) {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 100) / 100;
  const lum = clamp(l, 0, 100) / 100;

  const chroma = (1 - Math.abs(2 * lum - 1)) * sat;
  const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = lum - chroma / 2;

  const [r, g, b] =
    hue < 60
      ? [chroma, second, 0]
      : hue < 120
        ? [second, chroma, 0]
        : hue < 180
          ? [0, chroma, second]
          : hue < 240
            ? [0, second, chroma]
            : hue < 300
              ? [second, 0, chroma]
              : [chroma, 0, second];

  return `#${pair((r + match) * 255)}${pair((g + match) * 255)}${pair((b + match) * 255)}`;
}

/** `#rrggbb` as `{h, s, l}`. Anything unreadable comes back as mid grey. */
function hexToHsl(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());

  if (!match) {
    return { h: 0, s: 0, l: 50 };
  }

  const value = Number.parseInt(match[1], 16);
  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const span = max - min;
  const l = (max + min) / 2;

  if (span === 0) {
    return { h: 0, s: 0, l: l * 100 };
  }

  const s = span / (1 - Math.abs(2 * l - 1));
  const h =
    max === r
      ? ((g - b) / span) % 6
      : max === g
        ? (b - r) / span + 2
        : (r - g) / span + 4;

  return { h: (((h * 60) % 360) + 360) % 360, s: s * 100, l: l * 100 };
}

/**
 * Black or white, whichever can be read on top of a colour.
 *
 * The relative-luminance line from WCAG rather than a plain average: the eye is
 * far more sensitive to green than to blue, so averaging picks white text on
 * yellows a person cannot read it on.
 */
function readableOn(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());

  if (!match) {
    return '#000000';
  }

  const value = Number.parseInt(match[1], 16);
  const channel = (raw) => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };

  const luminance =
    0.2126 * channel((value >> 16) & 255) +
    0.7152 * channel((value >> 8) & 255) +
    0.0722 * channel(value & 255);

  return luminance > 0.179 ? '#000000' : '#ffffff';
}

export {hslToHex,hexToHsl,readableOn};