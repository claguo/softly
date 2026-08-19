/**
 * Start project — the one screen in the app that casts on.
 *
 * A modal, because casting on is a decision with an obvious way out, and one
 * scroll, because there are only three things to say: what to call it, which
 * yarn it eats, and which needles it ties up. All three are optional except
 * the name, and the name arrives already filled in with the pattern's, so the
 * shortest honest path through this screen is one tap on the brass.
 *
 * Yarn and needles come from the local mirror, so the lists are right on the
 * first frame with no network. Two quiet rows widen them past what the mirror
 * holds, and neither costs anything until it is opened:
 *
 * - **Add a yarn** hands off to a sheet of its own, which searches Ravelry's
 *   yarn database or takes a name typed by hand and writes a real stash entry.
 *   That sheet is where the second brass button in this flow lives, because
 *   there it is the only thing to do. It comes back with the skein it made
 *   already chosen here — see `pending-selection` for the whole protocol.
 * - **All sizes** opens Ravelry's whole needle size table, inline, because
 *   there is nothing to write behind it — the needle inventory has no create
 *   endpoint — so a size chosen there goes into the project and nowhere else,
 *   and the row says so.
 * - **Add a needle** is the other half of that sentence, and it does leave.
 *   Ravelry will not be told about a new needle, so the sheet writes one into
 *   this app's own drawer, where it is a needle like any other — it comes back
 *   already chosen here, and it is in the list the next time this screen
 *   opens, drawn no differently from the rest.
 *
 * Needle selection is keyed by millimetres rather than by row, because the
 * drawer and the size table are two ways of naming the same needle and a
 * project records a size. Choosing 4.5 mm in either place is the same choice.
 *
 * Nothing here opens a dialog. A request in flight is a stamped line under the
 * button it belongs to, a failure is a quieter one, and both clear the moment
 * it is tried again.
 */

import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/auth/context";
import { BackBar } from "@/components/back-bar";
import { Button } from "@/components/ui/app-button";
import { TextField } from "@/components/ui/text-field";
import {
  craftId,
  createProject,
  ensurePatternPdf,
  getNeedleSizes,
  getProjectById,
  PROJECT_STATUS_IN_PROGRESS,
  refreshProjects,
  useNeedles,
  useStash,
  type NeedleListRow,
  type RavelryNeedleSize,
  type StashListRow,
} from "@/data";
import { readId, readParam } from "@/features/detail/raw";
import {
  needleSizeIds,
  sizeKey,
  sizeOptions,
} from "@/features/start-project/needle-sizes";
import {
  consumePendingNeedleSelection,
  consumePendingStashSelection,
  pendingStashSelection,
} from "@/features/start-project/pending-selection";
import { triage, type Problem } from "@/features/start-project/problem";
import {
  AddRow,
  NeedleChoice,
  SizeGrid,
  YarnChoice,
} from "@/features/start-project/rows";
import { fonts, space, trackMicro, type, useTheme } from "@/theme";

const NOTICES: Record<Problem, string> = {
  failed: "Couldn't start the project.",
  // Slate, not clay: nothing went wrong, the request simply never left.
  offline: "You're offline · try again later.",
  signedOut: "Sign in on the You tab to start a project.",
};

/**
 * One list, a handful of row shapes: tagged so the renderer never has to
 * guess.
 *
 * The size table is a row in this same list rather than a screen over it,
 * because there is nothing behind it to commit to — it is the drawer, opened
 * wider, and the knitter is still in the middle of one decision. Adding a yarn
 * or a needle is the other kind of thing, and both left.
 */
type Choice =
  // Yarn
  | { kind: "yarn"; yarn: StashListRow }
  | { kind: "addYarn" }
  // Needles
  | { kind: "needle"; needle: NeedleListRow }
  | { kind: "allSizes" }
  | { kind: "sizeGrid" }
  | { kind: "addNeedle" }
  // Either
  | { kind: "empty"; line: string };

type ChoiceSection = { title: string; data: Choice[] };

/** Today where the knitter is, in the `YYYY-MM-DD` Ravelry wants. */
function today(): string {
  const now = new Date();
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export default function StartProjectScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = useLocalSearchParams();
  const { data: yarn } = useStash();
  const { data: needles } = useNeedles();

  const username = user?.username ?? null;
  const patternId = readId(params.patternId);
  const patternName = readParam(params.patternName) ?? "New project";
  const craft = craftId(readParam(params.craft));

  const [name, setName] = useState(patternName);
  const [yarnId, setYarnId] = useState<number | null>(null);
  const [sizeKeys, setSizeKeys] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  // All sizes. The table is only asked for when the row is first opened, and
  // then it is the same table `castOn` translates millimetres with.
  const [sizesOpen, setSizesOpen] = useState(false);
  const [sizeTable, setSizeTable] = useState<readonly RavelryNeedleSize[] | null>(null);
  const [loadingSizes, setLoadingSizes] = useState(false);
  const [sizesUnavailable, setSizesUnavailable] = useState(false);

  const sizes = useMemo(
    () => (sizeTable === null ? [] : sizeOptions(sizeTable)),
    [sizeTable],
  );

  /**
   * Picking up the skein the Add a yarn sheet just wrote.
   *
   * It runs when this screen is focused again, and again on every change to
   * the stash while it stays focused — which is the whole point. `refreshStash`
   * is awaited before the sheet dismisses, so the row is usually already here;
   * when it is not, `useStash` is a live query and this fires again the moment
   * it lands. Until then the id stays in the slot rather than selecting a row
   * that does not exist yet.
   */
  useFocusEffect(
    useCallback(() => {
      const pending = pendingStashSelection();

      if (pending === null || !yarn.some((row) => row.id === pending)) {
        return;
      }

      consumePendingStashSelection();
      setYarnId(pending);
    }, [yarn]),
  );

  /**
   * Picking up the needle the Add a needle sheet just wrote.
   *
   * Simpler than the skein above, because a needle is chosen by millimetres
   * and not by row: the size is a usable answer the moment the sheet hands it
   * over, whether or not the row it wrote has reached this list yet. It will —
   * `useNeedles` is a live query over the same insert — and when it does it
   * arrives already selected, because it is the same size.
   */
  useFocusEffect(
    useCallback(() => {
      const pending = consumePendingNeedleSelection();

      if (pending === null) {
        return;
      }

      setSizeKeys((current) =>
        current.includes(pending) ? current : [...current, pending],
      );
    }, []),
  );

  // Anything left in either slot goes in the bin with this screen rather than
  // turning up preselected on the next project — the stash id because the row
  // it names may never have arrived, the size because the knitter has moved on.
  useEffect(
    () => () => {
      consumePendingStashSelection();
      consumePendingNeedleSelection();
    },
    [],
  );

  const sections = useMemo<ChoiceSection[]>(() => {
    const yarnRows: Choice[] =
      yarn.length === 0
        ? [{ kind: "empty", line: "Nothing in your stash yet." }]
        : yarn.map((row) => ({ kind: "yarn", yarn: row }));

    yarnRows.push({ kind: "addYarn" });

    const needleRows: Choice[] =
      needles.length === 0
        ? [{ kind: "empty", line: "No needles recorded." }]
        : needles.map((row) => ({ kind: "needle", needle: row }));

    needleRows.push({ kind: "allSizes" });

    if (sizesOpen) {
      needleRows.push({ kind: "sizeGrid" });
    }

    // Last, and after the grid: the quick pick is the answer most of the time,
    // and writing a needle down is the thing to do when it was not.
    needleRows.push({ kind: "addNeedle" });

    return [
      { title: "Yarn", data: yarnRows },
      { title: "Needles", data: needleRows },
    ];
  }, [needles, sizesOpen, yarn]);

  const toggleYarn = useCallback((id: number) => {
    // Tapping the chosen skein again unchooses it; yarn is optional.
    setYarnId((current) => (current === id ? null : id));
  }, []);

  const toggleSize = useCallback((key: string) => {
    setSizeKeys((current) =>
      current.includes(key) ? current.filter((other) => other !== key) : [...current, key],
    );
  }, []);

  // `handBack` is what tells either sheet to leave what it wrote in the slot
  // this screen reads on focus. Only Cast on asks for it — see the note on
  // `pending-selection`.
  const addYarn = useCallback(
    () => router.push({ pathname: "/add-yarn", params: { handBack: "1" } }),
    [],
  );

  const addNeedle = useCallback(
    () => router.push({ pathname: "/add-needle", params: { handBack: "1" } }),
    [],
  );

  const toggleSizes = useCallback(() => {
    const opening = !sizesOpen;
    setSizesOpen(opening);

    if (!opening || sizeTable !== null || loadingSizes) {
      return;
    }

    setLoadingSizes(true);
    setSizesUnavailable(false);

    void (async () => {
      try {
        setSizeTable(await getNeedleSizes());
      } catch {
        // One quiet line inside the row that asked for it; the rest of the
        // screen is still a working way to start a project.
        setSizesUnavailable(true);
      } finally {
        setLoadingSizes(false);
      }
    })();
  }, [loadingSizes, sizeTable, sizesOpen]);

  const castOn = useCallback(() => {
    if (busy) {
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
      try {
        // Sizes chosen from the full table came out of this same table, so
        // asking for it again would be a round trip spent on nothing.
        let table: readonly RavelryNeedleSize[] = sizeTable ?? [];
        if (sizeTable === null && sizeKeys.length > 0) {
          table = await getNeedleSizes();
        }

        const chosenSizes = needleSizeIds(sizeKeys, table);
        const trimmed = name.trim();

        const project = await createProject(username, {
          // An emptied field means the knitter did not want to rename it, not
          // that they wanted a project called nothing.
          name: trimmed === "" ? patternName : trimmed,
          pattern_id: patternId ?? undefined,
          craft_id: craft,
          project_status_id: PROJECT_STATUS_IN_PROGRESS,
          started: today(),
          needle_sizes: chosenSizes.length === 0 ? undefined : chosenSizes,
          packs: yarnId === null ? undefined : [{ stash_id: yarnId }],
        });

        const newId = typeof project.id === "number" ? project.id : null;

        // Casting on is the moment a knitter is most likely to want the
        // pattern on the phone, so the download starts here and is never
        // waited on: it answers rather than throwing, it takes a library walk
        // and a poll to finish, and a project that has just been created must
        // not depend on any of that. If it lands, the project screen's "Open
        // pattern" appears underneath them; if it does not, nothing is said.
        if (patternId !== null) {
          void ensurePatternPdf(username, patternId);
        }

        // The project screen reads the mirror, not the network, so the row has
        // to be on the device before this screen gets out of the way.
        await refreshProjects(username);

        if (newId !== null && getProjectById(newId) !== null) {
          // Not in the history, so this replaces the modal rather than
          // popping to it: the knitter lands on the project they just made,
          // and Back from there is the pattern they made it from.
          router.dismissTo({ pathname: "/project/[id]", params: { id: newId } });
        } else {
          // Written to Ravelry, but the mirror could not catch up. Home is the
          // honest destination — the project appears there on the next sync.
          router.dismissTo("/");
        }
      } catch (error) {
        setProblem(triage(error));
      } finally {
        setBusy(false);
      }
    })();
  }, [
    busy,
    craft,
    name,
    patternId,
    patternName,
    sizeKeys,
    sizeTable,
    username,
    yarnId,
  ]);

  const renderChoice = useCallback(
    ({ item }: { item: Choice }) => {
      switch (item.kind) {
        case "empty":
          return <Text style={[styles.quiet, { color: colors.ink3 }]}>{item.line}</Text>;

        case "yarn":
          return (
            <YarnChoice
              row={item.yarn}
              selected={yarnId === item.yarn.id}
              onPress={() => toggleYarn(item.yarn.id)}
            />
          );

        case "addYarn":
          // No `open`: this row is a way to somewhere else now, not something
          // that unfolds underneath itself.
          return <AddRow label="Add a yarn" onPress={addYarn} />;

        case "needle":
          return (
            <NeedleChoice
              row={item.needle}
              selected={
                item.needle.sizeMm !== null && sizeKeys.includes(sizeKey(item.needle.sizeMm))
              }
              onPress={() => {
                if (item.needle.sizeMm !== null) {
                  toggleSize(sizeKey(item.needle.sizeMm));
                }
              }}
            />
          );

        case "allSizes":
          // Four words for the whole caveat: these go on the project, and
          // Ravelry has no way to put them in the knitter's drawer.
          return (
            <AddRow
              label="All sizes"
              note="project only"
              open={sizesOpen}
              onPress={toggleSizes}
            />
          );

        case "sizeGrid":
          return (
            <SizeGrid
              options={sizes}
              selected={sizeKeys}
              notice={{
                line: sizesUnavailable
                  ? "Sizes unavailable · check connection"
                  : "Loading",
                unavailable: sizesUnavailable,
              }}
              onPress={toggleSize}
            />
          );

        case "addNeedle":
          // A way to somewhere else, like "Add a yarn" — no `open`, and no
          // note: what is worth saying about a needle added here is said on
          // the row it becomes, not on the way in.
          return <AddRow label="Add a needle" onPress={addNeedle} />;
      }
    },
    [
      addNeedle,
      addYarn,
      colors,
      sizeKeys,
      sizes,
      sizesOpen,
      sizesUnavailable,
      toggleSize,
      toggleSizes,
      toggleYarn,
      yarnId,
    ],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: ChoiceSection }) => (
      <Text style={[styles.sectionLabel, { color: colors.ink3 }]}>{section.title}</Text>
    ),
    [colors.ink3],
  );

  return (
    // No `SafeAreaView` top edge: on iOS a modal is a sheet, already inset
    // from the status bar by the presentation itself, and adding the window's
    // inset on top of that would push the screen down by a notch that is not
    // there. Android presents the same route full-bleed, so it does need it.
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.paper,
          paddingTop: Platform.OS === "android" ? insets.top : 0,
        },
      ]}
    >
      <BackBar title="Start project" />

      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <SectionList
          sections={sections}
          renderItem={renderChoice}
          renderSectionHeader={renderSectionHeader}
          keyExtractor={keyForChoice}
          // The rows are a flush run sharing hairlines; a sticky label riding
          // over them would draw a second rule where the design has one.
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.content}
          // An element rather than a component, so the field it holds is not
          // remounted — and does not lose focus — on every keystroke. The
          // fields inside the list are safe for the same reason: every row is
          // rendered by a component declared at module scope, so a keystroke
          // re-renders it and never replaces it.
          ListHeaderComponent={
            // No rule above this block: the bar's own hairline is already
            // there, and a second one would be two rules where the design has
            // one. The name is the display line now, so the field wears it.
            <View style={styles.block}>
              <Text style={[styles.fieldLabel, { color: colors.ink3 }]}>Name</Text>
              <TextField
                value={name}
                onChangeText={setName}
                accessibilityLabel="Project name"
                editable={!busy}
                returnKeyType="done"
                size="display"
              />
            </View>
          }
        />

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
            <Text style={[styles.stamp, { color: colors.ink3 }]}>Casting on…</Text>
          ) : problem === "signedOut" ? (
            <Text style={[styles.invitation, { color: colors.ink2 }]}>
              {NOTICES.signedOut}
            </Text>
          ) : problem !== null ? (
            <Text
              style={[
                styles.stamp,
                { color: problem === "offline" ? colors.slate : colors.clay },
              ]}
            >
              {NOTICES[problem]}
            </Text>
          ) : null}

          <Button variant="primary" size="lg" full disabled={busy} onPress={castOn}>
            Cast on
          </Button>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function keyForChoice(item: Choice): string {
  switch (item.kind) {
    case "yarn":
      return `yarn-${item.yarn.id}`;
    case "needle":
      return `needle-${item.needle.id}`;
    case "empty":
      return `empty-${item.line}`;
    default:
      // Every other row appears at most once in its section.
      return item.kind;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingBottom: space.s6 },
  block: {
    paddingHorizontal: space.s4,
    paddingVertical: space.s5,
    gap: space.s2,
  },
  fieldLabel: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
  },
  sectionLabel: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
    paddingTop: space.s5,
    paddingBottom: space.s2,
    paddingHorizontal: space.s4,
  },
  footer: {
    paddingTop: space.s4,
    paddingHorizontal: space.s4,
    gap: space.s3,
    borderTopWidth: 1,
  },
  quiet: {
    fontFamily: fonts.ui,
    fontSize: type.micro.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
    paddingHorizontal: space.s4,
    paddingBottom: space.s2,
  },
  stamp: {
    fontFamily: fonts.ui,
    fontSize: type.micro.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
    textAlign: "center",
  },
  invitation: {
    fontFamily: fonts.ui,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    textAlign: "center",
  },
});
