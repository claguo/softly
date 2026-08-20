import { StyleSheet, Text, View } from 'react-native';

import { fonts, radius, space, trackMicro, type, useTheme } from '@/theme';

export type SyncState = 'offline' | 'queued' | 'synced';

export type SyncNoticeProps = {
  state: SyncState;
  /** Queued writes waiting on a connection; used by the "queued" state. */
  pendingCount?: number;
  /** When the cache last reached the server; used by the "synced" state. */
  lastSyncedAt?: Date | number;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "8m ago", "2h ago", "3d ago" — the only time format in the system. */
export function formatRelative(at: Date | number, now: Date | number = Date.now()): string {
  const then = at instanceof Date ? at.getTime() : at;
  const since = Math.max(0, (now instanceof Date ? now.getTime() : now) - then);

  if (since < MINUTE) return 'just now';
  if (since < HOUR) return `${Math.floor(since / MINUTE)}m ago`;
  if (since < DAY) return `${Math.floor(since / HOUR)}h ago`;
  return `${Math.floor(since / DAY)}d ago`;
}

/** Offline-first status, said plainly: a hairline strip on paper. Never red, never a toast. */
export function SyncNotice({ state, pendingCount, lastSyncedAt }: SyncNoticeProps) {
  const { colors } = useTheme();

  const tone = state === 'synced' ? colors.spruce : colors.aqua;
  const text =
    state === 'offline'
      ? 'offline · readable'
      : state === 'queued'
        ? pendingCount === undefined
          ? 'queued'
          : `${pendingCount} queued`
        : lastSyncedAt === undefined
          ? 'synced'
          : `synced · ${formatRelative(lastSyncedAt)}`;

  return (
    <View
      accessible
      accessibilityLabel={text}
      style={[
        styles.strip,
        {
          backgroundColor: colors.paper,
          borderTopColor: colors.hairline,
          borderBottomColor: colors.hairline,
        },
      ]}>
      <View style={[styles.dot, { backgroundColor: tone }]} />
      <Text numberOfLines={1} style={[styles.text, { color: tone }]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s2,
    paddingVertical: 9,
    paddingHorizontal: space.s4,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  dot: {
    width: 5,
    height: 5,
    flexShrink: 0,
    borderRadius: radius.pill,
  },
  text: {
    fontFamily: fonts.ui,
    fontSize: type.micro.fontSize,
    lineHeight: type.micro.lineHeight,
    letterSpacing: trackMicro,
  },
});
