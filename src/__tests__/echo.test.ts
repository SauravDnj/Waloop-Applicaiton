import { isEchoOf } from '@/services/inbox/echo';
import type { ChatMessage } from '@/services/inbox/store';

const row = (content: ChatMessage['content'], over: Partial<ChatMessage> = {}) => ({ id: 'srv', content, ...over }) as ChatMessage;
const image = (link: string) => ({ type: 'image', image: { link } }) as ChatMessage['content'];

describe('isEchoOf (which stored row an optimistic bubble stands for)', () => {
  it('matches a media bubble only to the row with its uploaded link', () => {
    const bubble = row(image('file:///a.jpg'), { pending: true, sentLink: 'https://cdn/a.jpg' });
    expect(isEchoOf(bubble, row(image('https://cdn/a.jpg')))).toBe(true);
    // Another photo finishing first must not take this bubble.
    expect(isEchoOf(bubble, row(image('https://cdn/b.jpg')))).toBe(false);
  });

  it('never matches a file still uploading', () => {
    expect(isEchoOf(row(image('file:///a.jpg'), { pending: true }), row(image('https://cdn/a.jpg')))).toBe(false);
  });

  it('matches a forwarded file by the link it was sent with', () => {
    const bubble = row(image('https://cdn/x.jpg'), { pending: true });
    expect(isEchoOf(bubble, row(image('https://cdn/x.jpg')))).toBe(true);
    expect(isEchoOf(bubble, row(image('https://cdn/y.jpg')))).toBe(false);
  });

  it('matches text by its words', () => {
    const text = (body: string) => ({ type: 'text', text: { body } }) as ChatMessage['content'];
    expect(isEchoOf(row(text('hi'), { pending: true }), row(text('hi')))).toBe(true);
    expect(isEchoOf(row(text('hi'), { pending: true }), row(text('ok')))).toBe(false);
  });
});

describe('findBubble (no queue id on the stored row)', () => {
  const { findBubble } = jest.requireActual<typeof import('@/services/inbox/echo')>('@/services/inbox/echo');
  const img = (link: string, caption = '') => ({ type: 'image', image: { link, caption } }) as ChatMessage['content'];
  const bubble = (id: string, sentLink: string | undefined, caption = '') => ({ id, pending: true, sentLink, content: img(`file:///${id}.jpg`, caption) }) as ChatMessage;

  it('prefers the bubble with the same uploaded link, even if another finished first', () => {
    const list = [bubble('a', 'https://cdn/a.jpg'), bubble('b', 'https://cdn/b.jpg')];
    expect(findBubble(list, row(img('https://cdn/b.jpg')))).toBe(1);
  });

  it('falls back to content when the server stored the file under another link', () => {
    const list = [bubble('a', 'https://cdn/a.jpg', 'menu'), bubble('b', 'https://cdn/b.jpg', 'price')];
    expect(findBubble(list, row(img('https://store/x.jpg', 'price')))).toBe(1);
    expect(findBubble(list, row(img('https://store/y.jpg')))).toBe(0);
  });

  it('never gives a stored row a bubble whose file is still uploading', () => {
    expect(findBubble([bubble('a', undefined)], row(img('https://store/x.jpg')))).toBe(-1);
  });
});
