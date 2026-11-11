import { channelState, type Channel } from '@/services/crm/channels';

const channel = (over: Partial<Channel> & { registration?: 'pending' | 'completed'; category?: string }): Channel =>
  ({
    id: 'c1',
    active: true,
    basic_details: { name: 'Sales', color_code: '#25D366', channel_identity: '919812345678' },
    meta: { category: over.category ?? 'whatsapp' },
    cloud: { wa_biz_registration: over.registration ?? 'completed' },
    wallet: { balance: 0, currency: 'INR' },
    ...over,
  }) as unknown as Channel;

describe('channel state', () => {
  it('flags a WhatsApp number that still needs registering', () => {
    expect(channelState(channel({ registration: 'pending', active: false }))).toBe('setup');
    expect(channelState(channel({}))).toBe('live');
    expect(channelState(channel({ active: false }))).toBe('off');
    expect(channelState(channel({ category: 'sms', registration: 'pending' }))).toBe('live');
  });
});
