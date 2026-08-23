/**
 * Add a pattern — the one Ravelry has never heard of.
 *
 * Most of what a knitter owns is not in Ravelry's catalogue. A leaflet bought
 * at a wool show, a chart out of a magazine, a page written out by a friend:
 * none of them has a pattern id, none of them can be searched for, and there is
 * no endpoint that would put them there. So this sheet writes one down, and the
 * row it writes lives on the phone and nowhere else — the third thing in the
 * app that is the app's own, beside the needle drawer and the row counters.
 *
 * It is `add-needle`'s shell exactly, because it is `add-needle`'s kind of
 * decision: a sheet, one thing to do, said once at the bottom as the action.
 * What is inside is longer, and every box but the first is free text, because
 * this is somebody copying what is printed on a leaflet rather than filling in
 * a form. Only the name is required — a pattern with a name and nothing else is
 * still a record of something that exists nowhere else, which is the whole
 * reason to write it down.
 *
 * The PDF is optional and it comes second on purpose. The pattern is inserted
 * first and the file is imported after it, so a picker that would not open, or
 * a file that turns out not to be a PDF, costs the knitter the attachment and
 * never the seven boxes they just filled in: the row is already saved by then,
 * the sheet says so, and the pattern's own screen offers the import again.
 */

import { router } from "expo-router";
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
import { TextField } from "@/components/ui/text-field";
import {
  importPatternPdf,
  insertCustomPattern,
  type ImportProblem,
  type PickedPdf,
} from "@/data";
import { choosePdf } from "@/features/detail/pick-pdf";
import { haptics } from "@/haptics";
import { fonts, space, trackSmall, type, useTheme } from "@/theme";

/**
 * One quiet line per way attaching a file can not happen.
 *
 * The same two `pattern/[id]` has, plus the picker itself refusing to open,
 * which lands on `failed` there as well: from the knitter's side a picker that
 * did not appear and an import that did not finish are the same sentence.
 */
const ATTACH_NOTICES: Record<ImportProblem, string> = {
  notAPdf: "That file isn't a PDF.",
  failed: "Couldn't attach that file.",
};

export default function AddPatternScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState("");
  const [designer, setDesigner] = useState("");
  const [source, setSource] = useState("");
  const [yardage, setYardage] = useState("");
  const [needleSizes, setNeedleSizes] = useState("");
  const [gauge, setGauge] = useState("");
  const [notes, setNotes] = useState("");

  /** The file the knitter chose, held until the pattern behind it exists. */
  const [picked, setPicked] = useState<PickedPdf | null>(null);

  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  /**
   * The pattern this sheet has already written, if it has.
   *
   * Non-null means the insert landed and only the attachment did not, which is
   * the one state this sheet can be left in half-done. The boxes stop taking
   * typing and the action becomes a way out, because the pattern is saved and
   * pressing Add a second time would write it again.
   */
  const [savedId, setSavedId] = useState<number | null>(null);
  const [attachProblem, setAttachProblem] = useState<ImportProblem | null>(null);

  const spent = savedId !== null;
  const named = name.trim() !== "";

  /**
   * The system document picker, and nothing done with what it hands back.
   *
   * The file is only held here — there is no pattern to attach it to yet, and
   * inventing an id before the insert would be guessing at the one thing the
   * insert decides. Backing out is silent and by far the commonest outcome; a
   * picker that will not open is the one thing worth a line.
   */
  const attach = useCallback(() => {
    if (saving || spent) {
      return;
    }

    setAttachProblem(null);

    void (async () => {
      const answer = await choosePdf();

      if (answer.kind === "picked") {
        setPicked(answer.file);
        haptics.tap();
        return;
      }

      if (answer.kind === "unavailable") {
        setAttachProblem("failed");
        haptics.error();
      }
    })();
  }, [saving, spent]);

  const forget = useCallback(() => {
    setPicked(null);
    setAttachProblem(null);
    haptics.tap();
  }, []);

  const addPattern = useCallback(() => {
    const title = name.trim();

    if (saving || spent || title === "") {
      return;
    }

    // Every attempt starts clean: the last failure clears on retry.
    setFailed(false);
    setAttachProblem(null);
    setSaving(true);

    let written: ReturnType<typeof insertCustomPattern> = null;

    try {
      written = insertCustomPattern({
        name: title,
        designer,
        sourceName: source,
        yardage,
        needleSizes,
        gauge,
        notes,
      });
    } catch {
      written = null;
    }

    if (written === null) {
      // A write into SQLite on this device, so this is the database itself in
      // trouble rather than anything the knitter typed — the name was checked
      // above and everything else is allowed to be blank.
      setSaving(false);
      setFailed(true);
      haptics.error();
      return;
    }

    // Nothing to attach: the pattern is written and the sheet is done.
    if (picked === null) {
      setSaving(false);
      haptics.success();
      router.back();
      return;
    }

    const id = written.id;

    void (async () => {
      // Reports through its answer rather than throwing, like everything else
      // in `pdfs.ts`. A negative id is fine by it: the file is named after the
      // pattern and a leading minus is safe on every filesystem this runs on.
      const outcome = await importPatternPdf(id, picked);
      setSaving(false);

      if (outcome.ok) {
        haptics.success();
        router.back();
        return;
      }

      // The pattern is saved; only the file did not land. Say which, and turn
      // the action into the way out rather than asking for the form again.
      setSavedId(id);
      setAttachProblem(outcome.reason);
      haptics.error();
    })();
  }, [designer, gauge, name, needleSizes, notes, picked, saving, source, spent, yardage]);

  const leave = useCallback(() => router.back(), []);

  return (
    // No `SafeAreaView` top edge, for the same reason as the needle sheets: on
    // iOS this route is presented as a sheet and is already inset from the
    // status bar. Android presents it full-bleed, so it does need the inset.
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.paper,
          paddingTop: Platform.OS === "android" ? insets.top : 0,
        },
      ]}
    >
      <BackBar title="Add a pattern" />

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
              editable={!saving && !spent}
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
              editable={!saving && !spent}
              returnKeyType="done"
            />
          </View>

          <View style={styles.field}>
            {/* Not "source": the word means a closed set of provenances
                everywhere else in this app, and what this box wants is a
                sentence — a shop, a magazine and issue, the person it came
                from. */}
            <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>
              Where it&apos;s from
            </Text>
            <TextField
              value={source}
              onChangeText={setSource}
              accessibilityLabel="Where the pattern is from"
              editable={!saving && !spent}
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
              editable={!saving && !spent}
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
              editable={!saving && !spent}
              returnKeyType="done"
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>Gauge</Text>
            <TextField
              value={gauge}
              onChangeText={setGauge}
              accessibilityLabel="Gauge"
              editable={!saving && !spent}
              returnKeyType="done"
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>Notes</Text>
            <TextField
              value={notes}
              onChangeText={setNotes}
              accessibilityLabel="Notes"
              editable={!saving && !spent}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>PDF</Text>

            {picked === null ? null : (
              // Aqua: the file has not gone anywhere yet, and never will —
              // importing it is a copy into this app's own folder.
              <Text style={[styles.notice, { color: colors.aqua }]}>
                {picked.name}
              </Text>
            )}

            <View style={styles.actions}>
              <Button
                variant="secondary"
                size="sm"
                disabled={saving || spent}
                accessibilityLabel={
                  picked === null
                    ? "Choose a PDF for this pattern"
                    : "Choose a different PDF for this pattern"
                }
                onPress={attach}
              >
                {picked === null ? "Choose a PDF" : "Choose another"}
              </Button>

              {picked === null ? null : (
                // Ghost, like Remove download on the pattern screen: undoing a
                // choice is the least likely thing anybody came here to do.
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={saving || spent}
                  accessibilityLabel="Don't attach a PDF"
                  onPress={forget}
                >
                  Remove
                </Button>
              )}
            </View>
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
          {/* The same ladder as the needle sheet, with one line of its own: an
              attachment that did not land is the only half-done state this
              sheet has, and it is worth saying that the pattern itself is
              safe before the button changes under the finger. */}
          {saving ? (
            <Text style={[styles.stamp, { color: colors.ink2 }]}>Adding…</Text>
          ) : failed ? (
            <Text style={[styles.stamp, { color: colors.mustard }]}>
              Couldn&apos;t add the pattern.
            </Text>
          ) : attachProblem !== null ? (
            <Text style={[styles.stamp, { color: colors.mustard }]}>
              {spent
                ? `${ATTACH_NOTICES[attachProblem]} The pattern was saved.`
                : ATTACH_NOTICES[attachProblem]}
            </Text>
          ) : null}

          {/* The one action on this screen, and the only thing that can hold it
              shut is an unnamed pattern: everything else on the form is
              allowed to be blank. */}
          <Button
            variant="primary"
            size="lg"
            full
            disabled={saving || (!spent && !named)}
            onPress={spent ? leave : addPattern}
          >
            {spent ? "Done" : "Add pattern"}
          </Button>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    // The needle and counter sheets' measurements to the last one: this is that
    // form with different words in it, and them opening differently would say
    // they were different kinds of thing.
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
  notice: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
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
});
