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
 * block, the search field, the mode row and the filter row are all *fixed*, and
 * only the grid scrolls. That is what puts the grid's own hairline border at the
 * top of the scroll area — here it is drawn as the chrome's bottom edge so it
 * stays put while the grid moves under it, which reads as the boundary it is.
 *
 * Four bands, and each one holds a different kind of thing:
 *
 * 1. **Discover**, with the count across from it on the same line, saying
 *    plainly what the filters below found. It says nothing about *which*
 *    filters — the rows underneath are already doing that, and a count that
 *    restated them would be the screen talking over itself.
 * 2. **The search field**, under a label that names exactly what it looks in.
 *    Ravelry's `query` matches pattern names and designer names, so the label
 *    says both and promises nothing further — this is not a search of the
 *    pattern text. The words never become a chip and never count towards **All
 *    filters**: a chip exists so the screen says out loud what it is filtering
 *    on, and a field with words in it is already saying it, in the words
 *    themselves. **Clear** is the one way back out, and it is only there when
 *    there is something to clear.
 * 3. **The mode row**: a sentence and a switch. What it turns on is a *derived*
 *    filter set — the drawer restated as yarn weights and a needle range — and
 *    it is a mode rather than a value, which is why it is a switch up here
 *    rather than another chip down among the things it sets. It is also the one
 *    control on the screen that has to explain itself, hence a whole sentence
 *    where everything else gets two words.
 * 4. **The filter row**: **All filters** pinned at the left, the whole of
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
import { FilterChip, Switch, TextField } from '@/components/ui';
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
import { haptics } from '@/haptics';
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
 * What the search field looks in, said once.
 *
 * Ravelry's `query` on `/patterns/search.json` matches pattern names and
 * designer names server-side and nothing else, and this is the sentence that
 * promises exactly that much. Written once because it is said twice — printed
 * as the field's label and handed to the field as its accessible name — and a
 * box that reads one thing and announces another is a box a screen reader user
 * is being lied to about.
 */
const SEARCH_LABEL = 'Search patterns and designers';

/**
 * The label row's height, and the one place on this screen that buys a target
 * by being drawn rather than by `hitSlop`.
 *
 * **Clear** is one line of small type — 18pt — and it owes a finger the same 48
 * as everything else here. It cannot borrow that the way the chips and the mode
 * row do. Their slop works because it stays inside a parent that is already
 * that big: the filter row's 12 and 14 of padding hold the chips' 4, and the
 * mode row's own 4 falls inside the chrome. Slop that leaves its parent's box
 * is hit-tested on iOS and *not* on Android, which would make this a 48pt
 * button on one platform and an 18pt one on the other — so the row is drawn at
 * the full 48 instead and **Clear** takes all of it, height and a finger's
 * width, as a real box.
 *
 * The row pays for itself. It is pulled up by exactly the gap `titleBlock`
 * leaves under the count, and the 15pt its own centring puts under the label is
 * the air the field would have needed above it anyway — so the band costs 10pt
 * more than a bare label over a bare box, not 30. Nothing here is empty: at
 * large type the label wraps and the row grows under it.
 */
const SEARCH_HEAD_HEIGHT = tap.min;

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
   * The typed words, held apart from the filters on purpose.
   *
   * Everything else on this screen goes through `settle`, which re-reads the
   * mode flag off whatever was just committed. Words are not a filter in that
   * sense: typing "shawl" does not stop the results being the stash's yarn
   * weights and the drawer's needles, so routing them through `settle` would
   * ask `matchesStashProfile` about a value it has no opinion on and drop the
   * mode for a reason that has nothing to do with the mode. The hook takes the
   * two separately for the same reason.
   */
  const [query, setQuery] = useState('');

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

  const search = usePatternSearch(toSearchParams(filters), query, status === 'signedIn');
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
    // The row owns the press, so the row owns the tick: `Switch` is a drawing
    // and `settle` is shared with the chips, which tick for themselves.
    haptics.tap();
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
            Sign in on the Stash tab and Discover will search Ravelry against your own stash.
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

            {/* Label above the box, never a placeholder — `TextField` has no
                placeholder prop for the reason it gives: a label that vanishes
                the moment somebody types is not a label, and this one is
                carrying the scope of the search, which is exactly the thing a
                half-typed query needs to still be able to check.

                The box is the app's ordinary multiline field and it is left
                that way. A long designer name wraps and the field takes a
                second line, which pushes the grid down — the same bargain the
                mode row's sentence already makes two bands lower, and the
                alternative is a query scrolling off its own right edge where it
                cannot be read back. */}
            <View style={styles.searchBlock}>
              <View style={styles.searchHead}>
                <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>{SEARCH_LABEL}</Text>

                {/* Only when there is something to clear, and its coming and
                    going costs the row no height: the row is floored at
                    `SEARCH_HEAD_HEIGHT` whether it is there or not, so the
                    chrome does not jump under the first keystroke. */}
                {query === '' ? null : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                    onPress={() => {
                      haptics.tap();
                      setQuery('');
                    }}
                    style={styles.clearTarget}>
                    {({ pressed }) => (
                      <Text
                        style={[
                          styles.clear,
                          { color: pressed ? colors.linkPressed : colors.link },
                        ]}>
                        Clear
                      </Text>
                    )}
                  </Pressable>
                )}
              </View>

              {/* No `autoFocus`. Discover opens on an answer — everything the
                  stash could cast on tonight — and a keyboard over that answer
                  would be the screen asking a question instead. Return closes
                  the keyboard and nothing else: the search is already running,
                  300ms behind the typing, so a submit key that "ran" it would
                  be a button for something that had already happened. */}
              <TextField
                value={query}
                onChangeText={setQuery}
                accessibilityLabel={SEARCH_LABEL}
                returnKeyType="done"
              />
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
            // Dragging the grid is how the keyboard leaves, and a tap on a
            // result while it is still up opens that result rather than being
            // eaten as a dismissal — the finger was on a pattern, so the tap
            // was for the pattern.
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              search.unavailable && !settling ? null : (
                <Text style={[styles.quiet, { color: colors.ink2 }]}>
                  {settling ? 'Searching' : nothingFound(query.trim(), count)}
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

/**
 * What the grid says when there is nothing in it.
 *
 * It names whichever of the two things is doing the narrowing, because the one
 * line it used to say sent everybody to the same place. "No patterns match
 * these filters" under a misspelled designer is an instruction to go and undo
 * filters that were never the problem, and the same line under no filters at
 * all is the screen blaming something that is not there. The query is printed
 * back rather than described so that a typo is visible as a typo.
 */
function nothingFound(query: string, filterCount: number): string {
  if (query === '') {
    return 'No patterns match these filters.';
  }

  return filterCount > 0
    ? `No patterns match “${query}” and these filters.`
    : `No patterns match “${query}”.`;
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
    // The whole gap down to the band below, in one place. It used to be spread
    // across a count's margin, the row's own margin and the row's floor, which
    // is how a band nobody had measured ended up 92pt deep. The search block
    // took over that band and pays nothing at its own top, so this is still
    // the only place the gap is written.
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
  searchBlock: {
    paddingHorizontal: space.s4,
    // Up by the gap `titleBlock` pays under the count, because the label row
    // below carries its own — the row is drawn at 48 to hold **Clear**'s box
    // and centres an 18pt label in it, which leaves 15 above the words. Left
    // as it was, that 15 would sit under the block's own 12 and the band would
    // open with 27pt of nothing, which is the 92pt band starting over.
    //
    // Negative here rather than on the row inside it, and that is the part to
    // not "tidy": pulling the *row* up would put its box outside this view,
    // and a touch outside a parent is not hit-tested on Android. Pulled here,
    // the whole block moves and every box in it stays inside `chrome`.
    marginTop: -space.s3,
    // No gap: the row's own centring is the space above the box.
    //
    // The floor is the filter row's sum in miniature. The mode row under this
    // carries `MODE_SLOP` of 4 and the field's box carries no slop at all, so
    // 12 leaves 8pt belonging to neither control. Take it under 4 and the mode
    // row's target reaches up over the bottom edge of the box, and a tap on
    // the end of a half-typed query toggles the mode instead.
    paddingBottom: space.s3,
  },
  searchHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.s3,
    // A floor, not a height — see `SEARCH_HEAD_HEIGHT`. A label that wraps at
    // large type grows the row and takes the box down with it.
    minHeight: SEARCH_HEAD_HEIGHT,
  },
  fieldLabel: {
    // Takes what **Clear** leaves and wraps inside it. It is 29 characters and
    // it wraps rather than ellipsing, for the reason the mode row's sentence
    // does: it is the only place the field says what it looks in.
    flexShrink: 1,
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
  },
  clearTarget: {
    // The whole of the row's height and a finger's width of it, drawn rather
    // than slopped. `stretch` overrides the row's centring so the box is the
    // row; the word inside it stays centred and sits at the right-hand end,
    // hard against the screen's own 16pt inset where the thumb already is.
    alignSelf: 'stretch',
    minWidth: tap.min,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  clear: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
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
