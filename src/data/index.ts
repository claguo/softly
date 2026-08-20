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
 * `createStashEntry` and `favoritesCreate` write to Ravelry, and
 * `refreshProjects`/`refreshStash`/`refreshFavorites` are how the mirror
 * catches up afterwards — one table each, for the caller that already knows
 * which one it changed; `insertLocalNeedle` writes to the
 * mirror itself, because the needle drawer is the one thing Ravelry will not
 * be told about. `finishProject` is the other end of the same story — the
 * photograph, the status and the refresh in one call that reports rather than
 * throws. `ensureProjectDetail` fetches the half of a project `list.json`
 * leaves out — the yarn it ate, the needles it tied up, the notes on it — and
 * keeps it on the device. `db` and the tables are here for anything that needs
 * a query this module has not thought of yet.
 *
 * Offline patterns are their own small chain: `usePatternPdf` for what is
 * already on the device, `classifyPatternDownload` for whether Ravelry has the
 * file at all, `probePatternLibrary` for whether one could be,
 * `ensurePatternPdf` and `addToLibraryAndDownload` for getting it there,
 * `importPatternPdf` for the far more common pattern whose PDF was never
 * Ravelry's to send, and `deletePatternPdf` for taking it away again.
 *
 * Importing this opens the database and runs migrations.
 */

export { db, runMigrations, sqlite } from '@/data/db';

export {
  authedDelete,
  authedFetch,
  authedPost,
  createProject,
  createProjectPhoto,
  createStashEntry,
  favoritesCreate,
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
  type FinishOutcome,
  type FinishProblem,
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
  STASH_STATUS_IN_STASH,
  STASH_STATUSES,
  tintFor,
  YARN_WEIGHTS,
  type ColorFamily,
  type NeedleTypeName,
  type StashStatusName,
  type YarnWeightName,
} from '@/data/reference';

export {
  insertLocalNeedle,
  updateLocalNeedle,
  type LocalNeedle,
} from '@/data/local';

export { fillStashPhotos, rememberYarnPhoto } from '@/data/yarn-photos';

export {
  ensurePatternPhoto,
  fillProjectPatternPhotos,
  getPatternPhoto,
} from '@/data/pattern-photos';

export { ensureProjectDetail, getProjectDetail } from '@/data/project-detail';

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
  getStashById,
  useStashEntry,
  useFavorites,
  useNeedles,
  usePatternPdf,
  useProject,
  useProjectDetail,
  useProjects,
  useStash,
  useSyncStatus,
  type FavoriteListRow,
  type LiveRows,
  type NeedleListRow,
  type ProjectListRow,
  type StashEntryRow,
  type StashListRow,
} from '@/data/queries';

export {
  favorites,
  needles,
  NEEDLE_SOURCES,
  PATTERN_PDF_SOURCES,
  patternPdfs,
  patternPhotos,
  projectDetails,
  projects,
  stash,
  syncState,
  yarnColors,
  yarnPhotos,
  type FavoriteRow,
  type NeedleRow,
  type NeedleSource,
  type PatternPdfRow,
  type PatternPdfSource,
  type PatternPhotoRow,
  type ProjectDetailRow,
  type ProjectRow,
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
