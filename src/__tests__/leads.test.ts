import type { Contact } from '@ab-ecosystem/cpaas';

import { fieldText, toLead } from '@/services/crm/leads';

const contact = (overrides: Partial<Contact> = {}): Contact =>
  ({
    id: 'c1',
    name: { salutation: '', first_name: 'Ada', last_name: 'Lovelace' },
    profile: {
      whatsapp: {
        id: 'p1',
        channel: 'whatsapp',
        identifier: '919876543210',
        name: 'Ada',
        profile_pic: '',
        extra: {},
      },
    },
    custom_field_hash: {
      stage: 'Follow-Up',
      visits: 3,
      interests: ['Cakes', 'Cookies'],
    },
    chat_metadata: {
      new: false,
      archived: false,
      unread: 2,
      pause_duration: 0,
      marked_as_unread: false,
      closed: false,
      marked_as_done: false,
      blocked: { incoming: false, outgoing: false, bot: false, api: false },
    },
    last_seen: 0,
    last_icm_timestamp: 0,
    last_interaction_props: {},
    agent: 'u9',
    team: null,
    lead_source: { type: 'import', id: null },
    status: 'live',
    privacy_status: 'open',
    tags: [],
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    ...overrides,
  }) as Contact;

describe('toLead', () => {
  it('flattens a contact, keeping its field values as they are', () => {
    const lead = toLead(contact());
    expect(lead.name).toBe('Ada Lovelace');
    expect(lead.phone).toBe('919876543210');
    expect(lead.fields).toEqual({ stage: 'Follow-Up', visits: 3, interests: ['Cakes', 'Cookies'] });
    expect(lead.agentId).toBe('u9');
    expect(lead.unread).toBe(2);
  });

  it('falls back to the number when there is no name', () => {
    const lead = toLead(contact({ name: { salutation: '', first_name: '', last_name: '' } }));
    expect(lead.name).toBe('Ada'); // profile name wins over the number
    const bare = toLead(
      contact({
        name: { salutation: '', first_name: '', last_name: '' },
        profile: {
          whatsapp: {
            id: 'p',
            channel: 'whatsapp',
            identifier: '15550001',
            name: '',
            profile_pic: '',
            extra: {},
          },
        },
      }),
    );
    expect(bare.name).toBe('+15550001');
  });

  it('tolerates a contact with no channel identity', () => {
    const lead = toLead(contact({ profile: {} }));
    expect(lead.phone).toBe('');
    expect(lead.name).toBe('Ada Lovelace');
  });
});

describe('fieldText', () => {
  it('reads any field as text', () => {
    const lead = toLead(contact());
    expect(fieldText(lead, 'stage')).toBe('Follow-Up');
    expect(fieldText(lead, 'visits')).toBe('3');
    expect(fieldText(lead, 'interests')).toBe('Cakes, Cookies');
    expect(fieldText(lead, 'missing')).toBe('');
  });
});
