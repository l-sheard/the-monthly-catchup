import { useSSO } from '@clerk/expo';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GoogleIcon } from '@/components/google-icon';

export default function SignInScreen() {
  const { startSSOFlow } = useSSO();
  const router = useRouter();
  // Set by e.g. /join/[code] when it redirects here for an unauthenticated
  // visitor, so a join link doesn't just dead-end at the home screen after
  // sign-in — see that route for the other half of this.
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [loading, setLoading] = useState(false);

  const onGooglePress = useCallback(async () => {
    setLoading(true);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: 'oauth_google',
      });

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        // returnTo comes from a URL param, so its shape isn't known to the
        // typed-routes generator the way a literal href is — validated at
        // runtime (must start with '/') instead.
        router.replace((returnTo && returnTo.startsWith('/') ? returnTo : '/') as Href);
        return;
      }
      // No createdSessionId → user cancelled the flow; nothing to do.
    } catch (err) {
      console.error('Google sign-in error:', JSON.stringify(err, null, 2));
    } finally {
      setLoading(false);
    }
  }, [startSSOFlow, router, returnTo]);

  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-paper px-6">
      <View className="w-full max-w-sm items-center gap-3 rounded-2xl border border-paper-line bg-white px-8 py-10 shadow-sm shadow-black/5">
        <View className="mb-1 h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Text className="text-3xl">💌</Text>
        </View>

        <Text className="text-center font-mono-bold text-2xl tracking-tight text-charcoal">
          The Monthly Catch-Up
        </Text>
        <Text className="text-center font-mono text-base leading-6 text-charcoal/60">
          One email a month, packed with everything your friends have been up to. Sign in to join
          in.
        </Text>

        {/* Google's own branding guidelines for a custom sign-in button
            (developers.google.com/identity/branding-guidelines): white
            fill, #747775 1px border, #1F1F1F text, the untouched full-color
            "G" mark with fixed spacing around it — building a custom button
            (vs. their prebuilt one) is explicitly allowed as long as those
            hold, which is why this one breaks from the rest of the app's
            coral/pill button styling. */}
        <Pressable
          disabled={loading}
          onPress={onGooglePress}
          className="mt-4 w-full flex-row items-center justify-center gap-2.5 rounded-full border border-[#747775] bg-white py-3 pl-3 pr-4 active:opacity-85 disabled:opacity-60">
          {loading ? (
            <ActivityIndicator color="#1F1F1F" />
          ) : (
            <>
              <GoogleIcon size={18} />
              <Text className="font-mono-bold text-base text-[#1F1F1F]">Continue with Google</Text>
            </>
          )}
        </Pressable>

        {/* Mount point for Clerk's bot-protection widget (Smart CAPTCHA). Our
            combined flow can create a new account via SSO, not just sign in
            to an existing one, so Clerk still wants this present. Invisible
            unless Clerk decides a visible challenge is needed. */}
        <View nativeID="clerk-captcha" />
      </View>
    </SafeAreaView>
  );
}
