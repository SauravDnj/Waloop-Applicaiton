/**
 * Message composer for a WhatsApp thread: text, attachments (several photos,
 * videos and documents at once, each with its own caption), voice notes, and
 * replying to a message. Files WhatsApp would refuse are rejected when picked,
 * with the reason; unsupported image formats are converted to JPEG first.
 */
import type { Chat } from '@ab-ecosystem/cpaas';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { Image } from 'expo-image';
import { CalendarClock, Camera, FileText, LayoutTemplate, Images, Mic, Paperclip, Send, Sticker, Trash2, Video as VideoIcon, X } from 'lucide-react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button, Sheet, Text } from '@/components/ui';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { pickCamera, pickFiles, pickGallery, prepareAll, type Prepared, type Rejected } from '@/services/inbox/media';
import { previewText } from '@/services/inbox/render';
import { describeCrmError } from '@/services/crm/client';
import { senderContext } from '@/services/crm/whatsapp';
import { identifierOf, scheduleSession, sendContents, sendFiles, sendSticker, sendText, sendVoice } from '@/services/inbox/send';
import { StickerSheet } from '@/components/inbox/StickerSheet';
import { getLead, type Lead } from '@/services/crm/leads';
import { applySlash, QuickReplySuggest } from '@/components/QuickReplySuggest';
import { useLead } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { confirmAction, showAlert } from '@/lib/dialog';
import { replyContents, replyText } from '@/services/crm/quickReplies';
import type { ChatMessage } from '@/services/inbox/store';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';

const VOICE_OPTIONS = { ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64000 };

export function Composer({
  acct,
  chat,
  channel,
  replyTo,
  onClearReply,
  disabled,
}: {
  acct: string;
  chat: Chat;
  channel: string;
  replyTo: ChatMessage | null;
  onClearReply: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const [text, setText] = useState('');
  const [menu, setMenu] = useState(false);
  const [stickers, setStickers] = useState(false);
  const [tray, setTray] = useState<Prepared[] | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [scheduling, setScheduling] = useState<'text' | 'files' | null>(null);
  const lead = useLead(chat.id);
  // Values for {{first_name}} etc.: the lead (fetched now if still loading), else the chat's own name.
  const leadForFill = async (): Promise<Lead> =>
    lead.data ??
    (await getLead(chat.id).catch(() => null)) ??
    ({
      id: chat.id,
      firstName: chat.name?.first_name ?? '',
      lastName: chat.name?.last_name ?? '',
      name: [chat.name?.first_name, chat.name?.last_name].filter(Boolean).join(' '),
      phone: identifierOf(chat),
    } as Lead);
  const recorder = useAudioRecorder(VOICE_OPTIONS);
  const rec = useAudioRecorderState(recorder, 250);

  const explain = (rejected: Rejected[]) => {
    if (!rejected.length) return;
    showAlert(
      t('inbox.cannotSend'),
      rejected
        .map(
          (r) =>
            `• ${r.name}: ${r.reason === 'tooLarge' ? t('inbox.tooLarge', { kind: t(`inbox.kind.${r.kind}`), mb: r.limitMb }) : t('inbox.badFormat', { kind: t(`inbox.kind.${r.kind}`) })}`,
        )
        .join('\n'),
    );
  };

  const pick = async (source: 'gallery' | 'camera' | 'files') => {
    setMenu(false);
    const files = source === 'gallery' ? await pickGallery() : source === 'camera' ? await pickCamera() : await pickFiles();
    if (!files.length) return;
    setPreparing(true);
    try {
      const { accepted, rejected } = await prepareAll(files);
      explain(rejected);
      if (accepted.length) setTray((cur) => [...(cur ?? []), ...accepted].slice(0, 10));
    } finally {
      setPreparing(false);
    }
  };

  const sendNowText = () => {
    const v = text.trim();
    if (!v) return;
    setText('');
    onClearReply();
    // Not connected (offline, signed out): put the text back so nothing typed is lost.
    sendText(acct, chat, channel, v, replyTo ?? undefined).catch((e: unknown) => {
      setText(v);
      showAlert(t('inbox.actionFailed'), describeCrmError(e));
    });
  };

  const sendTray = () => {
    const files = tray ?? [];
    setTray(null);
    onClearReply();
    sendFiles(acct, chat, channel, files, replyTo ?? undefined).catch((e: unknown) => {
      setTray(files);
      showAlert(t('inbox.actionFailed'), describeCrmError(e));
    });
  };

  const startRecording = async () => {
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) return showAlert(t('inbox.micNeeded'));
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  };

  const stopRecording = async (send: boolean) => {
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
    const uri = recorder.uri;
    if (send && uri && rec.durationMillis > 700) {
      onClearReply();
      void sendVoice(acct, chat, channel, uri, replyTo ?? undefined);
    }
  };

  const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
      {replyTo ? (
        <View style={[styles.reply, { backgroundColor: colors.surfaceAlt, borderStartColor: colors.primary, borderRadius: radius.sm }]}>
          <View style={{ flex: 1 }}>
            <Text variant="micro" tone="primary" style={{ letterSpacing: 0 }}>
              {t('inbox.replyingTo')}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {previewText(replyTo.content)}
            </Text>
          </View>
          <Pressable onPress={onClearReply} hitSlop={10}>
            <X size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}

      <QuickReplySuggest
        text={text}
        onPick={async (r) => {
          const ctx = senderContext();
          const who = await leadForFill();
          if (r.kind === 'QUICK') {
            setText((cur) => applySlash(cur, replyText(r, who, ctx)));
            return;
          }
          // Canned: the stored messages go out as they are, in order.
          void confirmAction({
            title: `/${r.name}`,
            message: t('quick.sendCannedQ', { count: r.parts.length }),
            confirmText: t('inbox.send'),
            cancelText: t('common.cancel'),
          }).then((ok) => {
            if (!ok) return;
            setText((cur) => applySlash(cur, '').trimEnd());
            void sendContents(acct, chat, channel, replyContents(r, who, ctx));
          });
        }}
      />
      {rec.isRecording ? (
        <View style={styles.row}>
          <Pressable
            onPress={() => void stopRecording(false)}
            style={[styles.round, { backgroundColor: colors.dangerSoft }]}
            accessibilityLabel={t('inbox.cancelRecording')}
          >
            <Trash2 size={20} color={colors.danger} />
          </Pressable>
          <View style={[styles.recBox, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
            <View style={[styles.recDot, { backgroundColor: colors.danger }]} />
            <Text variant="bodyStrong">{mmss(rec.durationMillis)}</Text>
            <Text variant="caption" tone="muted">
              {t('inbox.recording')}
            </Text>
          </View>
          <Pressable
            onPress={() => void stopRecording(true)}
            style={[styles.round, { backgroundColor: colors.primary }]}
            accessibilityLabel={t('inbox.sendVoice')}
          >
            <Send size={20} color="#fff" />
          </Pressable>
        </View>
      ) : (
        <View style={styles.row}>
          {/* Templates are always allowed, including outside the 24-hour window. */}
          <Pressable
            onPress={() => router.push({ pathname: '/(app)/whatsapp/send', params: { leadId: chat.id } })}
            style={[styles.round, { backgroundColor: disabled ? colors.primary : colors.surfaceAlt }]}
            accessibilityLabel={t('inbox.sendTemplate')}
          >
            <LayoutTemplate size={20} color={disabled ? '#fff' : colors.text} />
          </Pressable>
          {!disabled ? (
            <Pressable onPress={() => setMenu(true)} style={[styles.round, { backgroundColor: colors.surfaceAlt }]} accessibilityLabel={t('inbox.attach')}>
              {preparing ? <ActivityIndicator color={colors.primary} /> : <Paperclip size={20} color={colors.text} />}
            </Pressable>
          ) : null}
          <View style={[styles.inputBox, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
            <TextInput
              value={text}
              onChangeText={setText}
              editable={!disabled}
              placeholder={disabled ? t('inbox.sessionExpiredShort') : t('inbox.typeMessage')}
              placeholderTextColor={colors.textFaint}
              multiline
              style={[styles.input, { color: colors.text, fontFamily: fonts.regular }]}
            />
          </View>
          {text.trim() ? (
            <Pressable
              onPress={sendNowText}
              onLongPress={() => setScheduling('text')}
              delayLongPress={350}
              style={[styles.round, { backgroundColor: colors.primary }]}
              accessibilityLabel={t('inbox.send')}
              accessibilityHint={t('inbox.longPressSchedule')}
            >
              <Send size={20} color="#fff" />
            </Pressable>
          ) : (
            <Pressable
              onPress={() => (Platform.OS === 'web' ? showAlert(t('inbox.voiceOnPhone')) : void startRecording())}
              disabled={disabled}
              style={[styles.round, { backgroundColor: colors.primary, opacity: disabled ? 0.5 : 1 }]}
              accessibilityLabel={t('inbox.recordVoice')}
            >
              <Mic size={20} color="#fff" />
            </Pressable>
          )}
        </View>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title={t('inbox.attach')}>
        <View style={styles.menu}>
          <MenuItem icon={<Images size={24} color="#7C3AED" />} label={t('inbox.photosVideos')} onPress={() => void pick('gallery')} />
          {Platform.OS !== 'web' ? (
            <MenuItem icon={<Camera size={24} color="#DB2777" />} label={t('inbox.camera')} onPress={() => void pick('camera')} />
          ) : null}
          <MenuItem icon={<FileText size={24} color="#2563EB" />} label={t('inbox.documents')} onPress={() => void pick('files')} />
          <MenuItem
            icon={<Sticker size={24} color="#059669" />}
            label={t('inbox.sticker')}
            onPress={() => {
              setMenu(false);
              setStickers(true);
            }}
          />
        </View>
        <Text variant="caption" tone="faint" center style={{ marginTop: 12 }}>
          {t('inbox.limitsNote')}
        </Text>
      </Sheet>

      {stickers ? (
        <StickerSheet
          acct={acct}
          onClose={() => setStickers(false)}
          onSend={(from) => {
            setStickers(false);
            sendSticker(acct, chat, channel, from).catch((e: unknown) => showAlert(t('inbox.actionFailed'), describeCrmError(e)));
          }}
        />
      ) : null}

      <ScheduleSheet
        open={!!scheduling}
        onClose={() => setScheduling(null)}
        onPick={async (at) => {
          try {
            const n = await scheduleSession(acct, chat, channel, at, text.trim(), scheduling === 'files' ? (tray ?? []) : []);
            if (scheduling === 'files') setTray(null);
            else setText('');
            setScheduling(null);
            showAlert(t('inbox.scheduled'), t('inbox.scheduledBody', { count: n, when: at.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) }));
          } catch (e) {
            showAlert(t('wa.sendFailed'), describeCrmError(e));
          }
        }}
      />

      {tray ? (
        <Sheet
          open
          onClose={() => setTray(null)}
          title={t('inbox.sendFiles', { count: tray.length })}
          footer={
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button
                title={t('inbox.schedule')}
                variant="secondary"
                icon={<CalendarClock size={16} color={colors.text} />}
                onPress={() => setScheduling('files')}
                disabled={!tray.length}
              />
              <Button
                title={t('inbox.sendAll', { count: tray.length })}
                icon={<Send size={16} color="#fff" />}
                onPress={sendTray}
                disabled={!tray.length}
                style={{ flex: 1 }}
              />
            </View>
          }
        >
          <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
            <View style={{ gap: 12 }}>
              {tray.map((f, i) => (
                <View key={`${f.uri}-${i}`} style={[styles.trayItem, { borderColor: colors.border, borderRadius: radius.md }]}>
                  {f.kind === 'image' ? (
                    <Image source={{ uri: f.uri }} style={styles.thumb} contentFit="cover" />
                  ) : (
                    <View style={[styles.thumb, { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }]}>
                      {f.kind === 'video' ? <VideoIcon size={22} color={colors.textMuted} /> : <FileText size={22} color={colors.textMuted} />}
                    </View>
                  )}
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text variant="caption" numberOfLines={1} style={{ fontWeight: '500' }}>
                      {f.name}
                    </Text>
                    <Text variant="micro" tone="faint" style={{ letterSpacing: 0 }}>
                      {(f.size / 1048576).toFixed(1)} MB{f.converted ? ` · ${t('inbox.convertedJpeg')}` : ''}
                    </Text>
                    {f.kind !== 'audio' ? (
                      <TextInput
                        value={f.caption}
                        onChangeText={(v) => setTray(tray.map((x, j) => (j === i ? { ...x, caption: v } : x)))}
                        placeholder={t('inbox.addCaption')}
                        placeholderTextColor={colors.textFaint}
                        style={[styles.caption, { color: colors.text, borderColor: colors.border, fontFamily: fonts.regular }]}
                      />
                    ) : null}
                  </View>
                  <Pressable onPress={() => setTray(tray.filter((_, j) => j !== i))} hitSlop={8}>
                    <X size={18} color={colors.textMuted} />
                  </Pressable>
                </View>
              ))}
              {tray.length < 10 ? (
                <Pressable onPress={() => void pick('gallery')} style={[styles.addMore, { borderColor: colors.borderStrong, borderRadius: radius.md }]}>
                  <Text variant="bodyStrong" tone="primary">
                    + {t('inbox.addMore')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </ScrollView>
        </Sheet>
      ) : null}
    </View>
  );
}

/** When to send a scheduled message: quick choices or a picked date and time. */
function ScheduleSheet({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (at: Date) => Promise<void> }) {
  const { t } = useTranslation();
  // Ticking, so quick times stay ahead of now however long the chat has been open.
  const now = new Date(useNow());
  const [custom, setCustom] = useState(() => new Date(Date.now() + 3600_000));
  const [busy, setBusy] = useState(false);
  const at = (days: number, h: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(h, 0, 0, 0);
    return d;
  };
  const options = [
    { key: 'h1', date: new Date(now.getTime() + 3600_000) },
    { key: 'h3', date: new Date(now.getTime() + 3 * 3600_000) },
    { key: 'evening', date: at(now.getHours() >= 18 ? 1 : 0, 19) },
    { key: 'tomorrow', date: at(1, 10) },
  ];
  const go = async (d: Date) => {
    setBusy(true);
    try {
      await onPick(d);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={t('inbox.scheduleTitle')} subtitle={t('inbox.scheduleSub')} locked={busy}>
      <View style={{ gap: 10 }}>
        {options.map((o) => (
          <Button
            key={o.key}
            variant="secondary"
            disabled={busy}
            title={`${t(`inbox.at.${o.key}`)} · ${o.date.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`}
            onPress={() => void go(o.date)}
          />
        ))}
        <DateTimeField value={custom} minimumDate={now} label={t('reminders.pickDateTime')} onChange={setCustom} />
        <Button
          title={t('inbox.scheduleFor', { when: custom.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) })}
          loading={busy}
          onPress={() => void go(custom)}
        />
        <Text variant="caption" tone="faint">
          {t('inbox.scheduleNote')}
        </Text>
      </View>
    </Sheet>
  );
}

function MenuItem({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuItem,
        { backgroundColor: pressed ? colors.surfaceAlt : colors.surface, borderColor: colors.border, borderRadius: radius.lg },
      ]}
    >
      {icon}
      <Text variant="caption" center style={{ fontWeight: '500' }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, paddingTop: 8, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  inputBox: { flex: 1, borderWidth: 1, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' },
  input: { fontSize: 15, maxHeight: 120, paddingVertical: 10 },
  reply: { flexDirection: 'row', alignItems: 'center', gap: 8, borderStartWidth: 3, paddingHorizontal: 10, paddingVertical: 6 },
  recBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, paddingHorizontal: 14, height: 44 },
  recDot: { width: 10, height: 10, borderRadius: 5 },
  menu: { flexDirection: 'row', gap: 10 },
  menuItem: { flex: 1, alignItems: 'center', gap: 8, paddingVertical: 18, borderWidth: 1 },
  trayItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 10, borderWidth: 1 },
  thumb: { width: 64, height: 64, borderRadius: 10 },
  caption: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 14 },
  addMore: { borderWidth: 1, borderStyle: 'dashed', padding: 14, alignItems: 'center' },
});
