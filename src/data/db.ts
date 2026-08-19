/**
 * The one SQLite connection and the drizzle instance wrapped around it.
 *
 * Migrations are generated from `schema.ts` at startup rather than checked in
 * as SQL: `getTableConfig` already knows every column and index, so deriving
 * `create table if not exists` from it means the schema cannot drift from the
 * database, and there is no migration folder, no bundler plugin, and no
 * drizzle-kit at runtime.
 *
 * *Adding* a table needs nothing at all — `create table if not exists` runs
 * over `tables` on every start, so a database from an older build gains it on
 * the next launch and gains it once. *Adding a column* is the case that needed
 * work: `create table if not exists` does nothing to a table that already
 * exists, so an older phone would never see the new column. `addMissingColumns`
 * asks the database what it has and adds the difference.
 *
 * Changing or removing one is still handled by bumping `SCHEMA_VERSION`, which
 * drops the cache and lets the next sync refill it — see the note there, which
 * is no longer quite as free as it was.
 */

import { Column, is } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { getTableConfig, type SQLiteColumn, type SQLiteTable } from 'drizzle-orm/sqlite-core';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import { favorites, needles, patternPdfs, projects, stash, syncState, tables } from '@/data/schema';

const DATABASE_NAME = 'softgoods.db';

/**
 * Bump on a change to `schema.ts` that an existing database cannot satisfy by
 * gaining a column — a retyped column, a dropped one, a changed key.
 *
 * It costs more than it used to. The drop below takes the whole database with
 * it, and two tables now hold rows nothing else has a copy of — the needles
 * this app wrote, and the `pattern_pdfs` rows that are the only handle on the
 * PDFs already on disk — so a bump means writing something that carries those
 * out and back, and for the PDFs it means sweeping the files too or leaving
 * them stranded. A column added to the end of a table does not need one, and
 * neither does a whole new table; `addMissingColumns` and `create table if not
 * exists` handle those.
 */
const SCHEMA_VERSION = 1;

/**
 * `enableChangeListener` turns on sqlite3_update_hook, which is what the live
 * hooks in `queries.ts` subscribe to. Without it every screen would show
 * whatever was in the table when it mounted.
 */
export const sqlite: SQLiteDatabase = openDatabaseSync(DATABASE_NAME, {
  enableChangeListener: true,
});

export const db = drizzle(sqlite, {
  schema: { favorites, stash, needles, projects, patternPdfs, syncState },
});

function quote(identifier: string): string {
  // Identifiers all come from `schema.ts`, but quoting keeps a column called
  // `order` or `group` from ever becoming a syntax error.
  return `"${identifier.replaceAll('"', '""')}"`;
}

/**
 * A column's default as SQL, or null for one this renderer cannot write down.
 *
 * Null is the safe answer: a missing default costs the column its fallback,
 * where a mis-rendered one would be baked into the table for good.
 */
function literal(value: unknown): string | null {
  if (typeof value === 'string') {
    return `'${value.replaceAll("'", "''")}'`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'boolean') {
    // The same 0/1 drizzle's boolean mode reads back out.
    return value ? '1' : '0';
  }
  return null;
}

/** One column, as it is written in both `create table` and `add column`. */
function columnDefinition(column: SQLiteColumn): string {
  const parts = [quote(column.name), column.getSQLType()];

  if (column.primary) {
    parts.push('primary key');
  } else if (column.notNull) {
    parts.push('not null');
  }

  const fallback = column.hasDefault ? literal(column.default) : null;
  if (fallback !== null) {
    parts.push(`default ${fallback}`);
  }

  return parts.join(' ');
}

function createTable(table: SQLiteTable): string {
  const config = getTableConfig(table);
  const columns = config.columns.map(columnDefinition);
  return `create table if not exists ${quote(config.name)} (${columns.join(', ')});`;
}

/**
 * Columns `schema.ts` has grown that this database has not.
 *
 * Idempotent by construction: it asks SQLite which columns are there and adds
 * only the difference, so the second run has nothing to say. Two kinds are
 * skipped, both because SQLite refuses them on a table that may already hold
 * rows — a primary key, and a `not null` column with no default. Neither can
 * arrive this way, so both are left to `SCHEMA_VERSION`.
 */
function addMissingColumns(table: SQLiteTable): string[] {
  const config = getTableConfig(table);

  const present = new Set(
    sqlite
      .getAllSync<{ name?: unknown }>(`pragma table_info(${quote(config.name)});`)
      .map((row) => (typeof row.name === 'string' ? row.name : '')),
  );

  // No columns means no table, which means `create table` above has just made
  // it whole. Nothing to add, and nothing that would succeed if there were.
  if (present.size === 0) {
    return [];
  }

  const statements: string[] = [];

  for (const column of config.columns) {
    const addable = !column.notNull || (column.hasDefault && literal(column.default) !== null);
    if (present.has(column.name) || column.primary || !addable) {
      continue;
    }
    statements.push(`alter table ${quote(config.name)} add column ${columnDefinition(column)};`);
  }

  return statements;
}

function createIndexes(table: SQLiteTable): string[] {
  const config = getTableConfig(table);
  const statements: string[] = [];

  for (const definition of config.indexes) {
    const indexColumns = definition.config.columns;
    const columnNames = indexColumns
      .filter((column): column is SQLiteColumn => is(column, Column))
      .map((column) => quote(column.name));

    // An index over a SQL expression cannot be rendered from the column list
    // alone; nothing in `schema.ts` declares one, and skipping it costs a
    // little speed rather than correctness.
    if (columnNames.length !== indexColumns.length) {
      continue;
    }

    const unique = definition.config.unique ? 'unique ' : '';
    statements.push(
      `create ${unique}index if not exists ${quote(definition.config.name)} ` +
        `on ${quote(config.name)} (${columnNames.join(', ')});`,
    );
  }

  return statements;
}

/**
 * Fills the stash columns that were added to a table already holding rows.
 *
 * `addMissingColumns` can only ever add a column full of nulls, and `sync.ts`
 * is what would fill it — on the next sync, which could be a pull-to-refresh
 * away or a flight away. Meanwhile every screen that joins on one of these
 * matches nothing: a thumbnail is a placeholder and a skein has no colour, on a
 * database that has had both answers all along. `raw` is the untouched Ravelry
 * record, and what these columns hold was lifted out of it in the first place.
 *
 * So it is read straight back with `json_extract` rather than waited for. This
 * is a migration and lives with the migrations, not with the feature that
 * noticed: `sync.ts` writes both columns directly on every row it inserts, so
 * the only rows this can ever touch are ones written before the column existed.
 *
 * Guarded to change nothing when there is nothing to change — a row with no
 * database yarn stays null rather than being rewritten to null on every start,
 * which would wake every live query on the stash for no reason.
 */
function backfillStashColumns(): void {
  sqlite.execSync(`
    update "stash"
       set "yarn_id" = coalesce(
             json_extract("raw", '$.yarn.id'),
             json_extract("raw", '$.primary_pack.yarn_id')
           )
     where "yarn_id" is null
       and coalesce(
             json_extract("raw", '$.yarn.id'),
             json_extract("raw", '$.primary_pack.yarn_id')
           ) is not null;

    update "stash"
       set "color_family_id" = json_extract("raw", '$.primary_pack.color_family_id')
     where "color_family_id" is null
       and json_extract("raw", '$.primary_pack.color_family_id') is not null;
  `);
}

function readSchemaVersion(): number {
  const row = sqlite.getFirstSync<{ user_version?: number }>('pragma user_version');
  return typeof row?.user_version === 'number' ? row.user_version : 0;
}

/**
 * Idempotent: safe to call on every start, and a no-op once the database
 * already matches `SCHEMA_VERSION`.
 */
export function runMigrations(): void {
  // WAL lets a screen read while a sync writes, which is the whole point of
  // holding the data locally.
  sqlite.execSync('pragma journal_mode = WAL;');

  const installed = readSchemaVersion();
  if (installed !== 0 && installed !== SCHEMA_VERSION) {
    const drops = [...tables]
      .reverse()
      .map((table) => `drop table if exists ${quote(getTableConfig(table).name)};`);
    sqlite.execSync(drops.join('\n'));
  }

  sqlite.execSync(tables.map(createTable).join('\n'));

  // Before the indexes, and after the tables: an index cannot be built over a
  // column that is only now arriving, and a column cannot be added to a table
  // that does not exist yet.
  const alterations = tables.flatMap(addMissingColumns);
  if (alterations.length > 0) {
    sqlite.execSync(alterations.join('\n'));
  }

  sqlite.execSync(tables.flatMap(createIndexes).join('\n'));

  backfillStashColumns();

  // Not parameterisable — SQLite takes a literal here, and the literal is a
  // constant in this file.
  sqlite.execSync(`pragma user_version = ${SCHEMA_VERSION};`);
}

// Runs on import: nothing in `src/data` works before the tables exist, and the
// sync driver is synchronous, so there is no startup window to hand the UI.
runMigrations();
