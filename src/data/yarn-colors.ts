/**
 * The colour of a skein, as close as the knitter cares to get.
 *
 * Ravelry files yarn under twenty colour *families* and stops there. There is
 * no hex on a stash entry and none on a pack — probed on a live entry
 * (2026-08-19), `color_attributes` comes back `[]` and stays `[]`, and
 * `colorway_hex`, `color` and a written `color_attributes` each answer 200 and
 * store nothing. So the family is posted to Ravelry, where it is shared and
 * searchable, and the shade the knitter matched by eye is kept here.
 *
 * That split is the whole design. What the picker writes is not a better
 * version of Ravelry's field — it is a different thing, private to this device,
 * for one job: recognising your own skein in a list. `sync.ts` never empties
 * this table, and stash ids are Ravelry's, so a colour set once survives every
 * sync after it.
 *
 * Keyed by the stash entry, not the yarn: two balls of the same yarn in two
 * colourways are two rows, which is most of the point.
 */

import { eq } from 'drizzle-orm';

import { db } from '@/data/db';
import { yarnColors } from '@/data/schema';

/** `#rrggbb`, lowercase, or null for anything that is not one. */
export function normalizeHex(value: string): string | null {
  const cut = value.trim().toLowerCase();
  const full = /^#?([0-9a-f]{6})$/.exec(cut);

  if (full) {
    return `#${full[1]}`;
  }

  // `#abc` is a colour a person might type; expand it rather than refuse it.
  const short = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(cut);

  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : null;
}

/**
 * Writes down the colour of one skein, replacing whatever was there.
 *
 * Synchronous, like every other write against this database, and it needs no
 * refresh behind it: `queries.ts` joins this table into the stash reads and
 * watches it for changes, so the cards recolour themselves.
 */
export function rememberYarnColor(
  stashId: number,
  hex: string,
  colorFamilyId: number | null,
): void {
  const normalized = normalizeHex(hex);

  if (normalized === null) {
    return;
  }

  const setAt = Date.now();

  db.insert(yarnColors)
    .values({ stashId, hex: normalized, colorFamilyId, setAt })
    .onConflictDoUpdate({
      target: yarnColors.stashId,
      set: { hex: normalized, colorFamilyId, setAt },
    })
    .run();
}

/**
 * Forgets the dialled-in colour for one skein.
 *
 * The family it was filed under is Ravelry's and is not touched here — clearing
 * that is a write to Ravelry, and the edit sheet does it separately. This only
 * puts the shade back to whatever the family's own swatch is.
 */
export function forgetYarnColor(stashId: number): void {
  db.delete(yarnColors).where(eq(yarnColors.stashId, stashId)).run();
}

/** The colour written down for one skein, or null if nobody has set one. */
export function getYarnColor(stashId: number): string | null {
  const row = db
    .select({ hex: yarnColors.hex })
    .from(yarnColors)
    .where(eq(yarnColors.stashId, stashId))
    .get();

  return row?.hex ?? null;
}
