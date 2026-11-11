/** Notes on a contact: the CPaaS contact-notes resource, newest first. */
import type { ContactNote } from '@ab-ecosystem/cpaas';

import { crm } from './client';

/** Up to `max` notes (the API pages by cursor). */
export const listNotes = async (contactId: string, max = 200): Promise<ContactNote[]> => {
  const out: ContactNote[] = [];
  let cursor: string | undefined;
  do {
    const page = await crm().contactNotes.list(contactId, { limit: 100, cursor });
    out.push(...page.data);
    cursor = page.nextCursor ?? undefined;
  } while (cursor && out.length < max);
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

export const addNote = (contactId: string, note: string) => crm().contactNotes.create(contactId, { note: note.trim() });

export const deleteNote = (contactId: string, noteId: string) => crm().contactNotes.delete(contactId, noteId);
