/**
 * Saves — the bookmarks, read from the local mirror.
 *
 * Same contract as Home: cached rows render immediately, freshness is stated
 * once in the strip, and pull-to-refresh is the only way to ask for more.
 */

import { router } from "expo-router";
import { memo } from "react";
import { FlatList, RefreshControl, StyleSheet, Text } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { useAuth } from "@/auth/context";
import { ScreenHeader } from "@/components/screen-header";
import { PatternCard } from "@/components/ui/pattern-card";
import { useFavorites, useSyncStatus, type FavoriteListRow } from "@/data";
import { usePullToSync } from "@/features/sync/pull-to-sync";
import { fonts, space, tabBarInset, trackSmall, type, useTheme } from "@/theme";

const SavedItem = memo(function SavedItem({ row }: { row: FavoriteListRow }) {
  // The row id is the bookmark's; only a pattern bookmark has somewhere to go.
  const patternId = row.patternId;

  return (
    <PatternCard
      variant="list"
      name={row.name ?? "Untitled pattern"}
      designer={row.designer ?? undefined}
      photo={row.photoUrl ?? undefined}
      // `free` is only true when Ravelry said so; false and unknown both stay
      // silent rather than stamping a price this app does not have.
      price={row.free === true ? "free" : undefined}
      // Passed straight through, unlike `price`, because there is no unknown to
      // be careful about: the PDF is on this device or it is not, and the query
      // answers from the download table rather than from anything Ravelry sent.
      // `inLibrary` is the one that would be a guess here, so it stays unset —
      // nothing in the mirror records what the account owns.
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
  );
});

const renderSaved = ({ item }: { item: FavoriteListRow }) => (
  <SavedItem row={item} />
);

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

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.screen, { backgroundColor: colors.paper }]}
    >
      <ScreenHeader
        title="Saves"
        count={`${favorites.length} ${favorites.length === 1 ? "item" : "items"}`}
      />

      <FlatList
        data={favorites}
        renderItem={renderSaved}
        keyExtractor={keyForSaved}
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
              Sign in on the You tab to see the patterns you have saved.
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
});
