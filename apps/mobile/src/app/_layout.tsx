import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { DefaultTheme, Slot, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { colorScheme } from 'nativewind';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

import '../global.css';

// Light-only by design (product decision, not a TODO) — locks NativeWind's
// `dark:` utility variants off regardless of the device's system setting.
// See also src/hooks/use-theme.ts for the equivalent on native
// ThemedText/ThemedView, which don't go through NativeWind.
// Guarded: this module also runs server-side during static web export
// (no browser), where NativeWind's web setter throws rather than no-ops.
if (typeof window !== 'undefined') {
  colorScheme.set('light');
}

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

if (!publishableKey) {
  throw new Error('Add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to apps/mobile/.env.local');
}

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ThemeProvider value={DefaultTheme}>
        <AnimatedSplashOverlay />
        <Slot />
      </ThemeProvider>
    </ClerkProvider>
  );
}
