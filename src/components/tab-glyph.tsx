import { StyleSheet, View } from 'react-native';

import { radius } from '@/theme';

export type GlyphShape = 'square' | 'ring' | 'bars' | 'diamond' | 'dot';

/**
 * The five geometric tab glyphs from the design handoff. Drawn as vectors
 * (plain views), per the handoff: do not substitute an icon set.
 */
export function TabGlyph({ shape, color, on }: { shape: GlyphShape; color: string; on: boolean }) {
  switch (shape) {
    case 'square':
      return (
        <View style={styles.box}>
          <View style={[styles.outline, { borderColor: color }, on && { backgroundColor: color }]} />
        </View>
      );
    case 'ring':
      return (
        <View style={styles.box}>
          <View
            style={[
              styles.outline,
              { borderColor: color, borderRadius: radius.pill },
              on && { backgroundColor: color },
            ]}
          />
        </View>
      );
    case 'bars':
      return (
        <View style={[styles.box, styles.bars]}>
          <View style={[styles.bar, { backgroundColor: color }]} />
          <View style={[styles.bar, { backgroundColor: color, opacity: on ? 1 : 0.55 }]} />
        </View>
      );
    case 'diamond':
      return (
        <View style={styles.box}>
          <View
            style={[
              styles.diamond,
              { borderColor: color },
              on && { backgroundColor: color },
            ]}
          />
        </View>
      );
    case 'dot':
      return (
        <View style={styles.box}>
          <View style={[styles.dot, { backgroundColor: color }]} />
        </View>
      );
  }
}

const styles = StyleSheet.create({
  box: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  outline: { width: 14, height: 14, borderWidth: 1.5 },
  bars: { flexDirection: 'column', gap: 3 },
  bar: { width: 16, height: 3 },
  diamond: { width: 12, height: 12, borderWidth: 1.5, transform: [{ rotate: '45deg' }] },
  dot: { width: 8, height: 8, borderRadius: radius.pill },
});
