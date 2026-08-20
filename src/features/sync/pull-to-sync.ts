/**
 * Pull to refresh, for the three tabs that have a list to pull on.
 *
 * The spinner used to be wired straight to the sync store — `refreshing` was
 * `phase === 'syncing'` — which reads as obviously right and is the source of a
 * real bug, because that status is *global* and the spinner is not. A sync
 * fired at launch by `SyncBootstrap`, or by a pull on some other tab, runs for
 * as long as it takes to walk four resources; bottom tabs mount lazily; so a
 * tab opened inside that window mounts its list with `refreshing` already true.
 * A `RefreshControl` told to begin refreshing while its scroll view is still
 * being attached draws a spinner that does not spin, and it stays that way
 * until the next layout pass — which is why touching the screen appears to fix
 * it. `react-native-screens` freezes inactive tab screens, which arrives at the
 * same place from the other direction: a change to `refreshing` that lands
 * while a tab is frozen is applied the moment it unfreezes, which is the moment
 * of the switch.
 *
 * So a spinner here is a reply to a gesture rather than a status light. It is
 * true only for a pull that happened on this screen, and only until that pass
 * settles. Every other sync is silent, which is what the screens have always
 * said they wanted: freshness said once and quietly, never a spinner over rows
 * that are already on screen and already readable.
 */

import { useCallback, useState } from 'react';

import { syncAll } from '@/data';

export type PullToSync = {
  /** Straight onto `RefreshControl`; true only between a pull and its answer. */
  readonly refreshing: boolean;
  readonly onRefresh: () => void;
};

/**
 * `null` for a signed-out account, where the screens leave the whole control
 * off — `onRefresh` is still safe to call and does nothing.
 */
export function usePullToSync(username: string | null): PullToSync {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    if (username === null) {
      return;
    }

    setRefreshing(true);

    // `syncAll` reports offline, refused and signed-out through its resolved
    // outcome rather than throwing, so there is nothing to catch here — and
    // the spinner comes off whichever of those it was. A pull landing on a
    // sync already in flight is handed that pass to wait on, so this settles
    // when the real work does rather than immediately.
    void syncAll(username).finally(() => setRefreshing(false));
  }, [username]);

  return { refreshing, onRefresh };
}
