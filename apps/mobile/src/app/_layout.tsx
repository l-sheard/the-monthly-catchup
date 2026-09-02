import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { SpaceMono_400Regular, SpaceMono_700Bold, useFonts } from '@expo-google-fonts/space-mono';
import { DefaultTheme, Slot, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Platform } from 'react-native';

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
  const [fontsLoaded] = useFonts({ SpaceMono_400Regular, SpaceMono_700Bold });

  // Keep the native splash screen up (preventAutoHideAsync above) and
  // render nothing until the font is ready — RN doesn't retroactively
  // re-render already-mounted <Text> once a custom font finishes loading,
  // so on iOS/Android a gate here is the only way to avoid a permanent
  // system-font fallback. Web is deliberately exempt: expo-font's web
  // adapter applies fonts via a real @font-face (the browser swaps it in
  // as it loads, standard FOUT — no gate needed), and useFonts can never
  // resolve true during `expo export`'s synchronous static-SSR pass since
  // that has no browser/document at all — gating on web made every
  // exported route's static HTML an empty shell (verified via `expo
  // export --platform web` before this fix: <body> held nothing but a
  // Suspense placeholder comment).
  if (!fontsLoaded && Platform.OS !== 'web') return null;

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ThemeProvider value={DefaultTheme}>
        <AnimatedSplashOverlay />
        <Slot />
      </ThemeProvider>
    </ClerkProvider>
  );
}
