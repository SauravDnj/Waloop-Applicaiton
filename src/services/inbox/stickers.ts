/**
 * Stickers to pick from, per account: the ones this phone sent, newest first,
 * then every sticker in the chats loaded now (received ones included), so a
 * sticker a contact sent can be sent back with one tap. Kept as links: a
 * sticker already hosted is sent again without uploading anything.
 */
import { readJson, writeJson } from '@/services/storage';
import { renderContent } from './render';
import { inboxOf } from './store';

const KEY = 'inbox.stickers';
const MAX = 40;

const recent = (acct: string) => readJson<string[]>(KEY, acct) ?? [];

/** Puts a sent sticker first in the account's list. */
export const rememberSticker = (acct: string, link: string) => {
  if (!/^https?:/.test(link)) return;
  writeJson(KEY, [link, ...recent(acct).filter((x) => x !== link)].slice(0, MAX), acct);
};

export const forgetSticker = (acct: string, link: string) =>
  writeJson(
    KEY,
    recent(acct).filter((x) => x !== link),
    acct,
  );

/** Sent stickers first, then those seen in loaded chats (newest first), without repeats. */
export const stickersFor = (acct: string): string[] => {
  const seen: string[] = [];
  for (const thread of Object.values(inboxOf(acct).threads))
    for (const m of thread) {
      const r = renderContent(m.content);
      if (r.kind === 'media' && r.media === 'sticker' && /^https?:/.test(r.link)) seen.push(r.link);
    }
  return [...new Set([...recent(acct), ...seen.reverse()])].slice(0, MAX * 2);
};
