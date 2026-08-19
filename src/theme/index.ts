import { useColorScheme } from 'react-native';

import { palette, type Palette } from '@/theme/tokens';

export * from '@/theme/tokens';

export function useTheme(): { colors: Palette; scheme: 'light' | 'dark' } {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { colors: palette[scheme], scheme };
}
