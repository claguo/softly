/**
 * Home — what is on the needles.
 *
 * Every row comes from the local mirror, so the first frame after a cold start
 * is the real list whether or not there is a network. Freshness is said once,
 * quietly, in the sync strip; nothing here ever covers cached rows with a
 * spinner.
 */

import { router } from "expo-router";
import { memo, useCallback } from "react";
import { FlatList, RefreshControl, StyleSheet, Text } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { useAuth } from "@/auth/context";
import { ScreenHeader } from "@/components/screen-header";
import { ProjectCard } from "@/components/ui/project-card";
import {
  syncAll,
  useProjects,
  useSyncStatus,
  type ProjectListRow,
} from "@/data";
import { fonts, space, tabBarInset, trackMicro, type, useTheme } from "@/theme";

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
}: {
  row: ProjectListRow;
}) {
  return (
    <ProjectCard
      name={row.name ?? row.patternName ?? "Untitled project"}
      pattern={row.patternName ?? undefined}
      designer={row.designer ?? undefined}
      // The normal case says nothing; only a project that has stopped does.
      status={row.status !== null && !isActive(row) ? row.status : undefined}
      touchedAt={row.updatedAtRemote ?? undefined}
      photo={row.photoUrl ?? undefined}
      onPress={() =>
        router.push({ pathname: "/project/[id]", params: { id: row.id } })
      }
    />
  );
});

const renderProject = ({ item }: { item: ProjectListRow }) => (
  <ProjectItem row={item} />
);

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

  const onRefresh = useCallback(() => {
    if (username !== null) {
      void syncAll(username);
    }
  }, [username]);

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.screen, { backgroundColor: colors.paper }]}
    >
      <ScreenHeader
        title="In progress"
        count={`${activeCount} active`}
        action="Add"
      />

      <FlatList
        data={projects}
        renderItem={renderProject}
        keyExtractor={keyForProject}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: tabBarInset + insets.bottom },
        ]}
        refreshControl={
          username === null ? undefined : (
            <RefreshControl
              refreshing={sync.phase === "syncing"}
              onRefresh={onRefresh}
              tintColor={colors.ink3}
            />
          )
        }
        ListEmptyComponent={
          !signedIn ? (
            <Text style={[styles.invitation, { color: colors.ink2 }]}>
              Sign in on the You tab to see what is on your needles.
            </Text>
          ) : sync.lastSyncedAt !== null ? (
            <Text style={[styles.stamp, { color: colors.ink3 }]}>
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
    fontSize: type.micro.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
    textAlign: "center",
    paddingTop: space.s10,
  },
});
