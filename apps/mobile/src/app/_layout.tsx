import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { DefaultTheme, Slot, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

import '../global.css';

// Light-only by design (product decision, not a TODO): no screen uses a
// `dark:` NativeWind variant, so there's nothing for NativeWind's dark mode
// to override — no colorScheme.set() needed (and its default darkMode
// strategy is 'media', which doesn't support manual overrides anyway; that
// was the "Cannot manually set color scheme" runtime error from an earlier
// version of this file). See src/hooks/use-theme.ts for the equivalent
// lock on the native ThemedText/ThemedView path, which doesn't go through
// NativeWind at all.

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
