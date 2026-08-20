/**
 * A photograph for a project that has none.
 *
 * Most projects in most accounts have never been photographed — `first_photo`
 * is null on every project in the test account — so the project screen opens on
 * the striped placeholder for something the app could perfectly well show a
 * picture of: the pattern's own. It is not the knitter's finished object and it
 * should never be mistaken for one, but it is what the thing is *meant* to look
 * like, and that beats stripes.
 *
 * There are two ways to get it and the free one is tried first:
 *
 * - **Out of the mirror.** A favourited pattern's photograph is already on this
 *   device. `sync.ts` keeps the untouched bookmark in `favorites.raw`, and the
 *   whole `first_photo` object is in there — every size, including the large
 *   ones. Reading it back costs a query and no network at all.
 * - **From `/patterns/{id}.json`,** for a pattern that was never bookmarked.
 *   Note that endpoint leaves `first_photo` null and fills `photos` instead —
 *   the same quirk as `/yarns/{id}.json` — so the array is what is read.
 *
 * Either way the answer is kept, because a pattern's photograph has no reason
 * to change and the next visit should not pay again.
 */

import { eq } from 'drizzle-orm';

import { db } from '@/data/db';
import { patternShow } from '@/data/ravelry';
import { favorites, patternPhotos } from '@/data/schema';

/**
 * Largest first, which is the opposite of the order `sync.ts` reads photos in.
 *
 * That one fills 44pt list cells, where the square crop is the right file to
 * fetch. This one fills a full-width 4/5 frame at the top of a screen, and a
 * 75px square stretched across a phone is worse than no picture at all.
 */
const HERO_URL_KEYS = [
  'medium2_url',
  'medium_url',
  'small2_url',
  'small_url',
  'square_url',
] as const;

function heroUrl(photo: unknown): string | null {
  if (typeof photo !== 'object' || photo === null) {
    return null;
  }

  for (const key of HERO_URL_KEYS) {
    const url = (photo as Record<string, unknown>)[key];
    if (typeof url === 'string' && url.trim() !== '') {
      return url;
    }
  }

  return null;
}

/** The photograph already on this device for a pattern, if it was bookmarked. */
function fromMirror(patternId: number): string | null {
  const row = db
    .select({ raw: favorites.raw })
    .from(favorites)
    .where(eq(favorites.patternId, patternId))
    .get();

  if (!row) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(row.raw);
    const favorited =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>).favorited
        : null;
    const photo =
      typeof favorited === 'object' && favorited !== null
        ? (favorited as Record<string, unknown>).first_photo
        : null;

    return heroUrl(photo);
  } catch {
    return null;
  }
}

function remember(patternId: number, photoUrl: string | null): void {
  const fetchedAt = Date.now();

  db.insert(patternPhotos)
    .values({ patternId, photoUrl, fetchedAt })
    .onConflictDoUpdate({ target: patternPhotos.patternId, set: { photoUrl, fetchedAt } })
    .run();
}

/** What is already known, without asking anyone. Null for never looked up. */
export function getPatternPhoto(patternId: number | null): string | null {
  if (patternId === null) {
    return null;
  }

  const cached = db
    .select({ photoUrl: patternPhotos.photoUrl })
    .from(patternPhotos)
    .where(eq(patternPhotos.patternId, patternId))
    .get();

  return cached?.photoUrl ?? fromMirror(patternId);
}

/** Guards against two screens asking about the same pattern at once. */
const running = new Map<number, Promise<string | null>>();

/**
 * The pattern's photograph, fetching it once if this device has never seen it.
 *
 * Safe to call on every visit: a pattern already answered for — including one
 * answered "no photograph" — returns from the table without touching the
 * network. A failed request writes nothing, so the next visit tries again.
 */
export function ensurePatternPhoto(patternId: number | null): Promise<string | null> {
  if (patternId === null) {
    return Promise.resolve(null);
  }

  const known = getPatternPhoto(patternId);

  if (known !== null) {
    return Promise.resolve(known);
  }

  // A row that exists with a null photograph is a real answer, not a gap: the
  // pattern was asked about and had none. Only the absence of a row is a
  // reason to go and look.
  const asked = db
    .select({ patternId: patternPhotos.patternId })
    .from(patternPhotos)
    .where(eq(patternPhotos.patternId, patternId))
    .get();

  if (asked) {
    return Promise.resolve(null);
  }

  const inFlight = running.get(patternId);

  if (inFlight) {
    return inFlight;
  }

  const request = (async () => {
    try {
      const pattern = await patternShow(patternId);
      // `first_photo` is null on this endpoint even when there are eight
      // pictures; `photos` is where they are.
      const photos = (pattern as { photos?: unknown }).photos;
      const url = heroUrl(Array.isArray(photos) ? photos[0] : null);

      remember(patternId, url);

      return url;
    } catch {
      // Offline, or a pattern since withdrawn. Nothing is written, so this is
      // tried again next time; the frame keeps its stripes until then.
      return null;
    } finally {
      running.delete(patternId);
    }
  })();

  running.set(patternId, request);

  return request;
}
