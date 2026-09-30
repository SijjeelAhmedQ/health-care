import { describe, expect, it } from 'vitest';
import { patients, providers } from '@/services/mock/mockDb';

describe('demo names', () => {
  it('every patient and provider has a name of their own — a name said by voice means one person', () => {
    const names = [...providers.map((p) => `${p.firstName} ${p.lastName}`), ...patients.map((p) => p.fullName)];
    const repeated = names.filter((n, i) => names.indexOf(n) !== i);
    expect(repeated).toEqual([]);
  });
});
