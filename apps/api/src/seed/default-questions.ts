import { eq } from 'drizzle-orm';
import { questions } from '@stay-in-touch/shared/schema';
import type { Db } from '../db';

const DEFAULT_QUESTIONS = [
  { promptText: 'What have you been up to this month?', type: 'text', sortOrder: 0 },
  { promptText: 'Have you got any exciting plans coming up?', type: 'text', sortOrder: 1 },
  {
    promptText: 'What are your monthly favourites? (TV, books, music, films — share recs with the group)',
    type: 'favourites',
    sortOrder: 2,
  },
  { promptText: 'Got a recipe or something else you want to share?', type: 'recipe', sortOrder: 3 },
  { promptText: 'Share a photo from your month', type: 'photo', sortOrder: 4 },
  { promptText: 'Record a voice note for the group', type: 'voice', sortOrder: 5 },
  { promptText: 'Any suggestions for the next meetup?', type: 'meetup', sortOrder: 6 },
] as const;

/** Idempotent: only inserts if no default (groupId: null) questions exist yet. */
export async function seedDefaultQuestions(db: Db) {
  const [existing] = await db.select().from(questions).where(eq(questions.isDefault, true)).limit(1);

  if (existing) {
    return { inserted: 0, reason: 'already seeded' as const };
  }

  await db.insert(questions).values(
    DEFAULT_QUESTIONS.map((q) => ({ ...q, groupId: null, isDefault: true })),
  );

  return { inserted: DEFAULT_QUESTIONS.length };
}
