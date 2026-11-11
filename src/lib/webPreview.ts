/**
 * Development only: `?preview=1` on the local web dev server opens the app as a
 * signed-in demo workspace with sample data and no server calls, so screens can
 * be laid out and captured (store screenshots). Compiled out of production
 * builds (`__DEV__`). Every phone number is one digit short of a real one.
 */
import type { CrmClient } from '@ab-ecosystem/cpaas';
import { Platform } from 'react-native';

type Rec = Record<string, unknown>;

const FLAG = 'inboxcampaign:preview';
export const PREVIEW_ID = 'preview:preview';

export const isWebPreview = (): boolean =>
  __DEV__ &&
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  (new URLSearchParams(window.location.search).has('preview') || sessionStorage.getItem(FLAG) === '1');

const now = Date.now();
const MIN = 60_000;
const H = 60 * MIN;
const D = 24 * H;
const iso = (offset: number) => new Date(now + offset).toISOString();

const WORKSPACE = 'Aanya Boutique';
const OWNER = { id: 'preview', firstName: 'Riya', lastName: 'Kapoor', email: 'riya@aanya.example' };

const NAMES = [
  'Priya Sharma', 'Rahul Mehta', 'Ananya Iyer', 'Vikram Rao', 'Sneha Patel', 'Arjun Nair', 'Kavya Reddy', 'Rohan Gupta',
  'Meera Joshi', 'Aditya Singh', 'Isha Verma', 'Karan Malhotra', 'Pooja Desai', 'Nikhil Bose', 'Tanvi Kulkarni', 'Siddharth Jain',
  'Neha Kapoor', 'Varun Chawla', 'Divya Menon', 'Aman Khanna', 'Riya Banerjee', 'Kunal Shah', 'Shruti Pillai', 'Manish Agarwal',
];
const CITIES = ['Mumbai', 'Pune', 'Bengaluru', 'Delhi', 'Ahmedabad', 'Jaipur', 'Hyderabad', 'Chennai'];
const STAGES = ['New enquiry', 'Interested', 'Order placed', 'Delivered'];
const TYPES = ['Retail', 'Wholesale', 'Bridal'];
const TAGS = [
  { id: 'tg1', name: 'VIP', color: '#7C3AED' },
  { id: 'tg2', name: 'Festive', color: '#F59E0B' },
  { id: 'tg3', name: 'Repeat buyer', color: '#16A34A' },
  { id: 'tg4', name: 'Instagram', color: '#DB2777' },
];

const opts = (values: string[]) => ({ options: values.map((value) => ({ label: value, value })) });
const field = (slug: string, name: string, dataType: string, extra: Rec = {}) => ({
  id: slug,
  slug,
  name,
  type: 'user',
  dataType,
  default: {},
  props: {},
  required: false,
  displayInPanel: true,
  showInSidebar: true,
  showAsLabel: false,
  isBoard: false,
  teamAccess: 'open_to_all',
  createdAt: iso(-90 * D),
  updatedAt: iso(-5 * D),
  ...extra,
});
const FIELDS = [
  field('stage', 'Stage', 'dropdown', { props: opts(STAGES), showAsLabel: true }),
  field('customer_type', 'Customer type', 'dropdown', { props: opts(TYPES), showAsLabel: true }),
  field('city', 'City', 'text'),
  field('budget', 'Budget', 'amount'),
  field('last_order', 'Last order', 'date'),
  field('email_address', 'Email', 'email'),
];

const phoneOf = (i: number) => `9198${String(1234567 + i * 7919).slice(0, 7)}`; // 9 digits after +91: not a real number
const contacts = NAMES.map((n, i) => {
  const [first, last] = n.split(' ');
  return {
    id: i === 0 ? 'c0' : `c${i}`,
    name: { salutation: '', first_name: first, last_name: last },
    profile: { whatsapp: { id: `p${i}`, channel: 'whatsapp', identifier: phoneOf(i), name: n, profile_pic: '', extra: {} } },
    custom_field_hash: {
      stage: STAGES[i % STAGES.length],
      customer_type: TYPES[i % 5 === 0 ? 2 : i % 3 === 0 ? 1 : 0],
      city: CITIES[i % CITIES.length],
      budget: 5000 + ((i * 3700) % 45000),
      ...(i % 2 ? { last_order: iso(-(i * 3 + 2) * D).slice(0, 10) } : {}),
      email_address: `${first.toLowerCase()}@example.com`,
    },
    chat_metadata: { new: i === 1, archived: false, unread: i % 4 === 0 ? (i % 3) + 1 : 0, pause_duration: 0, marked_as_unread: false, closed: false, marked_as_done: false, blocked: {} },
    last_seen: Math.floor((now - (i * 47 + 3) * MIN) / 1000),
    last_icm_timestamp: 0,
    last_interaction_props: {},
    agent: null,
    team: null,
    lead_source: { type: 'manual', id: null },
    status: 'live',
    privacy_status: 'open',
    tags: [TAGS[i % 4], ...(i % 3 === 0 ? [TAGS[(i + 1) % 4]] : [])],
    createdAt: iso(-(i + 2) * D),
    updatedAt: iso(-i * H),
  };
});

const CHAT_LINES: [string, string, string][] = [
  ['Hi! Is the maroon silk saree still available?', 'Yes it is 😊 Sharing more photos now.', 'Lovely, please reserve one for me!'],
  ['Do you ship to Pune?', 'We do, free shipping above ₹2,000.', 'Great, placing the order today.'],
  ['Can I get the bridal catalogue?', 'Sending it right away 💐', 'Thank you! The lehengas look beautiful.'],
  ['What are your store hours?', '11 am to 9 pm, all days.', 'Perfect, see you on Saturday.'],
  ['My order hasn’t arrived yet', 'Sorry! It’s out for delivery today.', 'Got it, thanks for the quick update 🙏'],
  ['Any Diwali offers?', 'Flat 20% off on festive wear this week 🪔', 'Amazing, adding three to cart!'],
];

const page = <T>(all: T[], q: { page?: number; rows?: number } = {}) => {
  const rows = q.rows ?? 25;
  const p = q.page ?? 1;
  return { data: all.slice((p - 1) * rows, p * rows), pagination: { page: p, rows, total: all.length, pages: Math.max(1, Math.ceil(all.length / rows)) } };
};

const TEMPLATES = [
  { name: 'festive_offer', category: 'MARKETING', body: 'Hi {{1}}! 🪔 Our festive collection is here — flat 20% off this week. Reply YES to see the lookbook.' },
  { name: 'order_confirmed', category: 'UTILITY', body: 'Hi {{1}}, your order is confirmed ✅ We will share tracking details once it ships.' },
  { name: 'new_arrivals', category: 'MARKETING', body: 'Hello {{1}}, fresh arrivals just landed at Aanya Boutique ✨ Tap below to explore.' },
  { name: 'payment_reminder', category: 'UTILITY', body: 'Hi {{1}}, a gentle reminder that ₹{{2}} is due for your order. Thank you!' },
].map((t, i) => ({
  id: `t${i + 1}`,
  channelId: 'preview-wa',
  type: 'whatsapp',
  name: t.name,
  category: t.category,
  status: 'approved',
  language: 'en',
  parameterFormat: 'POSITIONAL',
  hash: `${t.name}:en`,
  components: [{ type: 'BODY', text: t.body }],
  createdAt: iso(-30 * D),
  updatedAt: iso(-3 * D),
}));

const CAMPAIGNS = [
  { id: 'cp1', name: 'Diwali festive offer', status: 'completed', template: 'festive_offer', receivers: 640, processedAt: iso(-3 * D), completedAt: iso(-3 * D + 40 * MIN) },
  { id: 'cp2', name: 'New arrivals · weekend', status: 'pending', template: 'new_arrivals', receivers: 0, scheduledAt: iso(2 * D) },
  { id: 'cp3', name: 'Wholesale price list', status: 'processing', template: 'new_arrivals', receivers: 220, processedAt: iso(-20 * MIN) },
  { id: 'cp4', name: 'Bridal season launch', status: 'completed', template: 'new_arrivals', receivers: 410, processedAt: iso(-12 * D), completedAt: iso(-12 * D + H) },
  { id: 'cp5', name: 'Payment reminders · October', status: 'pending', template: 'payment_reminder', receivers: 0 },
].map((c) => ({
  ...c,
  version: '1',
  crmVersion: '1',
  type: 'bulk_campaign',
  campaignType: 'whatsapp',
  channelType: 'whatsapp',
  messagingPattern: 'single',
  trigger: {},
  triggerInfo: {},
  filters: [],
  messages: [{ channel: { id: 'preview-wa' }, message: { type: 'template', template: { name: c.template, language: { code: 'en' } } } }],
  showMessageInPanel: false,
  isRepeating: false,
  hidden: false,
  createdAt: iso(-15 * D),
  updatedAt: iso(-D),
}));

const CHANNEL = {
  id: 'preview-wa',
  active: true,
  basic_details: { name: 'Aanya Boutique', color_code: '#25D366', channel_identity: '91981234567' },
  meta: { category: 'whatsapp', provider: 'EMBEDDED', support_template: true, show_template: true, bypass_webhook_verification: false },
  wallet: { balance: 2450.5, currency: 'INR' },
  campaign_tps: 10,
  upgraded_webhook_listener: true,
  cloud: { waba_id: '1', business: '1', phone_number_id: '1', is_on_biz_app: false, version: 'v21.0', auto_read_receipt: 0, wa_biz_registration: 'completed' },
  api_only: false,
  crm_only: false,
};

const QUICK_REPLIES = [
  { id: 'q1', shortcut: 'hours', message: 'We are open 11 am to 9 pm, all days 😊' },
  { id: 'q2', shortcut: 'ship', message: 'Free shipping on orders above ₹2,000. Delivery in 3–5 days.' },
  { id: 'q3', shortcut: 'thanks', message: 'Thank you for shopping with Aanya Boutique 💐' },
];

type Cond = { field_id?: string; field_type?: string; condition?: string; value?: unknown };
const fits = (c: (typeof contacts)[number], conds: Cond[] | undefined) =>
  (conds ?? []).every((x) => {
    if (x.field_type !== 'dropdown') return true;
    const v = String((c.custom_field_hash as Rec)[String(x.field_id)] ?? '');
    if (x.condition === 'equal to') return v === String(x.value ?? '');
    if (x.condition === 'is empty' || x.condition === 'does not exist' || x.condition === 'is null') return !v;
    return true;
  });

const fixed: Record<string, Rec> = {
  contacts: {
    list: async (q: { search?: string; page?: number; rows?: number; filter?: { conditions?: Cond[] } } = {}) => {
      const s = (q.search ?? '').toLowerCase();
      // `or` runs (board "not set") are rare in the sample: the first run decides.
      const conds = q.filter?.conditions?.filter((x, i, all) => i === 0 || (x as { operator?: string }).operator !== 'or' || !all.length);
      return page(contacts.filter((c) => (!s || `${c.name.first_name} ${c.name.last_name}`.toLowerCase().includes(s)) && fits(c, conds)), q);
    },
    get: async (id: string) => contacts.find((c) => c.id === id) ?? contacts[0],
    iterate: async function* () {
      for (const c of contacts) yield c;
    },
  },
  customFields: { list: async () => page(FIELDS, { rows: 100 }) },
  contactTags: { list: async () => page(TAGS, { rows: 100 }) },
  contactNotes: {
    list: async () => ({
      data: [
        { id: 'n1', contact: 'c0', note: 'Prefers pastel colours. Wedding in December.', attachments: [], mentions: [], createdAt: iso(-2 * D), updatedAt: iso(-2 * D) },
        { id: 'n2', contact: 'c0', note: 'Paid advance for the silk saree.', attachments: [], mentions: [], createdAt: iso(-6 * H), updatedAt: iso(-6 * H) },
      ],
      nextCursor: null,
    }),
  },
  cannedReplies: { list: async () => page(QUICK_REPLIES, { rows: 100 }) },
  channels: { list: async () => page([CHANNEL], { rows: 100 }), get: async () => ({ data: CHANNEL }) },
  templates: { list: async () => page(TEMPLATES, { rows: 100 }) },
  campaigns: {
    list: async (q: { status?: string } = {}) => ({ data: CAMPAIGNS.filter((c) => !q.status || c.status === q.status), nextCursor: null }),
    get: async (id: string) => CAMPAIGNS.find((c) => c.id === id) ?? CAMPAIGNS[0],
  },
  campaignMessages: {
    stats: async (id: string) =>
      id === 'cp3' ? { total: 220, sent: 140, delivered: 131, read: 74, replied: 12, failed: 3 } : { total: 640, sent: 632, delivered: 618, read: 497, replied: 118, failed: 8 },
    replies: async () => ({ replied: 118, distinct: 3, groups: [
      { reply: 'YES', replyType: 'text', count: 71 },
      { reply: 'Please share the lookbook', replyType: 'text', count: 29 },
      { reply: 'Stop', replyType: 'text', count: 6 },
    ] }),
    list: async () =>
      page(
        contacts.slice(0, 12).map((c, i) => ({
          id: `m${i}`,
          identifier: c.profile.whatsapp.identifier,
          name: `${c.name.first_name} ${c.name.last_name}`,
          status: ['replied', 'read', 'delivered', 'read', 'failed', 'read'][i % 6],
          reply: i % 6 === 0 ? 'YES' : '',
          error: i % 6 === 4 ? 'Number not on WhatsApp' : '',
        })),
      ),
  },
  segments: { list: async () => page([{ id: 's1', name: 'VIP customers in Mumbai', filter: { conditions: [] } }]) },
  notifications: { devices: async () => page([]) },
};

const ok = async () => ({ data: {}, success: true });
const emptyList = async () => page([]);
const resource = (name: string) =>
  new Proxy((fixed[name] ?? {}) as Rec, {
    get: (target, method: string) => target[method] ?? (/^(list|search|stats|replies|iterate)/.test(method) ? emptyList : ok),
  });

/** A stand-in for the CPaaS client that answers from the sample workspace. */
export const previewClient = (): CrmClient => new Proxy({} as Rec, { get: (_t, name: string) => resource(name) }) as unknown as CrmClient;

/** The first chat is a longer conversation, with reactions on both sides. */
const LONG_CHAT: [boolean, string][] = [
  [true, 'Hi! Is the maroon silk saree still available?'],
  [false, 'Yes it is 😊 Sharing more photos now.'],
  [false, 'It comes with a matching blouse piece. ₹4,850 with free shipping.'],
  [true, 'Lovely, please reserve one for me!'],
  [false, 'Done! Reserved under your name. Payment link coming up 🙌'],
  [true, 'Paid. Can it reach Mumbai by Friday?'],
  [false, 'Yes, it ships today and arrives Thursday 🚚'],
];

/** Sample chats and their threads, in the shape the inbox socket delivers. */
export const previewInbox = () => {
  const chats = contacts
    .slice(0, 12)
    .map((c, i) => ({ ...c, last_interaction_props: { text: i === 0 ? LONG_CHAT[LONG_CHAT.length - 1][1] : CHAT_LINES[i % CHAT_LINES.length][2] } }));
  const threads = Object.fromEntries(
    chats.map((c, i) => {
      const lines: [boolean, string][] =
        i === 0 ? LONG_CHAT : CHAT_LINES[i % CHAT_LINES.length].map((text, k) => [k !== 1, text] as [boolean, string]);
      const n = lines.length + (i === 0 ? 2 : 0);
      const msg = (k: number, inbound: boolean, content: Rec) => ({
        id: `${c.id}-m${k}`,
        message_id: `${c.id}-m${k}`,
        contact: c.id,
        channel: 'preview-wa',
        identifier: c.profile.whatsapp.identifier,
        content,
        direction: inbound ? 'inbound' : 'outbound',
        source: inbound ? 'contact' : 'agent',
        status: inbound ? 'received' : 'read',
        timestamp: c.last_seen - (n - k) * 240,
        agent: inbound ? null : 'preview',
        receipts: {},
      });
      const thread = lines.map(([inbound, text], k) => msg(k, inbound, { type: 'text', text: { body: text } }));
      if (i === 0) {
        const react = (k: number, inbound: boolean, target: number, emoji: string) =>
          msg(k, inbound, { type: 'reaction', reaction: { message_id: `${c.id}-m${target}`, emoji } });
        thread.push(react(lines.length, true, 2, '😍'), react(lines.length + 1, false, 5, '🙏'));
      }
      return [c.id, thread];
    }),
  );
  return { chats, threads };
};

export const previewContext = () => ({ isOwner: true, accountName: WORKSPACE });

export const previewTeam = () => [
  { id: 'preview', userId: 'preview', name: 'Riya Kapoor', email: OWNER.email, roleTitle: 'Owner', isOwner: true, status: 'active', accessExpiry: null },
  { id: 'm2', userId: 'm2', name: 'Arav Sethi', email: 'arav@aanya.example', roleTitle: 'Sales', isOwner: false, status: 'active', accessExpiry: null },
];

/** Signs in the demo workspace (owner) and makes its WhatsApp channel the default. */
export const startWebPreview = async () => {
  sessionStorage.setItem(FLAG, '1');
  const { useAccountsStore, setTokenFor } = await import('@/stores/accounts');
  const { useWhatsAppStore } = await import('@/stores/whatsapp');
  const hydrated = (st: { persist: { hasHydrated: () => boolean; onFinishHydration: (fn: () => void) => () => void } }) =>
    st.persist.hasHydrated() ? Promise.resolve() : new Promise<void>((r) => st.persist.onFinishHydration(() => r()));
  await Promise.all([hydrated(useAccountsStore), hydrated(useWhatsAppStore)]);
  const accounts = useAccountsStore.getState();
  accounts.upsert({
    id: PREVIEW_ID,
    userId: OWNER.id,
    email: OWNER.email,
    name: `${OWNER.firstName} ${OWNER.lastName}`,
    workspaceId: 'preview',
    workspaceName: WORKSPACE,
    isOwner: true,
    roleTitle: 'Owner',
  });
  accounts.setActive(PREVIEW_ID);
  await setTokenFor(PREVIEW_ID, 'preview');
  useWhatsAppStore.getState().set(PREVIEW_ID, { channelId: 'preview-wa', channelName: 'Aanya Boutique' });
  return { token: 'preview', profile: { ...OWNER, avatarUrl: '' } };
};
