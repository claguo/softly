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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { Button } from "@/components/ui/app-button";
import {
  adjustRowCounter,
  getPatternPdf,
  getProjectIdsByPatternId,
  patternPdfDirectoryUri,
  useRowCountersForProjects,
  type RowCounterRow,
} from "@/data";
import { activeCounters } from "@/features/counters/counter";
import { CounterRow } from "@/features/counters/rows";
import { readId, readParam } from "@/features/detail/raw";
import { haptics } from "@/haptics";
import { fonts, radius, space, tap, trackSmall, type, useTheme } from "@/theme";

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
      onPress={() => {
        // `BackBar`'s control lifted out of the bar keeps `BackBar`'s tick.
        haptics.tap();
        router.back();
      }}
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

/**
 * The counters, floating over the foot of the page.
 *
 * This is the one place in the app where counting and reading happen at the
 * same time, which is the whole reason it is here: a knitter following a chart
 * has the pattern in front of them and the count in their head, and going back
 * to the project screen to move it means losing their place twice.
 *
 * It is painted, unlike the way out above it, and the reasoning that keeps
 * that one unpainted is what says so. Nothing is drawn behind `FloatingBack`
 * because the top of a page is the designer's margin and a fill there would
 * put the bar back a shade at a time. The foot of a page is not margin — it is
 * whatever the designer put there, a chart, a schematic, a block of small
 * type — and a number that cannot be read over it has failed at the one thing
 * it is for. So this takes paper and a hairline off the top of it, which is
 * the least that can be spent to make it legible on any page it lands on.
 *
 * Only counters still being worked appear. One that reaches its total leaves
 * the bar by itself, and a project whose counters are all done has no bar at
 * all — silence, the same as every other empty section in the app.
 *
 * **One at a time, swiped between.** They used to stack, which was honest and
 * cost the page a row of it for every counter on the project — three counters
 * and a sixth of the pattern is under the bar. So the bar is one row tall
 * whatever is in it and the others are a swipe sideways: the knitter is
 * already holding the phone in the hand they turn pages with, and a sleeve is
 * not being counted at the same instant as a body. It is deliberately not a
 * pair of arrows or a list that unfolds — either would be a control drawn on
 * top of a pattern, and the gesture is already there.
 */
function FloatingCounters({ counters }: { counters: readonly RowCounterRow[] }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  /**
   * A page is the window wide, and known before the first frame.
   *
   * The bar is pinned `left: 0, right: 0` with no padding of its own, so its
   * width *is* the window's and there is nothing to measure. That matters more
   * here than it usually would: a pager sized from `onLayout` spends its first
   * frame at whatever width its contents happen to want, and this one is drawn
   * over somebody's pattern where a frame of the wrong thing is a flinch.
   */
  const { width } = useWindowDimensions();

  const pager = useRef<ScrollView | null>(null);
  const [page, setPage] = useState(0);
  /**
   * Where the pager was left, kept beside the state rather than in it, so that
   * settling below can depend on the number of counters alone. In state it
   * would have to be a dependency, and the settle would re-fire on every swipe
   * and yank a scroll the knitter was still finishing.
   */
  const landed = useRef(0);

  const count = counters.length;

  const settle = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const span = event.nativeEvent.layoutMeasurement.width;

    if (span === 0) {
      return;
    }

    const at = Math.round(event.nativeEvent.contentOffset.x / span);
    landed.current = at;
    setPage(at);
  }, []);

  /**
   * The pages change underneath the pager, which is the whole difficulty.
   *
   * A counter reaching its total drops out of this list live — that is the
   * point of the list — and it can be the very one being looked at, moved by
   * the plus under the knitter's thumb. A scroll view holding an offset past
   * the end of its own content draws the blank there rather than refusing, so
   * the offset is brought back to the last real page by hand. It runs when the
   * pages grow too, where it changes nothing and costs a `scrollTo` to the
   * place the pager is already at: the alternative is telling the two cases
   * apart for no gain.
   */
  useEffect(() => {
    const at = count === 0 ? 0 : Math.min(landed.current, count - 1);

    landed.current = at;
    setPage(at);
    pager.current?.scrollTo({ x: at * width, animated: false });
  }, [count, width]);

  if (count === 0) {
    return null;
  }

  // The effect above lands here a frame later; clamping at draw time is what
  // keeps the dots from all going dark for that frame, and the count under
  // them from reading "3 of 2".
  const at = Math.min(page, count - 1);

  // No `onOpen` on either path: renaming a counter is not something anybody is
  // doing with a pattern open, and a sheet over the page would take the knitter
  // off it. The project screen is where a counter is edited.
  const draw = (counter: RowCounterRow) => (
    <CounterRow
      counter={counter}
      compact
      onAdjust={(delta) => adjustRowCounter(counter.id, delta)}
    />
  );

  return (
    <View
      style={[
        styles.counters,
        {
          backgroundColor: colors.paper,
          borderTopColor: colors.hairline,
          // The home indicator's strip, or a plain margin on a phone with no
          // indicator to clear — never nothing, or the steppers sit on the
          // very edge of the glass.
          paddingBottom: Math.max(insets.bottom, space.s2),
        },
      ]}
    >
      {count === 1 ? (
        // One counter is the ordinary case, and it is drawn the ordinary way:
        // no pager around it and no dots under it. A pager with one page is a
        // gesture that does nothing and a control that says nothing, and this
        // screen's whole argument is that chrome has to earn the page it
        // covers.
        draw(counters[0])
      ) : (
        <>
          <ScrollView
            ref={pager}
            horizontal
            pagingEnabled
            // A page is the window, so a swipe cannot land between two of them.
            // The lock is for the other axis: a thumb coming off a stepper at
            // an angle should not shear the bar sideways.
            directionalLockEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={settle}
          >
            {counters.map((counter) => (
              // The page, not the row: `CounterRow` sizes itself to the space
              // it is given, and this is what gives it exactly one screen of
              // it. The steppers inside keep their taps — a scroll view only
              // claims the gesture once it has travelled sideways, and a tap
              // never does.
              <View key={counter.id} style={{ width }}>
                {draw(counter)}
              </View>
            ))}
          </ScrollView>

          {/* Where the knitter is in their own counters.

              Dots, and the only round marks in the app besides `Badge`'s 5px
              status dot and the tab pill — this borrows that dot rather than
              inventing a shape, at the same size, so the exception stays the
              one exception. They take the hairline values instead of ink
              because they are chrome about chrome: the number above them is
              the thing being read, and a page indicator that competes with it
              has misunderstood which of the two is the pattern. */}
          <View
            style={styles.dots}
            accessible
            accessibilityLabel={`Counter ${at + 1} of ${count}`}
          >
            {counters.map((counter, index) => (
              <View
                key={counter.id}
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      index === at ? colors.ink2 : colors.hairlineStrong,
                  },
                ]}
              />
            ))}
          </View>
        </>
      )}
    </View>
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

  /**
   * Whose counters these are.
   *
   * This route is keyed by a pattern and counters hang off projects, so the
   * two have to be joined somewhere. Opened from a project that is already
   * settled — the project rides along in the params — and opened from the
   * pattern screen it is not, so the mirror is asked which projects were
   * knitted from this pattern. That is one project nearly always, two for
   * something somebody has made twice, and none for a pattern nobody has cast
   * on, which is a bar that never appears rather than a case to handle.
   */
  const projectId = readId(params.projectId);
  const projectIds = useMemo(() => {
    if (projectId !== null) {
      return [projectId];
    }
    return patternId === null ? [] : getProjectIdsByPatternId(patternId);
  }, [patternId, projectId]);

  // Live, and on the counters' own store rather than the table's change
  // events: a stepper tapped here has to move the number under the thumb that
  // tapped it, not an eighth of a second later. See `row-counters.ts`.
  const counters = useRowCountersForProjects(projectIds);
  const counting = useMemo(() => activeCounters(counters), [counters]);

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
          haptics.error();
          return;
        }

        await Sharing.shareAsync(pdf.filePath, {
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
          dialogTitle: title,
        });
      } catch {
        setProblem("Couldn't open the pattern.");
        haptics.error();
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

      {/* Last, so both land on top of the document rather than under it.

          The counters are drawn on Android too, over the hand-off rather than
          over a document — there is no document on this screen there. It is
          worth the room all the same: the pattern is being read in another app
          entirely, and this screen is the one the knitter comes back to, so
          the counters are the only thing on it worth coming back for. Nothing
          about the bar changes between the two, which is the point. */}
      {pdf === null ? null : <FloatingCounters counters={counting} />}
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
  counters: {
    // Against the foot of the window, out of the flow, so the document keeps
    // the full height and its last page runs on underneath — and out of the
    // flow is why the bottom inset is measured onto this element by hand,
    // exactly as `back` measures the top one. `left`/`right` at 0 with no
    // padding is also what makes a pager page the window wide with nothing to
    // measure; see the note in `FloatingCounters`. The gap is the one between
    // the counter and the dots under it.
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: space.s2,
    paddingTop: space.s2,
    borderTopWidth: 1,
  },
  dots: {
    flexDirection: "row",
    alignSelf: "center",
    // The dot's own width, so the run of them reads as a measure rather than
    // as a dotted line.
    gap: 5,
  },
  dot: {
    // `Badge`'s status dot exactly. See the note where these are drawn.
    width: 5,
    height: 5,
    borderRadius: radius.pill,
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
