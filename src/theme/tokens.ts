/**
 * Softly design tokens. Art direction is unchanged: square corners,
 * hairlines not shadows, sentence case (never all-caps), no monospace.
 *
 * There is no accent. `brass` is gone, and the primary action is the ground
 * turned inside out — `action` is `ink`, `onAction` is `paper`. Light paper and
 * dark ink are the same value, and light ink and dark `surfaceSunk` are the
 * same value, so the two themes are one set of values folded in half rather
 * than two palettes.
 *
 * `actionPressed` brightens in both themes, which is not what brass did. Light
 * `ink` sits at 2.7% lightness — there is nothing below it to darken into — so
 * pressed lifts 5.3 lightness points, exactly matching dark's lift from
 * #F5F2EE to #FFFFFF.
 *
 * `ink3` is gone. It was #7E7669 at 4.09:1 in light, under the 4.5 floor for
 * normal text, and it was being used at 11px. A light tertiary that both passes
 * AA and reads genuinely quiet does not exist, so the system is two ink levels
 * and hierarchy below `ink2` is carried by size and weight, not color.
 *
 * Color now means state and nothing else, links aside. `clay` is now `mustard`
 * and `slate` is now `aqua`; the old names had stopped describing the colors.
 * (`spruce` keeps its name for now even though at 88° it is a chartreuse — that
 * rename is still open.) The state tints are no longer near-paper washes but
 * real color fields, and the marks that sit on them are near-black in light and
 * near-white in dark.
 *
 * `link`/`linkPressed` are provisional. They sit at the mustard hue — 49.9°,
 * within a tenth of a degree of `mustard` — so a link and an attention mark are
 * the same color family, a real objection that has not been settled. The chosen
 * values clear 4.5:1 on all three grounds in both themes, but in dark no value
 * at this hue can both clear AA on a card and stay 3:1 clear of `ink`, so dark
 * links must carry an underline or weight, never color alone. Light has a
 * narrow window where color alone suffices.
 */

export const palette = {
  light: {
    paper: "#F5F2EE",
    surface: "#FFFFFF",
    surfaceSunk: "#E9E5DE",
    ink: "#0D0601",
    ink2: "#3C3129",
    hairline: "rgba(13,6,1,0.11)",
    hairlineStrong: "rgba(13,6,1,0.20)",
    action: "#0D0601",
    actionPressed: "#261103",
    onAction: "#F5F2EE",
    link: "#726213",
    linkPressed: "#584B0E",
    spruce: "#1C2F07",
    spruceTint: "#9FAE87",
    mustard: "#473D0B",
    mustardTint: "#CCBC2E",
    aqua: "#04323E",
    aquaTint: "#92F0EE",
    photoA: "#E6DFD2",
    photoB: "#DCD3C3",
  },
  dark: {
    paper: "#1E1007",
    surface: "#2A1E16",
    surfaceSunk: "#0D0601",
    ink: "#F5F2EE",
    ink2: "#D0CBC1",
    hairline: "rgba(245,242,238,0.13)",
    hairlineStrong: "rgba(245,242,238,0.24)",
    action: "#F5F2EE",
    actionPressed: "#FFFFFF",
    onAction: "#1E1007",
    link: "#A68F1C",
    linkPressed: "#C1A520",
    spruce: "#ACE968",
    spruceTint: "#454E35",
    mustard: "#D8BA22",
    mustardTint: "#453F10",
    aqua: "#85E0F7",
    aquaTint: "#0B3B3A",
    photoA: "#362215",
    photoB: "#2C1B11",
  },
} as const;

/** Widened to `string` so light and dark are the same shape (the `as const` above
 * would otherwise make every hex its own literal type). */
export type Palette = {
  readonly [K in keyof (typeof palette)["light"]]: string;
};

/** Solway carries all UI text across five real weights, so each slot is still its
 * own cut and emphasis is drawn rather than synthesised; Yuji Mai is display-only
 * (≥20px). The slot names no longer describe their cuts: body starts at Light, so
 * every slot shifts down a rung and `uiMedium` renders Regular 400 while
 * `uiSemiBold` renders Medium 500. Solway ships no 600, which is why the shift
 * absorbs cleanly rather than stranding a weight. */
export const fonts = {
  display: "YujiMai_400Regular",
  ui: "Solway_300Light",
  uiMedium: "Solway_400Regular",
  uiSemiBold: "Solway_500Medium",
  uiBold: "Solway_700Bold",
  uiExtraBold: "Solway_800ExtraBold",
} as const;

/** Sizes in pt; line heights precomputed (RN wants absolute lineHeight). */
export const type = {
  display: { fontSize: 34, lineHeight: 37 }, // finish moment
  title: { fontSize: 28, lineHeight: 30 }, // screen title
  heading: { fontSize: 17, lineHeight: 22 }, // card name, primary button
  body: { fontSize: 15, lineHeight: 22 }, // minimum on-device body size
  small: { fontSize: 13, lineHeight: 18 }, // smallest tier; stamped label, never smaller for tappables
} as const;

/** Tracking on stamped labels: 0.035em of the small size. */
export const trackSmall = 0.035 * type.small.fontSize;

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
