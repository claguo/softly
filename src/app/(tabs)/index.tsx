/**
 * Home — what is on the needles.
 *
 * Every row comes from the local mirror, so the first frame after a cold start
 * is the real list whether or not there is a network. Freshness is said once,
 * quietly, in the sync strip; nothing here ever covers cached rows with a
 * spinner.
 */

import { router } from "expo-router";
import { memo, useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { useAuth } from "@/auth/context";
import { ScreenHeader } from "@/components/screen-header";
import { ProjectCard } from "@/components/ui/project-card";
import { SwipeRow } from "@/components/ui/swipe-row";
import {
  deleteProject,
  deleteRowCounter,
  fillPatternPhotos,
  forgetProjectDetail,
  getRowCounters,
  refreshProjects,
  useProjects,
  useSyncStatus,
  type ProjectListRow,
} from "@/data";
import { triage, type Problem } from "@/features/start-project/problem";
import { usePullToSync } from "@/features/sync/pull-to-sync";
import { haptics } from "@/haptics";
import { fonts, space, tabBarInset, trackSmall, type, useTheme } from "@/theme";

/** The three ways the delete can fail, in the words this screen says them. */
const DELETE_NOTICES: Record<Problem, string> = {
  failed: "Couldn't delete the project.",
  // Aqua, not mustard: nothing went wrong, the request simply never left.
  offline: "You're offline · try again later.",
  signedOut: "Sign in on the Stash tab to delete projects.",
};

/**
 * Ravelry's `status_name`, lowercased, for a project that is actually on the
 * needles. `sync.ts` copies that string through untouched rather than mapping
 * it to an enum Ravelry never promised, so match loosely: anything outside
 * this set is a state worth stamping on the card ("Hibernating", "Frogged").
 */
const ACTIVE_STATUSES = new Set([
  "in progress",
  "in-progress",
  "wip",
  "started",
  "on the needles",
]);

function isActive(row: ProjectListRow): boolean {
  return (
    row.status !== null && ACTIVE_STATUSES.has(row.status.trim().toLowerCase())
  );
}

const ProjectItem = memo(function ProjectItem({
  row,
  busy,
  onDelete,
}: {
  row: ProjectListRow;
  /** This project's own delete is in flight; see `SwipeRow`. */
  busy: boolean;
  onDelete: (id: number) => void;
}) {
  return (
    <SwipeRow
      label="Delete"
      // Asked twice, like the edit sheet asks: this takes the project off
      // Ravelry — photographs, notes and all — and there is no way back.
      confirmLabel="Tap again"
      accessibilityLabel="Delete this project"
      confirmAccessibilityLabel="Tap again to delete this project from Ravelry"
      busy={busy}
      onCommit={() => onDelete(row.id)}
    >
      <ProjectCard
        name={row.name ?? row.patternName ?? "Untitled project"}
        pattern={row.patternName ?? undefined}
        designer={row.designer ?? undefined}
        // The normal case says nothing; only a project that has stopped does.
        status={row.status !== null && !isActive(row) ? row.status : undefined}
        touchedAt={row.updatedAtRemote ?? undefined}
        photo={row.photoUrl ?? undefined}
        patternPhoto={row.patternPhotoUrl ?? undefined}
        onPress={() =>
          router.push({ pathname: "/project/[id]", params: { id: row.id } })
        }
      />
    </SwipeRow>
  );
});

const keyForProject = (item: ProjectListRow) => String(item.id);

export default function HomeScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { status, user } = useAuth();
  const { data: projects } = useProjects();
  const sync = useSyncStatus();

  const signedIn = status === "signedIn";
  const username = user?.username ?? null;

  // A sync that has never landed leaves every status null; counting zero of
  // several projects would read as a bug, so say how many there are instead.
  const anyStatus = projects.some((row) => row.status !== null);
  const activeCount = anyStatus
    ? projects.filter(isActive).length
    : projects.length;

  // Borrowed pattern photographs for the cards that have none of their own.
  // Mostly free — a bookmarked pattern's picture is already in the mirror —
  // and idempotent, so running it whenever the list changes costs one query
  // when there is nothing to do. See `pattern-photos.ts`.
  useEffect(() => {
    if (signedIn) {
      void fillPatternPhotos();
    }
  }, [signedIn, projects]);

  // A gesture on this screen, not the global sync status: see `usePullToSync`
  // for what wiring the spinner to `phase === 'syncing'` did on a tab switch.
  const { refreshing, onRefresh } = usePullToSync(username);

  // Which row is being deleted, and what went wrong the last time one was.
  // There is no optimistic delete anywhere in this app — the mirror only
  // changes when the refresh behind the write comes back — so the row stays on
  // screen, dimmed and untouchable, for as long as that takes.
  const [deleting, setDeleting] = useState<number | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);

  const remove = useCallback(
    (id: number) => {
      if (username === null) {
        // Nothing is attempted: a write with no account behind it fails at the
        // client, and saying so here costs no round trip.
        setProblem("signedOut");
        haptics.error();
        return;
      }

      setProblem(null);
      setDeleting(id);

      void (async () => {
        try {
          await deleteProject(username, id);

          // Only once Ravelry has agreed. Everything here is this device
          // catching up with a project that no longer exists anywhere: the
          // counters and the detail row are the app's own, and no list will
          // ever come along and notice they are orphaned. The same cleanup the
          // edit sheet does, because it is the same deletion.
          for (const counter of getRowCounters(id)) {
            deleteRowCounter(counter.id);
          }

          forgetProjectDetail(id);
          await refreshProjects(username);

          haptics.warning();
        } catch (error) {
          setProblem(triage(error));
          haptics.error();
        } finally {
          // The row is gone from the list by now if this worked; if it did not,
          // this is what un-dims it and closes it back over its own drawer.
          setDeleting(null);
        }
      })();
    },
    [username],
  );

  const renderProject = useCallback(
    ({ item }: { item: ProjectListRow }) => (
      <ProjectItem row={item} busy={deleting === item.id} onDelete={remove} />
    ),
    [deleting, remove],
  );

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.screen, { backgroundColor: colors.paper }]}
    >
      <ScreenHeader
        title="In progress"
        count={`${activeCount} active`}
        action="Add"
        // Nothing is handed along: casting on from here starts from nothing,
        // and the pattern screen is the door that arrives holding one.
        onAction={() => router.push("/start-project")}
      />

      {/* The one thing a swiped-away row cannot say for itself, said once and
          quietly under the heading. It clears on the next attempt. Mustard for
          a delete that was refused, aqua for one that never left the device —
          the same two the sheets use, for the same reason. */}
      {problem !== null ? (
        <Text
          style={[
            styles.notice,
            { color: problem === "failed" ? colors.mustard : colors.aqua },
          ]}
        >
          {DELETE_NOTICES[problem]}
        </Text>
      ) : null}

      <FlatList
        data={projects}
        renderItem={renderProject}
        keyExtractor={keyForProject}
        // The rows are memoised, so the list has to be told that which one is
        // busy has changed; the rows themselves still bail out unless it is
        // theirs. See `ProjectItem`.
        extraData={deleting}
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
              Sign in on the Stash tab to see what is on your needles.
            </Text>
          ) : sync.lastSyncedAt !== null ? (
            <Text style={[styles.stamp, { color: colors.ink2 }]}>
              Nothing on the needles yet.
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
