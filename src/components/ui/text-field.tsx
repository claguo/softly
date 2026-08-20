import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { fonts, radius, space, tap, type, useTheme } from '@/theme';

export type TextFieldProps = {
  value: string;
  onChangeText: (value: string) => void;
  /**
   * Named for a screen reader. There is no placeholder: the visible label is
   * the section heading above the box, and a label that vanishes as soon as
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
 * Writing on paper, body type, boxed in a hairline that grows to hold it.
 *
 * The box is an outline and never a fill — a filled container would be the one
 * solid thing on a screen made of hairlines, but an unfilled square is what
 * the chips and the secondary buttons already are, so the field now matches
 * the controls it has always sat beside. Focus darkens all four sides from
 * `hairline` to `hairlineStrong` rather than colouring them: the palette keeps
 * colour for state, and being typed into is not a state, it is where the
 * knitter is. Glyphs that once sat flush on a rule would now touch an edge, so
 * the row is inset `space.s3` on each side. The caret and the selection take
 * the link colour, not `ink`: the highlight is drawn behind the glyphs, so it
 * has to be a colour they can still be read on top of, and full-strength ink
 * behind ink is a black bar.
 *
 * A value too long for one line wraps and the box takes another line rather
 * than scrolling the writing off the side, because a colourway or a project
 * name is meant to be read whole; `tap.min` is only the floor. Return still
 * means done — `submitBehavior="blurAndSubmit"`, the current spelling of the
 * deprecated `blurOnSubmit` — since going multiline would otherwise hand the
 * key to the newline and the keyboard's own dismiss is how the knitter leaves.
 * A pasted newline is left alone: the field never makes one, so one that turns
 * up was meant, and it is there to be seen and deleted rather than quietly
 * rewritten.
 *
 * At `size="display"` it is the same field in the screen's display face, for
 * the case where what is being typed *is* the screen's headline and printing
 * that headline twice would be printing it twice. Only the type and the row
 * height change — same box, same inset, same focus.
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
      multiline
      submitBehavior="blurAndSubmit"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      selectionColor={colors.link}
      style={[
        styles.field,
        size === 'display' && styles.display,
        {
          color: colors.ink,
          borderColor: focused ? colors.hairlineStrong : colors.hairline,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  field: {
    fontFamily: fonts.ui,
    fontSize: type.body.fontSize,
    // The leading is set here now. It used to be left off, because on a
    // single-line input it fought the platform's own centring; a multiline one
    // does no centring — it stacks wrapped lines on this — and the arithmetic
    // is the point: 22 with 12 above, 12 below and the two hairlines is exactly
    // `tap.min`. One line fills the box rather than floating in it, so it sits
    // where it always sat, and there is no slack left for iOS to align to the
    // top of and Android to centre in. `textAlignVertical` pins Android to the
    // top too, for any box something ever makes taller than the text in it.
    lineHeight: type.body.lineHeight,
    textAlignVertical: 'top',
    minHeight: tap.min,
    paddingVertical: space.s3,
    paddingHorizontal: space.s3,
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  display: {
    // The screen-title size in the display face, with the leading opened to 32
    // the way every other display line in the app opens it: Yuji Mai clips at
    // `type.title`'s 30, and a headline free to wrap would clip on every line.
    // That line plus the padding and the hairlines comes to 58, so `tap.lg` is
    // a floor this row already clears — it stays as the floor all the same.
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 32,
    minHeight: tap.lg,
  },
});
