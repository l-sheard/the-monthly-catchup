import { useSignIn, useSignUp, useSSO } from '@clerk/expo';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GoogleIcon } from '@/components/google-icon';

const PLACEHOLDER = '#7C9188';

// Shared by every finalize() call below (SSO, password sign-in, password
// sign-up) — converts a complete attempt into the active session and lands
// on wherever the user was headed. `decorateUrl` may return an external
// https:// URL (Safari ITP cookie refresh); on native there's no window to
// hand that to, so it's a web-only branch, same as the join-link URL
// elsewhere in this app.
function navigateAfterAuth(
  returnTo: string | undefined,
  router: ReturnType<typeof useRouter>,
  { session, decorateUrl }: { session: { currentTask?: unknown }; decorateUrl: (url: string) => string },
) {
  if (session.currentTask) {
    // A required step (e.g. MFA enrollment, org selection) is still
    // pending. Nothing on this instance currently issues one — no second
    // factors, single-session mode — but bail rather than navigate past it
    // if that ever changes; there's no session-task UI built yet.
    return;
  }
  const dest = decorateUrl(returnTo && returnTo.startsWith('/') ? returnTo : '/');
  if (dest.startsWith('http')) {
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.href = dest;
    return;
  }
  router.replace(dest as Href);
}

export default function SignInScreen() {
  const { startSSOFlow } = useSSO();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const router = useRouter();
  // Set by e.g. /join/[code] when it redirects here for an unauthenticated
  // visitor, so a join link doesn't just dead-end at the home screen after
  // sign-in — see that route for the other half of this.
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  // Signup is two steps: fill in the form, then enter the code emailed to
  // verify the address. Sign-in never needs this (no second factor is
  // configured on this Clerk instance).
  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const switchMode = useCallback((next: 'signin' | 'signup') => {
    setMode(next);
    setStep('form');
    setPassword('');
    setConfirmPassword('');
    setCode('');
    setErrorMessage(null);
  }, []);

  const onGooglePress = useCallback(async () => {
    setGoogleLoading(true);
    setErrorMessage(null);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({ strategy: 'oauth_google' });

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.replace((returnTo && returnTo.startsWith('/') ? returnTo : '/') as Href);
        return;
      }
      // No createdSessionId → user cancelled the flow; nothing to do.
    } catch (err) {
      console.error('Google sign-in error:', JSON.stringify(err, null, 2));
      setErrorMessage('Google sign-in failed — please try again.');
    } finally {
      setGoogleLoading(false);
    }
  }, [startSSOFlow, router, returnTo]);

  const onSignInPress = useCallback(async () => {
    if (!emailAddress.trim() || !password) {
      setErrorMessage('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const { error } = await signIn.password({ emailAddress: emailAddress.trim(), password });
      if (error) {
        setErrorMessage(error.longMessage ?? error.message);
        return;
      }
      if (signIn.status === 'complete') {
        await signIn.finalize({ navigate: (params) => navigateAfterAuth(returnTo, router, params) });
      } else {
        // No second factor is configured on this instance, so in practice
        // this shouldn't happen — but don't leave the user stuck silently
        // if it ever does (e.g. a future MFA rollout).
        setErrorMessage('This account needs additional verification that isn’t supported here yet.');
      }
    } finally {
      setSubmitting(false);
    }
  }, [signIn, emailAddress, password, returnTo, router]);

  const onSignUpPress = useCallback(async () => {
    if (!emailAddress.trim() || !password) {
      setErrorMessage('Enter an email and password.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords don’t match — check both fields.');
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const { error } = await signUp.password({ emailAddress: emailAddress.trim(), password });
      if (error) {
        setErrorMessage(error.longMessage ?? error.message);
        return;
      }
      if (signUp.status === 'complete') {
        await signUp.finalize({ navigate: (params) => navigateAfterAuth(returnTo, router, params) });
        return;
      }
      // Expected path: email address still needs a code before the account
      // is created — this instance requires it (email_address_verification_
      // strategies: ['email_code']).
      const { error: codeError } = await signUp.verifications.sendEmailCode();
      if (codeError) {
        setErrorMessage(codeError.longMessage ?? codeError.message);
        return;
      }
      setStep('verify');
    } finally {
      setSubmitting(false);
    }
  }, [signUp, emailAddress, password, confirmPassword, returnTo, router]);

  const onVerifyPress = useCallback(async () => {
    if (!code.trim()) {
      setErrorMessage('Enter the code from your email.');
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const { error } = await signUp.verifications.verifyEmailCode({ code: code.trim() });
      if (error) {
        setErrorMessage(error.longMessage ?? error.message);
        return;
      }
      if (signUp.status === 'complete') {
        await signUp.finalize({ navigate: (params) => navigateAfterAuth(returnTo, router, params) });
      } else {
        setErrorMessage('Verification didn’t complete — please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }, [signUp, code, returnTo, router]);

  const onResendCode = useCallback(async () => {
    setErrorMessage(null);
    const { error } = await signUp.verifications.sendEmailCode();
    if (error) setErrorMessage(error.longMessage ?? error.message);
  }, [signUp]);

  const onBackFromVerify = useCallback(async () => {
    await signUp.reset();
    setStep('form');
    setCode('');
    setErrorMessage(null);
  }, [signUp]);

  const anyLoading = googleLoading || submitting;

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScrollView
        contentContainerClassName="flex-grow items-center justify-center px-6 py-10"
        keyboardShouldPersistTaps="handled">
        <View className="w-full max-w-md items-center gap-3 rounded-2xl border border-paper-line bg-white px-8 py-10 shadow-sm shadow-black/5">
          <View className="mb-1 h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Text className="text-3xl">💌</Text>
          </View>

          <Text className="text-center font-mono-bold text-2xl tracking-tight text-charcoal">
            The Monthly Catch-Up
          </Text>
          <Text className="text-center font-mono text-base leading-6 text-charcoal/60">
            One email a month, packed with everything your friends have been up to.
          </Text>

          {step === 'verify' ? (
            <View className="mt-4 w-full gap-3">
              <Text className="text-center font-mono text-sm text-charcoal/70">
                We sent a code to{'\n'}
                <Text className="font-mono-bold text-charcoal">{emailAddress.trim()}</Text>
              </Text>
              <TextInput
                autoFocus
                value={code}
                onChangeText={setCode}
                placeholder="Verification code"
                placeholderTextColor={PLACEHOLDER}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                className="rounded-xl border border-sand-line bg-sand px-4 py-3 text-center font-mono text-lg tracking-widest text-charcoal"
              />
              <Pressable
                disabled={anyLoading}
                onPress={onVerifyPress}
                className="items-center rounded-full bg-primary px-4 py-3 shadow-sm shadow-primary/20 active:opacity-85 disabled:opacity-60">
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="font-mono-bold text-white">Verify &amp; create account</Text>
                )}
              </Pressable>
              <View className="flex-row justify-center gap-4">
                <Pressable onPress={onBackFromVerify} disabled={anyLoading}>
                  <Text className="font-mono text-xs text-charcoal/60">‹ Back</Text>
                </Pressable>
                <Pressable onPress={onResendCode} disabled={anyLoading}>
                  <Text className="font-mono text-xs text-primary">Resend code</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              <View className="mt-3 w-full flex-row rounded-full border border-paper-line bg-sand p-1">
                <Pressable
                  onPress={() => switchMode('signin')}
                  className={`flex-1 items-center rounded-full py-2 ${mode === 'signin' ? 'bg-white shadow-sm shadow-black/5' : ''}`}>
                  <Text className={`font-mono-bold text-sm ${mode === 'signin' ? 'text-charcoal' : 'text-charcoal/50'}`}>
                    Sign in
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => switchMode('signup')}
                  className={`flex-1 items-center rounded-full py-2 ${mode === 'signup' ? 'bg-white shadow-sm shadow-black/5' : ''}`}>
                  <Text className={`font-mono-bold text-sm ${mode === 'signup' ? 'text-charcoal' : 'text-charcoal/50'}`}>
                    Create account
                  </Text>
                </Pressable>
              </View>

              <View className="w-full gap-2.5">
                <TextInput
                  value={emailAddress}
                  onChangeText={setEmailAddress}
                  placeholder="Email address"
                  placeholderTextColor={PLACEHOLDER}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  autoComplete="email"
                  className="rounded-xl border border-sand-line bg-sand px-4 py-3 font-mono text-charcoal"
                />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor={PLACEHOLDER}
                  secureTextEntry
                  autoComplete={mode === 'signup' ? 'new-password' : 'password'}
                  className="rounded-xl border border-sand-line bg-sand px-4 py-3 font-mono text-charcoal"
                />
                {mode === 'signup' && (
                  <TextInput
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Confirm password"
                    placeholderTextColor={PLACEHOLDER}
                    secureTextEntry
                    autoComplete="new-password"
                    className="rounded-xl border border-sand-line bg-sand px-4 py-3 font-mono text-charcoal"
                  />
                )}
                <Pressable
                  disabled={anyLoading}
                  onPress={mode === 'signin' ? onSignInPress : onSignUpPress}
                  className="mt-1 items-center rounded-full bg-primary px-4 py-3 shadow-sm shadow-primary/20 active:opacity-85 disabled:opacity-60">
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="font-mono-bold text-white">
                      {mode === 'signin' ? 'Sign in' : 'Create account'}
                    </Text>
                  )}
                </Pressable>
              </View>

              <View className="w-full flex-row items-center gap-3">
                <View className="h-px flex-1 bg-paper-line" />
                <Text className="font-mono text-xs text-charcoal/40">OR</Text>
                <View className="h-px flex-1 bg-paper-line" />
              </View>

              {/* Google's own branding guidelines for a custom sign-in button
                  (developers.google.com/identity/branding-guidelines): white
                  fill, #747775 1px border, #1F1F1F text, the untouched full-color
                  "G" mark with fixed spacing around it — building a custom button
                  (vs. their prebuilt one) is explicitly allowed as long as those
                  hold, which is why this one breaks from the rest of the app's
                  coral/pill button styling. */}
              <Pressable
                disabled={anyLoading}
                onPress={onGooglePress}
                className="w-full flex-row items-center justify-center gap-2.5 rounded-full border border-[#747775] bg-white py-3 pl-3 pr-4 active:opacity-85 disabled:opacity-60">
                {googleLoading ? (
                  <ActivityIndicator color="#1F1F1F" />
                ) : (
                  <>
                    <GoogleIcon size={18} />
                    <Text className="font-mono-bold text-base text-[#1F1F1F]">Continue with Google</Text>
                  </>
                )}
              </Pressable>
            </>
          )}

          {errorMessage && (
            <Text className="text-center font-mono text-sm text-red-600">{errorMessage}</Text>
          )}

          {/* Mount point for Clerk's bot-protection widget (Smart CAPTCHA) —
              this screen can create a new account, so Clerk still wants this
              present even though it's invisible unless a visible challenge
              is needed. */}
          <View nativeID="clerk-captcha" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
