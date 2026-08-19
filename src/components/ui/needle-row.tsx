import { Pressable, StyleSheet, Text, View } from "react-native";

import { Badge } from "@/components/ui/badge";
import { Stamp } from "@/components/ui/stamp";
import { fonts, radius, space, tap, trackMicro, type, useTheme } from "@/theme";

export type NeedleRowProps = {
  /** Metric size, e.g. "4.5". */
  size: string;
  /** US size, e.g. "7". */
  us?: string;
  /** e.g. "Circular", "Interchangeable tips", "Hook". */
  kind: string;
  /** Cable length, e.g. "80 cm". */
  length?: string;
  /** Project currently using it; omit when the needle is free. */
  tiedUpIn?: string;
  onPress?: () => void;
};

/** A needle or hook: free (brass swatch) or tied up in a project (sunk swatch). */
export function NeedleRow({
  size,
  us,
  kind,
  length,
  tiedUpIn,
  onPress,
}: NeedleRowProps) {
  const { colors } = useTheme();
  const free = !tiedUpIn;

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${kind} ${size} mm${tiedUpIn ? `, in ${tiedUpIn}` : ""}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.hairline },
        pressed && onPress ? { backgroundColor: colors.brassTint } : null,
      ]}
    >
      <View
        style={[
          styles.swatch,
          {
            backgroundColor: free ? colors.brassTint : colors.surfaceSunk,
            borderColor: colors.hairline,
          },
        ]}
      >
        <Text
          style={[
            styles.swatchSize,
            { color: free ? colors.brass : colors.ink3 },
          ]}
        >
          {size}
        </Text>
        {/* Sentence case: the design's "MM" would break the never-all-caps rule. */}
        <Text style={[styles.swatchUnit, { color: colors.ink3 }]}>mm</Text>
      </View>

      <View style={styles.body}>
        <Text numberOfLines={1} style={[styles.kind, { color: colors.ink }]}>
          {kind}
          {us ? (
            <Text style={[styles.us, { color: colors.ink3 }]}> · US {us}</Text>
          ) : null}
        </Text>
        {tiedUpIn ? <Badge tone="committed">in {tiedUpIn}</Badge> : null}
      </View>

      {length ? <Stamp>{length}</Stamp> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s4,
    minHeight: tap.min,
    padding: space.s3,
    borderBottomWidth: 1,
  },
  swatch: {
    width: 46,
    height: 46,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  swatchSize: {
    fontFamily: fonts.uiMedium,
    fontSize: 14,
    lineHeight: 16,
  },
  swatchUnit: {
    fontFamily: fonts.ui,
    fontSize: 8.5,
    lineHeight: 10,
    letterSpacing: trackMicro,
    marginTop: 2,
  },
  body: {
    flex: 1,
    minWidth: 0,
    flexDirection: "column",
    gap: 4,
    alignItems: "flex-start",
  },
  kind: {
    fontFamily: fonts.uiMedium,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
  us: {
    fontFamily: fonts.ui,
  },
});
