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
});

export const uploadMediaInput = z.object({
  answerId: z.uuid(),
  kind: z.enum(['photo', 'audio']),
  contentType: z.string(),
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024), // 50MB cap
});

export const submitMeetupSuggestionInput = z.object({
  cycleId: z.uuid(),
  bodyText: z.string().min(1).max(500),
});

export type CreateGroupInput = z.infer<typeof createGroupInput>;
export type JoinGroupInput = z.infer<typeof joinGroupInput>;
export type SubmitAnswerInput = z.infer<typeof submitAnswerInput>;
export type UploadMediaInput = z.infer<typeof uploadMediaInput>;
export type SubmitMeetupSuggestionInput = z.infer<typeof submitMeetupSuggestionInput>;
