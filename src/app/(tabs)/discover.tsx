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
 * block and the filter row are both *fixed*, and only the grid scrolls. That is
 * what puts the grid's own hairline border at the top of the scroll area — here
 * it is drawn as the chrome's bottom edge so it stays put while the grid moves
 * under it, which reads as the boundary it is.
 *
 * Two bands, and each one holds a different kind of thing:
 *
 * 1. **Discover**, with the count on the line under it and a search button
 *    across from it. The count says plainly what the filters below found and
 *    nothing about *which* filters — the rows underneath are already doing
 *    that, and a count that restated them would be the screen talking over
 *    itself. The button is the whole of the search: it grows along that same
 *    line into a field, and the title and the count fade out beneath it rather
 *    than being pushed anywhere, so the chrome is exactly as deep with a query
 *    being typed as it is at rest. Closing is the one way back out and it takes
 *    the words with it. Ravelry's `query` matches pattern names and designer
 *    names, which is what `SEARCH_LABEL` promises and the whole of what it
 *    promises — this is not a search of the pattern text. The words never
 *    become a chip and never count towards **All filters**: a chip exists so
 *    the screen says out loud what it is filtering on, and a field with words
 *    in it is already saying it, in the words themselves.
 * 2. **The filter row**: **All filters** pinned at the left, the whole of
 *    Ravelry's vocabulary one tap behind it, and beside it the rail — one
 *    removable chip per set value, whichever control set it, so the screen
 *    never filters on something it has not said out loud.
 *
 * The makeable mode is behind that same chip, at the top of the sheet, and it
 * is a shorthand rather than a value: what it turns on is a *derived* filter
 * set — the drawer restated as yarn weights and a needle range — which is why
 * it is a switch above the sheet's sections rather than another chip down among
 * the things it sets, and why the rail out here draws those weights and that
 * span like any other filter. This screen holds no flag for it. Whether the
 * mode is on is a question about the filters, and `matchesStashProfile` answers
 * it off them each render, so there is nothing here that a hand-dismissed chip
 * could leave saying something the grid has stopped doing.
 *
 * The chrome is drawn tight on purpose. Every control in it but the search
 * button is shorter than the 48pt this app owes a finger and buys the
 * difference back with `hitSlop`, so the vertical space between them is smaller
 * than the space that answers a tap — which is why the gaps here are arithmetic
 * rather than taste, and why the comments give the sums.
 *
 * This screen has its own header rather than `ScreenHeader`: the filter row has
 * to sit inside the same fixed block as the title and share its bottom
 * hairline, and `ScreenHeader` draws that hairline as its own last line.
 */

import Feather from '@react-native-vector-icons/feather';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/context';
import { FilterChip, TextField } from '@/components/ui';
import { useNeedles, useStash, type RavelryPatternSummary } from '@/data';
import { FilterSheet } from '@/features/discover/filter-sheet';
import {
  countFilters,
  matchesStashProfile,
  NO_FILTERS,
  summarize,
  toSearchParams,
  withStashProfile,
  type PatternFilterState,
} from '@/features/discover/filter-state';
import { PatternCell } from '@/features/discover/pattern-cell';
import {
  deriveMaterials,
  deriveNeedleRange,
  deriveNeedleSizes,
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
 * What the search looks in, said once.
 *
 * Ravelry's `query` on `/patterns/search.json` matches pattern names and
 * designer names server-side and nothing else, and this is the sentence that
 * promises exactly that much. Nothing prints it — the header carries a glyph,
 * not a label — so it is the whole of what a screen reader is told about both
 * the button that opens the search and the field that opens under it, and those
 * two have to name the same thing or one of them is announcing something it
 * does not do.
 */
const SEARCH_LABEL = 'Search patterns and designers';

/** The same control once the bar is open, and the only way back to the button. */
const CLOSE_LABEL = 'Close search';

/**
 * The search bar at rest: a square the size of the target it owes.
 *
 * The one control on this screen drawn at the full 48 rather than slopped up to
 * it, and it costs nothing to be. The row it sits in is floored at `tap.min`
 * anyway — that is the height of the field the button opens into — so the 48 is
 * space that was already there. Its open width is measured rather than written:
 * that is the screen less its two 16pt insets, a number this file does not know.
 */
const SEARCH_BUTTON = tap.min;

/**
 * How the search opens and shuts.
 *
 * The register the app's own `Switch` and the filter sheet already set: 200ms
 * out of a quadratic ease, nothing springy, quick enough to read as a direct
 * answer to the tap and quiet enough to belong to a screen made of hairlines.
 * The field's own fade is shorter on the way out than in, for the reason the
 * sheet's sections are — leaving is not information.
 */
const TIMING = { duration: 200, easing: Easing.out(Easing.quad) };
const FIELD_IN = FadeIn.duration(200).easing(Easing.out(Easing.quad));
const FIELD_OUT = FadeOut.duration(120).easing(Easing.in(Easing.quad));

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

  // The same two reads taken a second way, for the sheet's own list of the
  // knitter's materials: the skeins one at a time rather than deduped into
  // weights, and the drawer's sizes rather than the span across them. Fresh
  // arrays every render like the two above, and unmemoized for the same reason
  // — the sheet only draws them, and nothing on this screen watches an identity
  // (`signature` exists precisely so that nothing has to).
  const materials = deriveMaterials(stash.data);
  const needleSizes = deriveNeedleSizes(needles.data);

  // Lazy rather than an effect: the drawer is already on the device, so the
  // first frame can be filtered on it instead of showing all of Ravelry and
  // then narrowing a moment later.
  const [filters, setFilters] = useState<PatternFilterState>(() =>
    withStashProfile(NO_FILTERS, stashWeights, stashRange),
  );

  /**
   * Whether the filters *are* the stash profile — read off them, never assumed.
   *
   * Derived and not held, which is what stops the mode and the filters from
   * being two accounts of the same fact that can drift apart: a screen that
   * behaved as though the mode were on while the thing it names is not among
   * the filters would be searching one way and saying another, and so would one
   * that counted the mode on because a tap said so rather than because a profile
   * is there. Dismissing a stash-derived chip on the rail or editing the same
   * values in the sheet drops it; filters that happen to *be* the profile take
   * it, however they got there. Nothing writes it, so nothing can forget to.
   *
   * Never `true` by assumption, however much this screen wants to open on the
   * makeable question. A drawer with nothing in it yields a profile with nothing
   * in it, and calling that mode on over an unfiltered grid would be telling a
   * knitter with an empty stash that the whole of Ravelry is what they could
   * cast on tonight. `matchesStashProfile` answers false for a profile that
   * cannot be expressed, so on a brand-new install the sheet's switch opens off
   * and claims nothing. Anyone tempted to seed this `true` should file a skein
   * first and watch it come on by itself.
   */
  const makeable = matchesStashProfile(filters, stashWeights, stashRange);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [applied, setApplied] = useState(signature);

  /**
   * The typed words, held apart from the filters on purpose.
   *
   * Everything else on this screen is a value inside `filters` — the rail draws
   * a chip for each one, and the mode is read straight off the set of them.
   * Words belong to neither account: typing "shawl" does not stop the results
   * being the stash's yarn weights and the drawer's needles, and the field the
   * words are in is already saying them out loud, so a chip for them would be
   * the screen repeating itself. The hook takes the two separately for the same
   * reason.
   */
  const [query, setQuery] = useState('');

  /** Whether the header's search is a bar or the button it collapses to. */
  const [searchOpen, setSearchOpen] = useState(false);

  /**
   * How wide the title row is, measured because nothing here can work it out.
   *
   * The bar opens to the full width of that row, and the row is the screen less
   * the block's two 16pt insets — a number that depends on the device, the
   * orientation and the safe area, none of which this file is entitled to
   * assume. It is 0 until the first layout lands, which is one frame, and the
   * animation guards against being asked to open onto that.
   */
  const [rowWidth, setRowWidth] = useState(0);

  /**
   * Keeping the mode's filters level with the drawer.
   *
   * A sync landing mid-session can add a weight that was not there when the
   * screen opened, and while the mode is on the filters have to follow it or
   * the rail is naming a profile that is no longer the drawer's.
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

  const openSearch = () => {
    haptics.tap();
    setSearchOpen(true);
  };

  /**
   * Shutting the bar, and emptying it in the same movement.
   *
   * The words are only reachable while the bar is open, so a query left behind
   * would go on narrowing the grid with nothing on screen saying why — the one
   * thing the chip rail exists to prevent. The keyboard is dismissed by hand
   * because the field goes out with the bar, and an input that unmounts under a
   * raised keyboard leaves it up.
   */
  const closeSearch = () => {
    haptics.tap();
    setSearchOpen(false);
    setQuery('');
    Keyboard.dismiss();
  };

  /**
   * The bar's width, eased between the button and the whole title row.
   *
   * `withTiming` read out of the render rather than a shared value written by
   * hand, which is the bargain the app's own `Switch` settled: Reanimated takes
   * the flag this render names and eases to whichever end it means, and there
   * is no second copy of "is the search open" that can fall out of step with
   * the first. The dependency lists are explicit for the same reason they are
   * there — on native the Babel plugin finds them either way, and the list is
   * what carries the worklet to web.
   *
   * The guard on `rowWidth` is the first frame: a tap before the row has been
   * measured would otherwise open the bar onto nothing.
   */
  const barWidth = useAnimatedStyle(
    () => ({
      width: withTiming(
        searchOpen && rowWidth > 0 ? rowWidth : SEARCH_BUTTON,
        TIMING,
      ),
    }),
    [searchOpen, rowWidth],
  );

  // Two hooks and not one style handed to both: an animated style belongs to
  // the one component it is mounted on.
  const titleFade = useAnimatedStyle(
    () => ({ opacity: withTiming(searchOpen ? 0 : 1, TIMING) }),
    [searchOpen],
  );
  const countFade = useAnimatedStyle(
    () => ({ opacity: withTiming(searchOpen ? 0 : 1, TIMING) }),
    [searchOpen],
  );

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
              <View
                style={styles.titleRow}
                onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}>
                {/* Faded out is gone, and gone to everybody: opacity is a
                    drawing instruction and nothing more, so a title left at 0
                    is still a thing a finger can land on and still a stop on
                    VoiceOver's way through the screen — a knitter swiping the
                    open search would be read a heading and a count that are not
                    there. The three of these together take it out of the row,
                    out of the iOS element list and out of the Android tree. */}
                <Animated.Text
                  accessibilityElementsHidden={searchOpen}
                  importantForAccessibility={searchOpen ? 'no-hide-descendants' : 'auto'}
                  style={[
                    styles.title,
                    styles.headline,
                    {
                      color: colors.ink,
                      pointerEvents: searchOpen ? 'none' : 'auto',
                    },
                    titleFade,
                  ]}>
                  Discover
                </Animated.Text>

                {/* Anchored to the row's right edge and taken out of the flow,
                    so opening the search widens one box leftwards instead of
                    relaying the row — the title underneath stays exactly where
                    it is while it fades, rather than being shoved off its own
                    line. */}
                <Animated.View style={[styles.searchBar, barWidth]}>
                  {searchOpen ? (
                    <Animated.View
                      entering={FIELD_IN}
                      exiting={FIELD_OUT}
                      style={styles.searchField}>
                      {/* Mounted with the bar, which is what focuses it:
                          `TextField` takes `autoFocus` and hands out no ref, so
                          arriving is the only way in. It leaves with the bar
                          too, and that is what keeps a shut field off the focus
                          order — `exiting` is what buys it the length of the
                          collapse first, rather than snatching the words away a
                          frame before the box that holds them moves.

                          Return closes the keyboard and nothing else: the
                          search is already running, 300ms behind the typing, so
                          a submit key that "ran" it would be a button for
                          something that had already happened.

                          Autocorrect is off: what gets typed in here are
                          names, not words, and the dictionary has firm
                          opinions about "Malabrigo" and "Westknits" that
                          nobody searching for them shares. */}
                      <TextField
                        value={query}
                        onChangeText={setQuery}
                        accessibilityLabel={SEARCH_LABEL}
                        autoFocus
                        returnKeyType="done"
                        autoCorrect={false}
                      />
                    </Animated.View>
                  ) : null}

                  {/* One control in one place rather than two that trade
                      places: the glyph changes and the name changes, the box
                      does not move, and the finger that opened the search
                      closes it without going looking for the way out. */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={searchOpen ? CLOSE_LABEL : SEARCH_LABEL}
                    onPress={searchOpen ? closeSearch : openSearch}
                    style={styles.searchTarget}>
                    {({ pressed }) => (
                      <Feather
                        name={searchOpen ? 'x' : 'search'}
                        size={20}
                        color={pressed ? colors.ink2 : colors.ink}
                      />
                    )}
                  </Pressable>
                </Animated.View>
              </View>

              {/* Its own line, and it holds that line whether there is a number
                  for it or not. `total` is withheld until the first page for
                  the current filters lands, so the count comes and goes on
                  every filter change, and a line that collapsed when it went
                  would take the whole chrome up 18pt and hand it back a moment
                  later. `numberOfLines` keeps "100,000+ patterns" on the one
                  line it is given. */}
              <Animated.Text
                numberOfLines={1}
                // Hidden the same three ways the title is, and for the same
                // reason — see the note there.
                accessibilityElementsHidden={searchOpen}
                importantForAccessibility={searchOpen ? 'no-hide-descendants' : 'auto'}
                style={[
                  styles.count,
                  { color: colors.ink2, pointerEvents: searchOpen ? 'none' : 'auto' },
                  countFade,
                ]}>
                {search.total === null ? '' : formatResultCount(search.total)}
              </Animated.Text>
            </View>

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
                      onPress={() => setFilters(summary.clear(filters))}
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

          {/* The drawer goes in as well as the filters: the sheet's own top row
              turns the two into a filter set and reads its switch back out of
              them, and it is this screen that holds the cache reads. `onApply`
              is the whole commit — the sheet edits a draft and hands it over
              once — so `setFilters` is all there is to do with it. */}
          <FilterSheet
            visible={sheetOpen}
            value={filters}
            stashWeights={stashWeights}
            stashRange={stashRange}
            materials={materials}
            needleSizes={needleSizes}
            onClose={() => setSheetOpen(false)}
            onApply={setFilters}
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
    // 12 rather than the 20 the title wants above it, because 8 of that 20 is
    // already paid: `titleRow` is floored at the open field's height and
    // centres a 32pt title in it, which leaves 8 over the words on its own.
    paddingTop: space.s3,
    paddingHorizontal: space.s4,
    // The whole gap down to the band below, in one place. It used to be spread
    // across a count's margin, the row's own margin and the row's floor, which
    // is how a band nobody had measured ended up 92pt deep.
    //
    // 12 here and 8 on `filterRow` are the 20pt this chrome sets between one
    // band and the next. The chips below carry `hitSlop` of 4, so 16 of that 20
    // is space belonging to neither the count's line nor anything a finger can
    // land on. The count is text and takes no slop of its own, which is the only
    // reason a gap this small is safe to draw.
    paddingBottom: space.s3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // The box the search bar is placed against — see `searchBar`.
    position: 'relative',
    // The height the open field needs, held while it is shut. `TextField` is
    // floored at `tap.min` and the button is drawn at the same 48, so the row
    // measures the same in both states and opening the search moves nothing
    // below it. A floor and not a height: at large type the title takes two
    // lines and the row grows with them.
    minHeight: tap.min,
  },
  title: {
    flexShrink: 1,
    // The handoff's 28/1.05. Leading opened to 32 for the same reason the
    // 16px cell name is: Yuji Mai's strokes clip at 1.05 on device.
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 32,
  },
  headline: {
    // The row's only laid-out child — the bar beside it is absolute and takes
    // no width out of the flow — so this is what keeps the word clear of the
    // search button as the type scales up. Not folded into `title`: the
    // signed-out screen draws that same title with nothing beside it.
    marginRight: SEARCH_BUTTON,
  },
  count: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
    // Holds the line while there is no number to put on it: an empty `Text`
    // measures nothing at all. A floor rather than a height, so a count at
    // large type still has room to be as tall as it is.
    minHeight: type.small.lineHeight,
  },
  searchBar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    // The field takes whatever the bar has left, and the bar is what animates,
    // so mid-collapse the field is wider than the box holding it. Clipped
    // rather than left hanging over the title it is uncovering.
    overflow: 'hidden',
  },
  searchField: { flex: 1 },
  searchTarget: {
    width: SEARCH_BUTTON,
    height: SEARCH_BUTTON,
    justifyContent: 'center',
    // The glyph sits at the right-hand end of its box, hard against the
    // screen's own 16pt inset where every other right edge on this screen
    // stops. The rest of the 48 reaches back into the bar, where there is
    // nothing else waiting to take a tap.
    alignItems: 'flex-end',
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
    // What is above this row is the title block's count line, and the whole gap
    // between the two is that block's 12 of bottom padding and this 8: 20 drawn,
    // which is the interval the chrome puts between bands, and 8 rather than 12
    // is what holds it there now that the filter row is the band directly under
    // the count. These chips carry `hitSlop` of 4, so 16 of the 20 belongs to no
    // control at all. Nothing above takes slop — a line of text cannot — so
    // there is no second hit box up there for theirs to meet, which is the
    // constraint that would otherwise put a floor under this number; the sum
    // still has to be re-run if the chips' slop moves.
    paddingTop: space.s2,
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
