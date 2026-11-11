/**
 * Contact detail. A compact gradient header (who, their board stages, and the
 * ways to message them), then tabs for the contact's fields and notes. Rarer
 * actions (edit, copy, delete) sit in the ⋯ menu.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { goBack } from '@/lib/nav';
import { ArrowLeft, ChevronDown, Copy, FileText, MessageCircle, MoreHorizontal, Pencil, Trash2, X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Button, Card, EmptyState, GroupRow, Input, Loading, Row, Screen, Sheet, Text, UnderlineTabs, useOptionColor } from '@/components/ui';
import { useFields, useLead, useUpdateLead } from '@/hooks/queries';
import { useBoards, type Board } from '@/hooks/boards';
import { copyPhone, messageOnWhatsApp } from '@/lib/actions';
import { confirmAction, showAlert } from '@/lib/dialog';
import { describeCrmError, isNotFound } from '@/services/crm/client';
import { fieldLabel, formatFieldValue } from '@/services/crm/fields';
import { humanizeKind } from '@/services/crm/channels';
import { useKindLabel } from '@/components/channels/ChannelBits';
import { tagLabel } from '@/components/leads/ContactChips';
import { fieldText, trashLead, type Lead } from '@/services/crm/leads';
import { addNote, deleteNote, listNotes } from '@/services/crm/notes';
import { formatPhone } from '@/lib/phone';
import { formatWhen } from '@/lib/time';
import { useCan } from '@/stores/auth';
import { P } from '@/lib/permissions';
import { useTabBarInset } from '@/components/navigation/FloatingTabBar';
import { usePullRefresh } from '@/hooks/usePullRefresh';
import { useTheme } from '@/theme/ThemeProvider';
import { rtlFlip } from '@/lib/rtl';
import { DesktopColumn } from '@/components/ui/DesktopColumn';
import { useDesktop } from '@/hooks/useDesktop';

type Tab = 'details' | 'notes';

/**
 * The contact page: full screen on phones (route `/lead/[id]`), and in the
 * right-side panel on desktop web (`onClose` given).
 */
export function LeadView({ id, onClose }: { id: string; onClose?: () => void }) {
  const { t } = useTranslation();
  const close = onClose ?? (() => goBack());
  const inPanel = !!onClose;
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const barInset = useTabBarInset();
  const qc = useQueryClient();
  // What the role allows on a contact (owners: everything).
  const can = { update: useCan(P.contacts.update), delete: useCan(P.contacts.delete) };
  const desktop = useDesktop();
  const lead = useLead(id);
  const fields = useFields();
  const { boards } = useBoards();
  const notes = useNotes(id);
  // Contact notes are not live on every CPaaS deployment yet (the routes answer 404): then there is no Notes tab.
  const notesOn = !(notes.isError && isNotFound(notes.error));
  const pull = usePullRefresh(() => Promise.all([lead.refetch(), notes.refetch()]));
  const [tab, setTab] = useState<Tab>('details');
  const [sheet, setSheet] = useState<'more' | null>(null);
  const [picking, setPicking] = useState<Board | null>(null);
  const kindLabel = useKindLabel();

  if (lead.isLoading)
    return inPanel ? (
      <Loading label={t('common.loading')} />
    ) : (
      <Screen back>
        <Loading label={t('common.loading')} />
      </Screen>
    );
  // Gone from the server (deleted or trashed elsewhere): not shown from an old copy.
  if (!lead.data || (lead.isError && isNotFound(lead.error)))
    return inPanel ? (
      <EmptyState title={t('leads.notFound')} body={String((lead.error as Error)?.message ?? '')} action={t('common.close')} onAction={close} />
    ) : (
      <Screen back>
        <EmptyState title={t('leads.notFound')} body={String((lead.error as Error)?.message ?? '')} />
      </Screen>
    );
  const l = lead.data;
  const edit = () => {
    onClose?.();
    router.push({ pathname: '/lead/new', params: { id: l.id } });
  };
  const remove = async () => {
    setSheet(null);
    const ok = await confirmAction({
      title: t('trash.deleteLeadQ'),
      message: t('trash.deleteLeadBody'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await trashLead(l.id);
      qc.removeQueries({ queryKey: ['lead', l.id] });
      void qc.invalidateQueries({ queryKey: ['leads'] });
      void qc.invalidateQueries({ queryKey: ['board'] });
      close();
    } catch (err) {
      showAlert(t('common.couldNotSave'), describeCrmError(err));
    }
  };

  // Every field this contact has a value for: the workspace's fields, then values stored under a slug
  // with no field definition, plus the contact's other channels, tags and dates. [key, label, value]
  const known = new Set((fields.data ?? []).map((f) => f.slug));
  const loose = (v: unknown) => (Array.isArray(v) ? v.filter((x) => x != null && x !== '').join(', ') : v && typeof v === 'object' ? JSON.stringify(v) : v == null ? '' : String(v));
  const details: [string, string, string][] = [
    ['__phone', t('auth.mobile'), l.phone ? formatPhone(l.phone) : ''],
    ...Object.entries(l.raw.profile ?? {})
      .filter(([kind, p]) => kind !== 'whatsapp' && p?.identifier)
      .map(([kind, p]): [string, string, string] => [`__profile:${kind}`, kindLabel(kind), p.identifier]),
    ...(fields.data ?? []).map((f): [string, string, string] => [f.slug, fieldLabel(f), formatFieldValue(f, l.fields[f.slug])]),
    ...Object.entries(l.fields)
      .filter(([slug]) => !known.has(slug))
      .map(([slug, v]): [string, string, string] => [`__extra:${slug}`, humanizeKind(slug), loose(v)]),
    ['__tags', t('leads.tags'), l.tags.map(tagLabel).join(', ')],
    ['__created', t('leads.created'), formatWhen(l.createdAt)],
    ['__updated', t('leads.updated'), formatWhen(l.updatedAt)],
  ];

  // Desktop web, full page: the contact on the left, its details on the right, each scrolling on its own.
  const split = desktop && !inPanel;
  const summary = (
    <LinearGradient
      colors={[colors.heroFrom, colors.heroTo]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.hero, { paddingTop: insets.top + 8, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl }]}
    >
      <Row style={{ justifyContent: 'space-between' }}>
        <GlassButton label={inPanel ? t('common.close') : t('common.back')} onPress={close}>
          {inPanel ? <X size={20} color="#fff" /> : <ArrowLeft size={20} color="#fff" style={rtlFlip()} />}
        </GlassButton>
        <Row gap={8}>
          {can.update ? (
            <GlassButton label={t('leads.editDetails')} onPress={edit}>
              <Pencil size={18} color="#fff" />
            </GlassButton>
          ) : null}
          <GlassButton label={t('leads.moreActions')} onPress={() => setSheet('more')}>
            <MoreHorizontal size={20} color="#fff" />
          </GlassButton>
        </Row>
      </Row>

      <Row gap={14} style={styles.identity}>
        <View style={[styles.avatarRing, { borderColor: 'rgba(255,255,255,0.35)' }]}>
          <Avatar name={l.name} uri={l.avatarUrl} size={60} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="h2" style={{ color: '#fff' }} numberOfLines={2} accessibilityRole="header">
            {l.name}
          </Text>
          <Pressable
            onPress={() => void copyPhone(l.phone)}
            disabled={!l.phone}
            accessibilityRole="button"
            accessibilityLabel={l.phone ? `${t('leads.copyNumber')}: ${formatPhone(l.phone)}` : t('leads.noNumber')}
            hitSlop={8}
            style={styles.phoneRow}
          >
            <Text variant="bodyStrong" style={{ color: colors.onHeroMuted }}>
              {l.phone ? formatPhone(l.phone) : t('leads.noNumber')}
            </Text>
            {l.phone ? <Copy size={13} color={colors.onHeroMuted} /> : null}
          </Pressable>
        </View>
      </Row>

      {/* Where the contact is on each board; tap to move it. Read-only for a role that can't edit contacts. */}
      {boards.length ? (
        <Row gap={8} style={{ marginTop: 14, flexWrap: 'wrap' }}>
          {boards.map((b) => (
            <BoardChip key={b.slug} board={b} value={fieldText(l, b.slug)} disabled={!can.update} onPress={() => setPicking(b)} />
          ))}
        </Row>
      ) : null}

      <Row gap={10} style={{ marginTop: 16 }}>
        <ContactButton
          label={t('common.whatsapp')}
          icon={<MessageCircle size={20} color="#fff" />}
          bg="#1FAF55"
          onPress={() => messageOnWhatsApp({ phone: l.phone, leadId: l.id })}
          disabled={!l.phone}
        />
        <ContactButton
          label={t('wa.sendTemplate')}
          icon={<FileText size={20} color="#fff" />}
          bg={colors.primary}
          onPress={() => {
            onClose?.();
            router.push({ pathname: '/(app)/whatsapp/send', params: { leadId: l.id } });
          }}
          disabled={!l.phone}
        />
      </Row>
    </LinearGradient>
  );
  const sections = (
    <>
      <View style={{ marginTop: 20 }}>
        <UnderlineTabs
          value={notesOn ? tab : 'details'}
          onChange={setTab}
          options={[
            { value: 'details', label: t('leads.details') },
            ...(notesOn ? [{ value: 'notes' as Tab, label: t('notes.title'), count: notes.data?.length || undefined }] : []),
          ]}
        />
      </View>
      <View style={styles.body}>
        {tab === 'details' || !notesOn ? (
          <Card padded={false}>
            {details
              .filter(([, , v]) => v)
              .map(([key, k, v], i) => (
                <View key={key} style={[styles.detail, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                  <Text variant="caption" tone="muted" style={{ flexShrink: 1, maxWidth: '45%' }}>
                    {k}
                  </Text>
                  <Text variant="bodyStrong" style={{ flex: 1, textAlign: 'right' }} numberOfLines={3} selectable>
                    {v}
                  </Text>
                </View>
              ))}
            {can.update ? (
              <View style={{ padding: 12 }}>
                <Button title={t('leads.editDetails')} variant="secondary" full icon={<Pencil size={16} color={colors.primary} />} onPress={edit} />
              </View>
            ) : null}
          </Card>
        ) : (
          <Notes lead={l} canEdit={can.update} />
        )}
      </View>
    </>
  );
  const refresh = <RefreshControl refreshing={pull.refreshing} onRefresh={() => void pull.onRefresh()} tintColor={colors.primary} colors={[colors.primary]} />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {split ? (
        <View style={styles.split}>
          <ScrollView style={styles.splitLeft} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
            {summary}
          </ScrollView>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }} refreshControl={refresh}>
            {sections}
          </ScrollView>
        </View>
      ) : (
        // The side panel and phones: one column.
        <DesktopColumn>
          <ScrollView
            refreshControl={refresh}
            contentContainerStyle={{ paddingBottom: 40 + (barInset ? barInset + 22 : insets.bottom) }}
            showsVerticalScrollIndicator={false}
          >
            {summary}
            {sections}
          </ScrollView>
        </DesktopColumn>
      )}

      {picking ? <BoardPicker lead={l} board={picking} onClose={() => setPicking(null)} /> : null}
      <Sheet open={sheet === 'more'} onClose={() => setSheet(null)} title={l.name}>
        <View style={[styles.menu, { borderColor: colors.border, borderRadius: radius.lg }]}>
          {can.update ? (
            <GroupRow
              icon={<Pencil size={18} />}
              tint={colors.primary}
              title={t('leads.editDetails')}
              onPress={() => {
                setSheet(null);
                edit();
              }}
            />
          ) : null}
          {l.phone ? (
            <GroupRow
              icon={<Copy size={18} />}
              tint={colors.primary}
              title={t('leads.copyNumber')}
              subtitle={formatPhone(l.phone)}
              last={!can.delete}
              onPress={() => {
                setSheet(null);
                void copyPhone(l.phone);
              }}
            />
          ) : null}
          {can.delete ? (
            <GroupRow
              last
              danger
              icon={<Trash2 size={18} color={colors.danger} />}
              tint={colors.danger}
              title={t('trash.deleteLead')}
              onPress={() => void remove()}
              right={<View />}
            />
          ) : null}
        </View>
      </Sheet>
    </View>
  );
}

/** "Stage: Won ▾" on the header, one per board. */
function BoardChip({ board, value, disabled, onPress }: { board: Board; value: string; disabled: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const color = useOptionColor()(value);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={disabled ? 'text' : 'button'}
      accessibilityLabel={`${board.label}: ${value || t('board.notSet')}`}
      style={({ pressed }) => [styles.boardChip, { backgroundColor: colors.heroGlass, opacity: pressed ? 0.75 : 1 }]}
    >
      <View style={[styles.boardDot, { backgroundColor: color }]} />
      <Text variant="caption" style={{ color: colors.onHeroMuted }}>
        {board.label}
      </Text>
      <Text variant="bodyStrong" style={{ color: '#fff' }} numberOfLines={1}>
        {value || t('board.notSet')}
      </Text>
      {disabled ? null : <ChevronDown size={16} color="#fff" />}
    </Pressable>
  );
}

/** Moves the contact to another option of a board field. */
function BoardPicker({ lead, board, onClose }: { lead: Lead; board: Board; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const qc = useQueryClient();
  const update = useUpdateLead();
  const optionColor = useOptionColor();
  const current = fieldText(lead, board.slug);
  const [busy, setBusy] = useState<string | null>(null);

  const pick = async (value: string) => {
    if (value === current) return onClose();
    setBusy(value);
    try {
      await update.mutateAsync({ lead, input: { fields: { [board.slug]: value } } });
      void qc.invalidateQueries({ queryKey: ['board', board.slug] });
      onClose();
    } catch (err) {
      showAlert(t('common.couldNotSave'), describeCrmError(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open onClose={onClose} title={board.label} subtitle={lead.name}>
      <View style={{ gap: 8 }}>
        {[...board.options, ''].map((o) => {
          const on = o === current;
          return (
            <Pressable
              key={o || '__none'}
              onPress={() => void pick(o)}
              style={[styles.option, { borderRadius: radius.md, backgroundColor: on ? colors.primarySoft : colors.surfaceAlt }]}
            >
              <View style={[styles.boardDot, { backgroundColor: optionColor(o), width: 12, height: 12, borderRadius: 6 }]} />
              <Text variant="bodyStrong" style={{ flex: 1, color: on ? colors.primary : o ? colors.text : colors.textMuted }}>
                {o || t('board.notSet')}
              </Text>
              {busy === o ? <ActivityIndicator color={colors.primary} /> : on ? <Text tone="primary">✓</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

/** The contact's notes (CPaaS contact notes): add one, read them newest first, delete. */
function Notes({ lead, canEdit }: { lead: Lead; canEdit: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const notes = useNotes(lead.id);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await addNote(lead.id, draft);
      setDraft('');
      await qc.invalidateQueries({ queryKey: ['notes', lead.id] });
    } catch (err) {
      showAlert(t('common.couldNotSave'), describeCrmError(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (noteId: string) => {
    const ok = await confirmAction({
      title: t('notes.deleteQ'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    await deleteNote(lead.id, noteId)
      .then(() => qc.invalidateQueries({ queryKey: ['notes', lead.id] }))
      .catch((err: unknown) => showAlert(t('common.couldNotSave'), describeCrmError(err)));
  };

  return (
    <View style={{ gap: 12 }}>
      {canEdit ? (
        <Card style={{ gap: 10 }}>
          <Input placeholder={t('notes.placeholder')} value={draft} onChangeText={setDraft} multiline maxLength={5000} />
          <Button title={t('notes.add')} onPress={() => void save()} loading={saving} disabled={!draft.trim()} style={{ alignSelf: 'flex-end' }} />
        </Card>
      ) : null}
      {notes.isLoading ? <Loading /> : null}
      {notes.isError ? <Text tone="danger">{describeCrmError(notes.error)}</Text> : null}
      {notes.data && !notes.data.length ? <EmptyState title={t('notes.empty')} /> : null}
      {notes.data?.length ? (
        <Card padded={false}>
          {notes.data.map((n, i) => (
            <View key={n.id} style={[styles.note, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text>{n.note}</Text>
                <Text variant="micro" tone="faint">
                  {formatWhen(n.createdAt)}
                </Text>
              </View>
              {canEdit ? (
                <Pressable onPress={() => void remove(n.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.delete')}>
                  <Trash2 size={16} color={colors.textFaint} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </Card>
      ) : null}
    </View>
  );
}

/** A contact's notes; a 404 (notes not live on this deployment) is not retried. */
const useNotes = (contactId: string) =>
  useQuery({
    queryKey: ['notes', contactId],
    queryFn: () => listNotes(contactId),
    enabled: !!contactId,
    retry: (n, err) => !isNotFound(err) && n < 2,
  });

function GlassButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.glass, { backgroundColor: colors.heroGlass, opacity: pressed ? 0.7 : 1 }]}
    >
      {children}
    </Pressable>
  );
}

/** One of the ways to message the contact: equal width, icon and label, thumb-sized. */
function ContactButton({ label, icon, bg, onPress, disabled }: { label: string; icon: React.ReactNode; bg: string; onPress: () => void; disabled?: boolean }) {
  const { radius } = useTheme();
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.contactButton,
        { backgroundColor: bg, borderRadius: radius.md, opacity: disabled ? 0.45 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
      ]}
    >
      {icon}
      <Text variant="caption" style={{ color: '#fff', fontWeight: '700' }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: 16, paddingBottom: 18 },
  glass: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  identity: { marginTop: 10 },
  avatarRing: { padding: 3, borderRadius: 40, borderWidth: 2 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 28 },
  boardChip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: 999, maxWidth: '100%' },
  boardDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: '#fff' },
  contactButton: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8 },
  menu: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  body: { paddingHorizontal: 16, gap: 12, marginTop: 16 },
  split: { flex: 1, flexDirection: 'row', gap: 24, padding: 24, width: '100%', maxWidth: 1320, alignSelf: 'center' },
  splitLeft: { width: 400, flexGrow: 0, flexShrink: 0 },
  detail: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingVertical: 13 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 },
});
