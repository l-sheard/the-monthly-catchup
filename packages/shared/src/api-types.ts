import type { groups, cycles } from './schema';

export type Group = typeof groups.$inferSelect;

// Drizzle infers timestamp columns as `Date`, but every response here goes
// through JSON (c.json() server-side, res.json() client-side), which
// serializes Date to an ISO string — so the wire type isn't the DB type.
export type Cycle = Omit<typeof cycles.$inferSelect, 'opensAt' | 'deadlineAt'> & {
  opensAt: string;
  deadlineAt: string;
};

export interface GroupSummary extends Pick<Group, 'id' | 'name' | 'inviteCode'> {
  openCycle: Cycle | null;
}

export interface ListMyGroupsResponse {
  groups: GroupSummary[];
}
