/**
 * The photographs the stash list does not come with.
 *
 * `/people/{username}/stash/list.json` carries no picture of the yarn. This is
 * not a field this app failed to read — the record has `has_photo`, which is
 * the knitter's *own* upload and false for almost every entry, and a nested
 * `yarn` object whose `photos` array comes back empty every time. Meanwhile
 * `/yarns/search.json` puts a `first_photo` on every result, which is why the
 * Add a yarn sheet is full of thumbnails and the stash it writes to is not.
 *
 * The catalogue photograph is real and reachable; it is just one request away,
 * on `/yarns/{id}.json`, per yarn. So it is fetched once and kept:
 *
 * - **Keyed by the yarn's id, not the stash entry's.** Two skeins of the same
 *   yarn are one request, and the answer outlives the stash row — `pullStash`
 *   empties its table on every sync and this one is never touched, so a photo
 *   is fetched once for as long as the app is installed.
 * - **A miss is an answer.** A yarn with no photograph is written down as
 *   `photoUrl: null` rather than left out, or every sync would ask again about
 *   the same yarn forever.
 * - **A failure is not.** A request that fell over writes nothing, so the next
 *   sync tries again. Offline, this whole module is a no-op.
 *
 * Nothing awaits it. `pullStash` starts it and returns, and the thumbnails
 * arrive on the frame after they land: `queries.ts` watches this table as well
 * as `stash`, so the list redraws itself. That is deliberate — a knitter who
 * has just added a skein should get their sheet dismissed now, not after the
 * network has been asked about a picture.
 */

import { and, eq, isNotNull, isNull } from 'drizzle-orm';

import { db } from '@/data/db';
import { yarnShow } from '@/data/ravelry';
import { stash, yarnPhotos } from '@/data/schema';

/**
 * Smallest first: a stash cell is a 44pt frame, and `square_url` is already
 * cropped to it. Same order as `sync.ts` reads photos in, for the same reason.
 */
const PHOTO_URL_KEYS = ['square_url', 'small_url', 'thumbnail_url', 'medium_url'] as const;

/**
 * A yarn's `yarn_fibers` as one line: "60% Mohair, 40% Silk".
 *
 * Ravelry sends a list of parts, each with a percentage and two levels of
 * taxonomy — `fiber_type` ("Mohair") and `fiber_category`, which sometimes
 * nests a parent ("Goat"). The type is the word a knitter uses, so that is the
 * one taken, with the category as a fallback for a part typed oddly.
 *
 * Ordered most of the yarn first, because that is how a label reads it and
 * because the API's own order is neither that nor alphabetical — the 60/40
 * above arrives 40 first. A part with no percentage keeps its name and loses
 * the number rather than the whole line.
 */
function fiberLine(yarn: Record<string, unknown>): string | null {
  const parts = yarn.yarn_fibers;

  if (!Array.isArray(parts) || parts.length === 0) {
    return null;
  }

  const named = parts.flatMap((part) => {
    if (typeof part !== 'object' || part === null) {
      return [];
    }

    const record = part as Record<string, unknown>;
    const type = record.fiber_type as Record<string, unknown> | undefined;
    const category = record.fiber_category as Record<string, unknown> | undefined;
    const name =
      typeof type?.name === 'string'
        ? type.name
        : typeof category?.name === 'string'
          ? category.name
          : null;

    if (name === null || name.trim() === '') {
      return [];
    }

    const percentage = typeof record.percentage === 'number' ? record.percentage : null;

    return [{ name: name.trim(), percentage }];
  });

  if (named.length === 0) {
    return null;
  }

  // Unpercentaged parts sink rather than sorting as zero among real numbers.
  named.sort((a, b) => (b.percentage ?? -1) - (a.percentage ?? -1));

  return named
    .map((part) => (part.percentage === null ? part.name : `${part.percentage}% ${part.name}`))
    .join(', ');
}

/** The first usable URL on a yarn's `photos`, or null if it has none. */
function catalogPhoto(yarn: Record<string, unknown>): string | null {
  const photos = yarn.photos;
  const photo = Array.isArray(photos) ? photos[0] : null;

  if (typeof photo !== 'object' || photo === null) {
    return null;
  }

  for (const key of PHOTO_URL_KEYS) {
    const url = (photo as Record<string, unknown>)[key];
    if (typeof url === 'string' && url.trim() !== '') {
      return url;
    }
  }

  return null;
}

/**
 * The yarns a stash row needs a picture for and this table has never answered
 * about. Rows with the knitter's own photograph are skipped — that one wins on
 * screen, so fetching the catalogue shot for it would buy nothing — as are
 * handspun and hand-typed entries, which have no database yarn to ask about.
 */
function unphotographedYarnIds(): number[] {
  const rows = db
    .selectDistinct({ yarnId: stash.yarnId })
    .from(stash)
    .leftJoin(yarnPhotos, eq(stash.yarnId, yarnPhotos.yarnId))
    .where(
      and(
        isNotNull(stash.yarnId),
        isNull(stash.photoUrl),
        // Never asked about. A yarn asked about and found to have no
        // photograph has a row here with a null `photoUrl`, and is done.
        isNull(yarnPhotos.yarnId),
      ),
    )
    .all();

  return rows.flatMap((row) => (row.yarnId === null ? [] : [row.yarnId]));
}

/**
 * Four at a time.
 *
 * A first sync on a large stash is the only time this is more than a handful of
 * requests, and it is running behind a list the knitter is already reading. Low
 * enough to stay out of the way of anything they do next, high enough that a
 * fifty-skein stash fills in while they are still scrolling it.
 */
const CONCURRENCY = 4;

/** Guards against two syncs asking about the same yarns at once. */
let running: Promise<void> | null = null;

async function fetchInto(ids: number[]): Promise<void> {
  const queue = [...ids];

  const worker = async (): Promise<void> => {
    for (;;) {
      const id = queue.shift();

      if (id === undefined) {
        return;
      }

      try {
        // One response, two facts. The fibre content is missing from the stash
        // payload for the same reason the photograph is, and it is right here
        // in the record already being fetched — reading it costs nothing.
        const yarn = await yarnShow(id);
        const photoUrl = catalogPhoto(yarn);
        const fibers = fiberLine(yarn);
        const fetchedAt = Date.now();

        db.insert(yarnPhotos)
          .values({ yarnId: id, photoUrl, fibers, fetchedAt })
          .onConflictDoUpdate({
            target: yarnPhotos.yarnId,
            set: { photoUrl, fibers, fetchedAt },
          })
          .run();
      } catch {
        // Offline, rate-limited, a yarn since withdrawn from the database:
        // nothing is written, so the next sync asks again. A missing thumbnail
        // is not worth failing a sync over, and `PhotoFrame` already draws the
        // empty case.
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
}

/**
 * Writes down a photograph this app already has, so it is never fetched.
 *
 * For the Add a yarn sheet. Every `/yarns/search.json` result arrives with a
 * `first_photo` — that is why the search list has thumbnails — and the yarn the
 * knitter just tapped is one of them. Recording it before the stash refresh
 * means the new skein is drawn with its picture on the first frame it exists
 * for, rather than blank until a round trip that asks Ravelry something this
 * app was already told.
 */
export function rememberYarnPhoto(yarnId: number, photoUrl: string | null): void {
  const fetchedAt = Date.now();

  db.insert(yarnPhotos)
    .values({ yarnId, photoUrl, fetchedAt })
    .onConflictDoUpdate({ target: yarnPhotos.yarnId, set: { photoUrl, fetchedAt } })
    .run();
}

/**
 * Fills in every stash photograph this app does not have yet.
 *
 * Safe to call whenever the stash changes, and cheap when nothing has: with
 * every yarn already answered for it is one query and no network at all.
 */
export function fillStashPhotos(): Promise<void> {
  running ??= (async () => {
    try {
      const ids = unphotographedYarnIds();

      if (ids.length > 0) {
        await fetchInto(ids);
      }
    } finally {
      running = null;
    }
  })();

  return running;
}
