/**
 * Template builder: header (text or media with a sample uploaded to Meta),
 * body with variables and formatting, footer, buttons, and a live WhatsApp
 * preview. Saves as a draft or submits straight to Meta for approval.
 */
import type { TemplateCategory } from '@ab-ecosystem/cpaas';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/nav';
import { Bold, Braces, ExternalLink, Italic, Paperclip, Phone, Plus, Reply, Trash2 } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View, type TextInputSelectionChangeEvent } from 'react-native';

import { TemplatePreview } from '@/components/whatsapp/TemplatePreview';
import { Button, Card, Chip, Input, Row, Screen, Text } from '@/components/ui';
import { showAlert } from '@/lib/dialog';
import { MAX_BYTES, pickForFormat } from '@/lib/pickFile';
import { describeCrmError } from '@/services/crm/client';
import {
  createTemplate,
  templateName,
  uploadHeaderSample,
  variablesIn,
  type HeaderFormat,
  type MediaFormat,
  type ParsedTemplate,
  type PickedFile,
  type TemplateButton,
} from '@/services/crm/whatsapp';
import { useTheme } from '@/theme/ThemeProvider';

const CATEGORIES: TemplateCategory[] = ['MARKETING', 'UTILITY', 'AUTHENTICATION'];
const LANGUAGES = ['en', 'en_US', 'hi', 'mr', 'gu', 'ta', 'te', 'ur'];
const HEADERS: HeaderFormat[] = ['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'];
const BODY_MAX = 1024;

export default function TemplateNew() {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const qc = useQueryClient();
  const { channelId } = useLocalSearchParams<{ channelId: string }>();

  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<TemplateCategory>('MARKETING');
  const [language, setLanguage] = useState('en');
  const [headerFormat, setHeaderFormat] = useState<HeaderFormat>('NONE');
  const [headerText, setHeaderText] = useState('');
  const [headerSample, setHeaderSample] = useState('');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [handle, setHandle] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [body, setBody] = useState('');
  const [samples, setSamples] = useState<Record<string, string>>({});
  const [footer, setFooter] = useState('');
  const [buttons, setButtons] = useState<TemplateButton[]>([]);
  const [saving, setSaving] = useState<'draft' | 'submit' | null>(null);
  const selection = useRef({ start: 0, end: 0 });

  const vars = variablesIn(body);
  const slug = templateName(label);
  const parsed: ParsedTemplate = useMemo(
    () => ({ header: { format: headerFormat, text: headerText }, body, footer, buttons }),
    [headerFormat, headerText, body, footer, buttons],
  );

  const wrapSelection = (left: string, right = left) => {
    const { start, end } = selection.current;
    setBody(body.slice(0, start) + left + body.slice(start, end) + right + body.slice(end));
  };
  const addVariable = () => {
    const named = vars.some((v) => !/^\d+$/.test(v));
    const next = named ? `var_${vars.length + 1}` : String(vars.filter((v) => /^\d+$/.test(v)).length + 1);
    const { start } = selection.current;
    setBody(body.slice(0, start) + `{{${next}}}` + body.slice(start));
  };

  const pickMedia = async () => {
    if (headerFormat === 'NONE' || headerFormat === 'TEXT') return;
    const f = await pickForFormat(headerFormat as MediaFormat);
    if (!f) return;
    if (f.size && f.size > MAX_BYTES[headerFormat as MediaFormat]) {
      showAlert(t('wa.tooLarge'), t('wa.tooLargeBody', { mb: Math.round(MAX_BYTES[headerFormat as MediaFormat] / 1048576) }));
      return;
    }
    setFile(f);
    setHandle(null);
    setUploading(true);
    try {
      setHandle(await uploadHeaderSample(channelId, f));
    } catch (err) {
      showAlert(t('wa.uploadFailed'), describeCrmError(err));
    } finally {
      setUploading(false);
    }
  };

  const validate = (submit: boolean): string | null => {
    if (!slug) return t('wa.needName');
    if (!body.trim()) return t('wa.needBody');
    if (body.length > BODY_MAX) return t('wa.bodyTooLong', { max: BODY_MAX });
    if (headerFormat === 'TEXT' && !headerText.trim()) return t('wa.needHeaderText');
    if (submit && headerFormat !== 'NONE' && headerFormat !== 'TEXT' && !handle) return t('wa.needSample');
    if (submit && vars.some((v) => !samples[v]?.trim())) return t('wa.needSamples');
    if (buttons.some((b) => !b.text.trim() || (b.type === 'URL' && !b.url.trim()) || (b.type === 'PHONE_NUMBER' && !b.phone.trim())))
      return t('wa.needButtons');
    return null;
  };

  const save = async (submit: boolean) => {
    const problem = validate(submit);
    if (problem) return showAlert(t('wa.checkTemplate'), problem);
    setSaving(submit ? 'submit' : 'draft');
    try {
      const tpl = await createTemplate(channelId, {
        name: slug,
        category,
        language,
        header: { format: headerFormat, text: headerText, sample: headerSample, handle: handle ?? undefined },
        body,
        bodySamples: samples,
        footer,
        buttons,
        submit,
      });
      await qc.invalidateQueries({ queryKey: ['wa', 'templates', channelId] });
      showAlert(submit ? t('wa.submitted') : t('wa.draftSaved'), submit ? t('wa.submittedBody', { name: tpl.name }) : undefined);
      goBack();
    } catch (err) {
      showAlert(t('wa.createFailed'), describeCrmError(err));
    } finally {
      setSaving(null);
    }
  };

  const addButton = (type: TemplateButton['type']) => {
    if (buttons.length >= 10) return;
    setButtons([
      ...buttons,
      type === 'URL' ? { type, text: '', url: 'https://' } : type === 'PHONE_NUMBER' ? { type, text: '', phone: '' } : { type, text: '' },
    ]);
  };
  const patchButton = (i: number, patch: Partial<TemplateButton>) => setButtons(buttons.map((b, j) => (j === i ? ({ ...b, ...patch } as TemplateButton) : b)));
  const urlCount = buttons.filter((b) => b.type === 'URL').length;
  const phoneCount = buttons.filter((b) => b.type === 'PHONE_NUMBER').length;

  return (
    <Screen
      title={t('whatsapp.newTemplate')}
      back
      scroll
      footer={
        <Row gap={10}>
          <Button
            title={t('wa.saveDraft')}
            variant="secondary"
            loading={saving === 'draft'}
            disabled={!!saving}
            onPress={() => void save(false)}
            style={{ flex: 1 }}
          />
          <Button title={t('wa.submit')} loading={saving === 'submit'} disabled={!!saving} onPress={() => void save(true)} style={{ flex: 1.3 }} />
        </Row>
      }
    >
      <View style={{ gap: 14, marginTop: 8, paddingBottom: 24 }}>
        <Card style={{ gap: 12 }}>
          <Input label={t('wa.name')} value={label} onChangeText={setLabel} placeholder={t('wa.namePh')} autoCapitalize="none" />
          {slug ? (
            <Text variant="caption" tone="muted">
              {t('wa.savedAs')} <Text style={{ fontWeight: '700' }}>{slug}</Text>
            </Text>
          ) : null}
          <Field label={t('wa.category')}>
            {CATEGORIES.map((c) => (
              <Chip key={c} small label={t(`whatsapp.category.${c}`)} selected={category === c} onPress={() => setCategory(c)} />
            ))}
          </Field>
          <Field label={t('wa.language')}>
            {LANGUAGES.map((l) => (
              <Chip key={l} small label={l} selected={language === l} onPress={() => setLanguage(l)} />
            ))}
          </Field>
        </Card>

        <Card style={{ gap: 12 }}>
          <Text variant="h3">{t('wa.header')}</Text>
          <Field>
            {HEADERS.map((h) => (
              <Chip
                key={h}
                small
                label={t(`wa.headerType.${h}`)}
                selected={headerFormat === h}
                onPress={() => {
                  setHeaderFormat(h);
                  setFile(null);
                  setHandle(null);
                }}
              />
            ))}
          </Field>
          {headerFormat === 'TEXT' ? (
            <>
              <Input value={headerText} onChangeText={(v) => setHeaderText(v.slice(0, 60))} placeholder={t('wa.headerPh')} hint={`${headerText.length}/60`} />
              {variablesIn(headerText).length ? (
                <Input label={t('wa.sampleFor', { name: variablesIn(headerText)[0] })} value={headerSample} onChangeText={setHeaderSample} />
              ) : null}
            </>
          ) : null}
          {headerFormat !== 'NONE' && headerFormat !== 'TEXT' ? (
            <Pressable
              onPress={() => void pickMedia()}
              style={[styles.drop, { borderColor: handle ? colors.success : colors.borderStrong, borderRadius: radius.md }]}
            >
              {uploading ? <ActivityIndicator color={colors.primary} /> : <Paperclip size={20} color={handle ? colors.success : colors.primary} />}
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {file ? file.name : t('wa.pickSample', { kind: t(`wa.headerType.${headerFormat}`).toLowerCase() })}
                </Text>
                <Text variant="caption" tone={handle ? 'success' : 'muted'}>
                  {uploading ? t('wa.uploading') : handle ? t('wa.sampleReady') : headerFormat === 'DOCUMENT' ? t('wa.fromFiles') : t('wa.fromGallery')}
                </Text>
              </View>
            </Pressable>
          ) : null}
        </Card>

        <Card style={{ gap: 10 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="h3">{t('wa.body')}</Text>
            <Text variant="caption" tone={body.length > BODY_MAX ? 'danger' : 'faint'}>
              {body.length}/{BODY_MAX}
            </Text>
          </Row>
          <Row gap={8}>
            <ToolBtn onPress={() => wrapSelection('*')} icon={<Bold size={16} color={colors.text} />} />
            <ToolBtn onPress={() => wrapSelection('_')} icon={<Italic size={16} color={colors.text} />} />
            <Pressable onPress={addVariable} style={[styles.varBtn, { backgroundColor: colors.primarySoft, borderRadius: radius.sm }]}>
              <Braces size={15} color={colors.primary} />
              <Text variant="caption" style={{ color: colors.primary, fontWeight: '700' }}>
                {t('wa.addVariable')}
              </Text>
            </Pressable>
          </Row>
          <TextInput
            value={body}
            onChangeText={setBody}
            onSelectionChange={(e: TextInputSelectionChangeEvent) => {
              selection.current = e.nativeEvent.selection;
            }}
            multiline
            placeholder={t('wa.bodyPh')}
            placeholderTextColor={colors.textFaint}
            style={[styles.body, { color: colors.text, backgroundColor: colors.surfaceAlt, borderRadius: radius.md }]}
            textAlignVertical="top"
          />
          {vars.length ? (
            <View style={{ gap: 8 }}>
              <Text variant="caption" tone="muted">
                {t('wa.samplesHint')}
              </Text>
              {vars.map((v) => (
                <Input key={v} label={t('wa.sampleFor', { name: v })} value={samples[v] ?? ''} onChangeText={(x) => setSamples({ ...samples, [v]: x })} />
              ))}
            </View>
          ) : null}
        </Card>

        <Card style={{ gap: 10 }}>
          <Text variant="h3">{t('wa.footer')}</Text>
          <Input value={footer} onChangeText={(v) => setFooter(v.slice(0, 60))} placeholder={t('wa.footerPh')} hint={`${footer.length}/60`} />
        </Card>

        <Card style={{ gap: 10 }}>
          <Text variant="h3">{t('wa.buttons')}</Text>
          {buttons.map((b, i) => (
            <View key={i} style={[styles.btnEdit, { borderColor: colors.border, borderRadius: radius.md }]}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Row gap={6}>
                  {b.type === 'URL' ? (
                    <ExternalLink size={14} color={colors.textMuted} />
                  ) : b.type === 'PHONE_NUMBER' ? (
                    <Phone size={14} color={colors.textMuted} />
                  ) : (
                    <Reply size={14} color={colors.textMuted} />
                  )}
                  <Text variant="caption" tone="muted">
                    {t(`wa.button.${b.type}`)}
                  </Text>
                </Row>
                <Pressable onPress={() => setButtons(buttons.filter((_, j) => j !== i))} hitSlop={8}>
                  <Trash2 size={16} color={colors.danger} />
                </Pressable>
              </Row>
              <Input value={b.text} onChangeText={(v) => patchButton(i, { text: v.slice(0, 25) })} placeholder={t('wa.buttonText')} />
              {b.type === 'URL' ? (
                <Input
                  value={b.url}
                  onChangeText={(v) => patchButton(i, { url: v })}
                  placeholder="https://example.com/{{1}}"
                  autoCapitalize="none"
                  keyboardType="url"
                />
              ) : null}
              {b.type === 'PHONE_NUMBER' ? (
                <Input value={b.phone} onChangeText={(v) => patchButton(i, { phone: v })} placeholder="+91…" keyboardType="phone-pad" />
              ) : null}
            </View>
          ))}
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            <Chip small icon={<Plus size={12} color={colors.textMuted} />} label={t('wa.button.QUICK_REPLY')} onPress={() => addButton('QUICK_REPLY')} />
            {urlCount < 2 ? (
              <Chip small icon={<Plus size={12} color={colors.textMuted} />} label={t('wa.button.URL')} onPress={() => addButton('URL')} />
            ) : null}
            {phoneCount < 1 ? (
              <Chip small icon={<Plus size={12} color={colors.textMuted} />} label={t('wa.button.PHONE_NUMBER')} onPress={() => addButton('PHONE_NUMBER')} />
            ) : null}
          </Row>
        </Card>

        <Text variant="micro" tone="faint" style={{ marginStart: 4 }}>
          {t('wa.preview').toUpperCase()}
        </Text>
        <TemplatePreview
          template={parsed}
          values={(n) => samples[n]}
          headerValues={() => headerSample || undefined}
          mediaUri={file?.uri}
          mediaName={file?.name}
        />
        <Text variant="caption" tone="faint" center>
          {t('wa.reviewNote')}
        </Text>
      </View>
    </Screen>
  );
}

function Field({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text variant="caption" tone="muted">
          {label}
        </Text>
      ) : null}
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        {children}
      </Row>
    </View>
  );
}

function ToolBtn({ icon, onPress }: { icon: React.ReactNode; onPress: () => void }) {
  const { colors, radius } = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.tool, { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm }]}>
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  drop: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1.5, borderStyle: 'dashed' },
  body: { minHeight: 140, padding: 12, fontSize: 15, lineHeight: 21 },
  tool: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  varBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 36 },
  btnEdit: { gap: 8, padding: 10, borderWidth: 1 },
});
