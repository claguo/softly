/**
 * Pattern PDFs, on the device.
 *
 * A knitter with a pattern in their Ravelry library can already download the
 * PDF on ravelry.com. This module is the same thing for a phone that may be on
 * a train: the file goes into the app's document directory, named after the
 * pattern, and a row in `pattern_pdfs` remembers where it came from. After
 * that the pattern reads with no network at all.
 *
 * The chain Ravelry actually requires, in order:
 *
 * 1. **Find the volume.** The library has no "is this pattern in it" endpoint,
 *    so the whole library is walked once and indexed by `pattern_id`. That
 *    index is shared by every pattern screen for the session (see
 *    `libraryVolumes`), because the alternative is a multi-page walk every time
 *    somebody opens a pattern.
 * 2. **Wait for the attachment.** A volume's PDFs are attached asynchronously —
 *    a few seconds after `volumes/create`, and sometimes not yet present on a
 *    search result — so `awaitAttachment` polls `volumes/{id}` rather than
 *    trusting the first answer.
 * 3. **Ask for a link.** `generate_download_link` returns a signed, expiring
 *    URL. It needs the `library-pdf` OAuth scope, which the app's tokens carry.
 * 4. **Download it**, and only then write the row.
 *
 * Nothing here throws. Every entry point answers with a `PdfOutcome` or a
 * `LibraryProbe`, the same way `syncAll` reports rather than raises, because
 * one of the callers is a fire-and-forget after casting on: a knitter who has
 * just started a project must never see it fail because a PDF did not arrive.
 *
 * Screens read the result through `usePatternPdf` in `queries.ts`, which sits
 * on the small store at the bottom of this file. The store is this module's own
 * rather than SQLite's change listener because this module is the only writer
 * of the table, and it knows exactly when a row moved.
 */

import { eq } from 'drizzle-orm';
import { Directory, File, Paths } from 'expo-file-system';

import { SignedOutError } from '@/auth/client';
import { db } from '@/data/db';
import {
  generateDownloadLink,
  librarySearch,
  PAGE_SIZE,
  RavelryApiError,
  volumeShow,
  volumesCreate,
  type RavelryVolume,
  type RavelryVolumeAttachment,
} from '@/data/ravelry';
import { patternPdfs, type PatternPdfRow } from '@/data/schema';

/** Under the document directory, so nothing here is evicted under pressure. */
const PDF_DIRECTORY = 'pattern-pdfs';

/** Between polls for an attachment Ravelry is still preparing. */
const ATTACHMENT_POLL_MS = 1_200;

/**
 * How long to wait for one. The verified chain attaches a free pattern's PDF
 * in two to six seconds; fifteen is generous enough to cover a slow one and
 * short enough that a stamped "Downloading…" never looks stuck.
 */
const ATTACHMENT_TIMEOUT_MS = 15_000;

/**
 * How long the library index is trusted.
 *
 * Long enough that opening five patterns in a row costs one walk, short enough
 * that a pattern bought on ravelry.com in another tab turns up without
 * restarting the app.
 */
const LIBRARY_INDEX_TTL_MS = 5 * 60_000;

/** 100 volumes a page, so this is a library of a thousand things. */
const MAX_LIBRARY_PAGES = 10;

/**
 * Why a PDF is not on the device.
 *
 * The last three are `Problem` from `@/features/start-project/problem` by
 * another name, and are triaged the same way; they are restated here because
 * the data layer does not import from the features layer, and because the two
 * in front of them are this module's own — "not in the library" and "the
 * library has no file for it" are answers, not failures.
 */
export type PdfProblem = 'notInLibrary' | 'noDownload' | 'offline' | 'signedOut' | 'failed';

export type PdfOutcome =
  | { readonly ok: true; readonly pdf: PatternPdfRow }
  | { readonly ok: false; readonly reason: PdfProblem };

/** What `probePatternLibrary` can say without downloading anything. */
export type LibraryProbe =
  | { readonly kind: 'downloaded'; readonly pdf: PatternPdfRow }
  | { readonly kind: 'inLibrary' }
  | { readonly kind: 'notInLibrary' }
  /** The question could not be asked. Screens say nothing rather than guess. */
  | { readonly kind: 'unknown'; readonly reason: PdfProblem };

// ---------------------------------------------------------------------------
// Reading what arrived
// ---------------------------------------------------------------------------

/** A positive integer id, however Ravelry spelled it. Null for anything else. */
function readId(value: unknown): number | null {
  const id = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(id) && id > 0 ? id : null;
}

function readCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** Which error this is, in the words `PdfOutcome` says them. */
function triage(error: unknown): PdfProblem {
  if (error instanceof SignedOutError) {
    return 'signedOut';
  }
  return error instanceof RavelryApiError && error.offline ? 'offline' : 'failed';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

/**
 * The folder the PDFs live in, created if it is not there yet.
 *
 * `Paths.document` rather than `Paths.cache`: the system empties the cache when
 * storage runs low, and a pattern that vanishes on the train is worse than one
 * that was never downloaded.
 */
function pdfDirectory(): Directory {
  const directory = new Directory(Paths.document, PDF_DIRECTORY);

  if (!directory.exists) {
    directory.create({ intermediates: true, idempotent: true });
  }

  return directory;
}

/**
 * Where one pattern's PDF goes.
 *
 * Named by pattern id rather than by Ravelry's filename, because the id is the
 * only name that is unique, stable, and safe on a filesystem — two designers
 * are perfectly free to both ship a `Shawl.pdf`.
 */
function pdfFile(patternId: number): File {
  return new File(pdfDirectory(), `${patternId}.pdf`);
}

/** The folder as a URI, for a WebView that has to be told what it may read. */
export function patternPdfDirectoryUri(): string {
  return pdfDirectory().uri;
}

function readRow(patternId: number): PatternPdfRow | null {
  try {
    return db.select().from(patternPdfs).where(eq(patternPdfs.patternId, patternId)).get() ?? null;
  } catch {
    return null;
  }
}

/**
 * The row for a pattern whose file is really there, or null.
 *
 * Two things can make a row and a disk disagree, and both are handled here
 * rather than left for a screen to trip over. The file can be gone — deleted
 * with the app's storage, restored from a backup that did not carry it — in
 * which case the row goes too, and the screen simply offers the download
 * again. Or the file can be in the right place under a different absolute
 * path, which is what iOS does when it moves an app's container between
 * installs; then the path is rewritten and the row stands.
 */
export function getPatternPdf(patternId: number): PatternPdfRow | null {
  const row = readRow(patternId);

  if (row === null) {
    return null;
  }

  let uri: string;
  try {
    const file = pdfFile(patternId);
    if (!file.exists) {
      forgetRow(patternId);
      return null;
    }
    uri = file.uri;
  } catch {
    // The filesystem itself refused to answer. Nothing can be shown from a
    // file that cannot be looked at, and nothing is worth deleting over it.
    return null;
  }

  if (row.filePath === uri) {
    return row;
  }

  try {
    db.update(patternPdfs)
      .set({ filePath: uri })
      .where(eq(patternPdfs.patternId, patternId))
      .run();
  } catch {
    // The path in hand is still the right one to use, written down or not.
  }

  return { ...row, filePath: uri };
}

function forgetRow(patternId: number): void {
  try {
    db.delete(patternPdfs).where(eq(patternPdfs.patternId, patternId)).run();
  } catch {
    // Nothing left to do about it, and the file is already the thing that
    // decides whether a pattern reads offline.
  }
  changed();
}

/**
 * Removes one downloaded PDF: the file first, then the row.
 *
 * That order is the safe one. A row without a file is a broken promise a
 * screen would have to discover; a file without a row is a few hundred
 * kilobytes that the next download overwrites.
 */
export function deletePatternPdf(patternId: number): void {
  try {
    const file = pdfFile(patternId);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Fall through: the row goes either way, so the app stops claiming to
    // have something it may not have.
  }

  forgetRow(patternId);
}

// ---------------------------------------------------------------------------
// The library, indexed
// ---------------------------------------------------------------------------

type LibraryIndex = {
  readonly username: string;
  readonly at: number;
  readonly volumes: Promise<Map<number, RavelryVolume>>;
};

let index: LibraryIndex | null = null;

/**
 * Every single-pattern volume in the library, keyed by pattern.
 *
 * Volumes that are books or magazines carry a `pattern_source_id` and no
 * `pattern_id`; they are skipped rather than indexed, because this app can
 * only offer a download from a pattern screen and a book is not one pattern.
 */
async function walkLibrary(username: string): Promise<Map<number, RavelryVolume>> {
  const found = new Map<number, RavelryVolume>();

  for (let page = 1; page <= MAX_LIBRARY_PAGES; page += 1) {
    const { volumes, paginator } = await librarySearch(username, { page, pageSize: PAGE_SIZE });

    for (const volume of volumes) {
      const patternId = readId(volume.pattern_id);
      // First one wins: a pattern owned twice over is still one pattern, and
      // the earlier volume is the older, more settled entry.
      if (patternId !== null && !found.has(patternId)) {
        found.set(patternId, volume);
      }
    }

    const lastPage = readCount(paginator?.last_page) ?? readCount(paginator?.page_count) ?? page;
    if (volumes.length === 0 || page >= lastPage) {
      break;
    }
  }

  return found;
}

/**
 * The index, walked at most once per `LIBRARY_INDEX_TTL_MS`.
 *
 * Concurrent callers share the promise — two pattern screens opened in the
 * same breath are one walk — and a failed walk is dropped rather than
 * remembered, so being offline once does not mean an empty library for the
 * rest of the session. Same shape as `getNeedleSizes`, for the same reasons.
 */
function libraryVolumes(username: string): Promise<Map<number, RavelryVolume>> {
  const now = Date.now();
  const current = index;

  if (current !== null && current.username === username && now - current.at < LIBRARY_INDEX_TTL_MS) {
    return current.volumes;
  }

  const volumes = walkLibrary(username);
  const entry: LibraryIndex = { username, at: now, volumes };
  index = entry;

  void volumes.catch(() => {
    if (index === entry) {
      index = null;
    }
  });

  return volumes;
}

/** Drops the index, after this app has changed what is in the library. */
function forgetLibrary(): void {
  index = null;
}

// ---------------------------------------------------------------------------
// Attachment → file
// ---------------------------------------------------------------------------

/**
 * The first attachment that can be turned into a download.
 *
 * No filtering on `content_type`: Ravelry documents it as only ever
 * `application/pdf`, so an attachment with an id is a PDF, and a stricter test
 * would only be a way to miss one.
 */
function firstAttachment(volume: RavelryVolume): RavelryVolumeAttachment | null {
  const attachments = volume.volume_attachments;

  if (!Array.isArray(attachments)) {
    return null;
  }

  for (const attachment of attachments) {
    if (readId(attachment?.product_attachment_id) !== null) {
      return attachment;
    }
  }

  return null;
}

type Ready = {
  readonly volume: RavelryVolume;
  readonly attachment: RavelryVolumeAttachment;
  readonly attachmentId: number;
};

/**
 * Waits for a volume to have a file on it, up to `ATTACHMENT_TIMEOUT_MS`.
 *
 * Returns immediately when the volume in hand already carries one, which is
 * the usual case for something owned for a while; the polling is for the
 * seconds right after `volumes/create`, and for search results that come back
 * without their attachments listed.
 */
async function awaitAttachment(volume: RavelryVolume): Promise<Ready | null> {
  const deadline = Date.now() + ATTACHMENT_TIMEOUT_MS;
  let current = volume;

  for (;;) {
    const attachment = firstAttachment(current);
    const attachmentId = readId(attachment?.product_attachment_id);

    if (attachment !== null && attachmentId !== null) {
      return { volume: current, attachment, attachmentId };
    }

    const volumeId = readId(current.id);
    if (volumeId === null || Date.now() >= deadline) {
      return null;
    }

    await delay(ATTACHMENT_POLL_MS);
    current = await volumeShow(volumeId);
  }
}

/**
 * Fetches the file and writes the row.
 *
 * The link is asked for last and used at once: it expires, so there is nothing
 * to be gained by holding one. `idempotent` lets a re-download overwrite a
 * half-written file from an attempt that failed partway.
 */
async function fetchPdf(patternId: number, ready: Ready): Promise<PatternPdfRow> {
  const link = await generateDownloadLink(ready.attachmentId);
  const file = await File.downloadFileAsync(link.url, pdfFile(patternId), { idempotent: true });

  const row: PatternPdfRow = {
    patternId,
    volumeId: readId(ready.volume.id),
    productAttachmentId: ready.attachmentId,
    filename: readText(ready.attachment.filename),
    // What is on disk, falling back to what Ravelry said it would be.
    bytes: file.size > 0 ? file.size : readCount(ready.attachment.bytes),
    filePath: file.uri,
    downloadedAt: Date.now(),
  };

  db.insert(patternPdfs)
    .values(row)
    .onConflictDoUpdate({
      target: patternPdfs.patternId,
      set: {
        volumeId: row.volumeId,
        productAttachmentId: row.productAttachmentId,
        filename: row.filename,
        bytes: row.bytes,
        filePath: row.filePath,
        downloadedAt: row.downloadedAt,
      },
    })
    .run();

  changed();
  return row;
}

async function downloadFrom(patternId: number, volume: RavelryVolume): Promise<PdfOutcome> {
  const ready = await awaitAttachment(volume);

  if (ready === null) {
    return { ok: false, reason: 'noDownload' };
  }

  return { ok: true, pdf: await fetchPdf(patternId, ready) };
}

// ---------------------------------------------------------------------------
// What the screens call
// ---------------------------------------------------------------------------

/**
 * One attempt per pattern at a time.
 *
 * Casting on fires a download in the background, and the knitter can be back
 * on the pattern screen tapping the same button a second later. Both callers
 * get the same promise rather than two downloads of the same file.
 */
const inFlight = new Map<number, Promise<PdfOutcome>>();

function share(patternId: number, run: () => Promise<PdfOutcome>): Promise<PdfOutcome> {
  const running = inFlight.get(patternId);

  if (running !== undefined) {
    return running;
  }

  const done = settle(run).finally(() => {
    if (inFlight.get(patternId) === done) {
      inFlight.delete(patternId);
    }
  });

  inFlight.set(patternId, done);
  return done;
}

/** Turns anything thrown along the way into the outcome the callers read. */
async function settle(run: () => Promise<PdfOutcome>): Promise<PdfOutcome> {
  try {
    return await run();
  } catch (error) {
    return { ok: false, reason: triage(error) };
  }
}

async function runEnsure(username: string, patternId: number): Promise<PdfOutcome> {
  const existing = getPatternPdf(patternId);
  if (existing !== null) {
    return { ok: true, pdf: existing };
  }

  const volumes = await libraryVolumes(username);
  const volume = volumes.get(patternId);

  if (volume === undefined) {
    return { ok: false, reason: 'notInLibrary' };
  }

  return downloadFrom(patternId, volume);
}

/**
 * The PDF for a pattern the knitter already owns, downloading it if it is not
 * on the device yet.
 *
 * Answers `notInLibrary` rather than adding anything: putting a pattern in
 * somebody's library is a claim that they own it, and only
 * `addToLibraryAndDownload` is allowed to make it.
 */
export function ensurePatternPdf(username: string, patternId: number): Promise<PdfOutcome> {
  return share(patternId, () => runEnsure(username, patternId));
}

async function runAddToLibrary(username: string, patternId: number): Promise<PdfOutcome> {
  const existing = getPatternPdf(patternId);
  if (existing !== null) {
    return { ok: true, pdf: existing };
  }

  // Already owned is the answer often enough — a knitter who added it on the
  // web an hour ago — and a second `volumes/create` would be a second entry in
  // their library for the same pattern.
  const volumes = await libraryVolumes(username);
  const known = volumes.get(patternId);

  if (known !== undefined) {
    return downloadFrom(patternId, known);
  }

  const created = await volumesCreate({ pattern_id: patternId });
  // The index is now a volume behind whatever the library actually holds.
  forgetLibrary();

  return downloadFrom(patternId, created);
}

/**
 * Adds a free pattern to the knitter's library and downloads what Ravelry
 * attaches to it.
 *
 * This writes to the account, and the library is meant to be things the
 * knitter owns — so the screens only offer it for a pattern whose payload says
 * `free`. There is no purchase flow behind this and there will not be one: a
 * paid pattern is bought on Ravelry, and this app waits until it is owned.
 */
export function addToLibraryAndDownload(
  username: string,
  patternId: number,
): Promise<PdfOutcome> {
  return share(patternId, () => runAddToLibrary(username, patternId));
}

/**
 * Whether a pattern could be downloaded, without downloading it.
 *
 * The pieces are `ensurePatternPdf`'s own — the row, then the library index —
 * so a screen that probes and then downloads pays for the walk once. A screen
 * with a row in hand should not call this at all: the answer is already on the
 * device.
 */
export async function probePatternLibrary(
  username: string,
  patternId: number,
): Promise<LibraryProbe> {
  const existing = getPatternPdf(patternId);
  if (existing !== null) {
    return { kind: 'downloaded', pdf: existing };
  }

  try {
    const volumes = await libraryVolumes(username);
    return volumes.has(patternId) ? { kind: 'inLibrary' } : { kind: 'notInLibrary' };
  } catch (error) {
    return { kind: 'unknown', reason: triage(error) };
  }
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

const listeners = new Set<() => void>();

/**
 * One cached row per pattern, so the snapshot a component read last render is
 * the same object this render — `useSyncExternalStore` compares by identity and
 * would otherwise re-render forever.
 */
const snapshots = new Map<number, PatternPdfRow | null>();

function changed(): void {
  snapshots.clear();
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeToPatternPdfs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The store's view of one pattern. Stable between writes; see `snapshots`. */
export function patternPdfSnapshot(patternId: number): PatternPdfRow | null {
  const cached = snapshots.get(patternId);

  if (cached !== undefined) {
    return cached;
  }

  const row = getPatternPdf(patternId);
  snapshots.set(patternId, row);
  return row;
}
