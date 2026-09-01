import { useSSO } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SignInScreen() {
  const { startSSOFlow } = useSSO();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const onGooglePress = useCallback(async () => {
    setLoading(true);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: 'oauth_google',
      });

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.replace('/');
        return;
      }
      // No createdSessionId → user cancelled the flow; nothing to do.
    } catch (err) {
      console.error('Google sign-in error:', JSON.stringify(err, null, 2));
    } finally {
      setLoading(false);
    }
  }, [startSSOFlow, router]);

  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-neutral-50 px-6">
      <View className="w-full max-w-sm items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-8 py-10 shadow-sm shadow-black/5">
        <View className="mb-1 h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Text className="text-3xl">💌</Text>
        </View>

        <Text className="text-center text-2xl font-extrabold tracking-tight text-charcoal">
          The Monthly Catch-Up
        </Text>
        <Text className="text-center text-base leading-6 text-charcoal/50">
          One email a month, packed with everything your friends have been up to. Sign in to join
          in.
        </Text>

        <Pressable
          disabled={loading}
          onPress={onGooglePress}
          className="mt-4 w-full flex-row items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 shadow-sm shadow-primary/30 active:opacity-85 disabled:opacity-60">
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text className="text-base font-semibold text-white">Continue with Google</Text>
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
