/**
 * One project, read entirely from the local mirror.
 *
 * Nothing here goes to the network. The row arrived with the last sync and
 * carries the whole Ravelry object in `raw`, so the notes a knitter wrote at
 * knit night are on screen with no wifi and no spinner — which is the point of
 * keeping the cache in the first place.
 *
 * The one thing that can appear here without a sync is "Open pattern", and
 * only when the pattern's PDF is already on the device — often because casting
 * on fetched it a moment ago, which is why it is read from a live store rather
 * than once on mount. When there is no PDF this screen says nothing about it:
 * acquiring one belongs to the pattern screen, and a project in progress is
 * not the place to be offered errands.
 *
 * This screen had no brass on it for a long time, which was right while the
 * only things to do here were reading. Finishing changes that: it is the one
 * decision a project screen exists to offer, and it is offered exactly once —
 * a project already marked Finished has nothing brass on it again.
 */

import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { BackBar } from "@/components/back-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/app-button";
import { PhotoFrame } from "@/components/ui/photo-frame";
import { formatRelative } from "@/components/ui/sync-notice";
import { getProjectById, usePatternPdf } from "@/data";
import { firstString, parseRaw, readId } from "@/features/detail/raw";
import { hasNotes, RichText } from "@/features/detail/rich-text";
import { fonts, space, trackMicro, type, useTheme } from "@/theme";

/**
 * Ravelry's `status_name` for a project that is done.
 *
 * `sync.ts` copies that string through untouched rather than mapping it to an
 * enum Ravelry never promised, so the match is loose — the same way Home
 * matches the statuses that mean a project is still on the needles.
 */
function isFinished(status: string | null | undefined): boolean {
  return typeof status === "string" && status.trim().toLowerCase() === "finished";
}

export default function ProjectScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { id: param } = useLocalSearchParams<"/project/[id]">();

  const id = readId(param);
  const row = useMemo(() => (id === null ? null : getProjectById(id)), [id]);
  const raw = useMemo(() => parseRaw(row?.raw), [row]);

  // The list endpoint carries no designer of its own; whatever `sync.ts` could
  // find is already in the column, and `raw` is the second look.
  const patternId = row?.patternId ?? null;
  const patternName = row?.patternName ?? null;
  const designer =
    row?.designer ?? firstString(raw, [["pattern_author", "name"]]) ?? null;
  const source =
    patternName && designer
      ? `${patternName} · ${designer}`
      : (patternName ?? designer);

  // A knitter's own notes sync as the markdown they typed. The list endpoint
  // this row came from does not carry them today — `notes_html` is read first
  // anyway, so the day a project detail is fetched nothing here changes.
  const notesHtml = firstString(raw, [["notes_html"]]);
  const notesMarkdown = firstString(raw, [["notes"]]);
  const touched = row?.updatedAtRemote ?? null;

  // Null for a project with no linked pattern, and for a linked one whose PDF
  // is not on the phone — the same silence either way.
  const pdf = usePatternPdf(patternId);

  const name = row?.name ?? row?.patternName ?? "Untitled project";
  const finished = isFinished(row?.status);

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.screen, { backgroundColor: colors.paper }]}
    >
      <BackBar />

      {row === null ? (
        <Text style={[styles.stamp, { color: colors.ink3 }]}>
          Project unavailable.
        </Text>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: space.s10 + insets.bottom }}
        >
          <View style={[styles.photo, { borderBottomColor: colors.hairline }]}>
            <PhotoFrame
              src={row.photoUrl ?? undefined}
              label="project photo"
              aspect="4/5"
            />
          </View>

          <View style={styles.block}>
            <Text style={[styles.title, { color: colors.ink }]}>{name}</Text>

            {source ? (
              patternId === null ? (
                <Text style={[styles.source, { color: colors.ink2 }]}>{source}</Text>
              ) : (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`Pattern: ${source}`}
                  onPress={() =>
                    router.push({
                      pathname: "/pattern/[id]",
                      params: { id: patternId },
                    })
                  }
                  // The line is one 22pt row of body text; the slop restores
                  // the 48pt hit box without a control-sized gap under the
                  // title. It stays ink — the one brass thing on a screen is
                  // an action, and following a link is not one.
                  hitSlop={{ top: 13, bottom: 13 }}
                >
                  {({ pressed }) => (
                    <Text
                      style={[
                        styles.source,
                        { color: pressed ? colors.ink : colors.ink2 },
                      ]}
                    >
                      {source}
                    </Text>
                  )}
                </Pressable>
              )
            ) : null}

            {/* Directly under the pattern it belongs to, and quiet: this
                screen has no brass, and opening a document is not a decision. */}
            {pdf !== null && patternId !== null ? (
              <View style={styles.action}>
                <Button
                  variant="quiet"
                  size="sm"
                  accessibilityLabel={`Open the pattern PDF${patternName ? ` for ${patternName}` : ""}`}
                  onPress={() =>
                    router.push({
                      pathname: "/pdf/[patternId]",
                      params: { patternId, name: patternName ?? "" },
                    })
                  }
                >
                  Open pattern
                </Button>
              </View>
            ) : null}

            {row.status ? (
              <View style={styles.marks}>
                {/* Spruce only for done. It is the system's colour for
                    committed and complete, and this is the one status that is
                    either — everything else a project can be is neutral. */}
                <Badge tone={finished ? "committed" : "neutral"}>{row.status}</Badge>
              </View>
            ) : null}

            {touched !== null ? (
              <Text style={[styles.touched, { color: colors.ink3 }]}>
                updated {formatRelative(touched)}
              </Text>
            ) : null}
          </View>

          {/* The one brass thing on this screen: under everything there is to
              know about the project, above everything there is to read on it,
              and only while there is still something to decide. A project that
              is already finished has nothing left to do here. */}
          {id !== null && !finished ? (
            <View
              style={[styles.block, styles.ruled, { borderTopColor: colors.hairline }]}
            >
              <Button
                variant="primary"
                size="lg"
                full
                accessibilityLabel={`Finish ${name}`}
                onPress={() =>
                  router.push({
                    pathname: "/finish/[projectId]",
                    params: { projectId: id },
                  })
                }
              >
                Finish this project
              </Button>
            </View>
          ) : null}

          {hasNotes(notesHtml, notesMarkdown) ? (
            <View
              style={[styles.block, styles.ruled, { borderTopColor: colors.hairline }]}
            >
              <Text style={[styles.sectionLabel, { color: colors.ink3 }]}>Notes</Text>
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
    // 28, the screen-title size, with the leading opened past `type.title`'s
    // 30: Yuji Mai's strokes clip at that tightness and a project name wraps.
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 32,
  },
  source: {
    fontFamily: fonts.ui,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    // Keeps the pressed row exactly as tall as the plain one.
    minHeight: type.body.lineHeight,
  },
  action: {
    flexDirection: "row",
    // The `sm` button's own 12pt of padding, pulled back, so its label starts
    // on the same line as the pattern link above it.
    marginLeft: -12,
    marginTop: 2,
  },
  marks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  touched: {
    fontFamily: fonts.ui,
    fontSize: type.micro.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
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
