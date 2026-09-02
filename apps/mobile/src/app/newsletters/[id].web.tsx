import { useAuth } from '@clerk/expo';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Web-only: renders the signed newsletter URL inline via an iframe instead
// of Linking.openURL's window.open (a new tab) — the whole reason this
// screen exists. Native keeps plain Linking.openURL (see the sibling
// [id].tsx here) since "a new tab" isn't the same complaint on a phone —
// it backgrounds to the system browser app either way — and pulling in
// react-native-webview for a fully in-app native viewer is a bigger
// dependency than this was worth.
export default function NewsletterViewerScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const { url } = useLocalSearchParams<{ id: string; url: string }>();
  const router = useRouter();

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;
  if (!url) return <Redirect href="/" />;

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <View className="flex-row items-center border-b border-paper-line px-4 py-2">
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          className="active:opacity-60">
          <Text className="font-mono text-sm text-charcoal/60">← Back</Text>
        </Pressable>
      </View>
      <iframe src={url} title="Newsletter" style={{ flex: 1, border: 'none', width: '100%' }} />
    </SafeAreaView>
  );
}
