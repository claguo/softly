import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabGlyph, type GlyphShape } from '@/components/tab-glyph';
import { radius, useTheme } from '@/theme';

const GLYPHS: Record<string, GlyphShape> = {
  index: 'square',
  saves: 'ring',
  stash: 'bars',
  discover: 'diamond',
  you: 'dot',
};

const useNativeGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

/**
 * The floating pill tab bar: glyph-only, centred, hovering above the content.
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
                  navigation.navigate(route.name);
                }
              }}
              style={[styles.button, on && { backgroundColor: colors.action }]}>
              <TabGlyph shape={GLYPHS[route.name] ?? 'dot'} color={on ? colors.onAction : colors.ink2} on={on} />
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
});
