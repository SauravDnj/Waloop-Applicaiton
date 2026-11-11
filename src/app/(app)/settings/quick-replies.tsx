/**
 * Quick replies (shared with the CPaaS panel). Quick: one text that lands in
 * the composer or a note to edit. Canned: up to 10 messages (text, image,
 * video, document) sent as they are. Use them by typing `/name` in the inbox,
 * remarks and post-call notes. Custom fields fill in when used. Opened with
 * `?new=1` (the "/" popup's "New reply"), the editor starts open and closing it
 * goes straight back to where the user was typing.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ArrowDown, ArrowUp, FileText, Image as ImageIcon, MessagesSquare, Paperclip, Plus, Trash2, Type, Video, Zap } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, IconButton, Input, Row, Screen, SearchField, SegmentedControl, Sheet, Text } from '@/components/ui';
import { TokenTextInput } from '@/components/whatsapp/TokenTextInput';
import { useQuickReplies } from '@/hooks/queries';
import { confirmAction, showAlert } from '@/lib/dialog';
import { MAX_BYTES, pickForFormat } from '@/lib/pickFile';
import { describeCrmError } from '@/services/crm/client';
import { deleteQuickReply, saveQuickReply, toEditor, type QuickKind, type QuickPart, type QuickReply } from '@/services/crm/quickReplies';
import { sessionFormat, uploadSendMedia } from '@/services/crm/whatsapp';
import { useTheme } from '@/theme/ThemeProvider';
import { useCan } from '@/stores/auth';
import { P } from '@/lib/permissions';
import { goBack } from '@/lib/nav';

const PART_ICON = { text: Type, image: ImageIcon, video: Video, document: FileText } as const;

export default function QuickRepliesScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const replies = useQuickReplies();
  const [search, setSearch] = useState('');
  // Everyone can use quick replies; changing them follows the role (owners: everything).
  const canCreate = useCan(P.quickReplies.create);
  const params = useLocalSearchParams<{ new?: string; name?: string }>();
  const fromComposer = params.new === '1' && canCreate;
  const [editing, setEditing] = useState<QuickReply | 'new' | null>(null);
  // Opened from the "/" popup: the editor opens once, also when permissions load late or the
  // page is reused with a new request.
  const request = fromComposer ? `${params.name ?? ''}` : null;
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  if (request !== null && request !== openedFor) {
    setOpenedFor(request);
    setEditing('new');
  }
  const canEdit = useCan(P.quickReplies.update);
  const list = useMemo(
    () => (replies.data ?? []).filter((r) => !search.trim() || r.name.toLowerCase().includes(search.trim().toLowerCase().replace(/^\//, ''))),
    [replies.data, search],
  );

  return (
    <Screen
      title={t('quick.title')}
      subtitle={t('quick.sub')}
      back
      scroll
      onRefresh={() => replies.refetch()}
      // New reply at the top, not under a long list.
      right={
        canCreate ? (
          <IconButton tone="primary" label={t('quick.new')} onPress={() => setEditing('new')}>
            <Plus size={20} color={colors.primary} />
          </IconButton>
        ) : undefined
      }
    >
      <View style={{ gap: 12, marginTop: 8 }}>
        <SearchField value={search} onChangeText={setSearch} placeholder={t('quick.search')} />
        {replies.isLoading && !replies.data ? <ActivityIndicator color={colors.primary} /> : null}
        {replies.data && !list.length ? (
          <EmptyState
            icon={<Zap size={26} color="#fff" />}
            title={t('quick.empty')}
            body={t('quick.emptyBody')}
            action={canCreate && !search.trim() ? t('quick.new') : undefined}
            onAction={canCreate && !search.trim() ? () => setEditing('new') : undefined}
          />
        ) : null}
        {list.map((r) => (
          <Card key={r.id} onPress={canEdit ? () => setEditing(r) : undefined} style={{ gap: 6 }}>
            <Row gap={8}>
              {r.kind === 'QUICK' ? <Zap size={16} color={colors.primary} /> : <MessagesSquare size={16} color={colors.accent} />}
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                /{r.name}
              </Text>
              <Text variant="micro" tone="faint" style={{ letterSpacing: 0 }}>
                {r.kind === 'QUICK' ? t('quick.quick') : t('quick.messages', { count: r.parts.length })}
              </Text>
            </Row>
            <Text variant="caption" tone="muted" numberOfLines={2}>
              {r.parts.find((p) => p.text)?.text ?? r.parts[0]?.type}
            </Text>
          </Card>
        ))}
      </View>
      {editing ? (
        <Editor
          reply={editing === 'new' ? null : editing}
          initialName={editing === 'new' && fromComposer ? params.name : undefined}
          onClose={() => {
            setEditing(null);
            if (fromComposer) goBack('/(app)/settings/quick-replies');
          }}
        />
      ) : null}
    </Screen>
  );
}

function Editor({ reply, initialName, onClose }: { reply: QuickReply | null; initialName?: string; onClose: () => void }) {
  const canDelete = useCan(P.quickReplies.delete);
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const qc = useQueryClient();
  const [name, setName] = useState(reply?.name ?? initialName ?? '');
  const [kind, setKind] = useState<QuickKind>(reply?.kind ?? 'QUICK');
  const [parts, setParts] = useState<QuickPart[]>(() =>
    reply?.parts.length ? reply.parts.map((p) => ({ ...p, text: toEditor(p.text) })) : [{ type: 'text', text: '' }],
  );
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<number | null>(null);

  const setPart = (i: number, p: Partial<QuickPart>) => setParts(parts.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= parts.length) return;
    const next = [...parts];
    [next[i], next[j]] = [next[j], next[i]];
    setParts(next);
  };
  const attach = async (i: number) => {
    const p = parts[i];
    if (p.type === 'text') return;
    const format = sessionFormat(p.type);
    const f = await pickForFormat(format);
    if (!f) return;
    if (f.size && f.size > MAX_BYTES[format]) return showAlert(t('wa.tooLarge'), t('wa.tooLargeBody', { mb: Math.round(MAX_BYTES[format] / 1048576) }));
    setUploading(i);
    try {
      setPart(i, { link: await uploadSendMedia(format, f), filename: f.name });
    } catch (err) {
      showAlert(t('wa.uploadFailed'), describeCrmError(err));
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    const cleanName = name.trim().replace(/^\//, '');
    if (!cleanName) return showAlert(t('quick.needName'));
    const used = kind === 'QUICK' ? [{ type: 'text' as const, text: parts[0]?.text ?? '' }] : parts;
    if (used.some((p) => (p.type === 'text' ? !p.text.trim() : !p.link))) return showAlert(t('quick.needContent'));
    setBusy(true);
    try {
      await saveQuickReply({ id: reply?.id, name: cleanName, kind, parts: used });
      await qc.invalidateQueries({ queryKey: ['quickReplies'] });
      onClose();
    } catch (err) {
      showAlert(t('common.couldNotSave'), describeCrmError(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!reply) return;
    const ok = await confirmAction({
      title: t('quick.deleteTitle', { name: reply.name }),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    await deleteQuickReply(reply.id).catch((e: unknown) => showAlert(t('common.errorTitle'), describeCrmError(e)));
    await qc.invalidateQueries({ queryKey: ['quickReplies'] });
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={reply ? `/${reply.name}` : t('quick.new')}
      locked={busy}
      footer={
        <Row gap={10}>
          {reply && canDelete ? (
            <Button
              title={t('common.delete')}
              variant="ghost"
              icon={<Trash2 size={16} color={colors.danger} />}
              onPress={() => void remove()}
              style={{ flex: 1 }}
            />
          ) : null}
          <Button title={t('common.save')} loading={busy} onPress={() => void save()} style={{ flex: 2 }} />
        </Row>
      }
    >
      <View style={{ gap: 12 }}>
        <Input
          label={t('quick.name')}
          value={name}
          onChangeText={(v) => setName(v.replace(/\s+/g, '-'))}
          placeholder={t('quick.namePh')}
          left={<Text tone="muted">/</Text>}
          autoCapitalize="none"
        />
        <SegmentedControl
          value={kind}
          onChange={setKind}
          options={[
            { value: 'QUICK', label: t('quick.quick') },
            { value: 'CANNED', label: t('quick.canned') },
          ]}
        />
        <Text variant="caption" tone="muted">
          {kind === 'QUICK' ? t('quick.quickHint') : t('quick.cannedHint')}
        </Text>
        {(kind === 'QUICK' ? parts.slice(0, 1) : parts).map((p, i) => {
          const Icon = PART_ICON[p.type];
          return (
            <View key={i} style={[styles.part, { borderColor: colors.border, borderRadius: radius.md }]}>
              {kind === 'CANNED' ? (
                <Row gap={6} style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                  {(['text', 'image', 'video', 'document'] as const).map((ty) => {
                    const I = PART_ICON[ty];
                    const on = p.type === ty;
                    return (
                      <Pressable
                        key={ty}
                        onPress={() => setPart(i, { type: ty, link: undefined, filename: undefined })}
                        style={[styles.type, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primarySoft : 'transparent' }]}
                      >
                        <I size={14} color={on ? colors.primary : colors.textMuted} />
                      </Pressable>
                    );
                  })}
                  <View style={{ flex: 1 }} />
                  <Pressable onPress={() => move(i, -1)} hitSlop={6}>
                    <ArrowUp size={16} color={colors.textMuted} />
                  </Pressable>
                  <Pressable onPress={() => move(i, 1)} hitSlop={6}>
                    <ArrowDown size={16} color={colors.textMuted} />
                  </Pressable>
                  {parts.length > 1 ? (
                    <Pressable onPress={() => setParts(parts.filter((_, j) => j !== i))} hitSlop={6}>
                      <Trash2 size={16} color={colors.danger} />
                    </Pressable>
                  ) : null}
                </Row>
              ) : null}
              {p.type !== 'text' ? (
                <Pressable
                  onPress={() => void attach(i)}
                  style={[styles.drop, { borderColor: p.link ? colors.success : colors.borderStrong, borderRadius: radius.sm }]}
                >
                  {uploading === i ? <ActivityIndicator color={colors.primary} /> : <Paperclip size={16} color={p.link ? colors.success : colors.primary} />}
                  <Icon size={14} color={colors.textMuted} />
                  <Text variant="caption" numberOfLines={1} style={{ flex: 1 }}>
                    {p.filename || (p.link ? t('wa.attached') : t('wa.pickMedia', { kind: t(`wa.session.${p.type}`).toLowerCase() }))}
                  </Text>
                </Pressable>
              ) : null}
              <TokenTextInput
                value={p.text}
                onChange={(text) => setPart(i, { text })}
                placeholder={p.type === 'text' ? t('wa.messagePh') : t('wa.captionPh')}
                minHeight={p.type === 'text' ? 80 : 48}
              />
            </View>
          );
        })}
        {kind === 'CANNED' && parts.length < 10 ? (
          <Button
            title={t('quick.addMessage')}
            variant="secondary"
            icon={<Plus size={16} color={colors.text} />}
            onPress={() => setParts([...parts, { type: 'text', text: '' }])}
          />
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  part: { borderWidth: 1, padding: 10, gap: 10 },
  type: { width: 34, height: 30, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  drop: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderWidth: 1.5, borderStyle: 'dashed' },
});
