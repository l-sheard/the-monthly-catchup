import { useRouter } from 'expo-router';
import { Tabs, TabList, TabTrigger, TabSlot } from 'expo-router/ui';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { InboxResponse } from '@stay-in-touch/shared';

import { MailIcon } from './mail-icon';
import { PersonIcon } from './person-icon';
import { ThemedText } from './themed-text';

import { useApiClient } from '@/lib/api';
import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';

// Single destination for now, so there's nothing to switch between visibly —
// but the Tabs navigator still needs at least one registered TabTrigger or
// it throws ("Couldn't find any screens for the navigator"), so it stays,
// just visually hidden. The header row doubles as the app's top bar:
// Create/Join group set the `action` search param on the current route,
// which (home)/index.tsx picks up (there's no other channel to reach that
// screen's local state from this sibling component) — same pattern as the
// `returnTo` param sign-in already reads. Sign out lives on the Account
// screen, not here, so it isn't a top-level action of its own.
export default function AppTabs() {
  const router = useRouter();
  const { apiFetch } = useApiClient();
  const [hasUnread, setHasUnread] = useState(false);

  // This component only lives inside the (home) route group, so it unmounts
  // whenever you navigate to a top-level route (cycles/[id], inbox, ...)
  // and remounts fresh on the way back — that's what keeps this in sync
  // after visiting the inbox marks everything read, without needing to wire
  // up any cross-screen state.
  useEffect(() => {
    apiFetch<InboxResponse>('/newsletters/inbox')
      .then((res) => setHasUnread(res.hasUnread))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList style={styles.hidden}>
        <TabTrigger name="home" href="/" />
      </TabList>
      <View style={styles.header}>
        <View style={styles.headerInner}>
          <ThemedText type="smallBold" style={styles.headerText}>
            💌 The Monthly Catch-Up
          </ThemedText>
          <View style={styles.actions}>
            <Pressable style={styles.primaryButton} onPress={() => router.setParams({ action: 'create' })}>
              <ThemedText type="smallBold" themeColor="primaryText" style={styles.actionText}>
                + Create group
              </ThemedText>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => router.setParams({ action: 'join' })}>
              <ThemedText type="smallBold" style={styles.actionText}>
                Join group
              </ThemedText>
            </Pressable>
            <Pressable style={styles.linkButton} onPress={() => router.push('/inbox')}>
              <View>
                <MailIcon size={18} color={Colors.light.textSecondary} />
                {hasUnread && <View style={styles.unreadDot} />}
              </View>
            </Pressable>
            <Pressable style={styles.linkButton} onPress={() => router.push('/account')}>
              <PersonIcon size={18} color={Colors.light.textSecondary} />
            </Pressable>
          </View>
        </View>
      </View>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  hidden: {
    display: 'none',
  },
  header: {
    position: 'absolute',
    top: 0,
    width: '100%',
    alignItems: 'center',
    backgroundColor: Colors.light.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.textSecondary + '40',
  },
  headerText: {
    fontFamily: 'SpaceMono_700Bold',
  },
  headerInner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  actionText: {
    fontFamily: 'SpaceMono_700Bold',
  },
  primaryButton: {
    backgroundColor: Colors.light.primary,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 4,
  },
  secondaryButton: {
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: Colors.light.textSecondary + '40',
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 4,
  },
  linkButton: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  unreadDot: {
    position: 'absolute',
    top: -2,
    right: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.light.primary,
    borderWidth: 1.5,
    borderColor: Colors.light.background,
  },
});
