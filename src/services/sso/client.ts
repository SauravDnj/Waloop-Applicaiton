/**
 * Native client for the partner-ecosystem Auth-as-a-Service API.
 *
 * Why this exists: `@ab-ecosystem/sso` ships React DOM screens (react-dom,
 * localStorage, Tailwind) and exports no plain `login` / `signup` / `verify-2fa`
 * functions, so it cannot run inside React Native. Every endpoint, body and
 * response branch below was taken from the package's compiled source, and the
 * package's own TypeScript types are reused (type-only imports erase at build
 * time, so none of its DOM code is bundled).
 *
 * Base path: `${ssoUrl}/api/v1/projects/${projectId}`.
 */
import type {
  AccountContext,
  AccountOption,
  AuthConfig,
  AuthResponse,
  LoginRequest,
  MappedProfile,
  Member,
  MemberStatus,
  PermissionCatalogue,
  SignupRequest,
  TeamMember,
  VerifyTwoFactorRequest,
} from '@ab-ecosystem/sso';

import { Platform } from 'react-native';

import { env } from '@/config/env';
import { accessIdForToken, getAuthAccessId } from '@/services/accessId';
import { reportUnauthorized } from '@/services/sessionExpiry';
import { tokenFor, useAccountsStore } from '@/stores/accounts';

/** Which signed-in account a token belongs to (only the one on screen is acted on). */
const accountForToken = (token: string) => useAccountsStore.getState().sessions.find((x) => tokenFor(x.id) === token)?.id ?? null;

export class SsoError extends Error {
  code?: string;
  status?: number;
  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = 'SsoError';
    this.status = status;
    this.code = code;
  }
  /** Revoked / expired access to *this* account (A403). The login is still valid. */
  get isAccountAccessLost() {
    return this.code === 'A403' || (this.status === 401 && /account (access (revoked|expired)|disabled|not found|does not belong)/i.test(this.message));
  }
}

type Envelope<T = unknown> = {
  success?: boolean;
  message?: string;
  code?: string;
  data?: T;
};

/** The Access ID (project id) for a call: the token's account, else the sign-in flow's. */
const base = (token?: string, accessId?: string) => `${env.ssoUrl}/api/v1/projects/${encodeURIComponent(accessId || accessIdForToken(token))}`;

/**
 * The SSO gateway refuses any call whose `Origin` does not match the app
 * origin (even the public auth-config). Browsers set the header themselves;
 * React Native sends none, so it is added explicitly off the web.
 */
const originHeaders = (): Record<string, string> => (Platform.OS === 'web' || !env.appOrigin ? {} : { Origin: env.appOrigin, Referer: `${env.appOrigin}/` });

const headers = (token?: string): Record<string, string> => ({
  'Content-Type': 'application/json',
  Accept: 'application/json',
  ...originHeaders(),
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

/**
 * Generic request. Mirrors the package's `request()` helper: a non-2xx status or
 * `{ success: false }` throws, otherwise the `data` member is returned when the
 * envelope has one.
 */
async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${base(token)}${path}`, {
      ...rest,
      headers: { ...headers(token), ...(rest.headers ?? {}) },
    });
  } catch (err) {
    throw new SsoError(err instanceof Error ? `Network error: ${err.message}` : 'Network error');
  }
  let body: Envelope<T> | null = null;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    body = null;
  }
  if (!res.ok || body?.success === false) {
    // A signed-in call refused as unauthenticated: the token may have expired (checked once, not trusted blindly).
    if (res.status === 401 && token) reportUnauthorized(accountForToken(token));
    throw new SsoError(body?.message || `Request failed (${res.status})`, res.status, body?.code);
  }
  return (body?.data ?? body) as T;
}

/** Raw variant for the auth endpoints whose top-level envelope matters (2FA / account picker branches). */
async function requestRaw<T>(path: string, init: RequestInit & { token?: string; accessId?: string } = {}): Promise<T> {
  const { token, accessId, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${base(token, accessId)}${path}`, {
      ...rest,
      headers: { ...headers(token), ...(rest.headers ?? {}) },
    });
  } catch (err) {
    throw new SsoError(err instanceof Error ? `Network error: ${err.message}` : 'Network error');
  }
  const body = (await res.json().catch(() => null)) as (T & Envelope) | null;
  if (res.status === 401 && token) reportUnauthorized(accountForToken(token));
  if (!res.ok) throw new SsoError(body?.message || `Request failed (${res.status})`, res.status, body?.code);
  return body as T;
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  body: JSON.stringify(body),
});

/* ------------------------------------------------------------------ */
/* Public, unauthenticated                                             */
/* ------------------------------------------------------------------ */

const configCache = new Map<string, AuthConfig>();
/**
 * Public project config (logo, card layout, captcha). Also how an Access ID is
 * validated: an unknown id answers 404.
 */
export const getAuthConfig = async (accessId: string = getAuthAccessId()): Promise<AuthConfig> => {
  const hit = configCache.get(accessId);
  if (hit) return hit;
  let res: Response;
  try {
    res = await fetch(`${base(undefined, accessId)}/auth-config`, { headers: headers() });
  } catch (err) {
    throw new SsoError(err instanceof Error ? `Network error: ${err.message}` : 'Network error');
  }
  if (!res.ok) throw new SsoError(res.status === 404 ? 'Unknown Access ID' : `Failed to fetch auth config (${res.status})`, res.status);
  const config = (await res.json()) as AuthConfig;
  configCache.set(accessId, config);
  return config;
};

/**
 * `POST /auth/login`. Three branches, checked in this order by the caller:
 * `twoFactorRequired` → `accountSelectionRequired` → `data.accessToken`.
 */
export const login = (body: LoginRequest) => requestRaw<AuthResponse>('/auth/login', json(body));

/**
 * Checks an account's password without changing who is signed in (the app-lock PIN reset).
 * Right only when the server answers as to a good sign-in: a token, or a 2FA / workspace
 * step. Anything else, including a 200 with `success: false`, counts as wrong. The session
 * the check opens is left to expire: logging it out could end the app's own session too.
 */
export const checkPassword = async (accessId: string, email: string, password: string, captchaToken?: string): Promise<void> => {
  const res = await requestRaw<AuthResponse & Envelope>('/auth/login', { ...json({ email, password, captchaToken }), accessId });
  if (res?.success === false) throw new SsoError(res.message || 'Wrong password');
  if (res.twoFactorRequired || res.accountSelectionRequired || readAccessToken(res)) return;
  throw new SsoError('Wrong password');
};

/** `POST /auth/verify-2fa`. The OTP travels as `twoFactorToken`. Same branches as login. */
export const verifyTwoFactor = (body: VerifyTwoFactorRequest) => requestRaw<AuthResponse>('/auth/verify-2fa', json(body));

/** `POST /auth/select-account`. Unauthenticated: the 5-minute ticket is the credential. */
export const selectAccount = async (selectionTicket: string, accountId: string): Promise<string> => {
  const res = await requestRaw<AuthResponse>(
    '/auth/select-account',
    json({
      selection_ticket: selectionTicket,
      account_id: accountId,
      client: env.ssoClientLabel,
    }),
  );
  return readAccessToken(res);
};

export const signup = (body: SignupRequest) => requestRaw<AuthResponse>('/auth/signup', json(body));

export const forgotPassword = (email: string, captchaToken?: string) => requestRaw<Envelope>('/auth/forgot-password', json({ email, captchaToken }));

export const resetPassword = (token: string, password: string, captchaToken?: string) =>
  requestRaw<Envelope>('/auth/reset-password', json({ token, password, captchaToken }));

export const verifyEmail = (token: string, captchaToken?: string) => requestRaw<Envelope>('/auth/verify-email', json({ token, captchaToken }));

/** Reads `accessToken` out of any envelope shape the auth endpoints return. */
export const readAccessToken = (res: unknown): string => {
  const r = (res ?? {}) as {
    data?: { accessToken?: unknown };
    accessToken?: unknown;
    token?: unknown;
  };
  const nested = r.data?.accessToken;
  if (typeof nested === 'string' && nested) return nested;
  if (typeof r.accessToken === 'string' && r.accessToken) return r.accessToken;
  if (typeof r.token === 'string' && r.token) return r.token;
  return '';
};

/* ------------------------------------------------------------------ */
/* Session                                                             */
/* ------------------------------------------------------------------ */

type RawMe = {
  id?: string;
  username?: string;
  profile?: {
    name?: { first?: string; last?: string };
    email?: string;
    phone_number?: { number?: string };
    whatsapp?: { number?: string; verified?: boolean };
    address?: {
      city?: string;
      state?: string;
      country?: string;
      code?: string;
    };
    timezone?: string;
    language?: string;
    profile_picture?: string;
  };
  mainWallet?: MappedProfile['mainWallet'];
  coinWallet?: MappedProfile['coinWallet'];
  context?: {
    account_id?: string;
    accountId?: string;
    act?: string;
    role?: { id?: string; title?: string; version?: number } | null;
    permission?: unknown;
    access_expiry?: string | null;
    account_name?: string;
    accountName?: string;
    account_email?: string;
    accountEmail?: string;
  };
};

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export const mapProfile = (raw: RawMe): MappedProfile => {
  const p = raw.profile ?? {};
  return {
    id: str(raw.id),
    username: str(raw.username),
    firstName: str(p.name?.first),
    lastName: str(p.name?.last),
    email: str(p.email) || str(raw.username),
    phone: str(p.phone_number?.number),
    whatsapp: str(p.whatsapp?.number),
    whatsappVerified: !!p.whatsapp?.verified,
    city: str(p.address?.city),
    state: str(p.address?.state),
    country: str(p.address?.country),
    zip: str(p.address?.code),
    timezone: str(p.timezone),
    language: str(p.language) || 'en',
    emailVerified: !!(str(p.email) || str(raw.username)),
    avatarUrl: str(p.profile_picture) || undefined,
    mainWallet: raw.mainWallet,
    coinWallet: raw.coinWallet,
  };
};

const MEMBER_ACTS = ['member', 'user'];

/** Pulls the account context out of `/me`. `null` ⇒ treat as owner (pre-member backend). */
export const mapAccountContext = (raw: RawMe): AccountContext | null => {
  const c = raw.context;
  if (!c || typeof c !== 'object') return null;
  const act = str(c.act);
  const role =
    c.role && typeof c.role === 'object'
      ? {
          id: str(c.role.id),
          title: str(c.role.title),
          version: c.role.version,
        }
      : null;
  return {
    accountId: str(c.account_id) || str(c.accountId),
    act,
    isOwner: !MEMBER_ACTS.includes(act.toLowerCase()),
    role: role && (role.id || role.title) ? role : null,
    permission: Array.isArray(c.permission) ? c.permission.filter((x): x is string => typeof x === 'string') : [],
    accessExpiry: typeof c.access_expiry === 'string' ? c.access_expiry : null,
    accountName: str(c.account_name) || str(c.accountName),
    accountEmail: str(c.account_email) || str(c.accountEmail),
  };
};

export type Me = { profile: MappedProfile; context: AccountContext | null };

/** `GET /me` → profile + account context in one call. */
export const getMe = async (token: string): Promise<Me> => {
  const raw = await request<RawMe>('/me', { method: 'GET', token });
  return { profile: mapProfile(raw), context: mapAccountContext(raw) };
};

export const logout = async (token: string) => {
  try {
    await fetch(`${base(token)}/auth/logout`, {
      method: 'POST',
      headers: headers(token),
    });
  } catch {
    // Always complete logout client-side; the server call is best effort.
  }
};

/** Owners pass everything; members need the key (case-insensitive). No context ⇒ unrestricted. */
export const hasPermission = (ctx: AccountContext | null | undefined, permission: string): boolean => {
  if (!ctx || ctx.isOwner) return true;
  const key = permission.trim().toUpperCase();
  return ctx.permission.some((p) => p.toUpperCase() === key);
};

/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/* ------------------------------------------------------------------ */

export const listAccounts = (token: string) => request<AccountOption[]>('/accounts', { method: 'GET', token });

export const switchAccount = async (token: string, accountId: string): Promise<string> => {
  const res = await requestRaw<AuthResponse>('/auth/switch-account', {
    ...json({ account_id: accountId }),
    token,
  });
  const next = readAccessToken(res);
  if (!next) throw new SsoError('No access token in the response');
  return next;
};

/* ------------------------------------------------------------------ */
/* Team (read-only: who a chat can be transferred to)                  */
/* ------------------------------------------------------------------ */

export const listMembers = (token: string, status: MemberStatus = 'active') =>
  request<Member[]>(`/account/members?status=${status}`, {
    method: 'GET',
    token,
  });

type RawTeamMember = {
  id?: string;
  _id?: string;
  user_id?: string;
  name?: string;
  email?: string;
  role?: { id?: string; title?: string } | string | null;
  is_owner?: boolean;
  status?: string;
  access_expiry?: string | null;
  joined_at?: string;
};

const mapTeamMember = (r: RawTeamMember): TeamMember => ({
  id: str(r.id) || str(r._id) || str(r.user_id),
  name: str(r.name),
  email: str(r.email),
  roleTitle: typeof r.role === 'string' ? r.role : str(r.role?.title),
  roleId: typeof r.role === 'object' && r.role ? str(r.role.id) : '',
  isOwner: !!r.is_owner,
  status: str(r.status),
  accessExpiry: typeof r.access_expiry === 'string' ? r.access_expiry : null,
  joinedAt: str(r.joined_at),
});

/** `GET /account/team` — colleagues, for a member. */
export const listTeam = async (token: string): Promise<TeamMember[]> => {
  const rows = await request<RawTeamMember[]>('/account/team', {
    method: 'GET',
    token,
  });
  return (Array.isArray(rows) ? rows : []).map(mapTeamMember);
};

export const getPermissions = (token: string) =>
  request<PermissionCatalogue>('/account/permissions', {
    method: 'GET',
    token,
  });

/**
 * One normalised "teammate" shape for the UI, whichever side of the account
 * the caller is on. `userId` is what a chat transfer writes to `contact.agent`.
 */
export type Teammate = {
  /** Membership id (owner view) or row id (member view). */
  id: string;
  /** The person's login / profile id. */
  userId: string;
  name: string;
  email: string;
  roleTitle: string;
  isOwner: boolean;
  status: string;
  accessExpiry: string | null;
};

export const listTeammates = async (token: string, isOwner: boolean, self?: { id: string; name: string; email: string }): Promise<Teammate[]> => {
  const rows: Teammate[] = [];
  if (isOwner) {
    const members = await listMembers(token, 'active');
    for (const m of members) {
      rows.push({
        id: m.id,
        userId: m.user_id ?? m.id,
        name: m.name ?? m.email ?? 'Member',
        email: m.email ?? '',
        roleTitle: m.role?.title ?? '',
        isOwner: false,
        status: m.status ?? 'active',
        accessExpiry: m.access_expiry ?? null,
      });
    }
    if (self)
      rows.unshift({
        id: self.id,
        userId: self.id,
        name: self.name,
        email: self.email,
        roleTitle: 'Owner',
        isOwner: true,
        status: 'active',
        accessExpiry: null,
      });
  } else {
    const team = await listTeam(token);
    for (const t of team) {
      rows.push({
        id: t.id,
        userId: t.id,
        name: t.name,
        email: t.email,
        roleTitle: t.roleTitle,
        isOwner: t.isOwner,
        status: t.status,
        accessExpiry: t.accessExpiry,
      });
    }
  }
  return rows;
};

/** `GET /currency` — currencies enabled for the project, for signup. No token. */
export const getCurrencies = async (): Promise<{ name: string; code: string }[]> => {
  const res = await fetch(`${base()}/currency`, { headers: headers() });
  if (!res.ok) throw new SsoError(`Failed to fetch currencies (${res.status})`, res.status);
  const body = (await res.json().catch(() => null)) as { data?: unknown } | unknown[] | null;
  const list = Array.isArray(body) ? body : Array.isArray((body as { data?: unknown })?.data) ? (body as { data: unknown[] }).data : [];
  return list
    .map((c) => {
      const r = (c ?? {}) as { name?: unknown; code?: unknown };
      return {
        name: typeof r.name === 'string' ? r.name : typeof r.code === 'string' ? r.code : '',
        code: typeof r.code === 'string' ? r.code : '',
      };
    })
    .filter((c) => c.code);
};
