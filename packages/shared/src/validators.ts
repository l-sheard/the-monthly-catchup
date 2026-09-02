import { z } from 'zod';

export const createGroupInput = z.object({
  name: z.string().min(1).max(80),
});

export const joinGroupInput = z.object({
  inviteCode: z.string().min(1),
});

export const submitAnswerInput = z.object({
  cycleId: z.uuid(),
  questionId: z.uuid(),
  bodyText: z.string().max(4000).optional(),
  // Free text, not a strict URL schema — people paste links without a
  // protocol ("notionsite.com/recipe") and this shouldn't reject those.
  linkUrl: z.string().max(500).optional(),
});

// Server-side backstop, not a substitute for client-side compression.
// A monthly cycle produces a handful of photos + one voice note per person,
// not an unbounded photo dump — keep both the per-file and per-cycle caps
// small enough that R2's free tier (10GB) lasts indefinitely at real usage.
export const MEDIA_LIMITS = {
  photo: { maxSizeBytes: 8 * 1024 * 1024, maxPerCycle: 6 }, // 8MB/file, 6/person/cycle
  audio: { maxSizeBytes: 5 * 1024 * 1024, maxPerCycle: 1 }, // 5MB/file (~2min), 1/person/cycle
} as const;

// Hard global cutoff, on top of the per-file/per-cycle limits above. R2's
// free tier is 10GB; stop accepting new uploads at 9GB so there's headroom
// before anything would actually start costing money.
export const TOTAL_STORAGE_BUDGET_BYTES = 9 * 1024 * 1024 * 1024;

export const uploadMediaInput = z.discriminatedUnion('kind', [
  z.object({
    answerId: z.uuid(),
    kind: z.literal('photo'),
    contentType: z.string(),
    sizeBytes: z.number().int().positive().max(MEDIA_LIMITS.photo.maxSizeBytes),
  }),
  z.object({
    answerId: z.uuid(),
    kind: z.literal('audio'),
    contentType: z.string(),
    sizeBytes: z.number().int().positive().max(MEDIA_LIMITS.audio.maxSizeBytes),
  }),
]);

export const updateMediaCaptionInput = z.object({
  caption: z.string().max(280),
});

export const submitMeetupSuggestionInput = z.object({
  cycleId: z.uuid(),
  bodyText: z.string().min(1).max(500),
});

export const submitQuestionSuggestionInput = z.object({
  promptText: z.string().min(1).max(280),
});

export type CreateGroupInput = z.infer<typeof createGroupInput>;
export type JoinGroupInput = z.infer<typeof joinGroupInput>;
export type SubmitAnswerInput = z.infer<typeof submitAnswerInput>;
export type UploadMediaInput = z.infer<typeof uploadMediaInput>;
export type SubmitMeetupSuggestionInput = z.infer<typeof submitMeetupSuggestionInput>;
export type UpdateMediaCaptionInput = z.infer<typeof updateMediaCaptionInput>;
export type SubmitQuestionSuggestionInput = z.infer<typeof submitQuestionSuggestionInput>;
