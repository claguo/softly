import {
  Solway_300Light,
  Solway_400Regular,
  Solway_500Medium,
  Solway_700Bold,
  Solway_800ExtraBold,
} from '@expo-google-fonts/solway';
import { YujiMai_400Regular } from '@expo-google-fonts/yuji-mai';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';

import { AuthProvider, useAuth } from '@/auth/context';
import { syncAll } from '@/data';
import { useTheme } from '@/theme';

// Must run in module scope, before any component mounts.
SplashScreen.preventAutoHideAsync();

/**
 * One sync per session, fired as soon as auth settles on a username.
 *
 * The ref is the guard rather than the effect's dependencies alone: this
 * component re-renders on every auth change, and refreshing the cache is a
 * network round trip, not something to repeat because a profile arrived late.
 * Signing in as somebody else does re-fire — that is a different account's
 * cache. It renders nothing; it exists to be inside `AuthProvider`.
 */
function SyncBootstrap() {
  const { status, user } = useAuth();
  const username = user?.username ?? null;
  const synced = useRef<string | null>(null);

  useEffect(() => {
    if (status !== 'signedIn' || username === null || synced.current === username) {
      return;
    }
    synced.current = username;
    // `syncAll` reports offline, refused and signed-out through its resolved
    // outcome, so there is nothing here to catch and nothing to show.
    void syncAll(username);
  }, [status, username]);

  return null;
}

/**
 * The stack, and the one decision it makes: which half of the app exists.
 *
 * It lives inside `AuthProvider` because it has to read auth to answer that,
 * and it owns the splash hand-off for the same reason — the native splash can
 * only come down once there is a screen underneath it, and until auth settles
 * neither guard passes, so there is none.
 */
function RootNavigator() {
  const { colors } = useTheme();
  const { status } = useAuth();

  const settled = status !== 'loading';

  useEffect(() => {
    if (settled) {
      SplashScreen.hideAsync();
    }
  }, [settled]);

  // Fonts are already resident by the time this mounts, so the only thing left
  // to wait on is auth. Every path through the provider's restore lands on
  // `signedOut` or `signedIn` — the network failures are caught and answered
  // from the stored session — so this is a frame or two, not a state to live in.
  if (!settled) {
    return null;
  }

  // The root is a stack whose first screen is the whole tab bar — details
  // (a pattern, a project, a skein) push over it, tab pill included, so a
  // detail screen is the screen rather than a card sitting under the tabs.
  //
  // Every screen is declared now, which it did not used to be. Expo Router
  // appends undeclared file routes after the ones listed here, and an appended
  // route lands outside the guards — `Protected` withholds the screens named
  // inside it and nothing else. So the details are named too, or a deep link
  // would open one while signed out. Order still decides the stack's first
  // screen, which is why the tabs stay first.
  //
  // The guards are what make signing out a fact about the app rather than a
  // redirect somebody has to remember to write: signed out, the welcome is the
  // only screen that exists, and every route that could show somebody else's
  // data has no entry to open. Signing in swaps the whole set in one render.
  return (
    <Stack
      screenOptions={{
        // The stack draws no chrome of its own: a navigator's header is the
        // same header on every screen, and each of these draws its own top.
        headerShown: false,
        // `contentStyle` is the native stack's equivalent of the tab
        // navigator's `sceneStyle` — the view wrapping each screen, which
        // has to be paper so a push never flashes white.
        contentStyle: { backgroundColor: colors.paper },
      }}>
      <Stack.Protected guard={status === 'signedIn'}>
        <Stack.Screen name="(tabs)" />
        {/* Casting on is a decision, so it arrives as a card that can be
            thrown away rather than another push onto the pattern. */}
        <Stack.Screen name="start-project" options={{ presentation: 'modal' }} />
        {/* Naming a yarn is its own decision inside that one, and it writes,
            so it gets its own card rather than unfolding inside the first.
            A sheet over a sheet is what UIKit does when one modal presents
            another, and the way out of it is the same downward throw. */}
        <Stack.Screen name="add-yarn" options={{ presentation: 'modal' }} />
        {/* And a needle, on the same terms — except that this one writes to
            the app's own drawer rather than to Ravelry, which has no way of
            being told about a needle. */}
        <Stack.Screen name="add-needle" options={{ presentation: 'modal' }} />
        {/* Editing is the same decision as adding, said a second time over a
            thing that already exists, so both take the same card and the same
            downward throw out of it. */}
        <Stack.Screen name="edit-yarn" options={{ presentation: 'modal' }} />
        <Stack.Screen name="edit-needle" options={{ presentation: 'modal' }} />
        {/* The other end of casting on, and a card for the same reason: taking
            a photograph of the finished thing is a decision, and a decision
            somebody is allowed to throw away. It dismisses back onto the
            project it finished. */}
        <Stack.Screen name="finish/[projectId]" options={{ presentation: 'modal' }} />
        {/* The details would otherwise be appended by the router and sit
            outside the guard entirely — `Protected` only withholds the screens
            named inside it. None of them carry options, so saying them here
            costs nothing when signed in; it is the only way to say that a
            `softly://pattern/123` link is not a way in. */}
        <Stack.Screen name="pattern/[id]" />
        <Stack.Screen name="project/[id]" />
        <Stack.Screen name="yarn/[id]" />
        <Stack.Screen name="needle/[id]" />
        <Stack.Screen name="pdf/[patternId]" />
      </Stack.Protected>

      {/* The name and one button. Signed out, this is the app. */}
      <Stack.Protected guard={status === 'signedOut'}>
        <Stack.Screen name="welcome" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  // Solway carries every readable/tappable string across its five real weights,
  // body sitting on the Light cut and the rest stepping up from there; Yuji Mai
  // is display-only. Nothing renders until every face is resident, so text never
  // reflows from a system fallback.
  const [fontsLoaded, fontError] = useFonts({
    Solway_300Light,
    Solway_400Regular,
    Solway_500Medium,
    Solway_700Bold,
    Solway_800ExtraBold,
    YujiMai_400Regular,
  });

  const ready = fontsLoaded || fontError !== null;

  // Hold the native splash rather than flashing an unstyled frame. It stays up
  // past this gate too — `RootNavigator` is the one that takes it down, once
  // auth has settled and there is a stack to reveal.
  if (!ready) {
    return null;
  }

  // Auth restores from secure store on mount, so it sits inside the font gate:
  // nothing reads it until there is something to render it with.
  return (
    <AuthProvider>
      <SyncBootstrap />
      <StatusBar style="auto" />
      <RootNavigator />
    </AuthProvider>
  );
}
