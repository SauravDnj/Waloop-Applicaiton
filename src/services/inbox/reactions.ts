/**
 * Reactions, as WhatsApp shows them: not messages of their own but an emoji
 * under the message they react to. A reaction row names its target by the
 * provider id (`reaction.message_id`, or `mid` from Instagram); each side (the
 * contact, the business) has at most one reaction per message, the latest
 * wins, and an empty emoji (or Instagram's `unreact`) takes it away.
 */
import { isMine } from './albums';
import type { ChatMessage } from './store';

export type Reaction = { emoji: string; mine: boolean; pending: boolean };

/** The few offered first; more are a tap away. */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

type Obj = Record<string, unknown>;

/** What a reaction row says: its target's provider id and the emoji ('' = removed). Null for other messages. */
export const reactionOf = (m: Pick<ChatMessage, 'content'>): { target: string; emoji: string } | null => {
  const c = (m.content ?? {}) as Obj;
  if (c.type !== 'reaction') return null;
  const r = (c.reaction && typeof c.reaction === 'object' ? c.reaction : {}) as Obj;
  const target = String(r.message_id ?? r.mid ?? '');
  if (!target) return null;
  return { target, emoji: r.action === 'unreact' ? '' : String(r.emoji ?? '') };
};

/**
 * Splits a thread (oldest first) into the reactions on each message, by its provider id, and
 * the messages to draw. A reaction to a message that isn't loaded stays in the thread, so it
 * isn't lost. Failed sends don't count.
 */
export const collectReactions = (thread: ChatMessage[]) => {
  const ids = new Set(thread.map((m) => m.message_id).filter(Boolean));
  const latest = new Map<string, Map<'me' | 'them', Reaction>>();
  const rest: ChatMessage[] = [];
  for (const m of thread) {
    const r = reactionOf(m);
    if (!r || !ids.has(r.target)) {
      rest.push(m);
      continue;
    }
    if (m.status === 'failed') continue;
    const mine = isMine(m);
    const sides = latest.get(r.target) ?? new Map<'me' | 'them', Reaction>();
    if (r.emoji) sides.set(mine ? 'me' : 'them', { emoji: r.emoji, mine, pending: !!m.pending });
    else sides.delete(mine ? 'me' : 'them');
    latest.set(r.target, sides);
  }
  const reactions = new Map<string, Reaction[]>();
  for (const [target, sides] of latest) if (sides.size) reactions.set(target, [...sides.values()]);
  return { reactions, rest };
};

/** The business's own current reaction on a message, '' when none. */
export const myReaction = (list: Reaction[] | undefined) => list?.find((r) => r.mine)?.emoji ?? '';
