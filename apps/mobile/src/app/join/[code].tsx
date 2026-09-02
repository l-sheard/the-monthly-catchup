import { useAuth } from '@clerk/expo';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Group } from '@stay-in-touch/shared';

import { useApiClient } from '@/lib/api';

const CARD = 'rounded-2xl border border-paper-line bg-white shadow-sm shadow-black/5';

/**
 * Destination for a shared "join link" (see the share panel on the home
 * screen after creating a group). An unauthenticated visitor gets bounced
 * to sign-in with this URL as `returnTo`, so they land right back here —
 * and actually get joined — once they're signed in, rather than just ending
 * up on the home screen with no idea what to do next.
 */
export default function JoinGroupScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { apiFetch } = useApiClient();

  const [status, setStatus] = useState<'joining' | 'joined' | 'error'>('joining');
  const [group, setGroup] = useState<Group | null>(null);
  const [error, setError] = useState<string | null>(null);

  const join = useCallback(async () => {
    try {
      const result = await apiFetch<{ group: Group }>('/groups/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode: code }),
      });
      setGroup(result.group);
      setStatus('joined');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That invite link looks invalid');
      setStatus('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => {
    if (isLoaded && isSignedIn) join();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  if (!isLoaded) return null;
  if (!isSignedIn) {
    return <Redirect href={{ pathname: '/(auth)/sign-in', params: { returnTo: `/join/${code}` } }} />;
  }

  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-paper px-6">
      <View className={`w-full max-w-sm items-center gap-3 px-8 py-10 ${CARD}`}>
        {status === 'joining' && (
          <>
            <ActivityIndicator color="#F2776A" />
            <Text className="font-mono text-charcoal/60">Joining…</Text>
          </>
        )}
        {status === 'joined' && (
          <>
            <View className="mb-1 h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Text className="text-3xl">🎉</Text>
            </View>
            <Text className="text-center font-mono-bold text-xl text-charcoal">
              You're in {group?.name}!
            </Text>
            <Pressable
              onPress={() => router.replace('/')}
              className="mt-4 w-full items-center rounded-full bg-primary px-4 py-3 shadow-sm shadow-primary/20 active:opacity-85">
              <Text className="font-mono-bold text-white">Go to the group</Text>
            </Pressable>
          </>
        )}
        {status === 'error' && (
          <>
            <Text className="text-center font-mono-bold text-lg text-charcoal">Couldn't join</Text>
            <Text className="text-center font-mono text-sm text-charcoal/60">{error}</Text>
            <Pressable
              onPress={() => router.replace('/')}
              className="mt-4 w-full items-center rounded-full border border-paper-line px-4 py-3 active:opacity-70">
              <Text className="font-mono-bold text-charcoal">Go home</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
