/**
 * One campaign: its state and actions (send now, schedule, cancel, rename,
 * delete), the numbers at a glance and the delivery funnel, the message that
 * went out, what people replied, every recipient by status (failed ones with
 * the provider's error), and one-tap re-targets of the people who did not
 * read, did not reply or failed.
 */
import type { CampaignMessageStatus } from '@ab-ecosystem/cpaas';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Ban, CalendarClock, CheckCheck, FileText, MessageCircleReply, Pencil, Radio, RefreshCw, Send, Target, Trash2, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { campaignKeys, useStateColor } from '@/components/campaigns/shared';
import { Button, Card, Chip, Input, Row, Screen, Sheet, StatTile, StatusPill, Text } from '@/components/ui';
import { TemplatePreview } from '@/components/whatsapp/TemplatePreview';
import { useTemplates, useWaChannels } from '@/hooks/queries';
import { parseTemplate } from '@/services/crm/whatsapp';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { confirmAction, showAlert } from '@/lib/dialog';
import { formatPhone } from '@/lib/phone';
import {
  campaignRan,
  campaignReplies,
  campaignRows,
  campaignState,
  campaignStats,
  cancelCampaign,
  deleteCampaign,
  getCampaign,
  isWebhookUnset,
  renameCampaign,
  triggerCampaign,
  type RetargetGroup,
} from '@/services/crm/campaigns';
import { describeCrmError } from '@/services/crm/client';
import { goBack } from '@/lib/nav';
import { useTheme } from '@/theme/ThemeProvider';
import { useCan } from '@/stores/auth';
import { P } from '@/lib/permissions';

type RowFilter = { status: CampaignMessageStatus; exact: boolean; key: string };
const ROW_FILTERS: RowFilter[] = [
  { key: 'sent', status: 'sent', exact: false },
  { key: 'unread', status: 'delivered', exact: true },
  { key: 'read', status: 'read', exact: false },
  { key: 'replied', status: 'replied', exact: false },
  { key: 'failed', status: 'failed', exact: false },
];

export default function CampaignScreen() {
  const { t } = useTranslation();
  const { colors, radius, shadow } = useTheme();
  const qc = useQueryClient();
  const stateColor = useStateColor();
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useQuery({
    queryKey: campaignKeys.one(id),
    queryFn: () => getCampaign(id),
    refetchInterval: (q) => (q.state.data?.status === 'processing' ? 15_000 : q.state.data?.scheduledAt && q.state.data.status === 'pending' ? 60_000 : false),
  });
  const state = c.data ? campaignState(c.data) : null;
  const ran = c.data ? campaignRan(c.data) : false;
  const stats = useQuery({
    queryKey: campaignKeys.stats(id),
    queryFn: () => campaignStats(id),
    enabled: ran,
    refetchInterval: state === 'sending' ? 15_000 : false,
  });
  const replies = useQuery({ queryKey: campaignKeys.replies(id), queryFn: () => campaignReplies(id), enabled: ran && !!stats.data?.replied });
  const [rowFilter, setRowFilter] = useState<RowFilter>(ROW_FILTERS[0]);
  const [page, setPage] = useState(1);
  const rows = useQuery({
    queryKey: [...campaignKeys.rows(id, rowFilter.key), page],
    queryFn: () => campaignRows(id, { status: rowFilter.status, exact: rowFilter.exact, page }),
    enabled: ran,
  });
  const [scheduling, setScheduling] = useState(false);
  const [renaming, setRenaming] = useState(false);
  // What the role allows on a campaign (owners: everything).
  const can = {
    update: useCan(P.campaigns.update),
    send: useCan(P.campaigns.send),
    create: useCan(P.campaigns.create),
    delete: useCan(P.campaigns.delete),
  };
  const [busy, setBusy] = useState<string | null>(null);
  // The message that went out: its template on its channel, previewed as the recipient sees it.
  const sent = c.data?.messages?.[0];
  const sentTemplate = (sent?.message as { template?: { name?: string; language?: { code?: string } } } | undefined)?.template;
  const channels = useWaChannels();
  const channelName = channels.data?.find((x) => x.id === sent?.channel?.id)?.name ?? '';
  const templates = useTemplates(sent?.channel?.id ?? null);
  const template = templates.data?.find((x) => x.name === sentTemplate?.name && (!sentTemplate?.language?.code || x.language === sentTemplate.language.code));
  // What was actually sent: per-recipient values show as {{v1}}-style placeholders, fixed ones as typed.
  type SentParam = { type?: string; text?: string; parameter_name?: string; image?: { link?: string }; video?: { link?: string }; document?: { link?: string } };
  const sentComponents = ((sent?.message as { template?: { components?: { type?: string; parameters?: SentParam[] }[] } } | undefined)?.template?.components ?? []);
  const sentValue = (part: 'body' | 'header', name: string): string | undefined => {
    const params = sentComponents.find((x) => x.type === part)?.parameters ?? [];
    const p = params.find((x) => x.parameter_name === name) ?? (/^\d+$/.test(name) ? params[Number(name) - 1] : undefined);
    return p?.type === 'text' ? p.text : undefined;
  };
  const sentHeader = sentComponents.find((x) => x.type === 'header')?.parameters?.[0];
  const sentHeaderMedia = sentHeader?.image?.link ?? sentHeader?.video?.link ?? sentHeader?.document?.link;

  const refresh = () => qc.invalidateQueries({ queryKey: campaignKeys.all });
  const run = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try {
      await fn();
      void refresh();
      if (done) showAlert(done);
    } catch (err) {
      showAlert(t('camp.actionFailed'), isWebhookUnset(err) ? t('camp.webhookUnset') : describeCrmError(err));
    } finally {
      setBusy(null);
    }
  };

  const sendNow = async () => {
    if (!(await confirmAction({ title: t('camp.confirmSend'), message: t('camp.nowHint'), confirmText: t('camp.sendNow'), cancelText: t('common.cancel') })))
      return;
    void run('send', () => triggerCampaign(id), t('camp.sending'));
  };
  const cancel = async () => {
    if (
      !(await confirmAction({
        title: t('camp.cancelQ'),
        message: t('camp.cancelBody'),
        confirmText: t('camp.cancel'),
        cancelText: t('common.cancel'),
        destructive: true,
      }))
    )
      return;
    void run('cancel', () => cancelCampaign(id), t('camp.cancelled'));
  };
  const remove = async () => {
    if (
      !(await confirmAction({
        title: t('camp.deleteQ'),
        message: t('camp.deleteBody'),
        confirmText: t('common.delete'),
        cancelText: t('common.cancel'),
        destructive: true,
      }))
    )
      return;
    setBusy('delete');
    try {
      await deleteCampaign(id);
      void refresh();
      goBack('/(app)/campaigns');
    } catch (err) {
      showAlert(t('camp.actionFailed'), describeCrmError(err));
    } finally {
      setBusy(null);
    }
  };
  const retarget = (group: RetargetGroup) =>
    router.push({ pathname: '/(app)/campaigns/new', params: { retarget: id, group, name: `${c.data?.name ?? ''} · ${t(`camp.group.${group}`)}` } });

  if (c.isLoading) {
    return (
      <Screen title={t('camp.title')} back>
        <ActivityIndicator color={colors.primary} style={{ padding: 32 }} />
      </Screen>
    );
  }
  if (!c.data) {
    return (
      <Screen title={t('camp.title')} back>
        <Text tone="danger" style={{ marginTop: 16 }}>
          {c.error ? describeCrmError(c.error) : t('camp.notFound')}
        </Text>
      </Screen>
    );
  }

  const camp = c.data;
  const s = stats.data;
  const pct = (n: number) => (s?.total ? `${Math.round((n / s.total) * 100)}%` : '–');
  const funnel = s
    ? [
        { key: 'sent', value: s.sent, color: colors.primary },
        { key: 'delivered', value: s.delivered, color: colors.accent },
        { key: 'read', value: s.read, color: colors.success },
        { key: 'replied', value: s.replied, color: colors.warning },
        { key: 'failed', value: s.failed, color: colors.danger },
      ]
    : [];

  return (
    <Screen
      title={camp.name}
      back
      scroll
      onRefresh={refresh}
      right={
        // Once sending or finished, a campaign is a record: no edits.
        can.update && camp.status !== 'processing' && camp.status !== 'completed' ? (
          <Pressable onPress={() => setRenaming(true)} hitSlop={10} style={{ padding: 6 }} accessibilityRole="button" accessibilityLabel={t('common.edit')}>
            <Pencil size={18} color={colors.textMuted} />
          </Pressable>
        ) : undefined
      }
    >
      <View style={{ gap: 14, marginTop: 8, paddingBottom: 24 }}>
        <Card style={{ gap: 10 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <StatusPill label={t(`camp.state.${state}`)} color={stateColor(state!)} />
            {camp.isRepeating && camp.repeat ? (
              <Row gap={4}>
                <RefreshCw size={13} color={colors.textMuted} />
                <Text variant="caption" tone="muted">
                  {t(`camp.rep.${camp.repeat.unit}`, { defaultValue: camp.repeat.unit })}
                </Text>
              </Row>
            ) : null}
          </Row>
          {sentTemplate?.name || channelName ? (
            <Row gap={14} style={{ flexWrap: 'wrap' }}>
              {sentTemplate?.name ? (
                <Row gap={4}>
                  <FileText size={14} color={colors.textMuted} />
                  <Text variant="caption" style={{ fontWeight: '600' }}>
                    {sentTemplate.name}
                  </Text>
                </Row>
              ) : null}
              {channelName ? (
                <Row gap={4}>
                  <Radio size={14} color={colors.textMuted} />
                  <Text variant="caption" style={{ fontWeight: '600' }}>
                    {channelName}
                  </Text>
                </Row>
              ) : null}
            </Row>
          ) : null}
          <Meta label={t('camp.created')} value={when(camp.createdAt)} />
          {camp.scheduledAt ? <Meta label={t('camp.scheduledFor')} value={when(camp.scheduledAt)} /> : null}
          {camp.processedAt ? <Meta label={t('camp.started')} value={when(camp.processedAt)} /> : null}
          {camp.completedAt ? <Meta label={t('camp.finished')} value={when(camp.completedAt)} /> : null}
          {camp.receivers ? <Meta label={t('camp.audience')} value={t('camp.recipients', { count: camp.receivers })} /> : null}
          {camp.error ? (
            <Text variant="caption" tone="danger">
              {camp.error}
            </Text>
          ) : null}
          {camp.status === 'pending' && can.send ? (
            <View style={{ gap: 8, marginTop: 4 }}>
              <Button title={t('camp.sendNow')} icon={<Send size={18} color="#fff" />} loading={busy === 'send'} onPress={() => void sendNow()} />
              <Button
                variant="secondary"
                title={camp.scheduledAt ? t('camp.reschedule') : t('camp.schedule')}
                icon={<CalendarClock size={18} color={colors.primary} />}
                onPress={() => setScheduling(true)}
              />
              {camp.scheduledAt ? (
                <Button
                  variant="outline"
                  title={t('camp.cancel')}
                  icon={<Ban size={18} color={colors.danger} />}
                  loading={busy === 'cancel'}
                  onPress={() => void cancel()}
                />
              ) : null}
            </View>
          ) : null}
          {camp.status === 'processing' && can.send ? (
            <Button
              variant="outline"
              title={t('camp.stop')}
              icon={<Ban size={18} color={colors.danger} />}
              loading={busy === 'cancel'}
              onPress={() => void cancel()}
            />
          ) : null}
        </Card>

        {ran && s?.total ? (
          // The numbers at a glance: each with its share of everyone the campaign tried to reach.
          <View style={styles.tiles}>
            {[
              { key: 'sent', value: s.sent, Icon: Send, color: colors.primary },
              { key: 'delivered', value: s.delivered, Icon: CheckCheck, color: colors.accent },
              { key: 'read', value: s.read, Icon: CheckCheck, color: colors.success },
              { key: 'replied', value: s.replied, Icon: MessageCircleReply, color: colors.warning },
              { key: 'failed', value: s.failed, Icon: TriangleAlert, color: colors.danger },
            ].map((k) => (
              <StatTile
                key={k.key}
                icon={<k.Icon size={16} color={k.color} />}
                tint={k.color}
                value={k.value.toLocaleString()}
                label={`${t(`camp.stat.${k.key}`)} · ${pct(k.value)}`}
                style={[styles.tile, { backgroundColor: colors.surface, borderRadius: radius.lg }, shadow.card]}
              />
            ))}
          </View>
        ) : null}

        {template ? (
          <Card style={{ gap: 10 }}>
            <Text variant="h3">{t('camp.message')}</Text>
            <TemplatePreview
              template={parseTemplate(template.components)}
              values={(n) => sentValue('body', n)}
              headerValues={(n) => sentValue('header', n)}
              mediaUri={sentHeaderMedia}
            />
            <Text variant="micro" tone="faint">
              {t('camp.messageNote')}
            </Text>
          </Card>
        ) : null}

        {ran ? (
          <Card style={{ gap: 12 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="h3">{t('camp.report')}</Text>
              {stats.isFetching ? <ActivityIndicator size="small" color={colors.primary} /> : null}
            </Row>
            {s ? (
              <>
                <Text variant="caption" tone="muted">
                  {t('camp.attempted', { count: s.total })}
                </Text>
                {funnel.map((f) => (
                  <View key={f.key} style={{ gap: 4 }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Text variant="bodyStrong">{t(`camp.stat.${f.key}`)}</Text>
                      <Text variant="caption" tone="muted">
                        {f.value.toLocaleString()} · {pct(f.value)}
                      </Text>
                    </Row>
                    <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
                      <View style={{ height: 8, borderRadius: 4, width: s.total ? `${(f.value / s.total) * 100}%` : 0, backgroundColor: f.color }} />
                    </View>
                  </View>
                ))}
              </>
            ) : stats.error ? (
              <Text tone="danger">{describeCrmError(stats.error)}</Text>
            ) : null}
          </Card>
        ) : null}

        {replies.data?.groups.length ? (
          <Card style={{ gap: 10 }}>
            <Text variant="h3">{t('camp.replies')}</Text>
            <Text variant="caption" tone="muted">
              {t('camp.repliesSub', { replied: replies.data.replied, distinct: replies.data.distinct })}
            </Text>
            {replies.data.groups.map((g) => (
              <Row key={`${g.replyType}:${g.reply}`} style={{ justifyContent: 'space-between' }} gap={8}>
                <Text numberOfLines={2} style={{ flex: 1 }}>
                  {g.reply || `(${g.replyType})`}
                </Text>
                <Text variant="bodyStrong">{g.count}</Text>
              </Row>
            ))}
          </Card>
        ) : null}

        {ran && s?.total && can.create ? (
          <Card style={{ gap: 10 }}>
            <Row gap={8}>
              <Target size={18} color={colors.textMuted} />
              <Text variant="h3">{t('camp.retarget')}</Text>
            </Row>
            <Text variant="caption" tone="muted">
              {t('camp.retargetHint')}
            </Text>
            <Row gap={6} style={{ flexWrap: 'wrap' }}>
              {s.delivered - s.read > 0 ? <Chip small label={t('camp.group.unread')} onPress={() => retarget('unread')} /> : null}
              {s.read - s.replied > 0 ? <Chip small label={t('camp.group.noReply')} onPress={() => retarget('noReply')} /> : null}
              {s.failed > 0 ? <Chip small label={t('camp.group.failed')} onPress={() => retarget('failed')} /> : null}
              {s.replied > 0 ? <Chip small label={t('camp.group.replied')} onPress={() => retarget('replied')} /> : null}
              <Chip small label={t('camp.group.all')} onPress={() => retarget('all')} />
            </Row>
          </Card>
        ) : null}

        {ran ? (
          <Card style={{ gap: 10 }}>
            <Text variant="h3">{t('camp.people')}</Text>
            <Row gap={6} style={{ flexWrap: 'wrap' }}>
              {ROW_FILTERS.map((f) => (
                <Chip
                  key={f.key}
                  small
                  label={t(`camp.rows.${f.key}`)}
                  selected={rowFilter.key === f.key}
                  onPress={() => {
                    setRowFilter(f);
                    setPage(1);
                  }}
                />
              ))}
            </Row>
            {rows.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
            {rows.data && !rows.data.data.length ? (
              <Text variant="caption" tone="faint">
                {t('camp.noRows')}
              </Text>
            ) : null}
            {rows.data?.data.map((r) => (
              <View key={r.id} style={{ gap: 2, paddingVertical: 6, borderBottomWidth: 1, borderColor: colors.border }}>
                <Row style={{ justifyContent: 'space-between' }} gap={8}>
                  <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                    {r.name || formatPhone(r.identifier)}
                  </Text>
                  <Text variant="caption" tone={r.status === 'failed' ? 'danger' : 'muted'}>
                    {t(`camp.stat.${r.status}`)}
                  </Text>
                </Row>
                {r.name ? (
                  <Text variant="caption" tone="muted">
                    {formatPhone(r.identifier)}
                  </Text>
                ) : null}
                {r.reply ? (
                  <Text variant="caption" numberOfLines={2}>
                    “{r.reply}”
                  </Text>
                ) : null}
                {r.error ? (
                  <Text variant="caption" tone="danger" numberOfLines={3}>
                    {r.error}
                  </Text>
                ) : null}
              </View>
            ))}
            {rows.data && rows.data.pagination.pages > 1 ? (
              <Row style={{ justifyContent: 'space-between' }}>
                <Button variant="ghost" size="sm" title="‹" disabled={page <= 1} onPress={() => setPage((p) => p - 1)} />
                <Text variant="caption" tone="muted">
                  {t('camp.page', { page, pages: rows.data.pagination.pages })}
                </Text>
                <Button variant="ghost" size="sm" title="›" disabled={page >= rows.data.pagination.pages} onPress={() => setPage((p) => p + 1)} />
              </Row>
            ) : null}
          </Card>
        ) : null}

        {/* A campaign that is sending or has finished keeps its record: no delete. */}
        {camp.status !== 'processing' && camp.status !== 'completed' && can.delete ? (
          <Button
            variant="ghost"
            title={t('camp.delete')}
            icon={<Trash2 size={18} color={colors.danger} />}
            loading={busy === 'delete'}
            onPress={() => void remove()}
          />
        ) : null}
      </View>

      {scheduling ? (
        <ScheduleSheet
          initial={camp.scheduledAt}
          onClose={() => setScheduling(false)}
          onPick={(at) => (setScheduling(false), void run('send', () => triggerCampaign(id, at), t('camp.scheduled')))}
        />
      ) : null}
      {renaming ? (
        <RenameSheet
          initial={camp.name}
          onClose={() => setRenaming(false)}
          onSave={(name) => (setRenaming(false), void run('rename', () => renameCampaign(id, name)))}
        />
      ) : null}
    </Screen>
  );
}

const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <Row style={{ justifyContent: 'space-between' }} gap={8}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="caption" style={{ fontWeight: '600', flexShrink: 1, textAlign: 'right' }}>
        {value}
      </Text>
    </Row>
  );
}

function ScheduleSheet({ initial, onClose, onPick }: { initial?: string; onClose: () => void; onPick: (at: Date) => void }) {
  const { t } = useTranslation();
  const [at, setAt] = useState(() => (initial ? new Date(initial) : new Date(Date.now() + 3600_000)));
  const [now] = useState(() => Date.now());
  return (
    <Sheet
      open
      onClose={onClose}
      title={t('camp.schedule')}
      footer={<Button title={t('camp.schedule')} disabled={at.getTime() < now + 60_000} onPress={() => onPick(at)} />}
    >
      <DateTimeField
        label={at.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
        value={at}
        onChange={setAt}
        minimumDate={new Date(now)}
        selected
      />
    </Sheet>
  );
}

function RenameSheet({ initial, onClose, onSave }: { initial: string; onClose: () => void; onSave: (name: string) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial);
  return (
    <Sheet
      open
      onClose={onClose}
      title={t('camp.rename')}
      footer={<Button title={t('common.save')} disabled={!name.trim()} onPress={() => onSave(name.trim())} />}
    >
      <Input value={name} onChangeText={setName} autoFocus />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  // Two per row on phones (labels like "Delivered · 97%" stay whole), more on wider screens.
  tile: { flexBasis: '30%', flexGrow: 1, minWidth: 140 },
});
