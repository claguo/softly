import { Tabs } from 'expo-router/js-tabs';

import { FloatingTabBar } from '@/components/tab-bar';
import { useTheme } from '@/theme';

/**
 * The five tabs, grouped so the root stack can push detail screens over the
 * whole thing. The route names here are load-bearing: `FloatingTabBar` maps
 * them to its five glyphs.
 */
export default function TabsLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      // Rendered as an element, not passed bare: react-navigation calls
      // `tabBar(props)` as a plain function, which would run FloatingTabBar's
      // hooks (including the React Compiler memo cache) outside a mount.
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // `sceneStyle` styles the view wrapping each tab's screen — the
        // floating pill hovers over paper, so the scene must be paper too.
        sceneStyle: { backgroundColor: colors.paper },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="saves" options={{ title: 'Saves' }} />
      <Tabs.Screen name="stash" options={{ title: 'Stash' }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover' }} />
      <Tabs.Screen name="you" options={{ title: 'You' }} />
    </Tabs>
  );
}
