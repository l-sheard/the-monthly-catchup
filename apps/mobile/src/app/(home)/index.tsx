import { useClerk } from '@clerk/expo';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { GroupSummary, ListMyGroupsResponse } from '@stay-in-touch/shared';

import { useApiClient } from '@/lib/api';
import { BottomTabInset, WebTopBarInset } from '@/constants/theme';

type Urgency = 'plenty' | 'soon' | 'today' | 'passed';

function getUrgency(deadlineAt: string): { urgency: Urgency; label: string } {
  const daysLeft = Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return { urgency: 'passed', label: 'Deadline passed' };
  if (daysLeft === 0) return { urgency: 'today', label: 'Due today!' };
  if (daysLeft === 1) return { urgency: 'soon', label: '1 day left' };
  if (daysLeft <= 3) return { urgency: 'soon', label: `${daysLeft} days left` };
  return { urgency: 'plenty', label: `${daysLeft} days left` };
}

const urgencyStyles: Record<Urgency, { dot: string; text: string }> = {
  plenty: { dot: 'bg-emerald-500', text: 'text-emerald-600' },
  soon: { dot: 'bg-amber-500', text: 'text-amber-600' },
  today: { dot: 'bg-red-500', text: 'text-red-600' },
  passed: { dot: 'bg-neutral-400', text: 'text-neutral-500' },
};

function GroupCard({ group }: { group: GroupSummary }) {
  const status = group.openCycle ? getUrgency(group.openCycle.deadlineAt) : null;

  return (
    <View className="w-full gap-2 rounded-2xl bg-sand p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-lg font-bold text-charcoal">{group.name}</Text>
        <Text className="text-xl">👋</Text>
      </View>
      {status ? (
        <View className="flex-row items-center gap-2">
          <View className={`h-2 w-2 rounded-full ${urgencyStyles[status.urgency].dot}`} />
          <Text className={`text-sm font-medium ${urgencyStyles[status.urgency].text}`}>
            This month's catch-up · {status.label}
          </Text>
        </View>
      ) : (
        <Text className="text-sm text-charcoal/50">Next catch-up opens on the 1st 🗓️</Text>
      )}
    </View>
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
    <SafeAreaView className="flex-1 bg-cream">
      <ScrollView
        contentContainerClassName="items-center px-6 py-6 gap-4"
        className="flex-1"
        contentContainerStyle={{
          paddingTop: Platform.OS === 'web' ? WebTopBarInset : undefined,
          paddingBottom: Platform.OS !== 'web' ? BottomTabInset : undefined,
        }}>
        <View className="w-full max-w-sm flex-row items-start justify-between">
          <View>
            <Text className="text-3xl font-extrabold text-charcoal">Your groups</Text>
            <Text className="mt-1 text-sm text-charcoal/50">
              Everyone's monthly catch-ups, in one place.
            </Text>
          </View>
          <Pressable
            onPress={() => signOut()}
            className="rounded-full bg-sand px-3 py-2 active:opacity-70">
            <Text className="text-sm font-medium text-charcoal/70">Sign out</Text>
          </Pressable>
        </View>

        {error && (
          <Text className="w-full max-w-sm rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-600">
            {error}
          </Text>
        )}

        {groups === null && !error && <ActivityIndicator className="mt-8" color="#FF6B4A" />}

        {groups?.length === 0 && mode === 'list' && (
          <View className="w-full max-w-sm items-center gap-2 rounded-2xl bg-sand py-8">
            <Text className="text-4xl">🎉</Text>
            <Text className="text-center text-base font-medium text-charcoal">No groups yet</Text>
            <Text className="max-w-[240px] text-center text-sm text-charcoal/50">
              Start one with your friends, or join with an invite code.
            </Text>
          </View>
        )}

        {groups?.map((group) => <GroupCard key={group.id} group={group} />)}

        {mode === 'list' ? (
          <View className="w-full max-w-sm flex-row gap-3">
            <Pressable
              onPress={() => setMode('create')}
              className="flex-1 items-center rounded-full bg-primary px-4 py-3 active:opacity-85">
              <Text className="font-semibold text-white">✨ Create group</Text>
            </Pressable>
            <Pressable
              onPress={() => setMode('join')}
              className="flex-1 items-center rounded-full bg-sand px-4 py-3 active:opacity-70">
              <Text className="font-semibold text-charcoal">Join group</Text>
            </Pressable>
          </View>
        ) : (
          <View className="w-full max-w-sm gap-3 rounded-2xl bg-sand p-4">
            <Text className="font-semibold text-charcoal">
              {mode === 'create' ? '✨ Name your group' : '🔑 Got an invite code?'}
            </Text>
            <TextInput
              autoFocus
              value={inputValue}
              onChangeText={setInputValue}
              placeholder={mode === 'create' ? 'e.g. The Book Club' : 'Paste it here'}
              placeholderTextColor="#8A7F76"
              autoCapitalize={mode === 'create' ? 'words' : 'none'}
              className="rounded-xl bg-cream px-4 py-3 text-charcoal"
            />
            <View className="flex-row gap-3">
              <Pressable
                disabled={submitting}
                onPress={onSubmit}
                className="flex-1 items-center rounded-full bg-primary px-4 py-3 active:opacity-85 disabled:opacity-50">
                <Text className="font-semibold text-white">
                  {submitting ? 'Saving…' : mode === 'create' ? 'Create' : 'Join'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setMode('list');
                  setInputValue('');
                }}
                className="flex-1 items-center rounded-full bg-cream px-4 py-3 active:opacity-70">
                <Text className="font-semibold text-charcoal">Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
