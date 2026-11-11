/**
 * Builds the CPaaS contact-filter DSL from the simple choices the UI offers.
 *
 * The DSL is a flat list where `and` binds tighter than `or`. Every pick below
 * is `and`ed, so a list is "field A is X AND field B is Y AND tag Z". Saved
 * segments are passed through as `segment` and narrowed by this filter — the
 * server intersects the two.
 */
import type { ContactFilter, ContactFilterEntry } from '@ab-ecosystem/cpaas';

/** Provenance tag on filters this app builds (free-form; the server ignores it). */
export const FILTER_TAG = 'app';

export type LeadFilter = {
  /** Saved segment id or name. */
  segment?: string;
  /** Tag ids; a contact must carry ANY of them. */
  tags?: string[];
  /** Dropdown field slug → values; a contact must have ANY of a field's values. */
  fields?: Record<string, string[]>;
  /** Created within the last N days. */
  createdWithinDays?: number;
  search?: string;
};

const tzOffsetMs = () => new Date().getTimezoneOffset() * 60 * 1000;

/**
 * Builds the condition list. A multi-value pick is an `or` of its values; since
 * the DSL has no parentheses and `and` binds tighter than `or`, the picks are
 * distributed: (stage New or Won) and tag VIP becomes `New and VIP or Won and VIP`.
 *
 * Only when the expansion would pass the CPaaS limit of 50 conditions is a
 * field narrowed to its first value; it is named in `collapsed`.
 */
export const buildContactFilter = (f: LeadFilter): { filter: ContactFilter; collapsed: string[] } => {
  const base: Omit<ContactFilterEntry, 'operator'>[] = [];
  const collapsed: string[] = [];

  if (f.tags?.length) base.push({ field_id: 'tags', field_type: 'string', condition: 'equal to', value: f.tags });

  if (f.createdWithinDays) {
    base.push({
      field_id: 'SYSTEM_CREATED_ON',
      field_type: 'date',
      condition: 'within',
      direction: 'LAST',
      timeUnit: 'days',
      value: f.createdWithinDays,
      offset: tzOffsetMs(),
    });
  }

  const dropdown = (field: string, value: string): Omit<ContactFilterEntry, 'operator'> => ({
    field_id: field,
    field_type: 'dropdown',
    condition: 'equal to',
    value,
  });
  // Each multi pick is a list of alternatives (any of them), distributed below.
  const multi: { field: string; alts: Omit<ContactFilterEntry, 'operator'>[] }[] = [];
  for (const [field, values] of Object.entries(f.fields ?? {})) {
    if (!values?.length) continue;
    if (values.length === 1) base.push(dropdown(field, values[0]));
    else multi.push({ field, alts: values.map((v) => dropdown(field, v)) });
  }

  let runs: Omit<ContactFilterEntry, 'operator'>[][] = [base];
  for (const m of multi) {
    const next = runs.flatMap((r) => m.alts.map((a) => [...r, a]));
    if (next.reduce((n, r) => n + r.length, 0) <= MAX_CONDITIONS) runs = next;
    else {
      runs = runs.map((r) => [...r, m.alts[0]]);
      collapsed.push(m.field);
    }
  }

  const conditions = runs[0].length ? fromRuns(runs as Entry[][]) : [];
  return { filter: { type: FILTER_TAG, conditions }, collapsed };
};

export const countActiveFilters = (f: LeadFilter): number =>
  [f.segment, f.tags?.length, f.createdWithinDays, ...Object.values(f.fields ?? {}).map((v) => v?.length)].filter(Boolean).length;

/* ---------------------- combining filters (no nesting) --------------------- */

type Entry = ContactFilterEntry;

/** Splits a flat condition list into its `or`-separated runs of `and`ed conditions. */
export const toRuns = (conds: Entry[] = []): Entry[][] => {
  const runs: Entry[][] = [];
  for (const c of conds) {
    if (!runs.length || c.operator === 'or') runs.push([]);
    runs[runs.length - 1].push(c);
  }
  return runs;
};

/** Joins runs back into a flat list: `and` inside a run, `or` between runs. */
export const fromRuns = (runs: Entry[][]): Entry[] =>
  runs.flatMap((run, r) => run.map((c, i) => ({ ...c, operator: i === 0 ? (r === 0 ? null : 'or') : 'and' })));

/**
 * `a AND b` for flat filters where `and` binds tighter than `or`. Distributes
 * the runs, (a1 or a2) and (b1 or b2) = a1b1 or a1b2 or a2b1 or a2b2, which
 * is the only way to express it without parentheses. An empty side matches
 * everyone, so the other side is returned as is.
 */
export const andFilters = (a: ContactFilter | undefined, b: ContactFilter | undefined): ContactFilter => {
  const ra = toRuns(a?.conditions);
  const rb = toRuns(b?.conditions);
  if (!ra.length) return { type: FILTER_TAG, conditions: fromRuns(rb) };
  if (!rb.length) return { type: FILTER_TAG, conditions: fromRuns(ra) };
  return { type: FILTER_TAG, conditions: fromRuns(ra.flatMap((x) => rb.map((y) => [...x, ...y]))) };
};

/** The CPaaS limit on conditions in one filter. */
export const MAX_CONDITIONS = 50;
