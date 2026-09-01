import { describe, it, expect } from 'vitest';
import {
  createGroupInput,
  joinGroupInput,
  submitMeetupSuggestionInput,
  uploadMediaInput,
  MEDIA_LIMITS,
} from './validators';

describe('createGroupInput', () => {
  it('accepts a valid group name', () => {
    expect(createGroupInput.safeParse({ name: 'The Book Club' }).success).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(createGroupInput.safeParse({ name: '' }).success).toBe(false);
  });

  it('rejects a name over 80 characters', () => {
    expect(createGroupInput.safeParse({ name: 'a'.repeat(81) }).success).toBe(false);
  });
});

describe('joinGroupInput', () => {
  it('rejects a missing invite code', () => {
    expect(joinGroupInput.safeParse({ inviteCode: '' }).success).toBe(false);
  });
});

describe('submitMeetupSuggestionInput', () => {
  it('requires a cycleId to be a UUID', () => {
    const result = submitMeetupSuggestionInput.safeParse({
      cycleId: 'not-a-uuid',
      bodyText: 'Pizza night at Sam\'s?',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid suggestion', () => {
    const result = submitMeetupSuggestionInput.safeParse({
      cycleId: '123e4567-e89b-12d3-a456-426614174000',
      bodyText: 'Pizza night at Sam\'s?',
    });
    expect(result.success).toBe(true);
  });
});

describe('uploadMediaInput', () => {
  const answerId = '123e4567-e89b-12d3-a456-426614174000';

  it('accepts a photo under the size cap', () => {
    const result = uploadMediaInput.safeParse({
      answerId,
      kind: 'photo',
      contentType: 'image/jpeg',
      sizeBytes: 2 * 1024 * 1024,
    });
    expect(result.success).toBe(true);
  });

  it('enforces the photo and audio caps independently', () => {
    // Bigger than the audio cap but still under the (larger) photo cap.
    const midSize = MEDIA_LIMITS.audio.maxSizeBytes + 1;
    expect(midSize).toBeLessThan(MEDIA_LIMITS.photo.maxSizeBytes);

    expect(
      uploadMediaInput.safeParse({ answerId, kind: 'photo', contentType: 'image/jpeg', sizeBytes: midSize })
        .success,
    ).toBe(true);
    expect(
      uploadMediaInput.safeParse({ answerId, kind: 'audio', contentType: 'audio/m4a', sizeBytes: midSize })
        .success,
    ).toBe(false);
  });

  it('rejects an audio file over its cap', () => {
    const result = uploadMediaInput.safeParse({
      answerId,
      kind: 'audio',
      contentType: 'audio/m4a',
      sizeBytes: MEDIA_LIMITS.audio.maxSizeBytes + 1,
    });
    expect(result.success).toBe(false);
  });
});
