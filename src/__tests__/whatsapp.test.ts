import type { Template } from '@ab-ecosystem/cpaas';

import { parseAccessId } from '@/services/accessId';
import { fieldSlug } from '@/services/crm/fields';
import { buildComponents, buildSendComponents, parseTemplate, slotsOf, templateName, variablesIn } from '@/services/crm/whatsapp';

const tpl = (components: Record<string, unknown>[], parameterFormat: 'POSITIONAL' | 'NAMED' = 'POSITIONAL') =>
  ({ id: 't1', name: 'demo', language: 'en', parameterFormat, components }) as unknown as Template;

describe('templates', () => {
  const components = [
    { type: 'HEADER', format: 'TEXT', text: 'Hi {{1}}' },
    { type: 'BODY', text: 'Order {{1}} for {{2}} ships {{1}}' },
    {
      type: 'BUTTONS',
      buttons: [
        { type: 'URL', text: 'Track', url: 'https://x.io/{{1}}' },
        { type: 'QUICK_REPLY', text: 'Ok' },
      ],
    },
  ];

  it('finds unique variables in order', () => {
    expect(variablesIn('a {{2}} b {{1}} c {{2}} {{ name }}')).toEqual(['2', '1', 'name']);
    // Positional: by number, the order WhatsApp binds parameters in.
    expect(variablesIn('Order {{2}} for {{1}}')).toEqual(['1', '2']);
  });

  it('lists header, body and button slots', () => {
    expect(slotsOf(parseTemplate(components)).map((s) => s.key)).toEqual(['header:1', 'body:1', 'body:2', 'button:0:1']);
  });

  it('builds the send components with values in slot order', () => {
    const out = buildSendComponents(tpl(components), { 'header:1': 'Asha', 'body:1': '4821', 'body:2': 'Asha', 'button:0:1': 'abc' });
    expect(out).toEqual([
      { type: 'header', parameters: [{ type: 'text', text: 'Asha' }] },
      {
        type: 'body',
        parameters: [
          { type: 'text', text: '4821' },
          { type: 'text', text: 'Asha' },
        ],
      },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: 'abc' }] },
    ]);
  });

  it('puts media in the header and names parameters for NAMED templates', () => {
    const out = buildSendComponents(
      tpl(
        [
          { type: 'HEADER', format: 'IMAGE' },
          { type: 'BODY', text: 'Hi {{first}}' },
        ],
        'NAMED',
      ),
      { 'body:first': 'Ravi' },
      {
        format: 'IMAGE',
        link: 'https://cdn/x.jpg',
      },
    );
    expect(out[0]).toEqual({ type: 'header', parameters: [{ type: 'image', image: { link: 'https://cdn/x.jpg' } }] });
    expect(out[1]).toEqual({ type: 'body', parameters: [{ type: 'text', text: 'Ravi', parameter_name: 'first' }] });
  });

  it('builds create components with examples', () => {
    const comps = buildComponents({
      name: 'x',
      category: 'UTILITY',
      language: 'en',
      header: { format: 'IMAGE', text: '', handle: 'h:1' },
      body: 'Hi {{1}}',
      bodySamples: { '1': 'Asha' },
      footer: 'Bye',
      buttons: [],
      submit: false,
    });
    expect(comps).toEqual([
      { type: 'HEADER', format: 'IMAGE', example: { header_handle: ['h:1'] } },
      { type: 'BODY', text: 'Hi {{1}}', example: { body_text: [['Asha']] } },
      { type: 'FOOTER', text: 'Bye' },
    ]);
  });

  it('makes Meta-safe template names', () => {
    expect(templateName('Follow up – after Call!')).toBe('follow_up_after_call');
  });
});

describe('access id', () => {
  it('accepts a bare id, a query parameter or an app link', () => {
    expect(parseAccessId('  tpc_ABC123 ')).toBe('tpc_ABC123');
    expect(parseAccessId('https://example.com/join?access_id=tpc_X1')).toBe('tpc_X1');
    expect(parseAccessId('inboxcampaign://access/tpc_Y2')).toBe('tpc_Y2');
    expect(parseAccessId('crmdialer://access/tpc_Z3')).toBe('tpc_Z3');
  });
});

describe('fields', () => {
  it('makes unique, valid slugs that avoid reserved names', () => {
    expect(fieldSlug('Visit date', [])).toBe('visit_date');
    expect(fieldSlug('Visit date', ['visit_date'])).toBe('visit_date_2');
    expect(fieldSlug('***', [])).toBe('field');
    expect(fieldSlug('2nd phone', [])).toBe('nd_phone');
    expect(fieldSlug('Email', [])).toBe('email_field');
  });
});

describe('mixed variable values', () => {
  it('fills lead fields inside typed text', () => {
    const { resolveValues } = jest.requireActual('@/services/crm/whatsapp') as typeof import('@/services/crm/whatsapp');
    const lead = { name: 'Asha Rao', firstName: 'Asha', lastName: 'Rao', fields: { plan: 'Gold plan', deal_value: 4999 } } as never;
    const out = resolveValues(
      [
        { key: 'body:1', part: 'body', name: '1' },
        { key: 'body:2', part: 'body', name: '2' },
      ],
      { 'body:1': { kind: 'text', value: 'Rs [[deal_value]] for [[plan]]' }, 'body:2': { kind: 'field', key: 'first_name' } },
      lead,
      { myName: 'Me', workspace: 'W' },
    );
    expect(out).toEqual({ 'body:1': 'Rs 4999 for Gold plan', 'body:2': 'Asha' });
  });
});

describe('session messages', () => {
  it('builds text and media bodies with lead fields filled', () => {
    const { sessionContent } = jest.requireActual('@/services/crm/whatsapp') as typeof import('@/services/crm/whatsapp');
    const lead = { name: 'Asha Rao', firstName: 'Asha', fields: {} } as never;
    const ctx = { myName: 'Me', workspace: 'W' };
    expect(sessionContent({ type: 'text', text: 'Hi [[first_name]]' }, lead, ctx)).toEqual({ type: 'text', text: { body: 'Hi Asha' } });
    expect(sessionContent({ type: 'document', text: 'Quote', media: { link: 'https://x/q.pdf', filename: 'q.pdf' } }, lead, ctx)).toEqual({
      type: 'document',
      document: { link: 'https://x/q.pdf', caption: 'Quote', filename: 'q.pdf' },
    });
    expect(sessionContent({ type: 'image', text: '', media: { link: 'https://x/a.jpg' } }, lead, ctx)).toEqual({
      type: 'image',
      image: { link: 'https://x/a.jpg' },
    });
  });
});
