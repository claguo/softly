/**
 * Yarn lookup for the Add a yarn sheet.
 *
 * The same three guarantees as `use-pattern-search`, in the smallest form the
 * screen needs: a typed query settles for 300ms before it becomes a request, a
 * superseded request resolves into a `cancelled` closure and is dropped, and
 * "in flight" is the difference between the request the caller wants and the
 * one the state answers rather than a flag anything has to remember to clear.
 *
 * There is no paginator here on purpose. `yarnsSearch` asks for eight rows and
 * that is the whole list: a sheet opened to name one skein is somewhere to
 * recognise a yarn, not somewhere to browse the yarn database. Results already
 * on screen survive the next keystroke — the alternative is a list that blinks
 * empty between every letter — but a failed search clears them, because
 * leaving one query's yarns under another query's text is a lie.
 */

import { useEffect, useState } from 'react';

import { SignedOutError } from '@/auth/client';
import { yarnsSearch, type RavelryYarnSummary } from '@/data';

const DEBOUNCE_MS = 300;

/** Identity, not value: two searches for the same words are two requests. */
type Request = { readonly query: string };

type SearchState = {
  /** The request this state answers, by identity, success or failure. */
  readonly settled: Request | null;
  readonly yarns: readonly RavelryYarnSummary[];
  readonly unavailable: boolean;
  readonly signedOut: boolean;
};

/**
 * One array, shared by every idle answer. The caller builds its list sections
 * from this, and a fresh `[]` on each render would rebuild them on each render.
 */
const NONE: readonly RavelryYarnSummary[] = [];

const IDLE: SearchState = { settled: null, yarns: NONE, unavailable: false, signedOut: false };

export type YarnSearch = {
  readonly yarns: readonly RavelryYarnSummary[];
  readonly loading: boolean;
  /** A request failed for a reason that is not "signed out". */
  readonly unavailable: boolean;
  readonly signedOut: boolean;
};

export function useYarnSearch(query: string, enabled: boolean): YarnSearch {
  const wanted = query.trim();

  const [request, setRequest] = useState<Request | null>(null);
  const [state, setState] = useState<SearchState>(IDLE);

  // The typing settles, then becomes a request. The cleanup means a word typed
  // at speed is one search rather than one per letter.
  useEffect(() => {
    if (!enabled || wanted === '') {
      return;
    }

    const timer = setTimeout(() => setRequest({ query: wanted }), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [enabled, wanted]);

  useEffect(() => {
    if (request === null) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const yarns = await yarnsSearch(request.query);

        if (!cancelled) {
          setState({ settled: request, yarns, unavailable: false, signedOut: false });
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        const signedOut = error instanceof SignedOutError;
        setState({ settled: request, yarns: NONE, unavailable: !signedOut, signedOut });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [request]);

  // Live means there is something to search for at all; answered means the
  // state in hand is the answer to the words in hand.
  const live = enabled && wanted !== '';
  const answered = live && request !== null && state.settled === request && request.query === wanted;

  return {
    yarns: live ? state.yarns : NONE,
    loading: live && !answered,
    unavailable: answered && state.unavailable,
    signedOut: answered && state.signedOut,
  };
}

function readName(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const name = (value as { name?: unknown }).name;
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : null;
}

/** The yarn's own name, which is the line a knitter reads first. */
export function yarnTitle(yarn: RavelryYarnSummary): string {
  return typeof yarn.name === 'string' && yarn.name.trim() !== ''
    ? yarn.name.trim()
    : 'Unnamed yarn';
}

/** The line under it: who spins it, and how thick it is. */
export function yarnMeta(yarn: RavelryYarnSummary): string {
  const company =
    readName(yarn.yarn_company) ??
    (typeof yarn.yarn_company_name === 'string' && yarn.yarn_company_name.trim() !== ''
      ? yarn.yarn_company_name.trim()
      : null);

  return [company, readName(yarn.yarn_weight)]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

/** The smallest photo that still holds up in a 44pt frame. */
export function yarnPhoto(yarn: RavelryYarnSummary): string | undefined {
  const photo = yarn.first_photo;
  if (!photo) {
    return undefined;
  }

  for (const key of ['square_url', 'small_url', 'thumbnail_url', 'medium_url'] as const) {
    const url = photo[key];
    if (typeof url === 'string' && url !== '') {
      return url;
    }
  }

  return undefined;
}
