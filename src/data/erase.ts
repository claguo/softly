/**
 * Everything this app keeps on the device, gone.
 *
 * This is what Erase Softly data on the Stash tab runs, and the nearest thing
 * the app has to deleting an account. Softly has no account of its own —
 * the sign-in is Ravelry's, and the broker in `auth/` stores nothing — so the
 * whole of what Softly holds about anybody is on their phone: the mirror of
 * their Ravelry account, the rows only this app ever had (the needles typed in
 * by hand, the custom patterns, the row counters, the matched colours), and the
 * PDFs. The session is the caller's to clear, and to clear first; see
 * `deleteAccount` in `@/auth/context`.
 *
 * Nothing here touches Ravelry. There is no endpoint that deletes a Ravelry
 * account or revokes a token, and nothing a knitter made there is Softly's to
 * take away.
 */

import { getTableConfig } from 'drizzle-orm/sqlite-core';

import { sqlite } from '@/data/db';
import { deleteAllPatternPdfFiles } from '@/data/pdfs';
import { rowCountersErased } from '@/data/row-counters';
import { tables } from '@/data/schema';
import { settleSyncForErase } from '@/data/sync';

/**
 * Empties every table and deletes every PDF. Throws if either half fails, so
 * the caller never reports an erase that did not happen.
 *
 * The tables are emptied rather than dropped, and the file is not deleted: the
 * connection in `db.ts` is opened at import and held by every module in this
 * folder, and the next sign-in needs the tables to be there.
 */
export async function eraseDeviceData(): Promise<void> {
  await settleSyncForErase();

  // `where 1` is not decoration. A bare `delete from` takes SQLite's truncate
  // path, which skips the update hook — and the hook is what tells the live
  // stores in `queries.ts` to throw their snapshots away. Without it the next
  // account to sign in would be shown the last one's lists until a write
  // happened to land on each table.
  const deletes = tables.map(
    (table) => `delete from "${getTableConfig(table).name.replaceAll('"', '""')}" where 1;`,
  );

  sqlite.withTransactionSync(() => {
    sqlite.execSync(deletes.join('\n'));
  });

  rowCountersErased();
  deleteAllPatternPdfFiles();

  // A deleted row is only unlinked: its bytes stay in the file's free pages and
  // in the write-ahead log until something overwrites them. Rebuilding the file
  // and truncating the log is what makes "erased" true of the disk as well.
  // Best effort — the rows are already gone as far as any query can tell.
  try {
    sqlite.execSync('vacuum;');
    sqlite.execSync('pragma wal_checkpoint(truncate);');
  } catch {
    // Left for the next vacuum; nothing the knitter can act on.
  }
}
