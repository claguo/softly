/**
 * One yarn from the stash, read entirely from the local mirror.
 *
 * The typed columns cover what the stash list shows; everything else — how
 * many skeins, what it is already spoken for — lives in `raw` and is read
 * defensively, because the stash endpoint is undocumented enough that a field
 * name is a guess until it is seen.
 */

import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { BackBar } from "@/components/back-bar";
import { Badge } from "@/components/ui/badge";
import { PhotoFrame } from "@/components/ui/photo-frame";
import { Stamp } from "@/components/ui/stamp";
import { fillStashPhotos, tintFor, useStashEntry } from "@/data";
import {
  decimal,
  firstNumber,
  firstString,
  parseRaw,
  readId,
} from "@/features/detail/raw";
import { hasNotes, RichText } from "@/features/detail/rich-text";
import { fonts, space, trackMicro, type, useTheme } from "@/theme";

export default function YarnScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { id: param } = useLocalSearchParams<"/yarn/[id]">();

  const id = readId(param);
  // Live, unlike the other detail screens: the photograph is not in the stash
  // record Ravelry sends and lands a beat after this screen opens. See
  // `useStashEntry`.
  const row = useStashEntry(id);
  const raw = useMemo(() => parseRaw(row?.raw), [row]);

  // A skein whose picture nobody has fetched yet — the frame is empty, so ask.
  // Cheap and idempotent: with every yarn already answered for this is one
  // query and no network, and a yarn with no photograph is only asked once.
  const missingPhoto = row !== null && row.photoUrl === null;

  useEffect(() => {
    if (missingPhoto) {
      void fillStashPhotos();
    }
  }, [missingPhoto]);

  // The same composition Stash uses: the colourway takes the title, and the
  // second line carries whatever else names this yarn.
  const colorway = row?.colorway ?? null;
  const yarnName = row?.yarnName ?? null;
  const title = colorway ?? yarnName ?? "Unnamed yarn";
  const subtitle = [row?.brand ?? null, colorway === null ? null : yarnName]
    .filter((part): part is string => part !== null)
    .join(" · ");

  const skeins = firstNumber(raw, [
    ["skeins"],
    ["quantity"],
    ["packs", "0", "skeins"],
    ["pack", "skeins"],
  ]);
  const committedTo = firstString(raw, [
    ["project", "name"],
    ["project_name"],
    ["stashed_project_name"],
  ]);
  // The stash endpoint spells this two ways and answers 403 to read-only
  // credentials, so both are asked for and the rendered one still wins.
  const notesHtml = firstString(raw, [["notes_html"], ["comment_html"]]);
  const notesMarkdown = firstString(raw, [["notes"], ["comment"]]);

  const yardage = row?.yardsTotal ?? null;

  /**
   * What one skein of this yarn is, as the yarn database has it.
   *
   * Not the same number as `yardage` above, and the labels have to keep them
   * apart: that one is how much of this yarn the knitter has left, this one is
   * what a ball of it comes as. Both are worth showing — "1,200 yd left" says
   * nothing about whether that is four balls or forty.
   *
   * Free, unlike the fibre content: `stash/list.json` nests the whole yarn
   * record, so this is already in `raw` and works with no network at all.
   * `primary_pack` is asked first because it is this entry's own figure where
   * the knitter has set one.
   */
  const perSkeinYards = firstNumber(raw, [
    ["primary_pack", "yards_per_skein"],
    ["yarn", "yardage"],
  ]);
  const perSkeinGrams = firstNumber(raw, [
    ["primary_pack", "grams_per_skein"],
    ["yarn", "grams"],
  ]);

  // Either half on its own is still worth printing: plenty of yarns record a
  // yardage and no weight.
  const perSkein =
    [
      perSkeinYards === null ? null : `${Math.round(perSkeinYards)} yd`,
      perSkeinGrams === null ? null : `${Math.round(perSkeinGrams)} g`,
    ]
      .filter((part): part is string => part !== null)
      .join(" · ") || null;

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.screen, { backgroundColor: colors.paper }]}
    >
      <BackBar
        action={row === null ? undefined : "Edit"}
        onAction={
          id === null
            ? undefined
            : () =>
                router.push({
                  pathname: "/edit-yarn",
                  params: { id: String(id) },
                })
        }
      />

      {row === null ? (
        <Text style={[styles.stamp, { color: colors.ink2 }]}>Yarn unavailable.</Text>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: space.s10 + insets.bottom }}
        >
          <View style={[styles.photo, { borderBottomColor: colors.hairline }]}>
            <PhotoFrame
              src={row.photoUrl ?? undefined}
              tint={tintFor(row.colorHex, row.colorFamilyId)}
              label="yarn"
              aspect="1/1"
            />
          </View>

          <View style={styles.block}>
            <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>

            {subtitle === "" ? null : (
              <Text style={[styles.brand, { color: colors.ink2 }]}>{subtitle}</Text>
            )}

            {row.status ? (
              <View style={styles.marks}>
                <Badge tone="neutral">{row.status}</Badge>
              </View>
            ) : null}

            {committedTo ? (
              <Text style={[styles.committed, { color: colors.ink2 }]}>
                in {committedTo}
              </Text>
            ) : null}
          </View>

          {row.weightName !== null ||
          yardage !== null ||
          skeins !== null ||
          perSkein !== null ? (
            <View
              style={[styles.block, styles.ruled, { borderTopColor: colors.hairline }]}
            >
              <View style={styles.facts}>
                {row.weightName !== null ? (
                  <Stamp label="weight">{row.weightName}</Stamp>
                ) : null}
                {/* Spruce, and labelled "left" rather than "yardage", because
                    this is the only figure here that is about the knitter's
                    own bag rather than about the yarn. */}
                {yardage !== null ? (
                  <Stamp label="left" tone="spruce">{`${Math.round(yardage)} yd`}</Stamp>
                ) : null}
                {skeins !== null ? (
                  <Stamp label="skeins">{decimal(skeins)}</Stamp>
                ) : null}
                {/* One stamp, not two: the length and the weight of a ball
                    are a single fact about it — the way a ball band prints
                    them — and two stamps both labelled "per skein" would read
                    as a repetition rather than as a pair. */}
                {perSkein === null ? null : <Stamp label="per skein">{perSkein}</Stamp>}
              </View>
            </View>
          ) : null}

          {/* Its own line rather than another stamp: "60% Mohair, 40% Silk" is
              a sentence where the others are a word, and it wraps. Absent
              until the yarn has been fetched once — the stash record carries
              no fibre content at all, so there is nothing to show offline on a
              skein this app has never looked up. See `yarn-photos.ts`. */}
          {row.fibers === null ? null : (
            <View
              style={[styles.block, styles.ruled, { borderTopColor: colors.hairline }]}
            >
              <Text style={[styles.sectionLabel, { color: colors.ink2 }]}>Material</Text>
              <Text style={[styles.material, { color: colors.ink2 }]}>{row.fibers}</Text>
            </View>
          )}

          {hasNotes(notesHtml, notesMarkdown) ? (
            <View
              style={[styles.block, styles.ruled, { borderTopColor: colors.hairline }]}
            >
              <Text style={[styles.sectionLabel, { color: colors.ink2 }]}>Notes</Text>
              <RichText html={notesHtml} markdown={notesMarkdown} />
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  photo: { borderBottomWidth: 1 },
  block: {
    paddingHorizontal: space.s4,
    paddingVertical: space.s5,
    gap: space.s2,
  },
  ruled: { borderTopWidth: 1 },
  title: {
    // 28, the screen-title size, leading opened past `type.title`'s 30 because
    // Yuji Mai clips at that tightness and a colourway is free to wrap.
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 32,
  },
  brand: {
    fontFamily: fonts.ui,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
  marks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  material: {
    fontFamily: fonts.ui,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
  committed: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
  },
  facts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.s4,
  },
  sectionLabel: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
  },
  stamp: {
    fontFamily: fonts.ui,
    fontSize: type.micro.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
    textAlign: "center",
    paddingTop: space.s10,
    paddingHorizontal: space.s4,
  },
});
