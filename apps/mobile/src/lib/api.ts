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

  const uploadMedia = useCallback(
    async <T,>(
      cycleId: string,
      questionId: string,
      file: { uri: string; name: string; type: string },
      kind: 'photo' | 'audio',
      durationSeconds?: number,
    ): Promise<T> => {
      const token = await getToken();
      const form = new FormData();
      // React Native's fetch/FormData recognizes this { uri, name, type }
      // shape and streams the file from its local URI — do not set
      // Content-Type manually here, fetch derives the multipart boundary
      // itself from the FormData body, same reason apiFetch's default
      // 'application/json' header would be wrong for this request.
      form.append('file', file as unknown as Blob);
      form.append('kind', kind);
      if (durationSeconds != null) form.append('durationSeconds', String(Math.round(durationSeconds)));

      const res = await fetch(`${API_URL}/media/cycles/${cycleId}/questions/${questionId}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new ApiError(body.error ?? `Upload failed with status ${res.status}`, res.status);
      }

      return res.json();
    },
    [getToken],
  );

  return { apiFetch, uploadMedia };
}
