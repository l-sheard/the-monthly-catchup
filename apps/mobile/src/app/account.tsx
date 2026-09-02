import { useAuth, useUser } from '@clerk/expo';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const CARD = 'rounded-2xl border border-paper-line bg-white shadow-sm shadow-black/5';
const PLACEHOLDER = '#7C9188';

// Top-level route, not nested under (home) — same reasoning as
// cycles/[id].tsx: its own inline auth guard rather than relying on the
// (home) layout's, and avoids that layout's Tabs-adjacent assumptions.
export default function AccountScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const onChangePassword = useCallback(async () => {
    setPasswordMessage(null);
    if (!newPassword) {
      setPasswordMessage({ ok: false, text: 'Enter a new password.' });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordMessage({ ok: false, text: 'Passwords don’t match — check both fields.' });
      return;
    }
    setPasswordSaving(true);
    try {
      await user?.updatePassword({
        currentPassword: currentPassword || undefined,
        newPassword,
        signOutOfOtherSessions: true,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordMessage({ ok: true, text: 'Password updated — you’ve been signed out everywhere else.' });
    } catch (err) {
      setPasswordMessage({
        ok: false,
        text: err instanceof Error ? err.message : 'Failed to update password — check your current password.',
      });
    } finally {
      setPasswordSaving(false);
    }
  }, [user, currentPassword, newPassword, confirmNewPassword]);

  const onDeleteAccount = useCallback(async () => {
    setDeleteError(null);
    setDeleting(true);
    try {
      await user?.delete();
      // No explicit navigation needed: deleting the current user ends the
      // session, ClerkProvider picks that up, and (auth)/_layout's
      // isSignedIn check sends us to sign-in on its own. A webhook
      // (apps/api/src/routes/webhooks.ts) cleans up our own `users` row and
      // everything that cascades from it once Clerk delivers the
      // user.deleted event — that happens independently of this screen.
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete account.');
      setDeleting(false);
    }
  }, [user]);

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
          <Text className="font-mono-bold text-3xl tracking-tight text-charcoal">Account</Text>
          {user?.primaryEmailAddress && (
            <Text className="mt-1 font-mono text-sm text-charcoal/60">
              {user.primaryEmailAddress.emailAddress}
            </Text>
          )}
        </View>

        <View className="w-full max-w-xl gap-4">
          {/* Only accounts with a password set (i.e. not Google-only sign-in)
              can change one here — updatePassword() would just error
              otherwise, and there's nothing to reset for a Google account
              anyway (that's handled on Google's side). */}
          {user?.passwordEnabled && (
            <View className={`gap-3 p-5 ${CARD}`}>
              <Text className="font-mono-bold text-charcoal">🔒 Change password</Text>
              <TextInput
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="Current password"
                placeholderTextColor={PLACEHOLDER}
                secureTextEntry
                autoComplete="current-password"
                className="rounded-xl border border-sand-line bg-sand px-4 py-3 font-mono text-charcoal"
              />
              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="New password"
                placeholderTextColor={PLACEHOLDER}
                secureTextEntry
                autoComplete="new-password"
                className="rounded-xl border border-sand-line bg-sand px-4 py-3 font-mono text-charcoal"
              />
              <TextInput
                value={confirmNewPassword}
                onChangeText={setConfirmNewPassword}
                placeholder="Confirm new password"
                placeholderTextColor={PLACEHOLDER}
                secureTextEntry
                autoComplete="new-password"
                className="rounded-xl border border-sand-line bg-sand px-4 py-3 font-mono text-charcoal"
              />
              <Pressable
                disabled={passwordSaving}
                onPress={onChangePassword}
                className="items-center rounded-full bg-primary px-4 py-3 shadow-sm shadow-primary/20 active:opacity-85 disabled:opacity-50">
                {passwordSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="font-mono-bold text-white">Update password</Text>
                )}
              </Pressable>
              {passwordMessage && (
                <Text className={`font-mono text-sm ${passwordMessage.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                  {passwordMessage.text}
                </Text>
              )}
            </View>
          )}

          <View className={`gap-3 p-5 ${CARD} border-red-200`}>
            <Text className="font-mono-bold text-charcoal">⚠️ Delete account</Text>
            <Text className="font-mono text-sm text-charcoal/60">
              This permanently deletes your account and removes you from every group. This can’t be undone.
            </Text>
            {!confirmingDelete ? (
              <Pressable
                onPress={() => setConfirmingDelete(true)}
                className="items-center rounded-full border border-red-300 px-4 py-3 active:opacity-70">
                <Text className="font-mono-bold text-red-600">Delete my account</Text>
              </Pressable>
            ) : (
              <View className="gap-2">
                <Text className="font-mono text-sm text-charcoal">Are you sure? This can’t be undone.</Text>
                <View className="flex-row gap-3">
                  <Pressable
                    disabled={deleting}
                    onPress={onDeleteAccount}
                    className="flex-1 items-center rounded-full bg-red-600 px-4 py-3 active:opacity-85 disabled:opacity-50">
                    {deleting ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text className="font-mono-bold text-white">Yes, delete it</Text>
                    )}
                  </Pressable>
                  <Pressable
                    disabled={deleting}
                    onPress={() => setConfirmingDelete(false)}
                    className="flex-1 items-center rounded-full border border-paper-line px-4 py-3 active:opacity-70 disabled:opacity-50">
                    <Text className="font-mono-bold text-charcoal">Cancel</Text>
                  </Pressable>
                </View>
                {deleteError && <Text className="font-mono text-sm text-red-600">{deleteError}</Text>}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
