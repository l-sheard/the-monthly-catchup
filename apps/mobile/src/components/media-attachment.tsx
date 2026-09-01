import * as ImagePicker from 'expo-image-picker';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, Text, View } from 'react-native';

import { useApiClient } from '@/lib/api';
import { MEDIA_LIMITS } from '@stay-in-touch/shared';

interface MediaAttachmentProps {
  cycleId: string;
  questionId: string;
  kind: 'photo' | 'audio';
  existingCount: number;
  onUploaded: () => void;
}

export function MediaAttachment({ cycleId, questionId, kind, existingCount, onUploaded }: MediaAttachmentProps) {
  return kind === 'photo' ? (
    <PhotoAttachment cycleId={cycleId} questionId={questionId} existingCount={existingCount} onUploaded={onUploaded} />
  ) : (
    <VoiceAttachment cycleId={cycleId} questionId={questionId} existingCount={existingCount} onUploaded={onUploaded} />
  );
}

function PhotoAttachment({
  cycleId,
  questionId,
  existingCount,
  onUploaded,
}: Omit<MediaAttachmentProps, 'kind'>) {
  const { uploadMedia } = useApiClient();
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const atLimit = existingCount >= MEDIA_LIMITS.photo.maxPerCycle;

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
    setLocalPreview(asset.uri);
    setUploading(true);
    setError(null);
    try {
      await uploadMedia(
        cycleId,
        questionId,
        { uri: asset.uri, name: asset.fileName ?? 'photo.jpg', type: asset.mimeType ?? 'image/jpeg' },
        'photo',
      );
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [cycleId, questionId, uploadMedia, onUploaded]);

  return (
    <View className="gap-2">
      {localPreview && (
        <Image source={{ uri: localPreview }} className="h-32 w-32 rounded-xl" resizeMode="cover" />
      )}
      <Pressable
        disabled={uploading || atLimit}
        onPress={pickAndUpload}
        className="flex-row items-center gap-2 self-start rounded-xl border border-neutral-200 px-4 py-2 active:opacity-70 disabled:opacity-50">
        {uploading ? (
          <ActivityIndicator size="small" color="#FF6B4A" />
        ) : (
          <Text className="font-medium text-charcoal">
            {atLimit ? `📸 Limit reached (${MEDIA_LIMITS.photo.maxPerCycle})` : `📸 Add photo (${existingCount}/${MEDIA_LIMITS.photo.maxPerCycle})`}
          </Text>
        )}
      </Pressable>
      {error && <Text className="text-sm text-red-600">{error}</Text>}
    </View>
  );
}

function VoiceAttachment({
  cycleId,
  questionId,
  existingCount,
  onUploaded,
}: Omit<MediaAttachmentProps, 'kind'>) {
  const { uploadMedia } = useApiClient();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const atLimit = existingCount >= MEDIA_LIMITS.audio.maxPerCycle;

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
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [recorder, recorderState.durationMillis, cycleId, questionId, uploadMedia, onUploaded]);

  if (uploading) {
    return (
      <View className="flex-row items-center gap-2 self-start rounded-xl border border-neutral-200 px-4 py-2">
        <ActivityIndicator size="small" color="#FF6B4A" />
        <Text className="font-medium text-charcoal">Uploading…</Text>
      </View>
    );
  }

  if (recorderState.isRecording) {
    return (
      <View className="gap-2">
        <Pressable
          onPress={stopAndUpload}
          className="flex-row items-center gap-2 self-start rounded-xl bg-red-500 px-4 py-2 active:opacity-85">
          <View className="h-2 w-2 rounded-full bg-white" />
          <Text className="font-medium text-white">
            Stop ({Math.round(recorderState.durationMillis / 1000)}s)
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="gap-2">
      <Pressable
        disabled={atLimit}
        onPress={startRecording}
        className="flex-row items-center gap-2 self-start rounded-xl border border-neutral-200 px-4 py-2 active:opacity-70 disabled:opacity-50">
        <Text className="font-medium text-charcoal">
          {atLimit ? '🎙️ Voice note already recorded' : '🎙️ Record voice note'}
        </Text>
      </Pressable>
      {error && <Text className="text-sm text-red-600">{error}</Text>}
    </View>
  );
}
