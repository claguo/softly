/**
 * Discover — makeable now.
 *
 * The screen opens on a question the stash can answer: of everything on
 * Ravelry, what could be cast on this evening without buying anything. The
 * stash and needle drawer already live in SQLite, so the filter set is known on
 * the first frame; only the results are online.
 *
 * Layout is the handoff's, which is unusual in one way worth naming: the top
 * bar, the title block and the filter rail are all *fixed*, and only the grid
 * scrolls. That is what puts the grid's own hairline border at the top of the
 * scroll area — here it is drawn as the chrome's bottom edge so it stays put
 * while the grid moves under it, which reads as the boundary it is.
 *
 * This screen has its own header rather than `ScreenHeader`: the design gives
 * Discover a wordmark bar and a two-line display title, and `ScreenHeader`'s
 * contract (one line, one count, one brass action) has no room for either.
 */

import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/context';
import { FilterChip } from '@/components/ui';
import { useNeedles, useStash, type RavelryPatternSummary } from '@/data';
import { PatternCell } from '@/features/discover/pattern-cell';
import {
  deriveNeedleRange,
  deriveWeights,
  formatNeedleRange,
  formatResultCount,
  groupThousands,
  isSaved,
  patternMeta,
  patternPhoto,
  stashFilters,
  totalYards,
} from '@/features/discover/stash-profile';
import { usePatternSearch } from '@/features/discover/use-pattern-search';
import { fonts, space, tabBarInset, trackMicro, type, useTheme } from '@/theme';

/** Two lines of display type, per mode. The second line has to stay honest. */
const TITLES = {
  makeable: ['Makeable', 'right now'],
  everything: ['Everything', 'Ravelry has'],
} as const;

export default function DiscoverScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { status } = useAuth();

  // Cache reads. Both are synchronous, so the chips are right on frame one.
  const stash = useStash();
  const needles = useNeedles();

  const [makeable, setMakeable] = useState(true);
  const [droppedWeights, setDroppedWeights] = useState<readonly string[]>([]);
  const [droppedNeedles, setDroppedNeedles] = useState(false);

  const stashWeights = deriveWeights(stash.data);
  const activeWeights = stashWeights.filter(
    (weight) => !droppedWeights.includes(weight.permalink),
  );
  const stashNeedles = deriveNeedleRange(needles.data);
  const needleRange = droppedNeedles ? null : stashNeedles;

  const filters = makeable ? stashFilters(activeWeights, needleRange) : {};

  const search = usePatternSearch(filters, status === 'signedIn');
  const signedOut = status === 'signedOut' || search.signedOut;
  // Auth restoring from secure store reads the same as a search in flight:
  // something is coming, and the grid is not empty, it is not filled in yet.
  const settling = search.loading || status === 'loading';

  const yards = totalYards(stash.data);
  const [titleTop, titleBottom] = makeable ? TITLES.makeable : TITLES.everything;

  const toggleMakeable = () => {
    // Turning the mode back on restores the whole profile: a chip dismissed
    // three minutes ago should not silently narrow tomorrow's results.
    setMakeable((on) => !on);
    setDroppedWeights([]);
    setDroppedNeedles(false);
  };

  const dropWeight = (permalink: string) => {
    setDroppedWeights((dropped) =>
      dropped.includes(permalink) ? dropped : [...dropped, permalink],
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
      <View style={[styles.topBar, { borderBottomColor: colors.hairline }]}>
        <Text style={[styles.wordmark, { color: colors.ink }]}>Soft Goods</Text>
        <Text style={[styles.stamp, { color: colors.ink3 }]}>Discover</Text>
      </View>

      {signedOut ? (
        <View style={styles.invitation}>
          <Text style={[styles.title, { color: colors.ink }]}>
            {TITLES.makeable[0]}
            {'\n'}
            {TITLES.makeable[1]}
          </Text>
          <Text style={[styles.lede, { color: colors.ink2 }]}>
            Sign in on the You tab and Discover will search Ravelry against your own stash.
          </Text>
        </View>
      ) : (
        <>
          <View style={[styles.chrome, { borderBottomColor: colors.hairline }]}>
            <View style={styles.titleBlock}>
              <Text style={[styles.title, { color: colors.ink }]}>
                {titleTop}
                {'\n'}
                {titleBottom}
              </Text>
              {search.total !== null ? (
                <Text style={[styles.count, { color: colors.ink3 }]}>
                  {formatResultCount(search.total)}
                </Text>
              ) : null}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rail}>
              <FilterChip
                flush
                label="Stash"
                value={yards > 0 ? `${groupThousands(yards)} yd` : undefined}
                active={makeable}
                onPress={toggleMakeable}
              />
              {makeable
                ? activeWeights.map((weight) => (
                    <FilterChip
                      key={weight.permalink}
                      flush
                      removable
                      label={weight.label}
                      onPress={() => dropWeight(weight.permalink)}
                    />
                  ))
                : null}
              {makeable && needleRange ? (
                <FilterChip
                  flush
                  removable
                  label={formatNeedleRange(needleRange)}
                  onPress={() => setDroppedNeedles(true)}
                />
              ) : null}
            </ScrollView>

            {search.unavailable ? (
              <Text style={[styles.notice, { color: colors.slate }]}>
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
                <Text style={[styles.quiet, { color: colors.ink3 }]}>
                  {settling ? 'Searching' : 'No patterns match these filters.'}
                </Text>
              )
            }
            ListFooterComponent={
              settling && search.patterns.length > 0 ? (
                <Text style={[styles.quiet, { color: colors.ink3 }]}>Loading more</Text>
              ) : null
            }
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.s3,
    paddingVertical: 14,
    paddingHorizontal: space.s4,
    borderBottomWidth: 1,
  },
  wordmark: {
    fontFamily: fonts.display,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: 0.17,
  },
  stamp: {
    fontFamily: fonts.ui,
    fontSize: type.micro.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
  },
  // Fixed chrome. Its bottom edge is the grid's own top hairline.
  chrome: { borderBottomWidth: 1 },
  titleBlock: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.s3,
    paddingTop: space.s5,
    paddingHorizontal: space.s4,
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
    fontSize: type.micro.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
    paddingBottom: space.s1,
  },
  rail: {
    // 17 rather than 16: every chip is `flush`, which pulls it 1px left to
    // share its neighbour's border, and the first chip has no neighbour.
    paddingLeft: space.s4 + 1,
    paddingRight: space.s4,
    paddingBottom: 14,
  },
  notice: {
    fontFamily: fonts.ui,
    fontSize: type.micro.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
    paddingHorizontal: space.s4,
    paddingBottom: space.s3,
  },
  grid: { flexGrow: 1 },
  // The grid's left edge. On the row rather than the cell so both columns
  // stay exactly the same width.
  row: { borderLeftWidth: 1 },
  quiet: {
    fontFamily: fonts.ui,
    fontSize: type.micro.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
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
