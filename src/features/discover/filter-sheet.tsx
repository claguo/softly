/**
 * Every filter Ravelry's pattern search has, in one sheet.
 *
 * The vocabulary is not small — 207 categories, 251 attributes, 43 languages —
 * and that single fact decides most of what this file looks like:
 *
 * - **Nothing is mounted until it is asked for.** Every section is collapsed on
 *   open and its contents are not rendered at all while it is, and a branch of
 *   the category tree is not rendered until the branch above it is opened. A
 *   sheet that mounted its whole vocabulary would be five hundred pressables
 *   deep before the slide animation finished, and it would show. Closing one
 *   buys its contents the length of an exit animation and then unmounts them,
 *   which is a different thing from leaving them mounted and hidden — see the
 *   note on the motion below.
 * - **It edits a draft, not the screen's filters.** `usePatternSearch` turns a
 *   filter change into a request, so a sheet that applied live would fire a
 *   search per tap — twenty of them on the way to one set of results the
 *   knitter actually wanted. The draft is seeded from `value` each time the
 *   sheet opens, and only Show patterns hands it back; dismissing throws it
 *   away, which is what a knitter who swipes down means by swiping down.
 *
 * The row at the very top is the one control here that is not a word out of
 * Ravelry's vocabulary. Makeable with materials in your stash is a *mode*: what
 * it turns on is the knitter's own drawer restated as two ordinary filters, a
 * set of yarn weights and a needle range, which is why it is a switch above the
 * sections rather than another chip inside the two sections it writes to. It
 * holds no state of its own — `matchesStashProfile` reads its position back off
 * the draft — so unticking a weight under Yarn weight below turns it off on the
 * way past, and the filters it writes are counted in the badge, chipped on the
 * rail and dropped by Clear all exactly like any others.
 *
 * Flat option sets are chips, because they are a vocabulary to graze rather
 * than a list to read. The category tree is rows instead: it nests three deep,
 * chips cannot show that, and a node is selectable in its own right at every
 * level — Ravelry will filter on Clothing as happily as on Cardigan — so the
 * row carries a selection target and, when it has children, a separate
 * disclosure beside it.
 *
 * Sort is the first of the sections and is deliberately not counted anywhere:
 * it reorders the grid, it never removes anything from it, and a badge that
 * said "1 filter" for having chosen Newest would be describing a narrowing that
 * did not happen.
 *
 * `pattern-search-filters` and `reference` are imported from their own modules
 * rather than through the `@/data` barrel: everything this sheet needs is a
 * constant, and the barrel opens the database.
 */

import { useState, type JSX, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/app-button';
import { FilterChip } from '@/components/ui/filter-chip';
import { TextField } from '@/components/ui/text-field';
import {
  ATTRIBUTE_GROUPS,
  AVAILABILITY,
  CRAFTS,
  LANGUAGES,
  PATTERN_CATEGORIES,
  PHOTO_OPTIONS,
  RANGE_FILTERS,
  SORTS,
  SOURCE_TYPES,
  type AttributeGroup,
  type AttributeParam,
  type CategoryNode,
  type FilterOption,
} from '@/data/pattern-search-filters';
import { YARN_WEIGHTS } from '@/data/reference';
import {
  countFilters,
  matchesStashProfile,
  needleSizeSelected,
  NO_FILTERS,
  setPhoto,
  setRange,
  setSort,
  toggleNeedleSize,
  toggleValue,
  withoutStashProfile,
  withStashProfile,
  type ListKey,
  type PatternFilterState,
  type Range,
  type RangeKey,
} from '@/features/discover/filter-state';
import {
  formatMm,
  type NeedleRange,
  type StashMaterial,
  type StashWeight,
} from '@/features/discover/stash-profile';
import { haptics } from '@/haptics';
import { fonts, space, tap, trackSmall, type, useTheme } from '@/theme';

export type FilterSheetProps = {
  readonly visible: boolean;
  readonly value: PatternFilterState;
  /** The stash's yarn weights, for the makeable row. See `withStashProfile`. */
  readonly stashWeights: readonly StashWeight[];
  /** The needle drawer's span, or null when nothing has been measured. */
  readonly stashRange: NeedleRange | null;
  /** The skeins on hand, one row each, for Your stash. See `deriveMaterials`. */
  readonly materials: readonly StashMaterial[];
  /** The drawer's distinct sizes, thinnest first. See `deriveNeedleSizes`. */
  readonly needleSizes: readonly number[];
  readonly onClose: () => void;
  readonly onApply: (next: PatternFilterState) => void;
};

/** Which list an attribute group's values belong to. See the note in the data. */
const LIST_FOR: Record<AttributeParam, ListKey> = { pa: 'attributes', fit: 'fit' };

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
 * How a disclosure opens and shuts.
 *
 * Declarative layout animations rather than an animated height, because the
 * height is not knowable: the ranges section holds fields that grow a line when
 * a number wraps, and a category branch is as tall as whatever is under it.
 * Measuring content and then animating the measurement is the thing that breaks
 * the first time the content changes size on its own — `LinearTransition` on the
 * container animates whatever height it *became*, so the sections below slide
 * instead of jumping and nobody has to know the number in advance.
 *
 * Timed, never sprung: 200ms out of a quadratic ease is quick enough to feel
 * like a direct answer to the tap and quiet enough to belong to a screen made of
 * hairlines. Shutting is faster than opening — leaving is not information, and a
 * long exit is a sheet arguing with a knitter who has already moved on.
 *
 * Built once at module scope. The builders are plain values, so sharing them
 * across every section costs nothing, and no per-render identity means nothing
 * for the React Compiler to have an opinion about.
 */
const SHIFT = LinearTransition.duration(200).easing(Easing.out(Easing.quad));
const OPEN = FadeIn.duration(200).easing(Easing.out(Easing.quad));
const SHUT = FadeOut.duration(120).easing(Easing.in(Easing.quad));

/** The two ends of a range, as typed rather than as parsed. */
type RangeDraft = { readonly min: string; readonly max: string };

type RangeDrafts = Record<RangeKey, RangeDraft>;

const NO_RANGE: RangeDraft = { min: '', max: '' };

function bound(value: number | null | undefined): string {
  return typeof value === 'number' ? String(value) : '';
}

/** One range field's two boxes, written out from a band the state already holds. */
function rangeDraft(range: Range | undefined): RangeDraft {
  return range === undefined
    ? NO_RANGE
    : { min: bound(range.min), max: bound(range.max) };
}

/**
 * The four range fields, filled in from a filter state.
 *
 * The typed text is held separately from the parsed range because they are not
 * the same thing while a knitter is mid-number: "4." is a legal thing to be
 * halfway through typing and an illegal thing to hold in state, and a field
 * that redrew itself from the parse would eat the dot.
 */
function rangeDrafts(state: PatternFilterState): RangeDrafts {
  const drafts = {} as { [K in RangeKey]: RangeDraft };

  for (const filter of RANGE_FILTERS) {
    drafts[filter.key] = rangeDraft(state.ranges[filter.key]);
  }

  return drafts;
}

/**
 * Number-shaped text, kept so by hand.
 *
 * `TextField` has no `keyboardType`, so this field opens the full keyboard and
 * anything at all can be typed into it. Filtering on the way in is what keeps
 * the value honest: numerals and at most one decimal point, and everything else
 * simply never arrives.
 */
function numeric(text: string): string {
  const cleaned = text.replace(/[^0-9.]/g, '');
  const point = cleaned.indexOf('.');

  return point === -1
    ? cleaned
    : cleaned.slice(0, point + 1) + cleaned.slice(point + 1).replace(/\./g, '');
}

/** An end of a range, or null for "open". An unfinished number is open too. */
function parseBound(text: string): number | null {
  const value = Number(text);
  return text !== '' && Number.isFinite(value) ? value : null;
}

/** What the section header says about a range that has been filled in. */
function rangeSummary(draft: RangeDraft): string | undefined {
  if (draft.min === '' && draft.max === '') {
    return undefined;
  }
  if (draft.min === '') {
    return `up to ${draft.max}`;
  }
  if (draft.max === '') {
    return `${draft.min} and up`;
  }
  return `${draft.min}–${draft.max}`;
}

/** How many of a group's own options and its children's are set. */
function countGroup(state: PatternFilterState, group: AttributeGroup): number {
  const chosen = group.param === 'fit' ? state.fit : state.attributes;
  const own = group.options.filter((option) => chosen.includes(option.permalink)).length;

  return group.children.reduce((total, child) => total + countGroup(state, child), own);
}

/** The badge on a section header: a count, or nothing when there is nothing. */
function tally(count: number): string | undefined {
  return count > 0 ? String(count) : undefined;
}

/**
 * A section: a header that is always there, and contents that are not.
 *
 * The header carries whatever the draft has to say about the section it is
 * closed over, because a collapsed section that has three things set in it and
 * says nothing is a section a knitter has to open to trust.
 */
function Section({
  label,
  value,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  value?: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const { colors } = useTheme();

  return (
    // The container owns the motion: its own height changes when the body below
    // mounts, and `layout` is what turns that change into a slide rather than a
    // jump — for this section and for every section under it.
    <Animated.View layout={SHIFT}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={value === undefined ? label : `${label}, ${value}`}
        onPress={() => {
          haptics.tap();
          onToggle();
        }}
        style={({ pressed }) => [
          styles.sectionHeader,
          {
            borderBottomColor: colors.hairline,
            backgroundColor: pressed ? colors.surfaceSunk : colors.surface,
          },
        ]}>
        <Text
          style={[
            styles.sectionLabel,
            // Set sections read at full strength closed as well as open: the
            // label is the only thing on screen for them most of the time.
            { color: expanded || value !== undefined ? colors.ink : colors.ink2 },
          ]}>
          {label}
        </Text>
        {value === undefined ? null : (
          <Text style={[styles.sectionValue, { color: colors.ink2 }]}>{value}</Text>
        )}
        <Text style={[styles.sectionGlyph, { color: colors.ink2 }]}>
          {expanded ? '−' : '+'}
        </Text>
      </Pressable>

      {/* Still conditional, and that is the point: a collapsed section mounts
          nothing at all. `exiting` buys the contents a moment on screen on the
          way out and Reanimated unmounts them when it is over, which is a
          different thing from keeping them mounted and hidden. */}
      {expanded ? (
        <Animated.View
          entering={OPEN}
          exiting={SHUT}
          style={[styles.sectionBody, { borderBottomColor: colors.hairline }]}>
          {children}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

/** A flat vocabulary, grazed rather than read: the spaced chip, wrapping. */
function ChipRow({
  options,
  selected,
  onPress,
}: {
  options: readonly FilterOption[];
  selected: (permalink: string) => boolean;
  onPress: (permalink: string) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map((option) => (
        <FilterChip
          key={option.permalink}
          label={option.label}
          active={selected(option.permalink)}
          onPress={() => onPress(option.permalink)}
        />
      ))}
    </View>
  );
}

/**
 * The one mark this sheet uses for "chosen": a tick, drawn rather than set.
 *
 * Drawn because the face cannot set it. Solway Light carries 224 codepoints,
 * and the app's other row-level marks are all inside them — "×" U+00D7, "−"
 * U+2212, "‹" U+2039, "›" U+203A, "·" U+00B7, "–" U+2013 — but U+2713 and both
 * its neighbours U+2714 and U+2715 are not. A tick set as text therefore never
 * renders in this app's face at all: it misses, falls through to whatever the
 * platform substitutes, and arrives in a typeface belonging to some other
 * program. That is visible long before it is measurable, and it was noticed.
 *
 * So this follows `tab-glyph.tsx` instead, whose handoff instruction covers
 * exactly this case: drawn as vectors, plain views, no icon set substituted.
 * One node does it — a box with two of its four borders, turned a quarter of
 * the way back. Do not "simplify" this to a character; the character is not in
 * the font.
 *
 * Weight is the one judgement here. The tab glyphs stroke at 1.5, but they are
 * a 20pt alphabet standing alone in the chrome, where this sits in a line of
 * Solway Light at 15pt whose stems measure nearer 0.9. 1.25 is the value
 * between them: heavier than the type it annotates, so it reads as a mark
 * rather than a letter, and light enough not to shout across a row from the
 * "−" two columns to its right.
 *
 * The box is always there and only the tick is conditional. Reserving the width
 * whether or not the row is chosen is what stops two hundred labels reflowing a
 * pixel as they are ticked, and an unchosen row still shows nothing: empty
 * space, not an empty box waiting to be read.
 */
function Mark({ on }: { on: boolean }) {
  const { colors } = useTheme();

  return (
    <View style={styles.markBox}>
      {on ? <View style={[styles.mark, { borderColor: colors.ink }]} /> : null}
    </View>
  );
}

/**
 * The category tree, one branch at a time.
 *
 * Selecting and opening are two different intentions on the same row, so they
 * are two different pressables side by side rather than one that guesses.
 * Children are rendered only while their parent is open, which is the whole
 * reason a tree of this size can live in a sheet at all.
 */
function CategoryRows({
  nodes,
  depth,
  selected,
  opened,
  onSelect,
  onOpen,
}: {
  nodes: readonly CategoryNode[];
  depth: number;
  selected: readonly string[];
  opened: readonly string[];
  onSelect: (permalink: string) => void;
  onOpen: (permalink: string) => void;
}) {
  const { colors } = useTheme();

  return (
    <>
      {nodes.map((node) => {
        const isSelected = selected.includes(node.permalink);
        const isOpen = opened.includes(node.permalink);
        const branch = node.children.length > 0;

        return (
          // Same job as the section container: this node's height changes when
          // its children mount, and `layout` is what makes the rows below it
          // slide down rather than appear somewhere else.
          <Animated.View key={node.permalink} layout={SHIFT}>
            <View style={[styles.row, { borderBottomColor: colors.hairline }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={node.label}
                onPress={() => {
                  haptics.tap();
                  onSelect(node.permalink);
                }}
                style={({ pressed }) => [
                  styles.rowBody,
                  {
                    paddingLeft: space.s4 + depth * space.s4,
                    backgroundColor: pressed ? colors.surfaceSunk : colors.surface,
                  },
                ]}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.rowLabel,
                    { color: isSelected ? colors.ink : colors.ink2 },
                  ]}>
                  {node.label}
                </Text>
                <Mark on={isSelected} />
              </Pressable>

              {branch ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                  accessibilityLabel={`${node.label}, subcategories`}
                  onPress={() => {
                    haptics.tap();
                    onOpen(node.permalink);
                  }}
                  style={({ pressed }) => [
                    styles.rowDisclosure,
                    { backgroundColor: pressed ? colors.surfaceSunk : colors.surface },
                  ]}>
                  <Text style={[styles.rowGlyph, { color: colors.ink2 }]}>
                    {isOpen ? '−' : '+'}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {branch && isOpen ? (
              <Animated.View entering={OPEN} exiting={SHUT}>
                <CategoryRows
                  nodes={node.children}
                  depth={depth + 1}
                  selected={selected}
                  opened={opened}
                  onSelect={onSelect}
                  onOpen={onOpen}
                />
              </Animated.View>
            ) : null}
          </Animated.View>
        );
      })}
    </>
  );
}

export function FilterSheet({
  visible,
  value,
  stashWeights,
  stashRange,
  materials,
  needleSizes,
  onClose,
  onApply,
}: FilterSheetProps): JSX.Element {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [draft, setDraft] = useState<PatternFilterState>(value);
  const [drafts, setDrafts] = useState<RangeDrafts>(() => rangeDrafts(value));
  const [open, setOpen] = useState<readonly string[]>([]);
  const [branches, setBranches] = useState<readonly string[]>([]);

  /**
   * Re-seeding on open, during render rather than in an effect.
   *
   * An effect would let one frame of the last session's draft through — the
   * sheet slides in showing what was abandoned a minute ago and then corrects
   * itself — and `visible` is the only thing it may watch: re-seeding whenever
   * `value` changed would throw away everything typed since the sheet opened.
   * Setting state while rendering is React's own answer to a prop the state has
   * to follow, and it re-renders before it commits, so nothing stale is drawn.
   */
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setDraft(value);
      setDrafts(rangeDrafts(value));
    }
  }

  // Sort is not counted: see the note at the top of the file.
  const count = countFilters(draft);
  const dirty = count > 0 || draft.sort !== null;

  /**
   * Whether the draft *is* the stash profile — read off it, never assumed.
   *
   * A plain const and not state, which is what keeps the switch and the filters
   * from being two accounts of the same fact that can drift apart: a switch that
   * reads on while the thing it names is not in the draft is a switch that lies,
   * and so is one that reads on because a tap said so rather than because a
   * profile is there. Unticking a weight below drops it, seeding from `value` on
   * open makes it follow whatever the screen arrived with, and Clear all drops
   * it because `NO_FILTERS` has no profile in it — none of which needs a line of
   * its own here.
   *
   * Never `true` by assumption, however much this sheet's screen wants to open
   * on the makeable question. A drawer with nothing in it yields a profile with
   * nothing in it, and a switch shown on over an unfiltered grid would be
   * telling a knitter with an empty stash that the whole of Ravelry is what they
   * could cast on tonight. `matchesStashProfile` answers false for a profile
   * that cannot be expressed, so on a brand-new install this opens off and
   * claims nothing.
   */
  const makeable = matchesStashProfile(draft, stashWeights, stashRange);

  const toggleMakeable = () => {
    // The row owns the press, so the row owns the tick: the switch inside it is
    // rendered display-only — no `onValueChange`, and no taps reach it — so the
    // only hand on this is the row's.
    haptics.tap();

    const next = makeable
      ? withoutStashProfile(draft)
      : // Turning the mode back on restores the whole profile: a weight
        // unticked three minutes ago should not silently narrow tomorrow's
        // results. On an empty drawer this writes nothing and the switch stays
        // off, which is the honest answer rather than a failed tap — there is
        // nothing filed to be makeable from yet.
        withStashProfile(draft, stashWeights, stashRange);

    setDraft(next);
    // The needle band is one of the range fields further down this same sheet,
    // and those fields hold their own typed text — so the band has to land in
    // both places or Needle size sits there showing two empty boxes over a
    // filter that is set, and the next keystroke in one of them writes the empty
    // box back over the band. Only that one field is rewritten: the other three
    // hold whatever is half-typed in them, and `rangeDrafts` would round "4."
    // back to "4" on the way past.
    setDrafts((current) => ({
      ...current,
      'needle-size': rangeDraft(next.ranges['needle-size']),
    }));
  };

  /**
   * How much of Your stash is ticked, counted the way the rows draw themselves.
   *
   * Both halves are read straight off the draft rather than accumulated as taps
   * arrive, which is what keeps this number and the marks below it the same
   * fact: unticking DK under Yarn weight puts every DK skein out here on the
   * same render, and the header follows without being told.
   */
  const stashCount =
    materials.filter((material) => draft.weights.includes(material.weight.permalink)).length +
    needleSizes.filter((mm) => needleSizeSelected(draft, mm)).length;

  const toggleNeedle = (mm: number) => {
    haptics.tap();

    // `draft` by hand rather than the functional updater every other row here
    // uses, for `toggleMakeable`'s reason: the band that lands in the state and
    // the text that lands in the Needle size field have to be written from the
    // same `next`, and an updater's argument is not in scope out here. Nothing
    // else on this sheet writes the draft between the two calls.
    const next = toggleNeedleSize(draft, mm, needleSizes);

    setDraft(next);
    setDrafts((current) => ({
      ...current,
      'needle-size': rangeDraft(next.ranges['needle-size']),
    }));
  };

  const toggleSection = (key: string) => {
    setOpen((current) =>
      current.includes(key) ? current.filter((other) => other !== key) : [...current, key],
    );
  };

  const toggleBranch = (permalink: string) => {
    setBranches((current) =>
      current.includes(permalink)
        ? current.filter((other) => other !== permalink)
        : [...current, permalink],
    );
  };

  const toggle = (key: ListKey, permalink: string) => {
    setDraft((current) => toggleValue(current, key, permalink));
  };

  const editRange = (key: RangeKey, end: 'min' | 'max', text: string) => {
    const edited: RangeDraft = { ...drafts[key], [end]: numeric(text) };
    setDrafts({ ...drafts, [key]: edited });

    const min = parseBound(edited.min);
    const max = parseBound(edited.max);
    // Open at both ends is not a range, it is the absence of one.
    const range: Range | null = min === null && max === null ? null : { min, max };

    setDraft((current) => setRange(current, key, range));
  };

  const clearAll = () => {
    setDraft(NO_FILTERS);
    setDrafts(rangeDrafts(NO_FILTERS));
  };

  const show = () => {
    onApply(draft);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      // iOS only, and ignored elsewhere: a card over the screen it came from,
      // which is what makes swiping it down mean "never mind".
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.paper,
            // A page sheet is already inset from the status bar by the
            // presentation itself; Android presents this full-bleed and is not.
            paddingTop: Platform.OS === 'android' ? insets.top : 0,
          },
        ]}>
        <View style={[styles.header, { borderBottomColor: colors.hairline }]}>
          <Text accessibilityRole="header" style={[styles.heading, { color: colors.ink }]}>
            Filters
          </Text>

          <View style={styles.headerActions}>
            {dirty ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear all filters"
                onPress={() => {
                  haptics.tap();
                  clearAll();
                }}
                style={styles.headerAction}>
                {({ pressed }) => (
                  <Text
                    style={[
                      styles.stamp,
                      { color: pressed ? colors.linkPressed : colors.link },
                    ]}>
                    Clear all
                  </Text>
                )}
              </Pressable>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => {
                haptics.tap();
                onClose();
              }}
              style={styles.headerAction}>
              {({ pressed }) => (
                <Text style={[styles.close, { color: pressed ? colors.ink : colors.ink2 }]}>
                  ×
                </Text>
              )}
            </Pressable>
          </View>
        </View>

        {/* The range sections hold this sheet's only writing surfaces, and
            where they land depends on how many sections above them are open —
            the same field sits high on a shut sheet and low on an opened one,
            so there is no one arrangement to design around. The sheet shrinks
            over the keyboard the way every form card in this app does, and the
            footer rides up with it so Show patterns stays reachable mid-number. */}
        <KeyboardAvoidingView
          style={styles.grow}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag">
            {/* First, and above Sort, because it is the question the screen
                behind this sheet opens on. One control, not two: the sentence is
                the switch's name rather than a caption beside it, so the whole row
                takes the press and the whole row is what a screen reader
                announces — a bare switch with a label floating next to it would be
                two things to find and one of them unlabelled. The row is a section
                header's twin in everything but what it does, which is what keeps
                it from reading as an announcement stuck on top of the sheet. */}
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: makeable }}
              accessibilityLabel={MAKEABLE_LABEL}
              onPress={toggleMakeable}
              style={({ pressed }) => [
                styles.makeableRow,
                {
                  borderBottomColor: colors.hairline,
                  backgroundColor: pressed ? colors.surfaceSunk : colors.surface,
                },
              ]}>
              {/* Allowed to wrap. It is 37 characters and the switch takes 51 of
                  the width beside it, so on a narrow screen or at large type it
                  needs a second line — and this sentence is the only place the
                  mode explains itself, so ellipsing it away would leave the switch
                  meaning nothing. The row grows instead. */}
              <Text style={[styles.makeableLabel, { color: colors.ink }]}>
                {MAKEABLE_LABEL}
              </Text>

              {/* The part that shows, and only that. It takes `value` and no
                  `onValueChange`, so state flows one way into it and the row's
                  `onPress` above stays the single writer of the draft; the three
                  props after it are what keep the row the single *control*, taking
                  the switch out of the touch tree, out of the iOS element list and
                  out of the Android tree, so a knitter swiping through finds one
                  sentence to toggle rather than a labelled row and an anonymous
                  switch that do the same thing. No `trackColor` or `thumbColor`:
                  the system's own is the whole reason it is here, and a tinted one
                  would be neither this app's language nor the platform's. */}
              <Switch
                value={makeable}
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
            </Pressable>

            {/* The knitter's own materials, restated as the ordinary filters
                they amount to: a skein is its yarn weight, a needle is a point
                inside the needle band. Directly under the switch because it is
                the same sentence taken apart — the switch selects the lot, and
                these are the lot, one at a time, for a knitter who wants
                patterns for the four skeins of DK rather than for everything in
                the basket.

                Nothing here is stored. A row is ticked because the filter it
                names is in the draft, asked fresh on every render, exactly as
                `matchesStashProfile` asks whether the mode is on — which is the
                whole reason ticking every row makes the switch above come on by
                itself, and the whole reason the switch stays the select-all it
                already was. There is no second account of what is chosen to
                fall out of step with the first, and no new state to clear.

                Used-up and given-away skeins are not on the list. A ball that
                is gone cannot make anything, so it has no business offering a
                filter — and leaving it out is also what keeps the two accounts
                exact, since `deriveWeights` skips the same rows.

                Rows and not chips. Chips are for a vocabulary to graze, and a
                colourway called Cascade 220 Heathers Doeskin is not a word out
                of a vocabulary — it is a named thing, as long as a category
                label, and it belongs in a column that can hold it. */}
            {materials.length > 0 || needleSizes.length > 0 ? (
              <Section
                label="Your stash"
                value={tally(stashCount)}
                expanded={open.includes('stash')}
                onToggle={() => toggleSection('stash')}>
                {/* The rows carry their own hairlines, as in the category tree,
                    so the block takes none of the chip padding and shares its
                    last rule with the section's own. */}
                <View style={styles.tree}>
                  {materials.map((material) => {
                    const selected = draft.weights.includes(material.weight.permalink);

                    return (
                      <View
                        key={material.id}
                        style={[styles.row, { borderBottomColor: colors.hairline }]}>
                        {/* One pressable across the whole row: unlike a category
                            there is nothing here to open, so the row has one
                            meaning and takes the press anywhere. It pays its own
                            left inset because `rowBody` leaves that to the
                            indent a tree row computes. */}
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          accessibilityLabel={`${material.label}, ${material.weight.label}`}
                          onPress={() => {
                            haptics.tap();
                            setDraft((current) =>
                              toggleValue(current, 'weights', material.weight.permalink),
                            );
                          }}
                          style={({ pressed }) => [
                            styles.rowBody,
                            styles.rowFlush,
                            {
                              backgroundColor: pressed ? colors.surfaceSunk : colors.surface,
                            },
                          ]}>
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.rowLabel,
                              { color: selected ? colors.ink : colors.ink2 },
                            ]}>
                            {material.label}
                          </Text>

                          {/* What the row actually selects, said out loud. The
                              tick is on the weight and not on the skein, so a
                              second ball of the same weight lights up beside
                              this one, and a row that named only a colourway
                              would make that look like a fault. */}
                          <Text style={[styles.sectionValue, { color: colors.ink2 }]}>
                            {material.weight.label}
                          </Text>
                          <Mark on={selected} />
                        </Pressable>
                      </View>
                    );
                  })}

                  {needleSizes.map((mm) => {
                    const selected = needleSizeSelected(draft, mm);
                    const label = `${formatMm(mm)} mm needles`;

                    return (
                      <View
                        key={`needle:${mm}`}
                        style={[styles.row, { borderBottomColor: colors.hairline }]}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          accessibilityLabel={label}
                          onPress={() => toggleNeedle(mm)}
                          style={({ pressed }) => [
                            styles.rowBody,
                            styles.rowFlush,
                            {
                              backgroundColor: pressed ? colors.surfaceSunk : colors.surface,
                            },
                          ]}>
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.rowLabel,
                              { color: selected ? colors.ink : colors.ink2 },
                            ]}>
                            {label}
                          </Text>
                          <Mark on={selected} />
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              </Section>
            ) : null}

            <Section
              label="Sort"
              value={SORTS.find((sort) => sort.permalink === draft.sort)?.label}
              expanded={open.includes('sort')}
              onToggle={() => toggleSection('sort')}>
              <ChipRow
                options={SORTS}
                selected={(permalink) => draft.sort === permalink}
                onPress={(permalink) =>
                  // Tapping the chosen sort again gives Ravelry its own default
                  // back, which is not any of the nine and cannot be chosen.
                  setDraft((current) =>
                    setSort(current, current.sort === permalink ? null : permalink),
                  )
                }
              />
            </Section>

            <Section
              label="Craft"
              value={tally(draft.craft.length)}
              expanded={open.includes('craft')}
              onToggle={() => toggleSection('craft')}>
              <ChipRow
                options={CRAFTS}
                selected={(permalink) => draft.craft.includes(permalink)}
                onPress={(permalink) => toggle('craft', permalink)}
              />
            </Section>

            <Section
              label="Availability"
              value={tally(draft.availability.length)}
              expanded={open.includes('availability')}
              onToggle={() => toggleSection('availability')}>
              <ChipRow
                options={AVAILABILITY}
                selected={(permalink) => draft.availability.includes(permalink)}
                onPress={(permalink) => toggle('availability', permalink)}
              />
            </Section>

            <Section
              label="Yarn weight"
              value={tally(draft.weights.length)}
              expanded={open.includes('weights')}
              onToggle={() => toggleSection('weights')}>
              <ChipRow
                options={YARN_WEIGHTS}
                selected={(permalink) => draft.weights.includes(permalink)}
                onPress={(permalink) => toggle('weights', permalink)}
              />
            </Section>

            {RANGE_FILTERS.map((filter) => {
              const key = `range:${filter.key}`;
              const entry = drafts[filter.key];

              return (
                <Section
                  key={key}
                  label={filter.label}
                  value={rangeSummary(entry)}
                  expanded={open.includes(key)}
                  onToggle={() => toggleSection(key)}>
                  <View style={styles.range}>
                    {/* Either end may be left empty, and an empty end is not
                        zero — it is "as far as Ravelry goes", which is why the
                        hint says the unit and not the bounds. */}
                    <View style={styles.rangeEnd}>
                      <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>Min</Text>
                      <TextField
                        value={entry.min}
                        onChangeText={(text) => editRange(filter.key, 'min', text)}
                        accessibilityLabel={`Minimum ${filter.label} in ${filter.unit}`}
                        returnKeyType="done"
                      />
                    </View>
                    <View style={styles.rangeEnd}>
                      <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>Max</Text>
                      <TextField
                        value={entry.max}
                        onChangeText={(text) => editRange(filter.key, 'max', text)}
                        accessibilityLabel={`Maximum ${filter.label} in ${filter.unit}`}
                        returnKeyType="done"
                      />
                    </View>
                  </View>
                  <Text style={[styles.hint, { color: colors.ink2 }]}>{filter.unit}</Text>
                </Section>
              );
            })}

            <Section
              label="Category"
              value={tally(draft.categories.length)}
              expanded={open.includes('categories')}
              onToggle={() => toggleSection('categories')}>
              {/* The rows carry their own hairlines and their own indent, so this
                  block takes none of the padding the chip rows take. */}
              <View style={styles.tree}>
                <CategoryRows
                  nodes={PATTERN_CATEGORIES}
                  depth={0}
                  selected={draft.categories}
                  opened={branches}
                  onSelect={(permalink) => toggle('categories', permalink)}
                  onOpen={toggleBranch}
                />
              </View>
            </Section>

            {ATTRIBUTE_GROUPS.map((group) => {
              const key = `group:${group.permalink}`;

              return (
                <Section
                  key={key}
                  label={group.label}
                  value={tally(countGroup(draft, group))}
                  expanded={open.includes(key)}
                  onToggle={() => toggleSection(key)}>
                  {group.options.length === 0 ? null : (
                    <ChipRow
                      options={group.options}
                      selected={(permalink) =>
                        draft[LIST_FOR[group.param]].includes(permalink)
                      }
                      onPress={(permalink) => toggle(LIST_FOR[group.param], permalink)}
                    />
                  )}

                  {/* A child group is a label and its own chips, not a section of
                      its own: it is already behind one disclosure, and putting it
                      behind a second would hide four sleeve options two taps
                      deep. Its `param` is read off the child rather than the
                      parent — Age / Size / Fit goes to `fit`, and nothing else
                      does. */}
                  {group.children.map((child) => (
                    <View key={child.permalink} style={styles.subGroup}>
                      <Text style={[styles.subLabel, { color: colors.ink2 }]}>
                        {child.label}
                      </Text>
                      <ChipRow
                        options={child.options}
                        selected={(permalink) =>
                          draft[LIST_FOR[child.param]].includes(permalink)
                        }
                        onPress={(permalink) => toggle(LIST_FOR[child.param], permalink)}
                      />
                    </View>
                  ))}
                </Section>
              );
            })}

            <Section
              label="Language"
              value={tally(draft.languages.length)}
              expanded={open.includes('languages')}
              onToggle={() => toggleSection('languages')}>
              {/* Ravelry's own order: most-published first, so English, French
                  and German are where a thumb lands. Alphabetising it would put
                  Afrikaans above all three. */}
              <ChipRow
                options={LANGUAGES}
                selected={(permalink) => draft.languages.includes(permalink)}
                onPress={(permalink) => toggle('languages', permalink)}
              />
            </Section>

            <Section
              label="Source"
              value={tally(draft.sourceTypes.length)}
              expanded={open.includes('sourceTypes')}
              onToggle={() => toggleSection('sourceTypes')}>
              <ChipRow
                options={SOURCE_TYPES}
                selected={(permalink) => draft.sourceTypes.includes(permalink)}
                onPress={(permalink) => toggle('sourceTypes', permalink)}
              />
            </Section>

            <Section
              label="Photo"
              value={PHOTO_OPTIONS.find((option) => option.permalink === draft.photo)?.label}
              expanded={open.includes('photo')}
              onToggle={() => toggleSection('photo')}>
              <ChipRow
                options={PHOTO_OPTIONS}
                selected={(permalink) => draft.photo === permalink}
                onPress={(permalink) =>
                  setDraft((current) =>
                    setPhoto(current, current.photo === permalink ? null : permalink),
                  )
                }
              />
            </Section>
          </ScrollView>

          <View
            style={[
              styles.footer,
              {
                backgroundColor: colors.paper,
                borderTopColor: colors.hairline,
                paddingBottom: space.s4 + insets.bottom,
              },
            ]}>
            <Button variant="primary" size="lg" full onPress={show}>
              Show patterns
            </Button>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  grow: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.s3,
    paddingTop: space.s5,
    paddingHorizontal: space.s4,
    paddingBottom: space.s3,
    borderBottomWidth: 1,
  },
  heading: {
    flexShrink: 1,
    // 28 with the leading opened to 32, like every other display line in the
    // app: Yuji Mai's strokes clip at `type.title`'s 30 on device.
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 32,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s2,
  },
  headerAction: {
    // The honest 48pt box `ScreenHeader` gives its action, pulled back into the
    // header's own padding so the chrome stays the height it was drawn.
    minHeight: tap.min,
    justifyContent: 'center',
    marginVertical: -space.s2,
    paddingHorizontal: space.s2,
  },
  stamp: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
  },
  close: {
    fontFamily: fonts.ui,
    fontSize: 20,
    lineHeight: 24,
  },
  body: { paddingBottom: space.s6 },
  makeableRow: {
    // `sectionHeader`'s own metrics, down to the hairline: this row sits in the
    // same column as forty section headers and reads as one of them, and the
    // 48pt floor means it owes a finger nothing on top — no `hitSlop` bargain
    // here, unlike the chrome the mode is reached from, where every row is drawn
    // short. A label that wraps makes the content taller and the row grows.
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    minHeight: tap.min,
    paddingVertical: space.s2,
    paddingHorizontal: space.s4,
    borderBottomWidth: 1,
  },
  makeableLabel: {
    // Takes what the switch leaves and wraps inside it. `fonts.ui` rather than
    // the header's `uiMedium`: a section label names a place to go and this
    // names a state, so it is set in the sheet's reading weight.
    flex: 1,
    fontFamily: fonts.ui,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    minHeight: tap.min,
    paddingVertical: space.s2,
    paddingHorizontal: space.s4,
    borderBottomWidth: 1,
  },
  sectionLabel: {
    flex: 1,
    fontFamily: fonts.uiMedium,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
  sectionValue: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
  },
  sectionGlyph: {
    fontFamily: fonts.ui,
    fontSize: 15,
    lineHeight: 18,
    width: 12,
    textAlign: 'center',
  },
  sectionBody: { borderBottomWidth: 1 },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: space.s2,
    paddingHorizontal: space.s4,
    paddingVertical: space.s3,
  },
  subGroup: {
    // No rule between a child group and the chips above it: the section's own
    // bottom edge is the only hairline this block is entitled to.
    paddingTop: space.s2,
  },
  subLabel: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
    paddingHorizontal: space.s4,
  },
  tree: {
    // Every row draws its own bottom hairline, and so does the section it sits
    // in — the last row would otherwise land a second rule on the first. Pulled
    // up one point so the two share.
    marginBottom: -1,
  },
  row: { flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 1 },
  rowBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    minHeight: tap.min,
    paddingVertical: space.s2,
    paddingRight: space.s4,
  },
  rowLabel: {
    flex: 1,
    fontFamily: fonts.ui,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
  rowFlush: {
    // A tree row computes its own left inset from its depth; a stash row has no
    // depth to compute one from, so it takes the plain 16 every other left edge
    // in this sheet stops at.
    paddingLeft: space.s4,
  },
  rowDisclosure: {
    width: tap.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowGlyph: {
    fontFamily: fonts.ui,
    fontSize: 15,
    lineHeight: 18,
    width: 12,
    textAlign: 'center',
  },
  markBox: {
    // Held whether or not there is a tick in it — see the note on `Mark`.
    // 20×20 is `tab-glyph`'s own box, which is where the number comes from.
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: {
    // The long arm and the short one, before the turn: a rectangle wearing two
    // of its four borders, rotated back a quarter turn so the corner becomes
    // the tick's point. Square corners hold — nothing here is rounded.
    width: 11,
    height: 5.5,
    borderLeftWidth: 1.25,
    borderBottomWidth: 1.25,
    // Rotation happens about the bounding box's centre, but the ink is all
    // down the left edge and along the bottom, so its own centre of mass hangs
    // about two points below that. The lift puts the tick in the middle of the
    // box it is centred in. It comes first: a translate listed after the
    // rotation would be measured in the rotated frame and go off at 45°.
    transform: [{ translateY: -2 }, { rotate: '-45deg' }],
  },
  range: {
    flexDirection: 'row',
    gap: space.s3,
    paddingHorizontal: space.s4,
    paddingTop: space.s3,
  },
  rangeEnd: { flex: 1, gap: space.s2 },
  fieldLabel: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
  },
  hint: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
    paddingHorizontal: space.s4,
    paddingTop: space.s2,
    paddingBottom: space.s3,
  },
  footer: {
    paddingTop: space.s4,
    paddingHorizontal: space.s4,
    borderTopWidth: 1,
  },
});
