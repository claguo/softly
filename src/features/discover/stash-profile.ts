/**
 * The stash, read as a Ravelry search filter.
 *
 * Everything here is pure and offline: it turns the locally cached `stash` and
 * `needles` rows into the handful of query params `/patterns/search.json`
 * actually honours, plus the labels the filter rail prints.
 *
 * Two facts about the search endpoint shape this file, both established by
 * probing the live API rather than by reading docs:
 *
 * 1. `weight` takes yarn-weight *permalinks*, pipe-delimited, and pipes are OR
 *    (`dk` 28,294 + `worsted` 27,619 + `aran` 24,182 = `dk|worsted|aran`
 *     80,098). An unrecognised permalink is not ignored — Ravelry answers
 *    **500**. So a weight name is only ever sent after it matches the closed
 *    set below; anything else is dropped rather than guessed at.
 * 2. `needle-size` is a **range**, not a set: `min|max`, in millimetres.
 *    (`4.5|4.5` returns only patterns listing 4.5 mm; `2.5|4.5` returns
 *     patterns in that band; `4.5|2.5` returns 0.) There is no way to express
 *    "any of these sizes", so a drawer of needles becomes the span from the
 *    thinnest to the thickest — wider than the truth, never narrower, which is
 *    the right direction for a screen that suggests rather than promises.
 */

import type { NeedleListRow, RavelryPatternSummary, StashListRow } from '@/data';
// Imported from the module rather than the `@/data` barrel: this file is pure,
// and the barrel opens the database.
import { YARN_WEIGHTS } from '@/data/reference';

/** The twelve weights (see `@/data/reference`), with their order kept. */
const WEIGHT_INDEX = new Map(
  YARN_WEIGHTS.map((weight, order) => [weight.permalink, { ...weight, order }]),
);

/** Common shop spellings for weights Ravelry files under another name. */
const WEIGHT_ALIASES = new Map<string, string>([
  ['chunky', 'bulky'],
  ['super-chunky', 'super-bulky'],
  ['superbulky', 'super-bulky'],
  ['superchunky', 'super-bulky'],
  ['double-knitting', 'dk'],
  ['light-worsted', 'dk'],
  ['lightfingering', 'light-fingering'],
]);

export type StashWeight = { readonly permalink: string; readonly label: string };

/** Millimetre bounds outside which a needle row is junk rather than a needle. */
const MIN_MM = 0.25;
const MAX_MM = 40;

/** Ravelry stops counting at this many results and reports it as the total. */
export const RESULT_CEILING = 100_000;

/**
 * A stash row's weight name as a permalink the search endpoint will accept, or
 * null. Null is the safe answer: sending a wrong permalink 500s the search.
 */
export function toWeightPermalink(name: string | null | undefined): string | null {
  if (typeof name !== 'string') {
    return null;
  }

  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[\s_/]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug === '') {
    return null;
  }

  const stripped = slug.endsWith('-weight') ? slug.slice(0, -'-weight'.length) : slug;
  const canonical = WEIGHT_ALIASES.get(stripped) ?? stripped;

  return WEIGHT_INDEX.has(canonical) ? canonical : null;
}

/** The distinct yarn weights sitting in the stash, thinnest first. */
export function deriveWeights(rows: readonly StashListRow[]): StashWeight[] {
  const found = new Map<string, { permalink: string; label: string; order: number }>();

  for (const row of rows) {
    const permalink = toWeightPermalink(row.weightName);
    const weight = permalink === null ? undefined : WEIGHT_INDEX.get(permalink);
    if (weight && !found.has(weight.permalink)) {
      found.set(weight.permalink, weight);
    }
  }

  return [...found.values()]
    .sort((a, b) => a.order - b.order)
    .map(({ permalink, label }) => ({ permalink, label }));
}

export type NeedleRange = { readonly min: number; readonly max: number };

/** The span the needle drawer covers, in mm. See the module note on ranges. */
export function deriveNeedleRange(rows: readonly NeedleListRow[]): NeedleRange | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const row of rows) {
    const mm = row.sizeMm;
    if (typeof mm !== 'number' || !Number.isFinite(mm) || mm < MIN_MM || mm > MAX_MM) {
      continue;
    }
    min = Math.min(min, mm);
    max = Math.max(max, mm);
  }

  return min <= max ? { min, max } : null;
}

/** Total yardage on hand, for the stash chip's stamped value. */
export function totalYards(rows: readonly StashListRow[]): number {
  let total = 0;

  for (const row of rows) {
    const yards = row.yardsTotal;
    if (typeof yards === 'number' && Number.isFinite(yards) && yards > 0) {
      total += yards;
    }
  }

  return Math.round(total);
}

/** "5", "4.5", "2.75" — a needle size without a trailing zero to trip over. */
export function formatMm(mm: number): string {
  return String(Number(mm.toFixed(2)));
}

export function formatNeedleRange(range: NeedleRange): string {
  return range.min === range.max
    ? `${formatMm(range.min)} mm`
    : `${formatMm(range.min)}–${formatMm(range.max)} mm`;
}

/**
 * Thousands separated by hand rather than through `toLocaleString`: the count
 * has to read the same on every device, and Hermes' Intl data is not something
 * this screen should depend on for one comma.
 */
export function groupThousands(value: number): string {
  const digits = String(Math.round(Math.abs(value)));
  let out = '';

  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) {
      out += ',';
    }
    out += digits[i];
  }

  return value < 0 ? `−${out}` : out;
}

/** "142 patterns". At the ceiling it says so rather than quietly rounding. */
export function formatResultCount(total: number): string {
  const noun = total === 1 ? 'pattern' : 'patterns';
  return total >= RESULT_CEILING
    ? `${groupThousands(RESULT_CEILING)}+ ${noun}`
    : `${groupThousands(total)} ${noun}`;
}

/** The query params for a stash profile. Empty when there is nothing to say. */
export function stashFilters(
  weights: readonly StashWeight[],
  range: NeedleRange | null,
): Record<string, string> {
  const filters: Record<string, string> = {};

  if (weights.length > 0) {
    filters.weight = weights.map((weight) => weight.permalink).join('|');
  }

  if (range) {
    filters['needle-size'] = `${formatMm(range.min)}|${formatMm(range.max)}`;
  }

  return filters;
}

function readName(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const name = (value as { name?: unknown }).name;
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : null;
}

/**
 * Whether the signed-in reader has already bookmarked this pattern.
 *
 * `personal_attributes` only arrives on requests made with a person's token,
 * so its exact keys could not be observed with the read-only app credentials
 * (they answer 500 to `personal_attributes=1`). Several spellings are accepted
 * and anything unrecognised simply reads as "not saved" — a missing heart is a
 * far smaller lie than a wrong one.
 */
export function isSaved(pattern: RavelryPatternSummary): boolean {
  const personal = pattern.personal_attributes;
  if (typeof personal !== 'object' || personal === null) {
    return false;
  }

  return ['favorited', 'favorite', 'is_favorite', 'bookmarked'].some(
    (key) => personal[key] === true,
  );
}

/** The stamped line under a result's name: who made it, and whether it's free. */
export function patternMeta(pattern: RavelryPatternSummary): string {
  const parts: string[] = [];

  const designer = readName(pattern.designer) ?? readName(pattern.pattern_author);
  if (designer !== null) {
    parts.push(designer);
  }
  if (pattern.free === true) {
    parts.push('free');
  }

  return parts.join(' · ');
}

/** The smallest photo that still holds up at half the screen's width. */
export function patternPhoto(pattern: RavelryPatternSummary): string | undefined {
  const photo = pattern.first_photo;
  if (!photo) {
    return undefined;
  }

  for (const key of ['small2_url', 'medium_url', 'small_url', 'square_url'] as const) {
    const url = photo[key];
    if (typeof url === 'string' && url !== '') {
      return url;
    }
  }

  return undefined;
}
