/**
 * Add a row counter — the second thing this app writes down for itself.
 *
 * Ravelry keeps no counters. A project there has a status, its yarn, its
 * needles and the knitter's notes, and nothing anywhere in it that says which
 * row somebody is on, so a count has nowhere to be but the phone. That puts
 * this sheet beside Add a needle rather than beside Cast on: the same shell,
 * the same one action at the bottom, and no network in it at all.
 *
 * Every field is optional, which is the one real difference. A needle has to
 * have a size or it can never go on a project; a counter has to have nothing —
 * "Rows: 0" is a perfectly good counter and is what a knitter reaching for one
 * halfway up a sleeve actually wants. So the action is never disabled for want
 * of an answer, and the three boxes are three ways of being more specific than
 * that if there is time to be:
 *
 * - **Name**, free text. Blank reads as "Rows" everywhere it is drawn.
 * - **Stitch**, either one of nine chips or one typed by hand, never both —
 *   the two clear each other, because a counter carries one label.
 * - **Total rows**, what the pattern says. Anything that is not a whole number
 *   of rows quietly does not become one; see `readRowTotal`.
 */

import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BackBar } from "@/components/back-bar";
import { Button } from "@/components/ui/app-button";
import { FilterChip } from "@/components/ui/filter-chip";
import { TextField } from "@/components/ui/text-field";
import { insertRowCounter } from "@/data";
import { readRowTotal, STITCH_TYPES } from "@/features/counters/counter";
import { readId } from "@/features/detail/raw";
import { haptics } from "@/haptics";
import { fonts, space, trackSmall, type, useTheme } from "@/theme";

export default function AddRowCounterScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // Untyped, like the reader and Cast on: the project rides along beside
  // nothing else, because this route has no param of its own.
  const params = useLocalSearchParams();

  const projectId = readId(params.projectId);

  const [name, setName] = useState("");
  const [stitchKey, setStitchKey] = useState<string | null>(null);
  const [stitchOwn, setStitchOwn] = useState("");
  const [total, setTotal] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  // The two halves of one answer, so choosing from the rail and typing into the
  // box put out each other's light rather than leaving a counter with two
  // stitches on it. Tapping the chosen chip again clears it, the same way the
  // size chips on Add a needle do.
  const chooseStitch = useCallback((key: string) => {
    setStitchKey((current) => (current === key ? null : key));
    setStitchOwn("");
  }, []);

  const typeStitch = useCallback((typed: string) => {
    setStitchOwn(typed);
    setStitchKey(null);
  }, []);

  const addCounter = useCallback(() => {
    if (saving || projectId === null) {
      return;
    }

    setFailed(false);
    setSaving(true);

    try {
      // The chip's key is its label already lowercased, which is the form a
      // stitch is stored in — the rows that draw it read it out as written,
      // and "Body · stockinette" is how a knitter says it. Anything typed is
      // stored as typed: those are the knitter's own words.
      const own = stitchOwn.trim();

      insertRowCounter(projectId, {
        name,
        stitchType: own === "" ? stitchKey : own,
        maxRows: readRowTotal(total),
      });

      haptics.success();
      router.back();
    } catch {
      setFailed(true);
      haptics.error();
    } finally {
      setSaving(false);
    }
  }, [projectId, name, saving, stitchKey, stitchOwn, total]);

  return (
    // No `SafeAreaView` top edge, for the same reason as the needle sheets: on
    // iOS this route is presented as a sheet and is already inset. Android
    // presents it full-bleed, so it does need the inset.
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.paper,
          paddingTop: Platform.OS === "android" ? insets.top : 0,
        },
      ]}
    >
      <BackBar title="Add a counter" />

      {projectId === null ? (
        <Text style={[styles.stamp, styles.missing, { color: colors.ink2 }]}>
          Project unavailable.
        </Text>
      ) : (
        <KeyboardAvoidingView
          style={styles.screen}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={styles.content}
          >
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>Name</Text>
              <TextField
                value={name}
                onChangeText={setName}
                accessibilityLabel="Counter name"
                editable={!saving}
                returnKeyType="done"
              />
            </View>

            <View style={styles.stack}>
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>
                  Stitch
                </Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.rail}
              >
                {STITCH_TYPES.map((option) => (
                  <FilterChip
                    key={option.key}
                    flush
                    label={option.label}
                    active={stitchKey === option.key}
                    onPress={() => chooseStitch(option.key)}
                  />
                ))}
              </ScrollView>
              {/* No second label over this box: it is the last chip on the
                  rail, said in the knitter's own words rather than ours. */}
              <View style={styles.field}>
                <TextField
                  value={stitchOwn}
                  onChangeText={typeStitch}
                  accessibilityLabel="Stitch of your own"
                  editable={!saving}
                  returnKeyType="done"
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>
                Total rows
              </Text>
              <TextField
                value={total}
                onChangeText={setTotal}
                accessibilityLabel="Total rows"
                keyboardType="number-pad"
                editable={!saving}
              />
            </View>
          </ScrollView>

          <View
            style={[
              styles.footer,
              {
                backgroundColor: colors.paper,
                borderTopColor: colors.hairline,
                paddingBottom: space.s4 + insets.bottom,
              },
            ]}
          >
            {/* The same ladder as the needle sheet, and the same honesty about
                it: this write is a row into SQLite on this device, so "Adding…"
                is a line that will almost never be seen and a failure means the
                database itself is in trouble. Both are drawn anyway. */}
            {saving ? (
              <Text style={[styles.stamp, { color: colors.ink2 }]}>Adding…</Text>
            ) : failed ? (
              <Text style={[styles.stamp, { color: colors.mustard }]}>
                Couldn&apos;t add the counter.
              </Text>
            ) : null}

            {/* The one action on this screen, and never disabled for want of an
                answer: an unnamed counter with no stitch and no total is the
                normal one. */}
            <Button
              variant="primary"
              size="lg"
              full
              disabled={saving}
              onPress={addCounter}
            >
              Add counter
            </Button>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    // The needle sheets' measurements to the last one: this is that form with
    // different words in it, and the three of them opening differently would
    // say they were three different kinds of thing.
    gap: space.s8,
    paddingTop: space.s3,
    paddingBottom: space.s6,
  },
  fieldLabel: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
  },
  // One thing the sheet asks for: its label and the control under it.
  field: {
    paddingHorizontal: space.s4,
    gap: space.s2,
  },
  // Like `field`, but for the block whose rail has to reach both edges, so the
  // inset moves off the block and onto the label and the box inside it.
  stack: { gap: space.s3 },
  rail: {
    // 17 rather than 16: every chip is `flush`, which pulls it 1px left to
    // share its neighbour's border, and the first chip has no neighbour.
    paddingLeft: space.s4 + 1,
    paddingRight: space.s4,
  },
  footer: {
    paddingTop: space.s4,
    paddingHorizontal: space.s4,
    gap: space.s3,
    borderTopWidth: 1,
  },
  stamp: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
    textAlign: "center",
  },
  /** The one line a sheet with nothing to write to says, held off the bar. */
  missing: {
    paddingTop: space.s10,
    paddingHorizontal: space.s4,
  },
});
