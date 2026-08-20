/**
 * One needle from the drawer.
 *
 * The plainest detail screen in the app, because a needle is three facts. It
 * exists for the fourth thing: somewhere to put Edit.
 *
 * Which is offered on exactly the rows it can keep a promise about. A needle
 * pulled out of Ravelry is a copy of something Ravelry still has, and
 * `pullNeedles` replaces it on the next sync — there is no endpoint that would
 * make an edit stick, because the needle inventory is read-only, so a button
 * here would write something the knitter would watch disappear. A needle this
 * app wrote is ours to change, and says so. See `updateLocalNeedle`.
 */

import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { BackBar } from "@/components/back-bar";
import { Stamp } from "@/components/ui/stamp";
import { getNeedleById } from "@/data";
import { readId } from "@/features/detail/raw";
import { fonts, radius, space, trackMicro, type, useTheme } from "@/theme";

/** Ravelry's needle kinds arrive lowercase ("circular", "hook"). Sentence case. */
function sentence(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function NeedleScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { id: param } = useLocalSearchParams<"/needle/[id]">();

  const id = readId(param);
  const row = useMemo(() => (id === null ? null : getNeedleById(id)), [id]);

  const editable = row?.source === "local";
  const size = row?.sizeMm === null || row === null ? "—" : String(row.sizeMm);
  const kind = sentence(row?.kind ?? row?.name ?? "Needle");

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.screen, { backgroundColor: colors.paper }]}
    >
      <BackBar
        action={editable ? "Edit" : undefined}
        onAction={
          id === null
            ? undefined
            : () =>
                router.push({
                  pathname: "/edit-needle",
                  params: { id: String(id) },
                })
        }
      />

      {row === null ? (
        <Text style={[styles.stamp, { color: colors.ink2 }]}>
          Needle unavailable.
        </Text>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: space.s10 + insets.bottom }}
        >
          <View style={styles.block}>
            <View
              style={[
                styles.swatch,
                {
                  backgroundColor: colors.surfaceSunk,
                  borderColor: colors.hairline,
                },
              ]}
            >
              <Text style={[styles.swatchSize, { color: colors.ink }]}>
                {size}
              </Text>
              {/* Sentence case: the design's "MM" would break the
                  never-all-caps rule. */}
              <Text style={[styles.swatchUnit, { color: colors.ink2 }]}>mm</Text>
            </View>

            <Text style={[styles.title, { color: colors.ink }]}>{kind}</Text>
          </View>

          <View
            style={[
              styles.block,
              styles.ruled,
              { borderTopColor: colors.hairline },
            ]}
          >
            <View style={styles.facts}>
              <Stamp label="size">{`${size} mm`}</Stamp>
              {row.sizeUs === null ? null : (
                <Stamp label="us">{row.sizeUs}</Stamp>
              )}
              {row.lengthLabel === null ? null : (
                <Stamp label="length">{row.lengthLabel}</Stamp>
              )}
            </View>
          </View>

          {editable ? null : (
            <View
              style={[
                styles.block,
                styles.ruled,
                { borderTopColor: colors.hairline },
              ]}
            >
              {/* Said plainly, and only on the rows it applies to. A knitter
                  looking for the Edit that is on the needle below this one
                  deserves the reason rather than a button that does nothing. */}
              <Text style={[styles.note, { color: colors.ink2 }]}>
                This needle came from Ravelry, which has no way to change one.
                Editing it here would be undone by the next sync.
              </Text>
            </View>
          )}
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
    gap: space.s3,
  },
  ruled: { borderTopWidth: 1 },
  swatch: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  swatchSize: {
    fontFamily: fonts.uiMedium,
    fontSize: 20,
    lineHeight: 23,
  },
  swatchUnit: {
    fontFamily: fonts.ui,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: trackMicro,
    marginTop: 2,
  },
  title: {
    // 28, the screen-title size, leading opened past `type.title`'s 30 the way
    // every other display line in the app opens it.
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 32,
  },
  facts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.s4,
  },
  note: {
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
  },
  stamp: {
    fontFamily: fonts.ui,
    fontSize: type.micro.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
    textAlign: "center",
    paddingTop: space.s10,
    paddingHorizontal: space.s4,
  },
});
