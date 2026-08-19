/**
 * What the two adding sheets hand back to Cast on.
 *
 * A router navigates by URL, and a URL is not a return value: a sheet that
 * writes something has nowhere to put what it just made. Rewriting the route
 * underneath the screen it is about to uncover would be a navigation the
 * knitter did not ask for, and a provider around the whole app to carry one
 * value between two screens that are one decision is more machinery than the
 * value is worth.
 *
 * So they are slots, one each, and the protocol is three lines long. The sheet
 * puts something in and dismisses; Cast on takes it out on focus and empties
 * both when it goes away, so nothing nobody could claim is handed to the next
 * project.
 *
 * The two differ in what they hold, and it matters:
 *
 * - **Stash** holds an *id*, so Cast on has to wait until the row it names is
 *   actually in the mirror — `refreshStash` can land after the sheet has got
 *   out of the way, and a selection pointing at a row that is not there yet
 *   selects nothing. Looking is therefore not claiming.
 * - **Needle** holds a *size in millimetres*, which is how Cast on keys a
 *   needle in the first place (see `needle-sizes`). There is no row to wait
 *   for: the size is a usable answer the moment it is handed over, and the row
 *   that was written turns up on the live query already selected because it
 *   measures the same. So it can simply be claimed.
 */

let pendingStash: number | null = null;

/** Set by Add a yarn, after the write and the refresh that follows it. */
export function setPendingStashSelection(id: number): void {
  pendingStash = id;
}

/** What is waiting, if anything. Looking does not claim it. */
export function pendingStashSelection(): number | null {
  return pendingStash;
}

/** Takes what is waiting and empties the slot. */
export function consumePendingStashSelection(): number | null {
  const claimed = pendingStash;
  pendingStash = null;
  return claimed;
}

let pendingNeedle: string | null = null;

/** Set by Add a needle. The key is `sizeKey(mm)` — see `needle-sizes`. */
export function setPendingNeedleSelection(key: string): void {
  pendingNeedle = key;
}

/** What is waiting, if anything. Looking does not claim it. */
export function pendingNeedleSelection(): string | null {
  return pendingNeedle;
}

/** Takes what is waiting and empties the slot. */
export function consumePendingNeedleSelection(): string | null {
  const claimed = pendingNeedle;
  pendingNeedle = null;
  return claimed;
}
