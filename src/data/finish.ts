/**
 * Finishing a project — the one write in the app that is a celebration.
 *
 * Ravelry needs three or four calls to record what a knitter thinks of as one
 * moment, and this is where they are said in order:
 *
 * 1. **The photograph, if there is one.** A single-use `upload_token`, then the
 *    file itself to the unauthenticated image host, then the returned
 *    `image_id` onto the project. Three round trips, all of them optional.
 * 2. **The status.** `project_status_id: 2` and today's date as `completed`,
 *    which is what turns the badge on the project screen into "Finished".
 * 3. **The mirror.** `refreshProjects`, because the screen this returns to
 *    reads SQLite and not the network.
 *
 * Two rules shape the error handling, and they pull in opposite directions.
 *
 * **A photograph must never cost the finish.** A rejected file, a broken image
 * host, a token that has already been spent — none of those are a reason to
 * leave a finished sweater marked as in progress. The photo failing is
 * reported (`photoFailed`) rather than raised, and the status is written
 * anyway.
 *
 * **But being offline must cost the whole thing.** A knitter who is off the
 * network has not finished anything as far as Ravelry is concerned, and half a
 * finish — the project marked done, the photograph gone — is worse than none.
 * So the first call out is also the gate: if it could not leave the phone,
 * nothing after it is attempted. There is no connectivity check anywhere in
 * this app; a request that never landed is how it finds out, and this is the
 * one place that difference has to be acted on rather than displayed.
 *
 * Nothing here throws. Every caller gets a `FinishOutcome`, the same way
 * `syncAll` and the PDF chain report rather than raise.
 */

import { SignedOutError } from '@/auth/client';
import {
  createProjectPhoto,
  RavelryApiError,
  requestUploadToken,
  updateProject,
  uploadImage,
  type UploadFile,
} from '@/data/ravelry';
import { PROJECT_STATUS_FINISHED } from '@/data/reference';
import { refreshProjects } from '@/data/sync';

/**
 * Why a finish did not happen. The same three words as `Problem` in
 * `@/features/start-project/problem`, restated here because the data layer does
 * not import from the features layer — see `pdfs.ts`, which does the same.
 */
export type FinishProblem = 'offline' | 'signedOut' | 'failed';

export type FinishOutcome =
  /**
   * The project is finished. `photoFailed` is true when a photograph was
   * offered and did not make it — the finish stands, the picture does not.
   */
  | { readonly ok: true; readonly photoFailed: boolean }
  | { readonly ok: false; readonly reason: FinishProblem };

/** Which error the caught thing is, in those three words. */
function triage(error: unknown): FinishProblem {
  if (error instanceof SignedOutError) {
    return 'signedOut';
  }
  return error instanceof RavelryApiError && error.offline ? 'offline' : 'failed';
}

/** Today where the knitter is, in the `YYYY-MM-DD` Ravelry wants. */
function today(): string {
  const now = new Date();
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Puts the photograph on the project.
 *
 * Returns nothing and throws everything: the caller decides which failures are
 * survivable, because that decision is about the finish and not about the
 * upload.
 */
async function attachPhoto(
  username: string,
  projectId: number,
  photo: UploadFile,
): Promise<void> {
  const uploadToken = await requestUploadToken();
  const imageId = await uploadImage(uploadToken, photo);
  await createProjectPhoto(username, projectId, imageId);
}

/**
 * Marks one project finished, with a photograph of it if the knitter took one.
 *
 * The photograph goes first because it is the call that can be given up on: by
 * the time the status is written, either the picture is on the project or this
 * function has already decided to finish without it. Reversing that order would
 * mean a finished project with a photograph still in flight, and no screen left
 * to say so on.
 */
export async function finishProject(
  username: string,
  projectId: number,
  photo?: UploadFile,
): Promise<FinishOutcome> {
  let photoFailed = false;

  if (photo !== undefined) {
    try {
      await attachPhoto(username, projectId, photo);
    } catch (error) {
      const problem = triage(error);

      // Offline and signed out are not photograph problems — they are the
      // whole request, and the write after this one would fail in the same
      // breath. Stop while nothing has been recorded.
      if (problem !== 'failed') {
        return { ok: false, reason: problem };
      }

      photoFailed = true;
    }
  }

  try {
    await updateProject(username, projectId, {
      project_status_id: PROJECT_STATUS_FINISHED,
      completed: today(),
    });
  } catch (error) {
    return { ok: false, reason: triage(error) };
  }

  // Awaited, and its outcome ignored: the project screen reads the mirror, so
  // the row has to be brought level before the modal gets out of the way — but
  // a refresh that could not land does not un-finish anything, and the next
  // sync will carry it. `refreshProjects` reports rather than throwing.
  await refreshProjects(username);

  return { ok: true, photoFailed };
}
