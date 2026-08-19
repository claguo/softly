import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { fonts, space, tap, type, useTheme } from '@/theme';

export type TextFieldProps = {
  value: string;
  onChangeText: (value: string) => void;
  /**
   * Named for a screen reader. There is no placeholder: the visible label is
   * the section heading above the rule, and a label that vanishes as soon as
   * somebody types is not a label.
   */
  accessibilityLabel?: string;
  autoFocus?: boolean;
  editable?: boolean;
  returnKeyType?: 'done' | 'next';
  onSubmitEditing?: () => void;
  /**
   * `'display'` for the one field on a screen that is also that screen's
   * headline — the rest stay `'body'`, which is every field the app had before
   * this existed.
   */
  size?: 'body' | 'display';
};

/**
 * One line of writing: body type on paper, ruled underneath.
 *
 * The system draws no boxes — a box would be the only filled container on a
 * screen made of hairlines — so the field is the rule the text sits on, and
 * focus darkens that rule from `hairline` to `hairlineStrong` rather than
 * colouring it. The caret is brass because a caret is not a filled element;
 * the one brass thing on the screen is still the button.
 *
 * At `size="display"` it is the same field in the screen's display face, for
 * the case where what is being typed *is* the screen's headline and printing
 * that headline twice would be printing it twice. Only the type and the row
 * height change — same rule, same padding, same focus.
 */
export function TextField({
  value,
  onChangeText,
  accessibilityLabel,
  autoFocus = false,
  editable = true,
  returnKeyType,
  onSubmitEditing,
  size = 'body',
}: TextFieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      accessibilityLabel={accessibilityLabel}
      autoFocus={autoFocus}
      editable={editable}
      returnKeyType={returnKeyType}
      onSubmitEditing={onSubmitEditing}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      selectionColor={colors.brass}
      style={[
        styles.field,
        size === 'display' && styles.display,
        {
          color: colors.ink,
          borderBottomColor: focused ? colors.hairlineStrong : colors.hairline,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  field: {
    fontFamily: fonts.ui,
    // No `lineHeight`: on a `TextInput` it fights the platform's own vertical
    // centring, and the height below is what actually sets the row.
    fontSize: type.body.fontSize,
    minHeight: tap.min,
    paddingVertical: space.s2,
    borderBottomWidth: 1,
  },
  display: {
    // The screen-title size, in the display face, overriding the type above and
    // nothing else — still no `lineHeight`, for the reason given there. The row
    // has to grow with it: `tap.min` less the padding leaves 32pt of content
    // box, which a 28pt line can clip on Android, and `tap.lg` leaves 40.
    fontFamily: fonts.display,
    fontSize: 28,
    minHeight: tap.lg,
  },
});
