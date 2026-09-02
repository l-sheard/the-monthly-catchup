import type { groups, cycles, questions } from './schema';

export type Group = typeof groups.$inferSelect;
export type Question = typeof questions.$inferSelect;

// Drizzle infers timestamp columns as `Date`, but every response here goes
// through JSON (c.json() server-side, res.json() client-side), which
// serializes Date to an ISO string — so the wire type isn't the DB type.
export type Cycle = Omit<typeof cycles.$inferSelect, 'opensAt' | 'deadlineAt'> & {
  opensAt: string;
  deadlineAt: string;
};

export interface GroupSummary extends Pick<Group, 'id' | 'name' | 'inviteCode'> {
  // The group's newest cycle, whatever its status — see the /groups route
  // for why this isn't filtered to only 'open' cycles.
  currentCycle: Cycle | null;
  members: GroupMemberView[];
}

export interface ListMyGroupsResponse {
  groups: GroupSummary[];
}

export interface MeetupSuggestionView {
  id: string;
  authorName: string;
  bodyText: string;
}

export interface GroupMemberView {
  id: string;
  name: string;
  role: 'owner' | 'member';
}

export interface NewsletterSummary {
  id: string;
  month: number;
  year: number;
  sentAt: string | null;
  // Pre-signed (see lib/media-signing.ts) so the client can just open it —
  // a plain Linking.openURL/new-tab navigation can't carry an Authorization
  // header, same reasoning as embedding media in the email itself.
  viewUrl: string;
}

export interface ListNewslettersResponse {
  newsletters: NewsletterSummary[];
}

export interface MediaView {
  id: string;
  kind: 'photo' | 'audio';
  durationSeconds: number | null;
  caption: string | null;
}

export interface QuestionSuggestionView {
  id: string;
  authorName: string;
  promptText: string;
}

export interface CycleDetailResponse {
  cycle: Cycle;
  groupName: string;
  questions: Question[];
  myAnswers: Record<string, string>; // questionId -> bodyText
  myLinks: Record<string, string>; // questionId -> linkUrl (recipe questions only, in practice)
  myMedia: Record<string, MediaView[]>; // questionId -> attached media
  meetupSuggestions: MeetupSuggestionView[];
  members: GroupMemberView[];
  // Not-yet-used suggestions for a future month's question, so members can
  // see what's already been pitched before adding their own.
  questionSuggestions: QuestionSuggestionView[];
}
