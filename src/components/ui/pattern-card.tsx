import { Pressable, StyleSheet, Text, View } from "react-native";

import { Badge } from "@/components/ui/badge";
import { PhotoFrame } from "@/components/ui/photo-frame";
import { fonts, space, trackMicro, type, useTheme } from "@/theme";

/** grid = 2-up photo-forward results; list = compact rows in Saves. */
export type PatternCardVariant = "grid" | "list";

export type PatternCardProps = {
  name: string;
  designer?: string;
  /** Stamped spec line, e.g. "820 yd · 4 mm". */
  meta?: string;
  photo?: string;
  variant?: PatternCardVariant;
  /** "free" or a price string. */
  price?: string;
  inLibrary?: boolean;
  offline?: boolean;
  /** Shows the saved mark over the photo (grid only). */
  saved?: boolean;
  onPress?: () => void;
};

/** A pattern in Discover or Saves. The frame stays quiet so the photo carries it. */
export function PatternCard({
  name,
  designer,
  meta,
  photo,
  variant = "grid",
  price,
  inLibrary = false,
  offline = false,
  saved = false,
  onPress,
}: PatternCardProps) {
  const { colors } = useTheme();

  const marks =
    inLibrary || offline || price ? (
      <View style={styles.marks}>
        {inLibrary ? <Badge tone="library">in library</Badge> : null}
        {offline ? (
          <Badge tone="offline" dot>
            downloaded
          </Badge>
        ) : null}
        {price ? <Badge tone="neutral">{price}</Badge> : null}
      </View>
    ) : null;

  const designerLine = designer ? (
    <Text numberOfLines={1} style={[styles.designer, { color: colors.ink2 }]}>
      {designer}
    </Text>
  ) : null;

  if (variant === "list") {
    return (
      <Pressable
        accessibilityRole={onPress ? "button" : undefined}
        accessibilityLabel={designer ? `${name}, ${designer}` : name}
        onPress={onPress}
        style={({ pressed }) => [
          styles.list,
          { borderColor: colors.hairline },
          pressed && onPress ? { backgroundColor: colors.surfaceSunk } : null,
        ]}
      >
        <PhotoFrame src={photo} label="pattern" width={72} aspect="1/1" />
        <View style={styles.body}>
          <Text
            numberOfLines={1}
            style={[styles.listName, { color: colors.ink }]}
          >
            {name}
          </Text>
          {designerLine}
          {marks}
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={designer ? `${name}, ${designer}` : name}
      onPress={onPress}
      style={styles.grid}
    >
      <View>
        <PhotoFrame src={photo} label="pattern photo" aspect="4/5" />
        {/* Ink, not a colour: saving is something the knitter did, not one of
            the three states the palette is reserved for. The glyph is already
            the only heart on the screen, so shape carries it. */}
        {saved ? (
          <View style={[styles.saved, { backgroundColor: colors.surface }]}>
            <Text style={[styles.savedGlyph, { color: colors.ink }]}>♥</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <Text
          numberOfLines={2}
          style={[styles.gridName, { color: colors.ink }]}
        >
          {name}
        </Text>
        {designerLine}
        {meta ? (
          <Text numberOfLines={1} style={[styles.meta, { color: colors.ink2 }]}>
            {meta}
          </Text>
        ) : null}
        {marks}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "column",
    gap: space.s2,
  },
  list: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s4,
    padding: space.s3,
    borderBottomWidth: 1,
  },
  body: {
    flex: 1,
    minWidth: 0,
    flexDirection: "column",
    gap: 3,
  },
  gridName: {
    // Yuji Mai at the handoff's 16px. Line height is opened past the design's
    // 1.1 because the brush strokes clip at that leading on device.
    fontFamily: fonts.display,
    fontSize: 16,
    lineHeight: 20,
  },
  listName: {
    fontFamily: fonts.uiSemiBold,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
  designer: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
  },
  meta: {
    fontFamily: fonts.ui,
    fontSize: 9.5,
    lineHeight: 12,
    letterSpacing: trackMicro,
  },
  marks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  saved: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  savedGlyph: {
    fontFamily: fonts.ui,
    fontSize: 13,
    lineHeight: 16,
  },
});
