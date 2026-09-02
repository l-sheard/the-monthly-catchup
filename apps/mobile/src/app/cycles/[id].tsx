import { useAuth } from '@clerk/expo';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CycleDetailResponse, ListNewslettersResponse, NewsletterSummary } from '@stay-in-touch/shared';

import { useApiClient } from '@/lib/api';
import { MediaAttachment } from '@/components/media-attachment';

const CARD = 'rounded-2xl border border-paper-line bg-white shadow-sm shadow-black/5';
const PLACEHOLDER = '#7C9188';

// Recipe links are free text (people paste them without a protocol), so add
// one before handing to Linking.openURL — mirrors lib/newsletter.ts's
// normalizeUrl on the API side.
function normalizeUrl(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

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
  const [draftLinks, setDraftLinks] = useState<Record<string, string>>({});
  const [savingAnswers, setSavingAnswers] = useState(false);
  const [suggestionInput, setSuggestionInput] = useState('');
  const [addingSuggestion, setAddingSuggestion] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [newsletters, setNewsletters] = useState<NewsletterSummary[] | null>(null);
  const [questionSuggestionInput, setQuestionSuggestionInput] = useState('');
  const [addingQuestionSuggestion, setAddingQuestionSuggestion] = useState(false);

  const load = useCallback(async () => {
    try {
      const detail = await apiFetch<CycleDetailResponse>(`/cycles/${id}`);
      setData(detail);
      setDraftAnswers(detail.myAnswers);
      setDraftLinks(detail.myLinks);
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
  // (undefined -> the real id), even though load() itself re-runs after
  // every save/upload, so this doesn't refetch the archive on every one of
  // those.
  useEffect(() => {
    loadNewsletters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;

  const saveAnswers = async () => {
    if (!data) return;
    setSavingAnswers(true);
    try {
      await Promise.all(
        data.questions.map((q) => {
          const bodyText = draftAnswers[q.id] ?? '';
          const linkUrl = draftLinks[q.id] ?? '';
          const unchanged =
            bodyText === (data.myAnswers[q.id] ?? '') && linkUrl === (data.myLinks[q.id] ?? '');
          if (unchanged) return Promise.resolve();
          return apiFetch('/cycles/answers', {
            method: 'POST',
            body: JSON.stringify({ cycleId: data.cycle.id, questionId: q.id, bodyText, linkUrl }),
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

  const addQuestionSuggestion = async () => {
    if (!questionSuggestionInput.trim() || !data) return;
    setAddingQuestionSuggestion(true);
    try {
      await apiFetch(`/cycles/${data.cycle.id}/question-suggestions`, {
        method: 'POST',
        body: JSON.stringify({ promptText: questionSuggestionInput.trim() }),
      });
      setQuestionSuggestionInput('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add suggestion');
    } finally {
      setAddingQuestionSuggestion(false);
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
      await loadNewsletters();
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
                  {/* Voice questions have no shared question-level answer
                      box (just the recording). Photo questions don't either
                      — a photo question's "caption" is per-photo (see
                      MediaAttachment/PhotoThumbnail), not one field shared
                      across every photo attached to it. Recipe questions
                      keep the text box AND get the same photo attachment a
                      photo question gets, for a photo of the dish. */}
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
                  {/* Recipe questions also get a link field, separate from
                      the body text — a URL to the original recipe, not
                      instructions typed out by hand. Saved together with the
                      rest of the answers on "Save my answers", not live. */}
                  {q.type === 'recipe' && (
                    <TextInput
                      value={draftLinks[q.id] ?? ''}
                      onChangeText={(text) => setDraftLinks((prev) => ({ ...prev, [q.id]: text }))}
                      placeholder="🔗 Link to the recipe (optional)"
                      placeholderTextColor={PLACEHOLDER}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                      className="rounded-xl border border-sand-line bg-sand px-4 py-3 font-mono text-charcoal"
                    />
                  )}
                  {q.type === 'recipe' && !!data.myLinks[q.id] && (
                    <Pressable
                      onPress={() => Linking.openURL(normalizeUrl(data.myLinks[q.id]))}
                      className="self-start active:opacity-60">
                      <Text className="font-mono text-xs text-primary">Open saved link ↗</Text>
                    </Pressable>
                  )}
                  {(q.type === 'photo' || q.type === 'voice' || q.type === 'recipe') && (
                    <MediaAttachment
                      cycleId={data.cycle.id}
                      questionId={q.id}
                      kind={q.type === 'voice' ? 'audio' : 'photo'}
                      existingMedia={data.myMedia[q.id] ?? []}
                      onChange={load}
                      maxCount={q.type === 'recipe' ? 1 : undefined}
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

            <View className={`gap-3 p-5 ${CARD}`}>
              <Text className="font-mono-bold text-charcoal">💡 Suggest a question for next month</Text>
              <Text className="font-mono text-sm text-charcoal/60">
                Each new month, one pending suggestion gets picked at random and added to that
                month's questions.
              </Text>
              {data.questionSuggestions.length > 0 && (
                <View className="gap-2">
                  {data.questionSuggestions.map((s) => (
                    <View key={s.id} className="rounded-xl bg-sand px-3 py-2">
                      <Text className="font-mono text-sm text-charcoal">
                        <Text className="font-mono-bold">{s.authorName}: </Text>
                        {s.promptText}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              <View className="flex-row gap-2">
                <TextInput
                  value={questionSuggestionInput}
                  onChangeText={setQuestionSuggestionInput}
                  placeholder="e.g. What's your comfort rewatch?"
                  placeholderTextColor={PLACEHOLDER}
                  className="flex-1 rounded-xl border border-sand-line bg-sand px-4 py-3 font-mono text-charcoal"
                />
                <Pressable
                  disabled={addingQuestionSuggestion}
                  onPress={addQuestionSuggestion}
                  className="items-center justify-center rounded-full bg-primary px-4 py-3 shadow-sm shadow-primary/20 active:opacity-85 disabled:opacity-50">
                  <Text className="font-mono-bold text-white">Suggest</Text>
                </Pressable>
              </View>
            </View>

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

              {newsletters && newsletters.length > 0 && (
                <View className="mt-2 gap-2 border-t border-paper-line pt-3">
                  <Text className="font-mono-bold text-sm text-charcoal">📬 Past newsletters</Text>
                  {newsletters.map((n) => (
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
                  ))}
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
