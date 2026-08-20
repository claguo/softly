import type { DimensionValue } from "react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Badge } from "@/components/ui/badge";
import { PhotoFrame } from "@/components/ui/photo-frame";
import { Stamp } from "@/components/ui/stamp";
import { formatRelative } from "@/components/ui/sync-notice";
import { fonts, space, trackMicro, type, useTheme } from "@/theme";

export type ProjectCardProps = {
  name: string;
  /** Pattern name, e.g. "Ranunculus". */
  pattern?: string;
  /** Designer, joined to the pattern with a middot. Ravelry's project list
   * often has no designer at all, so the line degrades to whichever half exists. */
  designer?: string;
  /** Yarn committed to this project, e.g. "Camel Heather". */
  colorway?: string;
  /** Needle or hook size, e.g. "4.5 mm". */
  needle?: string;
  /** Only when it is worth saying — "Hibernating", "Frogged". Omit for the normal case. */
  status?: string;
  /** Last touched; stamped as "3d ago" beside the name. */
  touchedAt?: Date | number;
  photo?: string;
  /** Progress. The track is drawn only when both are known — our projects
   * table does not carry row counts, so most cards have no track at all. */
  rows?: number;
  rowsTotal?: number;
  /** True while local edits have not reached Ravelry yet. */
  pending?: boolean;
  onPress?: () => void;
};

/** A work in progress: what is committed to it, and how long since it moved. */
export function ProjectCard({
  name,
  pattern,
  designer,
  colorway,
  needle,
  status,
  touchedAt,
  photo,
  rows,
  rowsTotal,
  pending = false,
  onPress,
}: ProjectCardProps) {
  const { colors } = useTheme();

  const source =
    pattern && designer ? `${pattern} · ${designer}` : (pattern ?? designer);
  const touched = touchedAt === undefined ? null : formatRelative(touchedAt);

  const percent =
    rows !== undefined && rowsTotal !== undefined && rowsTotal > 0
      ? Math.min(100, Math.max(0, Math.round((rows / rowsTotal) * 100)))
      : null;
  const fillWidth: DimensionValue = `${percent ?? 0}%`;

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={source ? `${name}, ${source}` : name}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { borderColor: colors.hairline },
        pressed && onPress ? { backgroundColor: colors.surfaceSunk } : null,
      ]}
    >
      <PhotoFrame src={photo} label="project photo" width={96} aspect="1/1" />

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={[styles.name, { color: colors.ink }]}>
            {name}
          </Text>
          {touched ? (
            <Text style={[styles.touched, { color: colors.ink2 }]}>
              {touched}
            </Text>
          ) : null}
        </View>

        {source ? (
          <Text
            numberOfLines={1}
            style={[styles.source, { color: colors.ink2 }]}
          >
            {source}
          </Text>
        ) : null}

        {colorway || needle ? (
          <View style={styles.stamps}>
            {colorway ? <Stamp label="yarn">{colorway}</Stamp> : null}
            {needle ? <Stamp label="needle">{needle}</Stamp> : null}
          </View>
        ) : null}

        {percent !== null ? (
          <View style={styles.progress}>
            <View
              style={[styles.track, { backgroundColor: colors.surfaceSunk }]}
            >
              <View
                style={[
                  styles.fill,
                  { width: fillWidth, backgroundColor: colors.spruce },
                ]}
              />
            </View>
            <Text style={[styles.rows, { color: colors.ink2 }]}>
              {rows}/{rowsTotal} rows
            </Text>
          </View>
        ) : null}

        {status || pending ? (
          <View style={styles.marks}>
            {status ? <Badge tone="neutral">{status}</Badge> : null}
            {pending ? (
              <Badge tone="queued" dot>
                on device
              </Badge>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
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
    gap: 6,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.s2,
  },
  name: {
    flexShrink: 1,
    fontFamily: fonts.uiSemiBold,
    fontSize: type.heading.fontSize,
    lineHeight: type.heading.lineHeight,
  },
  touched: {
    // Stamped, one step under `micro`: it is a caption on a card, never a tap
    // target, so the 11px floor does not apply.
    flexShrink: 0,
    fontFamily: fonts.ui,
    fontSize: 10.5,
    lineHeight: 13,
    letterSpacing: trackMicro,
  },
  source: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
  },
  stamps: {
    flexDirection: "row",
    gap: space.s4,
    marginTop: 2,
  },
  progress: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s2,
    marginTop: 4,
  },
  track: {
    flex: 1,
    height: 3,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
  },
  rows: {
    flexShrink: 0,
    fontFamily: fonts.ui,
    fontSize: 10.5,
    lineHeight: 13,
    letterSpacing: trackMicro,
    fontVariant: ["tabular-nums"],
  },
  marks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
});
