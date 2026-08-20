/**
 * One project, whole.
 *
 * Everything on this screen is drawn from the device. The row arrived with the
 * last sync, so the title, the pattern and the status are on screen with no
 * wifi and no spinner — which is the point of keeping the mirror in the first
 * place — and the second half of the project is drawn from `project_details`,
 * which is the same promise one table over.
 *
 * That second table exists because `projects/list.json`, the endpoint the
 * mirror is built from, is a summary: no packs, no needle sizes, no notes, no
 * photographs. Which is to say the yarn a project ate, the needles it tied up
 * and the words the knitter wrote about it — most of what there is to know
 * about a finished thing — are on `/projects/{username}/{id}.json` and nowhere
 * else. So this screen asks for that on every focus and draws whatever came
 * back last time while it waits. See `@/data/project-detail`.
 *
 * A project that has never been fetched and cannot be now is the one case with
 * nothing to draw, and it gets one aqua line rather than a run of empty
 * headings. Every other absence is silent: a fact that cannot be stated is not
 * drawn — no zeroes, no dashes, no "unknown".
 *
 * The row is read live rather than once. Finishing is a write that lands
 * *underneath* this screen — the modal dismisses back onto a screen that never
 * unmounted — and a one-shot read would leave a finished sweater still badged
 * In progress until the knitter backed out and came in again.
 *
 * The one thing that can appear here without a sync is "Open pattern", and
 * only when the pattern's PDF is already on the device — often because casting
 * on fetched it a moment ago, which is why it is read from a live store rather
 * than once on mount. When there is no PDF this screen says nothing about it:
 * acquiring one belongs to the pattern screen, and a project in progress is
 * not the place to be offered errands.
 *
 * This screen had no action on it for a long time, which was right while the
 * only things to do here were reading. Finishing changes that: it is the one
 * decision a project screen exists to offer, and it is offered exactly once —
 * a project already marked Finished has no action on it again. It sits directly
 * under the title rather than under the record below it, because the record is
 * now long enough to put the screen's only decision two scrolls down.
 */

import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { useAuth } from "@/auth/context";
import { BackBar } from "@/components/back-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/app-button";
import { NeedleRow } from "@/components/ui/needle-row";
import { PhotoFrame } from "@/components/ui/photo-frame";
import { Stamp } from "@/components/ui/stamp";
import { formatRelative } from "@/components/ui/sync-notice";
import {
  ensurePatternPhoto,
  ensureProjectDetail,
  getPatternPhoto,
  getStashById,
  tintFor,
  usePatternPdf,
  useProject,
  useProjectDetail,
} from "@/data";
import {
  projectNeedles,
  projectPhotos,
  projectSpecs,
  projectTags,
  projectYarn,
} from "@/features/detail/project";
import { ProjectYarnRow } from "@/features/detail/project-rows";
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
  const { user } = useAuth();
  const username = user?.username ?? null;

  // Both live, and for two different reasons: the mirror row is rewritten by
  // the Finish modal sitting on top of this screen, and the detail lands a
  // beat after the screen opens. See the head of this file.
  const row = useProject(id);
  const detail = useProjectDetail(id);

  const summary = useMemo(() => parseRaw(row?.raw), [row]);
  const full = useMemo(() => parseRaw(detail?.raw), [detail]);

  // The same project twice, one of them fuller. Anything both carry is read
  // off the detail, so a field the knitter changed on ravelry.com an hour ago
  // is not overwritten by a mirror row from last week's sync.
  const raw = full ?? summary;

  /**
   * The rest of the project, asked for on every focus.
   *
   * On focus rather than on mount, because the screen this returns to after
   * finishing never unmounted — the photograph that just went up and the
   * status that just changed are both in the answer.
   */
  const [detailUnavailable, setDetailUnavailable] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let live = true;

      void ensureProjectDetail(username, id).then((held) => {
        if (live) {
          setDetailUnavailable(!held);
        }
      });

      return () => {
        live = false;
      };
    }, [id, username]),
  );

  const needles = useMemo(() => projectNeedles(full), [full]);
  const photos = useMemo(() => projectPhotos(full), [full]);
  const specs = useMemo(() => projectSpecs(raw), [raw]);
  const tags = useMemo(() => projectTags(raw), [raw]);

  /**
   * The packs, with what this device already knows about each skein.
   *
   * A pack carries no photograph and no colour beyond Ravelry's twenty
   * families — but the stash entry behind it does, because `yarn-photos.ts`
   * fetched the catalogue shot and `yarn-colors.ts` kept whatever shade the
   * knitter matched by eye. Both are one synchronous read away and neither is
   * worth a screen of its own to find. A pack whose stash entry is not in this
   * account's mirror — yarn used up and cleared out years ago — simply falls
   * back to the family swatch.
   */
  const yarn = useMemo(
    () =>
      projectYarn(full).map((pack) => {
        const skein = pack.stashId === null ? null : getStashById(pack.stashId);

        return {
          ...pack,
          photo: skein?.photoUrl ?? undefined,
          tint: tintFor(skein?.colorHex, skein?.colorFamilyId ?? pack.colorFamilyId),
        };
      }),
    [full],
  );

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

  // A knitter's own notes, public and private, as the markdown they typed and
  // as Ravelry's own rendering of it. Both are on the detail and neither is on
  // the list endpoint, so these are empty until it lands — `notes_html` is read
  // first either way, because it is the one Ravelry has already made sense of.
  const notesHtml = firstString(raw, [["notes_html"]]);
  const notesMarkdown = firstString(raw, [["notes"]]);
  const privateHtml = firstString(raw, [["private_notes_html"]]);
  const privateMarkdown = firstString(raw, [["private_notes"]]);
  const touched = row?.updatedAtRemote ?? null;

  /**
   * The pattern's photograph, for the very common project that has none.
   *
   * Seeded synchronously from what the device already knows, so a bookmarked
   * pattern draws on the first frame with no flicker and no network — the
   * whole photo object is sitting in `favorites.raw`. The effect below only
   * has anything to do when the pattern was never bookmarked, and then it is
   * one fetch, kept forever after. See `pattern-photos.ts`.
   */
  const needsPatternPhoto = row !== null && row.photoUrl === null;

  const [patternPhoto, setPatternPhoto] = useState<string | null>(() =>
    getPatternPhoto(patternId),
  );

  useEffect(() => {
    if (!needsPatternPhoto || patternId === null) {
      return;
    }

    let live = true;

    void ensurePatternPhoto(patternId).then((url) => {
      if (live && url !== null) {
        setPatternPhoto(url);
      }
    });

    return () => {
      live = false;
    };
  }, [needsPatternPhoto, patternId]);

  // Null for a project with no linked pattern, and for a linked one whose PDF
  // is not on the phone — the same silence either way.
  const pdf = usePatternPdf(patternId);

  const name = row?.name ?? row?.patternName ?? "Untitled project";

  // Off the detail before the mirror, like everything else above — and this is
  // the field most worth taking from the fresher of the two, because it is the
  // one that decides whether the screen still offers to finish anything.
  const status = firstString(raw, [["status_name"]]) ?? row?.status ?? null;
  const finished = isFinished(status);

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.screen, { backgroundColor: colors.paper }]}
    >
      <BackBar />

      {row === null ? (
        <Text style={[styles.stamp, { color: colors.ink2 }]}>
          Project unavailable.
        </Text>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: space.s10 + insets.bottom }}
        >
          <View style={[styles.photo, { borderBottomColor: colors.hairline }]}>
            {/* The knitter's own photograph if there is one, and the pattern's
                if there is not. Labelled for what it actually is either way —
                a stock shot of somebody else's finished object should never be
                announced as this project's, least of all to a screen reader.
                See `pattern-photos.ts`; stripes remain for a project with no
                pattern behind it, which has nothing to borrow. */}
            <PhotoFrame
              src={row.photoUrl ?? patternPhoto ?? undefined}
              label={
                row.photoUrl === null && patternPhoto !== null
                  ? "pattern photo"
                  : "project photo"
              }
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
                  // title. It stays ink — the one action on a screen is a
                  // decision, and following a link is not one.
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

            {/* Directly under the pattern it belongs to, and quiet: the action
                on this screen is finishing, and opening a document is not a
                decision. */}
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

            {status ? (
              <View style={styles.marks}>
                {/* Spruce only for done. It is the system's colour for
                    committed and complete, and this is the one status that is
                    either — everything else a project can be is neutral. */}
                <Badge tone={finished ? "committed" : "neutral"}>{status}</Badge>
              </View>
            ) : null}

            {touched !== null ? (
              <Text style={[styles.touched, { color: colors.ink2 }]}>
                updated {formatRelative(touched)}
              </Text>
            ) : null}
          </View>

          {/* The one action on this screen: directly under the title, above
              the whole record, and only while there is still something to
              decide. It used to sit below everything there was to know about
              the project, which was fair while that was a badge and a date —
              the yarn, the needles and the numbers now underneath it would put
              the screen's only decision two scrolls down. A project that is
              already finished has nothing left to do here. */}
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

          {/* The record: what the project ate, what it tied up, and every
              number Ravelry holds about it. All of it is drawn from the
              device, and each section is simply absent for a project that has
              none of that — an empty heading is a worse answer than silence. */}
          {yarn.length > 0 ? (
            <View
              style={[styles.section, styles.ruled, { borderTopColor: colors.hairline }]}
            >
              <Text style={[styles.sectionLabel, styles.inset, { color: colors.ink2 }]}>
                Yarn
              </Text>
              {yarn.map((pack) => (
                <ProjectYarnRow
                  key={pack.key}
                  title={pack.title}
                  brand={pack.brand ?? undefined}
                  weight={pack.weight ?? undefined}
                  used={pack.used ?? undefined}
                  skeins={pack.skeins ?? undefined}
                  note={pack.note ?? undefined}
                  photo={pack.photo}
                  tint={pack.tint}
                />
              ))}
            </View>
          ) : null}

          {needles.length > 0 ? (
            <View
              style={[styles.section, styles.ruled, { borderTopColor: colors.hairline }]}
            >
              <Text style={[styles.sectionLabel, styles.inset, { color: colors.ink2 }]}>
                Needles
              </Text>
              {/* No `onPress`: these are the sizes written on the project, not
                  the drawer — the needle they name may not be in it at all. */}
              {needles.map((needle) => (
                <NeedleRow
                  key={needle.key}
                  size={needle.size}
                  us={needle.us ?? undefined}
                  kind={needle.kind}
                />
              ))}
            </View>
          ) : null}

          {specs.length > 0 || tags.length > 0 ? (
            <View
              style={[styles.block, styles.ruled, { borderTopColor: colors.hairline }]}
            >
              <Text style={[styles.sectionLabel, { color: colors.ink2 }]}>Details</Text>

              {specs.length > 0 ? (
                <View style={styles.facts}>
                  {specs.map((spec) => (
                    <Stamp key={spec.label} label={spec.label}>
                      {spec.value}
                    </Stamp>
                  ))}
                </View>
              ) : null}

              {tags.length > 0 ? (
                <View style={styles.marks}>
                  {tags.map((tag) => (
                    <Badge key={tag}>{tag}</Badge>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {photos.length > 1 ? (
            <View
              style={[styles.section, styles.ruled, { borderTopColor: colors.hairline }]}
            >
              <Text style={[styles.sectionLabel, styles.inset, { color: colors.ink2 }]}>
                Photos
              </Text>
              {/* The first of these is already the frame at the top of the
                  screen. It stays in the strip anyway: a gallery that silently
                  drops its first picture reads as a missing one. */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.strip}
              >
                {photos.map((url) => (
                  <PhotoFrame
                    key={url}
                    src={url}
                    label="project photo"
                    width={96}
                    aspect="1/1"
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          {hasNotes(notesHtml, notesMarkdown) ? (
            <View
              style={[styles.block, styles.ruled, { borderTopColor: colors.hairline }]}
            >
              <Text style={[styles.sectionLabel, { color: colors.ink2 }]}>Notes</Text>
              <RichText html={notesHtml} markdown={notesMarkdown} />
            </View>
          ) : null}

          {hasNotes(privateHtml, privateMarkdown) ? (
            <View
              style={[styles.block, styles.ruled, { borderTopColor: colors.hairline }]}
            >
              {/* Named for what it is. These are the knitter's own notes to
                  themselves and nobody on ravelry.com can read them, which is
                  worth saying on the one screen that shows them. */}
              <Text style={[styles.sectionLabel, { color: colors.ink2 }]}>
                Private notes
              </Text>
              <RichText html={privateHtml} markdown={privateMarkdown} />
            </View>
          ) : null}

          {/* A project this device has never fetched and cannot fetch now:
              one line rather than a run of empty headings. The two reasons are
              kept apart the way the Finish modal keeps them apart — aqua for a
              request that could not leave the phone, and plain ink for the one
              thing the knitter can actually do something about. */}
          {detailUnavailable && full === null ? (
            <View
              style={[styles.block, styles.ruled, { borderTopColor: colors.hairline }]}
            >
              {username === null ? (
                <Text style={[styles.source, { color: colors.ink2 }]}>
                  Sign in on the You tab to see this project&rsquo;s yarn and needles.
                </Text>
              ) : (
                <Text style={[styles.touched, { color: colors.aqua }]}>
                  Yarn and needles unavailable · check connection
                </Text>
              )}
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
  /**
   * A block whose contents draw their own edges. The rows in these sections
   * carry a hairline the full width of the screen, so the padding that would
   * inset them is moved onto the heading instead — see `inset`.
   */
  section: {
    paddingVertical: space.s5,
    gap: space.s2,
  },
  inset: { paddingHorizontal: space.s4 },
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
  /** The same wrapping strip of stamps the Finish screen draws its facts in. */
  facts: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: space.s3,
    columnGap: space.s4,
  },
  strip: {
    flexDirection: "row",
    gap: space.s2,
    paddingHorizontal: space.s4,
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
