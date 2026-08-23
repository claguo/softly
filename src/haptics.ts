import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * What this app is allowed to say through the Taptic Engine: six things, in
 * three tiers, and nothing a call site invents on the spot.
 *
 * Feel is a material here like the hairline and the square corner, and it is
 * rationed the same way. `tap` is the ordinary one — a selection tick under
 * every press that is only a press, the thing a knitter would miss if it went
 * away and cannot name while it is there. `commit` is heavier by exactly one
 * step and belongs to the single filled button a screen is allowed, so that the
 * one action that changes something is the only one that arrives with weight.
 * Medium rather than heavy, because committing here is casting off, not
 * slamming a door. `count` goes the other way, lighter than ordinary: a stepper
 * is pressed forty times in a minute, and forty selection ticks in a minute is
 * a rattle rather than a count.
 *
 * The last three are the system's notifications and mean what the system means
 * by them — something landed, something is not quite right, something failed.
 * They are said after the fact and never in place of `commit`: pressing Save is
 * `commit`, Save having worked is `success`, and a screen that felt both is a
 * screen that did both.
 *
 * Everything here is fire-and-forget. Nothing returns a promise, so no press
 * handler can be written to wait on a buzz before the UI moves, and nothing
 * rejects, so a dead engine, a simulator, or a knitter who has turned system
 * haptics off is silence rather than a failure inside the thing the finger was
 * actually doing.
 */

/**
 * Web is silent outright. `expo-haptics` falls through to the Vibration API
 * there, and a browser tab that buzzes is none of the six things above.
 */
const silent = Platform.OS === 'web';

/**
 * Start the effect and let go of it. The empty `catch` is not swallowed error
 * handling, it is the contract: these calls are decoration on a press, and
 * decoration is never allowed to take the press down with it.
 */
function fire(effect: () => Promise<void>): void {
  if (silent) return;
  try {
    effect().catch(() => {});
  } catch {
    // A throw before there is a promise to reject — a module that did not link.
  }
}

export const haptics = {
  /** An ordinary press: a control acknowledging the finger. */
  tap(): void {
    fire(() => Haptics.selectionAsync());
  },
  /** The one filled button on the screen, doing the thing it is there to do. */
  commit(): void {
    fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  },
  /** One step of a counter, light enough to survive being repeated. */
  count(): void {
    fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },
  /** It landed. */
  success(): void {
    fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  },
  /** It went through, but not cleanly. */
  warning(): void {
    fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  },
  /** It did not happen. */
  error(): void {
    fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
  },
};
