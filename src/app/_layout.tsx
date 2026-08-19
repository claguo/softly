import {
  ShipporiMincho_400Regular,
  ShipporiMincho_500Medium,
  ShipporiMincho_600SemiBold,
  ShipporiMincho_700Bold,
  ShipporiMincho_800ExtraBold,
} from '@expo-google-fonts/shippori-mincho';
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

export default function RootLayout() {
  const { colors } = useTheme();

  // Shippori Mincho carries every readable/tappable string across its five real
  // weights; Yuji Mai is display-only. Nothing renders until every face is
  // resident, so text never reflows from a system fallback.
  const [fontsLoaded, fontError] = useFonts({
    ShipporiMincho_400Regular,
    ShipporiMincho_500Medium,
    ShipporiMincho_600SemiBold,
    ShipporiMincho_700Bold,
    ShipporiMincho_800ExtraBold,
    YujiMai_400Regular,
  });

  const ready = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  // Hold the native splash rather than flashing an unstyled frame.
  if (!ready) {
    return null;
  }

  // Auth restores from secure store on mount, so it sits inside the font gate:
  // nothing reads it until there is something to render it with.
  //
  // The root is a stack whose first screen is the whole tab bar — details
  // (a pattern, a project, a skein) push over it, tab pill included, so a
  // detail screen is the screen rather than a card sitting under the tabs.
  //
  // Only the two screens that need saying are declared. Expo Router appends
  // every other file route after the ones listed here, so the details keep
  // working undeclared — but the order is what decides the stack's first
  // screen, which is why the tabs are named rather than left to sorting.
  return (
    <AuthProvider>
      <SyncBootstrap />
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          // The stack draws no chrome of its own: every screen carries either
          // `ScreenHeader` or `BackBar`, which are the app's only two headers.
          headerShown: false,
          // `contentStyle` is the native stack's equivalent of the tab
          // navigator's `sceneStyle` — the view wrapping each screen, which
          // has to be paper so a push never flashes white.
          contentStyle: { backgroundColor: colors.paper },
        }}>
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
      </Stack>
    </AuthProvider>
  );
}
