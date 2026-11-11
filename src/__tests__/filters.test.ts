import { buildContactFilter, countActiveFilters, toRuns } from '@/lib/filters';

describe('buildContactFilter', () => {
  it('returns an empty condition list for no picks', () => {
    const { filter, collapsed } = buildContactFilter({});
    expect(filter.conditions).toEqual([]);
    expect(collapsed).toEqual([]);
  });

  it('ands single-valued picks with a null head operator', () => {
    const { filter } = buildContactFilter({ fields: { stage: ['New'], plan: ['Pro'] } });
    expect(filter.conditions).toEqual([
      { operator: null, field_id: 'stage', field_type: 'dropdown', condition: 'equal to', value: 'New' },
      { operator: 'and', field_id: 'plan', field_type: 'dropdown', condition: 'equal to', value: 'Pro' },
    ]);
  });

  it('distributes a multi-valued pick so every other condition still applies', () => {
    const { filter } = buildContactFilter({ tags: ['t1'], fields: { stage: ['New', 'Contacted'] } });
    expect(toRuns(filter.conditions).map((r) => r.map((c) => c.value))).toEqual([
      [['t1'], 'New'],
      [['t1'], 'Contacted'],
    ]);
  });

  it('keeps every value of two multi-valued fields', () => {
    const { filter, collapsed } = buildContactFilter({ fields: { stage: ['New', 'Contacted'], plan: ['A', 'B'] } });
    expect(collapsed).toEqual([]);
    expect(toRuns(filter.conditions).map((r) => r.map((c) => c.value))).toEqual([
      ['New', 'A'],
      ['New', 'B'],
      ['Contacted', 'A'],
      ['Contacted', 'B'],
    ]);
  });

  it('narrows a field only when the expansion would pass the condition limit', () => {
    const many = Array.from({ length: 30 }, (_, i) => `p${i}`);
    const { filter, collapsed } = buildContactFilter({ fields: { stage: ['New', 'Contacted'], plan: many } });
    expect(collapsed).toEqual(['plan']);
    expect(filter.conditions!.length).toBeLessThanOrEqual(50);
  });

  it('expresses tags as "has any of" and recent contacts as a LAST window', () => {
    const { filter } = buildContactFilter({ tags: ['a', 'b'], createdWithinDays: 7 });
    expect(filter.conditions![0]).toMatchObject({ field_id: 'tags', condition: 'equal to', value: ['a', 'b'] });
    expect(filter.conditions![1]).toMatchObject({ field_id: 'SYSTEM_CREATED_ON', condition: 'within', direction: 'LAST', value: 7 });
  });

  it('counts active filters', () => {
    expect(countActiveFilters({})).toBe(0);
    expect(countActiveFilters({ tags: ['x'], fields: { stage: ['New'], plan: [] }, createdWithinDays: 1, search: 'ignored' })).toBe(3);
  });
});

describe('andFilters', () => {
  const { andFilters, toRuns } = jest.requireActual('@/lib/filters') as typeof import('@/lib/filters');
  const c = (id: string, operator: 'and' | 'or' | null = 'and') => ({
    operator,
    field_id: id,
    field_type: 'text' as const,
    condition: 'equal to' as const,
    value: id,
  });

  it('distributes so (A or B) and C keeps its meaning without parentheses', () => {
    const seg = { conditions: [c('A', null), c('B', 'or')] };
    const extra = { conditions: [c('C', null)] };
    const out = andFilters(seg, extra);
    expect(toRuns(out.conditions).map((r) => r.map((x) => x.field_id))).toEqual([
      ['A', 'C'],
      ['B', 'C'],
    ]);
    expect(out.conditions?.map((x) => x.operator)).toEqual([null, 'and', 'or', 'and']);
  });

  it('returns the other side when one is empty', () => {
    expect(andFilters(undefined, { conditions: [c('X', null)] }).conditions?.map((x) => x.field_id)).toEqual(['X']);
  });
});
