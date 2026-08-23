/**
 * Saves — the bookmarks, read from the local mirror.
 *
 * Same contract as Home: cached rows render immediately, freshness is stated
 * once in the strip, and pull-to-refresh is the only way to ask for more.
 */

import { router } from "expo-router";
import { memo, useCallback, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { useAuth } from "@/auth/context";
import { ScreenHeader } from "@/components/screen-header";
import { PatternCard } from "@/components/ui/pattern-card";
import { SwipeRow } from "@/components/ui/swipe-row";
import {
  favoritesDelete,
  refreshFavorites,
  useFavorites,
  useSyncStatus,
  type FavoriteListRow,
} from "@/data";
import { triage, type Problem } from "@/features/start-project/problem";
import { usePullToSync } from "@/features/sync/pull-to-sync";
import { haptics } from "@/haptics";
import { fonts, space, tabBarInset, trackSmall, type, useTheme } from "@/theme";

/** The three ways an unsave can fail, in the words this screen says them. */
const UNSAVE_NOTICES: Record<Problem, string> = {
  failed: "Couldn't unsave the pattern.",
  // Aqua, not mustard: nothing went wrong, the request simply never left.
  offline: "You're offline · try again later.",
  signedOut: "Sign in on the Stash tab to change your saves.",
};

const SavedItem = memo(function SavedItem({
  row,
  busy,
  onUnsave,
}: {
  row: FavoriteListRow;
  /** This bookmark's own unsave is in flight; see `SwipeRow`. */
  busy: boolean;
  onUnsave: (bookmarkId: number) => void;
}) {
  // The row id is the bookmark's; only a pattern bookmark has somewhere to go.
  const patternId = row.patternId;

  return (
    <SwipeRow
      label="Unsave"
      // One tap, and no second asking. Unsaving is the only one of the three
      // deletes in this app that has a way back — saving it again is the same
      // gesture on the pattern — so making it ask twice would be theatre.
      accessibilityLabel="Unsave this pattern"
      busy={busy}
      onCommit={() => onUnsave(row.id)}
    >
      <PatternCard
        variant="list"
        name={row.name ?? "Untitled pattern"}
        designer={row.designer ?? undefined}
        photo={row.photoUrl ?? undefined}
        // `free` is only true when Ravelry said so; false and unknown both stay
        // silent rather than stamping a price this app does not have.
        price={row.free === true ? "free" : undefined}
        // Passed straight through, unlike `price`, because there is no unknown
        // to be careful about: the PDF is on this device or it is not, and the
        // query answers from the download table rather than from anything
        // Ravelry sent. `inLibrary` is the one that would be a guess here, so it
        // stays unset — nothing in the mirror records what the account owns.
        offline={row.offline}
        onPress={
          patternId === null
            ? undefined
            : () =>
                router.push({
                  pathname: "/pattern/[id]",
                  params: { id: patternId },
                })
        }
      />
    </SwipeRow>
  );
});

const keyForSaved = (item: FavoriteListRow) => String(item.id);

export default function SavesScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { status, user } = useAuth();
  const { data: favorites } = useFavorites();
  const sync = useSyncStatus();

  const signedIn = status === "signedIn";
  const username = user?.username ?? null;

  // A gesture on this screen, not the global sync status: see `usePullToSync`.
  const { refreshing, onRefresh } = usePullToSync(username);

  // Which bookmark is on its way out, and what went wrong the last time one
  // was. Nothing here is optimistic: the mirror only loses the row once the
  // refresh behind the delete has come back, so until then it sits there
  // dimmed. See `SwipeRow`.
  const [unsaving, setUnsaving] = useState<number | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);

  const unsave = useCallback(
    (bookmarkId: number) => {
      if (username === null) {
        // Nothing is attempted: a write with no account behind it fails at the
        // client, and saying so here costs no round trip.
        setProblem("signedOut");
        haptics.error();
        return;
      }

      setProblem(null);
      setUnsaving(bookmarkId);

      void (async () => {
        try {
          // The bookmark's id, not the pattern's — a favourite is a record in
          // its own right, and `row.patternId` is only what it points at.
          await favoritesDelete(username, bookmarkId);
          await refreshFavorites(username);

          haptics.warning();
        } catch (error) {
          setProblem(triage(error));
          haptics.error();
        } finally {
          setUnsaving(null);
        }
      })();
    },
    [username],
  );

  const renderSaved = useCallback(
    ({ item }: { item: FavoriteListRow }) => (
      <SavedItem row={item} busy={unsaving === item.id} onUnsave={unsave} />
    ),
    [unsave, unsaving],
  );

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.screen, { backgroundColor: colors.paper }]}
    >
      <ScreenHeader
        title="Saves"
        count={`${favorites.length} ${favorites.length === 1 ? "item" : "items"}`}
      />

      {/* The one thing a swiped-away row cannot say for itself, said once and
          quietly under the heading. It clears on the next attempt. */}
      {problem !== null ? (
        <Text
          style={[
            styles.notice,
            { color: problem === "failed" ? colors.mustard : colors.aqua },
          ]}
        >
          {UNSAVE_NOTICES[problem]}
        </Text>
      ) : null}

      <FlatList
        data={favorites}
        renderItem={renderSaved}
        keyExtractor={keyForSaved}
        // The rows are memoised, so the list has to be told that which one is
        // busy has changed; the rows themselves still bail out unless it is
        // theirs. See `SavedItem`.
        extraData={unsaving}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: tabBarInset + insets.bottom },
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
        ListEmptyComponent={
          !signedIn ? (
            <Text style={[styles.invitation, { color: colors.ink2 }]}>
              Sign in on the Stash tab to see the patterns you have saved.
            </Text>
          ) : sync.lastSyncedAt !== null ? (
            <Text style={[styles.stamp, { color: colors.ink2 }]}>
              Nothing saved yet.
            </Text>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {},
  invitation: {
    fontFamily: fonts.ui,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    textAlign: "center",
    paddingTop: space.s10,
  },
  stamp: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
    textAlign: "center",
    paddingTop: space.s10,
  },
  notice: {
    // The stamped label again, but ranged left under the heading rather than
    // centred in an empty list: this one is about a row, not about the screen.
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
    paddingHorizontal: space.s4,
    paddingBottom: space.s2,
  },
});
