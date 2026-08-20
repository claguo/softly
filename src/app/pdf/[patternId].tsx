/**
 * The pattern, as the designer wrote it.
 *
 * This screen is the payoff for everything in `pdfs.ts`: a file already on the
 * phone, opened with no network at all. It reads the row rather than being
 * handed a path, so a link that outlives the download lands on one honest line
 * instead of a blank page.
 *
 * Two platforms, two answers. iOS renders a PDF in a `WebView` natively, so
 * that is the whole screen — the document runs top to bottom and the only
 * chrome left is the way out of it, floating clear of the page: the knitter
 * came here to read the pattern, not to be told again which one they opened.
 * Android's WebView cannot render a PDF at all; rather than show a blank page
 * or ship a JavaScript renderer, it hands the file to whatever app the knitter
 * already reads PDFs in. That is the minimum honest thing, and it is
 * deliberately all this screen does there.
 *
 * The `WebView` is told it may read the PDF directory and nothing else, and
 * only `file://` counts as somewhere it may go: a link inside a pattern opens
 * in the system browser instead of quietly turning the reader into one.
 */

import * as Sharing from "expo-sharing";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { Button } from "@/components/ui/app-button";
import { getPatternPdf, patternPdfDirectoryUri } from "@/data";
import { readId, readParam } from "@/features/detail/raw";
import { fonts, space, tap, trackSmall, type, useTheme } from "@/theme";

/**
 * The way back, with no bar under it.
 *
 * `BackBar`'s control exactly — same stamped label, same ink, same honest 48pt
 * box — lifted out of the bar and left in the corner. A bar here would spend a
 * strip of the screen repeating a name the knitter tapped a moment ago, so the
 * document takes the whole height instead and this floats over its first page.
 * Nothing is painted behind it either: the top of a page is the designer's
 * margin, and a fill or a scrim would only put the bar back a shade at a time.
 */
function FloatingBack() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={() => router.back()}
      style={[styles.back, { top: insets.top }]}
    >
      {({ pressed }) => (
        <Text style={[styles.backLabel, { color: pressed ? colors.ink : colors.ink2 }]}>
          ‹ Back
        </Text>
      )}
    </Pressable>
  );
}

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
      {pdf === null ? (
        <View style={styles.missing}>
          <Text style={[styles.stamp, { color: colors.ink2 }]}>
            Pattern not downloaded.
          </Text>
        </View>
      ) : Platform.OS === "android" ? (
        <View style={styles.handoff}>
          <Text style={[styles.stamp, { color: colors.ink2 }]}>
            Saved on this phone.
          </Text>

          {problem === null ? null : (
            <Text style={[styles.stamp, { color: colors.mustard }]}>{problem}</Text>
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

      {/* Last, so it lands on top of the document rather than under it. */}
      <FloatingBack />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  document: { flex: 1 },
  back: {
    // Against the top-left of the safe area, out of the flow, so the document
    // keeps the full height and its first page runs on underneath — and being
    // out of the flow is why `top` is measured onto this element by hand
    // instead of left at 0: the container's padding insets the children still
    // in the flow, and this is not one of them, so 0 here is the window's edge
    // and the clock. `BackBar`'s 48pt box comes along: padded left to the
    // screen edge so the corner itself is tappable, and past the label on the
    // right, which is the side the thumb arrives from.
    position: "absolute",
    left: 0,
    minHeight: tap.min,
    justifyContent: "center",
    paddingLeft: space.s4,
    paddingRight: space.s3,
  },
  backLabel: {
    // Stamped, like every other label in the chrome; floating changes where it
    // sits, not what it is.
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
  },
  missing: {
    // A bar used to hold this line down off the top of the screen. With the
    // chrome floating there is nothing above it, so the line centres itself on
    // the empty screen the way the handoff does — and well clear of the corner
    // the way back is sitting in.
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.s4,
  },
  handoff: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.s3,
    paddingHorizontal: space.s4,
  },
  stamp: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
    textAlign: "center",
  },
});
