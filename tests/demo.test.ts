import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';

describe('sample data', () => {
  it('puts the real yearly goals back when it is removed', async () => {
    const repo = await import('../src/db/repo');
    await repo.updateSettings({ goals: { yearIncome: 600_000, yearWords: 300_000 } });
    await repo.loadDemo();
    expect((await repo.readSettings()).goals.yearIncome).toBe(2_000_000);
    await repo.clearDemo();
    expect((await repo.readSettings()).goals).toEqual({ yearIncome: 600_000, yearWords: 300_000 });
    expect(await repo.hasDemo()).toBe(false);
  });
});
