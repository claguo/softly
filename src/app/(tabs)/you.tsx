import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/context';
import { ScreenHeader } from '@/components/screen-header';
import { fonts, radius, space, tabBarInset, tap, trackMicro, type, useTheme } from '@/theme';

const AVATAR = 96;

export default function YouScreen() {
  const { colors } = useTheme();
  const { status, user, signIn, signOut } = useAuth();

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

  const handleSignOut = () => {
    setFailed(false);
    void signOut();
  };

  // Signed in but offline before the profile loaded: the session is real, the
  // name isn't loaded yet.
  const displayName = user?.username ?? 'Your account';
  const initial = displayName.trim().slice(0, 1);

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.paper }]}>
      <ScreenHeader
        title="You"
        action={status === 'signedIn' ? 'Sign out' : undefined}
        onAction={handleSignOut}
      />

      <ScrollView contentContainerStyle={styles.content}>
        {status === 'loading' ? <ActivityIndicator color={colors.ink3} /> : null}

        {status === 'signedOut' ? (
          <View style={styles.block}>
            <Text style={[styles.lede, { color: colors.ink2 }]}>
              Your Ravelry account powers everything here.
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign in with Ravelry"
              accessibilityState={{ busy, disabled: busy }}
              disabled={busy}
              onPress={handleSignIn}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: pressed ? colors.brassPressed : colors.brass },
              ]}>
              <Text style={[styles.buttonLabel, { color: colors.onBrass }]}>
                Sign in with Ravelry
              </Text>
            </Pressable>

            {failed ? (
              <Text style={[styles.stamp, { color: colors.clay }]}>Sign-in didn&apos;t complete.</Text>
            ) : null}

            <Text style={[styles.stamp, { color: colors.ink3 }]}>
              Soft Goods is an independent app, not made by Ravelry.
            </Text>
          </View>
        ) : null}

        {status === 'signedIn' ? (
          <View style={styles.block}>
            {user?.photo_url ? (
              <Image
                source={{ uri: user.photo_url }}
                alt={`${displayName}'s Ravelry photo`}
                contentFit="cover"
                transition={160}
                style={[styles.avatar, { backgroundColor: colors.surfaceSunk }]}
              />
            ) : (
              <View
                style={[
                  styles.avatar,
                  styles.avatarFallback,
                  { backgroundColor: colors.surfaceSunk, borderColor: colors.hairline },
                ]}>
                <Text style={[styles.avatarInitial, { color: colors.ink2 }]}>{initial}</Text>
              </View>
            )}

            <Text style={[styles.username, { color: colors.ink }]}>{displayName}</Text>
            <Text style={[styles.stamp, { color: colors.ink3 }]}>Signed in with Ravelry</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.s4,
    paddingTop: space.s10,
    paddingBottom: tabBarInset,
  },
  block: {
    alignSelf: 'stretch',
    maxWidth: 420,
    alignItems: 'center',
    gap: space.s5,
  },
  lede: {
    fontFamily: fonts.ui,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    textAlign: 'center',
  },
  button: {
    alignSelf: 'stretch',
    height: tap.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.s6,
    borderRadius: radius.md,
  },
  buttonLabel: {
    fontFamily: fonts.uiSemiBold,
    fontSize: type.heading.fontSize,
    lineHeight: type.heading.lineHeight,
  },
  stamp: {
    // Stamped label: micro size, micro tracking, sentence case.
    fontFamily: fonts.ui,
    fontSize: type.micro.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
    textAlign: 'center',
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: radius.md,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  avatarInitial: {
    fontFamily: fonts.display,
    fontSize: type.display.fontSize,
    lineHeight: type.display.lineHeight,
  },
  username: {
    fontFamily: fonts.uiSemiBold,
    fontSize: type.heading.fontSize,
    lineHeight: type.heading.lineHeight,
    textAlign: 'center',
  },
});
