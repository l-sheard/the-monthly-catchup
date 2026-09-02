import { useAuth } from '@clerk/expo';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { InboxNewsletterSummary, InboxResponse } from '@stay-in-touch/shared';

import { useApiClient } from '@/lib/api';

const CARD = 'rounded-2xl border border-paper-line bg-white shadow-sm shadow-black/5';

// Top-level route, not nested under (home) — same reasoning as
// cycles/[id].tsx and account.tsx: its own inline auth guard, reached from
// the top bar's mail icon (web) or the home screen's native-only link.
export default function InboxScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const { apiFetch } = useApiClient();

  const [newsletters, setNewsletters] = useState<InboxNewsletterSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<InboxResponse>('/newsletters/inbox');
      setNewsletters(res.newsletters);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Loads the list and clears the unread dot in parallel — the mark-read
  // call is fire-and-forget (best-effort; nothing on this screen depends
  // on it succeeding) and deliberately doesn't block rendering the list.
  useEffect(() => {
    load();
    apiFetch('/newsletters/inbox/mark-read', { method: 'POST' }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScrollView contentContainerClassName="items-center px-6 py-8 gap-4" className="flex-1">
        <View className="w-full max-w-xl">
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            className="mb-3 self-start active:opacity-60">
            <Text className="font-mono text-sm text-charcoal/60">← Back</Text>
          </Pressable>
          <Text className="font-mono-bold text-3xl tracking-tight text-charcoal">📬 Inbox</Text>
          <Text className="mt-1 font-mono text-sm text-charcoal/60">
            Every newsletter sent to any of your groups.
          </Text>
        </View>

        {error && (
          <Text className="w-full max-w-xl rounded-xl bg-red-50 px-3 py-2 font-mono text-sm text-red-600">
            {error}
          </Text>
        )}

        {newsletters === null && !error && <ActivityIndicator className="mt-8" color="#F2776A" />}

        {newsletters && (
          <View className="w-full max-w-xl gap-3">
            {newsletters.length === 0 ? (
              <View className={`items-center gap-2 px-6 py-10 ${CARD}`}>
                <Text className="font-mono text-sm text-charcoal/60">Nothing here yet.</Text>
              </View>
            ) : (
              newsletters.map((n) => (
                <Pressable
                  key={n.id}
                  onPress={() =>
                    Platform.OS === 'web'
                      ? router.push({ pathname: '/newsletters/[id]', params: { id: n.id, url: n.viewUrl } })
                      : Linking.openURL(n.viewUrl)
                  }
                  className={`flex-row items-center justify-between p-4 ${CARD} active:opacity-80`}>
                  <View>
                    <Text className="font-mono-bold text-base text-charcoal">{n.groupName}</Text>
                    <Text className="mt-0.5 font-mono text-sm text-charcoal/60">
                      {new Date(n.year, n.month - 1, 1).toLocaleString('en-US', {
                        month: 'long',
                        year: 'numeric',
                      })}
                    </Text>
                  </View>
                  <Text className="font-mono-bold text-sm text-primary">View →</Text>
                </Pressable>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
