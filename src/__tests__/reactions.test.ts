import { isEchoOf } from '@/services/inbox/echo';
import { collectReactions, myReaction, reactionOf } from '@/services/inbox/reactions';
import type { ChatMessage } from '@/services/inbox/store';

let n = 0;
const msg = (over: Partial<ChatMessage>) => ({ id: `m${(n += 1)}`, message_id: '', status: 'received', direction: 'inbound', timestamp: n, ...over }) as ChatMessage;
const text = (message_id: string) => msg({ message_id, content: { type: 'text', text: { body: 'hi' } } as ChatMessage['content'] });
const reaction = (target: string, emoji: string, over: Partial<ChatMessage> = {}) =>
  msg({ content: { type: 'reaction', reaction: { message_id: target, emoji } } as ChatMessage['content'], ...over });
const mine = { status: 'sent', direction: 'outbound' } as Partial<ChatMessage>;

describe('reactions', () => {
  it('reads WhatsApp and Instagram reactions', () => {
    expect(reactionOf(reaction('w1', '👍'))).toEqual({ target: 'w1', emoji: '👍' });
    const ig = msg({ content: { type: 'reaction', reaction: { mid: 'i1', action: 'unreact', emoji: '❤️' } } as unknown as ChatMessage['content'] });
    expect(reactionOf(ig)).toEqual({ target: 'i1', emoji: '' });
    expect(reactionOf(text('w1'))).toBeNull();
  });

  it('puts reactions under their message, one per side, latest wins', () => {
    const a = text('w1');
    const { reactions, rest } = collectReactions([a, reaction('w1', '👍'), reaction('w1', '😂'), reaction('w1', '❤️', mine)]);
    expect(rest).toEqual([a]);
    expect(reactions.get('w1')).toEqual([
      { emoji: '😂', mine: false, pending: false },
      { emoji: '❤️', mine: true, pending: false },
    ]);
    expect(myReaction(reactions.get('w1'))).toBe('❤️');
  });

  it('takes a reaction back with an empty emoji, and ignores failed sends', () => {
    const { reactions } = collectReactions([text('w1'), reaction('w1', '👍', mine), reaction('w1', '', mine), reaction('w1', '🔥', { ...mine, status: 'failed' })]);
    expect(reactions.has('w1')).toBe(false);
  });

  it('keeps a reaction to a message not loaded in the thread', () => {
    const orphan = reaction('old', '👍');
    expect(collectReactions([orphan]).rest).toEqual([orphan]);
  });

  it('matches a sent reaction to its stored row by target and emoji', () => {
    const bubble = reaction('w1', '👍', { ...mine, pending: true });
    expect(isEchoOf(bubble, reaction('w1', '👍', mine))).toBe(true);
    expect(isEchoOf(bubble, reaction('w2', '👍', mine))).toBe(false);
    expect(isEchoOf(bubble, reaction('w1', '❤️', mine))).toBe(false);
  });
});
