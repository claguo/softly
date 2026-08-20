/**
 * Stash — yarn and hardware, in one scroll.
 *
 * Two sections in a single list rather than two lists: the needles are a flush
 * run of rows sharing hairlines, and only one scroll container can keep them
 * edge to edge under the same sync strip.
 *
 * Each section label carries an Add across from it, opening the same two sheets
 * Cast on opens — this is the other door to them, and the one a knitter who is
 * not starting a project would look for. Neither is asked to hand anything
 * back here; see `pending-selection` for what that means and why it matters.
 */

import { router } from "expo-router";
import { memo, useCallback, useEffect, useMemo } from "react";
import {
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { useAuth } from "@/auth/context";
import { ScreenHeader } from "@/components/screen-header";
import { NeedleRow } from "@/components/ui/needle-row";
import { YarnCard } from "@/components/ui/yarn-card";
import {
  fillStashPhotos,
  syncAll,
  tintFor,
  useNeedles,
  useStash,
  useSyncStatus,
  type NeedleListRow,
  type StashListRow,
} from "@/data";
import {
  fonts,
  space,
  tabBarInset,
  trackMicro,
  type,
  useTheme,
} from "@/theme";

/**
 * One list, three row shapes: tagged so the renderer never has to guess.
 *
 * `empty` is a line where the rows would be. Both sections stay on screen even
 * with nothing under them, which they did not used to — an empty section used
 * to be dropped whole. The Add beside each label is why: the knitter with no
 * yarn at all is exactly the one who needs the button, and a heading that
 * disappears takes its button with it.
 */
type StashItem =
  | { kind: "yarn"; yarn: StashListRow }
  | { kind: "needle"; needle: NeedleListRow }
  | { kind: "empty"; line: string };

type StashSection = {
  title: string;
  /** What the Add beside the label says to a screen reader. */
  addLabel: string;
  onAdd: () => void;
  data: StashItem[];
};

/** Ravelry's needle kinds arrive lowercase ("circular", "hook"). Sentence case,
 * never all-caps — this only lifts the first letter. */
function sentence(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const YarnItem = memo(function YarnItem({ row }: { row: StashListRow }) {
  const title = row.colorway ?? row.yarnName ?? "Unnamed yarn";
  // The second line carries whatever else names this yarn: the maker, plus the
  // yarn's own name when the colorway has already taken the title.
  const subtitle = [row.brand, row.colorway === null ? null : row.yarnName]
    .filter((part): part is string => part !== null)
    .join(" · ");

  // The yarn cards are bordered on all four sides, so they are inset and
  // spaced; only the needle rows below run flush and share their hairlines.
  return (
    <View style={styles.yarnItem}>
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
    </View>
  );
});

const NeedleItem = memo(function NeedleItem({ row }: { row: NeedleListRow }) {
  return (
    <NeedleRow
      size={row.sizeMm === null ? "—" : String(row.sizeMm)}
      us={row.sizeUs ?? undefined}
      kind={sentence(row.kind ?? row.name ?? "Needle")}
      length={row.lengthLabel ?? undefined}
      onPress={() =>
        router.push({ pathname: "/needle/[id]", params: { id: row.id } })
      }
    />
  );
});

/** A section with nothing in it yet, said once and quietly. */
const EmptyLine = memo(function EmptyLine({ line }: { line: string }) {
  const { colors } = useTheme();

  return <Text style={[styles.emptyLine, { color: colors.ink2 }]}>{line}</Text>;
});

const renderStashItem = ({ item }: { item: StashItem }) => {
  switch (item.kind) {
    case "yarn":
      return <YarnItem row={item.yarn} />;
    case "needle":
      return <NeedleItem row={item.needle} />;
    case "empty":
      return <EmptyLine line={item.line} />;
  }
};

const keyForStashItem = (item: StashItem) => {
  switch (item.kind) {
    case "yarn":
      return `yarn-${item.yarn.id}`;
    case "needle":
      return `needle-${item.needle.id}`;
    case "empty":
      return `empty-${item.line}`;
  }
};

export default function StashScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { status, user } = useAuth();
  const { data: yarn } = useStash();
  const { data: needles } = useNeedles();
  const sync = useSyncStatus();

  const signedIn = status === "signedIn";
  const username = user?.username ?? null;

  // Neither sheet is asked to hand anything back: this screen is not in the
  // middle of choosing, the way Cast on is when it opens the same two. The
  // rows arrive on their own — both lists are live queries over the writes.
  const addYarn = useCallback(() => router.push("/add-yarn"), []);

  const addNeedle = useCallback(() => router.push("/add-needle"), []);

  // Both sections, always, signed in — see the note on `StashItem`. Signed out
  // there are none at all, and the invitation below takes the whole screen.
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
    ];
  }, [addNeedle, addYarn, needles, signedIn, yarn]);

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

  const onRefresh = useCallback(() => {
    if (username !== null) {
      void syncAll(username);
    }
  }, [username]);

  const renderSectionHeader = useCallback(
    ({ section }: { section: StashSection }) => (
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionLabel, { color: colors.ink2 }]}>
          {section.title}
        </Text>
        {/* Link-colored, and stamped at the same micro size as the label it
            sits across from: this is the screen header's one text action, said
            again per section, because each section adds a different thing. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={section.addLabel}
          onPress={section.onAdd}
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
      <ScreenHeader
        title="Stash"
        count={`${yarn.length + needles.length} on hand`}
      />

      <SectionList
        sections={sections}
        renderItem={renderStashItem}
        renderSectionHeader={renderSectionHeader}
        keyExtractor={keyForStashItem}
        // The needle rows are a flush run; a sticky label riding over them
        // would put a second horizontal rule where the design has one.
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: tabBarInset + insets.bottom }}
        refreshControl={
          username === null ? undefined : (
            <RefreshControl
              refreshing={sync.phase === "syncing"}
              onRefresh={onRefresh}
              tintColor={colors.ink2}
            />
          )
        }
        // Only the signed-out case reaches this now: signed in there are always
        // two sections, and each says for itself when it has nothing under it.
        ListEmptyComponent={
          signedIn ? null : (
            <Text style={[styles.invitation, { color: colors.ink2 }]}>
              Sign in on the You tab to see your yarn and needles.
            </Text>
          )
        }
      />
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
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
  },
  sectionAction: {
    // Padded for the finger, then pulled back out of the layout, so the touch
    // box is honest and the heading stays the height the design drew it.
    paddingLeft: space.s3,
    paddingVertical: space.s2,
    marginVertical: -space.s2,
  },
  sectionActionLabel: {
    // Stamped, like the screen header's action: micro size, micro tracking, no
    // weight bump, sentence case.
    fontFamily: fonts.ui,
    fontSize: type.micro.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
  },
  emptyLine: {
    fontFamily: fonts.ui,
    fontSize: type.micro.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
    paddingBottom: space.s2,
    paddingHorizontal: space.s4,
  },
  invitation: {
    fontFamily: fonts.ui,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    textAlign: "center",
    paddingTop: space.s10,
    paddingHorizontal: space.s4,
  },
});
