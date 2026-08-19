/**
 * Ravelry's reference ids, as constants rather than lookups.
 *
 * Crafts and project statuses are Ravelry's own fixed rows. Both have their
 * own endpoints (`POST /projects/crafts.json`,
 * `POST /projects/project_statuses.json`) and both would answer with exactly
 * the numbers below — they were read from the live API on 2026-08-19 to get
 * them. Spending a round trip on an answer that cannot change is a round trip
 * that can fail, and a project cannot be created without one, so they are
 * written down here instead.
 *
 * Needle sizes are the opposite case: 54 rows keyed by millimetre, too many to
 * copy and the wrong thing to guess at. Those stay a live read —
 * `getNeedleSizes` in `ravelry.ts`, memoized for the session.
 *
 * Yarn weights sit between the two. The twelve names are a closed set and a
 * screen has to draw them offline, so they are written down here; their ids
 * are not guessable and stay a live read (`getYarnWeights`, `yarnWeightId`).
 * Needle types sit in the same place for a different reason: `NEEDLE_TYPES`
 * below is a floor to draw before `getNeedleTypes` answers, and after it has
 * failed.
 */

export const CRAFT_CROCHET = 1;
export const CRAFT_KNITTING = 2;
export const CRAFT_MACHINE_KNITTING = 6;
export const CRAFT_LOOM_KNITTING = 7;

export const PROJECT_STATUS_IN_PROGRESS = 1;
export const PROJECT_STATUS_FINISHED = 2;
export const PROJECT_STATUS_HIBERNATING = 3;
export const PROJECT_STATUS_FROGGED = 4;

/** Stash statuses: 1 in stash, 2 used up, 3 to trade, 4 gone, 5 in progress. */
export const STASH_STATUS_IN_STASH = 1;

export type StashStatusName = {
  readonly id: number;
  /** Sentence case, as a knitter would say it rather than as a database row. */
  readonly label: string;
};

/**
 * The five a stash entry can be in, for the chips on the edit sheet.
 *
 * Ravelry's own wording, read back off a live entry cycled through every id on
 * 2026-08-19 rather than paraphrased — these are the words the knitter already
 * knows from ravelry.com, and `stash_status.name` on a synced row will say
 * exactly this. Six and up answer 400, so the set really is closed.
 */
export const STASH_STATUSES: readonly StashStatusName[] = [
  { id: STASH_STATUS_IN_STASH, label: 'In stash' },
  { id: 5, label: 'In progress' },
  { id: 2, label: 'All used up' },
  { id: 3, label: 'Will trade or sell' },
  { id: 4, label: 'Traded/sold/gifted' },
];

export type ColorFamily = {
  /** Ravelry's `color_family_id`, straight off `/color_families.json`. */
  readonly id: number;
  readonly label: string;
  /** What the swatch is painted. Ours, not Ravelry's — see below. */
  readonly swatch: string;
};

/**
 * Ravelry's twenty colour families, read from `/color_families.json` on
 * 2026-08-19 and written down for the same reason as the crafts above: the
 * rows cannot change, and a colour picker that needs a round trip before it can
 * draw is a colour picker that is blank on a train.
 *
 * The hex is ours. Every record in that endpoint carries `color: null` — the
 * API names the families and paints none of them — so these are chosen to read
 * as dyed wool rather than as web primaries, which is what the swatch is
 * standing in for. The `id` is Ravelry's and is the only part that is written.
 *
 * Ordered around the wheel and then through the neutrals, which is how a person
 * looks for a colour. Ravelry's own `spectrum_order` is not that order — it
 * starts at Red-purple and puts Multicolored last but one — so it is not used.
 */
export const COLOR_FAMILIES: readonly ColorFamily[] = [
  { id: 5, label: 'Red', swatch: '#B23A32' },
  { id: 4, label: 'Red-orange', swatch: '#CE5A34' },
  { id: 3, label: 'Orange', swatch: '#DC7633' },
  { id: 2, label: 'Yellow-orange', swatch: '#E39A2C' },
  { id: 1, label: 'Yellow', swatch: '#E8C33A' },
  { id: 12, label: 'Yellow-green', swatch: '#8AA83F' },
  { id: 11, label: 'Green', swatch: '#4A8A55' },
  { id: 10, label: 'Blue-green', swatch: '#2F8A87' },
  { id: 9, label: 'Blue', swatch: '#3B6EA5' },
  { id: 8, label: 'Blue-purple', swatch: '#5560A0' },
  { id: 7, label: 'Purple', swatch: '#6C4A8C' },
  { id: 6, label: 'Red-purple', swatch: '#9B3A63' },
  { id: 17, label: 'Pink', swatch: '#D98BA6' },
  { id: 16, label: 'Brown', swatch: '#7A5A42' },
  { id: 18, label: 'Natural/Undyed', swatch: '#D9CDB6' },
  { id: 14, label: 'White', swatch: '#F4F1EA' },
  { id: 15, label: 'Gray', swatch: '#9A9A98' },
  { id: 13, label: 'Black', swatch: '#2A2A2A' },
  // Ravelry sends this one's name with a trailing tab in it. Trimmed here
  // rather than at the point of use, because it is written down once.
  { id: 20, label: 'Rainbow', swatch: '#C96A4E' },
  { id: 19, label: 'Multicolored', swatch: '#8A6FA0' },
];

/** The family a `color_family_id` names, or null for one we do not know. */
export function colorFamily(id: number | null | undefined): ColorFamily | null {
  if (typeof id !== 'number') {
    return null;
  }

  return COLOR_FAMILIES.find((family) => family.id === id) ?? null;
}

/**
 * What colour to lay over a skein's photograph, or undefined for none.
 *
 * The shade the knitter matched by eye wins; the family's own swatch stands in
 * until they have. A skein filed under no family at all gets nothing, and the
 * photograph is shown as it came — which is the honest default, since a
 * catalogue shot is of *some* colourway and inventing one would be a guess.
 */
export function tintFor(
  colorHex: string | null | undefined,
  colorFamilyId: number | null | undefined,
): string | undefined {
  if (typeof colorHex === 'string' && colorHex !== '') {
    return colorHex;
  }

  return colorFamily(colorFamilyId)?.swatch;
}

export type YarnWeightName = {
  /** What `/patterns/search.json` accepts, and how a weight is keyed here. */
  readonly permalink: string;
  /** Ravelry's own `yarn_weight.name`, in sentence case. */
  readonly label: string;
};

/**
 * Ravelry's twelve yarn weights, thinnest first. Verified: every permalink
 * below answers 200 on the search endpoint, and every label matches the name
 * the yarn weight table hands back.
 */
export const YARN_WEIGHTS: readonly YarnWeightName[] = [
  { permalink: 'thread', label: 'Thread' },
  { permalink: 'cobweb', label: 'Cobweb' },
  { permalink: 'lace', label: 'Lace' },
  { permalink: 'light-fingering', label: 'Light fingering' },
  { permalink: 'fingering', label: 'Fingering' },
  { permalink: 'sport', label: 'Sport' },
  // Kept as Ravelry writes it: an initialism, not a shouted word.
  { permalink: 'dk', label: 'DK' },
  { permalink: 'worsted', label: 'Worsted' },
  { permalink: 'aran', label: 'Aran' },
  { permalink: 'bulky', label: 'Bulky' },
  { permalink: 'super-bulky', label: 'Super bulky' },
  { permalink: 'jumbo', label: 'Jumbo' },
];

export type NeedleTypeName = {
  /** How a type is keyed on screen; slugified from the label. */
  readonly permalink: string;
  /** Sentence case, and lowercased before it is written to a row's `kind`. */
  readonly label: string;
};

/**
 * The four kinds of needle a knitter is holding, for when the table cannot be
 * fetched.
 *
 * `GET /needles/types.json` is the real list and `getNeedleTypes` asks for it,
 * but the sheet that writes a needle has to draw *something* on the first
 * frame and has to keep working on a plane. Nothing is written from these
 * beyond the word itself — a local needle records the type's name, not an id —
 * so a short list that is a little coarser than Ravelry's costs nothing but
 * detail, where an empty sheet would cost the whole feature.
 */
export const NEEDLE_TYPES: readonly NeedleTypeName[] = [
  { permalink: 'straight', label: 'Straight' },
  { permalink: 'circular', label: 'Circular' },
  { permalink: 'double-pointed', label: 'Double pointed' },
  { permalink: 'hook', label: 'Hook' },
];

const CRAFT_IDS: Record<string, number> = {
  crochet: CRAFT_CROCHET,
  knitting: CRAFT_KNITTING,
  'machine-knitting': CRAFT_MACHINE_KNITTING,
  'loom-knitting': CRAFT_LOOM_KNITTING,
};

/**
 * A pattern's `craft.permalink` as the craft id a write wants.
 *
 * Knitting is the fallback for anything unrecognised, including a pattern that
 * carries no craft at all: it is the overwhelmingly common case, and a project
 * filed under the wrong craft is a field the knitter can change on Ravelry,
 * where a failed create is not.
 */
export function craftId(permalink: string | null | undefined): number {
  if (typeof permalink !== 'string') {
    return CRAFT_KNITTING;
  }

  const key = permalink.trim().toLowerCase().replace(/_/g, '-');
  return CRAFT_IDS[key] ?? CRAFT_KNITTING;
}
