import { useAuth } from '@clerk/expo';
import { useCallback } from 'react';

const API_URL = process.env.EXPO_PUBLIC_API_URL!;

if (!API_URL) {
  throw new Error('Add EXPO_PUBLIC_API_URL to apps/mobile/.env.local');
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Attaches the current Clerk session token to every request. */
export function useApiClient() {
  const { getToken } = useAuth();

  const apiFetch = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const token = await getToken();
      const res = await fetch(`${API_URL}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...init?.headers,
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new ApiError(body.error ?? `Request failed with status ${res.status}`, res.status);
      }

      return res.json();
    },
    [getToken],
  );

  return { apiFetch };
}
