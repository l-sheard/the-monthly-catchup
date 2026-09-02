import { describe, it, expect } from 'vitest';
import { openCyclesForToday } from './open-cycles';
import type { Db } from '../db';

describe('openCyclesForToday', () => {
  it('is a no-op before the final week of the month, without touching the db', async () => {
    const dbThatThrowsIfTouched = new Proxy(
      {},
      {
        get() {
          throw new Error('db should not be queried before the final week of the month');
        },
      },
    ) as Db;

    // September 2026 has 30 days, so the final week (7 days, deadline
    // included) starts on the 24th — the 15th is well before that.
    const result = await openCyclesForToday(
      dbThatThrowsIfTouched,
      { RESEND_API_KEY: 'unused' },
      new Date(Date.UTC(2026, 8, 15)),
    );

    expect(result).toEqual({ ran: false, reason: 'not yet the final week of the month' });
  });

  it('is a no-op on the day before the final week starts, even in a short month', async () => {
    const dbThatThrowsIfTouched = new Proxy(
      {},
      {
        get() {
          throw new Error('db should not be queried before the final week of the month');
        },
      },
    ) as Db;

    // February 2026 (not a leap year) has 28 days, so the final week starts
    // on the 22nd — the 21st should still no-op.
    const result = await openCyclesForToday(
      dbThatThrowsIfTouched,
      { RESEND_API_KEY: 'unused' },
      new Date(Date.UTC(2026, 1, 21)),
    );

    expect(result).toEqual({ ran: false, reason: 'not yet the final week of the month' });
  });
});
