/**
 * Edit a needle — `add-needle` with the boxes already full.
 *
 * The same three facts, the same size grid off Ravelry's own table, the same
 * one action button at the bottom. Two things are its own:
 *
 * - **It only ever opens on a needle this app wrote.** The needle detail screen
 *   offers Edit on nothing else, and `updateLocalNeedle` refuses anything else
 *   even if a route were typed by hand — a needle from Ravelry would be
 *   overwritten by the next sync, so an edit to one is a promise this app
 *   cannot keep. That check lives in the data layer rather than here, because
 *   it is the rule and not the presentation of the rule.
 * - **Nothing leaves the device.** The write is a row in SQLite, so there is no
 *   offline case and no refresh to wait for: `useNeedles` is a live query over
 *   the same update, and the screens behind this sheet redraw themselves.
 */

import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  getNeedleById,
  getNeedleSizes,
  getNeedleTypes,
  NEEDLE_TYPES,
  updateLocalNeedle,
  type NeedleTypeName,
} from "@/data";
import { readId } from "@/features/detail/raw";
import {
  sizeKey,
  sizeOptions,
  type SizeOption,
} from "@/features/start-project/needle-sizes";
import { SizeGrid } from "@/features/start-project/rows";
import { fonts, space, trackSmall, type, useTheme } from "@/theme";

/** Nothing chosen, as a stable array: a new `[]` each render is a new prop. */
const NOTHING: readonly string[] = [];

/** "Double Pointed" and "double_pointed" both become `double-pointed`. */
function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_/]+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export default function EditNeedleScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { id: param } = useLocalSearchParams<"/edit-needle">();

  const id = readId(param);
  // One read, not a live one: this sheet is a form, and the only writer of this
  // row is the button at the bottom of it.
  const row = useMemo(() => (id === null ? null : getNeedleById(id)), [id]);
  const editable = row?.source === "local";

  const [sizes, setSizes] = useState<readonly SizeOption[]>([]);
  const [sizesUnavailable, setSizesUnavailable] = useState(false);
  const [chosen, setChosen] = useState<SizeOption | null>(null);
  const [types, setTypes] = useState<readonly NeedleTypeName[]>(NEEDLE_TYPES);
  const [typeKey, setTypeKey] = useState<string | null>(
    row?.kind === null || row?.kind === undefined ? null : slug(row.kind),
  );
  const [length, setLength] = useState(row?.lengthLabel ?? "");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  // The size table is memoized for the session in `ravelry.ts`, so arriving
  // here from Add a needle is a resolved promise and the chips draw on frame
  // one. The needle's own size is matched into it by millimetre, which is how
  // every other screen keys a needle — see `needle-sizes`.
  useEffect(() => {
    let live = true;

    void (async () => {
      try {
        const options = sizeOptions(await getNeedleSizes());

        if (!live) {
          return;
        }

        setSizes(options);

        if (row?.sizeMm !== null && row?.sizeMm !== undefined) {
          const key = sizeKey(row.sizeMm);
          setChosen(options.find((option) => option.key === key) ?? null);
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
  }, [row]);

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
      // Single-select, but not un-selectable: a needle already has a size and
      // saving it without one is not a thing this sheet can do.
      setChosen(sizes.find((option) => option.key === key) ?? null);
      setFailed(false);
    },
    [sizes],
  );

  const toggleType = useCallback((permalink: string) => {
    setTypeKey((current) => (current === permalink ? null : permalink));
  }, []);

  const save = useCallback(() => {
    if (saving || chosen === null || id === null) {
      return;
    }

    setFailed(false);
    setSaving(true);

    try {
      const kind = types.find((option) => option.permalink === typeKey) ?? null;

      const written = updateLocalNeedle(id, {
        sizeMm: chosen.mm,
        sizeUs: chosen.us,
        // Lowercase, the way Ravelry's own needle rows arrive, because the rows
        // that draw them lift the first letter themselves.
        kind: kind === null ? "needle" : kind.label.toLowerCase(),
        lengthLabel: length,
      });

      if (written === null) {
        // The data layer refused it: not ours to change. Nothing was written.
        setFailed(true);
        return;
      }

      router.back();
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }, [chosen, id, length, saving, typeKey, types]);

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
      <BackBar title="Edit needle" />

      {!editable ? (
        <Text style={[styles.stamp, { color: colors.ink2 }]}>
          {row === null
            ? "Needle unavailable."
            : "This needle came from Ravelry and can't be edited."}
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
            {/* No gap on this block: the grid pads itself off the label above
                it, and it is the same 12 the rail below takes from `stack`. */}
            <View>
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>
                  Size
                </Text>
              </View>
              <SizeGrid
                unruled
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

            <View style={styles.stack}>
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>
                  Type
                </Text>
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

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>
                Length
              </Text>
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
            {saving ? (
              <Text style={[styles.stamp, { color: colors.ink2 }]}>Saving…</Text>
            ) : failed ? (
              <Text style={[styles.stamp, { color: colors.mustard }]}>
                Couldn&apos;t save the needle.
              </Text>
            ) : null}

            {/* The one action on this screen. */}
            <Button
              variant="primary"
              size="lg"
              full
              disabled={chosen === null || saving}
              onPress={save}
            >
              Save needle
            </Button>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

/**
 * `/needles/types.json` as chips — the same defensive read as `add-needle`'s,
 * because it is the same undocumented table and the same fallback behind it.
 */
function readTypes(records: readonly unknown[]): NeedleTypeName[] {
  const found = new Map<string, NeedleTypeName>();

  for (const record of records) {
    const name =
      typeof record === "string"
        ? record
        : typeof record === "object" &&
            record !== null &&
            typeof (record as Record<string, unknown>).name === "string"
          ? ((record as Record<string, unknown>).name as string)
          : null;

    if (name === null) {
      continue;
    }

    const permalink = slug(name);
    if (permalink === "" || found.has(permalink)) {
      continue;
    }

    found.set(permalink, {
      permalink,
      label: name.trim().toLowerCase().replace(/^./, (c) => c.toUpperCase()),
    });
  }

  return [...found.values()];
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    // Space where the rules were, and the same measurements as the sheet next
    // door down to the last one: this is that form with the boxes already full,
    // and the two of them opening differently would say they were not.
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
  // inset moves off the block and onto the label inside it.
  stack: { gap: space.s3 },
  rail: {
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
    paddingHorizontal: space.s4,
  },
});
