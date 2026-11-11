/**
 * React Query hooks over the CRM. Keys are centralised so mutations can
 * invalidate precisely. Lists are cached to MMKV through the persister set up
 * in the root layout, so the app paints offline.
 */
import type { Contact, ContactTag, Segment, Template } from '@ab-ecosystem/cpaas';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { buildContactFilter, type LeadFilter } from '@/lib/filters';
import { crm } from '@/services/crm/client';
import { createLead, getLead, toLead, updateLead, type Lead, type LeadInput } from '@/services/crm/leads';
import { listAllCustomFields } from '@/services/crm/fields';
import { listTeammates, type Teammate } from '@/services/sso/client';
import { isWebPreview, previewTeam } from '@/lib/webPreview';
import { listQuickReplies, type QuickReply } from '@/services/crm/quickReplies';
import { readJson, writeJson } from '@/services/storage';
import { cachedTemplates, fetchAndCacheTemplates, listWhatsAppChannels, pickChannel } from '@/services/crm/whatsapp';
import { useAccountsStore } from '@/stores/accounts';
import { useWhatsAppConfig, useWhatsAppStore } from '@/stores/whatsapp';
import { useAuthStore } from '@/stores/auth';

export const keys = {
  leads: (f: LeadFilter) => ['leads', f] as const,
  lead: (id: string) => ['lead', id] as const,
  tags: ['tags'] as const,
  segments: ['segments'] as const,
  fields: ['fields'] as const,
  team: ['team'] as const,
};

const PAGE = 50;

export const useLeads = (filter: LeadFilter) =>
  useInfiniteQuery({
    queryKey: keys.leads(filter),
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const { filter: cf } = buildContactFilter(filter);
      const res = await crm().contacts.list({
        page: pageParam,
        rows: PAGE,
        search: filter.search?.trim() || undefined,
        segment: filter.segment || undefined,
        filter: cf.conditions?.length ? cf : undefined,
      });
      const leads = res.data.map(toLead);
      return {
        leads,
        page: res.pagination.page,
        pages: res.pagination.pages,
        total: res.pagination.total,
      };
    },
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    staleTime: 30_000,
  });

export const useLead = (id: string | undefined) =>
  useQuery({
    queryKey: keys.lead(id ?? ''),
    queryFn: () => getLead(id!),
    enabled: !!id,
    staleTime: 15_000,
  });

export const useTags = () =>
  useQuery({
    queryKey: keys.tags,
    queryFn: async () => {
      const out: ContactTag[] = [];
      let page = 1;
      for (;;) {
        const res = await crm().contactTags.list({ page, rows: 100 });
        out.push(...res.data);
        if (page >= res.pagination.pages) break;
        page += 1;
      }
      return out;
    },
    staleTime: 5 * 60_000,
  });

export const useSegments = () =>
  useQuery({
    queryKey: keys.segments,
    queryFn: async () => {
      const out: Segment[] = [];
      let page = 1;
      for (;;) {
        const res = await crm().segments.list({ page, rows: 100 });
        out.push(...res.data);
        if (page >= res.pagination.pages) break;
        page += 1;
      }
      return out;
    },
    staleTime: 5 * 60_000,
  });

export const useFields = () =>
  useQuery({
    queryKey: keys.fields,
    queryFn: () => listAllCustomFields(),
    staleTime: 10 * 60_000,
  });

export const useTeam = () => {
  const token = useAuthStore((s) => s.token);
  const isOwner = useAuthStore((s) => s.context?.isOwner ?? true);
  const profile = useAuthStore((s) => s.profile);
  return useQuery<Teammate[]>({
    queryKey: keys.team,
    queryFn: () =>
      isWebPreview()
        ? (previewTeam() as Teammate[])
        : listTeammates(
        token!,
        isOwner,
        profile
          ? {
              id: profile.id,
              name: [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.email,
              email: profile.email,
            }
          : undefined,
      ),
    enabled: !!token,
    staleTime: 5 * 60_000,
  });
};

export const useCreateLead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LeadInput) => createLead(input),
    onSuccess: (lead) => {
      qc.setQueryData(keys.lead(lead.id), lead);
      // Lists and board columns both show this contact.
      void qc.invalidateQueries({ queryKey: ['leads'] });
      void qc.invalidateQueries({ queryKey: ['board'] });
    },
  });
};

export const useUpdateLead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lead, input }: { lead: Lead; input: LeadInput }) => updateLead(lead, input),
    onSuccess: (lead) => {
      qc.setQueryData(keys.lead(lead.id), lead);
      // Lists and board columns both show this contact.
      void qc.invalidateQueries({ queryKey: ['leads'] });
      void qc.invalidateQueries({ queryKey: ['board'] });
    },
  });
};

export const contactToLead = (c: Contact) => toLead(c);

/* ------------------------------ WhatsApp API ------------------------------ */

export const waKeys = {
  channels: ['wa', 'channels'] as const,
  templates: (channelId: string) => ['wa', 'templates', channelId] as const,
};

/** The active account's WhatsApp channels. Keyed by account, so another account's list is never read as this one's. */
export const useWaChannels = (enabled = true) => {
  const acct = useAccountsStore((s) => s.activeId);
  return useQuery({ queryKey: [...waKeys.channels, acct ?? ''], queryFn: listWhatsAppChannels, enabled: enabled && !!acct, staleTime: 10 * 60_000 });
};

/**
 * Keeps the active account's default WhatsApp channel pointing at a channel that
 * exists and is active (the first active one when none is set, or the set one is
 * gone), so inbox replies, template sends and campaigns always have a channel.
 */
export const useDefaultChannelSync = () => {
  const acct = useAccountsStore((s) => s.activeId);
  const config = useWhatsAppConfig();
  const setConfig = useWhatsAppStore((s) => s.set);
  const channels = useWaChannels(!!acct);
  useEffect(() => {
    if (!acct || !channels.data) return;
    const pick = pickChannel(channels.data, config.channelId);
    if (pick === config.channelId) return;
    setConfig(acct, { channelId: pick, channelName: channels.data.find((c) => c.id === pick)?.name ?? '' });
  }, [acct, channels.data, config.channelId, setConfig]);
};

/**
 * A channel's templates, from the copy saved on the phone. The server is only
 * asked when nothing is saved yet, or when the user resyncs / pulls to refresh
 * (which invalidates this query). `status` filters the saved list locally.
 */
export const useTemplates = (channelId: string | null | undefined, status?: Template['status']) => {
  const qc = useQueryClient();
  const cache = channelId ? cachedTemplates(channelId) : null;
  return useQuery({
    queryKey: waKeys.templates(channelId ?? ''),
    // The first 300 show at once; later pages update the list as they arrive.
    queryFn: () => fetchAndCacheTemplates(channelId!, (all) => qc.setQueryData(waKeys.templates(channelId!), all)),
    enabled: !!channelId,
    initialData: cache?.templates,
    initialDataUpdatedAt: cache?.at,
    staleTime: Infinity,
    select: status ? (list: Template[]) => list.filter((t) => t.status === status) : undefined,
  });
};

/** When a channel's templates were last downloaded (0 = never). */
export const templatesUpdatedAt = (channelId: string) => cachedTemplates(channelId)?.at ?? 0;

/* ------------------------------ Quick replies ----------------------------- */

const QR_CACHE = 'quickreplies.cache.v1';

/** Quick replies, from the copy saved on the phone; refetched in the background at most every 10 minutes. */
export const useQuickReplies = () => {
  const cache = readJson<{ at: number; list: QuickReply[] }>(QR_CACHE);
  return useQuery({
    queryKey: ['quickReplies'],
    queryFn: async () => {
      const list = await listQuickReplies();
      writeJson(QR_CACHE, { at: Date.now(), list });
      return list;
    },
    initialData: cache?.list,
    initialDataUpdatedAt: cache?.at,
    staleTime: 10 * 60_000,
  });
};
