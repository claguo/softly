/**
 * Paged pattern search for the Discover grid.
 *
 * The screen hands over a plain filter record and gets back one growing,
 * de-duplicated list. Three things make that safe to drive from chips a person
 * can tap faster than the network answers:
 *
 * - **Debounce.** A filter change waits 300ms before it becomes a request, so
 *   toggling three chips is one search, not three.
 * - **Staleness.** `patternsSearch` owns its own `AbortController` (it needs it
 *   for the 10s timeout), so there is no signal to thread through. The guard is
 *   the effect's own cleanup instead: React tears down the previous effect
 *   before running the next, so a superseded request resolves into a `cancelled`
 *   closure and is dropped rather than merged. Results cannot interleave.
 * - **Identity, not deep equality.** The filter record is rebuilt on every
 *   render, so it is encoded to a sorted string and *that* is the dependency.
 *   The request decodes it back — a round trip through a string is cheaper than
 *   asking every caller to memoise.
 *
 * There is deliberately no `loading` in state. The request the caller wants and
 * the request the state answers are both here, so "in flight" is the difference
 * between them — which keeps every `setState` inside a callback rather than an
 * effect body, and means a flag can never be left switched on by a code path
 * that forgot to switch it off.
 *
 * Errors are split the way the data layer splits them: `SignedOutError` means
 * there is no session and the screen should say so; everything else is one
 * quiet "unavailable" flag that leaves already-loaded results on screen.
 */

import { useEffect, useState } from 'react';

import { SignedOutError } from '@/auth/client';
import { patternsSearch, type RavelryPaginator, type RavelryPatternSummary } from '@/data';

/** Ten rows of a two-column grid: enough to scroll, small enough to feel fast. */
const PAGE_SIZE = 20;

const DEBOUNCE_MS = 300;

type Request = { readonly page: number; readonly key: string };

type SearchState = {
  /** The request this state answers — by identity, success or failure. */
  readonly settled: Request | null;
  readonly key: string | null;
  readonly patterns: readonly RavelryPatternSummary[];
  readonly total: number | null;
  readonly lastPage: number | null;
  readonly page: number;
  /** The most recent page came back with nothing left to give. */
  readonly drained: boolean;
  readonly unavailable: boolean;
  readonly signedOut: boolean;
};

const IDLE: SearchState = {
  settled: null,
  key: null,
  patterns: [],
  total: null,
  lastPage: null,
  page: 0,
  drained: false,
  unavailable: false,
  signedOut: false,
};

export type PatternSearch = {
  readonly patterns: readonly RavelryPatternSummary[];
  /** Ravelry's own total for the current filters, once a page has landed. */
  readonly total: number | null;
  readonly loading: boolean;
  /** A request failed for a reason that is not "signed out". */
  readonly unavailable: boolean;
  readonly signedOut: boolean;
  readonly loadMore: () => void;
};

function encodeFilters(filters: Record<string, string>): string {
  return Object.entries(filters)
    .filter(([, value]) => value !== '')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

function decodeFilters(key: string): Record<string, string> {
  const filters: Record<string, string> = {};
  if (key === '') {
    return filters;
  }

  for (const pair of key.split('&')) {
    const split = pair.indexOf('=');
    if (split > 0) {
      filters[decodeURIComponent(pair.slice(0, split))] = decodeURIComponent(pair.slice(split + 1));
    }
  }

  return filters;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Page 1 replaces, later pages append. Ids repeat across pages whenever the
 * live index shifts under a paginator, so the set is the source of truth for
 * what is already on screen; a result with no id is dropped rather than keyed
 * on something that would collide.
 */
function merge(
  previous: SearchState,
  request: Request,
  incoming: readonly RavelryPatternSummary[],
  paginator: RavelryPaginator | null,
): SearchState {
  const base = request.page === 1 ? [] : previous.patterns;
  const seen = new Set(base.map((pattern) => pattern.id));
  const patterns = [...base];

  for (const pattern of incoming) {
    if (typeof pattern.id === 'number' && !seen.has(pattern.id)) {
      seen.add(pattern.id);
      patterns.push(pattern);
    }
  }

  const total = readNumber(paginator?.results);
  const lastPage = readNumber(paginator?.last_page) ?? readNumber(paginator?.page_count);

  return {
    settled: request,
    key: request.key,
    patterns,
    total: total ?? (request.page === 1 ? null : previous.total),
    lastPage,
    page: request.page,
    drained: incoming.length === 0,
    unavailable: false,
    signedOut: false,
  };
}

export function usePatternSearch(filters: Record<string, string>, enabled: boolean): PatternSearch {
  const key = encodeFilters(filters);

  const [request, setRequest] = useState<Request | null>(null);
  const [state, setState] = useState<SearchState>(IDLE);

  // Filters settle, then become a request. The cleanup means a burst of chip
  // taps only ever leaves the last one standing.
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const timer = setTimeout(() => setRequest({ page: 1, key }), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key, enabled]);

  useEffect(() => {
    if (request === null) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const { patterns, paginator } = await patternsSearch({
          page: request.page,
          pageSize: PAGE_SIZE,
          filters: decodeFilters(request.key),
          // On device this is a person's token, which is the only kind of
          // request Ravelry will attach personal attributes to.
          personalAttributes: true,
        });

        if (!cancelled) {
          setState((previous) => merge(previous, request, patterns, paginator));
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof SignedOutError) {
          setState((previous) => ({ ...previous, settled: request, signedOut: true }));
          return;
        }
        // A `RavelryApiError` — offline, timed out, or a bad status. Either way
        // the reader gets one quiet line and keeps whatever already loaded.
        setState((previous) => ({ ...previous, settled: request, unavailable: true }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [request]);

  // Answered means the state in hand is the answer to the request in hand;
  // anything else — including the debounce window before the first request
  // exists — is still in flight.
  const answered = request !== null && state.settled === request;
  const loading = enabled && !answered;

  const fresh = enabled && state.key === key;
  const more =
    state.lastPage !== null
      ? state.page < state.lastPage
      : state.patterns.length > 0 && !state.drained;

  const loadMore = () => {
    if (request === null || loading || state.signedOut || !fresh || !more) {
      return;
    }
    setRequest({ page: state.page + 1, key: request.key });
  };

  return {
    patterns: enabled ? state.patterns : [],
    // A stale count under a new set of chips would be a lie; hold it back
    // until the first page for these filters lands.
    total: fresh ? state.total : null,
    loading,
    unavailable: answered && state.unavailable,
    signedOut: answered && state.signedOut,
    loadMore,
  };
}
