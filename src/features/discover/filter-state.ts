/**
 * What the Discover screen is filtering on, in one place.
 *
 * The rail of chips, the sheet behind it and the stash switch above them are
 * three ways of touching the same value, and this is the value. Nothing here
 * reaches for React, the database or the network: a filter selection is a plain
 * object, `toSearchParams` turns it into the record `usePatternSearch` takes,
 * and `summarize` turns it into the chips that take it apart again.
 *
 * Every string in the state is a **Ravelry permalink**, and only ever one this
 * app has watched `/patterns/search.json` answer 200 for. That is not fussiness.
 * The endpoint answers **500** to a permalink it does not recognise, so a single
 * wrong value does not narrow the grid — it empties the screen and puts an error
 * under it. `@/data/pattern-search-filters` is the vocabulary, written down and
 * probed one value at a time, and nothing outside it is ever emitted: a value
 * that arrives from somewhere else, a saved search from an older build or a
 * table since corrected, is dropped on the way out rather than sent hopefully.
 *
 * The genuinely non-obvious thing is that **a permalink is unique per parameter
 * and not across them**. `chart` is a category (a chart you can work from) and
 * also a `pa` attribute (the pattern comes with one); `collar` is a category and
 * an attribute meaning collared; `convertible` is a category and an attribute
 * too. So there is deliberately no global permalink → label map in this file and
 * there must not be one: `craft`, `pc`, `pa`, `fit`, `weight`, `availability`,
 * `language` and `source-type` each get their own index, built once at module
 * scope, and a chip is always looked up in the index of the field it came from.
 * Those same indexes carry the vocabulary's own order, which is what stops
 * `weight=dk|worsted` from shuffling itself around under a person's thumb as
 * they tap.
 *
 * Age / Size / Fit lives in its own field for the reason the vocabulary file
 * gives: those values travel through `fit`, and sending one to `pa` is a 500.
 * One tree on screen, two fields here.
 */

// Imported from the modules rather than the `@/data` barrel: this file is pure,
// and the barrel opens the database.
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
  type RangeFilter,
} from '@/data/pattern-search-filters';
import { YARN_WEIGHTS } from '@/data/reference';
import {
  formatMm,
  formatNeedleRange,
  groupThousands,
  type NeedleRange,
  type StashWeight,
} from '@/features/discover/stash-profile';

export type RangeKey = RangeFilter['key'];

/** A numeric band. Either end may be open on screen; see `rangeParam`. */
export type Range = { readonly min: number | null; readonly max: number | null };

export type PatternFilterState = {
  readonly craft: readonly string[];
  readonly categories: readonly string[];
  readonly attributes: readonly string[];
  readonly fit: readonly string[];
  readonly weights: readonly string[];
  readonly availability: readonly string[];
  readonly languages: readonly string[];
  readonly sourceTypes: readonly string[];
  readonly photo: string | null;
  /** A `SORTS` permalink, or null to leave Ravelry its own default. */
  readonly sort: string | null;
  readonly ranges: Readonly<Partial<Record<RangeKey, Range>>>;
};

/** Every list empty; the whole of Ravelry. */
export const NO_FILTERS: PatternFilterState = {
  craft: [],
  categories: [],
  attributes: [],
  fit: [],
  weights: [],
  availability: [],
  languages: [],
  sourceTypes: [],
  photo: null,
  sort: null,
  ranges: {},
};

/** The keys that hold a list of permalinks. */
export type ListKey =
  | 'craft'
  | 'categories'
  | 'attributes'
  | 'fit'
  | 'weights'
  | 'availability'
  | 'languages'
  | 'sourceTypes';

/** The order the rail draws the lists in, and the order params are built in. */
const LIST_KEYS: readonly ListKey[] = [
  'craft',
  'categories',
  'attributes',
  'fit',
  'weights',
  'availability',
  'languages',
  'sourceTypes',
];

type Vocabulary = {
  /** The query parameter this field's values belong to. */
  readonly param: string;
  /** permalink → where its own table lists it, so tapping cannot reorder. */
  readonly order: ReadonlyMap<string, number>;
  /** permalink → Ravelry's wording, for the chip. Per field: see the note. */
  readonly label: ReadonlyMap<string, string>;
};

/**
 * One field's table read into two maps. A permalink listed twice within the
 * same field keeps its first place, which is the one a reader would find it in.
 */
function index(param: string, options: readonly FilterOption[]): Vocabulary {
  const order = new Map<string, number>();
  const label = new Map<string, string>();

  options.forEach((option, at) => {
    if (!order.has(option.permalink)) {
      order.set(option.permalink, at);
      label.set(option.permalink, option.label);
    }
  });

  return { param, order, label };
}

/** The category tree flattened depth-first, which is the order it reads in. */
function flattenCategories(nodes: readonly CategoryNode[]): FilterOption[] {
  const flat: FilterOption[] = [];

  const walk = (list: readonly CategoryNode[]) => {
    for (const node of list) {
      flat.push({ permalink: node.permalink, label: node.label });
      walk(node.children);
    }
  };

  walk(nodes);
  return flat;
}

/**
 * Every attribute belonging to one parameter, child groups included. Group
 * permalinks are headings rather than values — none of them has been probed as
 * a search term, so none of them is offered as one.
 */
function flattenAttributes(
  groups: readonly AttributeGroup[],
  param: AttributeParam,
): FilterOption[] {
  const flat: FilterOption[] = [];

  const walk = (list: readonly AttributeGroup[]) => {
    for (const group of list) {
      if (group.param === param) {
        flat.push(...group.options);
      }
      walk(group.children);
    }
  };

  walk(groups);
  return flat;
}

const VOCABULARIES: Record<ListKey, Vocabulary> = {
  craft: index('craft', CRAFTS),
  categories: index('pc', flattenCategories(PATTERN_CATEGORIES)),
  attributes: index('pa', flattenAttributes(ATTRIBUTE_GROUPS, 'pa')),
  fit: index('fit', flattenAttributes(ATTRIBUTE_GROUPS, 'fit')),
  weights: index('weight', YARN_WEIGHTS),
  availability: index('availability', AVAILABILITY),
  languages: index('language', LANGUAGES),
  sourceTypes: index('source-type', SOURCE_TYPES),
};

const PHOTO = index('photo', PHOTO_OPTIONS);
const SORT = index('sort', SORTS);

const RANGE_KEYS: readonly RangeKey[] = RANGE_FILTERS.map((filter) => filter.key);
const RANGE_BOUNDS = new Map(RANGE_FILTERS.map((filter) => [filter.key, filter]));

/**
 * The values of one field, deduplicated, put back into the table's order, and
 * with anything the vocabulary does not know thrown away. Dropping is the safe
 * failure: a missing filter widens the grid, an invented one 500s it.
 */
function ordered(values: readonly string[], vocabulary: Vocabulary): string[] {
  return [...new Set(values)]
    .filter((value) => vocabulary.order.has(value))
    .sort((a, b) => (vocabulary.order.get(a) ?? 0) - (vocabulary.order.get(b) ?? 0));
}

function withList(
  state: PatternFilterState,
  key: ListKey,
  values: readonly string[],
): PatternFilterState {
  return { ...state, [key]: values };
}

/**
 * Ticks a value on, or off if it was already on.
 *
 * The list comes back in the vocabulary's order rather than in tap order, so
 * `weight=dk|worsted` stays `dk|worsted` however a person got there. A
 * permalink the table does not list is refused at the door as well as at the
 * exit — every chip on screen is drawn from the same table, so there is no tap
 * this can swallow, and it keeps the state itself something safe to send.
 */
export function toggleValue(
  state: PatternFilterState,
  key: ListKey,
  permalink: string,
): PatternFilterState {
  const held = state[key];

  return withList(
    state,
    key,
    held.includes(permalink)
      ? held.filter((value) => value !== permalink)
      : ordered([...held, permalink], VOCABULARIES[key]),
  );
}

/**
 * A band with both ends open is the same as no band at all, and is stored that
 * way rather than as an empty object — otherwise `countFilters` would count a
 * filter the rail has nothing to draw for.
 */
export function setRange(
  state: PatternFilterState,
  key: RangeKey,
  range: Range | null,
): PatternFilterState {
  const ranges = { ...state.ranges };

  if (range === null || (range.min === null && range.max === null)) {
    delete ranges[key];
  } else {
    ranges[key] = range;
  }

  return { ...state, ranges };
}

export function setPhoto(state: PatternFilterState, value: string | null): PatternFilterState {
  return { ...state, photo: value };
}

export function setSort(state: PatternFilterState, value: string | null): PatternFilterState {
  return { ...state, sort: value };
}

/**
 * `min|max`, in the filter's own units. The endpoint wants both halves of the
 * pair, so an end left open is sent as the bound from `RANGE_FILTERS` — which
 * is what "open" means to a search that cannot be told about infinity.
 */
function rangeParam(key: RangeKey, range: Range | undefined): string | null {
  const bounds = RANGE_BOUNDS.get(key);

  if (bounds === undefined || range === undefined) {
    return null;
  }
  if (range.min === null && range.max === null) {
    return null;
  }

  return `${formatMm(range.min ?? bounds.floor)}|${formatMm(range.max ?? bounds.ceiling)}`;
}

/** The query params `usePatternSearch` wants. Never an empty value: no key. */
export function toSearchParams(state: PatternFilterState): Record<string, string> {
  const params: Record<string, string> = {};

  for (const key of LIST_KEYS) {
    const vocabulary = VOCABULARIES[key];
    const values = ordered(state[key], vocabulary);
    // A pipe is OR — verified: `dk` + `worsted` returns the two counts summed.
    if (values.length > 0) {
      params[vocabulary.param] = values.join('|');
    }
  }

  for (const key of RANGE_KEYS) {
    const pair = rangeParam(key, state.ranges[key]);
    if (pair !== null) {
      params[key] = pair;
    }
  }

  if (state.photo !== null && PHOTO.label.has(state.photo)) {
    params[PHOTO.param] = state.photo;
  }
  // An unknown sort is not a 500, it is silently ignored, which is worse: the
  // grid would come back in some other order with the chip still saying this.
  if (state.sort !== null && SORT.label.has(state.sort)) {
    params[SORT.param] = state.sort;
  }

  return params;
}

/** One dismissable chip per set value, in the order the rail draws them. */
export type FilterSummary = {
  /** Stable React key. Field-qualified, because permalinks repeat across fields. */
  readonly key: string;
  /** What the chip prints, e.g. "DK", "Cardigan", "4.5–8 mm", "200–500 yd". */
  readonly label: string;
  /** The state with just this one value taken back out. */
  readonly clear: (state: PatternFilterState) => PatternFilterState;
};

/** What a band says on a chip. En dashes, and the unit a knitter would use. */
function rangeLabel(key: RangeKey, range: Range): string | null {
  const { min, max } = range;

  if (min === null && max === null) {
    return null;
  }

  // Needles and hooks borrow the stash drawer's own line, so the two places a
  // person reads a millimetre span cannot drift apart.
  if (min !== null && max !== null && (key === 'needle-size' || key === 'hook-size')) {
    return formatNeedleRange({ min, max });
  }

  const unit = key === 'yardage' ? 'yd' : key === 'gauge' ? 'sts' : 'mm';
  const write = key === 'yardage' ? groupThousands : formatMm;

  if (min !== null && max !== null) {
    return min === max ? `${write(min)} ${unit}` : `${write(min)}–${write(max)} ${unit}`;
  }
  if (min !== null) {
    return `Over ${write(min)} ${unit}`;
  }
  if (max !== null) {
    return `Under ${write(max)} ${unit}`;
  }

  return null;
}

export function summarize(state: PatternFilterState): readonly FilterSummary[] {
  const chips: FilterSummary[] = [];

  for (const key of LIST_KEYS) {
    const vocabulary = VOCABULARIES[key];
    for (const permalink of ordered(state[key], vocabulary)) {
      chips.push({
        key: `${key}:${permalink}`,
        label: vocabulary.label.get(permalink) ?? permalink,
        clear: (current) => toggleValue(current, key, permalink),
      });
    }
  }

  const photo = state.photo === null ? undefined : PHOTO.label.get(state.photo);
  if (state.photo !== null && photo !== undefined) {
    chips.push({
      key: `photo:${state.photo}`,
      label: photo,
      clear: (current) => setPhoto(current, null),
    });
  }

  for (const key of RANGE_KEYS) {
    const range = state.ranges[key];
    const label = range === undefined ? null : rangeLabel(key, range);
    if (label !== null) {
      chips.push({
        key: `range:${key}`,
        label,
        clear: (current) => setRange(current, key, null),
      });
    }
  }

  return chips;
}

/**
 * How many filters are set, for the "All filters" chip's stamped value.
 *
 * Counted off the summary rather than off the state, so the number on the chip
 * and the chips on the rail are the same thing said twice. Sort is not a filter
 * and is not counted; a permalink the vocabulary does not know is not counted
 * either, because it is not going to be sent.
 */
export function countFilters(state: PatternFilterState): number {
  return summarize(state).length;
}

/**
 * The stash and needle drawer, written into the filters — what "Makeable right
 * now" sets. Both keys are *replaced*, not merged: switching the mode on means
 * "these are my materials", not "add mine to whatever is already ticked".
 */
export function withStashProfile(
  state: PatternFilterState,
  weights: readonly StashWeight[],
  range: NeedleRange | null,
): PatternFilterState {
  const permalinks = ordered(
    weights.map((weight) => weight.permalink),
    VOCABULARIES.weights,
  );

  return setRange(
    withList(state, 'weights', permalinks),
    'needle-size',
    range === null ? null : { min: range.min, max: range.max },
  );
}

/** The same two keys taken back out. What turning the mode off does. */
export function withoutStashProfile(state: PatternFilterState): PatternFilterState {
  return setRange(withList(state, 'weights', []), 'needle-size', null);
}

/**
 * Whether the state still carries a full stash profile.
 *
 * The mode is a shorthand for two ordinary filters, and a person is free to
 * edit either of them by hand afterwards. This is how the screen notices and
 * drops the flag, rather than leaving a chip lit for a search that has stopped
 * meaning what the chip says. Extra weights are allowed — the profile is still
 * in there — but the needle band has to be exactly the stash span, since any
 * other band is a different question.
 *
 * An empty profile answers **false**, and that line is the whole point rather
 * than a guard against nothing. Read literally, no weights and no needles match
 * trivially: an empty list is satisfied by anything, and `NO_FILTERS` has no
 * needle band to disagree with. So a brand-new install — nothing filed, nothing
 * measured — would show the stash switch on over the unfiltered whole of
 * Ravelry, which is the same lie this function exists to catch, arrived at from
 * the other side. A profile that cannot be expressed cannot be carried.
 */
export function matchesStashProfile(
  state: PatternFilterState,
  weights: readonly StashWeight[],
  range: NeedleRange | null,
): boolean {
  if (weights.length === 0 && range === null) {
    return false;
  }

  const held = new Set(state.weights);
  if (!weights.every((weight) => held.has(weight.permalink))) {
    return false;
  }

  const needles = state.ranges['needle-size'];
  if (range === null) {
    return needles === undefined;
  }

  return needles !== undefined && needles.min === range.min && needles.max === range.max;
}
