/**
 * The patterns that are not on Ravelry, and their only writer.
 *
 * Most of what a knitter owns is not in Ravelry's catalogue. A leaflet from a
 * wool show, a chart out of a magazine, a page a friend wrote out — none of
 * them has a pattern id, none of them can be searched for, and Ravelry has no
 * endpoint that would put them there. So they are typed in here and they stay
 * here, which makes this the third thing in the mirror that is not a copy of
 * anything: `local.ts` for the needle drawer, `row-counters.ts` for where a
 * knitter has got to, and this. `sync.ts` never touches the table.
 *
 * Two properties carry the whole design, and both are borrowed from `local.ts`:
 *
 * - **A negative id**, walked away from the clock until it is free. Ravelry's
 *   pattern ids are positive and unpredictable, and a custom pattern has to
 *   share a key space with them — `pattern_pdfs` is keyed by pattern id, and
 *   the whole point of these rows is that a PDF can hang off one. Numbering
 *   from the other direction is what lets `importPatternPdf` be reused
 *   unchanged: `pattern-pdfs/-1756000000000.pdf` is a perfectly good filename.
 * - **No refresh after the write, and none possible.** There is nothing on the
 *   network to catch up with. The screens still redraw, because `queries.ts`
 *   builds its stores on `addDatabaseChangeListener` — SQLite's own update hook
 *   — so an insert on this connection wakes every list reading this table by
 *   itself. No store of this module's own is needed: nothing here is tapped at
 *   the end of a row the way a counter is, so the 120ms the stores coalesce
 *   over is invisible.
 *
 * Deleting is the one operation that reaches outside this table. A custom
 * pattern's PDF is keyed by the pattern's id and nothing else will ever collect
 * it, so the file goes with the row — see `deleteCustomPattern`.
 *
 * Synchronous throughout, like the rest of `src/data`: the driver is, and there
 * is no network in the way.
 */

import { eq } from 'drizzle-orm';

import { db } from '@/data/db';
import { deletePatternPdf } from '@/data/pdfs';
import { customPatterns, type CustomPatternRow } from '@/data/schema';

/** A pattern as the Add a pattern sheet describes it. */
export type CustomPatternDraft = {
  /** The one required field. Blank is not a pattern and is refused. */
  readonly name: string;
  readonly designer?: string | null;
  /** Where it is from, in the knitter's own words — a shop, a magazine. */
  readonly sourceName?: string | null;
  readonly yardage?: string | null;
  readonly needleSizes?: string | null;
  readonly gauge?: string | null;
  readonly notes?: string | null;
};

/** Blank is not an answer; it is the box the knitter left alone. */
function trimmed(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const cut = value.trim();
  return cut === '' ? null : cut;
}

/**
 * A negative id nothing else in the table is using.
 *
 * The same three lines as `local.ts`, replicated rather than shared: that one
 * walks the needles and this one walks the patterns, and a helper taking a
 * table would be an abstraction over two call sites that will never grow a
 * third rule between them. Two patterns added inside the same millisecond would
 * otherwise land on the same primary key; walking one further from zero is the
 * cheapest way out and keeps the only property the id has to have.
 */
function freeLocalId(): number {
  let id = -Date.now();

  while (
    db.select({ id: customPatterns.id }).from(customPatterns).where(eq(customPatterns.id, id)).get()
  ) {
    id -= 1;
  }

  return id;
}

/** One custom pattern, whole, or null for an id that names none. */
export function getCustomPattern(id: number): CustomPatternRow | null {
  try {
    return db.select().from(customPatterns).where(eq(customPatterns.id, id)).get() ?? null;
  } catch {
    // Missing and unreadable land in the same place on screen — the row is not
    // there to show — and a database this broken will surface on the list.
    return null;
  }
}

/**
 * Writes one pattern into the shelf and hands back the row as written.
 *
 * `null` when the name is blank, which is the only thing this can refuse: every
 * other field is optional, because a knitter copying a leaflet is not filling
 * in a form and a name alone is a perfectly good record of something that
 * exists nowhere else. The sheet keeps its own button disabled for the same
 * reason, so this is the rule said again where it cannot be worked around.
 */
export function insertCustomPattern(draft: CustomPatternDraft): CustomPatternRow | null {
  const name = trimmed(draft.name);

  if (name === null) {
    return null;
  }

  const addedAt = Date.now();

  const row: CustomPatternRow = {
    id: freeLocalId(),
    name,
    designer: trimmed(draft.designer),
    sourceName: trimmed(draft.sourceName),
    yardage: trimmed(draft.yardage),
    needleSizes: trimmed(draft.needleSizes),
    gauge: trimmed(draft.gauge),
    notes: trimmed(draft.notes),
    createdAt: addedAt,
    updatedAt: addedAt,
  };

  db.insert(customPatterns).values(row).run();

  return row;
}

/**
 * Rewrites one custom pattern.
 *
 * There is no `source` guard here the way there is on a needle, because there
 * is nothing to guard against: every row in this table is one this app wrote,
 * and no sync will ever come along and replace it. The only way to arrive with
 * an id that names nothing is the edit sheet outliving the row behind it, which
 * is what the `null` is for.
 *
 * `createdAt` is kept — when the pattern came onto the shelf is not what an
 * edit changes.
 */
export function updateCustomPattern(
  id: number,
  draft: CustomPatternDraft,
): CustomPatternRow | null {
  const name = trimmed(draft.name);
  const existing = getCustomPattern(id);

  if (existing === null || name === null) {
    return null;
  }

  const row: CustomPatternRow = {
    ...existing,
    name,
    designer: trimmed(draft.designer),
    sourceName: trimmed(draft.sourceName),
    yardage: trimmed(draft.yardage),
    needleSizes: trimmed(draft.needleSizes),
    gauge: trimmed(draft.gauge),
    notes: trimmed(draft.notes),
    updatedAt: Date.now(),
  };

  db.update(customPatterns).set(row).where(eq(customPatterns.id, id)).run();

  return row;
}

/**
 * Throws away one custom pattern, and the PDF that hung off it.
 *
 * The file goes first and it is not optional. A custom pattern's id is this
 * app's own and nothing will ever reissue it, so a `pattern_pdfs` row left
 * behind is a few hundred kilobytes on the phone that no screen can reach and
 * no cleanup will ever collect — unlike a Ravelry pattern, where the id
 * outlives the deletion and the file is still the answer to "does this read
 * offline". `deletePatternPdf` is safe on a pattern that never had one: it
 * checks the file, deletes the row, and says nothing either way.
 *
 * `true` when a pattern went, `false` when the id named none. Synchronous, like
 * every other write in this file, and nothing follows it: `queries.ts` listens
 * to SQLite's own update hook, so the delete wakes the shelf on Stash by itself.
 */
export function deleteCustomPattern(id: number): boolean {
  const existing = getCustomPattern(id);

  if (existing === null) {
    return false;
  }

  deletePatternPdf(id);

  db.delete(customPatterns).where(eq(customPatterns.id, id)).run();

  return true;
}
