/**
 * Stash — yarn, hardware, patterns and the account, in one scroll.
 *
 * Three sections in a single list rather than three lists: the needles and the
 * patterns are flush runs of rows sharing hairlines, and only one scroll
 * container can keep them edge to edge under the same sync strip.
 *
 * Each section label carries an Add across from it. Two of them open the same
 * sheets Cast on opens — this is the other door to those, and the one a knitter
 * who is not starting a project would look for. Neither is asked to hand
 * anything back here; see `pending-selection` for what that means and why it
 * matters.
 *
 * The third is Patterns, and it is not a mirror of anything. It is everything
 * this phone can open: the PDFs downloaded or imported against a Ravelry
 * pattern, and the patterns typed in by hand because Ravelry has never heard of
 * them — a leaflet from a wool show, a chart out of a magazine. One
 * alphabetical list, because from the knitter's side they are the same thing;
 * see `usePatternShelf` for how two very different rows arrive at one shape.
 *
 * There is no You tab any more, so this screen is also where the Ravelry
 * account lives. Signed out it is the whole screen: nothing here exists without
 * a session, so the sign-in stands in the empty list rather than beside it.
 * Signed in it shrinks to the username in the header's one action slot, with
 * Sign out behind it — a door that is only ever opened on purpose.
 *
 * That door is the system's on iOS: a SwiftUI `Menu` hung off the name, which
 * puts a destructive row in the platform's own pull-down instead of a card this
 * app drew to look like one. `@expo/ui` is iOS and nothing else, so the drawn
 * popover stays below for everywhere that is not.
 */

import { Button, Host, Menu, Text as SwiftUIText } from "@expo/ui/swift-ui";
import {
  contentShape,
  font,
  foregroundStyle,
  frame,
  kerning,
  shapes,
} from "@expo/ui/swift-ui/modifiers";
import { router } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { useAuth } from "@/auth/context";
import { ScreenHeader } from "@/components/screen-header";
import { Badge } from "@/components/ui/badge";
import { NeedleRow } from "@/components/ui/needle-row";
import { SwipeRow } from "@/components/ui/swipe-row";
import { YarnCard } from "@/components/ui/yarn-card";
import {
  deleteCustomPattern,
  deleteLocalNeedle,
  deletePatternPdf,
  deleteStashEntry,
  fillStashPhotos,
  forgetYarnColor,
  refreshStash,
  tintFor,
  useNeedles,
  usePatternShelf,
  useStash,
  type NeedleListRow,
  type PatternShelfRow,
  type StashListRow,
} from "@/data";
import { triage, type Problem } from "@/features/start-project/problem";
import { usePullToSync } from "@/features/sync/pull-to-sync";
import { haptics } from "@/haptics";
import {
  fonts,
  radius,
  space,
  tabBarInset,
  tap,
  trackSmall,
  type,
  useTheme,
} from "@/theme";

/**
 * One list, four row shapes: tagged so the renderer never has to guess.
 *
 * `empty` is a line where the rows would be. Every section stays on screen even
 * with nothing under it, which they did not used to — an empty section used to
 * be dropped whole. The Add beside each label is why: the knitter with no yarn
 * at all is exactly the one who needs the button, and a heading that disappears
 * takes its button with it.
 */
type StashItem =
  | { kind: "yarn"; yarn: StashListRow }
  | { kind: "needle"; needle: NeedleListRow }
  | { kind: "pattern"; pattern: PatternShelfRow }
  | { kind: "empty"; line: string };

type StashSection = {
  title: string;
  /** What the Add beside the label says to a screen reader. */
  addLabel: string;
  onAdd: () => void;
  data: StashItem[];
};

/** The three ways taking a skein out of the stash can fail, in this screen's
 * words. The needles have none: that drawer is the app's own and nothing about
 * it ever leaves the device. */
const DELETE_NOTICES: Record<Problem, string> = {
  failed: "Couldn't delete the yarn.",
  // Aqua, not mustard: nothing went wrong, the request simply never left.
  offline: "You're offline · try again later.",
  signedOut: "Sign in to delete yarn.",
};

/** Ravelry's needle kinds arrive lowercase ("circular", "hook"). Sentence case,
 * never all-caps — this only lifts the first letter. */
function sentence(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const YarnItem = memo(function YarnItem({
  row,
  busy,
  onDelete,
}: {
  row: StashListRow;
  /** This skein's own delete is in flight; see `SwipeRow`. */
  busy: boolean;
  onDelete: (id: number) => void;
}) {
  const title = row.colorway ?? row.yarnName ?? "Unnamed yarn";
  // The second line carries whatever else names this yarn: the maker, plus the
  // yarn's own name when the colorway has already taken the title.
  const subtitle = [row.brand, row.colorway === null ? null : row.yarnName]
    .filter((part): part is string => part !== null)
    .join(" · ");

  // The yarn cards are bordered on all four sides, so they are inset and
  // spaced; only the needle rows below run flush and share their hairlines.
  // That inset is the swipeable's container now, so a row that slides aside
  // slides inside the same box it always occupied.
  return (
    <SwipeRow
      containerStyle={styles.yarnItem}
      label="Delete"
      // Asked twice, like the edit sheet asks: this takes the skein off
      // Ravelry, and there is no way back to it.
      confirmLabel="Tap again"
      accessibilityLabel="Delete this yarn"
      confirmAccessibilityLabel="Tap again to delete this yarn from Ravelry"
      busy={busy}
      onCommit={() => onDelete(row.id)}
    >
      <YarnCard
        colorway={title}
        brand={subtitle === "" ? undefined : subtitle}
        weight={row.weightName ?? undefined}
        yardage={
          row.yardsTotal === null
            ? undefined
            : `${Math.round(row.yardsTotal)} yd`
        }
        photo={row.photoUrl ?? undefined}
        // The colour this knitter said the skein is, over a photograph that is
        // of the yarn but rarely of this colourway.
        tint={tintFor(row.colorHex, row.colorFamilyId)}
        onPress={() =>
          router.push({ pathname: "/yarn/[id]", params: { id: row.id } })
        }
      />
    </SwipeRow>
  );
});

const NeedleItem = memo(function NeedleItem({
  row,
  onDelete,
}: {
  row: NeedleListRow;
  onDelete: (id: number) => void;
}) {
  // Only the needles this app wrote can be taken away. Ravelry's inventory is
  // read-only — there is no route that deletes one — and `pullNeedles` replaces
  // the table from the account on every sync, so a Ravelry row swiped away here
  // would be back within the minute. Rather than offer a button that lies, the
  // gesture simply is not there on those rows. See `deleteLocalNeedle`.
  const own = row.source === "local";

  return (
    <SwipeRow
      enabled={own}
      label="Delete"
      // One tap, no arming, and no busy window either: this is a row in the
      // app's own drawer, the write is a synchronous line of SQLite, and
      // `edit-row-counter` already sets the precedent that the app's own
      // records go without a second asking.
      accessibilityLabel="Delete this needle"
      onCommit={() => onDelete(row.id)}
    >
      <NeedleRow
        size={row.sizeMm === null ? "—" : String(row.sizeMm)}
        us={row.sizeUs ?? undefined}
        kind={sentence(row.kind ?? row.name ?? "Needle")}
        length={row.lengthLabel ?? undefined}
        onPress={() =>
          router.push({ pathname: "/needle/[id]", params: { id: row.id } })
        }
      />
    </SwipeRow>
  );
});

/**
 * One line on the pattern shelf.
 *
 * The needle rows' structure without the swatch: a flush ruled row, the name on
 * top, whatever else identifies it underneath, and the marks on the right. It
 * is drawn here rather than in `components/ui` because nothing else in the app
 * has a use for it — the pattern cards on Saves and Discover carry a photograph
 * and a price, and neither of those exists for a file on the phone.
 *
 * Two marks, and the pair is the whole point of the row. `offline` is the same
 * aqua dot the pattern cards wear for a downloaded file, which is what says
 * this one opens on a train. The neutral one says the opposite kind of thing:
 * not a state, a fact about where the pattern came from, and the reason
 * searching Ravelry for it will never turn it up.
 */
const PatternItem = memo(function PatternItem({
  row,
  onDelete,
  onRemoveDownload,
}: {
  row: PatternShelfRow;
  onDelete: (id: number) => void;
  onRemoveDownload: (id: number) => void;
}) {
  const { colors } = useTheme();

  const open = useCallback(() => {
    haptics.tap();
    if (row.custom) {
      router.push({
        pathname: "/custom-pattern/[id]",
        params: { id: row.id },
      });
    } else {
      router.push({ pathname: "/pattern/[id]", params: { id: row.id } });
    }
  }, [row.custom, row.id]);

  return (
    <SwipeRow
      // The two rows mean different things by a swipe, and the button says
      // which. A custom pattern is a record that exists nowhere else, so the
      // gesture takes the whole thing away — and its PDF with it, since nothing
      // will ever collect a file keyed by an id this app made up. A Ravelry
      // pattern's row *is* the file: the pattern itself is still on ravelry.com
      // and still one tap away, so only the copy goes.
      label={row.custom ? "Delete" : "Remove"}
      // Asked twice on the one that cannot be got back. A download can be
      // fetched again; a pattern typed off a leaflet cannot.
      confirmLabel={row.custom ? "Tap again" : undefined}
      accessibilityLabel={
        row.custom ? "Delete this pattern" : "Remove this download"
      }
      confirmAccessibilityLabel="Tap again to delete this pattern"
      onCommit={() => (row.custom ? onDelete(row.id) : onRemoveDownload(row.id))}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          row.secondary === null ? row.name : `${row.name}, ${row.secondary}`
        }
        onPress={open}
        style={({ pressed }) => [
          styles.patternRow,
          { borderBottomColor: colors.hairline },
          pressed ? { backgroundColor: colors.surfaceSunk } : null,
        ]}
      >
        <View style={styles.patternBody}>
          <Text
            numberOfLines={1}
            style={[styles.patternName, { color: colors.ink }]}
          >
            {row.name}
          </Text>
          {row.secondary === null ? null : (
            <Text
              numberOfLines={1}
              style={[styles.patternSecondary, { color: colors.ink2 }]}
            >
              {row.secondary}
            </Text>
          )}
        </View>

        <View style={styles.patternMarks}>
          {row.custom ? <Badge tone="neutral">not on Ravelry</Badge> : null}
          {row.offline ? (
            <Badge tone="offline" dot>
              downloaded
            </Badge>
          ) : null}
        </View>
      </Pressable>
    </SwipeRow>
  );
});

/** A section with nothing in it yet, said once and quietly. */
const EmptyLine = memo(function EmptyLine({ line }: { line: string }) {
  const { colors } = useTheme();

  return <Text style={[styles.emptyLine, { color: colors.ink2 }]}>{line}</Text>;
});

const keyForStashItem = (item: StashItem) => {
  switch (item.kind) {
    case "yarn":
      return `yarn-${item.yarn.id}`;
    case "needle":
      return `needle-${item.needle.id}`;
    case "pattern":
      return `pattern-${item.pattern.id}`;
    case "empty":
      return `empty-${item.line}`;
  }
};

export default function StashScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { status, user, signIn, signOut } = useAuth();
  const { data: yarn } = useStash();
  const { data: needles } = useNeedles();
  const { data: patterns } = usePatternShelf();

  const signedIn = status === "signedIn";
  const username = user?.username ?? null;

  // Which account door this build has. Everything below that is only one of the
  // two is written against this rather than against `Platform.OS` again, so the
  // two halves cannot drift apart.
  const nativeAccount = Platform.OS === "ios";

  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  // The drawn popover hangs off the bottom of the header, and a Modal is its
  // own window with no idea where that is — so the header says how tall it came
  // out rather than the number being written down here and going stale. Nothing
  // on iOS reads it: the system's menu knows where it was opened from.
  const [headerHeight, setHeaderHeight] = useState(0);

  const measureHeader = useCallback((event: LayoutChangeEvent) => {
    setHeaderHeight(event.nativeEvent.layout.height);
  }, []);

  const handleSignIn = useCallback(async () => {
    // The screen's one filled button, drawn here rather than imported.
    haptics.commit();
    // Every attempt starts clean: the last failure line clears on retry.
    setFailed(false);
    setBusy(true);
    try {
      await signIn();
      haptics.success();
    } catch {
      // Cancelled browser, state mismatch, no network — all the same to the
      // reader: it didn't complete. No red, no dialog, no stack.
      setFailed(true);
      haptics.error();
    } finally {
      setBusy(false);
    }
  }, [signIn]);

  /**
   * Signing out, and nothing around it: the session goes, and the sign-in that
   * takes the screen back gets to start clean rather than wearing the last
   * failure line from before this account existed.
   *
   * The two doors owe the knitter different things on the way in, which is why
   * this is the shared middle and not the whole of either. The drawn popover
   * has to answer the tap itself and then take itself down; iOS has already
   * done both — the tick of the menu and the menu closing — before this runs.
   */
  const signOutNow = useCallback(() => {
    setFailed(false);
    void signOut();
  }, [signOut]);

  const handleSignOut = useCallback(() => {
    haptics.tap();
    setAccountOpen(false);
    signOutNow();
  }, [signOutNow]);

  // Neither sheet is asked to hand anything back: this screen is not in the
  // middle of choosing, the way Cast on is when it opens the same two. The
  // rows arrive on their own — both lists are live queries over the writes.
  const addYarn = useCallback(() => router.push("/add-yarn"), []);

  const addNeedle = useCallback(() => router.push("/add-needle"), []);

  // The one Add on this screen that opens nothing Cast on has: there is no
  // route into Ravelry for a pattern it does not have, so this sheet is the
  // only door there is.
  const addPattern = useCallback(() => router.push("/add-pattern"), []);

  // Every section, always, signed in — see the note on `StashItem`. Signed out
  // there are none at all, and the sign-in below takes the whole screen.
  const sections = useMemo<StashSection[]>(() => {
    if (!signedIn) {
      return [];
    }

    return [
      {
        title: "Yarn",
        addLabel: "Add yarn",
        onAdd: addYarn,
        data:
          yarn.length === 0
            ? [{ kind: "empty", line: "Nothing in your stash yet." }]
            : yarn.map((row) => ({ kind: "yarn", yarn: row })),
      },
      {
        title: "Needles & hooks",
        addLabel: "Add a needle",
        onAdd: addNeedle,
        data:
          needles.length === 0
            ? [{ kind: "empty", line: "No needles recorded." }]
            : needles.map((row) => ({ kind: "needle", needle: row })),
      },
      {
        title: "Patterns",
        addLabel: "Add a pattern",
        onAdd: addPattern,
        data:
          patterns.length === 0
            ? [{ kind: "empty", line: "Nothing on this phone to read yet." }]
            : patterns.map((row) => ({ kind: "pattern", pattern: row })),
      },
    ];
  }, [addNeedle, addPattern, addYarn, needles, patterns, signedIn, yarn]);

  // The thumbnails and the fibre content are fetched a yarn at a time and kept
  // (see `yarn-photos.ts`). Asking here rather than only after a sync is what
  // makes them turn up on the screen they are actually for — including on the
  // launch after that cache grew a column and was emptied to refill itself.
  // Idempotent and free when there is nothing missing: one query, no network.
  useEffect(() => {
    if (signedIn) {
      void fillStashPhotos();
    }
  }, [signedIn, yarn]);

  // A gesture on this screen, not the global sync status: see `usePullToSync`.
  const { refreshing, onRefresh } = usePullToSync(username);

  // Which skein is on its way out, and what went wrong the last time one was.
  // Nothing here is optimistic: the mirror only loses the row once the refresh
  // behind the delete has come back, so until then it sits there dimmed and
  // untouchable. See `SwipeRow`.
  const [deletingYarn, setDeletingYarn] = useState<number | null>(null);
  const [deleteProblem, setDeleteProblem] = useState<Problem | null>(null);

  const removeYarn = useCallback(
    (id: number) => {
      if (username === null) {
        // Nothing is attempted: a write with no account behind it fails at the
        // client, and saying so here costs no round trip.
        setDeleteProblem("signedOut");
        haptics.error();
        return;
      }

      setDeleteProblem(null);
      setDeletingYarn(id);

      void (async () => {
        try {
          await deleteStashEntry(username, id);

          // Only once Ravelry has agreed. The shade was matched by eye on this
          // device and lives nowhere else, so it has to be forgotten by hand —
          // a local row about a skein that no longer exists is a colour nobody
          // will ever see again attached to an id that will be reissued. The
          // same cleanup the edit sheet does, because it is the same deletion.
          forgetYarnColor(id);
          await refreshStash(username);

          haptics.warning();
        } catch (error) {
          setDeleteProblem(triage(error));
          haptics.error();
        } finally {
          setDeletingYarn(null);
        }
      })();
    },
    [username],
  );

  /**
   * A needle out of the app's own drawer, and nothing around it.
   *
   * No account is involved, no request leaves, and `deleteLocalNeedle` is a
   * synchronous line of SQLite that refuses anything Ravelry owns — so there is
   * no busy window to draw and no failure worth a sentence. The row is gone
   * before the finger is off it: `queries.ts` is listening to the database's
   * own update hook, so `useNeedles` redraws itself.
   */
  const removeNeedle = useCallback((id: number) => {
    if (deleteLocalNeedle(id)) {
      haptics.warning();
    } else {
      haptics.error();
    }
  }, []);

  /**
   * A pattern off the shelf, and the file that hung off it.
   *
   * Nothing leaves and nothing is asked: this is a row this app wrote, and
   * `deleteCustomPattern` takes the PDF with it because a file keyed by an id
   * this app made up will never be collected by anything else. Synchronous, so
   * there is no busy window to draw; the row is gone before the finger is off
   * it, because `usePatternShelf` is listening to the same update.
   */
  const removePattern = useCallback((id: number) => {
    if (deleteCustomPattern(id)) {
      haptics.warning();
    } else {
      haptics.error();
    }
  }, []);

  /**
   * The copy, and only the copy.
   *
   * The pattern itself is Ravelry's and is still one tap away on its own
   * screen — what goes here is the few hundred kilobytes on the phone, which is
   * the only thing this row was ever about. `deletePatternPdf` moves the file
   * and the row together and says nothing either way, so there is nothing to
   * report and nothing that can be half-done.
   */
  const removeDownload = useCallback((id: number) => {
    deletePatternPdf(id);
    haptics.warning();
  }, []);

  const renderStashItem = useCallback(
    ({ item }: { item: StashItem }) => {
      switch (item.kind) {
        case "yarn":
          return (
            <YarnItem
              row={item.yarn}
              busy={deletingYarn === item.yarn.id}
              onDelete={removeYarn}
            />
          );
        case "needle":
          return <NeedleItem row={item.needle} onDelete={removeNeedle} />;
        case "pattern":
          return (
            <PatternItem
              row={item.pattern}
              onDelete={removePattern}
              onRemoveDownload={removeDownload}
            />
          );
        case "empty":
          return <EmptyLine line={item.line} />;
      }
    },
    [deletingYarn, removeDownload, removeNeedle, removePattern, removeYarn],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: StashSection }) => (
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionLabel, { color: colors.ink2 }]}>
          {section.title}
        </Text>
        {/* Link-colored, and stamped at the same small size as the label it
            sits across from: this is the screen header's one text action, said
            again per section, because each section adds a different thing. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={section.addLabel}
          onPress={() => {
            haptics.tap();
            section.onAdd();
          }}
          hitSlop={{ top: space.s2, bottom: space.s2, right: space.s4 }}
          style={styles.sectionAction}
        >
          {({ pressed }) => (
            <Text
              style={[
                styles.sectionActionLabel,
                { color: pressed ? colors.linkPressed : colors.link },
              ]}
            >
              Add
            </Text>
          )}
        </Pressable>
      </View>
    ),
    [colors.link, colors.linkPressed, colors.ink2],
  );

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.screen, { backgroundColor: colors.paper }]}
    >
      {/* Measured, not assumed: the popover below hangs off this edge. Not
          measured at all where there is no popover to hang — asking on iOS
          would be a re-render a frame after every layout, for a number nothing
          left on the screen reads. */}
      <View onLayout={nativeAccount ? undefined : measureHeader}>
        <ScreenHeader
          title="Stash"
          // The knitter's own name is the action either way, because the only
          // thing behind it is their account. Signed in but offline before the
          // profile loaded: the session is real, the name isn't loaded yet.
          action={
            signedIn && !nativeAccount ? (username ?? "Your account") : undefined
          }
          onAction={() => setAccountOpen(true)}
          right={
            signedIn && nativeAccount ? (
              // No `colorScheme` on the Host on purpose: this app's theme reads
              // `useColorScheme()` and pins nothing, so SwiftUI is already
              // looking at the same switch. Passing one could only repeat the
              // system, or contradict it a frame late.
              <Host matchContents>
                <Menu
                  // No `onPrimaryAction`. With it the name would want a
                  // long-press to give up the menu, and a name with nothing
                  // behind a tap is a control that does nothing.
                  label={
                    <SwiftUIText
                      modifiers={[
                        // The header action's own face, said in SwiftUI's
                        // terms: the family by the name `useFonts` registered
                        // it under, then the small size and the small tracking
                        // that make it a stamp rather than a sentence.
                        font({
                          family: fonts.ui,
                          size: type.small.fontSize,
                        }),
                        kerning(trackSmall),
                        foregroundStyle(colors.link),
                        // The honest 48pt box, built the other way round: there
                        // is no Pressable in this branch to hang slop off, so
                        // the frame is taller than the words and the shape says
                        // the empty part of it is still the button. The header
                        // hands the height straight back with its own negative
                        // margin, exactly as it does for the words.
                        frame({ minHeight: tap.min, alignment: "trailing" }),
                        contentShape(shapes.rectangle()),
                      ]}
                    >
                      {username ?? "Your account"}
                    </SwiftUIText>
                  }
                >
                  {/* One row, and iOS draws it in red off `role` — the same
                      thing the popover below says in words and position. */}
                  <Button
                    label="Sign out"
                    role="destructive"
                    systemImage="rectangle.portrait.and.arrow.right"
                    onPress={signOutNow}
                  />
                </Menu>
              </Host>
            ) : undefined
          }
        />
      </View>

      {/* The one thing a swiped-away row cannot say for itself, said once and
          quietly under the heading. It clears on the next attempt. Mustard for
          a delete that was refused, aqua for one that never left the device —
          the same two the sheets use, for the same reason. */}
      {deleteProblem !== null ? (
        <Text
          style={[
            styles.deleteNotice,
            { color: deleteProblem === "failed" ? colors.mustard : colors.aqua },
          ]}
        >
          {DELETE_NOTICES[deleteProblem]}
        </Text>
      ) : null}

      <SectionList
        sections={sections}
        renderItem={renderStashItem}
        renderSectionHeader={renderSectionHeader}
        keyExtractor={keyForStashItem}
        // The rows are memoised, so the list has to be told that which one is
        // busy has changed; the rows themselves still bail out unless it is
        // theirs. See `YarnItem`.
        extraData={deletingYarn}
        // The needle rows are a flush run; a sticky label riding over them
        // would put a second horizontal rule where the design has one.
        stickySectionHeadersEnabled={false}
        contentContainerStyle={[
          { paddingBottom: tabBarInset + insets.bottom },
          // With nothing to scroll the container is the empty state's frame,
          // and it has to be as tall as the screen before it can centre in it.
          sections.length === 0 && styles.fill,
        ]}
        refreshControl={
          username === null ? undefined : (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.ink2}
            />
          )
        }
        // Only the signed-out case reaches this now: signed in there are always
        // two sections, and each says for itself when it has nothing under it.
        ListEmptyComponent={
          signedIn ? null : (
            <View style={styles.signIn}>
              {status === "loading" ? (
                <ActivityIndicator color={colors.ink2} />
              ) : (
                <View style={styles.signInBlock}>
                  <Text style={[styles.lede, { color: colors.ink2 }]}>
                    Your Ravelry account powers everything here.
                  </Text>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Sign in with Ravelry"
                    accessibilityState={{ busy, disabled: busy }}
                    disabled={busy}
                    onPress={handleSignIn}
                    style={({ pressed }) => [
                      styles.button,
                      {
                        backgroundColor: pressed
                          ? colors.actionPressed
                          : colors.action,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.buttonLabel, { color: colors.onAction }]}
                    >
                      Sign in with Ravelry
                    </Text>
                  </Pressable>

                  {failed ? (
                    <Text style={[styles.stamp, { color: colors.mustard }]}>
                      Sign-in didn&apos;t complete.
                    </Text>
                  ) : null}

                  <Text style={[styles.stamp, { color: colors.ink2 }]}>
                    Softly is an independent app, not made by Ravelry.
                  </Text>
                </View>
              )}
            </View>
          )
        }
      />

      {/* The same one row behind the name, drawn by hand for everywhere that
          is not iOS, and the whole rest of the screen dismisses it: signing out
          is not a thing to land on by accident, and it is not a thing to have
          to hunt for either. Where the system has a pull-down of its own this
          never mounts at all — a Modal that can never be asked to open is still
          a window being kept ready. */}
      {nativeAccount ? null : (
        <Modal
          visible={accountOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setAccountOpen(false)}
        >
          <View style={styles.overlay}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
              style={StyleSheet.absoluteFill}
              onPress={() => setAccountOpen(false)}
            />

            <View
              style={[
                styles.popover,
                {
                  top: insets.top + headerHeight + space.s1,
                  backgroundColor: colors.surface,
                  borderColor: colors.hairline,
                },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sign out"
                onPress={handleSignOut}
                style={({ pressed }) => [
                  styles.popoverRow,
                  pressed ? { backgroundColor: colors.surfaceSunk } : null,
                ]}
              >
                <Text style={[styles.popoverLabel, { color: colors.ink }]}>
                  Sign out
                </Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  yarnItem: {},
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.s3,
    // The label's own padding, moved out here so the Add sits across from it
    // on the same line rather than under its own.
    paddingTop: space.s5,
    paddingBottom: space.s2,
    paddingHorizontal: space.s4,
  },
  sectionLabel: {
    flexShrink: 1,
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
  },
  sectionAction: {
    // Padded for the finger, then pulled back out of the layout, so the touch
    // box is honest and the heading stays the height the design drew it.
    paddingLeft: space.s3,
    paddingVertical: space.s2,
    marginVertical: -space.s2,
  },
  sectionActionLabel: {
    // Stamped, like the screen header's action: small size, small tracking, no
    // weight bump, sentence case.
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
  },
  // `NeedleRow`'s metrics without the swatch: a flush run of rows sharing
  // hairlines, on the same 48pt floor and the same 12pt padding, so the two
  // sections below the yarn read as one drawer with a rule between them.
  patternRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s3,
    minHeight: tap.min,
    padding: space.s3,
    borderBottomWidth: 1,
  },
  patternBody: {
    flex: 1,
    // Without this a long name refuses to ellipsise and pushes the marks off
    // the right edge instead: a flex child's minimum is its content.
    minWidth: 0,
    gap: 2,
  },
  patternName: {
    fontFamily: fonts.uiMedium,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
  patternSecondary: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
  },
  patternMarks: {
    flexShrink: 0,
    alignItems: "flex-end",
    gap: 4,
  },
  emptyLine: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
    paddingBottom: space.s2,
    paddingHorizontal: space.s4,
  },
  deleteNotice: {
    // The stamped label again, ranged left under the header: this one is about
    // a row that would not go, not about the screen.
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
    paddingHorizontal: space.s4,
    paddingBottom: space.s2,
  },
  fill: { flexGrow: 1 },
  signIn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.s4,
    paddingVertical: space.s10,
  },
  signInBlock: {
    // Full width, then capped: a line of body text stops being readable
    // somewhere before the width of a tablet. Width rather than `alignSelf:
    // stretch` so the cap leaves the block centred instead of against the left.
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
    gap: space.s5,
  },
  lede: {
    fontFamily: fonts.ui,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    textAlign: "center",
  },
  button: {
    alignSelf: "stretch",
    height: tap.lg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.s6,
    borderRadius: radius.md,
  },
  buttonLabel: {
    fontFamily: fonts.uiSemiBold,
    fontSize: type.heading.fontSize,
    lineHeight: type.heading.lineHeight,
  },
  stamp: {
    // Stamped label: small size, small tracking, sentence case.
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
    textAlign: "center",
  },
  overlay: { flex: 1 },
  popover: {
    position: "absolute",
    right: space.s4,
    minWidth: 160,
    borderWidth: 1,
    borderRadius: radius.md,
    // The tab pill's shadow, and for the same reason: this is the second thing
    // in the app that floats over the paper rather than sitting in it.
    shadowColor: "#221E1A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 8,
  },
  popoverRow: {
    minHeight: tap.min,
    justifyContent: "center",
    paddingHorizontal: space.s4,
  },
  popoverLabel: {
    fontFamily: fonts.ui,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
});
