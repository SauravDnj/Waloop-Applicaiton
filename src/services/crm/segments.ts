/**
 * Saved segments: named contact filters stored on the CPaaS account. They
 * hold no contact ids, so a segment always matches whoever fits it right now.
 */
import type { ContactFilter } from '@ab-ecosystem/cpaas';

import { andFilters, buildContactFilter, countActiveFilters, FILTER_TAG, MAX_CONDITIONS, type LeadFilter } from '@/lib/filters';
import { crm } from './client';

/** What a segment can hold: everything but the search text. */
export const segmentableFilter = (f: LeadFilter): LeadFilter => {
  const { search: _search, ...rest } = f;
  return rest;
};

export const canSaveAsSegment = (f: LeadFilter) => countActiveFilters(segmentableFilter(f)) > 0;

/**
 * A filter as one CPaaS condition list. A chosen segment's own rules are
 * copied in and combined with the other choices (see `andFilters`), since a
 * condition cannot point at a segment. Undefined when the filter is empty.
 */
export const resolveCondition = async (f: LeadFilter | undefined): Promise<ContactFilter | undefined> => {
  if (!f || !countActiveFilters(f)) return undefined;
  const { segment, search: _search, ...rest } = f;
  const restFilter = countActiveFilters(rest) ? buildContactFilter(rest).filter : undefined;
  const segFilter = segment ? (await crm().segments.get(segment)).filter : undefined;
  const combined = andFilters(segFilter, restFilter);
  if ((combined.conditions?.length ?? 0) > MAX_CONDITIONS) throw new Error(`The condition is too complex (over ${MAX_CONDITIONS} rules). Pick fewer options.`);
  return combined.conditions?.length ? combined : undefined;
};

/** Saves the filter as a segment. */
export const createSegment = async (name: string, f: LeadFilter, description?: string) => {
  const filter = await resolveCondition(segmentableFilter(f));
  return crm().segments.create({ name: name.trim(), description: description?.trim() || undefined, filter: filter ?? { type: FILTER_TAG, conditions: [] } });
};

export const deleteSegment = (id: string) => crm().segments.delete(id);
