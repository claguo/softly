/**
 * The three ways a write can fail, in the words the screens say them.
 *
 * Cast on and Add a yarn both post to Ravelry and both answer the same three
 * questions — did the request leave, was anybody signed in, did it work — so
 * the triage is stated once. The sentences are not: "Couldn't start the
 * project" and "Couldn't add the yarn" are the screens' own, and each keeps
 * its own map beside the button the line appears under.
 *
 * `RavelryApiError` comes from the module rather than the `@/data` barrel:
 * this file is pure, and the barrel opens the database.
 */

import { SignedOutError } from '@/auth/client';
import { RavelryApiError } from '@/data/ravelry';

export type Problem = 'failed' | 'offline' | 'signedOut';

/** Which error the caught thing is, in those three words. */
export function triage(error: unknown): Problem {
  if (error instanceof SignedOutError) {
    return 'signedOut';
  }
  return error instanceof RavelryApiError && error.offline ? 'offline' : 'failed';
}
