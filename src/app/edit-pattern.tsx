/**
 * Edit a pattern — `add-pattern` with the boxes already full.
 *
 * The same seven fields, the same one action at the bottom, the same rule about
 * which of them has to be answered. Two things are its own:
 *
 * - **No PDF block.** Attaching a file to a pattern that already exists is the
 *   pattern's own screen's job, where the file can be opened and thrown away as
 *   well as chosen — this sheet is about the words, and offering a second door
 *   to the same import would be two places to look for one thing.
 * - **Nothing leaves the device.** The write is a row in SQLite, so there is no
 *   offline case and no refresh to wait for: `useCustomPattern` is a live read
 *   over the same update, and the screen behind this sheet redraws itself.
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
import { TextField } from "@/components/ui/text-field";
import { getCustomPattern, updateCustomPattern } from "@/data";
import { readId } from "@/features/detail/raw";
import { haptics } from "@/haptics";
import { fonts, space, trackSmall, type, useTheme } from "@/theme";

export default function EditPatternScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { id: param } = useLocalSearchParams<"/edit-pattern">();

  const id = readId(param);
  // One read, not a live one: this sheet is a form, and the only writer of this
  // row is the button at the bottom of it. Synchronous, so the boxes are full
  // on frame one — which is what makes this the add sheet with the answers
  // already in it rather than a form that fills itself a beat later.
  const row = useMemo(() => (id === null ? null : getCustomPattern(id)), [id]);

  const [name, setName] = useState(row?.name ?? "");
  const [designer, setDesigner] = useState(row?.designer ?? "");
  const [source, setSource] = useState(row?.sourceName ?? "");
  const [yardage, setYardage] = useState(row?.yardage ?? "");
  const [needleSizes, setNeedleSizes] = useState(row?.needleSizes ?? "");
  const [gauge, setGauge] = useState(row?.gauge ?? "");
  const [notes, setNotes] = useState(row?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const named = name.trim() !== "";

  const save = useCallback(() => {
    if (saving || id === null || !named) {
      return;
    }

    setFailed(false);
    setSaving(true);

    try {
      const written = updateCustomPattern(id, {
        name,
        designer,
        sourceName: source,
        yardage,
        needleSizes,
        gauge,
        notes,
      });

      if (written === null) {
        // The row went while the sheet was open. Nothing was written, and
        // there is nothing to write it to.
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
  }, [designer, gauge, id, name, named, needleSizes, notes, saving, source, yardage]);

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
      <BackBar title="Edit pattern" />

      {row === null ? (
        <Text style={[styles.stamp, styles.missing, { color: colors.ink2 }]}>
          Pattern unavailable.
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
                accessibilityLabel="Pattern name"
                editable={!saving}
                returnKeyType="done"
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>
                Designer
              </Text>
              <TextField
                value={designer}
                onChangeText={setDesigner}
                accessibilityLabel="Designer"
                editable={!saving}
                returnKeyType="done"
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>
                Where it&apos;s from
              </Text>
              <TextField
                value={source}
                onChangeText={setSource}
                accessibilityLabel="Where the pattern is from"
                editable={!saving}
                returnKeyType="done"
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>
                Yardage
              </Text>
              <TextField
                value={yardage}
                onChangeText={setYardage}
                accessibilityLabel="Yardage"
                editable={!saving}
                returnKeyType="done"
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>
                Needle sizes
              </Text>
              <TextField
                value={needleSizes}
                onChangeText={setNeedleSizes}
                accessibilityLabel="Needle sizes"
                editable={!saving}
                returnKeyType="done"
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>
                Gauge
              </Text>
              <TextField
                value={gauge}
                onChangeText={setGauge}
                accessibilityLabel="Gauge"
                editable={!saving}
                returnKeyType="done"
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>
                Notes
              </Text>
              <TextField
                value={notes}
                onChangeText={setNotes}
                accessibilityLabel="Notes"
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
            {saving ? (
              <Text style={[styles.stamp, { color: colors.ink2 }]}>Saving…</Text>
            ) : failed ? (
              <Text style={[styles.stamp, { color: colors.mustard }]}>
                Couldn&apos;t save the pattern.
              </Text>
            ) : null}

            {/* The one action on this screen. Held shut only by an emptied
                name box: a pattern has to be called something. */}
            <Button
              variant="primary"
              size="lg"
              full
              disabled={saving || !named}
              onPress={save}
            >
              Save pattern
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
    // The add sheet's measurements to the last one: this is that form with the
    // boxes already full, and the two of them opening differently would say
    // they were not.
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
