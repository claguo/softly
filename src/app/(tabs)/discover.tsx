/**
 * Discover — Ravelry's pattern search, narrowed.
 *
 * The screen opens on a question the stash can answer: of everything on
 * Ravelry, what could be cast on this evening without buying anything. The
 * stash and needle drawer already live in SQLite, so that filter set is known
 * on the first frame — which is why the filter state arrives through a lazy
 * initialiser rather than being filled in later by an effect. Only the results
 * are online.
 *
 * Layout is the handoff's, which is unusual in one way worth naming: the title
 * block, the mode row and the filter row are all *fixed*, and only the grid
 * scrolls. That is what puts the grid's own hairline border at the top of the
 * scroll area — here it is drawn as the chrome's bottom edge so it stays put
 * while the grid moves under it, which reads as the boundary it is.
 *
 * Three bands, and each one holds a different kind of thing:
 *
 * 1. **Discover**, with the count across from it on the same line, saying
 *    plainly what the filters below found. It says nothing about *which*
 *    filters — the two rows underneath are already doing that, and a count that
 *    restated them would be the screen talking over itself.
 * 2. **The mode row**: a sentence and a switch. What it turns on is a *derived*
 *    filter set — the drawer restated as yarn weights and a needle range — and
 *    it is a mode rather than a value, which is why it is a switch up here
 *    rather than another chip down among the things it sets. It is also the one
 *    control on the screen that has to explain itself, hence a whole sentence
 *    where everything else gets two words.
 * 3. **The filter row**: **All filters** pinned at the left, the whole of
 *    Ravelry's vocabulary one tap behind it, and beside it the rail — one
 *    removable chip per set value, whichever control set it, so the screen
 *    never filters on something it has not said out loud.
 *
 * The chrome is drawn tight on purpose. Every control in it is shorter than the
 * 48pt this app owes a finger and buys the difference back with `hitSlop`, so
 * the vertical space between them is smaller than the space that answers a tap
 * — which is why the gaps here are arithmetic rather than taste, and why the
 * comments give the sums.
 *
 * This screen has its own header rather than `ScreenHeader`: the mode row and
 * the filter row have to sit inside the same fixed block as the title and share
 * its bottom hairline, and `ScreenHeader` draws that hairline as its own last
 * line.
 */

import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/context';
import { FilterChip, Switch } from '@/components/ui';
import { useNeedles, useStash, type RavelryPatternSummary } from '@/data';
import { FilterSheet } from '@/features/discover/filter-sheet';
import {
  countFilters,
  matchesStashProfile,
  NO_FILTERS,
  summarize,
  toSearchParams,
  withoutStashProfile,
  withStashProfile,
  type PatternFilterState,
} from '@/features/discover/filter-state';
import { PatternCell } from '@/features/discover/pattern-cell';
import {
  deriveNeedleRange,
  deriveWeights,
  formatMm,
  formatResultCount,
  isSaved,
  patternMeta,
  patternPhoto,
  type NeedleRange,
  type StashWeight,
} from '@/features/discover/stash-profile';
import { usePatternSearch } from '@/features/discover/use-pattern-search';
import { fonts, space, tabBarInset, tap, trackSmall, type, useTheme } from '@/theme';

/**
 * The switch's name, and the only place the mode explains itself.
 *
 * Written once because it is said twice — drawn on screen, and handed to the
 * row as its accessible name — and those two must not be allowed to drift into
 * a control that reads one thing and announces another. Sentence case like
 * every other label in this app, whatever case it was asked for in.
 */
const MAKEABLE_LABEL = 'Makeable with materials in your stash';

/**
 * What the mode row is drawn at, and what makes up the difference.
 *
 * The row is the control — the switch inside it is not pressable — so it owes a
 * 48pt target. It used to pay that by being 48pt tall, and that was most of the
 * air around it: the switch is 24 and a line of label is 22, so a third of the
 * row was empty on both counts. `FilterChip` already settled this trade for the
 * rest of the app — "40pt by the handoff; the slop restores the 48pt hit box" —
 * and this is the same bargain: 40 drawn, 4 of slop each side, 48 to a finger.
 *
 * Derived from `tap.min` rather than written as 4, so the target survives the
 * minimum being revisited.
 */
const MODE_ROW_DRAWN = 40;
const MODE_SLOP = (tap.min - MODE_ROW_DRAWN) / 2;

/**
 * The stash profile as one string.
 *
 * `deriveWeights` and `deriveNeedleRange` build fresh objects on every render,
 * so an effect that depended on them would re-run forever. What actually
 * changes when a sync lands is the *content*, and this is it: the weights in
 * order, then the span. Two renders of the same drawer produce the same string.
 */
function profileSignature(
  weights: readonly StashWeight[],
  range: NeedleRange | null,
): string {
  const span = range === null ? '' : `${formatMm(range.min)}-${formatMm(range.max)}`;
  return `${weights.map((weight) => weight.permalink).join('|')}#${span}`;
}

export default function DiscoverScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { status } = useAuth();

  // Cache reads. Both are synchronous, so the profile is right on frame one.
  const stash = useStash();
  const needles = useNeedles();

  const stashWeights = deriveWeights(stash.data);
  const stashRange = deriveNeedleRange(needles.data);
  const signature = profileSignature(stashWeights, stashRange);

  // Lazy rather than an effect: the drawer is already on the device, so the
  // first frame can be filtered on it instead of showing all of Ravelry and
  // then narrowing a moment later.
  const [filters, setFilters] = useState<PatternFilterState>(() =>
    withStashProfile(NO_FILTERS, stashWeights, stashRange),
  );

  /**
   * Whether the filters *are* the stash profile — read off them, never assumed.
   *
   * Not `true`, however much this screen wants to open on the makeable
   * question. A drawer with nothing in it yields a profile with nothing in it,
   * and a lit chip over an unfiltered grid would be telling a knitter with an
   * empty stash that the whole of Ravelry is what they could cast on tonight.
   * `matchesStashProfile` answers false for a profile that cannot be expressed,
   * so on a brand-new install the chip opens dark and claims nothing. Anyone
   * tempted to put `true` back should file a skein first and watch it light on
   * its own.
   *
   * Reading `filters` here is safe and is the reason the two lines are in this
   * order: a lazy initialiser runs during this render, so the profile is built
   * on the line above and asked whether it amounts to anything on this one.
   */
  const [makeable, setMakeable] = useState(() =>
    matchesStashProfile(filters, stashWeights, stashRange),
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [applied, setApplied] = useState(signature);

  /**
   * Keeping the mode's filters level with the drawer.
   *
   * A sync landing mid-session can add a weight that was not there when the
   * screen opened, and while the mode is on the filters have to follow it or
   * the chip is naming something that is no longer true.
   *
   * Adjusted during render rather than in an effect: an effect would commit one
   * frame filtered on the old profile and then re-render, which is a search
   * request spent on a filter set nobody asked for. What it watches is the
   * *signature* and not the arrays it stands for — `deriveWeights` builds a
   * fresh array every render, so anything watching those would never settle.
   * The mode being off is what lets a hand-dismissed chip stay dismissed.
   */
  if (makeable && signature !== applied) {
    setApplied(signature);
    setFilters((current) => withStashProfile(current, stashWeights, stashRange));
  }

  const search = usePatternSearch(toSearchParams(filters), status === 'signedIn');
  const signedOut = status === 'signedOut' || search.signedOut;
  // Auth restoring from secure store reads the same as a search in flight:
  // something is coming, and the grid is not empty, it is not filled in yet.
  const settling = search.loading || status === 'loading';

  const summaries = summarize(filters);
  const count = countFilters(filters);


  /**
   * The one place the mode flag is written.
   *
   * Every route into the filters comes through here — the rail's dismissals,
   * the sheet's apply, and the chip's own toggle below — and none of them sets
   * the flag directly. It is asked for, each time, off the filters that were
   * just committed. That is what stops the flag and the filters from being two
   * accounts of the same fact that can drift apart: a control that reads active
   * while the thing it names is not on screen is a control that lies, and so is
   * one that reads active because a tap said so rather than because a profile
   * is there. Dismissing a stash-derived chip by hand or editing the same
   * values in the sheet drops it; filters that happen to *be* the profile take
   * it, however they got there.
   */
  const settle = (next: PatternFilterState) => {
    setFilters(next);
    setMakeable(matchesStashProfile(next, stashWeights, stashRange));
  };

  const toggleMakeable = () => {
    settle(
      makeable
        ? withoutStashProfile(filters)
        : // Turning the mode back on restores the whole profile: a chip
          // dismissed three minutes ago should not silently narrow tomorrow's
          // results. On an empty drawer this writes nothing and the chip stays
          // dark, which is the honest answer rather than a failed tap — there
          // is nothing filed to be makeable from yet.
          withStashProfile(filters, stashWeights, stashRange),
    );
  };

  const renderItem = ({ item }: { item: RavelryPatternSummary }) => {
    const id = item.id;
    return (
      <PatternCell
        name={item.name ?? 'Untitled pattern'}
        meta={patternMeta(item)}
        photo={patternPhoto(item)}
        saved={isSaved(item)}
        onPress={
          typeof id === 'number'
            ? () => router.push({ pathname: '/pattern/[id]', params: { id } })
            : undefined
        }
      />
    );
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.paper }]}>
      {signedOut ? (
        <View style={styles.invitation}>
          <Text style={[styles.title, { color: colors.ink }]}>Discover</Text>
          <Text style={[styles.lede, { color: colors.ink2 }]}>
            Sign in on the You tab and Discover will search Ravelry against your own stash.
          </Text>
        </View>
      ) : (
        <>
          <View style={[styles.chrome, { borderBottomColor: colors.hairline }]}>
            <View style={styles.titleBlock}>
              <Text style={[styles.title, { color: colors.ink }]}>Discover</Text>
              {/* Nothing has to be reserved for this. `total` is withheld until
                  the first page for the current filters lands, so the count
                  comes and goes on every filter change — but the 28pt title
                  beside it is the taller of the two and holds the row's height
                  through all of it, so an arriving number moves nothing.
                  `numberOfLines` is still worth having: "100,000+ patterns"
                  wrapping under a title would. */}
              <Text numberOfLines={1} style={[styles.count, { color: colors.ink2 }]}>
                {search.total === null ? '' : formatResultCount(search.total)}
              </Text>
            </View>

            {/* One control, not two. The sentence is the switch's name rather
                than a caption beside it, so the whole row takes the press and
                the whole row is what a screen reader announces — a bare switch
                with a label floating next to it would be two things to find and
                one of them unlabelled. */}
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: makeable }}
              accessibilityLabel={MAKEABLE_LABEL}
              onPress={toggleMakeable}
              // The row is drawn short and the slop makes the target honest —
              // see `MODE_SLOP`.
              hitSlop={{ top: MODE_SLOP, bottom: MODE_SLOP }}
              style={({ pressed }) => [
                styles.modeRow,
                pressed ? { backgroundColor: colors.surfaceSunk } : null,
              ]}>
              {/* Allowed to wrap. It is 37 characters and the switch takes 44
                  of the width beside it, so on a narrow screen or at large type
                  it needs a second line — and this sentence is the only place
                  the mode explains itself, so ellipsing it away would leave the
                  switch meaning nothing. The row grows instead. */}
              <Text style={[styles.modeLabel, { color: colors.ink }]}>
                {MAKEABLE_LABEL}
              </Text>
              <Switch on={makeable} />
            </Pressable>

            <View style={styles.filterRow}>
              {/* Pinned, outside the scroller, and it has to stay that way:
                  this is the only way into the sheet, and six chips on the rail
                  would carry it off the left edge and out of reach. "To the
                  left of the filters row" is also satisfied by putting it
                  inside as the first chip, which is the version to not
                  "restore" — that one scrolls away. */}
              <FilterChip
                flush
                label="All filters"
                value={count > 0 ? String(count) : undefined}
                onPress={() => setSheetOpen(true)}
              />

              {/* The scroller is what is conditional now, not the band. The row
                  draws whenever the screen does, because it carries the way in;
                  what it must not do is put an empty scrolling area beside that
                  chip when nothing is set, which is the band of padding the old
                  guard existed to prevent. */}
              {summaries.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.railScroller}
                  contentContainerStyle={styles.rail}>
                  {summaries.map((summary) => (
                    <FilterChip
                      key={summary.key}
                      flush
                      removable
                      label={summary.label}
                      onPress={() => settle(summary.clear(filters))}
                    />
                  ))}
                </ScrollView>
              ) : null}
            </View>

            {search.unavailable ? (
              <Text style={[styles.notice, { color: colors.aqua }]}>
                Search unavailable · check connection
              </Text>
            ) : null}
          </View>

          <FlatList
            data={search.patterns}
            renderItem={renderItem}
            keyExtractor={keyOf}
            numColumns={2}
            columnWrapperStyle={[styles.row, { borderLeftColor: colors.hairline }]}
            contentContainerStyle={[
              styles.grid,
              { paddingBottom: tabBarInset + insets.bottom },
            ]}
            onEndReached={search.loadMore}
            onEndReachedThreshold={0.6}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={7}
            ListEmptyComponent={
              search.unavailable && !settling ? null : (
                <Text style={[styles.quiet, { color: colors.ink2 }]}>
                  {settling ? 'Searching' : 'No patterns match these filters.'}
                </Text>
              )
            }
            ListFooterComponent={
              settling && search.patterns.length > 0 ? (
                <Text style={[styles.quiet, { color: colors.ink2 }]}>Loading more</Text>
              ) : null
            }
          />

          <FilterSheet
            visible={sheetOpen}
            value={filters}
            onClose={() => setSheetOpen(false)}
            onApply={settle}
          />
        </>
      )}
    </SafeAreaView>
  );
}

function keyOf(pattern: RavelryPatternSummary, index: number): string {
  return typeof pattern.id === 'number' ? String(pattern.id) : `row-${index}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // Fixed chrome. Its bottom edge is the grid's own top hairline.
  chrome: { borderBottomWidth: 1 },
  titleBlock: {
    flexDirection: 'row',
    // The count sits on the title's baseline, not under its descender.
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.s3,
    paddingTop: space.s5,
    paddingHorizontal: space.s4,
    // The whole gap above the mode row, in one place. It used to be spread
    // across a count's margin, the row's own margin and the row's floor, which
    // is how a band nobody had measured ended up 92pt deep.
    paddingBottom: space.s3,
  },
  title: {
    flexShrink: 1,
    // The handoff's 28/1.05. Leading opened to 32 for the same reason the
    // 16px cell name is: Yuji Mai's strokes clip at 1.05 on device.
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 32,
  },
  count: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
    // Lifts the count off its own descender so it sits on the title's baseline.
    paddingBottom: space.s1,
  },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    // No floor. The switch's 24 and this padding draw the row at
    // `MODE_ROW_DRAWN`, and `hitSlop` at the call site pays the rest of the
    // 48pt target — a row drawn at 48 was the air the user was looking at.
    //
    // Nothing needs to floor it: a label that wraps makes the content taller
    // and the row grows with it, which is all `minHeight` was doing for the
    // two-line case. It was the tap target it was really holding up.
    paddingVertical: space.s2,
    paddingHorizontal: space.s4,
  },
  modeLabel: {
    // Takes what the switch leaves and wraps inside it.
    flex: 1,
    fontFamily: fonts.ui,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // 17 rather than 16, and it is the pinned chip that earns it now: every
    // chip in this row is `flush`, which pulls it 1px left to share its
    // neighbour's border, and the pinned one is the only chip in the run
    // without a neighbour to share with.
    paddingLeft: space.s4 + 1,
    // Load-bearing, and the first thing a later tightening pass will reach for.
    // These chips carry `hitSlop` of 4 and the mode row above carries
    // `MODE_SLOP` of its own, so 12 leaves 4pt belonging to neither. Take it
    // under 8 and the two slops meet, and which control answers a tap in the
    // overlap stops being "the one under the finger" and starts being whichever
    // React Native happens to hit-test first.
    paddingTop: space.s3,
    paddingBottom: 14,
  },
  railScroller: { flex: 1 },
  rail: {
    // No compensating pixel here any more, and its absence is the point: the
    // first scrolling chip *does* have a neighbour now — the pinned chip, hard
    // against this scroller's left edge — so its own -1 falls on that chip's
    // right border, where the scroller clips it. One shared hairline, exactly
    // as between any other two chips in the run. A `paddingLeft: 1` restored
    // here would draw the two borders side by side and thicken that one seam.
    paddingRight: space.s4,
  },
  notice: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
    paddingHorizontal: space.s4,
    paddingBottom: space.s3,
  },
  grid: { flexGrow: 1 },
  // The grid's left edge. On the row rather than the cell so both columns
  // stay exactly the same width.
  row: { borderLeftWidth: 1 },
  quiet: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
    textAlign: 'center',
    paddingVertical: space.s6,
  },
  invitation: {
    flex: 1,
    paddingHorizontal: space.s4,
    paddingTop: space.s5,
    paddingBottom: tabBarInset,
    gap: space.s5,
  },
  lede: {
    fontFamily: fonts.ui,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    maxWidth: 420,
  },
});
