/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1B3A33',
    background: '#F9F3E7',
    backgroundElement: '#EFEFEC',
    backgroundSelected: '#F6D9D3',
    textSecondary: '#5C7268',
    primary: '#F2776A',
    primaryText: '#FFFFFF',
  },
  dark: {
    text: '#EAF1E6',
    background: '#16231F',
    backgroundElement: '#20302A',
    backgroundSelected: '#3D2B26',
    textSecondary: '#9CB0A5',
    primary: '#F58F84',
    primaryText: '#16231F',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;

// The web header (app-tabs.web.tsx) floats over the page as an absolutely
// positioned bar, so nothing pushes page content down for it automatically
// — screens need to reserve this much top clearance themselves. Grew from
// 68 once the bar picked up the Create/Join group + Account + Sign out
// actions alongside the wordmark.
export const WebTopBarInset = 76;
export const MaxContentWidth = 800;
