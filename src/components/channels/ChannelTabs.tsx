/**
 * The tabs of a channel's page: Overview, Profile (WhatsApp), Wallet, Activity
 * and Settings. Templates reuse `TemplateLibrary`.
 */
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { ArrowDownLeft, ArrowUpRight, Camera, Check, ExternalLink, Plug, Send, TriangleAlert, Wallet } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { qualityColor, SetupCard, useKindLabel } from '@/components/channels/ChannelBits';
import { Avatar, Button, Card, Chip, Columns, Divider, EmptyState, Input, Loading, Row, Stack, Text } from '@/components/ui';
import { useDesktop } from '@/hooks/useDesktop';
import { StatusPill } from '@/components/ui/kit';
import { channelKeys, useRefreshChannels } from '@/hooks/channels';
import { showAlert } from '@/lib/dialog';
import { formatMoney } from '@/lib/money';
import { pickFromGallery } from '@/lib/pickFile';
import { formatWhen } from '@/lib/time';
import {
  activityLog,
  canEditAbout,
  CHANNEL_COLORS,
  channelIdentity,
  channelName,
  channelPermission,
  channelState,
  channelType,
  fromLedger,
  getBusinessProfile,
  numberHealth,
  rechargeUrl,
  repairDelivery,
  saveBusinessProfile,
  sendTestMessage,
  spendByCategory,
  updateChannel,
  uploadProfilePicture,
  VERTICALS,
  walletBalance,
  walletLog,
  whatsAppManagerUrl,
  type Channel,
} from '@/services/crm/channels';
import { describeCrmError } from '@/services/crm/client';
import { useAccountsStore } from '@/stores/accounts';
import { useCan } from '@/stores/auth';
import { useWhatsAppConfig, useWhatsAppStore } from '@/stores/whatsapp';
import { useTheme } from '@/theme/ThemeProvider';

const fail = (title: string) => (err: unknown) => showAlert(title, describeCrmError(err));

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <Row gap={12} style={styles.field}>
      <Text variant="caption" tone="muted" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="bodyStrong" style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </Text>
    </Row>
  );
}

/* -------------------------------- overview ------------------------------- */

export function OverviewTab({ channel }: { channel: Channel }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const refresh = useRefreshChannels();
  const type = channelType(channel);
  const wa = type === 'whatsapp';
  const state = channelState(channel);
  const canRegister = useCan(channelPermission(type, 'REGISTER'));
  const canRead = useCan(channelPermission(type, 'READ'));
  const canFixDelivery = useCan('CRM.CHANNEL.WEBHOOK.UPDATE');
  const desktop = useDesktop();
  // Meta's number health is only asked for when the user taps "Check" (it is a live call to Meta).
  const [healthAsked, setHealthAsked] = useState(false);
  const health = useQuery({
    queryKey: channelKeys.prop(channel.id, 'general'),
    queryFn: () => numberHealth(channel.id),
    enabled: wa && canRead && healthAsked,
    retry: false,
  });
  const balance = walletBalance(channel);
  const [fixing, setFixing] = useState(false);

  const fixDelivery = async () => {
    setFixing(true);
    try {
      await repairDelivery(channel.id);
      await refresh();
      showAlert(t('channels.deliveryFixed'), undefined, 'success');
    } catch (err) {
      fail(t('channels.deliveryFixFailed'))(err);
    } finally {
      setFixing(false);
    }
  };

  const h = healthAsked ? health.data : undefined;
  const limit = h?.messaging_limit_tier?.replace(/^TIER_/, '');
  const setup = state === 'setup' && canRegister ? <SetupCard channel={channel} onDone={() => void refresh()} /> : null;
  const delivery =
    wa && !channel.upgraded_webhook_listener && state !== 'setup' ? (
      <Card style={[styles.warn, { borderColor: colors.warning }]}>
        <Row gap={10}>
          <TriangleAlert size={18} color={colors.warning} />
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            {t('channels.deliveryTitle')}
          </Text>
        </Row>
        <Text variant="caption" tone="muted">
          {t('channels.deliveryBody')}
        </Text>
        {canFixDelivery ? (
          <Button
            title={t('channels.deliveryFix')}
            icon={<Plug size={16} color="#fff" />}
            onPress={() => void fixDelivery()}
            loading={fixing}
            style={{ alignSelf: 'flex-start' }}
          />
        ) : null}
      </Card>
    ) : null;
  // Meta's record can come back with none of the fields shown here: then say nothing rather than show an empty card.
  const hasHealth = !!(h && (h.quality_rating || h.verified_name || h.name_status || limit || h.status || h.throughput?.level));
  const healthCard =
    wa && canRead ? (
      <Card padded={false}>
        <Row style={[styles.cardTitle, { justifyContent: 'space-between', alignItems: 'center' }]}>
          <Text variant="micro" tone="faint">
            {t('channels.numberHealth').toUpperCase()}
          </Text>
          {healthAsked && !health.isFetching ? (
            <Pressable onPress={() => void health.refetch()} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('channels.checkAgain')}>
              <Text variant="caption" tone="primary" style={{ fontWeight: '600' }}>
                {t('channels.checkAgain')}
              </Text>
            </Pressable>
          ) : null}
        </Row>
        {!healthAsked ? (
          <View style={{ padding: 14, gap: 10 }}>
            <Text variant="caption" tone="muted">
              {t('channels.healthHint')}
            </Text>
            <Button title={t('channels.checkHealth')} variant="secondary" onPress={() => setHealthAsked(true)} style={{ alignSelf: 'flex-start' }} />
          </View>
        ) : null}
        {healthAsked && health.isFetching ? <Loading /> : null}
        {healthAsked && !health.isFetching && health.data && !hasHealth ? (
          <Text variant="caption" tone="muted" style={{ padding: 14 }}>
            {t('channels.healthEmpty')}
          </Text>
        ) : null}
        {healthAsked && health.isError ? (
          <Text variant="caption" tone="muted" style={{ padding: 14 }}>
            {describeCrmError(health.error)}
          </Text>
        ) : null}
        {h && !health.isFetching && !health.isError ? (
          <>
            {h.quality_rating ? (
              <Row gap={12} style={styles.field}>
                <Text variant="caption" tone="muted" style={{ flex: 1 }}>
                  {t('channels.qualityLabel')}
                </Text>
                <StatusPill label={h.quality_rating} color={qualityColor(h.quality_rating, colors)} />
              </Row>
            ) : null}
            <Field label={t('channels.verifiedName')} value={h.verified_name} />
            <Field label={t('channels.nameStatus')} value={h.name_status} />
            <Field label={t('channels.dailyLimit')} value={limit ? (/^\d/.test(limit) ? t('channels.perDay', { limit }) : limit) : undefined} />
            <Field label={t('channels.numberStatus')} value={h.status} />
            <Field label={t('channels.throughput')} value={h.throughput?.level} />
          </>
        ) : null}
      </Card>
    ) : null;

  const test = wa && state === 'live' ? <TestMessageCard channel={channel} /> : null;
  const hasMain = !!(setup || delivery || healthCard || test);
  const side = (
    <Stack style={hasMain ? undefined : { maxWidth: 560 }}>
      {balance != null ? <WalletSummary channel={channel} /> : null}
      <DetailsCard channel={channel} />
      {/* Desktop has this in the page header. */}
      {wa && !desktop ? (
        <Button
          title={t('channels.openManager')}
          variant="secondary"
          icon={<ExternalLink size={16} color={colors.primary} />}
          onPress={() =>
            void whatsAppManagerUrl(channel.id)
              .then(async (url) => {
                if (url) await WebBrowser.openBrowserAsync(url);
              })
              .catch(fail(t('common.errorTitle')))
          }
        />
      ) : null}
    </Stack>
  );
  // Kinds with nothing provider-side to show (Instagram, SMS…): the details on their own.
  if (!hasMain) return side;
  return (
    <Columns widths={[undefined, 360]}>
      <Stack>
        {setup}
        {delivery}
        {healthCard}
        {test}
      </Stack>
      {side}
    </Columns>
  );
}

/** What any channel is, whatever its kind. */
function DetailsCard({ channel }: { channel: Channel }) {
  const { t } = useTranslation();
  const kindLabel = useKindLabel();
  return (
    <Card padded={false}>
      <Text variant="micro" tone="faint" style={styles.cardTitle}>
        {t('channels.detailsTitle').toUpperCase()}
      </Text>
      <Field label={t('channels.kind')} value={kindLabel(channelType(channel))} />
      <Field label={t('channels.identityLabel')} value={channelIdentity(channel)} />
      <Field label={t('channels.provider')} value={channel.meta?.provider} />
      <Field label={t('channels.speed')} value={channel.campaign_tps ? t('channels.speedValue', { count: channel.campaign_tps }) : undefined} />
    </Card>
  );
}

function WalletSummary({ channel }: { channel: Channel }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const balance = walletBalance(channel) ?? 0;
  const topUp = () =>
    void rechargeUrl(channel.id)
      .then(async (url) => {
        if (url) await WebBrowser.openBrowserAsync(url);
        else showAlert(t('channels.noTopUp'));
      })
      .catch(fail(t('channels.noTopUp')));
  return (
    <Card style={{ gap: 10 }}>
      <Row gap={12}>
        <View style={[styles.walletIcon, { backgroundColor: colors.primarySoft }]}>
          <Wallet size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="caption" tone="muted">
            {t('channels.walletBalance')}
          </Text>
          <Text variant="h2" tone={balance < 0 ? 'danger' : 'default'}>
            {formatMoney(balance, channel.wallet.currency)}
          </Text>
        </View>
        <Button title={t('channels.topUp')} size="sm" onPress={topUp} />
      </Row>
      {balance <= 0 ? (
        <Text variant="caption" tone="warning">
          {t('channels.lowBalance')}
        </Text>
      ) : null}
    </Card>
  );
}

function TestMessageCard({ channel }: { channel: Channel }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const canSend = useCan(channelPermission('whatsapp', 'SEND'));
  const desktop = useDesktop();
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  if (!canSend) return null;
  const send = async () => {
    if (to.replace(/\D/g, '').length < 8) return showAlert(t('channels.testNumberInvalid'));
    setBusy(true);
    try {
      await sendTestMessage(channel.id, to, t('channels.testText', { name: channelName(channel) }));
      showAlert(t('channels.testSent'), undefined, 'success');
    } catch (err) {
      fail(t('channels.testFailed'))(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={{ gap: 10 }}>
      <Text variant="h3">{t('channels.testTitle')}</Text>
      <Text variant="caption" tone="muted">
        {t('channels.testBody')}
      </Text>
      <View style={desktop ? styles.inlineRow : { gap: 10 }}>
        <View style={desktop ? { flex: 1 } : undefined}>
          <Input placeholder="+91 98123 45678" keyboardType="phone-pad" value={to} onChangeText={setTo} accessibilityLabel={t('channels.testTo')} />
        </View>
        <Button
          title={t('channels.testSend')}
          variant="secondary"
          icon={<Send size={16} color={colors.primary} />}
          onPress={() => void send()}
          loading={busy}
        />
      </View>
    </Card>
  );
}

/* --------------------------------- profile -------------------------------- */

type ProfileForm = { about: string; description: string; address: string; email: string; website1: string; website2: string; vertical: string };

export function ProfileTab({ channel }: { channel: Channel }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const canEdit = useCan(channelPermission('whatsapp', 'UPDATE'));
  const desktop = useDesktop();
  const profile = useQuery({ queryKey: channelKeys.prop(channel.id, 'business_profile'), queryFn: () => getBusinessProfile(channel.id), retry: false });
  const aboutEditable = useQuery({ queryKey: channelKeys.prop(channel.id, 'channel_config'), queryFn: () => canEditAbout(channel.id), staleTime: Infinity });
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [busy, setBusy] = useState<'save' | 'photo' | null>(null);
  const p = profile.data;
  if (p && !form) {
    setForm({
      about: p.about ?? '',
      description: p.description ?? '',
      address: p.address ?? '',
      email: p.email ?? '',
      website1: p.websites?.[0] ?? '',
      website2: p.websites?.[1] ?? '',
      vertical: p.vertical ?? '',
    });
  }

  if (profile.isLoading) return <Loading />;
  if (profile.isError || !form)
    return (
      <EmptyState
        title={t('channels.profileFailed')}
        body={describeCrmError(profile.error)}
        action={t('common.retry')}
        onAction={() => void profile.refetch()}
      />
    );

  const set = (k: keyof ProfileForm) => (v: string) => setForm({ ...form, [k]: v });
  const editable = canEdit && channelState(channel) !== 'setup';
  const aboutOk = aboutEditable.data !== false;

  const save = async () => {
    setBusy('save');
    try {
      await saveBusinessProfile(channel.id, {
        ...(aboutOk ? { about: form.about.trim() } : {}),
        description: form.description.trim(),
        address: form.address.trim(),
        email: form.email.trim(),
        websites: [form.website1, form.website2].map((w) => w.trim()).filter(Boolean),
        ...(form.vertical ? { vertical: form.vertical } : {}),
      });
      await profile.refetch();
      showAlert(t('channels.profileSaved'), undefined, 'success');
    } catch (err) {
      fail(t('common.couldNotSave'))(err);
    } finally {
      setBusy(null);
    }
  };

  const changePhoto = async () => {
    const file = await pickFromGallery('image');
    if (!file) return;
    setBusy('photo');
    try {
      await uploadProfilePicture(channel.id, file);
      await profile.refetch();
    } catch (err) {
      fail(t('common.couldNotSave'))(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Columns widths={[280, undefined]}>
      <Card style={{ alignItems: 'center', gap: 10 }}>
        <Avatar name={channelName(channel)} uri={p?.profile_picture_url} size={desktop ? 120 : 84} />
        {editable ? (
          <Button
            title={t('channels.changePhoto')}
            size="sm"
            variant="secondary"
            icon={<Camera size={14} color={colors.primary} />}
            onPress={() => void changePhoto()}
            loading={busy === 'photo'}
          />
        ) : null}
        <Text variant="micro" tone="faint" center>
          {t('channels.profileHint')}
        </Text>
      </Card>
      <Card style={{ gap: 12 }}>
        <Input
          label={t('channels.about')}
          value={form.about}
          onChangeText={set('about')}
          maxLength={139}
          editable={editable && aboutOk}
          hint={aboutOk ? `${form.about.length}/139` : t('channels.aboutLocked')}
        />
        <Input label={t('channels.description')} value={form.description} onChangeText={set('description')} maxLength={512} multiline editable={editable} />
        <Columns gap={12}>
          <Input label={t('channels.address')} value={form.address} onChangeText={set('address')} maxLength={256} editable={editable} />
          <Input
            label={t('auth.email')}
            value={form.email}
            onChangeText={set('email')}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={editable}
          />
        </Columns>
        <Columns gap={12}>
          <Input
            label={t('channels.website')}
            value={form.website1}
            onChangeText={set('website1')}
            autoCapitalize="none"
            keyboardType="url"
            placeholder="https://"
            editable={editable}
          />
          <Input
            label={t('channels.website2')}
            value={form.website2}
            onChangeText={set('website2')}
            autoCapitalize="none"
            keyboardType="url"
            placeholder="https://"
            editable={editable}
          />
        </Columns>
        <View style={{ gap: 6 }}>
          <Text variant="caption" tone="muted">
            {t('channels.category')}
          </Text>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            {VERTICALS.map((v) => (
              <Chip
                key={v}
                small
                label={t(`channels.vertical.${v}`)}
                selected={form.vertical === v}
                onPress={editable ? () => setForm({ ...form, vertical: v }) : undefined}
              />
            ))}
          </Row>
        </View>
        {editable ? (
          <Button
            title={t('common.save')}
            onPress={() => void save()}
            loading={busy === 'save'}
            full={!desktop}
            style={desktop ? { alignSelf: 'flex-end', minWidth: 160 } : undefined}
          />
        ) : null}
      </Card>
    </Columns>
  );
}

/* --------------------------------- wallet --------------------------------- */

export function WalletTab({ channel }: { channel: Channel }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const canSeeUsage = useCan('CRM.CHANNEL.USAGE.READ');
  const log = useInfiniteQuery({
    queryKey: channelKeys.prop(channel.id, 'wallet'),
    queryFn: ({ pageParam }) => walletLog(channel.id, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, all) => (all.length < last.pages ? all.length + 1 : undefined),
    enabled: canSeeUsage,
  });
  const spend = useQuery({
    queryKey: channelKeys.prop(channel.id, 'spend30'),
    queryFn: () => spendByCategory(channel.id, 30),
    enabled: canSeeUsage,
    retry: false,
  });
  const rows = log.data?.pages.flatMap((p) => p.rows) ?? [];

  return (
    <Columns widths={[340, undefined]}>
      <Stack>
        {walletBalance(channel) != null ? <WalletSummary channel={channel} /> : null}
        {!canSeeUsage ? <EmptyState title={t('channels.noUsageAccess')} /> : null}

        {spend.data?.length ? (
          <Card padded={false}>
            <Text variant="micro" tone="faint" style={styles.cardTitle}>
              {t('channels.last30').toUpperCase()}
            </Text>
            {spend.data.map((g) => (
              <Field key={g.group} label={g.group || t('common.unknown')} value={t('channels.conversations', { count: g.totalRecords })} />
            ))}
          </Card>
        ) : null}
      </Stack>

      {canSeeUsage ? (
        log.isLoading ? (
          <Loading />
        ) : log.isError ? (
          <EmptyState title={t('common.errorTitle')} body={describeCrmError(log.error)} action={t('common.retry')} onAction={() => void log.refetch()} />
        ) : !rows.length ? (
          <EmptyState title={t('channels.noTransactions')} />
        ) : (
          <Card padded={false}>
            <Text variant="micro" tone="faint" style={styles.cardTitle}>
              {t('channels.transactions').toUpperCase()}
            </Text>
            {rows.map((r, i) => {
              const credit = r.type === 'credit';
              return (
                <View key={r.id}>
                  <Row gap={12} style={styles.field}>
                    <View style={[styles.txIcon, { backgroundColor: credit ? colors.successSoft : colors.surfaceAlt }]}>
                      {credit ? <ArrowDownLeft size={16} color={colors.success} /> : <ArrowUpRight size={16} color={colors.textMuted} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong" numberOfLines={2}>
                        {r.note || r.category || (credit ? t('channels.credit') : t('channels.debit'))}
                      </Text>
                      <Text variant="micro" tone="faint">
                        {formatWhen(r.createdAt)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text variant="bodyStrong" tone={credit ? 'success' : 'default'}>
                        {`${credit ? '+' : '−'}${formatMoney(fromLedger(r.amount), r.currency)}`}
                      </Text>
                      <Text variant="micro" tone="faint">
                        {formatMoney(fromLedger(r.endBalance), r.currency)}
                      </Text>
                    </View>
                  </Row>
                  {i < rows.length - 1 ? <Divider inset={58} /> : null}
                </View>
              );
            })}
            {log.hasNextPage ? (
              <View style={{ padding: 12 }}>
                <Button title={t('channels.loadMore')} variant="ghost" onPress={() => void log.fetchNextPage()} loading={log.isFetchingNextPage} full />
              </View>
            ) : null}
          </Card>
        )
      ) : (
        <View />
      )}
    </Columns>
  );
}

/* -------------------------------- activity -------------------------------- */

export function ActivityTab({ channel }: { channel: Channel }) {
  const { t } = useTranslation();
  const canSee = useCan('CRM.CHANNEL.LOG.LIST');
  const log = useInfiniteQuery({
    queryKey: channelKeys.prop(channel.id, 'activity'),
    queryFn: ({ pageParam }) => activityLog(channel.id, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, all) => (all.length < last.pages ? all.length + 1 : undefined),
    enabled: canSee,
  });
  const rows = log.data?.pages.flatMap((p) => p.rows) ?? [];
  if (!canSee) return <EmptyState title={t('channels.noLogAccess')} />;
  if (log.isLoading) return <Loading />;
  if (log.isError)
    return <EmptyState title={t('common.errorTitle')} body={describeCrmError(log.error)} action={t('common.retry')} onAction={() => void log.refetch()} />;
  if (!rows.length) return <EmptyState title={t('channels.noActivity')} />;
  return (
    <Card padded={false}>
      {rows.map((r, i) => (
        <View key={r.id}>
          <View style={[styles.field, { gap: 2 }]}>
            <Text>{r.log.message || r.log.event}</Text>
            <Text variant="micro" tone="faint">
              {[formatWhen(r.createdAt), r.source?.type ? t(`channels.source.${r.source.type}`) : ''].filter(Boolean).join(' · ')}
            </Text>
          </View>
          {i < rows.length - 1 ? <Divider /> : null}
        </View>
      ))}
      {log.hasNextPage ? (
        <View style={{ padding: 12 }}>
          <Button title={t('channels.loadMore')} variant="ghost" onPress={() => void log.fetchNextPage()} loading={log.isFetchingNextPage} full />
        </View>
      ) : null}
    </Card>
  );
}

/* -------------------------------- settings -------------------------------- */

export function SettingsTab({ channel }: { channel: Channel }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const refresh = useRefreshChannels();
  const type = channelType(channel);
  const canUpdate = useCan(channelPermission(type, 'UPDATE'));
  const accountId = useAccountsStore((s) => s.activeId);
  const config = useWhatsAppConfig();
  const setConfig = useWhatsAppStore((s) => s.set);
  const [name, setName] = useState(channelName(channel));
  const [color, setColor] = useState(channel.basic_details?.color_code || CHANNEL_COLORS[0]);
  const [busy, setBusy] = useState<'details' | null>(null);

  const isDefault = type === 'whatsapp' && config.channelId === channel.id;
  const dirty = name.trim() !== channelName(channel) || color !== (channel.basic_details?.color_code || CHANNEL_COLORS[0]);

  const run = async (what: 'details', input: Parameters<typeof updateChannel>[1]) => {
    setBusy(what);
    try {
      await updateChannel(channel.id, input);
      await refresh();
      if (isDefault && input.name && accountId) setConfig(accountId, { channelId: channel.id, channelName: input.name });
    } catch (err) {
      fail(t('common.couldNotSave'))(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Stack>
      <Columns>
        <Stack>
          {canUpdate ? (
            <Card style={{ gap: 12 }}>
              <Input label={t('channels.name')} value={name} onChangeText={setName} maxLength={120} />
              <View style={{ gap: 6 }}>
                <Text variant="caption" tone="muted">
                  {t('channels.color')}
                </Text>
                <Row gap={10} style={{ flexWrap: 'wrap' }}>
                  {CHANNEL_COLORS.map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => setColor(c)}
                      accessibilityRole="radio"
                      accessibilityLabel={c}
                      accessibilityState={{ checked: color === c }}
                      style={[styles.swatch, { backgroundColor: c, borderColor: color === c ? colors.text : 'transparent' }]}
                    />
                  ))}
                </Row>
              </View>
              <Button
                title={t('common.save')}
                onPress={() => void run('details', { name: name.trim(), color })}
                disabled={!dirty || !name.trim()}
                loading={busy === 'details'}
                style={{ alignSelf: 'flex-start', minWidth: 140 }}
              />
            </Card>
          ) : null}
        </Stack>
        <Stack>
          {type === 'whatsapp' ? (
            <Card style={{ gap: 4 }}>
              <Row gap={12}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{t('channels.defaultTitle')}</Text>
                  <Text variant="caption" tone="muted">
                    {t('channels.defaultBody')}
                  </Text>
                </View>
                {/* There is always a default channel (sends need one): pick this one, or see that it is. */}
                {isDefault ? (
                  <Row gap={4}>
                    <Check size={14} color={colors.success} />
                    <Text variant="caption" style={{ color: colors.success, fontWeight: '700' }}>
                      {t('whatsapp.default')}
                    </Text>
                  </Row>
                ) : (
                  <Button
                    title={t('whatsapp.makeDefault')}
                    size="sm"
                    variant="secondary"
                    disabled={!accountId || !channel.active}
                    onPress={() => accountId && setConfig(accountId, { channelId: channel.id, channelName: channelName(channel) })}
                  />
                )}
              </Row>
            </Card>
          ) : null}

        </Stack>
      </Columns>

    </Stack>
  );
}

const styles = StyleSheet.create({
  field: { paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center' },
  cardTitle: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 2 },
  walletIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  txIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 3 },
  warn: { gap: 10, borderWidth: 1.5 },
  inlineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
});
