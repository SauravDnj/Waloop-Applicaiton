/**
 * New WhatsApp campaign.
 *
 * 1. Name, channel and an approved template; each variable maps to a lead
 *    field, a file column or fixed text (header media from the phone).
 * 2. Audience: CRM leads (all or filtered / a segment, or the ones picked on
 *    the leads list), pasted numbers, a CSV or Excel file, or a re-target of
 *    an earlier campaign.
 * 3. Send now, schedule (optionally repeating) or keep it as a draft.
 * A test send to one lead (picked by search) delivers the real message, with
 * that lead's values, before anything goes out; the preview shows it too.
 */
import type { Template } from '@ab-ecosystem/cpaas';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, FileSpreadsheet, Filter, FlaskConical, Hash, Paperclip, Send, Target, UserCheck, UserRound, Users, X } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { LeadPickerSheet } from '@/components/campaigns/LeadPickerSheet';
import { campaignKeys } from '@/components/campaigns/shared';
import { FilterSheet } from '@/components/leads/FilterSheet';
import { Button, Card, Chip, EmptyState, Input, Row, Screen, Text } from '@/components/ui';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { ChannelSelect } from '@/components/whatsapp/ChannelSelect';
import { TemplatePicker } from '@/components/whatsapp/TemplatePicker';
import { TemplatePreview } from '@/components/whatsapp/TemplatePreview';
import { useVariableFields, VariableMapper } from '@/components/whatsapp/VariableMapper';
import { useSegments, useTemplates, useWaChannels } from '@/hooks/queries';
import { confirmAction, showAlert } from '@/lib/dialog';
import { countActiveFilters, type LeadFilter } from '@/lib/filters';
import { MAX_BYTES, pickForFormat } from '@/lib/pickFile';
import { formatPhone } from '@/lib/phone';
import { isOverdue } from '@/lib/time';
import {
  columnKey,
  countLeads,
  createCampaignDraft,
  getCampaign,
  isWebhookUnset,
  listCampaigns,
  mappingComplete,
  previewAudience,
  sendTest,
  triggerCampaign,
  fileRow,
  valuesFor,
  needsFixedValues,
  type CampaignAudience,
  type CampaignDraft,
  type RetargetGroup,
} from '@/services/crm/campaigns';
import { describeCrmError } from '@/services/crm/client';
import type { Lead } from '@/services/crm/leads';
import { parseSheetFile } from '@/services/crm/sheets';
import {
  FIELD_TOKEN,
  parseTemplate,
  pickChannel,
  reusableHeaderUrl,
  senderContext,
  slotsOf,
  uploadSendMedia,
  type MediaFormat,
  type PickedFile,
} from '@/services/crm/whatsapp';
import { useWhatsAppConfig, type VariableSource } from '@/stores/whatsapp';
import { useTheme } from '@/theme/ThemeProvider';
import { RequireCan } from '@/components/RequireCan';
import { P } from '@/lib/permissions';

type AudienceKind = CampaignAudience['kind'];
type SheetData = { fileName: string; headers: string[]; rows: Record<string, string>[] };
type When = 'now' | 'later' | 'draft';
type RepeatKey = 'off' | 'days' | 'weeks' | 'months';

const AUDIENCES: AudienceKind[] = ['leads', 'numbers', 'file', 'retarget'];

/** The contacts filter passed in the route, keeping only the keys (and shapes) a filter has. */
const parseFilter = (raw?: string): LeadFilter => {
  try {
    const f = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
    const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined);
    const fields =
      f.fields && typeof f.fields === 'object'
        ? Object.fromEntries(Object.entries(f.fields as Record<string, unknown>).map(([k, v]) => [k, strings(v) ?? []]))
        : undefined;
    return {
      segment: typeof f.segment === 'string' ? f.segment : undefined,
      tags: strings(f.tags),
      fields,
      createdWithinDays: typeof f.createdWithinDays === 'number' ? f.createdWithinDays : undefined,
      search: typeof f.search === 'string' ? f.search : undefined,
    };
  } catch {
    return {};
  }
};

/** Drops variable sources that read spreadsheet columns the current audience doesn't have. */
const pruneColumns = (mapping: Record<string, VariableSource>, columnCount: number): Record<string, VariableSource> => {
  const ok = (k: string) => !/^col_\d+$/.test(k) || Number(k.slice(4)) < columnCount;
  return Object.fromEntries(
    Object.entries(mapping).filter(([, src]) => (src.kind === 'field' ? ok(src.key) : [...src.value.matchAll(FIELD_TOKEN)].every((m) => ok(m[1])))),
  );
};
const GROUPS: RetargetGroup[] = ['failed', 'unread', 'noReply', 'replied', 'all'];
const REPEATS: RepeatKey[] = ['off', 'days', 'weeks', 'months'];

function NewCampaign() {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ retarget?: string; group?: RetargetGroup; name?: string; filter?: string; leadIds?: string }>();
  const selectedIds = useMemo(() => (params.leadIds ? params.leadIds.split(',').filter(Boolean) : []), [params.leadIds]);
  const config = useWhatsAppConfig();
  const channels = useWaChannels();
  const segments = useSegments();
  const leadFields = useVariableFields();
  const ctx = useMemo(() => senderContext(), []);

  const [name, setName] = useState(params.name ?? '');
  const [channelId, setChannelId] = useState<string | null>(config.channelId);
  // The picked or default channel if it still exists and is active, else the first active one.
  const channel = pickChannel(channels.data, channelId);
  const [template, setTemplate] = useState<Template | null>(null);
  const [mapping, setMapping] = useState<Record<string, VariableSource>>({});
  const [media, setMedia] = useState<PickedFile | null>(null);
  // A template belongs to its channel: if the channel changes under us (the picked one went inactive), start over.
  const [templateOn, setTemplateOn] = useState(channel);
  if (channel !== templateOn) {
    setTemplateOn(channel);
    if (template) {
      setTemplate(null);
      setMapping({});
      setMedia(null);
    }
  }

  const [kind, setKind] = useState<AudienceKind>(selectedIds.length ? 'selected' : params.retarget ? 'retarget' : 'leads');
  const [filter, setFilter] = useState<LeadFilter>(() => parseFilter(params.filter));
  const [filterOpen, setFilterOpen] = useState(false);
  const [numbers, setNumbers] = useState('');
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [column, setColumn] = useState('');
  const [retargetId, setRetargetId] = useState(params.retarget ?? '');
  const [group, setGroup] = useState<RetargetGroup>(params.group ?? 'failed');

  const [when, setWhen] = useState<When>('now');
  const [at, setAt] = useState(() => new Date(Date.now() + 3600_000));
  const [repeat, setRepeat] = useState<RepeatKey>('off');
  const [testLead, setTestLead] = useState<Lead | null>(null);
  const [pickingTest, setPickingTest] = useState(false);
  const [testing, setTesting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const uploaded = useRef<{ uri: string; link: string } | null>(null);

  const parsed = useMemo(() => (template ? parseTemplate(template.components) : null), [template]);
  const slots = useMemo(() => (parsed ? slotsOf(parsed) : []), [parsed]);
  const mediaFormat = parsed && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(parsed.header.format) ? (parsed.header.format as MediaFormat) : null;
  const columns = useMemo(() => (kind === 'file' && sheet ? sheet.headers.map((h, i) => ({ key: columnKey(i), label: h })) : []), [kind, sheet]);
  const labelOf = (k: string) => columns.find((c) => c.key === k)?.label ?? leadFields.find((f) => f.key === k)?.label ?? k;

  const leadCount = useQuery({ queryKey: ['campaigns', 'count', filter], queryFn: () => countLeads(filter), enabled: kind === 'leads' });
  const past = useQuery({ queryKey: ['campaigns', 'retargetable'], queryFn: () => listCampaigns({ status: 'completed' }), enabled: kind === 'retarget' });

  const audience: CampaignAudience | null =
    kind === 'leads'
      ? { kind, filter }
      : kind === 'selected'
        ? { kind, ids: selectedIds }
        : kind === 'numbers'
          ? numbers.trim()
            ? { kind, text: numbers }
            : null
          : kind === 'file'
            ? sheet && column
              ? { kind, ...sheet, column }
              : null
            : retargetId
              ? { kind, campaignId: retargetId, group }
              : null;
  const preview = audience ? previewAudience(audience) : null;
  const count = kind === 'leads' ? leadCount.data : kind === 'selected' ? selectedIds.length : preview?.receivers;
  const sampleRow = kind === 'file' && sheet?.rows[0] ? fileRow(sheet.headers, sheet.rows[0]) : null;
  // With a test lead picked, the preview shows exactly what that lead gets.
  const testValues = template && testLead ? valuesFor(template, mapping, testLead, sampleRow, ctx) : null;

  const pickTemplate = (tpl: Template) => {
    setTemplate(tpl);
    // Every variable starts empty: nothing guessed.
    setMapping({});
    setMedia(null);
    if (!name.trim()) setName(`${tpl.name} · ${new Date().toLocaleDateString()}`);
  };

  // A re-target starts from the original campaign's channel and template; any other can be picked.
  const source = useQuery({ queryKey: campaignKeys.one(params.retarget ?? ''), queryFn: () => getCampaign(params.retarget!), enabled: !!params.retarget });
  const sourceMsg = source.data?.messages[0];
  const sourceTpl = (sourceMsg?.message as { template?: { name?: string; language?: { code?: string } } } | undefined)?.template;
  const sourceChannel = sourceMsg?.channel.id;
  const approved = useTemplates(channel, 'approved');
  const [prefilled, setPrefilled] = useState(!params.retarget);
  // Only a channel that still exists and is active can be reused; otherwise start fresh (and never
  // keep forcing an unusable channel, which re-rendered without end).
  const sourceUsable = !!sourceChannel && !!channels.data && pickChannel(channels.data, sourceChannel) === sourceChannel;
  if (!prefilled && (source.isError || (source.data && (!sourceTpl?.name || (channels.data && !sourceUsable))))) setPrefilled(true);
  if (!prefilled && sourceUsable && channel !== sourceChannel) setChannelId(sourceChannel!);
  if (!prefilled && sourceUsable && channel === sourceChannel && approved.isError) setPrefilled(true);
  if (!prefilled && sourceTpl?.name && channel === sourceChannel && approved.data) {
    setPrefilled(true);
    const match = approved.data.find((x) => x.name === sourceTpl.name && (!sourceTpl.language?.code || x.language === sourceTpl.language.code));
    if (match) pickTemplate(match);
  }

  /** What a slot shows in the preview: fixed text as-is, per-recipient values as `{Field}`. */
  const shown = (key: string) => {
    if (testValues) return testValues[key] || undefined;
    const m = mapping[key];
    if (!m) return undefined;
    return m.kind === 'field' ? `{${labelOf(m.key)}}` : m.value.replace(FIELD_TOKEN, (_: string, k: string) => `{${labelOf(k)}}`);
  };

  const pickMedia = async () => {
    if (!mediaFormat) return;
    const f = await pickForFormat(mediaFormat);
    if (!f) return;
    if (f.size && f.size > MAX_BYTES[mediaFormat])
      return showAlert(t('wa.tooLarge'), t('wa.tooLargeBody', { mb: Math.round(MAX_BYTES[mediaFormat] / 1048576) }));
    setMedia(f);
  };

  const pickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: [
        'text/csv',
        'text/comma-separated-values',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
      ],
      copyToCacheDirectory: true,
    });
    const a = res.canceled ? null : res.assets[0];
    if (!a) return;
    try {
      const s = await parseSheetFile(a.uri, a.name, a.mimeType);
      if (!s.rows.length) return showAlert(t('import.emptyFile'), t('import.noRows'));
      setSheet({ fileName: s.fileName, headers: s.headers, rows: s.rows });
      setMapping((m) => pruneColumns(m, s.headers.length));
      setColumn(s.headers.find((h) => /phone|mobile|number|whatsapp|contact/i.test(h)) ?? s.headers[0] ?? '');
    } catch (err) {
      showAlert(t('camp.fileFailed'), describeCrmError(err));
    }
  };

  // A test send leaves the audience out; the picked media is uploaded once.
  const draftOf = async (forTest = false): Promise<CampaignDraft | null> => {
    if (!channel || !template || (!audience && !forTest)) return null;
    let link = mediaFormat && parsed ? reusableHeaderUrl(parsed) : undefined;
    if (mediaFormat && media) {
      link = uploaded.current?.uri === media.uri ? uploaded.current.link : await uploadSendMedia(mediaFormat, media);
      uploaded.current = { uri: media.uri, link };
    }
    return {
      name: name.trim() || template.name,
      channelId: channel,
      template,
      mapping,
      headerMedia: mediaFormat && link ? { format: mediaFormat, link, filename: media?.name } : undefined,
      audience: audience ?? { kind: 'numbers', text: '' },
      repeat: when === 'later' && repeat !== 'off' ? { every: 1, unit: repeat } : undefined,
    };
  };

  const problem = (): string | null => {
    if (!template) return t('camp.needTemplate');
    if (!mappingComplete(template, mapping)) return t('wa.fillVariables');
    if (mediaFormat && !media && !(parsed && reusableHeaderUrl(parsed))) return t('wa.needMedia');
    if (!audience) return t('camp.needAudience');
    if (kind !== 'retarget' && count === 0) return t('camp.noRecipients');
    if (audience && needsFixedValues({ template, mapping, audience })) return t('camp.numbersNeedFixed');
    // A file has no contacts behind it: its variables come from its columns (or fixed text), not contact fields.
    if (kind === 'file' && Object.values(mapping).some((m) => m.kind === 'field' && !/^col_\d+$/.test(m.key) && m.key !== 'my_name' && m.key !== 'workspace'))
      return t('camp.fileNeedsColumns');
    if (when === 'later' && isOverdue(new Date(at.getTime() - 60_000))) return t('camp.pastTime');
    return null;
  };

  const test = async () => {
    const p = problem();
    if (p && p !== t('camp.needAudience') && p !== t('camp.noRecipients')) return showAlert(p);
    if (!testLead) return setPickingTest(true);
    // WhatsApp refuses empty parameters: name what this contact is missing instead of a provider error.
    const blank = slots.filter((x) => !(testValues?.[x.key] ?? '').trim());
    if (blank.length) return showAlert(t('camp.testMissing'), blank.map((x) => `{{${x.name}}}`).join(', '));
    setTesting(true);
    try {
      const d = await draftOf(true);
      if (d) await sendTest(d, testLead, ctx, sampleRow);
      showAlert(t('camp.testSent'), t('camp.testSentBody', { name: testLead.name || formatPhone(testLead.phone) }));
    } catch (err) {
      showAlert(t('camp.testFailed'), describeCrmError(err));
    } finally {
      setTesting(false);
    }
  };

  const submit = async () => {
    const p = problem();
    if (p) return showAlert(p);
    // Contacts are counted before numbers are checked: some are skipped (no number, repeats, missing values).
    const estimate = kind === 'leads' || kind === 'selected';
    const recipients =
      kind === 'retarget'
        ? t('camp.retargetCount', { group: t(`camp.group.${group}`) })
        : estimate
          ? `${t('camp.upTo', { count: count ?? 0 })}\n${t('camp.upToNote')}`
          : t('camp.recipients', { count: count ?? 0 });
    const ok = await confirmAction({
      title: when === 'draft' ? t('camp.confirmDraft') : when === 'later' ? t('camp.confirmSchedule') : t('camp.confirmSend'),
      message: when === 'later' ? `${recipients} · ${at.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : recipients,
      confirmText: when === 'draft' ? t('camp.saveDraft') : when === 'later' ? t('camp.schedule') : t('camp.sendNow'),
      cancelText: t('common.cancel'),
    });
    if (!ok) return;
    setBusy(t('camp.preparing'));
    try {
      const d = await draftOf();
      if (!d) return;
      const res = await createCampaignDraft(d, ctx, (n) => setBusy(t('camp.loadingLeads', { count: n })));
      let warn: string | null = null;
      if (when !== 'draft') {
        setBusy(t('camp.arming'));
        try {
          await triggerCampaign(res.campaign.id, when === 'later' ? at : undefined);
        } catch (err) {
          warn = isWebhookUnset(err) ? t('camp.webhookUnset') : describeCrmError(err);
        }
      }
      void qc.invalidateQueries({ queryKey: campaignKeys.all });
      const extra =
        (res.skipped || res.duplicates ? `\n${t('camp.dropped', { skipped: res.skipped, duplicates: res.duplicates })}` : '') +
        (res.incomplete ? `\n${t('camp.incomplete', { count: res.incomplete })}` : '');
      if (warn) showAlert(t('camp.savedNotSent'), warn + extra);
      else
        showAlert(
          when === 'draft' ? t('camp.draftSaved') : when === 'later' ? t('camp.scheduled') : t('camp.sending'),
          (res.receivers ? t('camp.recipients', { count: res.receivers }) : '') + extra,
        );
      router.replace({ pathname: '/(app)/campaigns/[id]', params: { id: res.campaign.id } });
    } catch (err) {
      const code = (err as Error)?.message;
      showAlert(
        t('camp.createFailed'),
        code === 'noRecipients'
          ? t('camp.noRecipients')
          : code === 'allIncomplete'
            ? t('camp.allIncomplete')
            : code === 'numbersNeedFixed'
              ? t('camp.numbersNeedFixed')
              : code === 'fixedEmpty'
                ? t('camp.fixedEmpty')
                : describeCrmError(err),
      );
    } finally {
      setBusy(null);
    }
  };

  // Each step ticks off once it is complete; the footer names what is still missing.
  const step1 = !!template && !!name.trim();
  const step2 = !!template && mappingComplete(template, mapping) && !(mediaFormat && !media && !(parsed && reusableHeaderUrl(parsed)));
  const step3 = !!audience && (kind === 'retarget' || (count ?? 0) > 0);
  const step4 = !(when === 'later' && isOverdue(new Date(at.getTime() - 60_000)));
  const blocker = template ? problem() : null;

  if (!channels.isLoading && !channel) {
    return (
      <Screen title={t('camp.new')} back>
        {channels.isError ? (
          <EmptyState
            title={t('common.errorTitle')}
            body={describeCrmError(channels.error)}
            action={t('common.retry')}
            onAction={() => void channels.refetch()}
          />
        ) : (
          <EmptyState
            icon={<Send size={26} color="#fff" />}
            title={t('camp.needChannel')}
            body={t('camp.needChannelBody')}
            action={t('channels.title')}
            onAction={() => router.replace('/(app)/channels')}
          />
        )}
      </Screen>
    );
  }

  return (
    <Screen
      title={t('camp.new')}
      back
      scroll
      footer={
        <View style={{ gap: 8 }}>
          {/* What will happen, in one line, right above the button that does it. */}
          <Row gap={6} style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
            <Text variant="caption" tone={blocker ? 'warning' : 'muted'} numberOfLines={1} center>
              {blocker ??
                [
                  template?.name,
                  kind === 'retarget' ? t(`camp.group.${group}`) : count != null ? t(kind === 'leads' || kind === 'selected' ? 'camp.upTo' : 'camp.recipients', { count }) : null,
                  when === 'later' ? at.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : t(`camp.when.${when}`),
                ]
                  .filter(Boolean)
                  .join(' · ')}
            </Text>
          </Row>
          <Button
            title={busy ?? (when === 'draft' ? t('camp.saveDraft') : when === 'later' ? t('camp.schedule') : t('camp.sendNow'))}
            icon={<Send size={18} color="#fff" />}
            loading={!!busy}
            disabled={!!busy}
            onPress={() => void submit()}
          />
        </View>
      }
    >
      <View style={{ gap: 14, marginTop: 8, paddingBottom: 24 }}>
        <Step n={1} title={t('camp.stepMessage')} done={step1}>
          <Input label={t('camp.name')} value={name} onChangeText={setName} placeholder={t('camp.namePh')} />
          {(channels.data?.length ?? 0) > 1 ? (
            <ChannelSelect
              label={t('wa.sendFrom')}
              channels={channels.data!}
              value={channel}
              onChange={(id) => {
                setChannelId(id);
                setTemplate(null);
                setMapping({});
              }}
            />
          ) : null}
          <TemplatePicker label={t('camp.template')} channelId={channel} value={template?.id ?? ''} onPick={pickTemplate} />
          {params.retarget ? (
            <Text variant="caption" tone="muted">
              {t('camp.retargetMsgHint')}
            </Text>
          ) : null}
        </Step>

        {parsed ? (
          <Step n={2} title={t('camp.stepPersonalise')} done={step2}>
            <TemplatePreview
              template={parsed}
              values={(n) => shown(`body:${n}`)}
              headerValues={(n) => shown(`header:${n}`)}
              mediaUri={media?.uri}
              mediaName={media?.name}
            />
            {mediaFormat ? (
              <View style={{ gap: 8 }}>
                <Text variant="bodyStrong">{t('wa.headerMedia')}</Text>
                <Pressable
                  onPress={() => void pickMedia()}
                  style={[styles.drop, { borderColor: media ? colors.success : colors.borderStrong, borderRadius: radius.md }]}
                >
                  <Paperclip size={20} color={media ? colors.success : colors.primary} />
                  <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                    {media ? media.name : t('wa.pickMedia', { kind: t(`wa.headerType.${mediaFormat}`).toLowerCase() })}
                  </Text>
                </Pressable>
              </View>
            ) : null}
            {slots.length ? (
              <View style={{ gap: 8 }}>
                <Text variant="bodyStrong">{t('wa.variables')}</Text>
                <Text variant="caption" tone="muted">
                  {kind === 'file' ? t('camp.varsFile') : kind === 'leads' || kind === 'selected' ? t('camp.varsLeads') : t('camp.varsFixed')}
                </Text>
                <VariableMapper slots={slots} mapping={mapping} onChange={setMapping} extraFields={columns} />
              </View>
            ) : null}
          </Step>
        ) : null}

        <Step n={parsed ? 3 : 2} title={t('camp.audience')} done={step3}>
          {/* Who gets it: a tile per kind of audience, each saying what it is. */}
          <View style={styles.audiences}>
            {(selectedIds.length ? (['selected', ...AUDIENCES] as AudienceKind[]) : AUDIENCES).map((a) => {
              const Icon = AUDIENCE_ICON[a];
              const on = kind === a;
              return (
                <Pressable
                  key={a}
                  onPress={() => {
                    setKind(a);
                    setMapping((m) => pruneColumns(m, a === 'file' ? (sheet?.headers.length ?? 0) : 0));
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  style={[
                    styles.audience,
                    { borderRadius: radius.md, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primarySoft : colors.surface },
                  ]}
                >
                  <Icon size={18} color={on ? colors.primary : colors.textMuted} />
                  <Text variant="bodyStrong" style={{ color: on ? colors.primary : colors.text }} numberOfLines={1}>
                    {t(`camp.aud.${a}`)}
                  </Text>
                  <Text variant="micro" tone="muted" numberOfLines={2} style={{ letterSpacing: 0 }}>
                    {t(`camp.audHint.${a}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {kind === 'selected' ? (
            <Text tone="primary" variant="bodyStrong">
              {t('camp.recipients', { count: selectedIds.length })}
            </Text>
          ) : null}

          {kind === 'leads' ? (
            <View style={{ gap: 8 }}>
              <Pressable
                onPress={() => setFilterOpen(true)}
                style={[styles.drop, { borderColor: colors.border, borderRadius: radius.md, borderStyle: 'solid' }]}
              >
                <Filter size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">
                    {filter.segment
                      ? (segments.data?.find((s) => s.id === filter.segment)?.name ?? filter.segment)
                      : countActiveFilters(filter)
                        ? t('filter.active', { count: countActiveFilters(filter) })
                        : t('camp.allLeads')}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {t('camp.filterHint')}
                  </Text>
                </View>
              </Pressable>
              {leadCount.isFetching ? <ActivityIndicator color={colors.primary} /> : null}
              {count != null && !leadCount.isFetching ? (
                <Text tone="primary" variant="bodyStrong">
                  {t('camp.upTo', { count })}
                </Text>
              ) : null}
              <Text variant="caption" tone="faint">
                {t('camp.leadsNote')}
              </Text>
            </View>
          ) : null}

          {kind === 'numbers' ? (
            <View style={{ gap: 6 }}>
              <Input
                value={numbers}
                onChangeText={setNumbers}
                placeholder={t('camp.numbersPh')}
                multiline
                style={{ minHeight: 110, textAlignVertical: 'top' }}
                keyboardType="phone-pad"
              />
              {preview ? (
                <Text tone="primary" variant="bodyStrong">
                  {t('camp.recipients', { count: preview.receivers })}
                </Text>
              ) : null}
              {preview && (preview.skipped || preview.duplicates) ? (
                <Text variant="caption" tone="muted">
                  {t('camp.dropped', { skipped: preview.skipped, duplicates: preview.duplicates })}
                </Text>
              ) : null}
            </View>
          ) : null}

          {kind === 'file' ? (
            <View style={{ gap: 10 }}>
              <Pressable
                onPress={() => void pickFile()}
                style={[styles.drop, { borderColor: sheet ? colors.success : colors.borderStrong, borderRadius: radius.md }]}
              >
                <FileSpreadsheet size={20} color={sheet ? colors.success : colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {sheet ? sheet.fileName : t('camp.pickFile')}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {sheet ? t('camp.fileRows', { count: sheet.rows.length, cols: sheet.headers.length }) : t('camp.fileHint')}
                  </Text>
                </View>
              </Pressable>
              {sheet ? (
                <>
                  <Text variant="caption" tone="muted">
                    {t('camp.numberColumn')}
                  </Text>
                  <Row gap={6} style={{ flexWrap: 'wrap' }}>
                    {sheet.headers.map((h) => (
                      <Chip key={h} small label={h} selected={column === h} onPress={() => setColumn(h)} />
                    ))}
                  </Row>
                  {preview ? (
                    <Text tone="primary" variant="bodyStrong">
                      {t('camp.recipients', { count: preview.receivers })}
                    </Text>
                  ) : null}
                  {preview && (preview.skipped || preview.duplicates) ? (
                    <Text variant="caption" tone="muted">
                      {t('camp.dropped', { skipped: preview.skipped, duplicates: preview.duplicates })}
                    </Text>
                  ) : null}
                </>
              ) : null}
            </View>
          ) : null}

          {kind === 'retarget' ? (
            <View style={{ gap: 10 }}>
              <Text variant="caption" tone="muted">
                {t('camp.retargetFrom')}
              </Text>
              {past.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
              {!past.isLoading && !past.data?.data.length ? (
                <Text variant="caption" tone="faint">
                  {t('camp.noPast')}
                </Text>
              ) : null}
              <Row gap={6} style={{ flexWrap: 'wrap' }}>
                {(past.data?.data ?? []).map((c) => (
                  <Chip key={c.id} small label={c.name} selected={retargetId === c.id} onPress={() => setRetargetId(c.id)} />
                ))}
                {retargetId && !past.data?.data.some((c) => c.id === retargetId) ? (
                  <Chip small label={t('camp.thisCampaign')} selected onPress={() => {}} />
                ) : null}
              </Row>
              <Text variant="caption" tone="muted">
                {t('camp.sendTo')}
              </Text>
              <Row gap={6} style={{ flexWrap: 'wrap' }}>
                {GROUPS.map((g) => (
                  <Chip key={g} small label={t(`camp.group.${g}`)} selected={group === g} onPress={() => setGroup(g)} />
                ))}
              </Row>
            </View>
          ) : null}
        </Step>

        <Step n={parsed ? 4 : 3} title={t('wa.when')} done={step4}>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            {(['now', 'later', 'draft'] as When[]).map((w) => (
              <Chip key={w} label={t(`camp.when.${w}`)} selected={when === w} onPress={() => setWhen(w)} />
            ))}
          </Row>
          {when === 'now' ? (
            <Text variant="caption" tone="muted">
              {t('camp.nowHint')}
            </Text>
          ) : null}
          {when === 'later' ? (
            <View style={{ gap: 10 }}>
              <DateTimeField
                label={at.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                value={at}
                onChange={setAt}
                minimumDate={new Date()}
                selected
              />
              <Text variant="caption" tone="muted">
                {t('camp.repeat')}
              </Text>
              <Row gap={6} style={{ flexWrap: 'wrap' }}>
                {REPEATS.map((r) => (
                  <Chip key={r} small label={t(`camp.rep.${r}`)} selected={repeat === r} onPress={() => setRepeat(r)} />
                ))}
              </Row>
            </View>
          ) : null}
          {when === 'draft' ? (
            <Text variant="caption" tone="muted">
              {t('camp.draftHint')}
            </Text>
          ) : null}
        </Step>

        {template ? (
          <Step n={5} title={t('camp.test')} optional icon={<FlaskConical size={14} color={colors.textMuted} />}>
            <Text variant="caption" tone="muted">
              {t('camp.testHint')}
            </Text>
            <Pressable
              onPress={() => setPickingTest(true)}
              style={[styles.drop, { borderColor: testLead ? colors.success : colors.border, borderRadius: radius.md, borderStyle: 'solid' }]}
            >
              <UserRound size={18} color={testLead ? colors.success : colors.primary} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {testLead ? testLead.name || formatPhone(testLead.phone) : t('camp.pickTestLead')}
                </Text>
                <Text variant="caption" tone="muted">
                  {testLead ? `${formatPhone(testLead.phone)} · ${t('camp.previewFor')}` : t('camp.pickTestLeadHint')}
                </Text>
              </View>
              {testLead ? (
                <Pressable onPress={() => setTestLead(null)} hitSlop={10}>
                  <X size={16} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </Pressable>
            <Button variant="secondary" size="sm" title={t('camp.sendTest')} disabled={!testLead} loading={testing} onPress={() => void test()} />
          </Step>
        ) : null}
      </View>

      {pickingTest ? (
        <LeadPickerSheet
          title={t('camp.pickTestLead')}
          onClose={() => setPickingTest(false)}
          onPick={(l) => {
            setTestLead(l);
            setPickingTest(false);
          }}
        />
      ) : null}
      <FilterSheet
        open={filterOpen}
        value={filter}
        title={t('camp.audience')}
        onClose={() => setFilterOpen(false)}
        onApply={(f) => {
          setFilter(f);
          setFilterOpen(false);
        }}
      />
    </Screen>
  );
}

/** One numbered step of the form; its number turns into a tick when it is complete. */
function Step({
  n,
  title,
  done,
  optional,
  icon,
  children,
}: {
  n: number;
  title: string;
  done?: boolean;
  optional?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Card style={{ gap: 12 }}>
      <Row gap={10}>
        <View style={[styles.stepBadge, { backgroundColor: done ? colors.success : colors.primarySoft }]}>
          {done ? (
            <Check size={14} color="#fff" strokeWidth={3} />
          ) : (
            <Text variant="caption" style={{ color: colors.primary, fontWeight: '800' }}>
              {n}
            </Text>
          )}
        </View>
        <Text variant="h3" style={{ flex: 1 }}>
          {title}
        </Text>
        {icon}
        {optional ? (
          <Text variant="micro" tone="faint">
            {t('camp.optional')}
          </Text>
        ) : null}
      </Row>
      {children}
    </Card>
  );
}

const AUDIENCE_ICON: Record<AudienceKind, typeof Users> = {
  leads: Users,
  selected: UserCheck,
  numbers: Hash,
  file: FileSpreadsheet,
  retarget: Target,
};

const styles = StyleSheet.create({
  drop: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1.5, borderStyle: 'dashed' },
  stepBadge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  audiences: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  audience: { flexBasis: '47%', flexGrow: 1, gap: 4, padding: 12, borderWidth: 1.5 },
});

/** Members whose role can't open this page get a short explanation instead. */
export default function NewCampaignGate() {
  return (
    <RequireCan any={[P.campaigns.create]}>
      <NewCampaign />
    </RequireCan>
  );
}
