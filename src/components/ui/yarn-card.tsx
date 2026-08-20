import { Pressable, StyleSheet, Text, View } from "react-native";

import { Badge } from "@/components/ui/badge";
import { PhotoFrame } from "@/components/ui/photo-frame";
import { Stamp } from "@/components/ui/stamp";
import { fonts, space, type, useTheme } from "@/theme";

export type YarnCardProps = {
  brand?: string;
  colorway: string;
  /** Yarn weight, e.g. "DK". */
  weight?: string;
  /** Yardage remaining, e.g. "420 yd". */
  yardage?: string;
  /** Count on hand, e.g. "3". */
  skeins?: string;
  photo?: string;
  /**
   * The skein's own colour, laid over the photograph. A catalogue shot is of
   * some colourway and usually not this one, so this is what makes a card
   * recognisable as *your* ball of it. See `tintFor`.
   */
  tint?: string;
  /** Project this yarn is committed to. */
  committedTo?: string;
  /** Flags a partial or odd ball. */
  low?: boolean;
  onPress?: () => void;
};

/** One yarn in the stash: how much is left, and whether it is already spoken for. */
export function YarnCard({
  brand,
  colorway,
  weight,
  yardage,
  skeins,
  photo,
  tint,
  committedTo,
  low = false,
  onPress,
}: YarnCardProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={brand ? `${colorway}, ${brand}` : colorway}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { borderColor: colors.hairline },
        pressed && onPress ? { backgroundColor: colors.surfaceSunk } : null,
      ]}
    >
      <PhotoFrame src={photo} tint={tint} label="yarn" width={72} aspect="1/1" />

      <View style={styles.body}>
        <Text
          numberOfLines={1}
          style={[styles.colorway, { color: colors.ink }]}
        >
          {colorway}
        </Text>
        {brand ? (
          <Text
            numberOfLines={1}
            style={[styles.brand, { color: colors.ink2 }]}
          >
            {brand}
          </Text>
        ) : null}

        <View style={styles.stamps}>
          {weight ? <Stamp label="weight">{weight}</Stamp> : null}
          {yardage ? (
            <Stamp label="left" tone={low ? "ink" : "spruce"}>
              {yardage}
            </Stamp>
          ) : null}
          {skeins ? <Stamp label="skeins">{skeins}</Stamp> : null}
        </View>

        {committedTo ? (
          <Text
            numberOfLines={1}
            style={[styles.committed, { color: colors.ink2 }]}
          >
            in {committedTo}
          </Text>
        ) : null}

        {low ? (
          <View style={styles.marks}>
            <Badge tone="attention">odd ball</Badge>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
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
  colorway: {
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
    gap: space.s4,
    marginTop: 2,
  },
  committed: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
  },
  marks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 3,
  },
});
