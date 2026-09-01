import { Colors } from '@/constants/theme';

// The app is light-only by design (see also colorScheme.set('light') in
// src/app/_layout.tsx, which locks NativeWind's `dark:` variants off too) —
// this intentionally ignores the system color scheme rather than following
// it, unlike the Expo template default.
export function useTheme() {
  return Colors.light;
}
