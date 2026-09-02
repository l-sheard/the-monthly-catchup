import { useAuth } from '@clerk/expo';
import * as ImagePicker from 'expo-image-picker';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, Text, View } from 'react-native';

import { API_URL, useApiClient } from '@/lib/api';
import { MEDIA_LIMITS } from '@stay-in-touch/shared';
import type { MediaView } from '@stay-in-touch/shared';

interface MediaAttachmentProps {
  cycleId: string;
  questionId: string;
  kind: 'photo' | 'audio';
  existingMedia: MediaView[];
  onChange: () => void;
}

export function MediaAttachment({ cycleId, questionId, kind, existingMedia, onChange }: MediaAttachmentProps) {
  return kind === 'photo' ? (
    <PhotoAttachment cycleId={cycleId} questionId={questionId} existingMedia={existingMedia} onChange={onChange} />
  ) : (
    <VoiceAttachment cycleId={cycleId} questionId={questionId} existingMedia={existingMedia} onChange={onChange} />
  );
}

/**
 * Fetches an authenticated GET /media/:id and hands back a data URI. Neither
 * <Image>'s nor the audio player's `source` can be trusted to attach an
 * Authorization header cross-platform — a plain `<img>`/`<audio>` tag on web
 * has no way to set request headers at all — so, same as the in-app media
 * viewer this mirrors, we fetch the bytes ourselves and hand back a blob.
 */
function useMediaBlobUri(mediaId: string) {
  const { getToken } = useAuth();
  const [uri, setUri] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUri(null);
    setError(false);
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/media/${mediaId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) throw new Error('Failed to load media');
        const blob = await res.blob();
        const dataUri = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Failed to read media'));
          reader.readAsDataURL(blob);
        });
        if (!cancelled) setUri(dataUri);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaId]);

  return { uri, error };
}

function PhotoAttachment({
  cycleId,
  questionId,
  existingMedia,
  onChange,
}: Omit<MediaAttachmentProps, 'kind'>) {
  const { uploadMedia, apiFetch } = useApiClient();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const atLimit = existingMedia.length >= MEDIA_LIMITS.photo.maxPerCycle;

  const pickAndUpload = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo library access was denied');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setUploading(true);
    setError(null);
    try {
      await uploadMedia(
        cycleId,
        questionId,
        { uri: asset.uri, name: asset.fileName ?? 'photo.jpg', type: asset.mimeType ?? 'image/jpeg' },
        'photo',
      );
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [cycleId, questionId, uploadMedia, onChange]);

  const remove = useCallback(
    async (id: string) => {
      setRemovingId(id);
      setError(null);
      try {
        await apiFetch(`/media/${id}`, { method: 'DELETE' });
        onChange();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove photo');
      } finally {
        setRemovingId(null);
      }
    },
    [apiFetch, onChange],
  );

  return (
    <View className="gap-2">
      {existingMedia.length > 0 && (
        <View className="flex-row flex-wrap gap-2">
          {existingMedia.map((item) => (
            <PhotoThumbnail
              key={item.id}
              mediaId={item.id}
              removing={removingId === item.id}
              onRemove={() => remove(item.id)}
            />
          ))}
        </View>
      )}
      <Pressable
        disabled={uploading || atLimit}
        onPress={pickAndUpload}
        className="flex-row items-center gap-2 self-start rounded-full border border-paper-line px-4 py-2 active:opacity-70 disabled:opacity-50">
        {uploading ? (
          <ActivityIndicator size="small" color="#F2776A" />
        ) : (
          <Text className="font-mono text-charcoal">
            {atLimit
              ? `📸 Limit reached (${MEDIA_LIMITS.photo.maxPerCycle}) — remove one to add another`
              : `📸 Add photo (${existingMedia.length}/${MEDIA_LIMITS.photo.maxPerCycle})`}
          </Text>
        )}
      </Pressable>
      {error && <Text className="font-mono text-sm text-red-600">{error}</Text>}
    </View>
  );
}

function PhotoThumbnail({
  mediaId,
  removing,
  onRemove,
}: {
  mediaId: string;
  removing: boolean;
  onRemove: () => void;
}) {
  const { uri, error } = useMediaBlobUri(mediaId);

  return (
    <View className="relative h-24 w-24">
      {uri ? (
        <Image source={{ uri }} className="h-24 w-24 rounded-xl" resizeMode="cover" />
      ) : (
        <View className="h-24 w-24 items-center justify-center rounded-xl bg-sand">
          {error ? (
            <Text className="font-mono text-xs text-red-500">Failed</Text>
          ) : (
            <ActivityIndicator size="small" color="#F2776A" />
          )}
        </View>
      )}
      <Pressable
        disabled={removing}
        onPress={onRemove}
        className="absolute -right-2 -top-2 h-6 w-6 items-center justify-center rounded-full bg-charcoal shadow-sm shadow-black/20 disabled:opacity-50">
        {removing ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text className="font-mono-bold text-xs text-white">✕</Text>
        )}
      </Pressable>
    </View>
  );
}

function VoiceAttachment({
  cycleId,
  questionId,
  existingMedia,
  onChange,
}: Omit<MediaAttachmentProps, 'kind'>) {
  const { uploadMedia, apiFetch } = useApiClient();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const atLimit = existingMedia.length >= MEDIA_LIMITS.audio.maxPerCycle;
  const existing = existingMedia[0] ?? null;

  const startRecording = useCallback(async () => {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setError('Microphone access was denied');
      return;
    }
    setError(null);
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  }, [recorder]);

  const stopAndUpload = useCallback(async () => {
    await recorder.stop();
    const uri = recorder.uri;
    if (!uri) {
      setError('Recording failed — no file produced');
      return;
    }

    setUploading(true);
    try {
      const isWeb = Platform.OS === 'web';
      await uploadMedia(
        cycleId,
        questionId,
        { uri, name: isWeb ? 'voice-note.webm' : 'voice-note.m4a', type: isWeb ? 'audio/webm' : 'audio/m4a' },
        'audio',
        recorderState.durationMillis / 1000,
      );
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [recorder, recorderState.durationMillis, cycleId, questionId, uploadMedia, onChange]);

  const remove = useCallback(async () => {
    if (!existing) return;
    setRemoving(true);
    setError(null);
    try {
      await apiFetch(`/media/${existing.id}`, { method: 'DELETE' });
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove voice note');
    } finally {
      setRemoving(false);
    }
  }, [apiFetch, existing, onChange]);

  if (uploading) {
    return (
      <View className="flex-row items-center gap-2 self-start rounded-full border border-paper-line px-4 py-2">
        <ActivityIndicator size="small" color="#F2776A" />
        <Text className="font-mono text-charcoal">Uploading…</Text>
      </View>
    );
  }

  if (recorderState.isRecording) {
    return (
      <View className="gap-2">
        <Pressable
          onPress={stopAndUpload}
          className="flex-row items-center gap-2 self-start rounded-full bg-red-500 px-4 py-2 active:opacity-85">
          <View className="h-2 w-2 rounded-full bg-white" />
          <Text className="font-mono text-white">
            Stop ({Math.round(recorderState.durationMillis / 1000)}s)
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="gap-2">
      {existing && (
        <VoiceNotePlayer
          mediaId={existing.id}
          durationSeconds={existing.durationSeconds}
          removing={removing}
          onRemove={remove}
        />
      )}
      {!atLimit && (
        <Pressable
          onPress={startRecording}
          className="flex-row items-center gap-2 self-start rounded-full border border-paper-line px-4 py-2 active:opacity-70">
          <Text className="font-mono text-charcoal">🎙️ Record voice note</Text>
        </Pressable>
      )}
      {error && <Text className="font-mono text-sm text-red-600">{error}</Text>}
    </View>
  );
}

function VoiceNotePlayer({
  mediaId,
  durationSeconds,
  removing,
  onRemove,
}: {
  mediaId: string;
  durationSeconds: number | null;
  removing: boolean;
  onRemove: () => void;
}) {
  const { uri, error } = useMediaBlobUri(mediaId);
  const player = useAudioPlayer(uri ?? null);
  const status = useAudioPlayerStatus(player);

  const toggle = () => {
    if (!uri) return;
    if (status.playing) player.pause();
    else player.play();
  };

  return (
    <View className="flex-row items-center gap-3 self-start rounded-full border border-paper-line px-4 py-2">
      <Pressable onPress={toggle} disabled={!uri} className="disabled:opacity-50">
        <Text className="font-mono text-charcoal">
          {error
            ? '⚠️ Failed to load'
            : `${status.playing ? '⏸ Pause' : '▶ Play'}${durationSeconds ? ` (${Math.round(durationSeconds)}s)` : ''}`}
        </Text>
      </Pressable>
      <Pressable disabled={removing} onPress={onRemove} className="disabled:opacity-50">
        {removing ? (
          <ActivityIndicator size="small" color="#F2776A" />
        ) : (
          <Text className="font-mono-bold text-sm text-red-500">✕ Remove</Text>
        )}
      </Pressable>
    </View>
  );
}
