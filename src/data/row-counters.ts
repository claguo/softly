/**
 * The counters a knitter keeps on a project, and the only writer they have.
 *
 * Everything here is the app's own. Ravelry does not model a row counter — a
 * project there has a status, its yarn and its notes, and nothing that says
 * which row somebody is on — so there is no fetch behind any of this, no
 * refresh to wait for and no way for it to be wrong about the network. It is
 * the second half of the story `local.ts` tells about needles: a fact this app
 * writes down because nowhere else will hold it. See the note on `row_counters`
 * for why it keys to a Ravelry project id all the same.
 *
 * The store is the reason this file exists rather than another hook in
 * `queries.ts`. Those stores are built on `addDatabaseChangeListener` and
 * coalesce a table's writes over 120ms, which is exactly right when a sync is
 * replacing a thousand rows and exactly wrong here: a knitter taps + at the end
 * of a row, and a number that changes an eighth of a second later has already
 * been tapped again. So this module keeps its own subscriber set and notifies
 * it synchronously on every write, the same bargain `pdfs.ts` and
 * `project-detail.ts` strike — a module that is its table's only writer always
 * knows before SQLite can tell it. The count redraws on the next frame.
 *
 * Synchronous throughout, like the rest of `src/data`: the driver is, and
 * there is nothing in the way.
 */

import { asc, eq, inArray } from 'drizzle-orm';
import { useCallback, useSyncExternalStore } from 'react';

import { db } from '@/data/db';
import { rowCounters, type RowCounterRow } from '@/data/schema';

/** A counter as the two sheets describe it. The count is never in here. */
export type RowCounterDraft = {
  /** Free text, e.g. "Body". Blank is not a name and is stored as none. */
  readonly name?: string | null;
  /** One label off the chips or one typed by hand, never both. */
  readonly stitchType?: string | null;
  /** The pattern's total, if it gave one. */
  readonly maxRows?: number | null;
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
 * A total worth keeping: a whole number of rows, and at least one of them.
 *
 * Anything else — a decimal, a nought, a minus, whatever a numeric keyboard
 * still lets through — is not a total, and the counter simply has none. The
 * sheets say nothing about it: refusing to save over a half-typed box would be
 * shouting about the one field on the form nobody has to fill in.
 */
function rowTotal(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

const listeners = new Set<() => void>();

/**
 * One cached list per scope, so the array a component read last render is the
 * same array this render — `useSyncExternalStore` compares by identity and
 * would otherwise re-render forever. The key is the project ids it was read
 * for, joined; see `scopeSnapshot`.
 */
const snapshots = new Map<string, readonly RowCounterRow[]>();

/** No project asked about, as a stable array: a new `[]` is a new snapshot. */
const NONE: readonly RowCounterRow[] = [];

/**
 * Every write ends here.
 *
 * The whole map is thrown away rather than the one scope that moved: a counter
 * belongs to exactly one project, but the PDF reader watches several at once,
 * and working out which of those a written row falls into costs more than
 * re-reading a table this small.
 */
function changed(): void {
  snapshots.clear();
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeToRowCounters(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** One counter, whole. Null for an id that names nothing. */
export function getRowCounter(id: number): RowCounterRow | null {
  try {
    return db.select().from(rowCounters).where(eq(rowCounters.id, id)).get() ?? null;
  } catch {
    // Missing and unreadable land in the same place on screen — there is no
    // counter to draw — and a database this broken will surface elsewhere.
    return null;
  }
}

/**
 * The counters on one project, oldest first.
 *
 * Oldest first because that is the order they were cast on in: the body before
 * the sleeves, and a counter added halfway up goes at the bottom where it was
 * put rather than jumping the queue on its name.
 */
export function getRowCounters(projectId: number): RowCounterRow[] {
  return readCounters([projectId]);
}

function readCounters(projectIds: readonly number[]): RowCounterRow[] {
  if (projectIds.length === 0) {
    return [];
  }

  try {
    return db
      .select()
      .from(rowCounters)
      .where(inArray(rowCounters.projectId, [...projectIds]))
      .orderBy(asc(rowCounters.createdAt))
      .all();
  } catch {
    return [];
  }
}

/**
 * The store's view of one scope. Stable between writes; see `snapshots`.
 *
 * The key is the scope: the project ids, joined, exactly as the hook built it.
 * Carrying the string rather than the array is what makes the cache work at
 * all — a component hands `useCallback` a fresh array every render, and a
 * string it can compare.
 */
function scopeSnapshot(key: string): readonly RowCounterRow[] {
  if (key === '') {
    return NONE;
  }

  const cached = snapshots.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const rows = readCounters(key.split(',').map(Number));
  snapshots.set(key, rows);
  return rows;
}

/**
 * The counters on one project, live.
 *
 * `null` for no project, which is what a screen still reading its route param
 * passes in, and what it gets back is the same empty array every time.
 */
export function useRowCounters(projectId: number | null): readonly RowCounterRow[] {
  const key = projectId === null ? '' : String(projectId);
  const getSnapshot = useCallback(() => scopeSnapshot(key), [key]);

  return useSyncExternalStore(subscribeToRowCounters, getSnapshot, getSnapshot);
}

/**
 * The counters on several projects at once, live.
 *
 * The reader's case, and only that: `/pdf/[patternId]` is keyed by a pattern
 * rather than a project, and a pattern knitted twice is two projects with
 * counters on both. One project is the normal answer and this is the same hook
 * as the one above when it is — the ids are the cache key either way.
 */
export function useRowCountersForProjects(
  projectIds: readonly number[],
): readonly RowCounterRow[] {
  const key = projectIds.join(',');
  const getSnapshot = useCallback(() => scopeSnapshot(key), [key]);

  return useSyncExternalStore(subscribeToRowCounters, getSnapshot, getSnapshot);
}

// ---------------------------------------------------------------------------
// The writes
// ---------------------------------------------------------------------------

/**
 * Writes one counter onto a project and hands back the row as written.
 *
 * No id goes in: `row_counters.id` is an integer primary key, which SQLite
 * makes an alias for the rowid and fills itself, so what comes back out of the
 * insert is the number it chose.
 */
export function insertRowCounter(projectId: number, draft: RowCounterDraft): RowCounterRow {
  const addedAt = Date.now();

  const values = {
    projectId,
    name: trimmed(draft.name),
    stitchType: trimmed(draft.stitchType),
    maxRows: rowTotal(draft.maxRows),
    // Every counter starts here. There is no sheet for saying otherwise, and a
    // counter that opened part-way up would be a guess about somebody's knitting.
    count: 0,
    createdAt: addedAt,
    updatedAt: addedAt,
  };

  const { lastInsertRowId } = db.insert(rowCounters).values(values).run();

  changed();

  return { id: lastInsertRowId, ...values };
}

/**
 * Rewrites what a counter is called, and nothing about where it has got to.
 *
 * The count is deliberately not in the draft: renaming a counter on the edit
 * sheet must not quietly move it, and the two things that do move it —
 * `adjustRowCounter` and `resetRowCounter` — say so in their names.
 *
 * `null` when the id names nothing, which is the sheet arriving on a counter
 * deleted underneath it.
 */
export function updateRowCounter(id: number, draft: RowCounterDraft): RowCounterRow | null {
  const existing = getRowCounter(id);

  if (existing === null) {
    return null;
  }

  const row: RowCounterRow = {
    ...existing,
    name: trimmed(draft.name),
    stitchType: trimmed(draft.stitchType),
    maxRows: rowTotal(draft.maxRows),
    updatedAt: Date.now(),
  };

  db.update(rowCounters).set(row).where(eq(rowCounters.id, id)).run();

  changed();

  return row;
}

/** Takes one counter off a project. An id that names nothing is not an error. */
export function deleteRowCounter(id: number): void {
  db.delete(rowCounters).where(eq(rowCounters.id, id)).run();

  changed();
}

/**
 * Moves a counter by `delta`, and the whole of the arithmetic in this file.
 *
 * Clamped at nought below, because there is no row before the first one and a
 * counter reading −1 is a bug the knitter has to fix by hand. Clamped nowhere
 * above, on purpose: a pattern's total is what the pattern says, and patterns
 * are wrong, and knitters add rows on purpose all the time. So the count runs
 * past `maxRows` and the screens read it out honestly — "123 / 120" is a
 * sentence about a sweater, not an error state.
 *
 * A move that changes nothing — minus at nought — writes nothing and wakes
 * nobody, so the screens do not flicker under a tap that had no room to land.
 */
export function adjustRowCounter(id: number, delta: number): RowCounterRow | null {
  const existing = getRowCounter(id);

  if (existing === null) {
    return null;
  }

  const count = Math.max(0, existing.count + delta);

  if (count === existing.count) {
    return existing;
  }

  return write(existing, count);
}

/** Back to the first row. The counter's name and total are left alone. */
export function resetRowCounter(id: number): RowCounterRow | null {
  const existing = getRowCounter(id);

  if (existing === null) {
    return null;
  }

  if (existing.count === 0) {
    return existing;
  }

  return write(existing, 0);
}

/** The one place a count is written, so `updatedAt` cannot be forgotten. */
function write(existing: RowCounterRow, count: number): RowCounterRow {
  const row: RowCounterRow = { ...existing, count, updatedAt: Date.now() };

  db.update(rowCounters).set(row).where(eq(rowCounters.id, existing.id)).run();

  changed();

  return row;
}
