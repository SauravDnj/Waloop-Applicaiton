/**
 * WhatsApp inbox (API mode): the active account's conversations, live over
 * the CPaaS socket. Other signed-in accounts stay connected in the
 * background, so switching here never loses their messages.
 */
import type { Chat, ChatListFilter } from '@ab-ecosystem/cpaas';
import { Redirect, router } from 'expo-router';
import {
  Archive,
  ArchiveRestore,
  Ban,
  Check,
  CheckCheck,
  EllipsisVertical,
  ListFilter,
  Megaphone,
  MessageCircle,
  PencilLine,
  Pin,
  Trash2,
  UserRoundCog,
  UsersRound,
  X,
  UserPlus,
} from 'lucide-react-native';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AccountPill } from '@/components/accounts/AccountSwitcher';
import { TAB_BAR_SPACE } from '@/components/navigation/FloatingTabBar';
import { Avatar, Button, Chip, EmptyState, Hero, HeroButton, Input, Row, SearchField, Sheet, Text } from '@/components/ui';
import { formatPhone } from '@/lib/phone';
import { BulkEditSheet } from '@/components/leads/BulkEditSheet';
import { ContactChips } from '@/components/leads/ContactChips';
import { useTeam } from '@/hooks/queries';
import { ChatActionsSheet } from '@/components/inbox/ChatActionsSheet';
import { ChatView } from '@/components/inbox/ChatView';
import { useDesktop } from '@/hooks/useDesktop';
import { chatAction, listFilteredChats, loadChats, phoneQuery, reconnectInboxes, searchChats, transferChat, type ChatAction } from '@/services/inbox/manager';
import { quickContact } from '@/services/crm/leads';
import { countInboxFilters, EMPTY_INBOX_FILTER, InboxFilterSheet, type InboxFilter } from '@/components/inbox/InboxFilterSheet';
import { showAlert } from '@/lib/dialog';
import { FilterSheet } from '@/components/leads/FilterSheet';
import { countActiveFilters } from '@/lib/filters';
import { describeCrmError } from '@/services/crm/client';
import { resolveCondition } from '@/services/crm/segments';
import { usePins } from '@/services/inbox/pins';
import { identifierOf } from '@/services/inbox/send';
import { useAccountInbox } from '@/services/inbox/store';
import { previewText, renderContent } from '@/services/inbox/render';
import { useAccountsStore } from '@/stores/accounts';
import { useTheme } from '@/theme/ThemeProvider';
import { P } from '@/lib/permissions';
import { useCan, usePermissionsSettled } from '@/stores/auth';

type Filter = 'all' | 'unread' | 'mine' | 'unassigned' | 'open' | 'archived';
/** Views the live list can't answer (who a chat is assigned to, archived ones): asked of the server. */
const SERVER_VIEWS: Filter[] = ['mine', 'unassigned', 'archived'];
const VIEWS: Filter[] = ['all', 'unread', 'mine', 'unassigned', 'open', 'archived'];
const viewLabel = (f: Filter) => `inbox.filter.${f}`;

const when = (ts?: number) => {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
};

const nameOf = (c: Chat) => [c.name?.first_name, c.name?.last_name].filter(Boolean).join(' ') || formatPhone(identifierOf(c)) || '—';
/**
 * The chat's last message, one line (like WhatsApp). CPaaS keeps a preview on the chat
 * (`last_interaction_props`, shaped differently by source); else the newest message this
 * phone has for the chat.
 */
const previewOf = (c: Chat, thread?: { content: unknown }[]) => {
  const p = (c.last_interaction_props ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const direct = text(p.preview) || text(p.text) || text(p.body) || text(p.caption) || text((p.text as { body?: unknown } | undefined)?.body);
  if (direct) return direct;
  for (const src of [p.content, p.message, p.type ? p : undefined]) {
    if (src && typeof src === 'object' && renderContent(src).kind !== 'unknown') return previewText(src);
  }
  const last = thread?.[thread.length - 1];
  return last ? previewText(last.content) : '';
};

// Keyed by account: selection, filters, search and the open chat never carry over to another account.
function InboxScreen() {
  const acct = useAccountsStore((s) => s.activeId);
  return <InboxBody key={acct ?? 'none'} />;
}

function InboxBody() {
  const { t } = useTranslation();
  const { colors, radius, shadow } = useTheme();
  const acct = useAccountsStore((s) => s.activeId);
  const inbox = useAccountInbox(acct);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Chat[] | null>(null);
  const [more, setMore] = useState(false);
  const [pulling, setPulling] = useState(false);

  const pins = usePins(acct);
  const [menuFor, setMenuFor] = useState<Chat | null>(null);
  // Multi-select (long-press): read, archive, transfer, edit contact fields / tags.
  const [selected, setSelected] = useState<Map<string, Chat>>(new Map());
  const [bulkEdit, setBulkEdit] = useState(false);
  const [bulkTransfer, setBulkTransfer] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const selecting = selected.size > 0;
  const canCampaign = useCan(P.campaigns.create);
  const desktop = useDesktop();
  const [openId, setOpenId] = useState<string | null>(null);
  const team = useTeam();
  const toggleSelect = (c: Chat) => {
    const next = new Map(selected);
    if (next.has(c.id)) next.delete(c.id);
    else next.set(c.id, c);
    setSelected(next);
  };
  const runBulk = async (fn: (c: Chat) => Promise<unknown>) => {
    if (!acct) return;
    setBulkBusy(true);
    const results = await Promise.allSettled([...selected.values()].map(fn));
    setBulkBusy(false);
    setSelected(new Map());
    if (serverMode) void runServer(filter, adv);
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed) showAlert(t('bulk.someFailed', { count: failed }));
  };
  const bulkAction = (action: ChatAction) => runBulk((c) => chatAction(acct!, c, action));
  const [adv, setAdv] = useState<InboxFilter>(EMPTY_INBOX_FILTER);
  const [advOpen, setAdvOpen] = useState(false);
  // Server-side list for views the live list can't answer (archived, assignment, contact conditions…).
  const [server, setServer] = useState<{ chats: Chat[]; next: number | null; loading: boolean } | null>(null);
  const advCount = countInboxFilters(adv);
  const [leadOpen, setLeadOpen] = useState(false);
  const leadCount = countActiveFilters(adv.lead);
  const viewCount = advCount - leadCount;
  const serverMode = advCount > 0 || SERVER_VIEWS.includes(filter);

  const viewFor = (f: Filter, a: InboxFilter): ChatListFilter => ({
    ...a.view,
    ...(f === 'unread' ? { unread: 'unread' } : f === 'open' ? { closed: 'open' } : {}),
    ...(f === 'mine' ? { assignment: 'me' } : f === 'unassigned' ? { assignment: 'none' } : {}),
    archived: f === 'archived' ? 'archived' : 'unarchived',
  });
  const runServer = async (f: Filter, a: InboxFilter, more = false) => {
    if (!acct) return;
    if (!(countInboxFilters(a) > 0 || SERVER_VIEWS.includes(f))) return setServer(null);
    setServer((cur) => ({ chats: more ? (cur?.chats ?? []) : [], next: cur?.next ?? null, loading: true }));
    try {
      const conditions = (await resolveCondition(a.lead))?.conditions;
      const page = await listFilteredChats(acct, viewFor(f, a), conditions, more ? (server?.next ?? undefined) : undefined);
      setServer((cur) => ({ chats: more ? [...(cur?.chats ?? []), ...page.contacts] : page.contacts, next: page.nextPage, loading: false }));
    } catch (e) {
      setServer({ chats: [], next: null, loading: false });
      showAlert(t('inbox.actionFailed'), describeCrmError(e));
    }
  };

  // (The React Compiler memoizes this.)
  const list = (() => {
    // Archived chats live in their own view; the live list is kept current by the socket.
    const live = inbox.chats.filter((c) => !c.chat_metadata?.archived);
    // Server rows take live updates (read state, archive…) from the socket's copy.
    const base = results ?? (serverMode ? (server?.chats ?? []).map((c) => inbox.chats.find((x) => x.id === c.id) ?? c) : live);
    const shown = base.filter((c) =>
      filter === 'unread'
        ? (c.chat_metadata?.unread ?? 0) > 0 || c.chat_metadata?.marked_as_unread
        : filter === 'open'
          ? !c.chat_metadata?.closed && !c.chat_metadata?.marked_as_done
          : true,
    );
    // Pinned first, in pin order.
    const rank = (c: Chat) => (pins.includes(c.id) ? pins.indexOf(c.id) : Number.MAX_SAFE_INTEGER);
    return [...shown].sort((a, b) => rank(a) - rank(b));
  })();

  const pickFilter = (f: Filter) => {
    setFilter(f);
    void runServer(f, adv);
  };

  // A typed number with no chat yet: offer to start one (contact + template, as no session is open).
  const typedPhone = phoneQuery(search);
  const noMatch = !!typedPhone && results !== null && !results.some((c) => identifierOf(c).replace(/\D/g, '').endsWith(typedPhone.local));
  const [newChat, setNewChat] = useState<{ phone: string } | null>(null);

  // Only the latest search may show its results (an older, slower reply is dropped).
  const searchSeq = useRef(0);
  const runSearch = async (q: string) => {
    setSearch(q);
    const n = ++searchSeq.current;
    if (!acct || q.trim().length < 2) return setResults(null);
    const found = await searchChats(acct, q.trim()).catch(() => []);
    if (n === searchSeq.current) setResults(found);
  };


  const status = inbox.state === 'connected' ? t('inbox.live') : inbox.state === 'error' ? inbox.error || t('inbox.offline') : t('inbox.connecting');

  const listPane = (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={list}
        refreshing={pulling}
        onRefresh={async () => {
          if (!acct) return;
          setPulling(true);
          reconnectInboxes();
          await loadChats(acct, true).catch(() => undefined);
          if (serverMode) await runServer(filter, adv);
          setPulling(false);
        }}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE + 24 }}
        onEndReached={async () => {
          if (serverMode) {
            if (server?.next && !server.loading) void runServer(filter, adv, true);
            return;
          }
          if (!acct || results || more || inbox.nextPage === null) return;
          setMore(true);
          await loadChats(acct).catch(() => undefined);
          setMore(false);
        }}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View>
            <Hero
              top={<AccountPill inPage />}
              title={t('inbox.title')}
              subtitle={status}
              right={
                <Row gap={10}>
                  <HeroButton onPress={() => router.push('/(app)/trash')}>
                    <Trash2 size={18} color="#fff" />
                  </HeroButton>
                  <View
                    style={[
                      styles.live,
                      { backgroundColor: inbox.state === 'connected' ? '#22C55E' : inbox.state === 'error' ? colors.danger : colors.warning },
                    ]}
                  />
                </Row>
              }
              overlap={<SearchField value={search} onChangeText={(q) => void runSearch(q)} placeholder={t('inbox.search')} elevated />}
            />
            {/* One row that scrolls sideways: the views never wrap onto a second line. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
              <Pressable
                onPress={() => setAdvOpen(true)}
                style={[styles.advBtn, { backgroundColor: viewCount ? colors.primary : colors.surface, borderColor: colors.border }]}
              >
                <ListFilter size={15} color={viewCount ? '#fff' : colors.text} />
                {viewCount ? <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{viewCount}</Text> : null}
              </Pressable>
              {/* Contact conditions (tags, stages, fields, segments): used often, so a button of their own. */}
              <Pressable
                onPress={() => setLeadOpen(true)}
                style={[styles.advBtn, { backgroundColor: leadCount ? colors.accent : colors.surface, borderColor: colors.border }]}
              >
                <UsersRound size={15} color={leadCount ? '#fff' : colors.text} />
                {leadCount ? <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{leadCount}</Text> : null}
              </Pressable>
              {VIEWS.map((f) => (
                <Chip key={f} small label={t(viewLabel(f))} selected={filter === f} onPress={() => pickFilter(f)} />
              ))}
            </ScrollView>
            {noMatch && typedPhone ? (
              <Pressable
                onPress={() => setNewChat({ phone: typedPhone.intl })}
                style={[styles.newChat, { backgroundColor: colors.primarySoft, borderRadius: radius.md }]}
              >
                <UserPlus size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong" tone="primary">
                    {t('inbox.newChatWith', { phone: formatPhone(typedPhone.intl) })}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {t('inbox.newChatHint')}
                  </Text>
                </View>
              </Pressable>
            ) : null}
            {inbox.state !== 'connected' ? (
              <View style={[styles.err, { backgroundColor: inbox.state === 'error' ? colors.dangerSoft : colors.warningSoft, borderRadius: radius.md }]}>
                <Text variant="caption" style={{ flex: 1, color: inbox.state === 'error' ? colors.danger : colors.text }}>
                  {inbox.state === 'error' ? t('inbox.connectFailed') : t('inbox.reconnectingLong')}
                </Text>
                <Pressable onPress={() => reconnectInboxes()} hitSlop={8}>
                  <Text variant="caption" tone="primary" style={{ fontWeight: '700' }}>
                    {t('inbox.reconnect')}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item: c }) => {
          const unread = c.chat_metadata?.unread ?? 0;
          const flagged = unread > 0 || !!c.chat_metadata?.marked_as_unread;
          const isSelected = selected.has(c.id);
          return (
            <Pressable
              onPress={() => (selecting ? toggleSelect(c) : desktop ? setOpenId(c.id) : router.push({ pathname: '/(app)/chat/[id]', params: { id: c.id } }))}
              onLongPress={() => toggleSelect(c)}
              delayLongPress={300}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: isSelected || (desktop && openId === c.id) ? colors.primarySoft : pressed ? colors.surfaceAlt : 'transparent' },
              ]}
            >
              <View>
                <Avatar name={nameOf(c)} uri={c.profile?.whatsapp?.profile_pic} size={46} />
                {isSelected ? (
                  <View style={[styles.check, { backgroundColor: colors.primary, borderColor: colors.surface }]}>
                    <Check size={12} color="#fff" strokeWidth={3} />
                  </View>
                ) : null}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1, fontWeight: flagged ? '700' : '500' }}>
                    {nameOf(c)}
                  </Text>
                  {c.chat_metadata?.blocked?.incoming || c.chat_metadata?.blocked?.outgoing ? (
                    <Ban size={13} color={colors.danger} style={{ marginHorizontal: 4 }} />
                  ) : null}
                  {pins.includes(c.id) ? <Pin size={13} color={colors.textFaint} style={{ marginHorizontal: 4 }} /> : null}
                  <Text variant="micro" style={{ color: flagged ? colors.primary : colors.textFaint, letterSpacing: 0 }}>
                    {when(c.last_seen)}
                  </Text>
                </Row>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text variant="caption" tone={flagged ? 'default' : 'muted'} numberOfLines={1} style={{ flex: 1 }}>
                    {previewOf(c, inbox.threads[c.id])}
                  </Text>
                  {flagged ? (
                    <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{unread || '•'}</Text>
                    </View>
                  ) : null}
                </Row>
                <ContactChips hash={c.custom_field_hash as Record<string, unknown> | undefined} tags={c.tags} max={3} />
              </View>
            </Pressable>
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginStart: 74 }} />}
        ListEmptyComponent={
          !inbox.loaded || (serverMode && server?.loading && !server.chats.length && !results) ? (
            <ActivityIndicator style={{ padding: 32 }} color={colors.primary} />
          ) : (
            <View style={[{ margin: 16 }, shadow.card]}>
              <EmptyState
                icon={<MessageCircle size={26} color="#fff" />}
                title={results ? t('inbox.noResults') : t('inbox.empty')}
                body={results ? undefined : t('inbox.emptyBody')}
              />
            </View>
          )
        }
        ListFooterComponent={more ? <ActivityIndicator style={{ padding: 16 }} color={colors.primary} /> : undefined}
      />
      <FilterSheet
        open={leadOpen}
        value={adv.lead}
        title={t('inbox.contactFilters')}
        onClose={() => setLeadOpen(false)}
        onApply={(lead) => {
          const next = { ...adv, lead };
          setAdv(next);
          setLeadOpen(false);
          void runServer(filter, next);
        }}
      />
      {advOpen ? (
        <InboxFilterSheet
          value={adv}
          onClose={() => setAdvOpen(false)}
          onApply={(a) => {
            // This sheet holds the inbox views; contact conditions stay as they are.
            a = { ...a, lead: adv.lead };
            setAdv(a);
            setAdvOpen(false);
            void runServer(filter, a);
          }}
        />
      ) : null}
      {selecting ? (
        <View style={[styles.bulkBar, shadow.floating, { backgroundColor: colors.surface, bottom: TAB_BAR_SPACE + 12 }]}>
          <Pressable onPress={() => setSelected(new Map())} hitSlop={10}>
            <X size={20} color={colors.textMuted} />
          </Pressable>
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            {bulkBusy ? '…' : selected.size}
          </Text>
          <Pressable
            onPress={() => void bulkAction('markRead')}
            hitSlop={6}
            style={styles.bulkBtn}
            accessibilityLabel={t('inbox.markRead')}
            disabled={bulkBusy}
          >
            <CheckCheck size={20} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={() => void bulkAction(filter === 'archived' ? 'unarchive' : 'archive')}
            hitSlop={6}
            style={styles.bulkBtn}
            accessibilityLabel={t(filter === 'archived' ? 'inbox.unarchive' : 'inbox.archive')}
            disabled={bulkBusy}
          >
            {filter === 'archived' ? <ArchiveRestore size={20} color={colors.text} /> : <Archive size={20} color={colors.text} />}
          </Pressable>
          <Pressable onPress={() => setBulkTransfer(true)} hitSlop={6} style={styles.bulkBtn} accessibilityLabel={t('inbox.transfer')} disabled={bulkBusy}>
            <UserRoundCog size={20} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => setBulkEdit(true)} hitSlop={6} style={styles.bulkBtn} accessibilityLabel={t('bulk.edit')} disabled={bulkBusy}>
            <PencilLine size={20} color={colors.primary} />
          </Pressable>
          {/* A campaign to the picked chats' contacts (a chat's id is its contact's), as on Contacts. */}
          {canCampaign ? (
            <Pressable
              onPress={() => {
                const ids = [...selected.keys()];
                setSelected(new Map());
                router.push({ pathname: '/(app)/campaigns/new', params: { leadIds: ids.join(',') } });
              }}
              hitSlop={6}
              style={styles.bulkBtn}
              accessibilityLabel={t('camp.short')}
              disabled={bulkBusy}
            >
              <Megaphone size={20} color={colors.primary} />
            </Pressable>
          ) : null}
          {selected.size === 1 ? (
            <Pressable onPress={() => setMenuFor([...selected.values()][0])} hitSlop={6} style={styles.bulkBtn} disabled={bulkBusy}>
              <EllipsisVertical size={20} color={colors.text} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {bulkEdit ? (
        <BulkEditSheet
          ids={[...selected.keys()]}
          onClose={(changed) => {
            setBulkEdit(false);
            if (changed) {
              setSelected(new Map());
              if (acct) void loadChats(acct, true).catch(() => undefined);
              if (serverMode) void runServer(filter, adv);
            }
          }}
        />
      ) : null}
      {bulkTransfer ? (
        <Sheet open onClose={() => setBulkTransfer(false)} title={t('inbox.transferTo')} subtitle={t('bulk.chats', { count: selected.size })}>
          <View style={{ gap: 2 }}>
            {(team.data ?? []).map((m) => (
              <Pressable
                key={m.userId}
                onPress={() => {
                  setBulkTransfer(false);
                  void runBulk((c) => transferChat(acct!, c, m.userId));
                }}
                style={({ pressed }) => [styles.memberRow, { borderRadius: radius.md, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' }]}
              >
                <Avatar name={m.name} size={34} />
                <Text variant="bodyStrong" style={{ flex: 1 }}>
                  {m.name}
                </Text>
              </Pressable>
            ))}
            {team.isLoading ? <ActivityIndicator color={colors.primary} style={{ padding: 16 }} /> : null}
          </View>
        </Sheet>
      ) : null}
      {newChat ? <NewChatSheet phone={newChat.phone} onClose={() => setNewChat(null)} /> : null}
      {menuFor && acct ? (
        <ChatActionsSheet
          acct={acct}
          chat={menuFor}
          title={nameOf(menuFor)}
          onClose={() => {
            setMenuFor(null);
            setSelected(new Map());
          }}
        />
      ) : null}
    </View>
  );

  if (!desktop) return listPane;
  // Desktop: the list on the start side, the open chat beside it.
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.background }}>
      <View style={[styles.listPane, { borderEndColor: colors.border }]}>{listPane}</View>
      <View style={{ flex: 1 }}>
        {openId ? (
          <ChatView key={openId} id={openId} embedded />
        ) : (
          <View style={styles.noChat}>
            <MessageCircle size={40} color={colors.textFaint} />
            <Text tone="muted">{t('inbox.pickChat')}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  listPane: { width: 420, borderEndWidth: StyleSheet.hairlineWidth },
  noChat: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  newChat: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 8, padding: 12 },
  live: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' },
  filters: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, marginTop: 14, marginBottom: 6 },
  advBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 30, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth },
  err: { marginHorizontal: 16, padding: 12, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  check: { position: 'absolute', end: -2, bottom: -2, width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  bulkBar: { position: 'absolute', start: 16, end: 16, borderRadius: 22, padding: 10, paddingStart: 16, flexDirection: 'row', alignItems: 'center', gap: 6 },
  bulkBtn: { padding: 8 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 8 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', marginStart: 8 },
});

/** Starts a chat with a number that has none yet: saves the contact, then opens the template sender. */
function NewChatSheet({ phone, onClose }: { phone: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    try {
      const lead = await quickContact(phone, name);
      onClose();
      router.push({ pathname: '/(app)/whatsapp/send', params: { leadId: lead.id } });
    } catch (e) {
      showAlert(t('inbox.actionFailed'), describeCrmError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open
      onClose={onClose}
      locked={busy}
      title={t('inbox.newChatWith', { phone: formatPhone(phone) })}
      subtitle={t('inbox.newChatHint')}
      footer={<Button title={t('inbox.sendTemplate')} loading={busy} onPress={() => void start()} />}
    >
      <Input label={t('inbox.newChatName')} value={name} onChangeText={setName} placeholder={t('services.optional')} autoCapitalize="words" />
    </Sheet>
  );
}

/** Members whose role can't open this page get a short explanation instead. */
/**
 * The Inbox is home. A member whose role can't open chats goes to the first
 * section they can (Contacts, then Campaigns, then More) instead of a dead end.
 */
export default function InboxScreenGate() {
  const chats = useCan(P.chats.list);
  const contacts = useCan(P.contacts.list);
  const campaigns = useCan(P.campaigns.list);
  // Only redirect once the member's permissions are known (until then everything reads as enforced).
  const settled = usePermissionsSettled();
  if (!chats && !settled) return null;
  if (!chats) return <Redirect href={contacts ? '/(app)/(tabs)/contacts' : campaigns ? '/(app)/campaigns' : '/(app)/(tabs)/more'} />;
  return <InboxScreen />;
}
