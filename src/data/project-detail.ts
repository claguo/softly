/**
 * The rest of one project, kept on the device.
 *
 * `projects/list.json` — the endpoint the whole mirror is built from — is a
 * summary, and the fields a project screen most wants are the ones it leaves
 * out. Checked against the live account on 2026-08-19: no `packs`, no
 * `needle_sizes`, no `notes`, no `photos`. The yarn, the needles and the
 * knitter's own words are all only on `/projects/{username}/{id}.json`, one
 * project at a time.
 *
 * So this module is the second half of a project row, fetched when a screen
 * looks at one and written to `project_details`, where `sync.ts` cannot reach
 * it — see the note on that table. From then on the sections draw on the first
 * frame, with no network, like everything else in this app.
 *
 * Two things make it unlike `pattern-photos.ts`, which it is otherwise shaped
 * after. A pattern's photograph does not change, so that module asks once and
 * never again; a project changes every time the knitter touches it, and
 * finishing one rewrites it entirely. So the cached copy is always drawn *and*
 * always refreshed behind the screen — `ensureProjectDetail` returns whatever
 * is on the device and goes to the network regardless, and the screen redraws
 * if what comes back differs. A refresh that cannot land changes nothing on
 * screen, which is the right answer on a train.
 *
 * Nothing here throws. A failed fetch leaves the row exactly as it was.
 */

import { eq, getTableName } from 'drizzle-orm';
import { addDatabaseChangeListener } from 'expo-sqlite';

import { db } from '@/data/db';
import { projectShow } from '@/data/ravelry';
import { projectDetails, type ProjectDetailRow } from '@/data/schema';

/**
 * A counter over `project_details`, so a screen holding one row can tell when
 * its answer has been replaced. Same shape as the stash-row subscription in
 * `queries.ts`, and here for the same reason: the row is written behind the
 * screen looking at it.
 */
let version = 0;
const listeners = new Set<() => void>();
let watching = false;

export function subscribeToProjectDetails(onChange: () => void): () => void {
  listeners.add(onChange);

  if (!watching) {
    watching = true;

    // Never removed, like the listeners in `queries.ts`: one for the life of
    // the process, so a detail landing between one screen unmounting and the
    // next mounting is not missed.
    addDatabaseChangeListener((event) => {
      if (event.tableName !== getTableName(projectDetails)) {
        return;
      }

      // No coalescing window here, unlike the table stores: this table is
      // written one row at a time by this module alone, never a thousand rows
      // inside a sync transaction.
      version += 1;
      for (const listener of listeners) {
        listener();
      }
    });
  }

  return () => {
    listeners.delete(onChange);
  };
}

/** Bumped on every write, so a cached read knows when it has gone stale. */
export function projectDetailVersion(): number {
  return version;
}

/** What is already on the device for one project. Null for never fetched. */
export function getProjectDetail(projectId: number | null): ProjectDetailRow | null {
  if (projectId === null) {
    return null;
  }

  try {
    return (
      db
        .select()
        .from(projectDetails)
        .where(eq(projectDetails.projectId, projectId))
        .get() ?? null
    );
  } catch {
    // A database this broken will surface on the list behind this screen; a
    // detail section that does not draw is the smallest way to say so here.
    return null;
  }
}

function remember(projectId: number, raw: string): void {
  const fetchedAt = Date.now();

  db.insert(projectDetails)
    .values({ projectId, raw, fetchedAt })
    .onConflictDoUpdate({ target: projectDetails.projectId, set: { raw, fetchedAt } })
    .run();
}

/** Guards against two screens asking about the same project at once. */
const running = new Map<number, Promise<boolean>>();

/**
 * Brings one project's detail up to date, quietly.
 *
 * Safe to call on every focus: the fetch is one small request, the write only
 * wakes the screens watching this project, and a failure — offline, signed out,
 * a project since deleted — is swallowed, leaving whatever was already cached
 * on screen. Callers do not wait on it for anything they draw.
 *
 * Resolves to whether this device has the detail *now*, which is not the same
 * as whether the request landed: a refresh that failed over a copy already on
 * the phone is true, because every section still has something true to draw.
 * Only the first visit, offline, is false — and that is the one case with
 * nothing to show and a reason worth saying out loud.
 */
export function ensureProjectDetail(
  username: string | null,
  projectId: number | null,
): Promise<boolean> {
  if (projectId === null) {
    return Promise.resolve(false);
  }

  if (username === null) {
    // Signed out. Whatever was fetched while signed in is still on the device
    // and still true, so this is not a failure — there is simply nothing to
    // ask with.
    return Promise.resolve(getProjectDetail(projectId) !== null);
  }

  const inFlight = running.get(projectId);

  if (inFlight) {
    return inFlight;
  }

  const request = (async () => {
    try {
      const project = await projectShow(username, projectId);
      const raw = JSON.stringify(project);

      // Writing an identical row would still fire the change listener and
      // redraw every screen watching it, for a payload that has not moved.
      if (getProjectDetail(projectId)?.raw !== raw) {
        remember(projectId, raw);
      }

      return true;
    } catch {
      // Nothing is written, so the next visit tries again and the sections
      // keep drawing whatever was already here.
      return getProjectDetail(projectId) !== null;
    } finally {
      running.delete(projectId);
    }
  })();

  running.set(projectId, request);

  return request;
}
