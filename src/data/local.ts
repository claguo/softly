/**
 * The rows this app writes for itself.
 *
 * There is exactly one kind, and it exists because Ravelry's needle inventory
 * is read-only. The API has three needle routes — the account's own list, the
 * size table, the type table — and none of them writes: a needle typed into
 * this app has nowhere to be but here. That makes it the only row in the
 * mirror that is not a copy of something Ravelry still has.
 *
 * It is a first-class needle everywhere else. It sorts into the drawer on
 * Stash by size like any other, widens the makeable range on Discover, and
 * goes onto a project the same way, because a project records a size and a
 * size is a size wherever it was written down. Two things keep it safe:
 *
 * - **`source: 'local'`**, which is what `pullNeedles` steps around when it
 *   replaces the table on every sync.
 * - **A negative id.** Ravelry's needle-record ids are positive and this app
 *   has no way to know which ones are taken, so local rows are numbered from
 *   the clock in the other direction and the two can never meet.
 *
 * No refresh follows the write, and none is possible: there is nothing on the
 * network to catch up with. Nor is one needed to update the screens —
 * `queries.ts` builds its stores on `addDatabaseChangeListener`, which is
 * Expo's wrapper around SQLite's own update hook, so an insert on this
 * connection wakes every `useNeedles` on screen by itself.
 */

import { eq } from 'drizzle-orm';

import { db } from '@/data/db';
import { needles, type NeedleRow } from '@/data/schema';

/** A needle as the Add a needle sheet describes it. */
export type LocalNeedle = {
  /** Millimetres, from Ravelry's size table — see `getNeedleSizes`. */
  readonly sizeMm: number;
  /** The US number printed beside it, where that table has one. */
  readonly sizeUs?: string | null;
  /** "circular", "hook", … — lowercase, the way Ravelry's own rows arrive. */
  readonly kind: string;
  /** Free text, e.g. "80 cm". */
  readonly lengthLabel?: string | null;
};

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
 * Two needles added inside the same millisecond would otherwise land on the
 * same primary key. Walking one further from zero is the cheapest way out and
 * keeps the only property the id has to have.
 */
function freeLocalId(): number {
  let id = -Date.now();

  while (db.select({ id: needles.id }).from(needles).where(eq(needles.id, id)).get()) {
    id -= 1;
  }

  return id;
}

/**
 * Writes one needle into the local drawer and hands back the row as written.
 *
 * Synchronous, like every other read and write against this database: the
 * driver is, and there is no network in the way.
 */
export function insertLocalNeedle(needle: LocalNeedle): NeedleRow {
  const addedAt = Date.now();
  const sizeUs = trimmed(needle.sizeUs);
  const kind = trimmed(needle.kind);
  const lengthLabel = trimmed(needle.lengthLabel);

  const row: NeedleRow = {
    id: freeLocalId(),
    sizeMm: needle.sizeMm,
    sizeUs,
    kind,
    lengthLabel,
    // Ravelry fills this with a brand or a comment off the record. There is no
    // record here, and the size and type already say everything the knitter
    // typed, so there is nothing to put in it.
    name: null,
    source: 'local',
    // `raw` is the untouched Ravelry object on every other row, and the column
    // is not null, so this one holds the app's own record of what was typed —
    // written under Ravelry's field names so anything that reads a needle's
    // `raw` finds what it is looking for rather than a second vocabulary.
    raw: JSON.stringify({
      source: 'local',
      size_metric: needle.sizeMm,
      size: sizeUs,
      needle_type: kind,
      length: lengthLabel,
      added_at: addedAt,
    }),
    // When this app wrote it, which is the same thing `syncedAt` means on
    // every other row: how current this copy is.
    syncedAt: addedAt,
  };

  db.insert(needles).values(row).run();

  return row;
}

/**
 * Rewrites one needle this app wrote, and only one this app wrote.
 *
 * The `source` guard in the `where` is the whole safety of this function, not a
 * nicety. A row pulled out of Ravelry is a copy of something Ravelry still has
 * and `pullNeedles` replaces it on the next sync, so an edit to one would look
 * like it worked and then quietly vanish — worse than being told no. There is
 * no endpoint that would make it stick, either: the needle inventory is
 * read-only, which is the reason this table has a `source` at all.
 *
 * Hands back the row as written, or `null` when the id names a needle that is
 * not ours to change. The screens only offer the button on rows that are.
 */
export function updateLocalNeedle(id: number, needle: LocalNeedle): NeedleRow | null {
  const editedAt = Date.now();
  const sizeUs = trimmed(needle.sizeUs);
  const kind = trimmed(needle.kind);
  const lengthLabel = trimmed(needle.lengthLabel);

  const existing = db.select().from(needles).where(eq(needles.id, id)).get();

  if (!existing || existing.source !== 'local') {
    return null;
  }

  const row: NeedleRow = {
    ...existing,
    sizeMm: needle.sizeMm,
    sizeUs,
    kind,
    lengthLabel,
    // Rewritten whole under Ravelry's field names, the same as the insert: this
    // column is the record of what was typed, and a stale half of it would be
    // worse than none. `added_at` is kept — when the needle came into the
    // drawer is not what an edit changes.
    raw: JSON.stringify({
      source: 'local',
      size_metric: needle.sizeMm,
      size: sizeUs,
      needle_type: kind,
      length: lengthLabel,
      added_at: readAddedAt(existing.raw) ?? editedAt,
      edited_at: editedAt,
    }),
    syncedAt: editedAt,
  };

  db.update(needles).set(row).where(eq(needles.id, id)).run();

  return row;
}

/** The `added_at` off a local needle's own record, if it is still readable. */
function readAddedAt(raw: string): number | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    const value =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>).added_at
        : null;

    return typeof value === 'number' ? value : null;
  } catch {
    return null;
  }
}
