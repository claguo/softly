/**
 * The local mirror of a Ravelry account.
 *
 * Every table has the same shape: a few typed columns for whatever a list
 * screen actually renders, the untouched response object in `raw`, and the
 * epoch-ms `syncedAt` that wrote the row. Screens read the typed columns; a
 * detail view that needs a field nobody thought about yet reads `raw` and no
 * re-sync is required. Ravelry's own timestamps are parsed to epoch ms and
 * land in the `*Remote` columns, so sorting never depends on string formats.
 *
 * Almost everything here is a cache: nearly every row is a copy of something
 * Ravelry still has, which is what lets `db.ts` throw a table away and let the
 * next sync refill it. There are two exceptions, and they are why `db.ts` grew
 * a migration that adds things in place rather than starting over: a needle
 * whose `source` is `'local'`, which exists nowhere else, and a `pattern_pdfs`
 * row, which is the only handle on a file already written to disk.
 *
 * `pattern_pdfs` and `yarn_photos` are the tables `sync.ts` does not write, and
 * the ones whose columns are typed from Ravelry's documented shapes rather than
 * from an untouched response: there is no `raw` on either, because what they
 * hold is a file on disk and a URL, and the record each came from is a lookup
 * away.
 */

import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Bookmarks from `/people/{username}/favorites/list.json`. The row id is the
 * bookmark's, not the favorited thing's — `patternId` holds that, and is null
 * for the bookmark types (yarns, designers, projects) we do not model yet.
 */
export const favorites = sqliteTable(
  'favorites',
  {
    id: integer('id').primaryKey(),
    favoritedType: text('favorited_type'),
    patternId: integer('pattern_id'),
    name: text('name'),
    designer: text('designer'),
    photoUrl: text('photo_url'),
    free: integer('free', { mode: 'boolean' }),
    createdAtRemote: integer('created_at_remote'),
    raw: text('raw').notNull(),
    syncedAt: integer('synced_at').notNull(),
  },
  (table) => [
    index('favorites_created_at_remote_idx').on(table.createdAtRemote),
    index('favorites_pattern_id_idx').on(table.patternId),
  ],
);

/** Yarn from `/people/{username}/stash/list.json`. */
export const stash = sqliteTable(
  'stash',
  {
    id: integer('id').primaryKey(),
    yarnName: text('yarn_name'),
    brand: text('brand'),
    colorway: text('colorway'),
    weightName: text('weight_name'),
    yardsTotal: real('yards_total'),
    /**
     * The knitter's own photograph of this skein, and only that. A stash entry
     * carries a photo when someone uploaded one to ravelry.com; the yarn's
     * catalogue photograph is not in this payload at all — see `yarnPhotos`,
     * which is what fills the frame for the overwhelming majority of rows.
     */
    photoUrl: text('photo_url'),
    /**
     * The database yarn this entry is of, when it is of one. Handspun and
     * anything entered by name alone has none, which is also why the photo
     * lookup has to be allowed to come up empty.
     */
    yarnId: integer('yarn_id'),
    /**
     * Ravelry's `color_family_id` — one of twenty, see `COLOR_FAMILIES`. The
     * only colour Ravelry will keep: it has no field for an exact one, which
     * is what `yarn_colors` is for.
     */
    colorFamilyId: integer('color_family_id'),
    status: text('status'),
    raw: text('raw').notNull(),
    syncedAt: integer('synced_at').notNull(),
  },
  (table) => [index('stash_yarn_name_idx').on(table.yarnName)],
);

/**
 * The catalogue photograph for one database yarn, keyed by its Ravelry id.
 *
 * This exists because `stash/list.json` hands back no photograph. Not a small
 * one, not a nested one: the record carries `has_photo` (the knitter's own
 * upload, false for almost everyone) and a `yarn` object whose `photos` array
 * is always empty. The picture a knitter recognises their yarn by lives on
 * `/yarns/{id}.json`, one request per yarn, and nowhere in the stash payload.
 *
 * So it is fetched once per yarn and kept. Like `pattern_pdfs` this is not a
 * mirror of an account and `sync.ts` never empties it — a cache keyed by a
 * catalogue id that does not change, holding a URL that has no reason to. See
 * `yarn-photos.ts`, its only writer.
 */
export const yarnPhotos = sqliteTable('yarn_photos', {
  yarnId: integer('yarn_id').primaryKey(),
  /**
   * Null once the yarn has been asked about and had no photograph. That is a
   * real answer and worth keeping: it is what stops the fill from asking again
   * on every sync for a yarn nobody has ever photographed.
   */
  photoUrl: text('photo_url'),
  fetchedAt: integer('fetched_at').notNull(),
});

/**
 * The exact colour of one skein, as the knitter dialled it in.
 *
 * Ravelry cannot hold this. It has twenty colour *families* and a
 * `color_family_id` to file a skein under one of them, and that is the whole of
 * it — there is no hex on a stash entry or on a pack. Probed on a live entry
 * (2026-08-19): `color_attributes` comes back `[]` and stays `[]`, and
 * `colorway_hex`, `color` and a written `color_attributes` all answer 200 and
 * store nothing, which is this API's usual way of saying no.
 *
 * So the family goes to Ravelry, where it is shared and means something to
 * other knitters, and the exact colour stays here. Keyed by the **stash entry**
 * rather than by the yarn, because two skeins of one yarn are two colourways —
 * that is most of the reason a knitter is dialling a colour in at all.
 *
 * Like `pattern_pdfs` and `yarn_photos`, `sync.ts` never empties this: stash
 * ids are Ravelry's and survive the table being replaced, so a colour set once
 * outlives every sync after it.
 */
export const yarnColors = sqliteTable('yarn_colors', {
  stashId: integer('stash_id').primaryKey(),
  /** `#rrggbb`, lowercase. */
  hex: text('hex').notNull(),
  /**
   * The family it was dialled in from, so the swatch it belongs to can still be
   * shown as chosen in the grid after the colour has been moved off it.
   */
  colorFamilyId: integer('color_family_id'),
  setAt: integer('set_at').notNull(),
});

/**
 * Where a needle row came from.
 *
 * `'ravelry'` is a row pulled out of the account and replaced on every sync.
 * `'local'` is one this app wrote, and it is the only row in this database
 * that is not a copy of anything: Ravelry's needle inventory has no create
 * endpoint — the API lists a knitter's needles and hands back the size and
 * type tables, and writes none of them — so a needle typed into this app has
 * nowhere else to be. `sync.ts` steps around those rows and `local.ts` writes
 * them. The screens draw both sources identically.
 */
export const NEEDLE_SOURCES = ['ravelry', 'local'] as const;

export type NeedleSource = (typeof NEEDLE_SOURCES)[number];

/**
 * Needles and hooks from `/people/{username}/needles/list.json`, plus the ones
 * added on the device. `kind` is the craft label Ravelry hands back ("needle",
 * "hook", "Knitting", …) rather than a closed set of ours — the endpoint is
 * undocumented enough that inventing an enum would just throw data away.
 */
export const needles = sqliteTable(
  'needles',
  {
    // Ravelry's needle-record ids are positive. A local row takes a negative
    // one (see `local.ts`), so the two can share this key forever without the
    // app having to know which positive ids Ravelry has handed out.
    id: integer('id').primaryKey(),
    sizeMm: real('size_mm'),
    sizeUs: text('size_us'),
    kind: text('kind'),
    lengthLabel: text('length_label'),
    name: text('name'),
    // Defaulted rather than required, so every row written before this column
    // existed — and every insert that does not think about it — reads as
    // Ravelry's. Only `local.ts` ever says otherwise.
    source: text('source', { enum: NEEDLE_SOURCES }).notNull().default('ravelry'),
    raw: text('raw').notNull(),
    syncedAt: integer('synced_at').notNull(),
  },
  (table) => [index('needles_size_mm_idx').on(table.sizeMm)],
);

/** Projects from `/projects/{username}/list.json`. */
export const projects = sqliteTable(
  'projects',
  {
    id: integer('id').primaryKey(),
    name: text('name'),
    patternId: integer('pattern_id'),
    patternName: text('pattern_name'),
    designer: text('designer'),
    status: text('status'),
    photoUrl: text('photo_url'),
    updatedAtRemote: integer('updated_at_remote'),
    raw: text('raw').notNull(),
    syncedAt: integer('synced_at').notNull(),
  },
  (table) => [index('projects_updated_at_remote_idx').on(table.updatedAtRemote)],
);

/**
 * One downloaded pattern PDF, keyed by the pattern it belongs to.
 *
 * The bytes are not in here — they are a file in the app's document directory,
 * named after the pattern, and this row is the note saying which pattern it is
 * for and where it came from. That makes the row a cache of the *file* rather
 * than of Ravelry: deleting it without deleting the file leaves a PDF nothing
 * can find again, so `pdfs.ts` is the only writer and always moves both.
 *
 * `filePath` is the URI as written. It is stored for the record and read back
 * defensively rather than trusted: iOS moves an app's container between
 * installs, so `pdfs.ts` rebuilds the path from the document directory and
 * repoints this column when the two disagree.
 */
export const patternPdfs = sqliteTable('pattern_pdfs', {
  patternId: integer('pattern_id').primaryKey(),
  /** The library volume the PDF hangs off, for `volumes/{id}` lookups. */
  volumeId: integer('volume_id'),
  /** What `generate_download_link` takes, if the file is ever re-fetched. */
  productAttachmentId: integer('product_attachment_id'),
  /** Ravelry's own name for the file — the file on disk is named by pattern. */
  filename: text('filename'),
  bytes: integer('bytes'),
  filePath: text('file_path').notNull(),
  downloadedAt: integer('downloaded_at').notNull(),
});

/**
 * One row per resource, written in the same transaction as that resource's
 * rows. `capped` records that the pull stopped at the record cap rather than
 * at the end of the account, so the UI can say "showing the first N" instead
 * of quietly lying.
 */
export const syncState = sqliteTable('sync_state', {
  resource: text('resource').primaryKey(),
  lastSyncedAt: integer('last_synced_at').notNull(),
  recordCount: integer('record_count').notNull(),
  capped: integer('capped', { mode: 'boolean' }).notNull(),
});

/**
 * Every table, in the order `db.ts` creates them.
 *
 * Appending one is the whole migration: `create table if not exists` runs over
 * this list on every start, so a database from an older build gains the new
 * table on the next launch and gains it exactly once. Nothing else is needed,
 * and `SCHEMA_VERSION` is not touched — see the note on it.
 */
export const tables = [
  favorites,
  stash,
  needles,
  projects,
  patternPdfs,
  yarnPhotos,
  yarnColors,
  syncState,
] as const;

export type FavoriteRow = typeof favorites.$inferSelect;
export type StashRow = typeof stash.$inferSelect;
export type NeedleRow = typeof needles.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;
export type PatternPdfRow = typeof patternPdfs.$inferSelect;
export type YarnPhotoRow = typeof yarnPhotos.$inferSelect;
export type YarnColorRow = typeof yarnColors.$inferSelect;
export type SyncStateRow = typeof syncState.$inferSelect;

export type FavoriteInsert = typeof favorites.$inferInsert;
export type StashInsert = typeof stash.$inferInsert;
export type NeedleInsert = typeof needles.$inferInsert;
export type ProjectInsert = typeof projects.$inferInsert;
export type PatternPdfInsert = typeof patternPdfs.$inferInsert;
