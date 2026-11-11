import type { Chat } from '@ab-ecosystem/cpaas';

import { restoreInbox, startInboxCache } from '@/services/inbox/cache';
import { inboxOf, useInboxStore } from '@/services/inbox/store';
import { clearAccountStorage, readJson } from '@/services/storage';
import { useAccountsStore } from '@/stores/accounts';

const chat = (id: string) => ({ id, name: { first_name: id }, chat_metadata: {}, last_interaction_props: {} }) as unknown as Chat;
const msg = (id: string, contact: string) => ({ id, contact, content: { type: 'text', text: { body: id } }, timestamp: 1 }) as never;

describe('inbox kept on the phone, per account', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    useAccountsStore.setState({
      sessions: [{ id: 'A' }, { id: 'B' }] as never,
      activeId: 'A',
    });
    startInboxCache();
  });
  afterAll(() => jest.useRealTimers());

  it('saves and restores each account on its own', () => {
    const { patch, drop } = useInboxStore.getState();
    patch('A', () => ({ chats: [chat('a1')], threads: { a1: [msg('m1', 'a1')] }, loaded: true }));
    patch('B', () => ({ chats: [chat('b1'), chat('b2')], threads: {}, loaded: true }));
    jest.advanceTimersByTime(2000);

    // A fresh start: memory empty, each account restored from its own storage.
    drop('A');
    drop('B');
    restoreInbox('A');
    restoreInbox('B');
    expect(inboxOf('A').chats.map((c) => c.id)).toEqual(['a1']);
    expect(inboxOf('A').threads.a1?.map((m) => m.id)).toEqual(['m1']);
    expect(inboxOf('B').chats.map((c) => c.id)).toEqual(['b1', 'b2']);
  });

  it('does not bring back an account that signed out', async () => {
    const { patch } = useInboxStore.getState();
    patch('B', () => ({ chats: [chat('b3')] }));
    // B signs out before the delayed save fires.
    useAccountsStore.setState({ sessions: [{ id: 'A' }] as never });
    await clearAccountStorage('B');
    jest.advanceTimersByTime(2000);
    expect(readJson('inbox.cache.v1', 'B')).toBeNull();
    expect(readJson<{ chats: unknown[] }>('inbox.cache.v1', 'A')?.chats).toHaveLength(1);
  });
});
