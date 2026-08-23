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
 * only things to do here were reading. Three have arrived since, and they are
 * deliberately not the same shape.
 *
 * Where a project has got to lives behind the status chip itself. The badge
 * under the title was already the sentence — In progress, Hibernating, Frogged,
 * Finished — so it is also the way to change it: one chevron on the stamp, a
 * short menu under it, and three of the four rows write a single field in
 * place. On iOS that menu is the system's own pull-down, checkmark and all,
 * because the phone already has a better one of these than this app could draw;
 * the drawn card is kept for Android, where SwiftUI does not go. Finished is
 * the fourth row and the exception. It is the one status worth a
 * screen, because a finish carries a photograph and a date that nothing else
 * does, so that row opens the modal the filled button used to.
 *
 * Every project with an id has that chevron, a finished one included. It did
 * not use to: the rule was that a done project is offered nothing, and it
 * outlived the button that first said so. The rule is retired now, deliberately
 * and at the knitter's asking, because knitters change their minds — a sweater
 * comes back onto the needles for another inch of sleeve, a status is tapped by
 * mistake on the bus — and there was no way back out of Finished anywhere in
 * this app. Finished is a state like the others rather than a door that locks
 * behind you, and the way out is the same menu that led in: choosing In
 * progress from a Finished chip is the whole of un-finishing a project.
 *
 * "Edit" in the bar is the second, and it sits up in the chrome rather than
 * down in the record because it is about the record as a whole and not any one
 * part of it — the name, who the thing was made for, the size it came out at,
 * and both sets of notes. It is also the only way to a project's delete, which
 * belongs on a sheet where it can be asked about twice rather than on a screen
 * somebody is scrolling. See `edit-project`.
 *
 * Which leaves "Open pattern", above, as the screen's working button. It is
 * drawn as one now — a bordered rectangle at full size rather than a line of
 * link-coloured text — because with the finish gone it is the only thing here
 * anybody sets out to tap. Bordered and not filled: the filled rectangle is
 * reserved for the control that commits, and opening a document commits
 * nothing.
 */

import { Host, Menu, RNHostView, Toggle } from "@expo/ui/swift-ui";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
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
  adjustRowCounter,
  ensurePatternPhoto,
  ensureProjectDetail,
  getPatternPhoto,
  getStashById,
  PROJECT_STATUS_FINISHED,
  PROJECT_STATUSES,
  setProjectStatus,
  tintFor,
  usePatternPdf,
  useProject,
  useProjectDetail,
  useRowCounters,
  type FinishProblem,
} from "@/data";
import { CounterRow } from "@/features/counters/rows";
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
import { haptics } from "@/haptics";
import { fonts, radius, space, tap, trackSmall, type, useTheme } from "@/theme";

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

/**
 * What to say when a status did not move, in the Finish screen's own words.
 *
 * The same three sentences, the same three colours, differing only in the noun
 * — this is a smaller write than a finish and it fails in exactly the same
 * three ways, so it should not have invented a second vocabulary for them.
 */
const STATUS_NOTICES: Record<FinishProblem, string> = {
  failed: "Couldn't change the status.",
  // Aqua, not mustard: nothing went wrong, the request simply never left — and
  // nothing was written, so the same tap works later.
  offline: "You're offline · try again later.",
  signedOut: "Sign in on the Stash tab to change this project's status.",
};

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

  // The app's own, and live for a third reason again: these are written by the
  // steppers on this very screen, and `row-counters.ts` wakes them
  // synchronously so a tap redraws on the next frame rather than an eighth of
  // a second later. Empty for a project nobody has counted rows on.
  const counters = useRowCounters(id);

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

  /**
   * The status menu: whether it is down, whether a row is in flight, and what
   * to say if one did not land.
   *
   * All three are the screen's own and none of them outlive it. A knitter who
   * leaves with the menu open comes back to a chip, which is right — the menu
   * is a question being asked, not a place.
   */
  const [menuOpen, setMenuOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [statusProblem, setStatusProblem] = useState<FinishProblem | null>(null);

  /**
   * One row of the menu, pressed.
   *
   * Three outcomes and they are genuinely different things. The status the
   * project is already in is not a write at all, so it closes the menu and says
   * nothing. Finished opens the modal, because a finish is a photograph and a
   * date and this row cannot take either. Everything else is the small write:
   * one field, straight out.
   *
   * `setMenuOpen` here only ever governs the drawn card, which is Android's.
   * On iOS the system's pull-down has already dismissed itself by the time any
   * of this runs, and the calls below are a no-op on a flag nothing reads.
   */
  const choose = useCallback(
    async (statusId: number) => {
      if (id === null || changing) {
        return;
      }

      if (statusId === PROJECT_STATUS_FINISHED) {
        setMenuOpen(false);
        router.push({
          pathname: "/finish/[projectId]",
          params: { projectId: id },
        });
        return;
      }

      if (username === null) {
        // Nothing is attempted: a write with no account behind it fails at the
        // client, and saying so here costs no round trip.
        setStatusProblem("signedOut");
        haptics.error();
        return;
      }

      setChanging(true);
      setStatusProblem(null);

      const outcome = await setProjectStatus(username, id, statusId);

      if (!outcome.ok) {
        setChanging(false);
        // The card stays down where there is a card. The tap did not take, and
        // closing the thing the knitter just used would leave the notice
        // explaining a control that is no longer on screen. On iOS the notice
        // is the only thing left standing either way, which is why it was
        // moved out from under the rows and up under the chip.
        setStatusProblem(outcome.reason);
        haptics.error();
        return;
      }

      // A second refresh, and not a redundant one. `setProjectStatus` brings
      // the mirror level, but `project_details` carries its own `status_name`
      // and this screen reads that one first — without this the chip would keep
      // saying the old word until the next time the screen was focused.
      await ensureProjectDetail(username, id);

      haptics.success();
      setChanging(false);
      setMenuOpen(false);
    },
    [changing, id, username],
  );

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
                  pathname: "/edit-project",
                  params: { id: String(id) },
                })
        }
      />

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
                  onPress={() => {
                    haptics.tap();
                    router.push({
                      pathname: "/pattern/[id]",
                      params: { id: patternId },
                    });
                  }}
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

            {/* Where the project got to and when anybody last touched it are
                two halves of the same sentence, so they are given one line and
                its two ends rather than a row each. */}
            {status || touched !== null ? (
              <View style={styles.statusRow}>
                {/* Spruce only for done. It is the system's colour for
                    committed and complete, and this is the one status that is
                    either — everything else a project can be is neutral.

                    A finished chip wears the chevron like every other one. The
                    tone says where the project got to; the chevron says the
                    knitter is still allowed to change their mind about it, and
                    a spruce stamp that could not be tapped was this app telling
                    somebody their sweater was somebody else's now. The
                    disclosure inherits the tone's own foreground, so the
                    finished chip is still one colour and not two.

                    The plain badge is left for the one case with nothing to
                    write to: a screen with no id at all. */}
                {status ? (
                  id === null ? (
                    <Badge tone={finished ? "committed" : "neutral"}>{status}</Badge>
                  ) : Platform.OS === "ios" ? (
                    // No `colorScheme` on the Host on purpose: this app's theme
                    // reads `useColorScheme()` and pins nothing, so SwiftUI is
                    // already looking at the same switch. Passing one could only
                    // repeat the system, or contradict it a frame late.
                    <Host matchContents>
                      <Menu
                        label={
                          <RNHostView matchContents>
                            <View
                              accessibilityRole="button"
                              accessibilityLabel={`Status: ${status}`}
                              accessibilityHint="Changes this project's status"
                              // The system owns the tap now, so there is no
                              // Pressable to hang slop off. The padding is
                              // handed straight back by the margin instead: the
                              // chip is the same 26pt stamp on screen and a
                              // 48pt target to a finger.
                              style={styles.trigger}
                            >
                              <Badge
                                tone={finished ? "committed" : "neutral"}
                                disclosure
                              >
                                {status}
                              </Badge>
                            </View>
                          </RNHostView>
                        }
                      >
                        {PROJECT_STATUSES.map((entry) => {
                          const current =
                            status.trim().toLowerCase() === entry.label.toLowerCase();

                          return (
                            <Toggle
                              key={entry.id}
                              label={entry.label}
                              // A checkmark, drawn by iOS rather than by us —
                              // the toggle is on for the one row the project is
                              // already on, which is how every pull-down on the
                              // phone says the same thing.
                              isOn={current}
                              onIsOnChange={() => {
                                // The row the project is already on writes
                                // nothing. The menu closes itself, which is the
                                // whole of what a tap that confirms should do.
                                if (!current) {
                                  void choose(entry.id);
                                }
                              }}
                            />
                          );
                        })}
                      </Menu>
                    </Host>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Status: ${status}`}
                      accessibilityHint="Changes this project's status"
                      accessibilityState={{ expanded: menuOpen }}
                      onPress={() => {
                        haptics.tap();
                        if (!menuOpen) {
                          // A notice explains the last tap, not the next one.
                          setStatusProblem(null);
                        }
                        setMenuOpen(!menuOpen);
                      }}
                      // The chip is a 26pt stamp; the slop restores the 48pt
                      // hit box without drawing a control-sized box around it,
                      // the same way the pattern link above does.
                      hitSlop={{ top: 11, bottom: 11, left: 8, right: 8 }}
                      // The chip already sits on the sunk field, so there is no
                      // darker ground left to press it into. A dip is the whole
                      // feedback, and it is the same one the system gives.
                      style={({ pressed }) => (pressed ? styles.pressed : null)}
                    >
                      <Badge tone={finished ? "committed" : "neutral"} disclosure>
                        {status}
                      </Badge>
                    </Pressable>
                  )
                ) : null}

                {touched !== null ? (
                  <Text
                    style={[styles.touched, styles.statusStamp, { color: colors.ink2 }]}
                  >
                    updated {formatRelative(touched)}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {/* Stamped under the chip, in the Finish screen's words and the
                Finish screen's colours — see `STATUS_NOTICES`. It lives out
                here rather than inside the card because on iOS there is no
                card: the system's menu closes itself the instant a row is
                tapped, and the answer to that tap has to land somewhere that
                outlives it. */}
            {changing ? (
              <Text style={[styles.notice, { color: colors.ink2 }]}>
                Changing status…
              </Text>
            ) : statusProblem !== null ? (
              <Text
                style={[
                  styles.notice,
                  {
                    color:
                      statusProblem === "offline"
                        ? colors.aqua
                        : statusProblem === "failed"
                          ? colors.mustard
                          : colors.ink2,
                  },
                ]}
              >
                {STATUS_NOTICES[statusProblem]}
              </Text>
            ) : null}

            {/* Where the project goes next used to be a filled button under
                the title. It is this now: a chevron on the stamp that already
                said where the project had got to, and four rows under it.

                Changing a status is a small thing — a project goes into a bag
                for the winter, or comes out of one, or comes back off the shelf
                a month after it was called done — and a small thing does not
                want a control the size of a commitment. Finishing is the one
                version of it that does, because a finish carries a photograph
                and a completion date and neither of those fits on a menu row.
                So Finished is the single row here that opens a screen instead
                of writing in place, and the modal it opens is the same one the
                button used to.

                On iOS the menu is the system's own. The chip hangs a real
                UIMenu off itself, so the rows arrive in the platform's
                typeface, at the platform's size, with the platform's checkmark
                against the status the project is already in — the same
                pull-down every other app on the phone opens, which is a better
                menu than one drawn by hand could be and is not this app's to
                style. Everything below is what remains for where SwiftUI does
                not reach: Android keeps the drawn card, the same four rows in
                the same order writing the same field.

                Every direction through it is open on both, including back out
                of Finished — the row for the status the project is already in
                is the one that writes nothing, and Finished can only be reached
                from somewhere else, so the modal is never opened over a project
                that has already been through it.

                A project with no status at all has no chip, and so no way in.
                That is accepted rather than worked around: a fact that cannot
                be stated is not drawn, and every row that has ever been synced
                carries `status_name`. */}
            {Platform.OS !== "ios" && menuOpen && id !== null ? (
              <View
                style={[
                  styles.menu,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.hairlineStrong,
                  },
                ]}
              >
                {PROJECT_STATUSES.map((entry, index) => {
                  const current =
                    status !== null &&
                    status.trim().toLowerCase() === entry.label.toLowerCase();

                  return (
                    <Pressable
                      key={entry.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: current, disabled: changing }}
                      disabled={changing}
                      onPress={() => {
                        haptics.tap();

                        if (current) {
                          // Already there. The menu closes and nothing is
                          // written — a tap that confirms is not a change.
                          setMenuOpen(false);
                          return;
                        }

                        void choose(entry.id);
                      }}
                      style={({ pressed }) => [
                        styles.menuRow,
                        // Counted rather than styled once: the last row's
                        // hairline would have nothing under it to separate,
                        // and would double with the card's own bottom edge.
                        index < PROJECT_STATUSES.length - 1
                          ? {
                              borderBottomWidth: 1,
                              borderBottomColor: colors.hairline,
                            }
                          : null,
                        pressed ? { backgroundColor: colors.surfaceSunk } : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.menuLabel,
                          current
                            ? { fontFamily: fonts.uiMedium, color: colors.ink }
                            : { color: colors.ink2 },
                        ]}
                      >
                        {entry.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {/* Last in the block, and under the status line rather than tucked
                up against the pattern it names: the lines above are the record
                saying where the project is and when it moved, and this is the
                one thing on the screen anybody sets out to do. Drawn as a real
                control now that nothing else here is one. It was a line of
                quiet text while the filled Finish button sat below it and every
                other tappable thing had to stay out of that button's way; with
                the finish moved into the status menu, this is what somebody
                actually came to tap on a project they are in the middle of, and
                it should look like it. Bordered rather than filled all the
                same — the filled rectangle belongs to the one control on a
                screen that commits, and opening a document commits nothing. */}
            {pdf !== null && patternId !== null ? (
              <View style={styles.action}>
                <Button
                  variant="secondary"
                  size="md"
                  full
                  accessibilityLabel={`Open the pattern PDF${patternName ? ` for ${patternName}` : ""}`}
                  onPress={() =>
                    router.push({
                      pathname: "/pdf/[patternId]",
                      // The project rides along beside the pattern the route is
                      // keyed by, so the reader can float *this* project's row
                      // counters over the page rather than working out from a
                      // pattern id which project the knitter meant. Empty for a
                      // screen that somehow has no id, which the reader reads
                      // as none given and falls back from.
                      params: {
                        patternId,
                        name: patternName ?? "",
                        projectId: id ?? "",
                      },
                    })
                  }
                >
                  Open pattern
                </Button>
              </View>
            ) : null}
          </View>

          {/* Where the project has got to, and the first thing in the record
              because it is the only part of it that changes while the knitter
              is holding the phone. Everything below is what the project *is*;
              this is what it is in the middle of.

              It is the one section that draws itself empty, and deliberately —
              silence is right for a fact that cannot be stated, and "no
              counters yet" is not a fact about the project, it is an offer.
              So an unfinished project always has the heading and the way to
              add one, and a finished project keeps whatever counters it ended
              with and is offered no more — until it is taken back off the
              shelf, which the status menu above now allows, and it is an
              unfinished project again with the heading and the offer back.

              The steppers stay quiet, and there is nothing louder on the screen
              for them to be quiet against — counting is working state rather
              than a decision, and the one decision here is the status menu up
              in the title block, which is quieter still. */}
          {id !== null && (!finished || counters.length > 0) ? (
            <View
              style={[styles.section, styles.ruled, { borderTopColor: colors.hairline }]}
            >
              <View style={[styles.counterHead, styles.inset]}>
                <Text style={[styles.sectionLabel, { color: colors.ink2 }]}>
                  Row counters
                </Text>
                {!finished ? (
                  <View style={styles.headAction}>
                    <Button
                      variant="quiet"
                      size="sm"
                      accessibilityLabel={`Add a row counter to ${name}`}
                      onPress={() =>
                        router.push({
                          pathname: "/add-row-counter",
                          params: { projectId: id },
                        })
                      }
                    >
                      Add
                    </Button>
                  </View>
                ) : null}
              </View>

              {/* `ruled` here and on the two sections below: a hairline is a
                  separator, so it lives only between rows. The last row of
                  every section ends clean — the next section opens with a rule
                  of its own, and two lines saying one boundary is one line too
                  many. The status menu above and the filter sheet already count
                  their last row out this way; the record now reads the same. */}
              {counters.map((counter, index) => (
                <CounterRow
                  key={counter.id}
                  counter={counter}
                  ruled={index < counters.length - 1}
                  onAdjust={(delta) => adjustRowCounter(counter.id, delta)}
                  onOpen={() =>
                    router.push({
                      pathname: "/edit-row-counter",
                      params: { id: counter.id },
                    })
                  }
                />
              ))}
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
              {yarn.map((pack, index) => (
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
                  ruled={index < yarn.length - 1}
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
              {needles.map((needle, index) => (
                <NeedleRow
                  key={needle.key}
                  size={needle.size}
                  us={needle.us ?? undefined}
                  kind={needle.kind}
                  ruled={index < needles.length - 1}
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
                  Sign in on the Stash tab to see this project&rsquo;s yarn and needles.
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
  /** The chip's own dip while it is held. See the note where it is used. */
  pressed: { opacity: 0.6 },
  /**
   * The status menu where SwiftUI does not reach: a bordered card and nothing
   * else. iOS hangs the system's own pull-down off the chip and never draws
   * this.
   *
   * No shadow — the system is made of hairlines, and a floating panel would be
   * the only lifted surface in the app. It stretches to the block rather than
   * hanging off the chip's width, because four statuses of four different
   * lengths in a box measured to the shortest of them is a ragged little
   * object, and the block's edges are already the screen's margins.
   */
  menu: {
    alignSelf: "stretch",
    marginTop: space.s2,
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  menuRow: {
    minHeight: tap.min,
    paddingHorizontal: space.s3,
    justifyContent: "center",
  },
  menuLabel: {
    fontFamily: fonts.ui,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
  /**
   * Stamped, and set flush.
   *
   * It carried an inset of its own while it lived inside the card, measured to
   * the menu's rows so it would line up under them. It stands in the block now
   * — under the chip, on every platform, because the system's menu takes
   * itself away and the answer to a tap cannot go with it — and the block
   * already holds both edges: its margins set the left, its gap sets the space
   * above. Padding here would only be the same two measurements counted twice.
   */
  notice: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
  },
  /**
   * The status chip at one end of a line and the "updated" stamp at the other,
   * centred against each other because a 26pt chip and an 18pt line of text
   * share nothing else. Deliberately not `marks`: that strip wraps, which is
   * right for a run of tags and wrong for a pair that belongs on one row.
   */
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  /**
   * The chip with the system's own menu hanging off it.
   *
   * There is no Pressable in that branch to carry `hitSlop`, so the target is
   * built the other way round: padding the badge does not fill, and a negative
   * margin that hands the space straight back to the row. 26pt drawn, 48pt to
   * a finger, and the rhythm above and below it unchanged.
   */
  trigger: {
    paddingVertical: 11,
    marginVertical: -11,
  },
  /**
   * Four on top of the block's own gap. The lines above are the record's
   * chrome and this is the one working control under them, and the little
   * extra air is what says so.
   */
  action: {
    marginTop: 4,
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
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
  },
  /**
   * Carried to the far end of its row by its own margin rather than by the
   * row's justification, so it still lands right on a project that has no
   * status chip to sit opposite. It is also the half that gives way if the two
   * ever grow long enough to meet.
   */
  statusStamp: {
    marginLeft: "auto",
    flexShrink: 1,
  },
  sectionLabel: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
  },
  /**
   * The one section heading with something to do beside it.
   *
   * The `sm` button is 40pt tall against an 18pt line of stamped label, so the
   * negative margin gives back exactly the 22 it added and the heading sits
   * where every other section heading on this screen sits.
   */
  counterHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: (type.small.lineHeight - 40) / 2,
  },
  /**
   * The `sm` button's own 12pt of padding, pulled back off the right, so its
   * label ends on the same rule the heading starts on.
   */
  headAction: { marginRight: -12 },
  stamp: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
    textAlign: "center",
    paddingTop: space.s10,
    paddingHorizontal: space.s4,
  },
});
