/**
 * The offline-first data layer.
 *
 * Screens want `useFavorites`/`useStash`/`useNeedles`/`useProjects` for what
 * is already on the device, `useProject`/`useProjectDetail`/`useStashEntry` for
 * one row that has to redraw when a write lands under the screen holding it,
 * `getProjectById`/`getStashById`/
 * `getFavoriteByPatternId` for one cached row whole, `syncAll` plus
 * `useSyncStatus` for refreshing it, and `patternsSearch`/`patternShow`/
 * `yarnsSearch` for the things that only exist online. `createProject`,
 * `createStashEntry` and `favoritesCreate` write to Ravelry, `updateProject`
 * and `updateStashEntry` rewrite what is already there, and `deleteProject`
 * and `deleteStashEntry` take one away — the only two calls in here with no
 * way back, which is why both of their sheets ask twice before making one.
 * `favoritesDelete` also takes one away and asks nothing at all: it undoes
 * `favoritesCreate`, and `favoritesCreate` puts it back. `createPack`,
 * `updatePack` and `deletePack` are the yarn on a project after the cast on —
 * Ravelry will not take a pack through the project endpoint a second time, so
 * moving a project onto another skein is its own small API, and `deletePack`
 * unhooks an allocation without touching the skein it drew on.
 * `refreshProjects`/`refreshStash`/`refreshFavorites` are how the mirror
 * catches up afterwards — one table each, for the caller that already knows
 * which one it changed; `insertLocalNeedle` and `deleteLocalNeedle` write to
 * the mirror itself, because the needle drawer is the one thing Ravelry will
 * not be told about — and the delete refuses anything Ravelry owns, since a
 * sync would only put it straight back. `finishProject` is the other end of the same story — the
 * photograph, the status and the refresh in one call that reports rather than
 * throws. `ensureProjectDetail` fetches the half of a project `list.json`
 * leaves out — the yarn it ate, the needles it tied up, the notes on it — and
 * keeps it on the device; `forgetProjectDetail` throws that half away for a
 * project nobody has any more, since no list will ever come along and notice.
 * `db` and the tables are here for anything that needs
 * a query this module has not thought of yet.
 *
 * Offline patterns are their own small chain: `usePatternPdf` for what is
 * already on the device, `classifyPatternDownload` for whether Ravelry has the
 * file at all, `probePatternLibrary` for whether one could be,
 * `ensurePatternPdf` and `addToLibraryAndDownload` for getting it there,
 * `importPatternPdf` for the far more common pattern whose PDF was never
 * Ravelry's to send, and `deletePatternPdf` for taking it away again.
 *
 * The patterns that are not on Ravelry at all are the app's own the same way
 * the needle drawer is, and nothing about one is ever sent anywhere:
 * `insertCustomPattern`, `updateCustomPattern` and `deleteCustomPattern` write
 * them — the delete takes the PDF with it, since nothing else will ever collect
 * a file keyed by an id this app made up — and `getCustomPattern` and
 * `useCustomPattern` read one. `usePatternShelf` is the other half of that
 * story: every pattern this phone can open, the typed-in ones and the
 * downloaded ones in one alphabetical list, which is what the Stash tab draws.
 *
 * Row counters are the app's own the way the local needles are — Ravelry has
 * no notion of one, so nothing about them is ever sent anywhere.
 * `useRowCounters` is the counters on a project, `useRowCountersForProjects`
 * the same thing for the reader, which is keyed by a pattern rather than a
 * project; `insertRowCounter`, `updateRowCounter` and `deleteRowCounter` are
 * the counter itself, and `adjustRowCounter` and `resetRowCounter` are where
 * it has got to.
 *
 * Importing this opens the database and runs migrations.
 */

export { db, runMigrations, sqlite } from '@/data/db';

export {
  authedDelete,
  authedFetch,
  authedPost,
  authedPut,
  createPack,
  createProject,
  createProjectPhoto,
  createStashEntry,
  deletePack,
  deleteProject,
  deleteStashEntry,
  favoritesCreate,
  favoritesDelete,
  generateDownloadLink,
  getNeedleSizes,
  getNeedleTypes,
  getYarnWeights,
  librarySearch,
  MAX_RECORDS_PER_RESOURCE,
  PAGE_SIZE,
  patternShow,
  patternsSearch,
  projectShow,
  RavelryApiError,
  requestUploadToken,
  stashEntryShow,
  updatePack,
  updateProject,
  updateStashEntry,
  uploadImage,
  volumeShow,
  volumesCreate,
  volumesDelete,
  yarnsSearch,
  yarnWeightId,
  type LibrarySearchParams,
  type LibrarySearchResult,
  type PackCreate,
  type PackUpdate,
  type PagedRecords,
  type PatternSearchParams,
  type PatternSearchResult,
  type ProjectCreate,
  type ProjectUpdate,
  type QueryParams,
  type RavelryDownloadLink,
  type RavelryDownloadLocation,
  type RavelryNeedleSize,
  type RavelryNeedleType,
  type RavelryPack,
  type RavelryPaginator,
  type RavelryPatternDetail,
  type RavelryPatternSummary,
  type RavelryPhoto,
  type RavelryProject,
  type RavelryRecord,
  type RavelryStashEntry,
  type RavelryVolume,
  type RavelryVolumeAttachment,
  type RavelryYarnSummary,
  type RavelryYarnWeight,
  type StashCreate,
  type StashPack,
  type StashUpdate,
  type UploadFile,
  type VolumeCreate,
} from '@/data/ravelry';

export {
  finishProject,
  setProjectStatus,
  type FinishOutcome,
  type FinishProblem,
  type StatusOutcome,
} from '@/data/finish';

export {
  addToLibraryAndDownload,
  classifyPatternDownload,
  deletePatternPdf,
  ensurePatternPdf,
  getPatternPdf,
  importPatternPdf,
  patternPdfDirectoryUri,
  probePatternLibrary,
  subscribeToPatternPdfs,
  type ImportOutcome,
  type ImportProblem,
  type LibraryProbe,
  type PatternDownload,
  type PdfOutcome,
  type PdfProblem,
  type PickedPdf,
} from '@/data/pdfs';

export {
  colorFamily,
  COLOR_FAMILIES,
  craftId,
  CRAFT_CROCHET,
  CRAFT_KNITTING,
  CRAFT_LOOM_KNITTING,
  CRAFT_MACHINE_KNITTING,
  NEEDLE_TYPES,
  PROJECT_STATUS_FINISHED,
  PROJECT_STATUS_FROGGED,
  PROJECT_STATUS_HIBERNATING,
  PROJECT_STATUS_IN_PROGRESS,
  PROJECT_STATUSES,
  STASH_STATUS_IN_STASH,
  STASH_STATUSES,
  tintFor,
  YARN_WEIGHTS,
  type ColorFamily,
  type NeedleTypeName,
  type ProjectStatusName,
  type StashStatusName,
  type YarnWeightName,
} from '@/data/reference';

export {
  deleteLocalNeedle,
  insertLocalNeedle,
  updateLocalNeedle,
  type LocalNeedle,
} from '@/data/local';

export {
  deleteCustomPattern,
  getCustomPattern,
  insertCustomPattern,
  updateCustomPattern,
  type CustomPatternDraft,
} from '@/data/custom-patterns';

export {
  adjustRowCounter,
  deleteRowCounter,
  getRowCounter,
  getRowCounters,
  insertRowCounter,
  resetRowCounter,
  subscribeToRowCounters,
  updateRowCounter,
  useRowCounters,
  useRowCountersForProjects,
  type RowCounterDraft,
} from '@/data/row-counters';

export { fillStashPhotos, rememberYarnPhoto } from '@/data/yarn-photos';

export {
  ensurePatternPhoto,
  fillProjectPatternPhotos,
  getPatternPhoto,
} from '@/data/pattern-photos';

export {
  ensureProjectDetail,
  forgetProjectDetail,
  getProjectDetail,
} from '@/data/project-detail';

export {
  forgetYarnColor,
  getYarnColor,
  normalizeHex,
  rememberYarnColor,
} from '@/data/yarn-colors';

export {
  getFavoriteByPatternId,
  getNeedleById,
  getProjectById,
  getProjectIdsByPatternId,
  getStashById,
  useCustomPattern,
  useStashEntry,
  useFavorites,
  useNeedles,
  usePatternPdf,
  usePatternShelf,
  useProject,
  useProjectDetail,
  useProjects,
  useStash,
  useSyncStatus,
  type FavoriteListRow,
  type LiveRows,
  type NeedleListRow,
  type PatternShelfRow,
  type ProjectListRow,
  type StashEntryRow,
  type StashListRow,
} from '@/data/queries';

export {
  customPatterns,
  favorites,
  needles,
  NEEDLE_SOURCES,
  PATTERN_PDF_SOURCES,
  patternPdfs,
  patternPhotos,
  projectDetails,
  projects,
  rowCounters,
  stash,
  syncState,
  yarnColors,
  yarnPhotos,
  type CustomPatternInsert,
  type CustomPatternRow,
  type FavoriteRow,
  type NeedleRow,
  type NeedleSource,
  type PatternPdfRow,
  type PatternPdfSource,
  type PatternPhotoRow,
  type ProjectDetailRow,
  type ProjectRow,
  type RowCounterInsert,
  type RowCounterRow,
  type StashRow,
  type SyncStateRow,
  type YarnColorRow,
  type YarnPhotoRow,
} from '@/data/schema';

export {
  getSyncStatus,
  refreshFavorites,
  refreshProjects,
  refreshStash,
  subscribe as subscribeToSyncStatus,
  syncAll,
  SYNC_RESOURCES,
  type SyncFailure,
  type SyncOutcome,
  type SyncPhase,
  type SyncResource,
  type SyncStatus,
} from '@/data/sync';
