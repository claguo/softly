import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/auth/context";
import { fonts, radius, space, tap, trackSmall, type, useTheme } from "@/theme";

/**
 * A one-off. The scale tops out at `type.display` (34pt) because that is the
 * largest a screen ever needs to speak, and this is not a screen speaking — it
 * is the name of the thing. So it is sized here rather than given a rung in
 * `type` that nothing else would ever climb. 64 is the widest "softly" that
 * still clears the margins on a 320pt phone; the leading is absolute because
 * RN has no ems, and generous because Yuji Mai's descenders are long.
 */
const WORDMARK = { fontSize: 64, lineHeight: 76 } as const;

/**
 * Mustard has no pressed value in the palette, and inventing one would put a
 * fifth yellow in a set that means to have four. A dip carries the press.
 */
const PRESSED_OPACITY = 0.85;

export default function WelcomeScreen() {
  const { colors, scheme } = useTheme();
  const { signIn } = useAuth();

  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleSignIn = async () => {
    // Every attempt starts clean: the last failure line clears on retry.
    setFailed(false);
    setBusy(true);
    try {
      await signIn();
    } catch {
      // Cancelled browser, state mismatch, no network — all the same to the
      // reader: it didn't complete. No red, no dialog, no stack.
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  // Which mustard is the field flips with the theme: light's usable ground is
  // the tint and dark's is the base, so the button reads as one colour across
  // both while the token behind it changes hands. Near-black on the light
  // ground and paper on the dark one, 10.2:1 and 9.7:1.
  const fill = scheme === "dark" ? colors.mustard : colors.mustardTint;
  const label = scheme === "dark" ? colors.paper : colors.ink;

  return (
    <SafeAreaView
      // Both edges, because nothing here is pinned to a chrome — the whole page
      // is one centred column, and it should centre in the space it can use.
      edges={["top", "bottom"]}
      style={[styles.screen, { backgroundColor: colors.paper }]}
    >
      <View style={styles.column}>
        {/* The name and what it is are one block, set close: the tagline is
            said by the wordmark, not by the screen. */}
        <View style={styles.name}>
          <Text style={[styles.wordmark, { color: colors.ink }]}>softly</Text>
          <Text style={[styles.tagline, { color: colors.ink2 }]}>
            A Ravelry companion app
          </Text>
        </View>

        {/* The button and the line that answers for it are one thing, held
            closer to each other than either is to the name. */}
        <View style={styles.action}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign in with Ravelry"
            accessibilityState={{ busy, disabled: busy }}
            disabled={busy}
            onPress={handleSignIn}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: fill, opacity: pressed ? PRESSED_OPACITY : 1 },
            ]}
          >
            <Text style={[styles.buttonLabel, { color: label }]}>
              Sign in with Ravelry
            </Text>
          </Pressable>

          {failed ? (
            <Text style={[styles.stamp, { color: colors.mustard }]}>
              Sign-in didn&apos;t complete.
            </Text>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.s4,
    gap: space.s8,
  },
  name: {
    alignItems: "center",
    // Tight: the wordmark's 76pt leading already leaves air under the word, so
    // the gap is what remains after it rather than the whole distance.
    gap: space.s2,
  },
  wordmark: {
    fontFamily: fonts.display,
    fontSize: WORDMARK.fontSize,
    lineHeight: WORDMARK.lineHeight,
    textAlign: "center",
  },
  tagline: {
    fontFamily: fonts.ui,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    textAlign: "center",
  },
  action: {
    alignSelf: "stretch",
    maxWidth: 420,
    alignItems: "center",
    gap: space.s3,
    marginTop: space.s4,
  },
  button: {
    // Hugs its label rather than the column: the padding is the width, so the
    // button is the size of the thing it says. The parent centres it.
    alignSelf: "center",
    height: tap.lg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.s6,
    borderRadius: radius.md,
  },
  buttonLabel: {
    fontFamily: fonts.uiSemiBold,
    fontSize: type.heading.fontSize,
    lineHeight: type.heading.lineHeight,
  },
  stamp: {
    // Stamped label: small size, small tracking, sentence case.
    fontFamily: fonts.ui,
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    letterSpacing: trackSmall,
    textAlign: "center",
  },
});
