/**
 * Soft Goods design tokens — a 1:1 translation of the design handoff's
 * styles.css everywhere except the accent ramp, which has since moved to cyan
 * and now diverges from the handoff. Art direction: square corners, hairlines
 * not shadows, sentence case (never all-caps), no monospace. The accent — still
 * named `brass` from its gold days — is the one action per screen; spruce =
 * committed; clay = attention; slate = offline/queued (never red).
 */

export const palette = {
  light: {
    paper: "#F7F4EE",
    surface: "#FFFDF9",
    surfaceSunk: "#EDE8DE",
    ink: "#221E1A",
    ink2: "#4C463D",
    ink3: "#7E7669",
    hairline: "rgba(34,30,26,0.12)",
    hairlineStrong: "rgba(34,30,26,0.22)",
    brass: "#147980",
    brassPressed: "#106066",
    brassTint: "#A8F9FF",
    onBrass: "#F2FEFF",
    spruce: "#2C5A4C",
    spruceTint: "#DDE9E3",
    clay: "#AE5233",
    clayTint: "#F6E2D9",
    slate: "#4A5A6B",
    slateTint: "#E1E7ED",
    photoA: "#E6DFD2",
    photoB: "#DCD3C3",
  },
  dark: {
    paper: "#15120F",
    surface: "#1E1A16",
    surfaceSunk: "#100E0B",
    ink: "#F3EEE5",
    ink2: "#C8BFB1",
    ink3: "#8E8577",
    hairline: "rgba(243,238,229,0.13)",
    hairlineStrong: "rgba(243,238,229,0.24)",
    brass: "#27F1FF",
    brassPressed: "#7DF7FF",
    brassTint: "#0A3C40",
    onBrass: "#062226",
    spruce: "#79AD98",
    spruceTint: "#1D2F28",
    clay: "#D8825F",
    clayTint: "#332016",
    slate: "#9BB0C4",
    slateTint: "#1B2229",
    photoA: "#2A2521",
    photoB: "#221E1A",
  },
} as const;

/** Widened to `string` so light and dark are the same shape (the `as const` above
 * would otherwise make every hex its own literal type). */
export type Palette = {
  readonly [K in keyof (typeof palette)["light"]]: string;
};

/** Shippori Mincho carries all UI text across five real weights, so each slot is
 * its own cut and emphasis is drawn rather than synthesised; Yuji Mai is
 * display-only (≥20px). */
export const fonts = {
  display: "YujiMai_400Regular",
  ui: "ShipporiMincho_400Regular",
  uiMedium: "ShipporiMincho_500Medium",
  uiSemiBold: "ShipporiMincho_600SemiBold",
  uiBold: "ShipporiMincho_700Bold",
  uiExtraBold: "ShipporiMincho_800ExtraBold",
} as const;

/** Sizes in pt; line heights precomputed (RN wants absolute lineHeight). */
export const type = {
  display: { fontSize: 34, lineHeight: 37 }, // finish moment
  title: { fontSize: 28, lineHeight: 30 }, // screen title
  heading: { fontSize: 17, lineHeight: 22 }, // card name, primary button
  body: { fontSize: 15, lineHeight: 22 }, // minimum on-device body size
  small: { fontSize: 13, lineHeight: 18 },
  micro: { fontSize: 11, lineHeight: 13 }, // stamped label; never smaller for tappables
} as const;

/** Tracking on stamped labels: 0.035em of the micro size. */
export const trackMicro = 0.035 * type.micro.fontSize;

export const space = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s8: 32,
  s10: 40,
} as const;

/** Square corners everywhere; pill reserved for the tab bar and true circles. */
export const radius = { sm: 0, md: 0, lg: 0, xl: 0, pill: 999 } as const;

export const tap = { min: 48, lg: 56 } as const;

/** Screens must reserve this much scroll padding beneath content for the tab pill. */
export const tabBarInset = 86;
