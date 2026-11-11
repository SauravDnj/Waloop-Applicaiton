import { previewText, renderContent } from '@/services/inbox/render';

describe('inbox message rendering', () => {
  it('fills template variables from the sent parameters and the approved definition', () => {
    const r = renderContent({
      type: 'template',
      template: { name: 'order_update', language: { code: 'en' }, components: [{ type: 'body', parameters: [{ text: 'Asha' }, { text: '4821' }] }] },
      json: { components: [{ type: 'BODY', text: 'Hi {{1}}, order {{2}} shipped.' }] },
    });
    expect(r.kind).toBe('template');
    if (r.kind !== 'template') return;
    expect(r.values).toEqual({ '1': 'Asha', '2': '4821' });
    expect(
      previewText({
        type: 'template',
        template: { name: 'order_update', components: [{ type: 'body', parameters: [{ text: 'Asha' }, { text: '4821' }] }] },
        json: { components: [{ type: 'BODY', text: 'Hi {{1}}, order {{2}} shipped.' }] },
      }),
    ).toBe('Hi Asha, order 4821 shipped.');
  });

  it('shows exactly which button or list row the lead tapped', () => {
    expect(renderContent({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'b1', title: 'Yes, call me' } } })).toEqual({
      kind: 'reply',
      title: 'Yes, call me',
      description: '',
      via: 'button',
    });
    expect(
      renderContent({ type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'r', title: 'Gold', description: '₹999' } } }),
    ).toMatchObject({ kind: 'reply', via: 'list', title: 'Gold' });
    expect(renderContent({ type: 'button', button: { text: 'Stop promotions' } })).toMatchObject({ kind: 'reply', via: 'template', title: 'Stop promotions' });
  });

  it('reads media with captions and interactive messages with buttons', () => {
    expect(renderContent({ type: 'image', image: { link: 'https://x/a.jpg', caption: 'Invoice' } })).toMatchObject({
      kind: 'media',
      media: 'image',
      caption: 'Invoice',
    });
    expect(
      renderContent({
        type: 'interactive',
        interactive: { type: 'button', body: { text: 'Pick one' }, action: { buttons: [{ reply: { title: 'A' } }, { reply: { title: 'B' } }] } },
      }),
    ).toMatchObject({
      kind: 'interactive',
      body: 'Pick one',
      buttons: ['A', 'B'],
    });
    expect(renderContent({ type: 'mystery' })).toEqual({ kind: 'unknown', type: 'mystery' });
    expect(previewText({ type: 'document', document: { link: 'x', filename: 'quote.pdf' } })).toBe('📄 quote.pdf');
  });
});

// Stored template rows keep the template in different places.
const def = { name: 'order_update', language: 'en', components: [{ type: 'BODY', text: 'Hi {{1}}, order {{2}}' }] };
const sent = { name: 'order_update', language: { code: 'en' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Asha' }, { type: 'text', text: '42' }] }] };
test('renders a template wherever the row keeps it', () => {
  for (const c of [
    { type: 'template', template: sent, json: def },
    { type: 'template', template: { ...sent, json: def } },
    { type: 'template', whatsapp_api: { type: 'template', template: sent }, json: def },
    { type: 'template', message: { template: sent, json: def } },
  ]) {
    const r = renderContent(c) as { kind: string; name: string; parsed: unknown; values: Record<string, string> };
    expect(r.kind).toBe('template');
    expect(r.name).toBe('order_update');
    expect(r.parsed).toBeTruthy();
    expect(r.values).toEqual({ '1': 'Asha', '2': '42' });
  }
});
