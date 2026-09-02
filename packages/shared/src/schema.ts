import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  pgEnum,
  primaryKey,
  unique,
} from 'drizzle-orm/pg-core';

export const memberRole = pgEnum('member_role', ['owner', 'member']);
export const cycleStatus = pgEnum('cycle_status', ['open', 'compiling', 'sent']);
export const questionType = pgEnum('question_type', [
  'text',
  'favourites',
  'recipe',
  'photo',
  'voice',
  'meetup',
]);
export const mediaKind = pgEnum('media_kind', ['photo', 'audio']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkId: text('clerk_id').notNull().unique(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const groups = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  inviteCode: text('invite_code').notNull().unique(),
  // Nullable, unlike every other FK to users.id — this is a pure
  // attribution field (nothing reads it besides the insert that sets it),
  // so a deleted user's groups survive with createdBy cleared rather than
  // being cascade-deleted or blocking the deletion outright.
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const groupMembers = pgTable(
  'group_members',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: memberRole('role').notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.groupId, table.userId] })],
);

export const cycles = pgTable(
  'cycles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    month: integer('month').notNull(),
    year: integer('year').notNull(),
    opensAt: timestamp('opens_at', { withTimezone: true }).notNull(),
    deadlineAt: timestamp('deadline_at', { withTimezone: true }).notNull(),
    status: cycleStatus('status').notNull().default('open'),
  },
  (table) => [unique().on(table.groupId, table.month, table.year)],
);

export const questions = pgTable('questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id').references(() => groups.id, { onDelete: 'cascade' }),
  // Set only for a one-off question materialized from a member's suggestion
  // (see suggestedQuestions below) — scopes it to exactly the one cycle it
  // was drawn for, unlike groupId alone, which would carry it forward into
  // every future cycle for that group.
  cycleId: uuid('cycle_id').references(() => cycles.id, { onDelete: 'cascade' }),
  promptText: text('prompt_text').notNull(),
  type: questionType('type').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  isDefault: boolean('is_default').notNull().default(false),
});

// A member's pitch for a future month's question. openCyclesForToday draws
// one at random per group (per newly-opened cycle) from whichever of these
// haven't been used yet, and materializes it as a real `questions` row
// scoped to that cycle — answers.questionId has a FK to questions.id, so it
// has to become a real question to be answerable at all, not just be read
// out of this table directly.
export const suggestedQuestions = pgTable('suggested_questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id')
    .notNull()
    .references(() => groups.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  promptText: text('prompt_text').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // Null until randomly picked; excluded from both the random draw and the
  // "pending suggestions" list once set.
  usedInCycleId: uuid('used_in_cycle_id').references(() => cycles.id, { onDelete: 'set null' }),
});

export const answers = pgTable(
  'answers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cycleId: uuid('cycle_id')
      .notNull()
      .references(() => cycles.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    bodyText: text('body_text'),
    // Only surfaced in the UI for recipe questions (e.g. a link to the
    // original recipe site) — generic on the table like bodyText is, rather
    // than recipe-specific, so it doesn't need its own table just to store
    // one optional string per answer.
    linkUrl: text('link_url'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.cycleId, table.userId, table.questionId)],
);

export const media = pgTable('media', {
  id: uuid('id').primaryKey().defaultRandom(),
  answerId: uuid('answer_id')
    .notNull()
    .references(() => answers.id, { onDelete: 'cascade' }),
  kind: mediaKind('kind').notNull(),
  storagePath: text('storage_path').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  durationSeconds: integer('duration_seconds'),
  // Per-photo caption, set after upload (not at upload time) — a photo
  // question can carry several photos, each with its own caption, unlike
  // the one shared bodyText an ordinary question's answer gets.
  caption: text('caption'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const meetupSuggestions = pgTable('meetup_suggestions', {
  id: uuid('id').primaryKey().defaultRandom(),
  cycleId: uuid('cycle_id')
    .notNull()
    .references(() => cycles.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  bodyText: text('body_text').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const meetupVotes = pgTable(
  'meetup_votes',
  {
    suggestionId: uuid('suggestion_id')
      .notNull()
      .references(() => meetupSuggestions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.suggestionId, table.userId] })],
);

export const newsletters = pgTable('newsletters', {
  id: uuid('id').primaryKey().defaultRandom(),
  cycleId: uuid('cycle_id')
    .notNull()
    .unique()
    .references(() => cycles.id, { onDelete: 'cascade' }),
  compiledHtml: text('compiled_html').notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
});
