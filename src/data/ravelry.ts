/**
 * The Ravelry API, as thin as it can be: attach the bearer token, add a
 * timeout, turn a bad status into one typed error, hand back parsed JSON.
 * Nothing here knows about SQLite, and nothing here logs — the token would be
 * the easiest thing in the app to leak into a log line.
 *
 * Three shapes of call live here. The account lists (`favoritesList`,
 * `stashList`, `needlesList`, `projectsList`) walk every page up to
 * `MAX_RECORDS_PER_RESOURCE` and report whether they stopped early; they feed
 * the offline cache. `patternsSearch`, `patternShow`, `yarnsSearch`,
 * `librarySearch`, `volumeShow`, `projectShow`, `getNeedleSizes`,
 * `getNeedleTypes` and `getYarnWeights` are single, online-only reads that go
 * straight to the caller asking for them. `createProject`, `createStashEntry`, `updateProject`,
 * `createProjectPhoto`, `requestUploadToken`, `volumesCreate`, `volumesDelete`
 * and `generateDownloadLink` are the writes; all but the last three send a body.
 *
 * `uploadImage` is the one call in this file that carries no token at all —
 * Ravelry's image host authenticates the single-use upload token in the form
 * body instead — and the one that sends something other than JSON. It is built
 * on the same `exchange` as everything else, so a failed upload is the same
 * `RavelryApiError` as a failed read.
 *
 * Response typing is deliberately uneven. Patterns and projects are typed from
 * responses this app has actually seen; favorites, stash and needles are
 * `RavelryRecord` because their exact fields are not documented and read-only
 * credentials get 403 on all three, so `sync.ts` reads them defensively and
 * keeps the whole object in `raw` rather than pretending to know the shape.
 * `getNeedleTypes` is the same admission about a reference table.
 */

import { getValidAccessTokenAsync } from '@/auth/client';

const BASE_URL = 'https://api.ravelry.com';

/** Ravelry's own ceiling; asking for more is silently clamped. */
export const PAGE_SIZE = 100;

/** How much of one resource we are willing to hold locally, for now. */
export const MAX_RECORDS_PER_RESOURCE = 1000;

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Ten seconds is right for a few kilobytes of JSON and wrong for a photograph:
 * a phone camera's picture is a couple of megabytes, and the knitter who just
 * finished a sweater is as likely to be on a train as on wifi.
 */
const UPLOAD_TIMEOUT_MS = 60_000;

/** Guards against a paginator that never says it is finished. */
const MAX_PAGES = Math.ceil(MAX_RECORDS_PER_RESOURCE / PAGE_SIZE) + 1;

export type QueryParams = Record<string, string | number | boolean | undefined>;

/**
 * A request that reached Ravelry and came back wrong, or never reached it at
 * all. `SignedOutError` from `@/auth/client` is *not* wrapped in this — it
 * passes straight through, because it means something entirely different
 * (there is no session) and callers must not treat it as a bad response.
 */
export class RavelryApiError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(status: number, path: string, message: string) {
    super(message);
    this.name = 'RavelryApiError';
    this.status = status;
    this.path = path;
  }

  /** No HTTP status: offline, DNS, TLS, or the 10s timeout fired. */
  get offline(): boolean {
    return this.status === 0;
  }
}

export type RavelryPhoto = {
  square_url?: string;
  small_url?: string;
  small2_url?: string;
  medium_url?: string;
  medium2_url?: string;
  thumbnail_url?: string;
  [key: string]: unknown;
};

export type RavelryPaginator = {
  page?: number;
  page_size?: number;
  page_count?: number;
  last_page?: number;
  results?: number;
  [key: string]: unknown;
};

export type RavelryPatternSummary = {
  id?: number;
  name?: string;
  permalink?: string;
  free?: boolean;
  first_photo?: RavelryPhoto | null;
  pattern_author?: { id?: number; name?: string; [key: string]: unknown } | null;
  designer?: { id?: number; name?: string; [key: string]: unknown } | null;
  personal_attributes?: Record<string, unknown> | null;
  [key: string]: unknown;
};

/**
 * Where a pattern's PDF actually is.
 *
 * `type` is `ravelry` when Ravelry hosts the file — the only case a library
 * volume ever gets an attachment — and `external` when the designer does, in
 * which case `url` is their page and `free` describes the price there rather
 * than on Ravelry. Every field is optional and none is trusted: this arrives
 * from an endpoint that spells things differently by the year, and
 * `classifyPatternDownload` reads it defensively.
 */
export type RavelryDownloadLocation = {
  type?: string | null;
  free?: boolean | null;
  url?: string | null;
  [key: string]: unknown;
};

export type RavelryPatternDetail = RavelryPatternSummary & {
  photos?: RavelryPhoto[];
  notes?: string | null;
  /** Ravelry's own render of `notes`, with reference links already resolved. */
  notes_html?: string | null;
  /** Ravelry has the file itself, so a library volume can be given one. */
  ravelry_download?: boolean | null;
  /** …and this is the same fact said longer, plus where else it might be. */
  download_location?: RavelryDownloadLocation | null;
  yardage?: number | null;
  yardage_max?: number | null;
  yardage_description?: string | null;
  yarn_weight?: { name?: string; [key: string]: unknown } | null;
  pattern_needle_sizes?: Record<string, unknown>[];
  price?: string | null;
  currency?: string | null;
  url?: string | null;
};

export type RavelryProject = {
  id?: number;
  name?: string;
  pattern_id?: number | null;
  pattern_name?: string | null;
  personal_source_name?: string | null;
  status_name?: string | null;
  craft_name?: string | null;
  progress?: number | null;
  updated_at?: string | null;
  created_at?: string | null;
  project_status_changed?: string | null;
  completed?: string | null;
  started?: string | null;
  first_photo?: RavelryPhoto | null;
  [key: string]: unknown;
};

/**
 * One result from `/yarns/search.json`, typed from a response this app has
 * seen. The company is spelled two ways depending on the endpoint, so both are
 * declared and the caller reads whichever arrived.
 */
export type RavelryYarnSummary = {
  id?: number;
  name?: string;
  permalink?: string;
  yarn_company_name?: string | null;
  yarn_company?: { id?: number; name?: string; [key: string]: unknown } | null;
  yarn_weight?: { id?: number; name?: string; [key: string]: unknown } | null;
  first_photo?: RavelryPhoto | null;
  [key: string]: unknown;
};

/** An object whose fields we do not claim to know. See the module comment. */
export type RavelryRecord = Record<string, unknown>;

/** Every page of one resource, and whether the walk stopped at the cap. */
export type PagedRecords<T> = {
  records: T[];
  capped: boolean;
  /** Ravelry's own total, when it reported one. */
  totalAvailable: number | null;
};

function buildQuery(params?: QueryParams): string {
  if (!params) {
    return '';
  }

  const pairs: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }

  return pairs.length > 0 ? `?${pairs.join('&')}` : '';
}

type RequestInit = {
  method?: 'GET' | 'POST' | 'DELETE';
  params?: QueryParams;
  /**
   * Sent as the raw JSON body. Ravelry's write endpoints document a `data`
   * key, but wrapping the object in one makes them accept the request and
   * ignore every field in it, so nothing here ever adds an envelope.
   */
  body?: unknown;
};

/**
 * One exchange with Ravelry: send, time out, turn a bad answer into one typed
 * error, hand back parsed JSON.
 *
 * The `send` callback owns the URL, the method and the body, because the two
 * callers disagree about all three — `request` signs its call with a bearer
 * token and sends JSON, `uploadImage` sends multipart to an endpoint that
 * takes no token. What they share is everything after the request leaves.
 */
async function exchange<T>(
  path: string,
  timeoutMs: number,
  send: (signal: AbortSignal) => Promise<Response>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let answered = false;

  try {
    const response = await send(controller.signal);

    if (!response.ok) {
      // 401 is deliberately not a `SignedOutError`: that error's contract is
      // that the stored session has already been cleared, and only the auth
      // client can do that. A caller that sees 401 should re-check auth.
      throw new RavelryApiError(response.status, path, `Ravelry answered ${response.status}.`);
    }

    // The timeout covers reading the body too, not just the headers.
    answered = true;
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof RavelryApiError) {
      throw error;
    }

    // Nothing usable came back, so there is no status to report either way.
    const reason = controller.signal.aborted
      ? `Ravelry did not answer within ${timeoutMs / 1000}s.`
      : answered
        ? 'Ravelry sent an answer this app could not read.'
        : 'Could not reach Ravelry.';

    throw new RavelryApiError(0, path, reason);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * A request to Ravelry with a live bearer token.
 *
 * Throws `SignedOutError` (from `@/auth/client`, unwrapped) when there is no
 * usable session, and `RavelryApiError` for everything else. The token only
 * ever appears in the request header — never in the URL, an error message, or
 * anywhere it could be logged.
 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { method = 'GET', params, body } = init;
  const token = await getValidAccessTokenAsync();

  return exchange<T>(path, REQUEST_TIMEOUT_MS, (signal) =>
    fetch(`${BASE_URL}${path}${buildQuery(params)}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    }),
  );
}

/** A GET against Ravelry with a live bearer token. */
export function authedFetch<T>(path: string, params?: QueryParams): Promise<T> {
  return request<T>(path, { params });
}

/**
 * A POST whose body is `payload` as raw JSON. See `RequestInit.body`.
 *
 * The payload is optional because two of Ravelry's write endpoints take no
 * parameters at all — everything they need is in the path — and a POST with no
 * body is a smaller lie than one carrying `{}`.
 */
export function authedPost<T>(path: string, payload?: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: payload });
}

/** A DELETE against Ravelry. The deleted record comes back in the body. */
export function authedDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' });
}

function readList<T>(body: unknown, key: string): T[] {
  if (typeof body !== 'object' || body === null) {
    return [];
  }

  const record = body as Record<string, unknown>;
  const named = record[key];
  if (Array.isArray(named)) {
    return named as T[];
  }

  // The undocumented endpoints may not key their list the way we guessed; one
  // array in the envelope is unambiguous enough to use.
  const arrays = Object.values(record).filter(Array.isArray);
  return arrays.length === 1 ? (arrays[0] as T[]) : [];
}

function readPaginator(body: unknown): RavelryPaginator | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const paginator = (body as Record<string, unknown>).paginator;
  return typeof paginator === 'object' && paginator !== null
    ? (paginator as RavelryPaginator)
    : null;
}

function readCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Walks pages until Ravelry runs out or we hit `MAX_RECORDS_PER_RESOURCE`,
 * whichever comes first. Pages are fetched one at a time on purpose: Ravelry
 * rate-limits, and a background sync has no reason to be in a hurry.
 */
async function fetchAllPages<T>(
  path: string,
  listKey: string,
  params: QueryParams = {},
): Promise<PagedRecords<T>> {
  const records: T[] = [];
  let capped = false;
  let totalAvailable: number | null = null;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const body = await authedFetch<unknown>(path, { ...params, page, page_size: PAGE_SIZE });
    const pageRecords = readList<T>(body, listKey);
    const paginator = readPaginator(body);

    totalAvailable = readCount(paginator?.results) ?? totalAvailable;
    records.push(...pageRecords);

    const lastPage = readCount(paginator?.last_page) ?? readCount(paginator?.page_count) ?? page;
    const moreToCome = page < lastPage && pageRecords.length > 0;

    if (records.length >= MAX_RECORDS_PER_RESOURCE) {
      capped = records.length > MAX_RECORDS_PER_RESOURCE || moreToCome;
      records.length = MAX_RECORDS_PER_RESOURCE;
      break;
    }

    if (!moreToCome) {
      break;
    }
  }

  return { records, capped, totalAvailable };
}

function person(username: string): string {
  return encodeURIComponent(username);
}

/** Pattern bookmarks. The favorited pattern is nested under `favorited`. */
export function favoritesList(username: string): Promise<PagedRecords<RavelryRecord>> {
  return fetchAllPages<RavelryRecord>(`/people/${person(username)}/favorites/list.json`, 'favorites', {
    types: 'pattern',
  });
}

export function stashList(username: string): Promise<PagedRecords<RavelryRecord>> {
  return fetchAllPages<RavelryRecord>(`/people/${person(username)}/stash/list.json`, 'stash');
}

export function needlesList(username: string): Promise<PagedRecords<RavelryRecord>> {
  return fetchAllPages<RavelryRecord>(`/people/${person(username)}/needles/list.json`, 'needles');
}

export function projectsList(username: string): Promise<PagedRecords<RavelryProject>> {
  return fetchAllPages<RavelryProject>(`/projects/${person(username)}/list.json`, 'projects');
}

/**
 * One project as Ravelry has it, rather than as the mirror does.
 *
 * The list endpoint above is a summary. Verified against the live account on
 * 2026-08-19: this is where `packs`, `needle_sizes`, `notes`, `private_notes`,
 * `photos` and `tools` are, and none of them appear on `list.json` at all — so
 * the yarn a project ate and the needles it tied up cost one request per
 * project, and `project-detail.ts` is what keeps the answer.
 */
export async function projectShow(
  username: string,
  projectId: number,
): Promise<RavelryProject> {
  const path = `/projects/${person(username)}/${projectId}.json`;
  const body = await authedFetch<{ project?: RavelryProject }>(path);
  const project = body?.project;

  if (!project) {
    throw new RavelryApiError(0, path, 'Ravelry returned no project.');
  }

  return project;
}

export type PatternSearchParams = {
  query?: string;
  page?: number;
  pageSize?: number;
  /**
   * Any of Ravelry's on-site filter params — `craft`, `weight`, `pa`,
   * `yardage`, `availability`, `sort`, … — passed through untouched. Keeping
   * this open means a new filter is a screen change, not a client change.
   */
  filters?: Record<string, string>;
  /**
   * Adds `personal_attributes=1`, which is how a result knows it is already
   * favorited or in the signed-in user's library. Ravelry answers 500 to this
   * when the request is not on behalf of a person, so it is switchable.
   */
  personalAttributes?: boolean;
};

export type PatternSearchResult = {
  patterns: RavelryPatternSummary[];
  paginator: RavelryPaginator | null;
};

/** One page of search results. Online only — nothing caches these. */
export async function patternsSearch(
  params: PatternSearchParams = {},
): Promise<PatternSearchResult> {
  const { query, page = 1, pageSize = 20, filters, personalAttributes = true } = params;

  const body = await authedFetch<unknown>('/patterns/search.json', {
    ...filters,
    query,
    page,
    page_size: Math.min(pageSize, PAGE_SIZE),
    personal_attributes: personalAttributes ? 1 : undefined,
  });

  return {
    patterns: readList<RavelryPatternSummary>(body, 'patterns'),
    paginator: readPaginator(body),
  };
}

/** Full pattern detail. Online only. */
export async function patternShow(id: number): Promise<RavelryPatternDetail> {
  const body = await authedFetch<{ pattern?: RavelryPatternDetail }>(`/patterns/${id}.json`);
  const pattern = body?.pattern;

  if (!pattern) {
    throw new RavelryApiError(0, `/patterns/${id}.json`, 'Ravelry returned no pattern.');
  }

  return pattern;
}

/**
 * Eight is what the add-yarn area shows: enough that the yarn in hand is
 * almost always on the list, few enough that the list is read rather than
 * scrolled. Ravelry's own ceiling still applies above it.
 */
const YARN_SEARCH_PAGE_SIZE = 8;

/**
 * The yarn database, searched by name. Online only — nothing caches these, and
 * unlike the account lists this is one page and no paginator: the answer is
 * either on the first eight rows or the query needs rewording.
 */
export async function yarnsSearch(
  query: string,
  pageSize: number = YARN_SEARCH_PAGE_SIZE,
): Promise<RavelryYarnSummary[]> {
  const body = await authedFetch<unknown>('/yarns/search.json', {
    query,
    page_size: Math.min(pageSize, PAGE_SIZE),
  });

  return readList<RavelryYarnSummary>(body, 'yarns');
}

/**
 * One yarn out of the database, whole.
 *
 * Fetched for one field. `/yarns/search.json` puts a `first_photo` on every
 * result, and `stash/list.json` puts a photograph on none — so the picture a
 * stash row is drawn with has to be asked for here, by the yarn's id, one yarn
 * at a time. `photos` is the array it arrives in; this endpoint leaves
 * `first_photo` null even when there are two.
 */
export async function yarnShow(id: number): Promise<RavelryRecord> {
  const body = await authedFetch<{ yarn?: RavelryRecord }>(`/yarns/${id}.json`);
  const yarn = body?.yarn;

  if (!yarn) {
    throw new RavelryApiError(0, `/yarns/${id}.json`, 'Ravelry returned no yarn.');
  }

  return yarn;
}

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

/**
 * One row of Ravelry's needle size table. `metric` is the millimetre size a
 * knitter would say out loud, and `id` is the only thing a write accepts.
 */
export type RavelryNeedleSize = {
  id: number;
  metric?: number | null;
  us?: string | null;
  hook?: boolean | null;
  [key: string]: unknown;
};

const NEEDLE_SIZES_PATH = '/needles/sizes.json';

/**
 * The 54 rows are the same 54 rows every time, so the first caller pays for
 * them and everybody after shares the promise — including the callers that
 * arrive while it is still in flight. A failed lookup is dropped rather than
 * remembered: being offline once should not mean no needles for the rest of
 * the session.
 */
let needleSizes: Promise<RavelryNeedleSize[]> | null = null;

export function getNeedleSizes(): Promise<RavelryNeedleSize[]> {
  if (needleSizes === null) {
    const pending = authedFetch<unknown>(NEEDLE_SIZES_PATH).then((body) =>
      readList<RavelryNeedleSize>(body, 'needle_sizes'),
    );

    needleSizes = pending;
    void pending.catch(() => {
      if (needleSizes === pending) {
        needleSizes = null;
      }
    });
  }

  return needleSizes;
}

/**
 * One row of Ravelry's needle type table.
 *
 * Typed loosely on purpose: this is the one reference endpoint nothing here
 * has watched answer. The documentation names a `needle_type` record and says
 * nothing about its fields, and the list may well be keyed by that singular
 * name — so every field is optional, and the caller is expected to read what
 * arrives rather than trust this shape. Nothing depends on the ids; a needle
 * added on the device records the *name*, because that is what the drawer
 * shows and what Ravelry's own needle rows carry.
 */
export type RavelryNeedleType = {
  id?: number;
  name?: string | null;
  permalink?: string | null;
  [key: string]: unknown;
};

const NEEDLE_TYPES_PATH = '/needles/types.json';

/** Memoized for the session, and dropped on failure — see `getNeedleSizes`. */
let needleTypes: Promise<RavelryNeedleType[]> | null = null;

export function getNeedleTypes(): Promise<RavelryNeedleType[]> {
  if (needleTypes === null) {
    const pending = authedFetch<unknown>(NEEDLE_TYPES_PATH).then((body) => {
      // `readList` already falls back to the one array in the envelope when
      // the key we guessed is not there, which covers the documented singular
      // spelling; asking for it by name too costs nothing and says out loud
      // that both are expected.
      const listed = readList<RavelryNeedleType>(body, 'needle_types');
      return listed.length > 0 ? listed : readList<RavelryNeedleType>(body, 'needle_type');
    });

    needleTypes = pending;
    void pending.catch(() => {
      if (needleTypes === pending) {
        needleTypes = null;
      }
    });
  }

  return needleTypes;
}

/**
 * One row of Ravelry's yarn weight table. The twelve names are written down in
 * `@/data/reference` because a screen has to draw them offline; the ids are
 * not guessable, so they are asked for here.
 */
export type RavelryYarnWeight = {
  id: number;
  name?: string | null;
  permalink?: string | null;
  [key: string]: unknown;
};

const YARN_WEIGHTS_PATH = '/yarn_weights.json';

/** Memoized for the session, and dropped on failure — see `getNeedleSizes`. */
let yarnWeights: Promise<RavelryYarnWeight[]> | null = null;

export function getYarnWeights(): Promise<RavelryYarnWeight[]> {
  if (yarnWeights === null) {
    const pending = authedFetch<unknown>(YARN_WEIGHTS_PATH).then((body) =>
      readList<RavelryYarnWeight>(body, 'yarn_weights'),
    );

    yarnWeights = pending;
    void pending.catch(() => {
      if (yarnWeights === pending) {
        yarnWeights = null;
      }
    });
  }

  return yarnWeights;
}

/** "Light Fingering" and "light_fingering" both become `light-fingering`. */
function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_/]+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * The id Ravelry files a yarn weight under, from its own table.
 *
 * Matched on the permalink where the record carries one and on the slugified
 * name where it does not, because the weight names are a closed set (see
 * `YARN_WEIGHTS`) and their spelling is the only thing both sides share. An
 * unmatched weight is null rather than a guess: a wrong weight id would be
 * written to the knitter's stash.
 */
export async function yarnWeightId(permalink: string): Promise<number | null> {
  const wanted = slug(permalink);
  const weights = await getYarnWeights();

  for (const weight of weights) {
    const candidates = [weight.permalink, weight.name].filter(
      (value): value is string => typeof value === 'string' && value.trim() !== '',
    );

    if (candidates.some((candidate) => slug(candidate) === wanted)) {
      return weight.id;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * A new project, in the shape Ravelry's `Project (POST)` actually accepts.
 *
 * Every field here was verified against the live API rather than read off the
 * documentation, because two of them differ from it: `needle_sizes` is a bare
 * array of size ids (not objects), and the whole payload is the request body
 * rather than a `data` key.
 */
export type ProjectCreate = {
  name: string;
  pattern_id?: number;
  /** See `@/data/reference`. */
  craft_id?: number;
  /** See `@/data/reference`. */
  project_status_id?: number;
  /** `YYYY-MM-DD`. */
  started?: string;
  /** Size ids from `getNeedleSizes`. Ravelry replaces the project's needles with these. */
  needle_sizes?: number[];
  /**
   * Yarn allocations. A pack that names a `stash_id` inherits the yarn, the
   * colourway and the rest from that stash entry. Ravelry only accepts packs
   * at creation; changing them afterwards is the separate pack API.
   */
  packs?: { stash_id: number }[];
};

/** Creates a project on the signed-in knitter's account and returns it. */
export async function createProject(
  username: string,
  project: ProjectCreate,
): Promise<RavelryProject> {
  const path = `/projects/${person(username)}/create.json`;
  const body = await authedPost<{ project?: RavelryProject }>(path, project);
  const created = body?.project;

  if (!created) {
    throw new RavelryApiError(0, path, 'Ravelry returned no project.');
  }

  return created;
}

/**
 * The fields an existing project will accept.
 *
 * `packs` is deliberately not among them: Ravelry only takes yarn allocations
 * at creation, and changing them afterwards is the separate pack API.
 * `completed` is the date a project came off the needles, and is the other
 * half of setting `project_status_id` to Finished — a finished project with no
 * completion date is a project Ravelry cannot sort.
 */
export type ProjectUpdate = Partial<Omit<ProjectCreate, 'packs'>> & {
  /** `YYYY-MM-DD`. */
  completed?: string;
};

/** Changes one project on the signed-in knitter's account and returns it. */
export async function updateProject(
  username: string,
  projectId: number,
  data: ProjectUpdate,
): Promise<RavelryProject> {
  const path = `/projects/${person(username)}/${projectId}.json`;
  const body = await authedPost<{ project?: RavelryProject }>(path, data);
  const updated = body?.project;

  if (!updated) {
    throw new RavelryApiError(0, path, 'Ravelry returned no project.');
  }

  return updated;
}

/**
 * The yarn half of a stash entry.
 *
 * A `yarn_id` names a yarn in Ravelry's database and the entry inherits its
 * name, company and weight from it; the `personal_*` fields are the same facts
 * typed by hand, for a yarn the database has never heard of. `colorway`
 * belongs to the entry either way — the database knows the yarn, not which
 * skein of it is in the bag.
 */
export type StashPack = {
  colorway?: string;
  /** What to call a yarn with no `yarn_id`. */
  personal_name?: string;
  /** From `yarnWeightId`. Only meaningful alongside `personal_name`. */
  personal_yarn_weight_id?: number;
  /** Ravelry's own colour families — see `COLOR_FAMILIES` in `@/data/reference`. */
  color_family_id?: number | null;
};

/**
 * A new stash entry, in the shape `Stash (POST)` accepts — raw JSON body, same
 * as `createProject`, with the pack nested rather than listed.
 */
export type StashCreate = {
  /** A database yarn, from `yarnsSearch`. Omit for a free-form entry. */
  yarn_id?: number;
  /** See `@/data/reference`. */
  stash_status_id?: number;
  pack?: StashPack;
};

/** What `stash/create.json` hands back. `id` is what a pack can then draw on. */
export type RavelryStashEntry = {
  id?: number;
  [key: string]: unknown;
};

/** Adds one entry to the signed-in knitter's stash and returns it. */
export async function createStashEntry(
  username: string,
  entry: StashCreate,
): Promise<RavelryStashEntry> {
  const path = `/people/${person(username)}/stash/create.json`;
  const body = await authedPost<{ stash?: RavelryStashEntry }>(path, entry);
  const created = body?.stash;

  if (!created) {
    throw new RavelryApiError(0, path, 'Ravelry returned no stash entry.');
  }

  return created;
}

/**
 * The fields an edit can change. Every one is optional and only what the
 * knitter actually touched is sent — see `updateStashEntry`.
 */
export type StashUpdate = {
  stash_status_id?: number;
  location?: string;
  dye_lot?: string;
  notes?: string;
  pack?: StashPack;
};

/**
 * Rewrites one stash entry and hands back what Ravelry then has.
 *
 * `POST /people/{username}/stash/{id}.json`, which is the same shape as
 * `updateProject` and not what the endpoint list would suggest. Verified on a
 * live entry (created, updated, read back, deleted) on 2026-08-19:
 *
 * - The **raw JSON body** applies, as everywhere else in this file.
 * - `notes`, `location` and `dye_lot` sit at the top level; `colorway` and
 *   `color_family_id` go in the nested `pack`, and read back on `packs[0]`.
 * - **`POST .../stash/{id}/update.json` answers 200 and ignores every field.**
 *   It is the obvious guess, it looks like it worked, and it does nothing —
 *   the same trap as wrapping a body in `{"data": …}`.
 *
 * A partial object is the point rather than a convenience: the stash *list* has
 * no `notes` field, so an edit sheet opened offline has never seen the notes it
 * would otherwise post back empty.
 */
export async function updateStashEntry(
  username: string,
  id: number,
  changes: StashUpdate,
): Promise<RavelryStashEntry> {
  const path = `/people/${person(username)}/stash/${id}.json`;
  const body = await authedPost<{ stash?: RavelryStashEntry }>(path, changes);
  const updated = body?.stash;

  if (!updated) {
    throw new RavelryApiError(0, path, 'Ravelry returned no stash entry.');
  }

  return updated;
}

/**
 * One stash entry as Ravelry has it, rather than as the mirror does.
 *
 * For the edit sheet, and for one field: `stash/list.json` carries no `notes`,
 * so the only way to fill that box with what is already written there is to ask
 * for the entry on its own.
 */
export async function stashEntryShow(
  username: string,
  id: number,
): Promise<RavelryStashEntry> {
  const path = `/people/${person(username)}/stash/${id}.json`;
  const body = await authedFetch<{ stash?: RavelryStashEntry }>(path);
  const entry = body?.stash;

  if (!entry) {
    throw new RavelryApiError(0, path, 'Ravelry returned no stash entry.');
  }

  return entry;
}

// ---------------------------------------------------------------------------
// Photographs
// ---------------------------------------------------------------------------

/**
 * A picture on the device, in the shape React Native's `FormData` sends files.
 *
 * `uri` is a `file://` path — from the camera, or from the picker's copy of a
 * library asset — and the other two are what the multipart part is labelled
 * with. Ravelry takes PNG, JPEG and HEIF/HEIC, and caps the whole POST at 50MB.
 */
export type UploadFile = {
  readonly uri: string;
  readonly name: string;
  readonly type: string;
};

/**
 * A single-use token for one image upload.
 *
 * It is a credential, so it is treated like one: handed straight to
 * `uploadImage` and never logged, stored or put in a URL.
 */
export async function requestUploadToken(): Promise<string> {
  const path = '/upload/request_token.json';
  const body = await authedPost<{ upload_token?: unknown }>(path);
  const token = typeof body?.upload_token === 'string' ? body.upload_token.trim() : '';

  if (token === '') {
    throw new RavelryApiError(0, path, 'Ravelry returned no upload token.');
  }

  return token;
}

/**
 * The id out of `{uploads: [{file0: {image_id}}]}`.
 *
 * Read by walking rather than by path: the envelope keys each result by the
 * form field it came from, this app only ever sends one, and a response that
 * spelled the field differently would otherwise cost a photograph. An upload
 * that failed comes back in the same shape with an error where the id should
 * be, which reads as null here and is reported as a failure by the caller.
 */
function readImageId(body: unknown): number | null {
  const uploads = (body as { uploads?: unknown } | null)?.uploads;
  const entries = Array.isArray(uploads) ? uploads : [uploads];

  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }

    for (const result of Object.values(entry as Record<string, unknown>)) {
      const id = (result as { image_id?: unknown } | null)?.image_id;
      if (typeof id === 'number' && Number.isInteger(id) && id > 0) {
        return id;
      }
    }
  }

  return null;
}

/**
 * Sends one picture to Ravelry's image host and returns its `image_id`.
 *
 * The odd one out, in two ways. It carries **no** Authorization header —
 * Ravelry authenticates this endpoint with the single-use `upload_token` in the
 * form body, and adding a bearer token would be sending a credential somewhere
 * it was not asked for. And its body is `FormData`, so no `content-type` is set
 * here: only `fetch` knows the multipart boundary it generated, and naming the
 * type by hand is the classic way to send a body no server can parse.
 *
 * The file part is cast on the way in. React Native's `FormData` accepts a
 * `{uri, name, type}` object and streams the file behind it, but the ambient
 * `FormData` in a typechecked Expo app is the DOM one (`lib: ["DOM"]`), whose
 * `append` only knows `string | Blob`. The cast is the whole gap between the
 * two, and it is exactly one line wide.
 */
export async function uploadImage(uploadToken: string, file: UploadFile): Promise<number> {
  const path = '/upload/image.json';

  const form = new FormData();
  form.append('upload_token', uploadToken);
  form.append('file0', file as unknown as Blob);

  const body = await exchange<unknown>(path, UPLOAD_TIMEOUT_MS, (signal) =>
    fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { accept: 'application/json' },
      body: form,
      signal,
    }),
  );

  const imageId = readImageId(body);

  if (imageId === null) {
    throw new RavelryApiError(0, path, 'Ravelry returned no image id.');
  }

  return imageId;
}

/**
 * Attaches an uploaded image to a project.
 *
 * The `status_token` comes back for polling `/photos/status.json` while Ravelry
 * makes its thumbnails, which nothing here does — the picture is theirs now,
 * and the project screen draws whatever the next sync brings. So a response
 * without one is not an error: it would be a poll this app was never going to
 * make, and reporting it as a failure would tell a knitter their photograph
 * did not arrive when it did.
 */
export async function createProjectPhoto(
  username: string,
  projectId: number,
  imageId: number,
): Promise<string | null> {
  const path = `/projects/${person(username)}/${projectId}/create_photo.json`;
  const body = await authedPost<{ status_token?: unknown }>(path, { image_id: imageId });
  const token = typeof body?.status_token === 'string' ? body.status_token.trim() : '';

  return token === '' ? null : token;
}

// ---------------------------------------------------------------------------
// The library, and the PDFs in it
// ---------------------------------------------------------------------------

/**
 * One file attached to a volume — in practice always a PDF, since Ravelry
 * documents `content_type` as only ever `application/pdf`.
 *
 * `product_attachment_id` is the only field that can be turned into a
 * download: it is what `generateDownloadLink` takes. `ravelry_download_url` is
 * on the record too and is deliberately not typed here — it is a browser
 * session URL, useless to a bearer token, and typing it would invite a call.
 */
export type RavelryVolumeAttachment = {
  product_attachment_id?: number;
  filename?: string | null;
  bytes?: number | null;
  content_type?: string | null;
  language_code?: string | null;
  thumbnail_url?: string | null;
  [key: string]: unknown;
};

/**
 * One thing in a knitter's library: a book, a magazine, or — the case this app
 * cares about — a single pattern they own.
 *
 * `pattern_id` is what links a volume back to a pattern screen, and it is only
 * set on single-pattern volumes; a book carries `pattern_source_id` instead.
 * `volume_attachments` arrives empty on a volume Ravelry is still preparing,
 * which is why `pdfs.ts` polls rather than trusting the first answer.
 */
export type RavelryVolume = {
  id?: number;
  pattern_id?: number | null;
  pattern_source_id?: number | null;
  title?: string | null;
  author_name?: string | null;
  has_downloads?: boolean | null;
  volume_attachments?: RavelryVolumeAttachment[] | null;
  [key: string]: unknown;
};

/**
 * A signed, expiring URL for one attachment.
 *
 * `url` is stated as required because `generateDownloadLink` refuses to hand
 * back a link without one — there is nothing a caller could do with the rest.
 */
export type RavelryDownloadLink = {
  url: string;
  activated_at?: string | null;
  expires_at?: string | null;
  [key: string]: unknown;
};

export type LibrarySearchParams = {
  /** Matches title and author. Omit to walk the whole library. */
  query?: string;
  /** `book` | `magazine` | `booklet` | `pattern` | `pdf`. */
  type?: string;
  /** `title` | `added` | `published` | `author`. */
  sort?: string;
  page?: number;
  pageSize?: number;
};

export type LibrarySearchResult = {
  volumes: RavelryVolume[];
  paginator: RavelryPaginator | null;
};

/**
 * One page of the knitter's own library.
 *
 * Their own is the only one worth asking about: Ravelry only includes the PDF
 * volumes — the ones with something to download — when the search is over the
 * account making the request.
 */
export async function librarySearch(
  username: string,
  params: LibrarySearchParams = {},
): Promise<LibrarySearchResult> {
  const { query, type, sort, page = 1, pageSize = PAGE_SIZE } = params;

  const body = await authedFetch<unknown>(`/people/${person(username)}/library/search.json`, {
    query,
    type,
    sort,
    page,
    page_size: Math.min(pageSize, PAGE_SIZE),
  });

  return {
    volumes: readList<RavelryVolume>(body, 'volumes'),
    paginator: readPaginator(body),
  };
}

/** One volume, whole — including the attachments a search may not carry. */
export async function volumeShow(id: number): Promise<RavelryVolume> {
  const path = `/volumes/${id}.json`;
  const body = await authedFetch<{ volume?: RavelryVolume }>(path);
  const volume = body?.volume;

  if (!volume) {
    throw new RavelryApiError(0, path, 'Ravelry returned no volume.');
  }

  return volume;
}

/**
 * A new library entry. One of the two ids is required, and this app only ever
 * sends the first: it is adding a pattern the knitter is looking at.
 */
export type VolumeCreate = {
  pattern_id?: number;
  pattern_source_id?: number;
};

/**
 * Adds one thing to the knitter's library and returns it.
 *
 * A free Ravelry-download pattern gets its PDF attached automatically, which
 * is the whole mechanism behind "Add to library & download" — but the
 * attaching happens after this answers, so the volume that comes back usually
 * has no attachments yet. Raw JSON body, like every other write here.
 *
 * The library means things the knitter owns. Nothing in this app calls this
 * for a pattern that is not free.
 */
export async function volumesCreate(volume: VolumeCreate): Promise<RavelryVolume> {
  const path = '/volumes/create.json';
  const body = await authedPost<{ volume?: RavelryVolume }>(path, volume);
  const created = body?.volume;

  if (!created) {
    throw new RavelryApiError(0, path, 'Ravelry returned no volume.');
  }

  return created;
}

/** Removes one thing from the knitter's library. */
export async function volumesDelete(id: number): Promise<void> {
  await authedDelete<unknown>(`/volumes/${id}.json`);
}

/**
 * A direct, expiring URL for one attachment's PDF.
 *
 * Needs the `library-pdf` OAuth scope, which the app's tokens ask for at sign
 * in. A personal API key does not carry it and is refused with a 403, so this
 * is one of the calls that only works as a signed-in person.
 */
export async function generateDownloadLink(
  productAttachmentId: number,
): Promise<RavelryDownloadLink> {
  const path = `/product_attachments/${productAttachmentId}/generate_download_link.json`;
  const body = await authedPost<{ download_link?: Partial<RavelryDownloadLink> }>(path);
  const link = body?.download_link;

  if (!link || typeof link.url !== 'string' || link.url.trim() === '') {
    throw new RavelryApiError(0, path, 'Ravelry returned no download link.');
  }

  return { ...link, url: link.url };
}
