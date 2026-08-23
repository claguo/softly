/**
 * What a row counter says, in words.
 *
 * Nothing here reads the database and nothing writes one. A counter arrives
 * from `@/data/row-counters` as four nullable fields and a number, and every
 * screen that draws one — the project's record, the bar over the PDF — has to
 * turn that into the same two lines, so the turning happens once and here.
 *
 * The rules are all about what to do with an absence, which is most of what a
 * counter is: a knitter reaching for one mid-row names it later or never.
 */

import type { RowCounterRow } from "@/data";

export type StitchType = {
  /** Stable across renames of the label; what the chip is keyed by. */
  readonly key: string;
  /** Sentence case, as a knitter says it. */
  readonly label: string;
};

/**
 * The stitches a counter is usually kept for, as chips.
 *
 * Nine, and deliberately not a taxonomy: Ravelry has no stitch table to be
 * faithful to, and this is a shortcut past typing "stockinette" for the tenth
 * time rather than a closed set. Anything not on it is typed into the box
 * beside them, and the column stores whichever of the two was said.
 */
export const STITCH_TYPES: readonly StitchType[] = [
  { key: "stockinette", label: "Stockinette" },
  { key: "garter", label: "Garter" },
  { key: "ribbing", label: "Ribbing" },
  { key: "seed", label: "Seed" },
  { key: "moss", label: "Moss" },
  { key: "cable", label: "Cable" },
  { key: "lace", label: "Lace" },
  { key: "brioche", label: "Brioche" },
  { key: "colorwork", label: "Colorwork" },
];

/**
 * The line that names a counter: "Body · stockinette", or "Rows".
 *
 * An unnamed counter is the common one — the first thing a knitter does with a
 * new counter is tap it, not christen it — so it gets a word rather than a
 * blank line, and "Rows" is what it is counting. The stitch hangs off the
 * separator the whole app uses for a second fact about the first one.
 */
export function counterTitle(counter: RowCounterRow): string {
  const name = counter.name ?? "Rows";
  return counter.stitchType === null ? name : `${name} · ${counter.stitchType}`;
}

/** "42 / 120" where the pattern gave a total, and plainly "42" where it did not. */
export function counterReading(counter: RowCounterRow): string {
  return counter.maxRows === null
    ? String(counter.count)
    : `${counter.count} / ${counter.maxRows}`;
}

/**
 * Whether this counter has arrived.
 *
 * Greater-than-or-equal rather than equal, because the count is allowed past
 * the total — see `adjustRowCounter`. A counter with no total is never done:
 * there is nothing for it to have reached.
 */
export function counterDone(counter: RowCounterRow): boolean {
  return counter.maxRows !== null && counter.count >= counter.maxRows;
}

/** The counters still being worked, oldest first, in the order they came. */
export function activeCounters(
  counters: readonly RowCounterRow[],
): readonly RowCounterRow[] {
  return counters.filter((counter) => !counterDone(counter));
}

/**
 * A typed total, as a number of rows or as nothing at all.
 *
 * Nothing at all is the answer for an empty box, a decimal, a nought and
 * anything a numeric keyboard still let through — and the sheets act on it
 * silently. A counter without a total is a perfectly good counter, so there is
 * no error to raise about a box that has not been filled in properly yet.
 */
export function readRowTotal(typed: string): number | null {
  const value = Number(typed.trim());
  return Number.isInteger(value) && value > 0 ? value : null;
}
