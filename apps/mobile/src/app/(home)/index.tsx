import { useClerk } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { GroupSummary, ListMyGroupsResponse } from '@stay-in-touch/shared';

import { useApiClient } from '@/lib/api';
import { BottomTabInset, WebTopBarInset } from '@/constants/theme';

const CARD = 'rounded-2xl border border-neutral-200 bg-white shadow-sm shadow-black/5';

type Urgency = 'plenty' | 'soon' | 'today' | 'passed';

function daysUntil(deadlineAt: string) {
  return Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function getUrgency(daysLeft: number): { urgency: Urgency; countdown: string } {
  if (daysLeft < 0) return { urgency: 'passed', countdown: 'Deadline passed' };
  if (daysLeft === 0) return { urgency: 'today', countdown: 'Due today!' };
  if (daysLeft === 1) return { urgency: 'soon', countdown: '1 day left' };
  if (daysLeft <= 3) return { urgency: 'soon', countdown: `${daysLeft} days left` };
  return { urgency: 'plenty', countdown: `${daysLeft} days left` };
}

const urgencyStyles: Record<Urgency, { dot: string; text: string }> = {
  plenty: { dot: 'bg-emerald-500', text: 'text-emerald-600' },
  soon: { dot: 'bg-amber-500', text: 'text-amber-600' },
  today: { dot: 'bg-red-500', text: 'text-red-600' },
  passed: { dot: 'bg-neutral-400', text: 'text-neutral-500' },
};

function GroupCard({ group }: { group: GroupSummary }) {
  const router = useRouter();
  const cycle = group.currentCycle;
  // Deliberately not gated on cycle.status: the deadline is what actually
  // determines whether you should still be able to get in and edit, not
  // whether someone has already triggered a preview send (see the /groups
  // route). Tapping in always works as long as a cycle exists.
  const cycleId = cycle?.id;

  let label: React.ReactNode = null;
  let dot = 'bg-neutral-400';
  if (cycle) {
    const daysLeft = daysUntil(cycle.deadlineAt);
    const { urgency, countdown } = getUrgency(daysLeft);
    dot = urgencyStyles[urgency].dot;
    const textClass = urgencyStyles[urgency].text;
    label =
      cycle.status === 'sent' && daysLeft >= 0 ? (
        <Text className={`text-sm font-medium ${textClass}`}>
          📬 Already sent once · {countdown} to add or change answers
        </Text>
      ) : cycle.status === 'sent' ? (
        <Text className="text-sm font-medium text-charcoal/50">📬 Sent — tap to view</Text>
      ) : (
        <Text className={`text-sm font-medium ${textClass}`}>
          This month's catch-up · {countdown} — tap to answer
        </Text>
      );
  }

  return (
    <Pressable
      disabled={!cycleId}
      onPress={() => cycleId && router.push({ pathname: '/cycles/[id]', params: { id: cycleId } })}
      className={`w-full gap-2 p-5 ${CARD} ${cycleId ? 'active:opacity-80' : ''}`}>
      <View className="flex-row items-center justify-between">
        <Text className="text-lg font-bold text-charcoal">{group.name}</Text>
        <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10">
          <Text className="text-base">👋</Text>
        </View>
      </View>
      {label ? (
        <View className="flex-row items-center gap-2">
          <View className={`h-2 w-2 rounded-full ${dot}`} />
          {label}
        </View>
      ) : (
        <Text className="text-sm text-charcoal/50">Next catch-up opens on the 1st 🗓️</Text>
      )}
    </Pressable>
  );
}

export default function HomeScreen() {
  const { apiFetch } = useApiClient();
  const { signOut } = useClerk();
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'list' | 'create' | 'join'>('list');
  const [inputValue, setInputValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadGroups = useCallback(async () => {
    try {
      const data = await apiFetch<ListMyGroupsResponse>('/groups');
      setGroups(data.groups);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load groups');
    }
  }, [apiFetch]);

  // Deliberately run once on mount, not on [loadGroups]: Clerk's getToken
  // (and therefore apiFetch, and therefore loadGroups) gets a new function
  // identity most renders, so depending on it here was an infinite fetch
  // loop — every fetch's setState triggered a re-render, which produced a
  // new loadGroups, which re-ran the effect. Refresh after create/join is
  // triggered explicitly in onSubmit instead.
  useEffect(() => {
    loadGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = useCallback(async () => {
    if (!inputValue.trim()) return;
    setSubmitting(true);
    try {
      if (mode === 'create') {
        await apiFetch('/groups', { method: 'POST', body: JSON.stringify({ name: inputValue.trim() }) });
      } else if (mode === 'join') {
        await apiFetch('/groups/join', {
          method: 'POST',
          body: JSON.stringify({ inviteCode: inputValue.trim() }),
        });
      }
      setInputValue('');
      setMode('list');
      setError(null);
      await loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }, [apiFetch, inputValue, mode, loadGroups]);

  return (
    <SafeAreaView className="flex-1 bg-neutral-50">
      <ScrollView
        contentContainerClassName="items-center px-6 py-8 gap-4"
        className="flex-1"
        contentContainerStyle={{
          paddingTop: Platform.OS === 'web' ? WebTopBarInset : undefined,
          paddingBottom: Platform.OS !== 'web' ? BottomTabInset : undefined,
        }}>
        <View className="w-full max-w-xl flex-row items-start justify-between">
          <View>
            <Text className="text-3xl font-extrabold tracking-tight text-charcoal">Your groups</Text>
            <Text className="mt-1 text-sm text-charcoal/50">
              Everyone's monthly catch-ups, in one place.
            </Text>
          </View>
          <Pressable onPress={() => signOut()} className="rounded-lg px-3 py-2 active:opacity-60">
            <Text className="text-sm font-medium text-charcoal/50">Sign out</Text>
          </Pressable>
        </View>

        {error && (
          <Text className="w-full max-w-xl rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </Text>
        )}

        {groups === null && !error && <ActivityIndicator className="mt-8" color="#FF6B4A" />}

        <View className="w-full max-w-xl gap-4">
          {groups?.length === 0 && mode === 'list' && (
            <View className={`items-center gap-2 px-6 py-10 ${CARD}`}>
              <View className="mb-1 h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Text className="text-2xl">🎉</Text>
              </View>
              <Text className="text-center text-base font-semibold text-charcoal">No groups yet</Text>
              <Text className="max-w-[260px] text-center text-sm text-charcoal/50">
                Start one with your friends, or join with an invite code.
              </Text>
            </View>
          )}

          {groups?.map((group) => <GroupCard key={group.id} group={group} />)}

          {mode === 'list' ? (
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => setMode('create')}
                className="flex-1 items-center rounded-xl bg-primary px-4 py-3 shadow-sm shadow-primary/30 active:opacity-85">
                <Text className="font-semibold text-white">✨ Create group</Text>
              </Pressable>
              <Pressable
                onPress={() => setMode('join')}
                className={`flex-1 items-center px-4 py-3 ${CARD} active:opacity-70`}>
                <Text className="font-semibold text-charcoal">Join group</Text>
              </Pressable>
            </View>
          ) : (
            <View className={`gap-3 p-5 ${CARD}`}>
              <Text className="font-semibold text-charcoal">
                {mode === 'create' ? '✨ Name your group' : '🔑 Got an invite code?'}
              </Text>
              <TextInput
                autoFocus
                value={inputValue}
                onChangeText={setInputValue}
                placeholder={mode === 'create' ? 'e.g. The Book Club' : 'Paste it here'}
                placeholderTextColor="#A3A3A3"
                autoCapitalize={mode === 'create' ? 'words' : 'none'}
                className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-charcoal"
              />
              <View className="flex-row gap-3">
                <Pressable
                  disabled={submitting}
                  onPress={onSubmit}
                  className="flex-1 items-center rounded-xl bg-primary px-4 py-3 shadow-sm shadow-primary/30 active:opacity-85 disabled:opacity-50">
                  <Text className="font-semibold text-white">
                    {submitting ? 'Saving…' : mode === 'create' ? 'Create' : 'Join'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setMode('list');
                    setInputValue('');
                  }}
                  className="flex-1 items-center rounded-xl border border-neutral-200 px-4 py-3 active:opacity-70">
                  <Text className="font-semibold text-charcoal">Cancel</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
