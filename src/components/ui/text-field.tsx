import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { fonts, space, tap, type, useTheme } from '@/theme';

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
   * `'number-pad'` for a box that only ever holds a whole number — a row
   * count, a total. It is the keyboard and not a validator: the digits are
   * easier to hit and a paste is still whatever was pasted, so whoever reads
   * the value still has to make sense of it. iOS draws that pad without a
   * return key, so a field set this way cannot rely on `returnKeyType` to get
   * the keyboard back down; the sheets dismiss it by being scrolled.
   */
  keyboardType?: 'default' | 'number-pad';
  /**
   * Left on everywhere, and turned off for the one kind of field whose
   * contents are names rather than words — a search over patterns and
   * designers, where "Malabrigo" and "Westknits" are exactly what a dictionary
   * would rather they weren't. On iOS `spellCheck` defaults to whatever this
   * is, so switching it off takes the red underlines with it and there is no
   * second prop to remember.
   */
  autoCorrect?: boolean;
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
 * The box takes the same `surface` fill the chips carry — the lightest value
 * in the palette, one step off the paper — so the field lifts away from the
 * sheet the way the chips beside it do rather than reading as a solid in some
 * other register. Focus darkens all four sides from `hairline` to
 * `hairlineStrong` rather than colouring them: the palette keeps colour for
 * state, and being typed into is not a state, it is where the knitter is.
 * Glyphs that once sat flush on a rule would now touch an edge, so the row is
 * inset `space.s3` on each side. The caret and the selection take the link
 * colour, not `ink`: the highlight is drawn behind the glyphs, so it has to be
 * a colour they can still be read on top of, and full-strength ink behind ink
 * is a black bar.
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
  keyboardType = 'default',
  autoCorrect = true,
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
      keyboardType={keyboardType}
      autoCorrect={autoCorrect}
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
          backgroundColor: colors.surface,
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
    // Deliberately not `radius.sm`. That token is 0 and stays 0 — the chips,
    // the buttons, the badges and the switch are square and are meant to be —
    // so the rounding a box that is written into wants is written here, on the
    // one box that wants it.
    borderRadius: 16,
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
