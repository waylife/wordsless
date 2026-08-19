/**
 * AI content repository — immutable cache of model outputs.
 *
 * Keyed on (word_id, type); the runtime client reads here first and
 * only calls the model on miss. The build-time script (`data/gen-ai-content.ts`)
 * is the only writer in the steady state — runtime writes happen when
 * the user explicitly requests fresh content.
 */
import { and, eq } from 'drizzle-orm';

import type { Db } from '../client';
import { type AiContentTypeValue, type NewAiContentRow, aiContent } from '../schema';

export const aiContentRepository = {
  async find(db: Db, wordId: string, type: AiContentTypeValue) {
    const row = db
      .select()
      .from(aiContent)
      .where(and(eq(aiContent.wordId, wordId), eq(aiContent.type, type)))
      .get();
    return row ?? null;
  },

  async listForWord(db: Db, wordId: string) {
    return db.select().from(aiContent).where(eq(aiContent.wordId, wordId)).all();
  },

  async upsert(db: Db, row: NewAiContentRow): Promise<void> {
    db.insert(aiContent)
      .values(row)
      .onConflictDoUpdate({
        target: [aiContent.wordId, aiContent.type],
        set: {
          content: row.content,
          model: row.model,
        },
      })
      .run();
  },
};
