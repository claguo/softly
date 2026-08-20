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
 * None of which is possible for a pattern whose PDF is on the designer's own
 * site: Ravelry will take it into a library and has nothing to attach.
 * `classifyPatternDownload` reads that off the pattern payload before anything
 * is asked of the account, and it is what keeps the chain above honest.
 *
 * That case is not rare, and it is not only the external `download_location`:
 * a pattern bought on Etsy or LoveCrafts is a PDF in the knitter's own Files
 * and a Ravelry record with nothing attached to it. So there is a second way
 * in, `importPatternPdf`, which skips the whole chain — the knitter picks the
 * file and it is copied into the same folder under the same name, and from
 * there it is the same offline pattern. `source` on the row is the only thing
 * that remembers the difference, and the only screen that reads it is the one
 * that says so out loud.
 *
 * Nothing here throws. Every entry point answers with a `PdfOutcome`, an
 * `ImportOutcome` or a `LibraryProbe`, the same way `syncAll` reports rather
 * than raises, because one of the callers is a fire-and-forget after casting
 * on: a knitter who has just started a project must never see it fail because
 * a PDF did not arrive.
 *
 * Screens read the result through `usePatternPdf` in `queries.ts`, which sits
 * on the small store at the bottom of this file. The store is this module's own
 * rather than SQLite's change listener because this module is the only writer
 * of the table, and it knows exactly when a row moved.
 */

import { eq } from 'drizzle-orm';
import { Directory, File, FileMode, Paths, type FileHandle } from 'expo-file-system';

import { SignedOutError } from '@/auth/client';
import { db } from '@/data/db';
import {
  generateDownloadLink,
  librarySearch,
  PAGE_SIZE,
  RavelryApiError,
  volumeShow,
  volumesCreate,
  type RavelryPatternDetail,
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
 * the data layer does not import from the features layer, and because the
 * three in front of them are this module's own — "not in the library", "the
 * library has no file for it" and "the file was never Ravelry's to give" are
 * answers, not failures.
 */
export type PdfProblem =
  | 'notInLibrary'
  | 'noDownload'
  | 'externalDownload'
  | 'offline'
  | 'signedOut'
  | 'failed';

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

/** A plain object, or null for anything else — arrays included. */
function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

// ---------------------------------------------------------------------------
// Where the PDF lives
// ---------------------------------------------------------------------------

/**
 * How a pattern's PDF is delivered, as far as its detail payload will say.
 *
 * Everything below this file's fold assumes Ravelry has the file: a volume is
 * created, an attachment is waited for, a link is generated. That is only true
 * of a pattern Ravelry hosts. A pattern whose PDF is on the designer's own site
 * still takes a `volumes/create` perfectly happily — and then no attachment
 * ever arrives, because there is nothing to attach. The payload says which it
 * is before anybody taps anything, so this is read first: by the screens, to
 * decide what to offer, and by `addToLibraryAndDownload`, to refuse.
 *
 * `unknown` is the honest answer for a payload that says neither, and it is
 * handled everywhere as "carry on as before" rather than as a refusal — an
 * older pattern that simply does not carry the field is not an external one.
 */
export type PatternDownload =
  | { readonly kind: 'ravelry' }
  | {
      readonly kind: 'external';
      /** The designer's page. Null when none arrived, or it was not http(s). */
      readonly url: string | null;
      /** What the payload says about the price there — not about Ravelry's. */
      readonly free: boolean;
    }
  | { readonly kind: 'unknown' };

/** Everything up to and including space, plus DEL: the classic scheme smuggling. */
const CONTROL = /[\u0000-\u0020\u007f]/g;
const WEB_SCHEME = /^https?:\/\//i;

/**
 * A URL a browser may be handed, or null.
 *
 * `safeUrl` in `notes.ts` by another name and for the same reasons — only http
 * and https survive, and control characters go before the scheme is read, so
 * `java\tscript:` cannot pass itself off as schemeless. Restated here because
 * the data layer does not import from the features layer, and stricter than
 * its twin: nothing is repaired. A note's href can be root-relative and mean
 * ravelry.com; a download location that is not already absolute is not a place
 * this app knows how to send anybody.
 */
function readWebUrl(value: unknown): string | null {
  const text = readText(value);

  if (text === null) {
    return null;
  }

  const url = text.replace(CONTROL, '');
  return WEB_SCHEME.test(url) ? url : null;
}

/**
 * Which of the three a pattern is, read from its detail payload.
 *
 * `ravelry_download` is the plain flag and is trusted first: a payload carrying
 * it has already answered. `download_location.type` is the fallback, and the
 * interesting one — it is where a free pattern says its PDF is somewhere else
 * entirely, and it says so on the pattern screen, long before a library has
 * been walked or written to.
 *
 * Takes anything, including the `null` a screen holds while the request is in
 * flight, and answers `unknown` for it: there is no pattern to classify yet.
 */
export function classifyPatternDownload(
  pattern: RavelryPatternDetail | null | undefined,
): PatternDownload {
  const record = readRecord(pattern);

  if (record === null) {
    return { kind: 'unknown' };
  }

  if (record.ravelry_download === true) {
    return { kind: 'ravelry' };
  }

  const location = readRecord(record.download_location);
  const type = readText(location?.type)?.toLowerCase() ?? null;

  if (type === 'external') {
    return { kind: 'external', url: readWebUrl(location?.url), free: location?.free === true };
  }

  // `ravelry`, and room for the `ravelry_download` spelling of the same thing.
  return type !== null && type.includes('ravelry') ? { kind: 'ravelry' } : { kind: 'unknown' };
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
// A file the knitter brought
// ---------------------------------------------------------------------------

/**
 * What the picker handed over, in the few facts this module needs.
 *
 * Deliberately not the picker's own asset type. The picker lives in the
 * features layer — `detail/pick-pdf.ts`, the same shape and the same reasons as
 * `finish/photo.ts` — and the data layer does not import from it, nor should it
 * have an opinion about which picker was used. A URI, a name, and whatever the
 * picker happened to know about the rest.
 */
export type PickedPdf = {
  /** Where the file is right now: the picker's copy, in the cache directory. */
  readonly uri: string;
  /** The knitter's own name for it — "Sunday Shawl.pdf". */
  readonly name: string;
  /** Bytes, when the picker knew. The copy on disk is asked as well. */
  readonly size?: number | null;
  /** What the picker said it was. Advisory; the file itself is asked too. */
  readonly mimeType?: string | null;
};

/**
 * Why an import did not happen.
 *
 * Two, and neither is a `PdfProblem`: nothing here goes near Ravelry, so "not
 * in your library", "offline" and "signed out" are not answers an import can
 * give. `notAPdf` earns its own word because it is the only one the knitter can
 * do anything about, and what they can do is pick a different file.
 */
export type ImportProblem = 'notAPdf' | 'failed';

export type ImportOutcome =
  | { readonly ok: true; readonly pdf: PatternPdfRow }
  | { readonly ok: false; readonly reason: ImportProblem };

/** `%PDF-`: the first five bytes of the format, and the whole of its header. */
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;

const PDF_MIME = 'application/pdf';

/**
 * How far into the file to look for that header.
 *
 * The specification puts it at byte zero and very nearly every file agrees, but
 * readers have tolerated a preamble in front of it for as long as Acrobat has,
 * and a file that came through a mail client or a download manager can arrive
 * with a byte-order mark on the front. Acrobat's own allowance is a kilobyte,
 * so that is the allowance here: strict enough to catch a renamed zip, loose
 * enough that a real pattern is never turned away over a stray three bytes.
 */
const PDF_SNIFF_BYTES = 1024;

/**
 * Whether the file really is a PDF, or `null` for "could not look".
 *
 * `File.open` hands back a `FileHandle` and `readBytes` takes a length, so the
 * first kilobyte can be read on its own rather than pulling a forty-megabyte
 * pattern through JavaScript to check five bytes of it. Both are synchronous
 * and this runs once, at the moment a file is picked.
 *
 * `null` is a genuine third answer rather than a failure. A file whose handle
 * will not open is one the name and the MIME type still have an opinion about,
 * and refusing the knitter's pattern on the strength of a read that never
 * happened would be exactly the wrong way round.
 */
function sniffPdf(file: File): boolean | null {
  let handle: FileHandle | null = null;

  try {
    handle = file.open(FileMode.ReadOnly);
    const prefix = handle.readBytes(PDF_SNIFF_BYTES);

    for (let start = 0; start + PDF_MAGIC.length <= prefix.length; start += 1) {
      if (PDF_MAGIC.every((byte, offset) => prefix[start + offset] === byte)) {
        return true;
      }
    }

    return false;
  } catch {
    return null;
  } finally {
    try {
      handle?.close();
    } catch {
      // Nothing useful left to do with a handle that will not close.
    }
  }
}

/** The extension on a name or a URI, lowercased, or null for neither. */
function extensionOf(path: string): string | null {
  // A query string and a fragment are not part of a filename, and a URI from a
  // document provider can carry both.
  const name = path.split(/[?#]/)[0] ?? '';
  const dot = name.lastIndexOf('.');

  return dot === -1 ? null : name.slice(dot + 1).toLowerCase();
}

/**
 * Is this file worth copying into the pattern folder?
 *
 * The bytes decide it whenever they can be read. A `.pdf` that is really a zip
 * opens as a blank page in the viewer, and a blank page a week later on a train
 * is precisely the failure this module exists to prevent — the knitter would
 * have no way of knowing until the one moment it mattered.
 *
 * When the bytes cannot be read, the name and the MIME type are what is left,
 * and either one saying "pdf" is enough. The picker was asked for
 * `application/pdf` in the first place, so this is the second lock on the door
 * rather than the only one.
 */
function isPdf(file: File, picked: PickedPdf): boolean {
  const sniffed = sniffPdf(file);

  if (sniffed !== null) {
    return sniffed;
  }

  return (
    extensionOf(picked.name) === 'pdf' ||
    extensionOf(picked.uri) === 'pdf' ||
    readText(picked.mimeType)?.toLowerCase() === PDF_MIME
  );
}

/**
 * Throws away the picker's copy, once ours is written.
 *
 * `copyToCacheDirectory` means the picked URI names a copy the picker made for
 * us, and leaving it there is every imported pattern stored twice until the
 * system decides otherwise. The guard on the path is the important line rather
 * than a tidiness: a URI from anywhere else is the knitter's own file, sitting
 * in their own Files app, and this must never be the thing that deletes it.
 */
function discardPickerCopy(source: File): void {
  try {
    if (source.uri.startsWith(Paths.cache.uri) && source.exists) {
      source.delete();
    }
  } catch {
    // A few hundred kilobytes in the one directory the system empties itself.
  }
}

async function runImport(patternId: number, picked: PickedPdf): Promise<ImportOutcome> {
  const source = new File(picked.uri);

  if (!isPdf(source, picked)) {
    return { ok: false, reason: 'notAPdf' };
  }

  const destination = pdfFile(patternId);

  // `overwrite` rather than delete-then-copy: a copy that fails partway leaves
  // whatever was already downloaded exactly where it was, which is the better
  // half of a half-finished import.
  await source.copy(destination, { overwrite: true });

  const row: PatternPdfRow = {
    patternId,
    source: 'imported',
    // Ravelry has no part in this file, and an imported row must not keep the
    // volume or the attachment of a download it replaced: those two are the
    // handles `generate_download_link` is asked with, and they name a
    // different file entirely.
    volumeId: null,
    productAttachmentId: null,
    // The knitter's own name for it, which is the only name it has. The file
    // on disk is still named by pattern id, the same as every other row.
    filename: readText(picked.name),
    // What is on disk, falling back to what the picker said it would be.
    bytes: destination.size > 0 ? destination.size : readCount(picked.size),
    filePath: destination.uri,
    downloadedAt: Date.now(),
  };

  db.insert(patternPdfs)
    .values(row)
    .onConflictDoUpdate({
      target: patternPdfs.patternId,
      set: {
        source: row.source,
        volumeId: row.volumeId,
        productAttachmentId: row.productAttachmentId,
        filename: row.filename,
        bytes: row.bytes,
        filePath: row.filePath,
        downloadedAt: row.downloadedAt,
      },
    })
    .run();

  discardPickerCopy(source);
  changed();

  return { ok: true, pdf: row };
}

/**
 * Makes a PDF the knitter picked themselves into this pattern's PDF.
 *
 * The whole of the chain at the top of this file is skipped, because for this
 * pattern there is no chain: the file was never Ravelry's, so there is no
 * volume to create, no attachment to wait for and no link to sign. What is left
 * is the last step of a download — a file in the pattern folder and a row
 * saying which pattern it belongs to — and after it the pattern reads offline
 * exactly like one that came down the wire.
 *
 * Replaces whatever was there before, file and row together, which is what
 * makes importing a second time the way to correct a first one. Answers rather
 * than throws, like everything else here, and the two answers it can give are
 * the two the screen has sentences for.
 */
export async function importPatternPdf(
  patternId: number,
  picked: PickedPdf,
): Promise<ImportOutcome> {
  try {
    return await runImport(patternId, picked);
  } catch {
    // A filesystem that refused somewhere in the middle. There is nothing to
    // tell the knitter but that it did not work, and nothing to catch upstream.
    return { ok: false, reason: 'failed' };
  }
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
    source: 'ravelry',
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
        // Written on the way past rather than left alone: a download landing on
        // top of an imported row means Ravelry has the file after all, and the
        // row should say so.
        source: row.source,
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
 *
 * `download` is how a caller hands over what the pattern payload said about
 * where its PDF is, and it is only ever read to refuse: an external one is
 * answered `externalDownload` without touching the account. The screens already
 * know not to ask — this is the second lock on the same door, because the cost
 * of asking is a volume in somebody's library that no file will ever arrive
 * for. Omitted, or `unknown`, and the call proceeds exactly as it always did.
 */
export function addToLibraryAndDownload(
  username: string,
  patternId: number,
  download?: PatternDownload,
): Promise<PdfOutcome> {
  if (download?.kind === 'external') {
    return Promise.resolve<PdfOutcome>({ ok: false, reason: 'externalDownload' });
  }

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
