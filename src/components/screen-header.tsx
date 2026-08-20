import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts, space, tap, trackMicro, type, useTheme } from '@/theme';

export type ScreenHeaderProps = {
  /** Screen title, set in the display serif. */
  title: string;
  /** Stamped count beside the title, e.g. "6 active". */
  count?: string | number;
  /** The one text action for the screen, right-aligned and set in the link colour. */
  action?: string;
  onAction?: () => void;
};

/**
 * The one place per screen where the brand voice speaks: a serif title, a
 * stamped count, one text action, a hairline underneath. There is deliberately
 * no sub-line — the design contract does not have the prop.
 *
 * The action is words and nothing else, so it is coloured as a link rather than
 * drawn as a filled control; the filled one belongs to the content below.
 */
export function ScreenHeader({ title, count, action, onAction }: ScreenHeaderProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.header,
        { backgroundColor: colors.paper, borderBottomColor: colors.hairline },
      ]}>
      <View style={styles.titleGroup}>
        <Text numberOfLines={1} style={[styles.title, { color: colors.ink }]}>
          {title}
        </Text>
        {count !== undefined && count !== null ? (
          <Text style={[styles.count, { color: colors.ink2 }]}>{count}</Text>
        ) : null}
      </View>

      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action}
          onPress={onAction}
          style={styles.action}>
          {({ pressed }) => (
            <Text
              style={[styles.actionLabel, { color: pressed ? colors.linkPressed : colors.link }]}>
              {action}
            </Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: space.s5,
    paddingHorizontal: space.s4,
    paddingBottom: space.s3,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.s3,
    borderBottomWidth: 1,
  },
  titleGroup: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  title: {
    flexShrink: 1,
    fontFamily: fonts.display,
    fontSize: type.title.fontSize,
    lineHeight: type.title.lineHeight,
  },
  count: {
    fontFamily: fonts.ui,
    fontSize: type.micro.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
  },
  action: {
    // A real 48pt touch box, pulled back into the header's own padding so the
    // hit area is honest without inflating the header past the design's height.
    minHeight: tap.min,
    justifyContent: 'center',
    marginVertical: -space.s2,
    paddingLeft: space.s3,
  },
  actionLabel: {
    // Stamped, per the handoff: the label face at micro size with micro
    // tracking — no weight bump, sentence case.
    fontFamily: fonts.ui,
    fontSize: type.micro.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
  },
});
