import { useSSO } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SignInScreen() {
  const { startSSOFlow } = useSSO();
  const router = useRouter();

  const onGooglePress = useCallback(async () => {
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: 'oauth_google',
      });

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.replace('/');
      }
      // No createdSessionId → user cancelled the flow; nothing to do.
    } catch (err) {
      console.error('Google sign-in error:', JSON.stringify(err, null, 2));
    }
  }, [startSSOFlow, router]);

  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-white px-6 dark:bg-black">
      <View className="w-full max-w-sm items-center gap-6">
        <Text className="text-center text-2xl font-bold text-black dark:text-white">
          Stay In Touch
        </Text>
        <Text className="text-center text-base text-neutral-500 dark:text-neutral-400">
          Sign in to catch up with your friend group.
        </Text>

        <Pressable
          onPress={onGooglePress}
          className="w-full items-center rounded-full bg-black px-6 py-3 active:opacity-80 dark:bg-white">
          <Text className="text-base font-semibold text-white dark:text-black">
            Continue with Google
          </Text>
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
