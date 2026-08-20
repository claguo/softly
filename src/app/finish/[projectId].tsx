/**
 * Finish — the last screen a project ever gets, and the only one that is a
 * celebration.
 *
 * A modal, like Cast on and Add a yarn, because finishing is a decision with an
 * obvious way out. Everything above the button is the moment itself: an empty
 * 4/5 frame waiting for a photograph of the thing, one serif line, the project's
 * name, and whatever the cached row can honestly stamp underneath — how many
 * days it took, how much yarn went in, how many rows — with today's date below
 * them. Facts that cannot be stated are not drawn; most projects can only stamp
 * the date, and a screen with one true line on it is better than one with three
 * guesses.
 *
 * The photograph is optional and the two ways to get one are quiet, because
 * neither is the decision this screen is about. The camera asks the system for
 * permission the moment it is tapped; a refusal is an aqua line under the frame
 * and nothing else — no alert, no red, no second asking. See
 * `@/features/finish/photo`.
 *
 * The action at the bottom is the whole flow: `finishProject` uploads the
 * picture, marks the project finished, and brings the mirror level, reporting
 * rather than throwing. Three outcomes reach this screen and two of them leave
 * it. A finish that landed dismisses to the project, which now says Finished —
 * that screen reads its row live, so the badge turns over underneath this modal
 * rather than waiting for the knitter to back out and come in again; see
 * `useProject`. A
 * finish that landed *without* the photograph dismisses too: the project is
 * done, which is the thing that mattered, and the project screen showing no
 * photograph is a truer report than a modal lingering over a write that already
 * succeeded — a screen that stays up after a completed write is a screen
 * somebody taps twice. Only a finish that did not happen at all keeps the
 * knitter here, with a line under the button and the button still live.
 */

import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/auth/context";
import { BackBar } from "@/components/back-bar";
import { Button } from "@/components/ui/app-button";
import { PhotoFrame } from "@/components/ui/photo-frame";
import { Stamp } from "@/components/ui/stamp";
import { finishProject, getProjectById, type FinishProblem, type UploadFile } from "@/data";
import { parseRaw, readId } from "@/features/detail/raw";
import { projectFacts, stampedDate } from "@/features/finish/facts";
import { chooseFromLibrary, takePhoto } from "@/features/finish/photo";
import { fonts, space, trackSmall, type, useTheme } from "@/theme";

const NOTICES: Record<FinishProblem, string> = {
  failed: "Couldn't finish the project.",
  // Aqua, not mustard: nothing went wrong, the request simply never left — and
  // nothing was written, so the same tap works later.
  offline: "You're offline · try again later.",
  signedOut: "Sign in on the You tab to finish a project.",
};

/** Where the picture was going to come from, and what to say when it did not. */
type Source = "camera" | "library";

const PHOTO_NOTICES: Record<Source, Record<"denied" | "unavailable", string>> = {
  camera: {
    denied: "No camera access · allow it in Settings",
    unavailable: "The camera didn't open.",
  },
  library: {
    // Unreachable today — the library picker asks for nothing — but the pair is
    // stated so the day it does ask, there is a sentence for the answer.
    denied: "No photo access · allow it in Settings",
    unavailable: "The library didn't open.",
  },
};

export default function FinishScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { projectId: param } = useLocalSearchParams<"/finish/[projectId]">();

  const projectId = readId(param);
  const username = user?.username ?? null;

  // The mirror, like every other detail screen: the project is on the device
  // already, and this screen has no reason to be the first one that waits.
  const row = useMemo(
    () => (projectId === null ? null : getProjectById(projectId)),
    [projectId],
  );
  const raw = useMemo(() => parseRaw(row?.raw), [row]);

  // One reading of the clock for the life of the screen, so the stamped date
  // and the day count can never disagree about which day it is.
  const now = useMemo(() => new Date(), []);
  const facts = useMemo(() => projectFacts(raw, now), [now, raw]);

  const [file, setFile] = useState<UploadFile | null>(null);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<FinishProblem | null>(null);

  const name = row?.name ?? row?.patternName ?? "Untitled project";

  const pick = useCallback(
    (source: Source) => {
      if (busy) {
        return;
      }

      // Every attempt starts clean: the last refusal clears on retry.
      setPhotoNotice(null);

      void (async () => {
        const picked = source === "camera" ? await takePhoto() : await chooseFromLibrary();

        if (picked.kind === "picked") {
          // A second photograph replaces the first; only one goes up.
          setFile(picked.file);
          return;
        }

        // Backing out of the picker is not something to say anything about.
        if (picked.kind !== "canceled") {
          setPhotoNotice(PHOTO_NOTICES[source][picked.kind]);
        }
      })();
    },
    [busy],
  );

  const finish = useCallback(() => {
    if (busy || projectId === null) {
      return;
    }

    // Every attempt starts clean: the last failure clears on retry.
    setProblem(null);

    if (username === null) {
      setProblem("signedOut");
      return;
    }

    setBusy(true);

    void (async () => {
      // Reports rather than throws — the photograph, the status and the
      // refresh are all inside this one call. See `@/data/finish`.
      const outcome = await finishProject(username, projectId, file ?? undefined);

      setBusy(false);

      if (!outcome.ok) {
        setProblem(outcome.reason);
        return;
      }

      // `outcome.photoFailed` is deliberately not acted on here: see the head
      // of this file. The project is finished either way, and the screen this
      // lands on draws what Ravelry actually holds.
      //
      // `dismissTo` rather than `back`, for the same reason Cast on uses it:
      // the destination is a screen the knitter is returning to, and the modal
      // should be gone rather than underneath them.
      router.dismissTo({ pathname: "/project/[id]", params: { id: projectId } });
    })();
  }, [busy, file, projectId, username]);

  return (
    // No `SafeAreaView` top edge: on iOS this route is a sheet, already inset
    // from the status bar by the presentation itself. Android presents it
    // full-bleed, so it does need the inset.
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.paper,
          paddingTop: Platform.OS === "android" ? insets.top : 0,
        },
      ]}
    >
      <BackBar />

      {row === null ? (
        <Text style={[styles.unavailable, { color: colors.ink2 }]}>
          Project unavailable.
        </Text>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={[styles.photo, { borderBottomColor: colors.hairline }]}>
              <PhotoFrame src={file?.uri} label="the finished object" aspect="4/5" />
            </View>

            {/* Under the frame and quiet: the action at the bottom is the thing
                to do here, and a photograph is not the decision. */}
            <View style={styles.picks}>
              <View style={styles.actions}>
                <Button
                  variant="quiet"
                  size="sm"
                  disabled={busy}
                  accessibilityLabel={
                    file === null
                      ? "Take a photo of the finished project"
                      : "Take another photo of the finished project"
                  }
                  onPress={() => pick("camera")}
                >
                  {file === null ? "Take a photo" : "Retake"}
                </Button>
                <Button
                  variant="quiet"
                  size="sm"
                  disabled={busy}
                  accessibilityLabel={
                    file === null
                      ? "Choose a photo from your library"
                      : "Choose a different photo from your library"
                  }
                  onPress={() => pick("library")}
                >
                  {file === null ? "Choose from library" : "Choose another"}
                </Button>
              </View>

              {photoNotice === null ? null : (
                <Text style={[styles.notice, { color: colors.aqua }]}>{photoNotice}</Text>
              )}
            </View>

            <View style={styles.block}>
              <Text
                accessibilityRole="header"
                style={[styles.display, { color: colors.ink }]}
              >
                Off the needles.
              </Text>
              <Text style={[styles.name, { color: colors.ink2 }]}>{name}</Text>
            </View>

            <View style={[styles.block, styles.ruled, { borderTopColor: colors.hairline }]}>
              {facts.length === 0 ? null : (
                <View style={styles.facts}>
                  {facts.map((fact) => (
                    <Stamp key={fact.label} label={fact.label}>
                      {fact.value}
                    </Stamp>
                  ))}
                </View>
              )}

              <Text style={[styles.date, { color: colors.ink2 }]}>{stampedDate(now)}</Text>
            </View>
          </ScrollView>

          <View
            style={[
              styles.footer,
              {
                backgroundColor: colors.paper,
                borderTopColor: colors.hairline,
                paddingBottom: space.s4 + insets.bottom,
              },
            ]}
          >
            {busy ? (
              <Text style={[styles.stamp, { color: colors.ink2 }]}>Finishing…</Text>
            ) : problem === "signedOut" ? (
              <Text style={[styles.invitation, { color: colors.ink2 }]}>
                {NOTICES.signedOut}
              </Text>
            ) : problem !== null ? (
              <Text
                style={[
                  styles.stamp,
                  { color: problem === "offline" ? colors.aqua : colors.mustard },
                ]}
              >
                {NOTICES[problem]}
              </Text>
            ) : null}

            {/* The one action on this screen, and the last one this
                project will ever need. */}
            <Button
              variant="primary"
              size="lg"
              full
              disabled={busy}
              // One word on the button, the project's name in the ear: a
              // screen reader announcing "Finish" alone would not say which
              // sweater, and this is the one tap that cannot be taken back.
              accessibilityLabel={`Finish ${name}`}
              onPress={finish}
            >
              Finish
            </Button>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingBottom: space.s6 },
  photo: { borderBottomWidth: 1 },
  picks: {
    paddingHorizontal: space.s4,
    paddingTop: space.s3,
    gap: space.s1,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.s1,
    // The `sm` button's own 12pt of padding, pulled back, so the first label
    // starts on the block's own left edge rather than 12pt inside it.
    marginLeft: -12,
  },
  block: {
    paddingHorizontal: space.s4,
    paddingVertical: space.s5,
    gap: space.s2,
  },
  ruled: { borderTopWidth: 1 },
  display: {
    // The one place in the app that uses the display size the token was named
    // for. The leading is opened past `type.display`'s 37 the way every other
    // Yuji Mai line here is: the strokes clip at that tightness.
    fontFamily: fonts.display,
    fontSize: type.display.fontSize,
    lineHeight: 40,
  },
  name: {
    fontFamily: fonts.ui,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
  facts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.s4,
  },
  date: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
  },
  notice: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
  },
  footer: {
    paddingTop: space.s4,
    paddingHorizontal: space.s4,
    gap: space.s3,
    borderTopWidth: 1,
  },
  stamp: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
    textAlign: "center",
  },
  invitation: {
    fontFamily: fonts.ui,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    textAlign: "center",
  },
  unavailable: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
    textAlign: "center",
    paddingTop: space.s10,
    paddingHorizontal: space.s4,
  },
});
