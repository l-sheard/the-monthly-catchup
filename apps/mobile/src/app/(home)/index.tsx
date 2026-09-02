import { useClerk } from '@clerk/expo';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Group, GroupSummary, ListMyGroupsResponse } from '@stay-in-touch/shared';

import { useApiClient } from '@/lib/api';
import { BottomTabInset, WebTopBarInset } from '@/constants/theme';

const CARD = 'rounded-2xl border border-paper-line bg-white shadow-sm shadow-black/5';

// The current page's own origin on web — always correct for wherever this
// build is actually being served from (localhost in dev, the real domain
// once deployed), no separate config needed. Native has no equivalent
// (there's no browser address bar), so the link portion of the share panel
// just doesn't render there — the code still does, which is all a native
// user needs since they're pasting it into this same app.
const WEB_APP_URL = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : null;

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
        <Text className={`font-mono text-sm ${textClass}`}>
          📬 Already sent once · {countdown} to add or change answers
        </Text>
      ) : cycle.status === 'sent' ? (
        <Text className="font-mono text-sm text-charcoal/60">📬 Sent — tap to view</Text>
      ) : (
        <Text className={`font-mono text-sm ${textClass}`}>
          This month's catch-up · {countdown} — tap to answer
        </Text>
      );
  }

  return (
    <Pressable
      disabled={!cycleId}
      onPress={() => cycleId && router.push({ pathname: '/cycles/[id]', params: { id: cycleId } })}
      className={`w-full gap-3 p-5 ${CARD} ${cycleId ? 'active:opacity-80' : ''}`}>
      <Text className="font-mono-bold text-lg text-charcoal">{group.name}</Text>

      <View className="flex-row flex-wrap gap-2">
        {group.members.map((member) => (
          <View
            key={member.id}
            className="flex-row items-center gap-1.5 rounded-full border border-paper-line bg-sand px-3 py-1.5">
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

      {label ? (
        <View className="flex-row items-center gap-2">
          <View className={`h-2 w-2 rounded-full ${dot}`} />
          {label}
        </View>
      ) : (
        <Text className="font-mono text-sm text-charcoal/60">Next catch-up opens on the 1st 🗓️</Text>
      )}
    </Pressable>
  );
}

export default function HomeScreen() {
  const { apiFetch } = useApiClient();
  const { signOut } = useClerk();
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'list' | 'create' | 'join' | 'share'>('list');
  const [inputValue, setInputValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdGroup, setCreatedGroup] = useState<Group | null>(null);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

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
        const { group } = await apiFetch<{ group: Group }>('/groups', {
          method: 'POST',
          body: JSON.stringify({ name: inputValue.trim() }),
        });
        setInputValue('');
        setError(null);
        setCreatedGroup(group);
        setMode('share'); // show the invite code/link before dropping back to the list
        await loadGroups();
        return;
      }
      await apiFetch('/groups/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode: inputValue.trim() }),
      });
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

  const copy = useCallback(async (text: string, which: 'code' | 'link') => {
    await Clipboard.setStringAsync(text);
    setCopied(which);
    setTimeout(() => setCopied((c) => (c === which ? null : c)), 2000);
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScrollView
        contentContainerClassName="items-center px-6 py-8 gap-4"
        className="flex-1"
        contentContainerStyle={{
          paddingTop: Platform.OS === 'web' ? WebTopBarInset : undefined,
          paddingBottom: Platform.OS !== 'web' ? BottomTabInset : undefined,
        }}>
        <View className="w-full max-w-xl flex-row items-start justify-between">
          <View>
            <Text className="font-mono-bold text-3xl tracking-tight text-charcoal">Your groups</Text>
            <Text className="mt-1 font-mono text-sm text-charcoal/60">
              Everyone's monthly catch-ups, in one place.
            </Text>
          </View>
          <Pressable onPress={() => signOut()} className="rounded-lg px-3 py-2 active:opacity-60">
            <Text className="font-mono text-sm text-charcoal/60">Sign out</Text>
          </Pressable>
        </View>

        {error && (
          <Text className="w-full max-w-xl rounded-xl bg-red-50 px-3 py-2 font-mono text-sm text-red-600">
            {error}
          </Text>
        )}

        {groups === null && !error && <ActivityIndicator className="mt-8" color="#F2776A" />}

        <View className="w-full max-w-xl gap-4">
          {groups?.length === 0 && mode === 'list' && (
            <View className={`items-center gap-2 px-6 py-10 ${CARD}`}>
              <View className="mb-1 h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Text className="text-2xl">🎉</Text>
              </View>
              <Text className="text-center font-mono-bold text-base text-charcoal">No groups yet</Text>
              <Text className="max-w-[260px] text-center font-mono text-sm text-charcoal/60">
                Start one with your friends, or join with an invite code.
              </Text>
            </View>
          )}

          {groups?.map((group) => <GroupCard key={group.id} group={group} />)}

          {mode === 'list' && (
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => setMode('create')}
                className="flex-1 items-center rounded-full bg-primary px-4 py-3 shadow-sm shadow-primary/20 active:opacity-85">
                <Text className="font-mono-bold text-white">✨ Create group</Text>
              </Pressable>
              <Pressable
                onPress={() => setMode('join')}
                className="flex-1 items-center rounded-full border border-paper-line bg-white px-4 py-3 active:opacity-70">
                <Text className="font-mono-bold text-charcoal">Join group</Text>
              </Pressable>
            </View>
          )}

          {(mode === 'create' || mode === 'join') && (
            <View className={`gap-3 p-5 ${CARD}`}>
              <Text className="font-mono-bold text-charcoal">
                {mode === 'create' ? '✨ Name your group' : '🔑 Got an invite code?'}
              </Text>
              <TextInput
                autoFocus
                value={inputValue}
                onChangeText={setInputValue}
                placeholder={mode === 'create' ? 'e.g. The Book Club' : 'Paste it here'}
                placeholderTextColor="#7C9188"
                autoCapitalize={mode === 'create' ? 'words' : 'none'}
                className="rounded-xl border border-sand-line bg-sand px-4 py-3 font-mono text-charcoal"
              />
              <View className="flex-row gap-3">
                <Pressable
                  disabled={submitting}
                  onPress={onSubmit}
                  className="flex-1 items-center rounded-full bg-primary px-4 py-3 shadow-sm shadow-primary/20 active:opacity-85 disabled:opacity-50">
                  <Text className="font-mono-bold text-white">
                    {submitting ? 'Saving…' : mode === 'create' ? 'Create' : 'Join'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setMode('list');
                    setInputValue('');
                  }}
                  className="flex-1 items-center rounded-full border border-paper-line px-4 py-3 active:opacity-70">
                  <Text className="font-mono-bold text-charcoal">Cancel</Text>
                </Pressable>
              </View>
            </View>
          )}

          {mode === 'share' && createdGroup && (
            <View className={`gap-3 p-5 ${CARD}`}>
              <Text className="font-mono-bold text-charcoal">
                🎉 {createdGroup.name} is ready — invite your friends
              </Text>

              <View className="gap-1.5">
                <Text className="font-mono text-xs text-charcoal/60">Join code</Text>
                <View className="flex-row items-center gap-2">
                  <Text className="flex-1 rounded-xl border border-sand-line bg-sand px-4 py-3 font-mono-bold text-charcoal">
                    {createdGroup.inviteCode}
                  </Text>
                  <Pressable
                    onPress={() => copy(createdGroup.inviteCode, 'code')}
                    className="items-center justify-center rounded-full border border-paper-line bg-white px-4 py-3 active:opacity-70">
                    <Text className="font-mono-bold text-charcoal">{copied === 'code' ? 'Copied!' : 'Copy'}</Text>
                  </Pressable>
                </View>
              </View>

              {WEB_APP_URL && (
                <View className="gap-1.5">
                  <Text className="font-mono text-xs text-charcoal/60">Or share this link</Text>
                  <View className="flex-row items-center gap-2">
                    <Text
                      numberOfLines={1}
                      className="flex-1 rounded-xl border border-sand-line bg-sand px-4 py-3 font-mono text-sm text-charcoal">
                      {`${WEB_APP_URL}/join/${createdGroup.inviteCode}`}
                    </Text>
                    <Pressable
                      onPress={() => copy(`${WEB_APP_URL}/join/${createdGroup.inviteCode}`, 'link')}
                      className="items-center justify-center rounded-full border border-paper-line bg-white px-4 py-3 active:opacity-70">
                      <Text className="font-mono-bold text-charcoal">{copied === 'link' ? 'Copied!' : 'Copy'}</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              <Pressable
                onPress={() => {
                  setMode('list');
                  setCreatedGroup(null);
                  setCopied(null);
                }}
                className="mt-1 items-center rounded-full bg-primary px-4 py-3 shadow-sm shadow-primary/20 active:opacity-85">
                <Text className="font-mono-bold text-white">Done</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
