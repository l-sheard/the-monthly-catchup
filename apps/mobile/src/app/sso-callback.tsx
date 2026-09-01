import { useAuth } from '@clerk/expo';
import { Redirect } from 'expo-router';

// Clerk's useSSO() defaults redirectUrl to AuthSession.makeRedirectUri({ path:
// 'sso-callback' }) — on web that's a real browser redirect back to this exact
// path, not an in-app deep link, so it needs an actual route to land on.
// isLoaded flips true once ClerkProvider has finished processing the session
// from the redirect; only then do we know whether it succeeded.
export default function SSOCallback() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) return null;

  return <Redirect href={isSignedIn ? '/' : '/(auth)/sign-in'} />;
}
