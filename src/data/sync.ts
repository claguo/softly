/**
 * Pulling Ravelry into the local tables.
 *
 * `syncAll` fetches all four account resources, maps each one into typed
 * columns plus the untouched JSON, and replaces that resource's table in a
 * single transaction — every row of it except the needles this app added
 * itself, which no sync can replace because Ravelry has never heard of them.
 * It never throws: an offline sync leaves every cached row exactly where it
 * was and reports `phase: 'error'`, because the screens are meant to keep
 * working on a plane.
 *
 * Resources fail independently. Ravelry answers 403 on stash, needles and
 * favorites for anything but a real user session, and a 403 on one of them is
 * no reason to throw away the projects that came back fine.
 *
 * The reading below is deliberately paranoid. Only projects and patterns have
 * shapes this app has seen; the rest are matched against a list of plausible
 * field names and fall back to null, with the whole object kept in `raw` so a
 * wrong guess costs a column, never the data.
 */

import { ne } from 'drizzle-orm';

import { SignedOutError } from '@/auth/client';
import { db } from '@/data/db';
import {
  favoritesList,
  needlesList,
  projectsList,
  RavelryApiError,
  stashList,
  type PagedRecords,
  type RavelryProject,
  type RavelryRecord,
} from '@/data/ravelry';
import {
  favorites,
  needles,
  projects,
  stash,
  syncState,
  type FavoriteInsert,
  type NeedleInsert,
  type ProjectInsert,
  type StashInsert,
} from '@/data/schema';
import { fillStashPhotos } from '@/data/yarn-photos';

export const SYNC_RESOURCES = ['favorites', 'stash', 'needles', 'projects'] as const;

export type SyncResource = (typeof SYNC_RESOURCES)[number];

export type SyncPhase = 'idle' | 'syncing' | 'error';

export type SyncStatus = {
  readonly phase: SyncPhase;
  /** Epoch ms of the last sync that wrote anything, across app launches. */
  readonly lastSyncedAt: number | null;
};

export type SyncFailure = {
  readonly resource: SyncResource;
  /** HTTP status, `0` when the request never landed, `null` when not an API error. */
  readonly status: number | null;
  readonly message: string;
};

export type SyncOutcome =
  | { readonly ok: true; readonly syncedAt: number; readonly failures: readonly SyncFailure[] }
  | {
      readonly ok: false;
      readonly reason: 'signedOut' | 'offline' | 'failed';
      readonly failures: readonly SyncFailure[];
    };

/**
 * 50 rows of ten columns is 500 bound parameters, under SQLite's oldest
 * `SQLITE_MAX_VARIABLE_NUMBER` of 999 with room to spare.
 */
const INSERT_BATCH_SIZE = 50;

type TxHandle = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ---------------------------------------------------------------------------
// Reading unknown JSON
// ---------------------------------------------------------------------------

function at(source: unknown, path: readonly string[]): unknown {
  let value = source;
  for (const key of path) {
    if (typeof value !== 'object' || value === null) {
      return undefined;
    }
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function readString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  // Ravelry sends needle sizes as numbers about as often as strings.
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function firstString(source: unknown, paths: readonly (readonly string[])[]): string | null {
  for (const path of paths) {
    const value = readString(at(source, path));
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function firstNumber(source: unknown, paths: readonly (readonly string[])[]): number | null {
  for (const path of paths) {
    const value = readNumber(at(source, path));
    if (value !== null) {
      return value;
    }
  }
  return null;
}

/** Smallest first: list cells want a square thumbnail, not a hero image. */
const PHOTO_URL_KEYS = ['square_url', 'small_url', 'thumbnail_url', 'medium_url'] as const;

function photoUrl(...candidates: readonly unknown[]): string | null {
  for (const candidate of candidates) {
    const photo = Array.isArray(candidate) ? candidate[0] : candidate;
    for (const key of PHOTO_URL_KEYS) {
      const url = readString(at(photo, [key]));
      if (url !== null) {
        return url;
      }
    }
  }
  return null;
}

/**
 * Ravelry timestamps look like `2013/08/26 10:22:31 -0400`, which is neither
 * ISO-8601 nor something Hermes is obliged to parse. Rewrite it into ISO and
 * let the engine do the arithmetic; anything unrecognised becomes null rather
 * than an epoch-zero row that sorts to the bottom of every list.
 */
const RAVELRY_DATE =
  /^(\d{4})[/-](\d{2})[/-](\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2})(?:\s*([+-]\d{2}):?(\d{2}))?)?/;

function parseRavelryDate(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null;
  }

  const match = RAVELRY_DATE.exec(value.trim());
  if (!match) {
    const fallback = Date.parse(value);
    return Number.isNaN(fallback) ? null : fallback;
  }

  const [, year, month, day, hour = '00', minute = '00', second = '00', offsetHour, offsetMinute] =
    match;
  const offset = offsetHour === undefined ? 'Z' : `${offsetHour}:${offsetMinute ?? '00'}`;
  const parsed = Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`);

  return Number.isNaN(parsed) ? null : parsed;
}

function mapRows<TRecord, TRow>(
  records: readonly TRecord[],
  map: (record: TRecord) => TRow | null,
): TRow[] {
  const rows: TRow[] = [];
  for (const record of records) {
    const row = map(record);
    // A record with no usable id has nothing to be keyed by; drop it rather
    // than invent one and collide on the next sync.
    if (row !== null) {
      rows.push(row);
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Record → row
// ---------------------------------------------------------------------------

function toFavoriteRow(record: RavelryRecord, syncedAt: number): FavoriteInsert | null {
  const id = readNumber(at(record, ['id']));
  if (id === null) {
    return null;
  }

  const favorited = at(record, ['favorited']);
  const favoritedType = firstString(record, [['type'], ['favorited', 'type']]);

  return {
    id,
    favoritedType,
    // The row id is the bookmark's. Only a pattern bookmark points at a pattern.
    patternId: favoritedType === 'pattern' ? readNumber(at(favorited, ['id'])) : null,
    name: firstString(favorited, [['name'], ['title']]),
    designer: firstString(favorited, [
      ['pattern_author', 'name'],
      ['designer', 'name'],
      ['author', 'name'],
    ]),
    photoUrl: photoUrl(
      at(favorited, ['first_photo']),
      at(favorited, ['photo']),
      at(favorited, ['photos']),
    ),
    free: readBoolean(at(favorited, ['free'])),
    createdAtRemote:
      parseRavelryDate(at(record, ['created_at'])) ?? parseRavelryDate(at(record, ['favorited_at'])),
    raw: JSON.stringify(record),
    syncedAt,
  };
}

function toStashRow(record: RavelryRecord, syncedAt: number): StashInsert | null {
  const id = readNumber(at(record, ['id']));
  if (id === null) {
    return null;
  }

  return {
    id,
    yarnName: firstString(record, [['yarn_name'], ['yarn', 'name'], ['name']]),
    brand: firstString(record, [
      ['yarn', 'yarn_company', 'name'],
      ['yarn_company_name'],
      ['yarn', 'yarn_company_name'],
      ['brand'],
    ]),
    // `colorway` is an object on some records and a bare string on others;
    // `readString` returns null for the object, so the order sorts it out.
    colorway: firstString(record, [
      ['colorway', 'name'],
      ['colorway'],
      ['colorway_name'],
      ['color_family_name'],
    ]),
    weightName: firstString(record, [
      ['yarn_weight', 'name'],
      ['yarn', 'yarn_weight', 'name'],
      ['yarn_weight_name'],
      ['weight'],
    ]),
    yardsTotal: firstNumber(record, [
      ['yards_available'],
      ['total_yards'],
      // Where it actually is when the knitter has recorded a quantity: the
      // top-level spellings above are absent from every stash record this app
      // has seen, and the figure lives on the pack. Kept after them anyway —
      // they cost nothing and this endpoint is undocumented enough that a
      // field which is missing today is not a field that never existed.
      ['primary_pack', 'total_yards'],
      ['packs', '0', 'total_yards'],
      ['yardage_available'],
      ['yardage'],
    ]),
    // The knitter's own photograph of this skein, which almost no entry has:
    // `has_photo` is false and the nested `yarn.photos` is `[]` on every row
    // this endpoint returns. The catalogue photograph is not in this payload at
    // any depth — `yarn-photos.ts` fetches it by `yarnId` and the list
    // coalesces the two.
    photoUrl: photoUrl(at(record, ['first_photo']), at(record, ['photo']), at(record, ['photos'])),
    yarnId: firstNumber(record, [['yarn', 'id'], ['primary_pack', 'yarn_id'], ['yarn_id']]),
    // The one colour Ravelry keeps: a family, not a shade. The exact colour a
    // knitter dialled in lives in `yarn_colors` on this device — see there.
    colorFamilyId: firstNumber(record, [
      ['primary_pack', 'color_family_id'],
      ['packs', '0', 'color_family_id'],
      ['color_family_id'],
    ]),
    status: firstString(record, [
      ['stash_status', 'name'],
      ['stash_status_name'],
      ['status_name'],
      ['status'],
    ]),
    raw: JSON.stringify(record),
    syncedAt,
  };
}

function toNeedleRow(record: RavelryRecord, syncedAt: number): NeedleInsert | null {
  const id = readNumber(at(record, ['id']));
  if (id === null) {
    return null;
  }

  const hook = readBoolean(at(record, ['hook']));
  const labelledKind = firstString(record, [
    ['needle_type'],
    ['kind'],
    ['craft_name'],
    ['craft', 'name'],
  ]);

  return {
    id,
    sizeMm: firstNumber(record, [
      ['size_metric'],
      ['metric'],
      ['size_mm'],
      ['needle_size', 'metric'],
      ['hook_size', 'metric'],
    ]),
    sizeUs: firstString(record, [
      ['size'],
      ['us_size'],
      ['size_us'],
      ['needle_size', 'name'],
      ['hook_size', 'name'],
    ]),
    // Fall back to the one thing every record is known to distinguish.
    kind: labelledKind ?? (hook === null ? null : hook ? 'hook' : 'needle'),
    lengthLabel: firstString(record, [['length'], ['length_name'], ['needle_length']]),
    name: firstString(record, [['name'], ['comment'], ['brand']]),
    // Stated rather than left to the column default: this is the stamp
    // `pullNeedles` deletes on, and it should be readable here.
    source: 'ravelry',
    raw: JSON.stringify(record),
    syncedAt,
  };
}

function toProjectRow(record: RavelryProject, syncedAt: number): ProjectInsert | null {
  const id = readNumber(at(record, ['id']));
  if (id === null) {
    return null;
  }

  return {
    id,
    name: firstString(record, [['name']]),
    patternId: readNumber(at(record, ['pattern_id'])),
    patternName: firstString(record, [['pattern_name']]),
    // The list endpoint carries no designer, only whatever the knitter typed
    // into "source" for an off-Ravelry pattern. The name comes with the
    // pattern detail, not with this.
    designer: firstString(record, [
      ['pattern_author', 'name'],
      ['designer', 'name'],
      ['personal_source_name'],
    ]),
    status: firstString(record, [['status_name'], ['project_status', 'name']]),
    photoUrl: photoUrl(at(record, ['first_photo']), at(record, ['photos'])),
    updatedAtRemote:
      parseRavelryDate(at(record, ['updated_at'])) ??
      parseRavelryDate(at(record, ['project_status_changed'])) ??
      parseRavelryDate(at(record, ['created_at'])),
    raw: JSON.stringify(record),
    syncedAt,
  };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

function batches<T>(rows: readonly T[]): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < rows.length; start += INSERT_BATCH_SIZE) {
    chunks.push(rows.slice(start, start + INSERT_BATCH_SIZE));
  }
  return chunks;
}

function putSyncState(
  tx: TxHandle,
  resource: SyncResource,
  page: PagedRecords<unknown>,
  recordCount: number,
  syncedAt: number,
): void {
  tx.insert(syncState)
    .values({ resource, lastSyncedAt: syncedAt, recordCount, capped: page.capped })
    .onConflictDoUpdate({
      target: syncState.resource,
      set: { lastSyncedAt: syncedAt, recordCount, capped: page.capped },
    })
    .run();
}

/**
 * Delete-then-insert rather than a real upsert: at a thousand rows the whole
 * table costs less than working out what changed, and it is the only way a
 * favorite removed on ravelry.com disappears from here.
 */
async function pullFavorites(username: string, syncedAt: number): Promise<void> {
  const page = await favoritesList(username);
  const rows = mapRows(page.records, (record) => toFavoriteRow(record, syncedAt));

  db.transaction((tx) => {
    tx.delete(favorites).run();
    for (const batch of batches(rows)) {
      tx.insert(favorites).values(batch).run();
    }
    putSyncState(tx, 'favorites', page, rows.length, syncedAt);
  });
}

async function pullStash(username: string, syncedAt: number): Promise<void> {
  const page = await stashList(username);
  const rows = mapRows(page.records, (record) => toStashRow(record, syncedAt));

  db.transaction((tx) => {
    tx.delete(stash).run();
    for (const batch of batches(rows)) {
      tx.insert(stash).values(batch).run();
    }
    putSyncState(tx, 'stash', page, rows.length, syncedAt);
  });

  // Ravelry sends no photograph with a stash entry, so the thumbnails are
  // fetched a yarn at a time and cached. Not awaited: the rows above are what
  // this pull promised, they are already written, and the pictures redraw the
  // list themselves as they land. See `yarn-photos.ts`.
  void fillStashPhotos();
}

/**
 * The one pull that does not empty its table.
 *
 * Ravelry has no endpoint that adds to a knitter's needle inventory, so a
 * needle added in this app lives here and nowhere else. Deleting only the rows
 * Ravelry sent is what makes that survivable: everything with a `source` other
 * than `'local'` came from a list like this one and is about to be replaced by
 * a fresher copy, and the local rows are simply not this pull's business.
 */
async function pullNeedles(username: string, syncedAt: number): Promise<void> {
  const page = await needlesList(username);
  const rows = mapRows(page.records, (record) => toNeedleRow(record, syncedAt));

  db.transaction((tx) => {
    tx.delete(needles).where(ne(needles.source, 'local')).run();
    for (const batch of batches(rows)) {
      tx.insert(needles).values(batch).run();
    }
    putSyncState(tx, 'needles', page, rows.length, syncedAt);
  });
}

async function pullProjects(username: string, syncedAt: number): Promise<void> {
  const page = await projectsList(username);
  const rows = mapRows(page.records, (record) => toProjectRow(record, syncedAt));

  db.transaction((tx) => {
    tx.delete(projects).run();
    for (const batch of batches(rows)) {
      tx.insert(projects).values(batch).run();
    }
    putSyncState(tx, 'projects', page, rows.length, syncedAt);
  });
}

const PULLS: Record<SyncResource, (username: string, syncedAt: number) => Promise<void>> = {
  favorites: pullFavorites,
  stash: pullStash,
  needles: pullNeedles,
  projects: pullProjects,
};

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

function readLastSyncedAt(): number | null {
  try {
    const rows = db.select({ lastSyncedAt: syncState.lastSyncedAt }).from(syncState).all();
    const times = rows.map((row) => row.lastSyncedAt);
    return times.length > 0 ? Math.max(...times) : null;
  } catch {
    // A database this broken will surface again on the first read; the status
    // store is not the place to raise it.
    return null;
  }
}

let status: SyncStatus = { phase: 'idle', lastSyncedAt: readLastSyncedAt() };

const listeners = new Set<(status: SyncStatus) => void>();

function setStatus(next: SyncStatus): void {
  if (next.phase === status.phase && next.lastSyncedAt === status.lastSyncedAt) {
    return;
  }
  status = next;
  for (const listener of listeners) {
    listener(status);
  }
}

/** The current status object. Stable between changes, so it is safe to compare. */
export function getSyncStatus(): SyncStatus {
  return status;
}

export function subscribe(listener: (status: SyncStatus) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ---------------------------------------------------------------------------
// syncAll
// ---------------------------------------------------------------------------

function describe(error: unknown): SyncFailure['message'] {
  return error instanceof Error ? error.message : String(error);
}

async function runSync(
  username: string,
  resources: readonly SyncResource[],
): Promise<SyncOutcome> {
  setStatus({ phase: 'syncing', lastSyncedAt: status.lastSyncedAt });

  const syncedAt = Date.now();
  const failures: SyncFailure[] = [];
  let written = 0;

  for (const resource of resources) {
    try {
      await PULLS[resource](username, syncedAt);
      written += 1;
    } catch (error) {
      if (error instanceof SignedOutError) {
        // No token means no further request can succeed, and the auth client
        // has already cleared the session. Stop, and leave the cache alone.
        setStatus({ phase: 'error', lastSyncedAt: status.lastSyncedAt });
        return { ok: false, reason: 'signedOut', failures };
      }

      failures.push({
        resource,
        status: error instanceof RavelryApiError ? error.status : null,
        message: describe(error),
      });
    }
  }

  if (written === 0) {
    setStatus({ phase: 'error', lastSyncedAt: status.lastSyncedAt });
    const offline = failures.every((failure) => failure.status === 0);
    return { ok: false, reason: offline ? 'offline' : 'failed', failures };
  }

  // Some resources 403 for reasons that have nothing to do with this sync
  // being healthy, so anything written counts as a successful round.
  setStatus({ phase: 'idle', lastSyncedAt: syncedAt });
  return { ok: true, syncedAt, failures };
}

type Pass = {
  readonly resources: readonly SyncResource[];
  readonly done: Promise<SyncOutcome>;
};

let inFlight: Pass | null = null;

/**
 * Runs one pass over `resources`, sharing or queueing behind whatever is
 * already running.
 *
 * A pass that already covers everything the caller asked for *is* the caller's
 * answer, so it is handed back rather than repeated — that is what keeps two
 * screens pulling to refresh at once from becoming two syncs. A pass that
 * covers less (the projects-only refresh below) cannot stand in for a full
 * one, so the fuller pass queues behind it instead: two passes replacing the
 * same table at the same time would race, and no sync is urgent enough for
 * that to be worth it.
 */
function start(username: string, resources: readonly SyncResource[]): Promise<SyncOutcome> {
  const running = inFlight;

  if (running !== null && resources.every((resource) => running.resources.includes(resource))) {
    return running.done;
  }

  const queue = running === null ? Promise.resolve() : running.done.then(noop, noop);
  const done = queue.then(() => runSync(username, resources));
  const pass: Pass = { resources, done };
  inFlight = pass;

  return done.finally(() => {
    if (inFlight === pass) {
      inFlight = null;
    }
  });
}

function noop(): void {}

/**
 * Pulls every resource for `username` into the local tables.
 *
 * Being offline, being refused, being signed out and failing to write are all
 * reported through the resolved `SyncOutcome` and the status rather than
 * thrown, so a pull-to-refresh can await this without a try/catch and a
 * disconnected app keeps showing its cache.
 */
export function syncAll(username: string): Promise<SyncOutcome> {
  return start(username, SYNC_RESOURCES);
}

const PROJECTS_ONLY: readonly SyncResource[] = ['projects'];

/**
 * Just the projects table.
 *
 * For the one caller that already knows what changed: having written a project
 * to Ravelry, the app needs that project in the local mirror before it can
 * show it, and re-walking a thousand favorites to learn about one project
 * would be three round trips spent on nothing. Same guarantees as `syncAll` —
 * it does not throw, and it reports through the outcome.
 */
export function refreshProjects(username: string): Promise<SyncOutcome> {
  return start(username, PROJECTS_ONLY);
}

const STASH_ONLY: readonly SyncResource[] = ['stash'];

/**
 * Just the stash table, for the same reason as `refreshProjects` above: having
 * added one skein to Ravelry, the screen that added it needs that skein in the
 * mirror before it can select it, and the other three resources did not change.
 */
export function refreshStash(username: string): Promise<SyncOutcome> {
  return start(username, STASH_ONLY);
}
