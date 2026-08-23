/**
 * Edit a row counter — `add-row-counter` with the boxes already full, and two
 * more things to do.
 *
 * The same three optional facts, the same rail of stitches, the same one action
 * at the bottom. What is its own is underneath them:
 *
 * - **Reset count**, because a counter is reused. The second sleeve is the
 *   first sleeve's counter wound back, not a new row in the table, and the
 *   name and the total the knitter typed are still right.
 * - **Delete**, for a counter that was a mistake or is finished with.
 *
 * Neither is coloured. This app has no destructive tone — colour means state
 * here and nothing else — so the way it says "least likely thing anybody came
 * here to do" is the ghost button, the same one the pattern screen throws a
 * downloaded PDF away with. Both sit well below the boxes and well away from
 * the action, which is the other half of saying it.
 *
 * Both also leave the sheet, and neither carries the boxes with it: they are
 * answers to a different question than the one the fields are asking, and
 * there is nowhere on a form for a count to be shown changing. The screen
 * underneath redraws before the sheet is off it — `row-counters.ts` notifies
 * its subscribers synchronously, which is the whole reason it keeps a store.
 *
 * Nothing here leaves the device. Ravelry has no counters to be told about.
 */

import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
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
import {
  deleteRowCounter,
  getRowCounter,
  resetRowCounter,
  updateRowCounter,
} from "@/data";
import { readRowTotal, STITCH_TYPES } from "@/features/counters/counter";
import { readId } from "@/features/detail/raw";
import { haptics } from "@/haptics";
import { fonts, space, trackSmall, type, useTheme } from "@/theme";

export default function EditRowCounterScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();

  const id = readId(params.id);
  // One read, not a live one: this sheet is a form, and the only writer of this
  // row while it is open is the knitter looking at it.
  const row = useMemo(() => (id === null ? null : getRowCounter(id)), [id]);

  // A stitch off the rail is stored as the chip's own key, so it comes back as
  // that chip; anything else was typed, and goes back into the box it was
  // typed in.
  const stitch = row?.stitchType ?? null;
  const listed = stitch !== null && STITCH_TYPES.some((option) => option.key === stitch);

  const [name, setName] = useState(row?.name ?? "");
  const [stitchKey, setStitchKey] = useState<string | null>(listed ? stitch : null);
  const [stitchOwn, setStitchOwn] = useState(listed ? "" : (stitch ?? ""));
  // Empty for a counter with no total, which `readRowTotal` reads back as none.
  const [total, setTotal] = useState(String(row?.maxRows ?? ""));
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const chooseStitch = useCallback((key: string) => {
    setStitchKey((current) => (current === key ? null : key));
    setStitchOwn("");
  }, []);

  const typeStitch = useCallback((typed: string) => {
    setStitchOwn(typed);
    setStitchKey(null);
  }, []);

  const save = useCallback(() => {
    if (saving || id === null) {
      return;
    }

    setFailed(false);
    setSaving(true);

    try {
      const own = stitchOwn.trim();

      const written = updateRowCounter(id, {
        name,
        stitchType: own === "" ? stitchKey : own,
        maxRows: readRowTotal(total),
      });

      if (written === null) {
        // The counter went away underneath this sheet. Nothing was written.
        setFailed(true);
        haptics.error();
        return;
      }

      haptics.success();
      router.back();
    } catch {
      setFailed(true);
      haptics.error();
    } finally {
      setSaving(false);
    }
  }, [id, name, saving, stitchKey, stitchOwn, total]);

  const reset = useCallback(() => {
    if (saving || id === null) {
      return;
    }

    // Both of these take something away and neither asks first, so the warning
    // is the only place the app says so — after the fact, once, on the way out.
    resetRowCounter(id);
    haptics.warning();
    router.back();
  }, [id, saving]);

  const remove = useCallback(() => {
    if (saving || id === null) {
      return;
    }

    deleteRowCounter(id);
    haptics.warning();
    router.back();
  }, [id, saving]);

  return (
    // No `SafeAreaView` top edge, for the same reason as the sheet next door:
    // on iOS this route is presented as a sheet and is already inset.
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.paper,
          paddingTop: Platform.OS === "android" ? insets.top : 0,
        },
      ]}
    >
      <BackBar title="Edit counter" />

      {row === null ? (
        <Text style={[styles.stamp, styles.missing, { color: colors.ink2 }]}>
          Counter unavailable.
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

            {/* The two things the boxes above cannot say, at the far end of the
                form from the action. See the head of this file for why neither
                is coloured. */}
            <View style={styles.aside}>
              <Button
                variant="quiet"
                size="sm"
                disabled={saving}
                accessibilityLabel="Reset this counter to nought"
                onPress={reset}
              >
                Reset count
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={saving}
                accessibilityLabel="Delete this counter"
                onPress={remove}
              >
                Delete counter
              </Button>
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
            {saving ? (
              <Text style={[styles.stamp, { color: colors.ink2 }]}>Saving…</Text>
            ) : failed ? (
              <Text style={[styles.stamp, { color: colors.mustard }]}>
                Couldn&apos;t save the counter.
              </Text>
            ) : null}

            {/* The one action on this screen. */}
            <Button
              variant="primary"
              size="lg"
              full
              disabled={saving}
              onPress={save}
            >
              Save counter
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
    // The same measurements as the sheet next door down to the last one: this
    // is that form with the boxes already full, and the two of them opening
    // differently would say they were not.
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
    paddingLeft: space.s4 + 1,
    paddingRight: space.s4,
  },
  aside: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s2,
    // The `sm` button's own 12pt of padding, pulled back, so the first label
    // starts on the same line as every field label above it.
    paddingHorizontal: space.s4 - 12,
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
  /** The one line a sheet with nothing to edit says, held off the bar. */
  missing: {
    paddingTop: space.s10,
    paddingHorizontal: space.s4,
  },
});
