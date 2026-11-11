/**
 * Matching a stored message to the optimistic bubble it stands for, and handing the bubble's
 * list key and local file over to it (so the chat doesn't redraw it). Kept apart from the
 * socket manager so it can be tested on its own.
 */
import type { Message } from '@ab-ecosystem/cpaas';

import type { ChatMessage } from './store';

const textOf = (x: Pick<Message, 'content'>) => (x.content as { text?: { body?: string } } | undefined)?.text?.body ?? '';
/** A reaction's target and emoji. */
const reactionKey = (x: Pick<Message, 'content'>) => {
  const r = (x.content as { reaction?: { message_id?: string; emoji?: string } } | undefined)?.reaction;
  return `${r?.message_id ?? ''}|${r?.emoji ?? ''}`;
};
export const samePayload = (pending: ChatMessage, m: Message) =>
  pending.content?.type === m.content?.type &&
  (m.content?.type === 'text' ? textOf(pending) === textOf(m) : m.content?.type === 'reaction' ? reactionKey(pending) === reactionKey(m) : true);

/** A message's media link (its `image.link`, `video.link`…), if it has one. */
const mediaLinkOf = (x: Pick<Message, 'content'>) => {
  const c = (x.content ?? {}) as Record<string, { link?: string } | undefined>;
  return c[String(x.content?.type)]?.link ?? '';
};

/** The local file an optimistic media bubble was sent from. */
const localLink = (x: ChatMessage) => {
  const link = mediaLinkOf(x);
  return /^(file|content|ph|blob|data):/.test(link) ? link : (x.localUri ?? '');
};

/**
 * Whether a stored row is the one an optimistic bubble stands for, by what both are sure to
 * share: the draft the send answered with (its id, or the queue id in its `message_id`), or
 * the link the bubble's file was uploaded to / forwarded with. Several photos or voice notes
 * in flight, finishing out of order, each get their own row.
 */
export const isEchoOf = (bubble: ChatMessage, m: Message) => {
  if ((bubble.draftId && m.id === bubble.draftId) || (bubble.queueId && m.message_id === bubble.queueId)) return true;
  const link = mediaLinkOf(bubble);
  const own = bubble.sentLink || (/^https?:/.test(link) ? link : '');
  if (own) return bubble.content?.type === m.content?.type && mediaLinkOf(m) === own;
  // A file still uploading has no row yet.
  return !link && samePayload(bubble, m);
};

/** A media message's caption and file name, for telling same-kind files apart. */
const detailsOf = (x: Pick<Message, 'content'>) => {
  const c = (x.content ?? {}) as Record<string, { caption?: string; filename?: string } | undefined>;
  const b = c[String(x.content?.type)] ?? {};
  return `${b.caption ?? ''}|${b.filename ?? ''}`;
};

/**
 * The bubble a stored row replaces, among `bubbles` (oldest first). The server's row carries
 * no queue id, so: its own by `isEchoOf` (the uploaded link), else, when the server stored
 * the file under another link, by content: the oldest finished upload of the same kind with
 * the same caption and file name, then of the same kind. -1 when none.
 */
export const findBubble = (bubbles: ChatMessage[], m: Message) => {
  const exact = bubbles.findIndex((x) => x.pending && isEchoOf(x, m));
  if (exact >= 0) return exact;
  const uploaded = (x: ChatMessage) => x.pending && !!x.sentLink && x.content?.type === m.content?.type;
  const same = bubbles.findIndex((x) => uploaded(x) && detailsOf(x) === detailsOf(m));
  return same >= 0 ? same : bubbles.findIndex(uploaded);
};

/** The stored row taking an optimistic bubble's place: same list key, same file shown meanwhile. */
export const takeOver = (bubble: ChatMessage, m: Message): ChatMessage => ({
  ...m,
  localKey: bubble.localKey ?? bubble.id,
  localUri: localLink(bubble) || undefined,
});
/** A replaced row keeps the list key and local file it had. */
export const keepKeys = (old: ChatMessage, m: Message): ChatMessage => ({ ...m, localKey: old.localKey, localUri: old.localUri });
