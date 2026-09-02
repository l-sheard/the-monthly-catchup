import { useAuth } from '@clerk/expo';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CycleDetailResponse } from '@stay-in-touch/shared';

import { useApiClient } from '@/lib/api';
import { MediaAttachment } from '@/components/media-attachment';

const CARD = 'rounded-2xl border border-paper-line bg-white shadow-sm shadow-black/5';
const PLACEHOLDER = '#7C9188';

const QUESTION_EMOJI: Record<string, string> = {
  text: '💬',
  favourites: '⭐',
  recipe: '🍳',
  photo: '📸',
  voice: '🎙️',
  meetup: '📅',
};

export default function CycleDetailScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { apiFetch } = useApiClient();

  const [data, setData] = useState<CycleDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string>>({});
  const [savingAnswers, setSavingAnswers] = useState(false);
  const [suggestionInput, setSuggestionInput] = useState('');
  const [addingSuggestion, setAddingSuggestion] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const detail = await apiFetch<CycleDetailResponse>(`/cycles/${id}`);
      setData(detail);
      setDraftAnswers(detail.myAnswers);
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

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;

  const saveAnswers = async () => {
    if (!data) return;
    setSavingAnswers(true);
    try {
      await Promise.all(
        data.questions.map((q) => {
          const bodyText = draftAnswers[q.id] ?? '';
          if (bodyText === (data.myAnswers[q.id] ?? '')) return Promise.resolve(); // unchanged
          return apiFetch('/cycles/answers', {
            method: 'POST',
            body: JSON.stringify({ cycleId: data.cycle.id, questionId: q.id, bodyText }),
          });
        }),
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save answers');
    } finally {
      setSavingAnswers(false);
    }
  };

  const addSuggestion = async () => {
    if (!suggestionInput.trim() || !data) return;
    setAddingSuggestion(true);
    try {
      await apiFetch(`/cycles/${data.cycle.id}/meetup-suggestions`, {
        method: 'POST',
        body: JSON.stringify({ bodyText: suggestionInput.trim() }),
      });
      setSuggestionInput('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add suggestion');
    } finally {
      setAddingSuggestion(false);
    }
  };

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
        parts.push(`Failed for ${result.failed.map((f) => f.email).join(', ')} (dev sandbox likely restricts non-owner addresses)`);
      }
      setSendResult(parts.join(' — '));
      await load();
    } catch (err) {
      setSendResult(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

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
              <Text className="font-mono-bold text-3xl tracking-tight text-charcoal">
                {data.groupName}
              </Text>
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
            <View className={`gap-5 p-5 ${CARD}`}>
              {data.questions.map((q) => (
                <View key={q.id} className="gap-2">
                  <Text className="font-mono-bold text-sm text-charcoal">
                    {QUESTION_EMOJI[q.type] ?? '💬'} {q.promptText}
                  </Text>
                  {/* Photo and voice questions have no shared question-level
                      answer box: voice is just the recording, and a photo
                      question's "caption" is per-photo (see
                      MediaAttachment/PhotoThumbnail), not one field shared
                      across every photo attached to the question. */}
                  {q.type !== 'voice' && q.type !== 'photo' && (
                    <TextInput
                      multiline
                      value={draftAnswers[q.id] ?? ''}
                      onChangeText={(text) => setDraftAnswers((prev) => ({ ...prev, [q.id]: text }))}
                      placeholder="Your answer…"
                      placeholderTextColor={PLACEHOLDER}
                      className="min-h-[64px] rounded-xl border border-sand-line bg-sand px-4 py-3 font-mono text-charcoal"
                    />
                  )}
                  {(q.type === 'photo' || q.type === 'voice') && (
                    <MediaAttachment
                      cycleId={data.cycle.id}
                      questionId={q.id}
                      kind={q.type === 'photo' ? 'photo' : 'audio'}
                      existingMedia={data.myMedia[q.id] ?? []}
                      onChange={load}
                    />
                  )}
                </View>
              ))}
              <Pressable
                disabled={savingAnswers}
                onPress={saveAnswers}
                className="items-center rounded-full bg-primary px-4 py-3 shadow-sm shadow-primary/20 active:opacity-85 disabled:opacity-50">
                <Text className="font-mono-bold text-white">
                  {savingAnswers ? 'Saving…' : 'Save my answers'}
                </Text>
              </Pressable>
            </View>

            {/* Web-only hidden for now, per feedback — kept for native. */}
            {Platform.OS !== 'web' && (
              <View className={`gap-3 p-5 ${CARD}`}>
                <Text className="font-mono-bold text-charcoal">📅 Meetup suggestions</Text>
                {data.meetupSuggestions.length === 0 && (
                  <Text className="font-mono text-sm text-charcoal/60">No suggestions yet — add one below.</Text>
                )}
                {data.meetupSuggestions.map((s) => (
                  <View key={s.id} className="rounded-xl bg-sand px-3 py-2">
                    <Text className="font-mono text-sm text-charcoal">
                      <Text className="font-mono-bold">{s.authorName}: </Text>
                      {s.bodyText}
                    </Text>
                  </View>
                ))}
                <View className="flex-row gap-2">
                  <TextInput
                    value={suggestionInput}
                    onChangeText={setSuggestionInput}
                    placeholder="e.g. Picnic in the park?"
                    placeholderTextColor={PLACEHOLDER}
                    className="flex-1 rounded-xl border border-sand-line bg-sand px-4 py-3 font-mono text-charcoal"
                  />
                  <Pressable
                    disabled={addingSuggestion}
                    onPress={addSuggestion}
                    className="items-center justify-center rounded-full bg-primary px-4 py-3 shadow-sm shadow-primary/20 active:opacity-85 disabled:opacity-50">
                    <Text className="font-mono-bold text-white">Add</Text>
                  </Pressable>
                </View>
              </View>
            )}

            <View className={`gap-2 p-5 ${CARD}`}>
              <Text className="font-mono-bold text-charcoal">💌 Newsletter</Text>
              <Text className="font-mono text-sm text-charcoal/60">
                Normally this compiles and sends automatically at the deadline — this button triggers
                it manually so you can see the email now.
              </Text>
              <Pressable
                disabled={sending}
                onPress={sendNewsletter}
                className="items-center rounded-full border border-paper-line px-4 py-3 active:opacity-70 disabled:opacity-50">
                <Text className="font-mono-bold text-charcoal">
                  {sending ? 'Sending…' : 'Send newsletter now'}
                </Text>
              </Pressable>
              {sendResult && <Text className="font-mono text-sm text-charcoal/70">{sendResult}</Text>}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
