/**
 * Channels: every connection the account sends and receives on (WhatsApp, SMS,
 * RCS, email, webchat) and what can be done to one. Channels are connected
 * outside this app; here they are only managed.
 *
 * Everything that lives with Meta (business profile, registration, test sends)
 * goes through `getProp` / `setProp`. See node_modules/@ab-ecosystem/cpaas/docs/channels.
 */
import type {
  ActivityLog,
  Channel,
  ChannelType,
  UpdateChannelDetailsInput,
  WalletLog,
} from '@ab-ecosystem/cpaas';

import { formatPhone } from '@/lib/phone';

import type { PickedFile } from './whatsapp';
import { crm } from './client';

export type { Channel, ChannelType };

/**
 * A channel's category as the platform reports it. Wider than the SDK's
 * `ChannelType`: accounts also hold Instagram, Facebook and other channels
 * created by the older stack, and a new category must not break the list.
 */
export type ChannelKind = string;

/** Known kinds, in the order the type filter lists them. Anything else follows, by name. */
export const CHANNEL_KINDS = ['whatsapp', 'instagram', 'facebook', 'messenger', 'telegram', 'sms', 'rcs', 'email', 'webchat'];

const KIND_COLORS: Record<string, string> = {
  whatsapp: '#25D366',
  instagram: '#E1306C',
  facebook: '#1877F2',
  messenger: '#0084FF',
  telegram: '#229ED9',
  sms: '#7C3AED',
  rcs: '#1A73E8',
  email: '#0EA5E9',
  webchat: '#2A2283',
};
export const kindColor = (kind: ChannelKind) => KIND_COLORS[kind] ?? '#64748B';

/** "line_business" → "Line business", for a kind with no translation yet. */
export const humanizeKind = (kind: ChannelKind) => {
  const words = kind.replace(/[_-]+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : kind;
};

export const sortKinds = (kinds: Iterable<ChannelKind>) => {
  const rank = (k: string) => (CHANNEL_KINDS.includes(k) ? CHANNEL_KINDS.indexOf(k) : CHANNEL_KINDS.length);
  return [...new Set(kinds)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
};
export const CHANNEL_COLORS = ['#25D366', '#075E54', '#2A2283', '#0EA5E9', '#7C3AED', '#DB2777', '#F59E0B', '#EF4444'];

export const channelType = (c: Pick<Channel, 'meta'>): ChannelKind => (c.meta?.category || 'whatsapp').toLowerCase();
export const channelName = (c: Channel) => c.basic_details?.name || c.basic_details?.channel_identity || 'Channel';
/** The channel's address: a WhatsApp number formatted for reading, else the identity as stored. */
export const channelIdentity = (c: Channel) => {
  const id = c.basic_details?.channel_identity ?? '';
  return channelType(c) === 'whatsapp' ? formatPhone(id) : id;
};
export const channelColor = (c: Channel) => c.basic_details?.color_code || kindColor(channelType(c));
/** `null` when the agency hides the wallet from this caller. */
export const walletBalance = (c: Channel): number | null => (typeof c.wallet?.balance === 'number' ? c.wallet.balance : null);

/**
 * Where a channel stands, for a badge:
 * - `setup`: a WhatsApp number that is created but not yet registered with Meta.
 * - `off`: switched off.
 * - `live`: active.
 */
export type ChannelState = 'live' | 'setup' | 'off';
export const channelState = (c: Channel): ChannelState => {
  if (channelType(c) === 'whatsapp' && c.cloud?.wa_biz_registration === 'pending') return 'setup';
  return c.active ? 'live' : 'off';
};

/** Permission key for an action on a channel of this type (`CRM.CHANNEL.WHATSAPP.UPDATE`…). */
export const channelPermission = (type: ChannelKind, verb: 'LIST' | 'READ' | 'CREATE' | 'UPDATE' | 'DELETE' | 'REGISTER' | 'SEND') =>
  `CRM.CHANNEL.${type.toUpperCase()}.${verb}`;

/* ------------------------------- channels ------------------------------- */

export const listChannels = async (query: { type?: ChannelType; search?: string } = {}): Promise<Channel[]> => {
  const out: Channel[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const res = await crm().channels.list({ ...query, rows: 100, page });
    out.push(...res.data);
    if (page >= res.pagination.pages) break;
  }
  return out;
};

/** `null` for no such channel (the API answers `{ data: {} }`, never a 404). */
export const getChannel = async (id: string): Promise<Channel | null> => {
  const { data } = await crm().channels.get(id);
  return 'id' in data ? (data as Channel) : null;
};

export const updateChannel = (id: string, input: UpdateChannelDetailsInput) => crm().channels.updateDetails(id, input);

/** Re-points Meta's webhooks at the platform, so replies and delivery reports arrive. */
export const repairDelivery = (id: string) => crm().channels.setProp<{ webhook?: string }>(id, 'webhook_listener_update');

/** The agency's hosted top-up page for this channel's currency. */
export const rechargeUrl = async (id: string): Promise<string> => {
  const { data } = await crm().channels.getProp<string | { url?: string }>(id, 'recharge_url');
  return typeof data === 'string' ? data : (data?.url ?? '');
};

/** A deep link into Meta's WhatsApp Manager for this number. */
export const whatsAppManagerUrl = async (id: string): Promise<string> => {
  const { data } = await crm().channels.getProp<string>(id, 'redirect_url', { target: 'wa_manager' });
  return typeof data === 'string' ? data : '';
};

/* ----------------------------- registration ----------------------------- */

/** A number new to the Cloud API: registering it with a 6-digit PIN turns messaging on. */
export const registerWithPin = (id: string, pin: string) => crm().channels.setProp(id, 'wa_pin_update', { body: { pin } });

/** A number moved from the WhatsApp Business app: already registered with Meta, just activate it. */
export const activateBizAppNumber = (id: string) => crm().channels.setProp(id, 'wa_biz_update');

export const sendTestMessage = (id: string, to: string, text: string) =>
  crm().channels.setProp(id, 'test_message', { body: { to: to.replace(/\D/g, ''), type: 'text', text: { body: text } } });

/* --------------------------- Meta's number info -------------------------- */

/** Meta's phone-number record. Field names are Meta's; any may be missing. */
export type NumberHealth = {
  verified_name?: string;
  display_phone_number?: string;
  quality_rating?: string;
  messaging_limit_tier?: string;
  name_status?: string;
  code_verification_status?: string;
  status?: string;
  throughput?: { level?: string };
  is_official_business_account?: boolean;
};

/** Meta wraps most reads as `{ data: [x] }`; the platform sometimes passes x straight through. */
const unwrap = <T>(v: unknown): T => {
  const inner = (v as { data?: unknown })?.data;
  if (Array.isArray(inner)) return (inner[0] ?? {}) as T;
  return (v ?? {}) as T;
};

export const numberHealth = async (id: string): Promise<NumberHealth> => unwrap<NumberHealth>((await crm().channels.getProp(id, 'general')).data);

/* ---------------------------- business profile --------------------------- */

export type BusinessProfile = {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  websites?: string[];
  vertical?: string;
  profile_picture_url?: string;
};

/** Meta's business categories. */
export const VERTICALS = [
  'OTHER',
  'AUTO',
  'BEAUTY',
  'APPAREL',
  'EDU',
  'ENTERTAIN',
  'EVENT_PLAN',
  'FINANCE',
  'GROCERY',
  'GOVT',
  'HOTEL',
  'HEALTH',
  'NONPROFIT',
  'PROF_SERVICES',
  'RETAIL',
  'TRAVEL',
  'RESTAURANT',
] as const;

export const getBusinessProfile = async (id: string): Promise<BusinessProfile> =>
  unwrap<BusinessProfile>((await crm().channels.getProp(id, 'business_profile')).data);

export const saveBusinessProfile = (id: string, update: Omit<BusinessProfile, 'profile_picture_url'>) =>
  crm().channels.setProp(id, 'business_profile', { body: { update } });

/** Whether the agency lets this channel's about text be edited. */
export const canEditAbout = async (id: string): Promise<boolean> => {
  try {
    const { data } = await crm().channels.getProp<{ about?: boolean }>(id, 'channel_config');
    return data?.about !== false;
  } catch {
    return true;
  }
};

export const uploadProfilePicture = async (id: string, f: PickedFile) => {
  const raw = f.file ?? (await (await fetch(f.uri)).blob());
  return crm().channels.setProp(id, 'profile_pic', { raw, contentType: f.mimeType });
};

/* ------------------------------ money & logs ----------------------------- */

/** Ledger amounts are stored in ten-thousandths. */
export const fromLedger = (amount: number) => amount / 10_000;

export const walletLog = async (id: string, page = 1): Promise<{ rows: WalletLog[]; pages: number }> => {
  const res = await crm().wallet.list(id, { page, rows: 25 });
  return { rows: res.data, pages: res.pagination.pages };
};

/** What conversations cost over the last `days`, by message category. */
export const spendByCategory = async (id: string, days = 30) => {
  const start = Math.floor(Date.now() / 1000) - days * 86400;
  const res = await crm().billing.stats(id, 'summary', { range: { start, end: 0 } });
  return res.data;
};

export const activityLog = async (id: string, page = 1): Promise<{ rows: ActivityLog[]; pages: number }> => {
  const res = await crm().activity.list(id, { page, rows: 25 });
  return { rows: res.data, pages: res.pagination.pages };
};
