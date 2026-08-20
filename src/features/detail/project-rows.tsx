/**
 * The rows the project screen draws its yarn with.
 *
 * `YarnCard` is the same composition and very nearly does this job, but its
 * yardage stamp is captioned "left" — which is the truth on the Stash screen it
 * was drawn for and a lie here. A pack on a project is not what is left of a
 * skein, it is what went into the thing, and the caption is the whole
 * difference between those two sentences. So the card is restated rather than
 * bent: same 72pt frame, same hairline, same stamps, different words.
 *
 * The needles need nothing new — `NeedleRow` already draws a size, its US name
 * and its kind, and a project's needles are exactly that with no `onPress`.
 *
 * Nothing here reads the database. What it is handed comes from
 * `@/features/detail/project`, and the photograph beside it from the mirror.
 */

import { StyleSheet, Text, View } from "react-native";

import { PhotoFrame } from "@/components/ui/photo-frame";
import { Stamp } from "@/components/ui/stamp";
import { fonts, space, type, useTheme } from "@/theme";

export type ProjectYarnRowProps = {
  /** The line that names the skein — the colourway, where there is one. */
  title: string;
  /** The yarn itself, underneath. Omitted when the title is already it. */
  brand?: string;
  weight?: string;
  /** How much went into the project, in the pack's own unit: "492 yd". */
  used?: string;
  skeins?: string;
  /** Dye lot and shop — the small print, quietest line in the row. */
  note?: string;
  photo?: string;
  /** The skein's own colour, over the photograph or instead of one. */
  tint?: string;
};

/** One pack: the yarn a project ate, and how much of it. */
export function ProjectYarnRow({
  title,
  brand,
  weight,
  used,
  skeins,
  note,
  photo,
  tint,
}: ProjectYarnRowProps) {
  const { colors } = useTheme();

  return (
    // Not a `Pressable`: there is nowhere to go. The stash entry behind a pack
    // may not be in this account's mirror at all — a project can hold yarn
    // stashed and used up years ago — and a row that sometimes opens something
    // is worse than one that never does.
    <View
      style={[styles.row, { borderBottomColor: colors.hairline }]}
      accessible
      accessibilityLabel={brand ? `${title}, ${brand}` : title}
    >
      <PhotoFrame src={photo} tint={tint} label="yarn" width={72} aspect="1/1" />

      <View style={styles.body}>
        <Text numberOfLines={1} style={[styles.title, { color: colors.ink }]}>
          {title}
        </Text>

        {brand ? (
          <Text numberOfLines={1} style={[styles.brand, { color: colors.ink2 }]}>
            {brand}
          </Text>
        ) : null}

        {weight || used || skeins ? (
          <View style={styles.stamps}>
            {weight ? <Stamp label="weight">{weight}</Stamp> : null}
            {used ? <Stamp label="used">{used}</Stamp> : null}
            {skeins ? <Stamp label="skeins">{skeins}</Stamp> : null}
          </View>
        ) : null}

        {note ? (
          <Text numberOfLines={1} style={[styles.note, { color: colors.ink2 }]}>
            {note}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: space.s4,
    padding: space.s3,
    borderBottomWidth: 1,
  },
  body: {
    flex: 1,
    minWidth: 0,
    flexDirection: "column",
    gap: 5,
  },
  title: {
    fontFamily: fonts.uiSemiBold,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
  brand: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
  },
  stamps: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.s4,
    marginTop: 2,
  },
  note: {
    fontFamily: fonts.ui,
    fontSize: type.micro.fontSize,
    lineHeight: type.micro.lineHeight,
  },
});
