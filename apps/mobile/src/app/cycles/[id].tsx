import { useAuth } from '@clerk/expo';
import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CycleDetailResponse, ListNewslettersResponse, NewsletterSummary } from '@stay-in-touch/shared';

import { useApiClient } from '@/lib/api';

const CARD = 'rounded-2xl border border-paper-line bg-white shadow-sm shadow-black/5';

/**
 * Landing page for a group's cycle — reached by tapping a group card on the
 * home screen. Deliberately light: who's in the group, a single CTA into
 * the actual answer form (cycles/[id]/answer.tsx), and the newsletter
 * archive. The question-answering UI used to live directly on this screen;
 * it moved to its own route so tapping into a group doesn't dump the whole
 * form in your face before you've decided to fill anything in.
 */
export default function CycleOverviewScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { apiFetch } = useApiClient();

  const [data, setData] = useState<CycleDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newsletters, setNewsletters] = useState<NewsletterSummary[] | null>(null);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const detail = await apiFetch<CycleDetailResponse>(`/cycles/${id}`);
      setData(detail);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Same pattern as the home screen: apiFetch's identity isn't stable
  // (wraps Clerk's getToken), so this only runs once on mount deliberately.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groupId = data?.cycle.groupId;
  const loadNewsletters = useCallback(async () => {
    if (!groupId) return;
    try {
      const res = await apiFetch<ListNewslettersResponse>(`/groups/${groupId}/newsletters`);
      setNewsletters(res.newsletters);
    } catch {
      // Best-effort — the rest of the screen is fine without the archive.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  // groupId is only known once `load()` above resolves, so this can't be
  // folded into the mount effect — but it only ever transitions once
  // (undefined -> the real id).
  useEffect(() => {
    loadNewsletters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;

  const sendNewsletter = async () => {
    if (!data) return;
    setSending(true);
    setSendResult(null);
    try {
      const result = await apiFetch<{ sentTo: string[]; failed: { email: string; error: string }[] }>(
        `/cycles/${data.cycle.id}/send-newsletter`,
        { method: 'POST' },
      );
      const parts = [];
      if (result.sentTo.length) parts.push(`Sent to ${result.sentTo.join(', ')}`);
      if (result.failed.length) {
        parts.push(
          `Failed for ${result.failed.map((f) => f.email).join(', ')} (dev sandbox likely restricts non-owner addresses)`,
        );
      }
      setSendResult(parts.join(' — '));
      await load();
      await loadNewsletters();
    } catch (err) {
      setSendResult(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const monthName = data
    ? new Date(Date.UTC(data.cycle.year, data.cycle.month - 1, 1)).toLocaleString('en-US', { month: 'long' })
    : '';
  // Whether the caller has put in anything at all this cycle — the same
  // "did they actually answer" check the newsletter/homepage use, done
  // client-side here since this response doesn't carry a precomputed flag.
  const hasAnswered =
    !!data &&
    (Object.values(data.myAnswers).some((v) => v.trim() !== '') ||
      Object.values(data.myLinks).some((v) => v.trim() !== '') ||
      Object.values(data.myMedia).some((m) => m.length > 0));

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScrollView contentContainerClassName="items-center px-6 py-8 gap-4" className="flex-1">
        <View className="w-full max-w-xl">
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            className="mb-3 self-start active:opacity-60">
            <Text className="font-mono text-sm text-charcoal/60">← Back</Text>
          </Pressable>

          {data && (
            <>
              <Text className="font-mono-bold text-3xl tracking-tight text-charcoal">{data.groupName}</Text>
              <Text className="mt-1 font-mono text-sm text-charcoal/60">
                {new Date(data.cycle.deadlineAt).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                })}{' '}
                deadline · status: {data.cycle.status}
              </Text>
              <View className="mt-3 flex-row flex-wrap gap-2">
                {data.members.map((member) => (
                  <View
                    key={member.id}
                    className="flex-row items-center gap-1.5 rounded-full border border-paper-line bg-white px-3 py-1.5">
                    <View className="h-5 w-5 items-center justify-center rounded-full bg-primary/15">
                      <Text className="font-mono-bold text-[10px] text-primary">
                        {member.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text className="font-mono text-xs text-charcoal">
                      {member.name}
                      {member.role === 'owner' ? ' 👑' : ''}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        {error && (
          <Text className="w-full max-w-xl rounded-xl bg-red-50 px-3 py-2 font-mono text-sm text-red-600">
            {error}
          </Text>
        )}

        {!data && !error && <ActivityIndicator className="mt-8" color="#F2776A" />}

        {data && (
          <View className="w-full max-w-xl gap-4">
            <Pressable
              // Typed routes doesn't generate a pathname literal for
              // cycles/[id]/answer.tsx (the [id]/ directory colliding with
              // the sibling [id].tsx file's own segment name isn't a case
              // its codegen covers) even though the route itself resolves
              // fine at runtime — confirmed via `expo export`, which lists
              // it as a real static route. String href + cast, same escape
              // hatch sign-in.tsx's returnTo redirect already uses.
              onPress={() => router.push(`/cycles/${data.cycle.id}/answer` as Href)}
              className={`flex-row items-center gap-3 p-5 ${CARD} active:opacity-80`}>
              <View className="flex-1 gap-1">
                <Text className="font-mono-bold text-base text-charcoal">
                  {hasAnswered ? `✓ Edit your ${monthName} entry` : `Fill out your ${monthName} entry`}
                </Text>
                <Text className="font-mono text-sm text-charcoal/60">
                  {hasAnswered
                    ? 'You’ve already answered — tap to add or change anything.'
                    : 'What you’ve been up to, favourites, a recipe, and more.'}
                </Text>
              </View>
              <Text className="font-mono-bold text-xl text-primary">→</Text>
            </Pressable>

            <View className={`gap-2 p-5 ${CARD}`}>
              <Text className="font-mono-bold text-charcoal">💌 Newsletters</Text>
              <Text className="font-mono text-sm text-charcoal/60">
                Normally this compiles and sends automatically at the deadline — this button triggers it
                manually so you can see the email now.
              </Text>
              <Pressable
                disabled={sending}
                onPress={sendNewsletter}
                className="items-center rounded-full border border-paper-line px-4 py-3 active:opacity-70 disabled:opacity-50">
                <Text className="font-mono-bold text-charcoal">
                  {sending ? 'Sending…' : 'Send this month’s newsletter now'}
                </Text>
              </Pressable>
              {sendResult && <Text className="font-mono text-sm text-charcoal/70">{sendResult}</Text>}

              <View className="mt-2 gap-2 border-t border-paper-line pt-3">
                <Text className="font-mono-bold text-sm text-charcoal">Previous editions</Text>
                {newsletters === null ? (
                  <ActivityIndicator color="#F2776A" />
                ) : newsletters.length === 0 ? (
                  <Text className="font-mono text-sm text-charcoal/60">Nothing sent yet.</Text>
                ) : (
                  newsletters.map((n) => (
                    <Pressable
                      key={n.id}
                      onPress={() => Linking.openURL(n.viewUrl)}
                      className="flex-row items-center justify-between rounded-xl bg-sand px-3 py-2 active:opacity-70">
                      <Text className="font-mono text-sm text-charcoal">
                        {new Date(n.year, n.month - 1, 1).toLocaleString('en-US', {
                          month: 'long',
                          year: 'numeric',
                        })}
                      </Text>
                      <Text className="font-mono-bold text-xs text-primary">View →</Text>
                    </Pressable>
                  ))
                )}
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
