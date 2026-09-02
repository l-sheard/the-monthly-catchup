import { useAuth } from '@clerk/expo';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Linking } from 'react-native';

// Native fallback for this route — cycles/[id].tsx only ever routes here
// on web (see its Platform.OS check next to this route's other push
// call); this exists so the route still resolves to something sane if it
// were ever reached on native directly, by falling back to the same
// Linking.openURL behavior this screen replaced on web.
export default function NewsletterViewerNativeScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const { url } = useLocalSearchParams<{ id: string; url: string }>();
  const router = useRouter();

  useEffect(() => {
    if (url) Linking.openURL(url);
    router.back();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;
  return null;
}
