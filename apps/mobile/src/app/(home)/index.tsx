import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { GroupSummary, ListMyGroupsResponse } from '@stay-in-touch/shared';

import { useApiClient } from '@/lib/api';

function formatDeadline(deadlineAt: string) {
  const date = new Date(deadlineAt);
  const daysLeft = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return 'Deadline passed';
  if (daysLeft === 0) return 'Deadline is today';
  if (daysLeft === 1) return '1 day left';
  return `${daysLeft} days left`;
}

function GroupCard({ group }: { group: GroupSummary }) {
  return (
    <View className="w-full rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
      <Text className="text-lg font-semibold text-black dark:text-white">{group.name}</Text>
      {group.openCycle ? (
        <Text className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          This month's cycle is open · {formatDeadline(group.openCycle.deadlineAt)}
        </Text>
      ) : (
        <Text className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          No cycle open yet — opens on the 1st of the month
        </Text>
      )}
    </View>
  );
}

export default function HomeScreen() {
  const { apiFetch } = useApiClient();
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
      await loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }, [apiFetch, inputValue, mode, loadGroups]);

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <ScrollView contentContainerClassName="items-center px-6 py-6 gap-4" className="flex-1">
        <Text className="w-full max-w-sm text-2xl font-bold text-black dark:text-white">Your groups</Text>

        {error && <Text className="w-full max-w-sm text-sm text-red-500">{error}</Text>}

        {groups === null && !error && <ActivityIndicator className="mt-8" />}

        {groups?.length === 0 && mode === 'list' && (
          <Text className="w-full max-w-sm text-neutral-500 dark:text-neutral-400">
            You're not in any group yet — create one or join with an invite code.
          </Text>
        )}

        {groups?.map((group) => <GroupCard key={group.id} group={group} />)}

        {mode === 'list' ? (
          <View className="w-full max-w-sm flex-row gap-3">
            <Pressable
              onPress={() => setMode('create')}
              className="flex-1 items-center rounded-full bg-black px-4 py-3 active:opacity-80 dark:bg-white">
              <Text className="font-semibold text-white dark:text-black">Create group</Text>
            </Pressable>
            <Pressable
              onPress={() => setMode('join')}
              className="flex-1 items-center rounded-full border border-black px-4 py-3 active:opacity-70 dark:border-white">
              <Text className="font-semibold text-black dark:text-white">Join group</Text>
            </Pressable>
          </View>
        ) : (
          <View className="w-full max-w-sm gap-3">
            <TextInput
              autoFocus
              value={inputValue}
              onChangeText={setInputValue}
              placeholder={mode === 'create' ? 'Group name' : 'Invite code'}
              placeholderTextColor="#a3a3a3"
              autoCapitalize={mode === 'create' ? 'words' : 'none'}
              className="rounded-xl border border-neutral-300 px-4 py-3 text-black dark:border-neutral-700 dark:text-white"
            />
            <View className="flex-row gap-3">
              <Pressable
                disabled={submitting}
                onPress={onSubmit}
                className="flex-1 items-center rounded-full bg-black px-4 py-3 active:opacity-80 disabled:opacity-50 dark:bg-white">
                <Text className="font-semibold text-white dark:text-black">
                  {submitting ? 'Saving…' : mode === 'create' ? 'Create' : 'Join'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setMode('list');
                  setInputValue('');
                }}
                className="flex-1 items-center rounded-full border border-neutral-300 px-4 py-3 active:opacity-70 dark:border-neutral-700">
                <Text className="font-semibold text-black dark:text-white">Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
