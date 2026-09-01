import { describe, it, expect } from 'vitest';
import { openCyclesForToday } from './open-cycles';
import type { Db } from '../db';

describe('openCyclesForToday', () => {
  it('is a no-op on any day other than the 1st, without touching the db', async () => {
    const dbThatThrowsIfTouched = new Proxy(
      {},
      {
        get() {
          throw new Error('db should not be queried when it is not the 1st');
        },
      },
    ) as Db;

    const result = await openCyclesForToday(dbThatThrowsIfTouched, new Date(Date.UTC(2026, 8, 15)));

    expect(result).toEqual({ ran: false, reason: 'not the 1st of the month' });
  });
});
