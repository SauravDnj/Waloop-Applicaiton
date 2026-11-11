import type { CustomField } from '@ab-ecosystem/cpaas';

import { coerceFieldValue, formatFieldValue, propsWithOptions } from '@/services/crm/fields';
import { fieldDisplay, toLead } from '@/services/crm/leads';
import { fillTokensStrict, pickChannel } from '@/services/crm/whatsapp';

const field = (dataType: CustomField['dataType'], props: Record<string, unknown> = {}) =>
  ({ id: 'f', slug: 'f', name: 'F', type: 'user', dataType, props, default: {}, required: false }) as unknown as CustomField;

describe('coerceFieldValue', () => {
  it('writes numbers as numbers and refuses text in a number field', () => {
    expect(coerceFieldValue(field('number'), '42')).toBe(42);
    expect(coerceFieldValue(field('amount'), '₹1,250.50')).toBe(1250.5);
    expect(coerceFieldValue(field('number'), 'abc')).toBeUndefined();
    expect(coerceFieldValue(field('amount'), 'Rs 1,00,000')).toBe(100000);
    expect(coerceFieldValue(field('amount'), '1.234,56')).toBe(1234.56);
    expect(coerceFieldValue(field('number'), '12,5')).toBe(12.5);
    expect(coerceFieldValue(field('number'), '1.5e3')).toBeUndefined();
    expect(coerceFieldValue(field('number'), '1.2.3')).toBeUndefined();
    expect(coerceFieldValue(field('number'), '-7')).toBe(-7);
  });

  it('reads checkboxes, lists, dates and timestamps', () => {
    expect(coerceFieldValue(field('checkbox'), 'Yes')).toBe(true);
    expect(coerceFieldValue(field('checkbox'), 'maybe')).toBeUndefined();
    expect(coerceFieldValue(field('multi_select'), 'Cakes, Cookies;Bread')).toEqual(['Cakes', 'Cookies', 'Bread']);
    expect(coerceFieldValue(field('date'), new Date(2026, 9, 30, 15, 0))).toBe('2026-10-30');
    // An Excel day serial, and date text, keep their day whatever the time zone.
    expect(coerceFieldValue(field('date'), '46325')).toBe('2026-10-30');
    expect(coerceFieldValue(field('date'), '2026-10-30')).toBe('2026-10-30');
    expect(coerceFieldValue(field('date'), '30/10/2026')).toBe('2026-10-30');
    expect(coerceFieldValue(field('date'), '10/30/2026')).toBe('2026-10-30');
    expect(coerceFieldValue(field('date'), '31/02/2026')).toBeUndefined();
    expect(coerceFieldValue(field('timestamp'), '2026-10-30T10:00:00.000Z')).toBe('2026-10-30T10:00:00.000Z');
  });

  it('treats blank as clearing', () => {
    expect(coerceFieldValue(field('number'), '  ')).toBe('');
    expect(coerceFieldValue(field('multi_select'), [])).toBe('');
  });
});

describe('formatFieldValue', () => {
  it('shows a stored date on its own day', () => {
    expect(formatFieldValue(field('date'), '2026-10-30')).toBe(new Date(2026, 9, 30).toLocaleDateString());
  });
});

describe('propsWithOptions', () => {
  it('keeps the original option objects and other props', () => {
    const f = field('dropdown', { options: [{ label: 'Hot lead', value: 'hot', color: 'red' }, 'cold'], colorful: true });
    expect(propsWithOptions(f, ['hot', 'warm'])).toEqual({
      colorful: true,
      options: [
        { label: 'Hot lead', value: 'hot', color: 'red' },
        { label: 'warm', value: 'warm' },
      ],
    });
  });
});

describe('message values', () => {
  it('never sends half-filled text', () => {
    const get = (k: string) => ({ city: 'Pune', company: '' })[k] ?? '';
    expect(fillTokensStrict('Hello from [[city]]', get)).toBe('Hello from Pune');
    expect(fillTokensStrict('Dear [[company]] customer', get)).toBe('');
    expect(fillTokensStrict('No tokens here', get)).toBe('No tokens here');
  });

  it('shows field values readably', () => {
    const lead = toLead({ id: 'c', name: { first_name: 'A' }, custom_field_hash: { vip: true, tags: ['a', 'b'], addr: { line1: 'x' }, n: 5 } } as never);
    expect(fieldDisplay(lead, 'vip')).toBe('Yes');
    expect(fieldDisplay(lead, 'tags')).toBe('a, b');
    expect(fieldDisplay(lead, 'addr')).toBe('');
    expect(fieldDisplay(lead, 'n')).toBe('5');
  });
});

describe('pickChannel', () => {
  const ch = (id: string, active = true) => ({ id, name: id, number: '', active, color: '' });
  it('keeps a valid default, else takes the first active channel', () => {
    expect(pickChannel([ch('a'), ch('b')], 'b')).toBe('b');
    expect(pickChannel([ch('a', false), ch('b')], 'gone')).toBe('b');
    expect(pickChannel([ch('a', false), ch('b')], 'a')).toBe('b');
    expect(pickChannel([ch('a', false)], null)).toBeNull();
    expect(pickChannel(undefined, 'a')).toBeNull();
  });
});
