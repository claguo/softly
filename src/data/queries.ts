/**
 * What screens read. Every hook returns rows that are already in SQLite, so
 * the first frame after a cold start is real content rather than a spinner,
 * online or not.
 *
 * These are hand-rolled rather than drizzle's `useLiveQuery`. That hook works
 * and is typed well, but it re-runs the whole query once per row-level change
 * event, and a sync replaces up to a thousand rows inside one transaction —
 * sqlite3_update_hook fires for every one of them, so a screen would run a
 * thousand full table scans while the sync ran. The stores below listen to the
 * same `addDatabaseChangeListener` events, coalesce them, and share one cached
 * result between every component reading the same table. Because the Expo
 * driver is synchronous they can also read during render, so there is no
 * `useEffect` round trip and no empty first frame.
 *
 * No list here selects `raw`. It is the largest column by far and no list
 * needs it. The by-id getters at the bottom of this file do select it, because
 * that is exactly what a detail screen is for: one row, whole, including the
 * fields nobody has promoted to a column yet.
 */

import { desc, eq, getTableColumns, getTableName, sql } from 'drizzle-orm';
import { addDatabaseChangeListener } from 'expo-sqlite';
import { useCallback, useSyncExternalStore } from 'react';

import { db } from '@/data/db';
import { patternPdfSnapshot, subscribeToPatternPdfs } from '@/data/pdfs';
import {
  getProjectDetail,
  projectDetailVersion,
  subscribeToProjectDetails,
} from '@/data/project-detail';
import {
  favorites,
  needles,
  patternPdfs,
  projects,
  stash,
  yarnColors,
  yarnPhotos,
  type FavoriteRow,
  type NeedleRow,
  type PatternPdfRow,
  type ProjectDetailRow,
  type ProjectRow,
  type StashRow,
} from '@/data/schema';
import { getSyncStatus, subscribe, type SyncStatus } from '@/data/sync';

/**
 * Long enough to swallow a table's worth of inserts, short enough that a
 * pull-to-refresh still feels like it landed immediately.
 */
const REFRESH_COALESCE_MS = 120;

/**
 * One stash entry with what this device knows added: the yarn's catalogue
 * photograph, and the shade the knitter dialled in. Neither is in Ravelry's
 * record — see `yarn-photos.ts` and `yarn-colors.ts`.
 */
export type StashEntryRow = StashRow & {
  colorHex: string | null;
  fibers: string | null;
};

export type LiveRows<TRow> = {
  readonly data: TRow[];
  /** Non-null only when the database itself failed; the rows are then empty. */
  readonly error: Error | null;
};

const { raw: favoritesRaw, ...favoriteColumns } = getTableColumns(favorites);
const { raw: stashRaw, ...stashColumns } = getTableColumns(stash);
const { raw: needlesRaw, ...needleColumns } = getTableColumns(needles);
const { raw: projectsRaw, ...projectColumns } = getTableColumns(projects);

/**
 * Whether this bookmark's pattern has its PDF on the device.
 *
 * A `pattern_pdfs` row is only written once the file is really on disk (see
 * `pdfs.ts`, its only writer), so the row existing is the whole of the answer —
 * and it is the only part of "does this read offline" that can be settled here,
 * without asking Ravelry anything. Kept as one expression because the list both
 * selects it and sorts on it.
 */
const favoriteHasPdf = sql<boolean>`${patternPdfs.patternId} is not null`.mapWith(Boolean);

const selectFavorites = () =>
  db
    .select({
      ...favoriteColumns,
      // SQLite answers this one in 1s and 0s; `mapWith` is what makes it a
      // boolean by the time a screen reads it rather than a number typed as
      // one. A bookmark with no pattern behind it — a yarn, a designer —
      // matches nothing in the join and comes back false.
      offline: favoriteHasPdf.as('offline'),
    })
    .from(favorites)
    .leftJoin(patternPdfs, eq(favorites.patternId, patternPdfs.patternId))
    // Downloaded first, then most recently bookmarked within each group. The
    // flag is 1 or 0 and never null, so nothing sinks on that term; the date is
    // where that matters, because SQLite sorts null lowest, so a bookmark with
    // no parseable date sinks to the bottom of a descending sort.
    .orderBy(desc(favoriteHasPdf), desc(favorites.createdAtRemote))
    .all();

const selectStash = () =>
  db
    .select({
      ...stashColumns,
      // Ravelry's stash records carry no photograph, so the frame is filled
      // from the yarn's catalogue shot in almost every case. `stash.photoUrl`
      // still wins where it exists: that is the knitter's own picture of their
      // own skein, and no stock photograph should sit on top of it.
      photoUrl: sql<string | null>`coalesce(${stash.photoUrl}, ${yarnPhotos.photoUrl})`.as(
        'photo_url',
      ),
      // The shade this knitter dialled in, if they have. Null is not "no
      // colour" — `colorFamilyId` may still name one, and the swatch for that
      // family is the fallback. See `tintFor`.
      colorHex: yarnColors.hex,
    })
    .from(stash)
    .leftJoin(yarnPhotos, eq(stash.yarnId, yarnPhotos.yarnId))
    .leftJoin(yarnColors, eq(stash.id, yarnColors.stashId))
    // Alphabetical the way a person reads it, with unnamed skeins last.
    .orderBy(sql`${stash.yarnName} is null, ${stash.yarnName} collate nocase`)
    .all();

const selectNeedles = () =>
  db
    .select(needleColumns)
    .from(needles)
    // Thinnest first; anything whose size Ravelry did not give us goes last.
    .orderBy(sql`${needles.sizeMm} is null, ${needles.sizeMm}`)
    .all();

const selectProjects = () =>
  db.select(projectColumns).from(projects).orderBy(desc(projects.updatedAtRemote)).all();

export type FavoriteListRow = ReturnType<typeof selectFavorites>[number];
export type StashListRow = ReturnType<typeof selectStash>[number];
export type NeedleListRow = ReturnType<typeof selectNeedles>[number];
export type ProjectListRow = ReturnType<typeof selectProjects>[number];

type LiveStore<TRow> = {
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => LiveRows<TRow>;
};

function runQuery<TRow>(run: () => TRow[]): LiveRows<TRow> {
  try {
    return { data: run(), error: null };
  } catch (error) {
    return { data: [], error: error instanceof Error ? error : new Error(String(error)) };
  }
}

/**
 * A `useSyncExternalStore` source over one table.
 *
 * The snapshot has to be referentially stable or React will re-render forever,
 * so the result is cached and only thrown away when that table changes.
 */
function createLiveStore<TRow>(
  tableNames: readonly string[],
  run: () => TRow[],
): LiveStore<TRow> {
  const listeners = new Set<() => void>();
  let snapshot: LiveRows<TRow> | null = null;
  let coalescing: ReturnType<typeof setTimeout> | null = null;
  let watching = false;

  const invalidate = () => {
    snapshot = null;
    for (const listener of listeners) {
      listener();
    }
  };

  const subscribeToStore = (onStoreChange: () => void): (() => void) => {
    listeners.add(onStoreChange);

    if (!watching) {
      watching = true;
      // Deliberately never removed. Four listeners for the life of the process
      // buys a snapshot that cannot go stale between one screen unmounting and
      // the next mounting.
      addDatabaseChangeListener((event) => {
        if (!tableNames.includes(event.tableName) || coalescing !== null) {
          return;
        }
        // One read on the trailing edge, however many rows the writer touched.
        coalescing = setTimeout(() => {
          coalescing = null;
          invalidate();
        }, REFRESH_COALESCE_MS);
      });

      // Anything written between the very first read and that listener
      // existing would otherwise be invisible until the next write.
      invalidate();
    }

    return () => {
      listeners.delete(onStoreChange);
    };
  };

  return {
    subscribe: subscribeToStore,
    getSnapshot: () => (snapshot ??= runQuery(run)),
  };
}

// Two tables, because a bookmark row says nothing about whether its PDF is on
// the device — `pattern_pdfs` is what answers that, and what sorts the
// downloads to the top. Without it here, a file finishing its download would
// leave the list exactly as it was until some later sync happened to throw the
// snapshot away.
const favoritesStore = createLiveStore(
  [getTableName(favorites), getTableName(patternPdfs)],
  selectFavorites,
);
// Three tables, because the stash list reads from three: the rows themselves,
// the thumbnails `yarn-photos.ts` fills in behind them, and the colours
// `yarn-colors.ts` writes when a knitter matches one by eye.
const stashStore = createLiveStore(
  [getTableName(stash), getTableName(yarnPhotos), getTableName(yarnColors)],
  selectStash,
);
const needlesStore = createLiveStore([getTableName(needles)], selectNeedles);
const projectsStore = createLiveStore([getTableName(projects)], selectProjects);

function useLiveRows<TRow>(store: LiveStore<TRow>): LiveRows<TRow> {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/**
 * A counter over the tables one row is assembled from, so a screen looking at
 * a single record can tell whether its answer is still good.
 *
 * The stores above cache a whole result set; a by-id hook caches one row, and
 * a version is the cheapest way to know when to throw it away. Same coalescing
 * as the stores, for the same reason: a sync replaces every row of a table
 * inside one transaction and the update hook fires once per row.
 */
type RowVersion = {
  subscribe: (onChange: () => void) => () => void;
  current: () => number;
};

function createRowVersion(tableNames: readonly string[]): RowVersion {
  const listeners = new Set<() => void>();
  let version = 0;
  let watching = false;
  let coalescing: ReturnType<typeof setTimeout> | null = null;

  return {
    subscribe: (onChange) => {
      listeners.add(onChange);

      if (!watching) {
        watching = true;

        // Never removed, like the stores' listeners above, and for the same
        // reason: a write between one screen unmounting and the next mounting
        // must not be missed.
        addDatabaseChangeListener((event) => {
          if (!tableNames.includes(event.tableName) || coalescing !== null) {
            return;
          }

          coalescing = setTimeout(() => {
            coalescing = null;
            version += 1;
            for (const listener of listeners) {
              listener();
            }
          }, REFRESH_COALESCE_MS);
        });
      }

      return () => {
        listeners.delete(onChange);
      };
    },
    current: () => version,
  };
}

const stashRows = createRowVersion([
  getTableName(stash),
  getTableName(yarnPhotos),
  getTableName(yarnColors),
]);

const projectRows = createRowVersion([getTableName(projects)]);

let cachedStashEntry: { id: number; version: number; row: StashEntryRow | null } | null = null;
let cachedProject: { id: number; version: number; row: ProjectRow | null } | null = null;
let cachedProjectDetail: {
  id: number;
  version: number;
  row: ProjectDetailRow | null;
} | null = null;

export function useFavorites(): LiveRows<FavoriteListRow> {
  return useLiveRows(favoritesStore);
}

export function useStash(): LiveRows<StashListRow> {
  return useLiveRows(stashStore);
}

export function useNeedles(): LiveRows<NeedleListRow> {
  return useLiveRows(needlesStore);
}

export function useProjects(): LiveRows<ProjectListRow> {
  return useLiveRows(projectsStore);
}

/** The sync store from `sync.ts`, wired into React. */
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribe, getSyncStatus, getSyncStatus);
}

/**
 * The downloaded PDF for one pattern, live.
 *
 * On the store in `pdfs.ts` rather than on the table's change events, because
 * that module is the table's only writer and a downloaded file is worth
 * telling a screen about the moment it lands — a project opened while the
 * download fired off by casting on is still running gains its "Open pattern"
 * without being touched.
 *
 * `null` for a pattern with nothing on the device, and for no pattern at all,
 * which is what a project with no linked pattern passes in.
 */
export function usePatternPdf(patternId: number | null): PatternPdfRow | null {
  const getSnapshot = useCallback(
    () => (patternId === null ? null : patternPdfSnapshot(patternId)),
    [patternId],
  );

  return useSyncExternalStore(subscribeToPatternPdfs, getSnapshot, getSnapshot);
}

// ---------------------------------------------------------------------------
// One row, whole
// ---------------------------------------------------------------------------

/**
 * The detail reads. Plain synchronous calls: the driver is synchronous, so a
 * screen can have its row during render with no `useEffect` round trip and no
 * empty first frame.
 *
 * They select every column, `raw` included, which is the whole point — the
 * typed columns are whatever the lists needed, and a detail screen always
 * needs more than that.
 *
 * Each has a live hook above it, and the reasoning that once made those
 * unnecessary — a detail screen looks at a row it arrived on, and what changes
 * it is a sync the list behind it will pick up — stopped being true when the
 * screens grew writes of their own. A stash entry gains a photograph fetched
 * behind it; a project is finished by a modal on top of it. In both cases the
 * screen that has to redraw is the one already mounted.
 */
function one<TRow>(run: () => TRow | undefined): TRow | null {
  try {
    return run() ?? null;
  } catch {
    // Missing and unreadable land in the same place on screen — the row is not
    // there to show — and a database this broken will surface on the list.
    return null;
  }
}

export function getProjectById(id: number): ProjectRow | null {
  return one(() => db.select().from(projects).where(eq(projects.id, id)).get());
}

export function getNeedleById(id: number): NeedleRow | null {
  return one(() => db.select().from(needles).where(eq(needles.id, id)).get());
}

export function getStashById(id: number): StashEntryRow | null {
  return one(() =>
    db
      .select({
        ...getTableColumns(stash),
        // Same coalesce as the list, for the same reason: the photograph a
        // stash entry is drawn with is the yarn's unless the knitter took one.
        photoUrl: sql<string | null>`coalesce(${stash.photoUrl}, ${yarnPhotos.photoUrl})`.as(
          'photo_url',
        ),
        colorHex: yarnColors.hex,
        // What the yarn is made of, off the same cached record as the
        // photograph. Detail only — the list has no room for it.
        fibers: yarnPhotos.fibers,
      })
      .from(stash)
      .leftJoin(yarnPhotos, eq(stash.yarnId, yarnPhotos.yarnId))
      .leftJoin(yarnColors, eq(stash.id, yarnColors.stashId))
      .where(eq(stash.id, id))
      .get(),
  );
}

/**
 * One stash entry, live.
 *
 * The other by-id reads on this page are one-shot, on the reasoning that a
 * detail screen is looking at a row it arrived on and the next sync is the
 * list's problem. This one is not, because of the photograph: Ravelry sends no
 * picture with a stash entry, so `yarn-photos.ts` fetches it behind the screen
 * and writes it a beat later. A one-shot read would show the striped
 * placeholder until the knitter backed out and came in again.
 *
 * `null` for a row that is not there, and for no id at all.
 */
export function useStashEntry(id: number | null): StashEntryRow | null {
  const getSnapshot = useCallback(() => {
    if (id === null) {
      return null;
    }

    // Referentially stable between versions, or `useSyncExternalStore` would
    // re-render on every check: a fresh row object is a fresh snapshot.
    if (
      cachedStashEntry !== null &&
      cachedStashEntry.id === id &&
      cachedStashEntry.version === stashRows.current()
    ) {
      return cachedStashEntry.row;
    }

    const row = getStashById(id);
    cachedStashEntry = { id, version: stashRows.current(), row };

    return row;
  }, [id]);

  return useSyncExternalStore(stashRows.subscribe, getSnapshot, getSnapshot);
}

/**
 * One project, live.
 *
 * One-shot was right while this row only ever changed on a sync happening
 * somewhere behind the screen. Finishing changed that: the knitter taps
 * Finish, `finishProject` writes the status and brings the mirror level, and
 * the modal dismisses onto a project screen that is *already mounted* — so a
 * read memoised on the id would never run again, and the badge would still say
 * In progress on a project that is done. The whole point of the write is the
 * screen behind it, and this is what lets it land there.
 *
 * `null` for a row that is not there, and for no id at all.
 */
export function useProject(id: number | null): ProjectRow | null {
  const getSnapshot = useCallback(() => {
    if (id === null) {
      return null;
    }

    if (
      cachedProject !== null &&
      cachedProject.id === id &&
      cachedProject.version === projectRows.current()
    ) {
      return cachedProject.row;
    }

    const row = getProjectById(id);
    cachedProject = { id, version: projectRows.current(), row };

    return row;
  }, [id]);

  return useSyncExternalStore(projectRows.subscribe, getSnapshot, getSnapshot);
}

/**
 * The rest of one project — its yarn, its needles, its notes — live.
 *
 * On `project-detail.ts`'s own store rather than on this file's table
 * counters, the same way `usePatternPdf` is: that module is the table's only
 * writer, and it writes behind the screen reading it. See the note there for
 * why the row is refreshed on every visit rather than trusted once.
 *
 * `null` until this device has ever fetched the project, which is what the
 * sections check before drawing themselves.
 */
export function useProjectDetail(id: number | null): ProjectDetailRow | null {
  const getSnapshot = useCallback(() => {
    if (id === null) {
      return null;
    }

    if (
      cachedProjectDetail !== null &&
      cachedProjectDetail.id === id &&
      cachedProjectDetail.version === projectDetailVersion()
    ) {
      return cachedProjectDetail.row;
    }

    const row = getProjectDetail(id);
    cachedProjectDetail = { id, version: projectDetailVersion(), row };

    return row;
  }, [id]);

  return useSyncExternalStore(subscribeToProjectDetails, getSnapshot, getSnapshot);
}

/**
 * The bookmark pointing at a pattern, if this account has one.
 *
 * Keyed on the pattern rather than the row id because the caller is a pattern
 * screen holding Ravelry's pattern id, and because this is the cached copy it
 * falls back to when the live fetch cannot land.
 */
export function getFavoriteByPatternId(patternId: number): FavoriteRow | null {
  return one(() =>
    db.select().from(favorites).where(eq(favorites.patternId, patternId)).get(),
  );
}
