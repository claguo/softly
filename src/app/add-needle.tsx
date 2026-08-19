/**
 * Add a needle — the one thing this app writes down for itself.
 *
 * Every other write in Soft Goods goes to Ravelry and comes back through the
 * mirror. This one cannot. Ravelry has three needle endpoints — the account's
 * own drawer, the size table, the type table — and not one of them writes, so
 * a needle bought this afternoon has nowhere to be recorded but here. That is
 * the whole design of this sheet: the needle it writes is a first-class row
 * everywhere in the app, drawn no differently from one Ravelry handed back.
 *
 * It is `add-yarn`'s shell, because it is `add-yarn`'s kind of decision: a
 * sheet, one thing to do, said once at the bottom in brass. What is inside is
 * shorter, because a needle is three facts and only one of them is required.
 *
 * - **Size**, from Ravelry's own 54-row table — the same chips Cast on unfolds
 *   under "All sizes", drawn by the same `SizeGrid`. Nothing else will do: a
 *   size typed by hand could not be matched to the table, and an unmatched
 *   size is a needle that can never go on a project.
 * - **Type**, from `/needles/types.json`, falling back to the four written
 *   down in `@/data/reference` when that cannot be reached. Optional — a
 *   needle with no type is just a needle.
 * - **Length**, free text, because "80 cm" and "16 inch" and "interchangeable"
 *   are all things a knitter would write on the label.
 *
 * On the way out the size goes into the slot `pending-selection` keeps, and
 * Cast on picks it up. Unlike the yarn slot there is nothing to wait for: the
 * slot holds millimetres, not a row id, so the size is already an answer.
 *
 * Only when asked, though — `?handBack=1`, which Cast on passes and Stash does
 * not. Stash opens this sheet to write a needle down and nothing else, and a
 * size left in the slot there would arrive preselected on the next project the
 * knitter started, which they never asked for.
 */

import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
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
  getNeedleSizes,
  getNeedleTypes,
  insertLocalNeedle,
  NEEDLE_TYPES,
  type NeedleTypeName,
} from "@/data";
import { firstString, readParam } from "@/features/detail/raw";
import { sizeOptions, type SizeOption } from "@/features/start-project/needle-sizes";
import { setPendingNeedleSelection } from "@/features/start-project/pending-selection";
import { SizeGrid } from "@/features/start-project/rows";
import { fonts, space, trackMicro, type, useTheme } from "@/theme";

/** "Double Pointed" and "double_pointed" both become `double-pointed`. */
function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_/]+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/** Ravelry's type names arrive in whatever case they like. Sentence case. */
function sentence(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * `/needles/types.json` as chips.
 *
 * This is the one reference endpoint nothing in the app has watched answer —
 * the documentation names a `needle_type` record and says nothing about its
 * fields — so the reader takes every shape it could plausibly be (a bare
 * string, an object with a name, an object carrying only a permalink) and
 * drops whatever it does not recognise. An empty result is not a failure:
 * `NEEDLE_TYPES` stays on screen and the sheet still works.
 */
function readTypes(records: readonly unknown[]): NeedleTypeName[] {
  const found = new Map<string, NeedleTypeName>();

  for (const record of records) {
    const name =
      typeof record === "string"
        ? record
        : firstString(record, [["name"], ["permalink"], ["type"]]);

    if (name === null) {
      continue;
    }

    const permalink = slug(name);
    if (permalink === "" || found.has(permalink)) {
      continue;
    }

    found.set(permalink, { permalink, label: sentence(name.trim().toLowerCase()) });
  }

  return [...found.values()];
}

/** Nothing chosen, as a stable array: a new `[]` each render is a new prop. */
const NOTHING: readonly string[] = [];

export default function AddNeedleScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();

  // Cast on asks for the size back, because it opened this sheet in the middle
  // of choosing needles. Stash does not — it opened it to write a needle down
  // and nothing more. See `pending-selection`.
  const handsBack = readParam(params.handBack) === "1";

  const [sizes, setSizes] = useState<readonly SizeOption[]>([]);
  const [sizesUnavailable, setSizesUnavailable] = useState(false);
  const [chosen, setChosen] = useState<SizeOption | null>(null);
  // The four written down in `@/data/reference` are what the sheet opens on,
  // and what it keeps if the live table cannot be reached.
  const [types, setTypes] = useState<readonly NeedleTypeName[]>(NEEDLE_TYPES);
  const [typeKey, setTypeKey] = useState<string | null>(null);
  const [length, setLength] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  // Both tables are memoized for the session in `ravelry.ts`, so arriving here
  // a second time is a resolved promise and the chips are drawn on frame one.
  useEffect(() => {
    let live = true;

    void (async () => {
      try {
        const table = await getNeedleSizes();
        if (live) {
          setSizes(sizeOptions(table));
        }
      } catch {
        // One quiet line where the chips would be. There is nothing else this
        // sheet can offer — a needle has to have a size out of that table.
        if (live) {
          setSizesUnavailable(true);
        }
      }
    })();

    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;

    void (async () => {
      try {
        const listed = readTypes(await getNeedleTypes());
        if (live && listed.length > 0) {
          setTypes(listed);
        }
      } catch {
        // Nothing to say: the fallback is already on screen, and a type is
        // optional anyway.
      }
    })();

    return () => {
      live = false;
    };
  }, []);

  const chooseSize = useCallback(
    (key: string) => {
      // Single-select, and tapping the chosen size again unchooses it — the
      // sheet is one needle, not a basket of them.
      setChosen((current) =>
        current !== null && current.key === key
          ? null
          : (sizes.find((option) => option.key === key) ?? null),
      );
      setFailed(false);
    },
    [sizes],
  );

  const toggleType = useCallback((permalink: string) => {
    setTypeKey((current) => (current === permalink ? null : permalink));
  }, []);

  const addNeedle = useCallback(() => {
    if (saving || chosen === null) {
      return;
    }

    // Every attempt starts clean: the last failure clears on retry.
    setFailed(false);
    setSaving(true);

    try {
      const kind = types.find((option) => option.permalink === typeKey) ?? null;

      insertLocalNeedle({
        sizeMm: chosen.mm,
        sizeUs: chosen.us,
        // Lowercase, the way Ravelry's own needle rows arrive, because the
        // rows that draw them lift the first letter themselves. No type
        // chosen is not a gap to fill in: a needle is a needle.
        kind: kind === null ? "needle" : kind.label.toLowerCase(),
        lengthLabel: length,
      });

      if (handsBack) {
        setPendingNeedleSelection(chosen.key);
      }

      router.back();
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }, [chosen, handsBack, length, saving, typeKey, types]);

  return (
    // No `SafeAreaView` top edge, for the same reason as Cast on and Add a
    // yarn: on iOS this route is a sheet, already inset from the status bar by
    // the presentation itself. Android presents it full-bleed, so it does need
    // the inset.
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.paper,
          paddingTop: Platform.OS === "android" ? insets.top : 0,
        },
      ]}
    >
      <BackBar />

      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.content}
        >
          <View style={styles.block}>
            <Text style={[styles.title, { color: colors.ink }]}>Add a needle</Text>
          </View>

          <View style={[styles.ruled, { borderTopColor: colors.hairline }]}>
            <View style={styles.opening}>
              <Text style={[styles.fieldLabel, { color: colors.ink3 }]}>Size</Text>
            </View>
            {/* The grid closes the section with its own hairline. */}
            <SizeGrid
              options={sizes}
              selected={chosen === null ? NOTHING : [chosen.key]}
              notice={{
                line: sizesUnavailable
                  ? "Sizes unavailable · check connection"
                  : "Loading",
                unavailable: sizesUnavailable,
              }}
              onPress={chooseSize}
            />
          </View>

          <View style={[styles.stack, { borderBottomColor: colors.hairline }]}>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.ink3 }]}>Type</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.rail}
            >
              {types.map((option) => (
                <FilterChip
                  key={option.permalink}
                  flush
                  label={option.label}
                  active={typeKey === option.permalink}
                  onPress={() => toggleType(option.permalink)}
                />
              ))}
            </ScrollView>
          </View>

          <View style={[styles.panel, { borderBottomColor: colors.hairline }]}>
            <Text style={[styles.fieldLabel, { color: colors.ink3 }]}>Length</Text>
            <TextField
              value={length}
              onChangeText={setLength}
              accessibilityLabel="Needle length"
              editable={!saving}
              returnKeyType="done"
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
          {/* The same ladder as the sheet next door, with one honest
              difference: this write is a row into SQLite on this device, so
              "Adding…" is a line that will almost never be seen, and a failure
              means the database itself is in trouble. Both are still drawn —
              a write that cannot say what happened to it is worse than one
              whose worst line is rarely read. */}
          {saving ? (
            <Text style={[styles.stamp, { color: colors.ink3 }]}>Adding…</Text>
          ) : failed ? (
            <Text style={[styles.stamp, { color: colors.clay }]}>
              Couldn&apos;t add the needle.
            </Text>
          ) : null}

          {/* The one brass thing on this screen. */}
          <Button
            variant="primary"
            size="lg"
            full
            disabled={chosen === null || saving}
            onPress={addNeedle}
          >
            Add needle
          </Button>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingBottom: space.s6 },
  block: {
    paddingHorizontal: space.s4,
    paddingVertical: space.s5,
    gap: space.s2,
  },
  ruled: { borderTopWidth: 1 },
  title: {
    // 28, the screen-title size, with the leading opened past `type.title`'s
    // 30 for the same reason every other display line in the app opens it.
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 32,
  },
  fieldLabel: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
  },
  panel: {
    paddingHorizontal: space.s4,
    paddingVertical: space.s3,
    gap: space.s2,
    borderBottomWidth: 1,
  },
  // Like `panel`, but for a block whose rail has to reach both edges.
  stack: {
    paddingVertical: space.s3,
    gap: space.s3,
    borderBottomWidth: 1,
  },
  field: {
    paddingHorizontal: space.s4,
    gap: space.s2,
  },
  // A label whose block has no padding of its own, because what follows it —
  // the size grid — carries its own.
  opening: {
    paddingHorizontal: space.s4,
    paddingTop: space.s3,
  },
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
    fontSize: type.micro.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
    textAlign: "center",
  },
});
