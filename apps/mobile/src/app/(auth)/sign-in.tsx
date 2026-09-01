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
    <SafeAreaView className="flex-1 items-center justify-center bg-cream px-6">
      <View className="w-full max-w-sm items-center gap-3">
        <Text className="text-6xl">💌</Text>

        <Text className="mt-2 text-center text-3xl font-extrabold text-charcoal">
          The Monthly Catch-Up
        </Text>
        <Text className="text-center text-base leading-6 text-charcoal/60">
          One email a month, packed with everything your friends have been up to. Sign in to join
          in.
        </Text>

        <Pressable
          disabled={loading}
          onPress={onGooglePress}
          className="mt-6 w-full flex-row items-center justify-center gap-2 rounded-full bg-primary px-6 py-4 active:opacity-85 disabled:opacity-60">
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
