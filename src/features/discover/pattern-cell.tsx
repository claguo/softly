/**
 * One cell of the Discover grid.
 *
 * `PatternCard`'s grid variant is the right *content* — 4/5 photo, display
 * name, stamped meta, saved heart — but the wrong *box*: it lays out as a
 * floating card (8px gap between photo and body, no padding, no borders) and
 * exposes no style hook. The design's grid has none of that: `gap: 0`, cells
 * that share hairlines with their neighbours, and a caption block with its own
 * `9/10/11` padding under a hairline. Rather than push a styling escape hatch
 * into a shared component for one screen, the cell is rebuilt here against the
 * same tokens. `PhotoFrame` still does the photography, including its striped
 * placeholder.
 *
 * The cell is only pressable when it is given somewhere to go: a result with
 * no id has no detail route, and a tap target that goes nowhere is worse than
 * none.
 */

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PhotoFrame } from '@/components/ui';
import { fonts, trackMicro, type, useTheme } from '@/theme';

export type PatternCellProps = {
  name: string;
  /** Stamped line under the name, e.g. "Norah Gaughan · free". */
  meta?: string;
  photo?: string;
  /** Already favourited on Ravelry. */
  saved?: boolean;
  /** Opens the pattern. Omit for a result Ravelry gave no id. */
  onPress?: () => void;
};

/**
 * Memoised because it is a list cell. Every other prop is a primitive, so the
 * shallow compare turns on `onPress` alone: the grid hands each cell a closure
 * over its own id, which is a new function per render pass — the memo still
 * pays for itself when the list re-renders for a reason other than new results
 * (a theme change, a chip's press state), and a cell is cheap either way.
 */
export const PatternCell = memo(function PatternCell({
  name,
  meta,
  photo,
  saved = false,
  onPress,
}: PatternCellProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessible
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={meta ? `${name}, ${meta}` : name}
      onPress={onPress}
      // The cell draws its right and bottom edges; the row draws the left and
      // the list's first row sits under the rail's hairline. Every line in the
      // grid is therefore exactly one hairline wide, shared by two cells.
      style={({ pressed }) => [
        styles.cell,
        { borderColor: colors.hairline },
        pressed && onPress ? { backgroundColor: colors.surfaceSunk } : null,
      ]}>
      <View>
        <PhotoFrame src={photo} label="pattern photo" aspect="4/5" />
        {saved ? (
          // The heart is ink, not a colour. Colour in this app means one of
          // three states — committed, wants attention, could not be reached —
          // and "you favourited this on Ravelry" is none of them. It is a flag
          // the knitter set, so it is drawn in the same ink everything else the
          // knitter wrote is drawn in. The surface chip behind it is what lifts
          // it off the photograph, and it has to, because ink and a photograph
          // can land anywhere against each other.
          <View style={[styles.saved, { backgroundColor: colors.surface }]}>
            <Text style={[styles.savedGlyph, { color: colors.ink }]}>♥</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.caption, { borderTopColor: colors.hairline }]}>
        <Text numberOfLines={2} style={[styles.name, { color: colors.ink }]}>
          {name}
        </Text>
        {meta ? (
          <Text numberOfLines={1} style={[styles.meta, { color: colors.ink2 }]}>
            {meta}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  cell: {
    flex: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
  caption: {
    paddingTop: 9,
    paddingHorizontal: 10,
    paddingBottom: 11,
    gap: 4,
    borderTopWidth: 1,
  },
  name: {
    // The handoff's 16px Yuji Mai. Leading is opened past its 1.1 for the same
    // reason `PatternCard` opens it: the brush strokes clip at that tightness.
    fontFamily: fonts.display,
    fontSize: 16,
    lineHeight: 20,
  },
  meta: {
    fontFamily: fonts.ui,
    fontSize: type.micro.fontSize,
    lineHeight: 12,
    letterSpacing: trackMicro,
  },
  saved: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedGlyph: {
    fontFamily: fonts.ui,
    fontSize: 13,
    lineHeight: 16,
  },
});
