import { groupAlbums } from '@/services/inbox/albums';
import type { ChatMessage } from '@/services/inbox/store';

let n = 0;
const msg = (over: Partial<ChatMessage> & { content: ChatMessage['content'] }): ChatMessage =>
  ({ id: `m${(n += 1)}`, channel: 'c1', direction: 'inbound', status: 'received', timestamp: 1_700_000_000 + n * 10, context: {}, ...over }) as ChatMessage;
const photo = (over: Partial<ChatMessage> = {}) => msg({ content: { type: 'image', image: { link: `https://x/${n}.jpg` } }, ...over });
const text = () => msg({ content: { type: 'text', text: { body: 'hi' } } });

describe('groupAlbums', () => {
  it('groups 4 or more photos in a row into one album', () => {
    const rows = groupAlbums([text(), photo(), photo(), photo(), photo(), photo(), text()]);
    expect(rows.map((r) => r.kind)).toEqual(['msg', 'album', 'msg']);
    expect(rows[1].kind === 'album' && rows[1].items.length).toBe(5);
  });

  it('keeps fewer than 4 as separate messages', () => {
    expect(groupAlbums([photo(), photo(), photo()]).map((r) => r.kind)).toEqual(['msg', 'msg', 'msg']);
  });

  it('splits on direction, captions and long gaps', () => {
    const mine = { direction: 'outbound' as const, status: 'sent' as const };
    const rows = groupAlbums([
      photo(),
      photo(),
      photo(mine),
      photo(),
      msg({ content: { type: 'image', image: { link: 'https://x/c.jpg', caption: 'look' } } }),
      photo(),
      photo({ timestamp: 1_800_000_000 }),
    ]);
    expect(rows.every((r) => r.kind === 'msg')).toBe(true);
  });

  it('keys a sent message by the bubble it replaced, so the list keeps the same cell', () => {
    const sent = { ...text(), localKey: 'local-1' };
    expect(groupAlbums([sent]).map((r) => r.key)).toEqual(['local-1']);
  });
});
