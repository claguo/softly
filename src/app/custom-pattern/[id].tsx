/**
 * One pattern that is not on Ravelry.
 *
 * `pattern/[id]` with everything Ravelry does taken out of it. There is no
 * photograph, no bookmark, no library, no price and no designer page — the
 * whole record is what a knitter typed into `add-pattern`, so the screen is
 * that record read back, and only the boxes they actually filled in.
 *
 * Two things it still has, and they are the reasons it exists rather than the
 * shelf row being the whole of it:
 *
 * - **It says so.** A badge under the name, in the plainest words there are.
 *   Everything in this app that came out of Ravelry can be looked up, searched
 *   for, cast on from a search result; this cannot, and a knitter wondering why
 *   deserves the answer on the screen rather than by inference.
 * - **The PDF.** Exactly the block `pattern/[id]` has, minus the half of it
 *   that asks Ravelry for a file — there is no download to offer here, because
 *   there is nothing to download from. What is left is the import, and it is
 *   the same import: the file is copied into the same folder under the same
 *   name and read by the same viewer, because a negative pattern id is a
 *   perfectly good filename and nothing downstream ever cared where the row
 *   came from.
 */

import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { BackBar } from "@/components/back-bar";
import { Button } from "@/components/ui/app-button";
import { Badge } from "@/components/ui/badge";
import { Stamp } from "@/components/ui/stamp";
import {
  deletePatternPdf,
  importPatternPdf,
  useCustomPattern,
  usePatternPdf,
  type ImportProblem,
} from "@/data";
import { choosePdf } from "@/features/detail/pick-pdf";
import { readId } from "@/features/detail/raw";
import { haptics } from "@/haptics";
import { fonts, space, trackSmall, type, useTheme } from "@/theme";

/**
 * One quiet line per way an import can not happen — the same two
 * `pattern/[id]` has, for the same reason: an import touches nothing but the
 * filesystem, so there is no library to be outside of and no network to be off.
 * `notAPdf` is the one the knitter can act on, so it says what is actually
 * wrong rather than being folded into "couldn't".
 */
const IMPORT_NOTICES: Record<ImportProblem, string> = {
  notAPdf: "That file isn't a PDF.",
  failed: "Couldn't import that file.",
};

export default function CustomPatternScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { id: param } = useLocalSearchParams<"/custom-pattern/[id]">();

  const id = readId(param);
  // Live, because the edit sheet dismisses onto this screen without it ever
  // unmounting — a read memoised on the id would still be drawing the old name.
  const row = useCustomPattern(id);
  // And live for the other half: importing a file has to change this block
  // under the finger that asked for it.
  const pdf = usePatternPdf(id);

  const [importing, setImporting] = useState(false);
  const [problem, setProblem] = useState<ImportProblem | null>(null);

  const name = row?.name ?? "Pattern";

  const edit = useCallback(() => {
    if (id === null) {
      return;
    }
    router.push({ pathname: "/edit-pattern", params: { id: String(id) } });
  }, [id]);

  const openPdf = useCallback(() => {
    if (id === null) {
      return;
    }
    router.push({ pathname: "/pdf/[patternId]", params: { patternId: id, name } });
  }, [id, name]);

  /**
   * The knitter's own copy of the file.
   *
   * Needs no session and no library, the same as the import on the pattern
   * screen — and here it is the only way in there has ever been. Backing out of
   * the picker is the commonest outcome by far and is completely silent:
   * nothing was attempted, so there is nothing to report.
   */
  const importPdf = useCallback(() => {
    if (id === null || importing) {
      return;
    }

    setImporting(true);
    setProblem(null);

    void (async () => {
      // Both of these report through their answers rather than throwing.
      const picked = await choosePdf();

      if (picked.kind !== "picked") {
        setImporting(false);
        // A picker that would not open is the one thing here worth a line —
        // and worth a buzz; a knitter who changed their mind is neither.
        if (picked.kind === "unavailable") {
          setProblem("failed");
          haptics.error();
        }
        return;
      }

      const outcome = await importPatternPdf(id, picked.file);
      setImporting(false);

      if (outcome.ok) {
        haptics.success();
      } else {
        setProblem(outcome.reason);
        haptics.error();
      }
    })();
  }, [id, importing]);

  const removeDownload = useCallback(() => {
    if (id === null) {
      return;
    }

    deletePatternPdf(id);
    // Nothing asked first, and this copy is one only the knitter can replace —
    // so the file going is said once, after it has gone.
    haptics.warning();
    setProblem(null);
  }, [id]);

  // The boxes that were actually filled in. Ravelry's own detail screen draws
  // only the fields its payload carried, and this is the same rule over a
  // record where nearly every field is allowed to be blank.
  const facts =
    row === null
      ? []
      : [
          { label: "from", value: row.sourceName },
          { label: "yardage", value: row.yardage },
          { label: "needles", value: row.needleSizes },
          { label: "gauge", value: row.gauge },
        ].filter(
          (fact): fact is { label: string; value: string } => fact.value !== null,
        );

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.screen, { backgroundColor: colors.paper }]}
    >
      {/* No title on the bar: the name is a display line down in the content,
          and this app never prints it in both places. See `BackBar`. */}
      <BackBar
        action={row === null ? undefined : "Edit"}
        onAction={edit}
      />

      {row === null ? (
        <Text style={[styles.stamp, { color: colors.ink2 }]}>
          Pattern unavailable.
        </Text>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: space.s10 + insets.bottom }}
        >
          <View style={styles.block}>
            <Text style={[styles.title, { color: colors.ink }]}>{row.name}</Text>

            {row.designer === null ? null : (
              <Text style={[styles.designer, { color: colors.ink2 }]}>
                {row.designer}
              </Text>
            )}

            {/* Neutral, not attention: this is a fact about where the pattern
                came from, and nothing about it needs seeing to. */}
            <View style={styles.marks}>
              <Badge tone="neutral">not on Ravelry</Badge>
            </View>
          </View>

          {facts.length === 0 ? null : (
            <View
              style={[
                styles.block,
                styles.ruled,
                { borderTopColor: colors.hairline },
              ]}
            >
              <View style={styles.facts}>
                {facts.map((fact) => (
                  <Stamp key={fact.label} label={fact.label}>
                    {fact.value}
                  </Stamp>
                ))}
              </View>
            </View>
          )}

          {row.notes === null ? null : (
            <View
              style={[
                styles.block,
                styles.ruled,
                { borderTopColor: colors.hairline },
              ]}
            >
              <Text style={[styles.sectionLabel, { color: colors.ink2 }]}>
                Notes
              </Text>
              {/* Drawn as typed. There is no `notes.ts` pass here: Ravelry's
                  notes are formatted text off a website, and these are what
                  somebody wrote in a box on this phone. */}
              <Text style={[styles.notes, { color: colors.ink }]}>
                {row.notes}
              </Text>
            </View>
          )}

          <View
            style={[
              styles.block,
              styles.ruled,
              { borderTopColor: colors.hairline },
            ]}
          >
            <Text style={[styles.sectionLabel, { color: colors.ink2 }]}>
              Pattern
            </Text>

            {pdf === null ? (
              <Text style={[styles.notice, { color: colors.ink2 }]}>
                No PDF on this one yet.
              </Text>
            ) : (
              // Spruce, and the same words the pattern screen uses for a file
              // the knitter brought: every copy here is an imported one.
              <Text style={[styles.notice, { color: colors.spruce }]}>
                Imported · available offline
              </Text>
            )}

            {importing ? (
              <Text style={[styles.notice, { color: colors.ink2 }]}>
                Importing…
              </Text>
            ) : problem === null ? null : (
              <Text style={[styles.notice, { color: colors.mustard }]}>
                {IMPORT_NOTICES[problem]}
              </Text>
            )}

            <View style={styles.actions}>
              {pdf === null ? (
                <Button
                  variant="quiet"
                  size="sm"
                  disabled={importing}
                  accessibilityLabel={`Import a PDF for ${row.name}`}
                  onPress={importPdf}
                >
                  Import a PDF
                </Button>
              ) : (
                <>
                  <Button
                    variant="quiet"
                    size="sm"
                    accessibilityLabel={`Open the PDF for ${row.name}`}
                    onPress={openPdf}
                  >
                    Open pattern
                  </Button>
                  {/* Ghost rather than quiet: throwing the copy away is the
                      least likely thing anybody came here to do. */}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={importing}
                    accessibilityLabel={`Remove the PDF for ${row.name}`}
                    onPress={removeDownload}
                  >
                    Remove download
                  </Button>
                </>
              )}
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  block: {
    paddingHorizontal: space.s4,
    paddingVertical: space.s5,
    gap: space.s2,
  },
  ruled: { borderTopWidth: 1 },
  title: {
    // 28, the screen-title size, leading opened past `type.title`'s 30 the way
    // every other display line in the app opens it — Yuji Mai clips at that
    // tightness, and a pattern name is free to wrap.
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 32,
  },
  designer: {
    fontFamily: fonts.ui,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
  marks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  facts: {
    // A column rather than the wrapping row the needle screen uses: those are
    // measurements off a table and these are sentences somebody typed, and a
    // gauge that reads "22 sts x 30 rows over 4 in in stockinette" has nowhere
    // to go beside three others.
    gap: space.s3,
  },
  sectionLabel: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
  },
  notice: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
  },
  notes: {
    fontFamily: fonts.ui,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.s2,
    // The quiet buttons carry their own horizontal padding, so the first one
    // would otherwise start 12pt inside the block's own inset and sit off the
    // line every other line of text in the block is ranged on.
    marginLeft: -12,
    marginTop: 2,
  },
  stamp: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
    textAlign: "center",
    paddingTop: space.s10,
    paddingHorizontal: space.s4,
  },
});
