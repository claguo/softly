/**
 * The pattern, as the designer wrote it.
 *
 * This screen is the payoff for everything in `pdfs.ts`: a file already on the
 * phone, opened with no network at all. It reads the row rather than being
 * handed a path, so a link that outlives the download lands on one honest line
 * instead of a blank page.
 *
 * Two platforms, two answers. iOS renders a PDF in a `WebView` natively, so
 * that is the whole screen — chrome is one back bar and the pattern's name,
 * and everything below it is the document. Android's WebView cannot render a
 * PDF at all; rather than show a blank page or ship a JavaScript renderer, it
 * hands the file to whatever app the knitter already reads PDFs in. That is
 * the minimum honest thing, and it is deliberately all this screen does there.
 *
 * The `WebView` is told it may read the PDF directory and nothing else, and
 * only `file://` counts as somewhere it may go: a link inside a pattern opens
 * in the system browser instead of quietly turning the reader into one.
 */

import * as Sharing from "expo-sharing";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { BackBar } from "@/components/back-bar";
import { Button } from "@/components/ui/app-button";
import { getPatternPdf, patternPdfDirectoryUri } from "@/data";
import { readId, readParam } from "@/features/detail/raw";
import { fonts, space, trackMicro, type, useTheme } from "@/theme";

export default function PatternPdfScreen() {
  const { colors } = useTheme();
  // Untyped, like Start project: the name rides along beside the route's own
  // param so the title is right on the first frame rather than after a lookup.
  const params = useLocalSearchParams();

  const patternId = readId(params.patternId);
  const pdf = useMemo(
    () => (patternId === null ? null : getPatternPdf(patternId)),
    [patternId],
  );

  const title = readParam(params.name) ?? pdf?.filename ?? "Pattern";
  const directory = useMemo(() => patternPdfDirectoryUri(), []);

  const [problem, setProblem] = useState<string | null>(null);

  /** Android only — see the note at the top of the file. */
  const openElsewhere = useCallback(() => {
    if (pdf === null) {
      return;
    }

    setProblem(null);

    void (async () => {
      try {
        if (!(await Sharing.isAvailableAsync())) {
          setProblem("No app on this phone can open a PDF.");
          return;
        }

        await Sharing.shareAsync(pdf.filePath, {
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
          dialogTitle: title,
        });
      } catch {
        setProblem("Couldn't open the pattern.");
      }
    })();
  }, [pdf, title]);

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.screen, { backgroundColor: colors.paper }]}
    >
      <BackBar />

      <View style={[styles.title, { borderBottomColor: colors.hairline }]}>
        <Text numberOfLines={1} style={[styles.name, { color: colors.ink }]}>
          {title}
        </Text>
      </View>

      {pdf === null ? (
        <Text style={[styles.stamp, { color: colors.ink3 }]}>
          Pattern not downloaded.
        </Text>
      ) : Platform.OS === "android" ? (
        <View style={styles.handoff}>
          <Text style={[styles.stamp, { color: colors.ink3 }]}>
            Saved on this phone.
          </Text>

          {problem === null ? null : (
            <Text style={[styles.stamp, { color: colors.clay }]}>{problem}</Text>
          )}

          <Button
            variant="quiet"
            size="sm"
            accessibilityLabel={`Open ${title} in another app`}
            onPress={openElsewhere}
          >
            Open in another app
          </Button>
        </View>
      ) : (
        <WebView
          source={{ uri: pdf.filePath }}
          // WKWebView refuses a `file://` document unless it is told which
          // directory it may read; the PDF folder, and nothing above it.
          allowingReadAccessToURL={directory}
          originWhitelist={["file://*"]}
          style={[styles.document, { backgroundColor: colors.paper }]}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  title: {
    paddingHorizontal: space.s4,
    paddingVertical: space.s3,
    borderBottomWidth: 1,
  },
  name: {
    // Display, but at the bottom of its range: the document under it is what
    // the screen is for, and this is a label on the way in.
    fontFamily: fonts.display,
    fontSize: 20,
    lineHeight: 26,
  },
  document: { flex: 1 },
  handoff: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.s3,
    paddingHorizontal: space.s4,
  },
  stamp: {
    fontFamily: fonts.ui,
    fontSize: type.micro.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
    textAlign: "center",
  },
});
