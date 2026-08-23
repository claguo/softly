import type { BottomTabBarProps } from 'expo-router/js-tabs';
import Feather, { type FeatherIconName } from '@react-native-vector-icons/feather';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptics } from '@/haptics';
import { radius, useTheme } from '@/theme';

/**
 * Route name to Feather icon. The handoff drew five geometric shapes and asked
 * that no icon set be substituted for them; the app's owner overrode that on
 * 2026-08-21 and asked for Feather, so the shapes are gone and these are what
 * the bar wears. Anything named here must be a route under `(tabs)`, and every
 * route there must be named here or handled by `Dot` below — a miss falls back
 * to an outlined circle rather than an empty button, which is the sort of thing
 * that ships unnoticed.
 */
const ICONS: Record<string, FeatherIconName> = {
  index: 'home',
  saves: 'heart',
  discover: 'search',
};

/** The one route the icon set cannot draw: see `Dot`. */
const DOT_ROUTE = 'stash';

/**
 * Stash's mark: a filled disc, not a glyph.
 *
 * Feather is a stroke alphabet — its `circle` is a ring, and a ring is what the
 * unnamed-route fallback means. The stash asked for solid, so it is drawn here
 * rather than fetched: centred in the same button the letters stand in, taking
 * the colour they would have taken.
 */
function Dot({ color }: { color: string }) {
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

const useNativeGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

/**
 * The floating pill tab bar: icon-only, centred, hovering above the content.
 * Native glass material on iOS 26+; a translucent surface elsewhere.
 */
export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();

  const Pill = useNativeGlass ? GlassView : View;
  const pillFallback = useNativeGlass
    ? null
    : {
        backgroundColor:
          scheme === 'dark' ? 'rgba(30,26,22,0.94)' : 'rgba(255,253,249,0.94)',
      };

  return (
    <View pointerEvents="box-none" style={[styles.nav, { bottom: Math.max(18, insets.bottom + 6) }]}>
      <Pill style={[styles.pill, { borderColor: colors.hairline }, pillFallback]}>
        {state.routes.map((route, index) => {
          const on = state.index === index;
          const { options } = descriptors[route.key];
          const label = options.title ?? route.name;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={label}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!on && !event.defaultPrevented) {
                  haptics.tap();
                  navigation.navigate(route.name);
                }
              }}
              style={[styles.button, on && { backgroundColor: colors.action }]}>
              {/* 20 is the box the geometric glyphs stood in, kept so the pill
                  and its buttons did not have to be remeasured. Feather only
                  draws outlines, and nothing is lost by that here: the selected
                  tab is already said by the filled button beneath it. */}
              {route.name === DOT_ROUTE ? (
                <Dot color={on ? colors.onAction : colors.ink2} />
              ) : (
                <Feather
                  name={ICONS[route.name] ?? 'circle'}
                  size={20}
                  color={on ? colors.onAction : colors.ink2}
                />
              )}
            </Pressable>
          );
        })}
      </Pill>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    padding: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#221E1A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 8,
  },
  button: {
    width: 52,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  dot: {
    // Well inside the 20 the glyphs are drawn at: a solid disc that measured 20
    // would out-weigh every outline beside it. 11 is the ink they carry.
    width: 11,
    height: 11,
    borderRadius: radius.pill,
  },
});
