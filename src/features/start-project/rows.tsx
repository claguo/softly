/**
 * The rows Cast on, Add a yarn and Add a needle are all built out of.
 *
 * Adding a yarn used to be an area inside Cast on, so all of this was rows in
 * one list. Each is its own sheet now, and these are the vocabulary the three
 * screens share: a 44pt photograph or swatch, a name and a stamped line beside
 * it, a hairline underneath, and a 48pt minimum however little the row holds.
 * Keeping them in one module is what keeps the screens looking like one
 * decision — the metrics are stated once, here, and no screen restates them.
 *
 * Nothing here reads the database. The row types come from `@/data` as types
 * only, which are erased at compile time, so importing this module does not
 * open the mirror the way the barrel does.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { FilterChip } from '@/components/ui/filter-chip';
import { PhotoFrame } from '@/components/ui/photo-frame';
import type { NeedleListRow, RavelryYarnSummary, StashListRow } from '@/data';
import { decimal } from '@/features/detail/raw';
import type { SizeOption } from '@/features/start-project/needle-sizes';
import { yarnMeta, yarnPhoto, yarnTitle } from '@/features/start-project/use-yarn-search';
import { fonts, radius, space, tap, trackMicro, type, useTheme } from '@/theme';

/** Ravelry's needle kinds arrive lowercase. Sentence case, never all-caps. */
function sentence(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** One skein already in the mirror, and whether this project is eating it. */
export function YarnChoice({
  row,
  selected,
  onPress,
}: {
  row: StashListRow;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  // The same composition Stash uses: the colourway takes the line, and
  // whatever else names this yarn goes underneath.
  const title = row.colorway ?? row.yarnName ?? 'Unnamed yarn';
  const subtitle = [row.brand, row.colorway === null ? null : row.yarnName]
    .filter((part): part is string => part !== null)
    .join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={subtitle === '' ? title : `${title}, ${subtitle}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        {
          borderBottomColor: colors.hairline,
          // Chosen and pressed read the same on purpose: the tint is what
          // "this one" looks like, whether it is being said or already said.
          backgroundColor: selected || pressed ? colors.brassTint : colors.surface,
        },
      ]}>
      <PhotoFrame src={row.photoUrl ?? undefined} label="yarn" width={44} aspect="1/1" />

      <View style={styles.choiceBody}>
        <Text numberOfLines={1} style={[styles.choiceName, { color: colors.ink }]}>
          {title}
        </Text>
        {subtitle === '' ? null : (
          <Text numberOfLines={1} style={[styles.choiceMeta, { color: colors.ink3 }]}>
            {subtitle}
          </Text>
        )}
      </View>

      {selected ? <Badge tone="committed">chosen</Badge> : null}
    </Pressable>
  );
}

/** One needle out of the drawer, keyed by the size it would put on a project. */
export function NeedleChoice({
  row,
  selected,
  onPress,
}: {
  row: NeedleListRow;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const size = row.sizeMm === null ? '—' : decimal(row.sizeMm);
  const kind = sentence(row.kind ?? row.name ?? 'Needle');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${kind} ${size} mm`}
      // A needle whose size Ravelry never gave us cannot be put on a project:
      // there is no size to write. It stays on the list, unselectable, rather
      // than pretending a tap did something.
      disabled={row.sizeMm === null}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        {
          borderBottomColor: colors.hairline,
          backgroundColor: selected || pressed ? colors.brassTint : colors.surface,
        },
      ]}>
      {/* `NeedleRow` fills the swatch to mean free and sinks it to mean tied
          up. Here the row itself carries the state, so the swatch inverts:
          sunk while the needle is just sitting there, lifted off the tint and
          edged in brass once it is going into this project. */}
      <View
        style={[
          styles.swatch,
          {
            backgroundColor: selected ? colors.surface : colors.surfaceSunk,
            borderColor: selected ? colors.brass : colors.hairline,
          },
        ]}>
        <Text style={[styles.swatchSize, { color: selected ? colors.brass : colors.ink3 }]}>
          {size}
        </Text>
        <Text style={[styles.swatchUnit, { color: colors.ink3 }]}>mm</Text>
      </View>

      <View style={styles.choiceBody}>
        <Text numberOfLines={1} style={[styles.choiceName, { color: colors.ink }]}>
          {kind}
          {row.sizeUs === null ? null : (
            <Text style={[styles.choiceUs, { color: colors.ink3 }]}> · US {row.sizeUs}</Text>
          )}
        </Text>
        {row.lengthLabel === null ? null : (
          <Text numberOfLines={1} style={[styles.choiceMeta, { color: colors.ink3 }]}>
            {row.lengthLabel}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

/**
 * Ravelry's size table as chips.
 *
 * The same grid twice: Cast on unfolds it under "All sizes" to put sizes on a
 * project, and Add a needle picks one out of it to write a needle. Which of
 * those is multi-select is the caller's business — the grid draws whatever it
 * is told is chosen — and so are the words, because "loading" means something
 * different on a row that was just opened than on a sheet that opened on it.
 *
 * `notice` stands in for the chips before they land: one stamped line where
 * the grid would be, slate when the table could not be reached at all.
 */
export function SizeGrid({
  options,
  selected,
  notice,
  onPress,
}: {
  options: readonly SizeOption[];
  selected: readonly string[];
  notice?: { readonly line: string; readonly unavailable?: boolean };
  onPress: (key: string) => void;
}) {
  const { colors } = useTheme();

  const waiting =
    notice === undefined ? null : (
      <Text
        style={[styles.note, { color: notice.unavailable === true ? colors.slate : colors.ink3 }]}>
        {notice.line}
      </Text>
    );

  return (
    <View style={[styles.grid, { borderBottomColor: colors.hairline }]}>
      {options.length === 0
        ? waiting
        : options.map((option) => (
            <FilterChip
              key={option.key}
              label={`${decimal(option.mm)} mm`}
              value={option.us === null ? undefined : `US ${option.us}`}
              active={selected.includes(option.key)}
              onPress={() => onPress(option.key)}
            />
          ))}
    </View>
  );
}

/**
 * The quiet row that opens something: "Add a yarn", "All sizes", "Add by
 * name". Never brass — the one brass thing on a screen is that screen's own
 * action — so it is a hairline row in ink2 with a glyph saying which way it
 * goes, and an optional stamped note for what the knitter should know before
 * opening it.
 *
 * `open` is what makes it a disclosure: given, the glyph is "+" or "−" and the
 * row says as much to a screen reader. Left off, the row is a way to somewhere
 * else, and the glyph is the chevron `BackBar` points the other way with.
 */
export function AddRow({
  label,
  note,
  open,
  onPress,
}: {
  label: string;
  note?: string;
  open?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const glyph = open === undefined ? '›' : open ? '−' : '+';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={open === undefined ? undefined : { expanded: open }}
      accessibilityLabel={note === undefined ? label : `${label}, ${note}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.addRow,
        {
          borderBottomColor: colors.hairline,
          backgroundColor: pressed ? colors.brassTint : colors.surface,
        },
      ]}>
      <Text style={[styles.addLabel, { color: open === true ? colors.ink : colors.ink2 }]}>
        {label}
      </Text>
      {note === undefined ? null : (
        <Text style={[styles.note, { color: colors.ink3 }]}>{note}</Text>
      )}
      <Text style={[styles.addGlyph, { color: colors.ink3 }]}>{glyph}</Text>
    </Pressable>
  );
}

/**
 * One yarn from the database search: the same row shape as a stash choice.
 *
 * It used to sit a step further in than the stash it might join, because it
 * did. On its own screen there is no stash above it to be indented from, so it
 * runs flush with everything else there.
 */
export function YarnResult({
  yarn,
  onPress,
}: {
  yarn: RavelryYarnSummary;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const title = yarnTitle(yarn);
  const meta = yarnMeta(yarn);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={meta === '' ? title : `${title}, ${meta}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        {
          borderBottomColor: colors.hairline,
          backgroundColor: pressed ? colors.brassTint : colors.surface,
        },
      ]}>
      <PhotoFrame src={yarnPhoto(yarn)} label="yarn" width={44} aspect="1/1" />

      <View style={styles.choiceBody}>
        <Text numberOfLines={1} style={[styles.choiceName, { color: colors.ink }]}>
          {title}
        </Text>
        {meta === '' ? null : (
          <Text numberOfLines={1} style={[styles.choiceMeta, { color: colors.ink3 }]}>
            {meta}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

/** The yarn about to be written, and the way back out of having chosen it. */
export function StagedYarn({
  yarn,
  onClear,
}: {
  yarn: RavelryYarnSummary;
  onClear: () => void;
}) {
  const { colors } = useTheme();
  const title = yarnTitle(yarn);
  const meta = yarnMeta(yarn);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Remove ${title}`}
      onPress={onClear}
      style={({ pressed }) => [
        styles.choice,
        {
          borderBottomColor: colors.hairline,
          backgroundColor: pressed ? colors.brassTint : colors.surface,
        },
      ]}>
      <PhotoFrame src={yarnPhoto(yarn)} label="yarn" width={44} aspect="1/1" />

      <View style={styles.choiceBody}>
        <Text numberOfLines={1} style={[styles.choiceName, { color: colors.ink }]}>
          {title}
        </Text>
        {meta === '' ? null : (
          <Text numberOfLines={1} style={[styles.choiceMeta, { color: colors.ink3 }]}>
            {meta}
          </Text>
        )}
      </View>

      <Text style={[styles.clear, { color: colors.ink3 }]}>×</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    minHeight: tap.min,
    paddingVertical: space.s2,
    paddingHorizontal: space.s3,
    borderBottomWidth: 1,
  },
  choiceBody: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'column',
    gap: 3,
  },
  choiceName: {
    fontFamily: fonts.uiMedium,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
  choiceUs: {
    fontFamily: fonts.ui,
  },
  choiceMeta: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
  },
  clear: {
    fontFamily: fonts.ui,
    fontSize: 17,
    lineHeight: 20,
    paddingHorizontal: space.s2,
  },
  swatch: {
    width: 44,
    height: 44,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  swatchSize: {
    fontFamily: fonts.uiMedium,
    fontSize: 14,
    lineHeight: 16,
  },
  swatchUnit: {
    fontFamily: fonts.ui,
    fontSize: 8.5,
    lineHeight: 10,
    letterSpacing: trackMicro,
    marginTop: 2,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    minHeight: tap.min,
    paddingVertical: space.s2,
    // Aligned with the section label above it rather than with the rows'
    // photographs: this row is a label, not a thing to choose.
    paddingHorizontal: space.s4,
    borderBottomWidth: 1,
  },
  addLabel: {
    flex: 1,
    fontFamily: fonts.uiMedium,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
  addGlyph: {
    fontFamily: fonts.ui,
    fontSize: 15,
    lineHeight: 18,
    width: 12,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: space.s2,
    // Aligned with the labels rather than the rows' photographs, like `addRow`
    // above: a wrap of chips is a field, not a run of things to scroll past.
    paddingHorizontal: space.s4,
    paddingVertical: space.s3,
    borderBottomWidth: 1,
  },
  /** The stamped line a row carries, for somewhere already padded. */
  note: {
    fontFamily: fonts.ui,
    fontSize: type.micro.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
  },
});
