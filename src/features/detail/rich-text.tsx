/**
 * Notes, drawn.
 *
 * `notes.ts` turns Ravelry's notes into blocks and runs; this decides what a
 * block looks like in Soft Goods. Nothing here parses and nothing there styles,
 * which is why the parser can be run against real API payloads in a bare Node
 * script.
 *
 * Two decisions worth stating out loud, because the design has no room for the
 * usual answers:
 *
 * **Emphasis is tone first, weight second.** Shippori Mincho has no italic, so
 * `<em>` cannot lean — a synthetic oblique would be the only skewed type in the
 * app. The system's primary emphasis device is therefore tone: `ink3` → `ink2`
 * → `ink` is how BackBar and the project screen's pattern line already mark
 * "this one matters". Notes read at `ink2`, so emphasis steps to `ink` — a
 * real, legible difference drawn with the system's own vocabulary. The font
 * slots named at the call sites (`uiSemiBold`, `uiMedium`) resolve to genuine
 * cuts of the family, so that tone step now carries a weight step with it.
 *
 * **Links are brass.** The one brass thing on a screen is its action, and the
 * project screen deliberately keeps its in-app pattern link in ink for exactly
 * that reason — following a route is not an action. A link in a note is a
 * different animal: it leaves the app entirely, and the handoff's stylesheet
 * paints links brass. No underline at rest; the press affordance is `Text`'s
 * own highlight, the same "colour dips on press" language the rest of the
 * chrome uses.
 */

import * as WebBrowser from "expo-web-browser";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { parseNotes, type NoteBlock, type NoteRun } from "@/features/detail/notes";
import { fonts, space, type, useTheme, type Palette } from "@/theme";

export { hasNotes } from "@/features/detail/notes";

export type RichTextProps = {
  /** Ravelry's own render of the notes. Preferred whenever it carries prose. */
  readonly html?: string | null;
  /** The markdown a knitter typed, read when there is no rendered twin. */
  readonly markdown?: string | null;
};

/**
 * A note's link opens in the in-app browser rather than leaving for Safari:
 * a designer's tutorial is part of reading the pattern, and coming back should
 * be one tap. A browser that refuses to open is not worth an alert.
 */
function open(url: string): void {
  void WebBrowser.openBrowserAsync(url).catch(() => undefined);
}

/**
 * The air above a block. Real margin on a real View, so a paragraph break is
 * spacing rather than two newlines pretending to be spacing.
 */
function gapBefore(kind: NoteBlock["kind"], previous: NoteBlock | undefined): number {
  if (previous === undefined) {
    return 0;
  }
  if (kind === "heading") {
    return space.s5;
  }
  if (kind === "item") {
    // Items belong to each other; the first one belongs to the line above it.
    return previous.kind === "item" ? space.s1 : space.s2;
  }
  return space.s3;
}

/**
 * The runs of one block as nested `Text`. A link is a `Text` with `onPress` —
 * which is how an inline tap target works, since a Pressable inside a
 * paragraph would break the line box.
 */
function runNodes(runs: readonly NoteRun[], colors: Palette, base: string): ReactNode[] {
  return runs.map((run, index) => {
    const emphasised = run.strong || run.em;
    const face = run.strong ? styles.strong : run.em ? styles.em : styles.plain;
    const href = run.href;

    if (href === null) {
      return (
        <Text key={index} style={[face, { color: emphasised ? colors.ink : base }]}>
          {run.text}
        </Text>
      );
    }

    return (
      <Text
        key={index}
        accessibilityRole="link"
        accessibilityHint="Opens in a browser"
        onPress={() => open(href)}
        style={[face, { color: colors.brass }]}
      >
        {run.text}
      </Text>
    );
  });
}

/** Notes as formatted text: paragraphs, lists, headings, rules and links. */
export function RichText({ html, markdown }: RichTextProps) {
  const { colors } = useTheme();
  const blocks = parseNotes(html, markdown);

  if (blocks.length === 0) {
    return null;
  }

  return (
    <View>
      {blocks.map((block, index) => {
        const marginTop = gapBefore(block.kind, blocks[index - 1]);

        if (block.kind === "rule") {
          return (
            <View
              key={index}
              style={[styles.rule, { marginTop, borderTopColor: colors.hairline }]}
            />
          );
        }

        if (block.kind === "item") {
          return (
            <View key={index} style={[styles.item, { marginTop }]}>
              <Text style={[styles.body, styles.marker, { color: colors.ink3 }]}>
                {block.marker}
              </Text>
              <Text style={[styles.body, styles.itemBody]}>
                {runNodes(block.runs, colors, colors.ink2)}
              </Text>
            </View>
          );
        }

        if (block.kind === "quote") {
          return (
            <View
              key={index}
              style={[styles.quote, { marginTop, borderLeftColor: colors.hairline }]}
            >
              <Text style={styles.body}>{runNodes(block.runs, colors, colors.ink3)}</Text>
            </View>
          );
        }

        const heading = block.kind === "heading";
        return (
          <Text key={index} style={[heading ? styles.heading : styles.body, { marginTop }]}>
            {runNodes(block.runs, colors, heading ? colors.ink : colors.ink2)}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    fontFamily: fonts.ui,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
  heading: {
    // A heading inside notes is the card-name size, never the screen title's:
    // the screen already has one, and this is a paragraph's landlord. Sentence
    // case as written by the designer — nothing here upper-cases anything.
    fontFamily: fonts.ui,
    fontSize: type.heading.fontSize,
    lineHeight: type.heading.lineHeight,
  },
  // Nested `Text` inherits size, leading and colour, so a run only says what
  // differs from the block around it.
  plain: { fontFamily: fonts.ui },
  strong: { fontFamily: fonts.uiSemiBold },
  em: { fontFamily: fonts.uiMedium },
  item: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  marker: {
    // A true hanging indent: the marker holds its own column, so the second
    // line of an item lands under the first word rather than under the bullet.
    minWidth: 16,
    paddingRight: space.s2,
  },
  itemBody: { flex: 1 },
  quote: {
    paddingLeft: space.s3,
    // A hairline, like every other division in the app — no tint, no shadow.
    borderLeftWidth: 1,
  },
  rule: {
    // A hairline with no height of its own: the block below brings its own
    // margin, so the line sits evenly between the two.
    alignSelf: "stretch",
    borderTopWidth: 1,
  },
});
