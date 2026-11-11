/**
 * A WhatsApp-style chat bubble showing a template the way the lead will see
 * it: header (text or media), body with variables filled, footer, buttons.
 * Unfilled variables stay visible as highlighted `{{1}}` chips.
 */
import { Image } from 'expo-image';
import { ExternalLink, FileText, Image as ImageIcon, Phone, Reply, Video } from 'lucide-react-native';
import { Fragment } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import type { ParsedTemplate, TemplateButton } from '@/services/crm/whatsapp';
import { useTheme } from '@/theme/ThemeProvider';

const WA_BG = { light: '#EFE7DE', dark: '#0B141A' };
const BUBBLE = { light: '#FFFFFF', dark: '#202C33' };

/** Renders text with `{{var}}` tokens replaced, or highlighted when empty. */
function Filled({ text, values, style }: { text: string; values: (name: string) => string | undefined; style?: object }) {
  const parts = text.split(/(\{\{\s*[a-zA-Z0-9_]+\s*\}\})/g);
  return (
    <Text style={style}>
      {parts.map((p, i) => {
        const m = /^\{\{\s*([a-zA-Z0-9_]+)\s*\}\}$/.exec(p);
        if (!m) return <Fragment key={i}>{renderBold(p)}</Fragment>;
        const v = values(m[1]);
        return v ? (
          <Text key={i} style={{ fontWeight: '600' }}>
            {v}
          </Text>
        ) : (
          <Text key={i} style={styles.token}>
            {p}
          </Text>
        );
      })}
    </Text>
  );
}

/** WhatsApp's *bold* and _italic_ markers. */
const renderBold = (s: string) =>
  s.split(/(\*[^*\n]+\*|_[^_\n]+_)/g).map((chunk, i) =>
    chunk.startsWith('*') && chunk.endsWith('*') && chunk.length > 2 ? (
      <Text key={i} style={{ fontWeight: '700' }}>
        {chunk.slice(1, -1)}
      </Text>
    ) : chunk.startsWith('_') && chunk.endsWith('_') && chunk.length > 2 ? (
      <Text key={i} style={{ fontStyle: 'italic' }}>
        {chunk.slice(1, -1)}
      </Text>
    ) : (
      chunk
    ),
  );

export function TemplatePreview({
  template,
  values = () => undefined,
  headerValues,
  mediaUri,
  mediaName,
  bare,
  meta,
  onMediaPress,
  onButtonPress,
  onLongPress,
}: {
  template: ParsedTemplate;
  /** Body (and button) variable values by name. */
  values?: (name: string) => string | undefined;
  /** Header variable values by name (defaults to `values`). */
  headerValues?: (name: string) => string | undefined;
  /** Local or remote media to show in a media header. */
  mediaUri?: string;
  mediaName?: string;
  /** Just the bubble, without the chat-wallpaper canvas (used inside the inbox). */
  bare?: boolean;
  /** Bare only: the message's own time and ticks, drawn where WhatsApp puts them (above the buttons). */
  meta?: React.ReactNode;
  /** Makes the media header and the buttons tappable (a sent template in the inbox). */
  onMediaPress?: () => void;
  onButtonPress?: (b: TemplateButton, index: number) => void;
  onLongPress?: () => void;
}) {
  const { scheme, colors } = useTheme();
  const dark = scheme === 'dark';
  const textColor = dark ? '#E9EDEF' : '#111B21';
  const muted = dark ? '#8696A0' : '#667781';
  const link = dark ? '#53BDEB' : '#027EB5';
  const { header, body, footer, buttons } = template;
  const media = header.format === 'IMAGE' || header.format === 'VIDEO' || header.format === 'DOCUMENT';
  const uri = mediaUri ?? header.mediaUrl;

  return (
    <View style={bare ? undefined : [styles.canvas, { backgroundColor: dark ? WA_BG.dark : WA_BG.light }]}>
      <View
        style={[
          styles.bubble,
          bare && { borderRadius: 0, maxWidth: undefined, backgroundColor: 'transparent' },
          !bare && { backgroundColor: dark ? BUBBLE.dark : BUBBLE.light },
        ]}
      >
        {media ? (
          header.format === 'IMAGE' && uri && /^(https?|file|content|data|blob):/.test(uri) ? (
            <Pressable onPress={onMediaPress} onLongPress={onLongPress} delayLongPress={250} disabled={!onMediaPress}>
              <Image source={{ uri }} style={styles.media} contentFit="cover" />
            </Pressable>
          ) : (
            <Pressable
              onPress={onMediaPress}
              onLongPress={onLongPress}
              delayLongPress={250}
              disabled={!onMediaPress}
              style={[styles.media, styles.mediaEmpty, { backgroundColor: dark ? '#2A3942' : '#E9EDEF' }]}
            >
              {header.format === 'VIDEO' ? (
                <Video size={28} color={muted} />
              ) : header.format === 'DOCUMENT' ? (
                <FileText size={28} color={muted} />
              ) : (
                <ImageIcon size={28} color={muted} />
              )}
              <Text variant="caption" style={{ color: muted }} numberOfLines={1}>
                {mediaName || header.format.toLowerCase()}
              </Text>
            </Pressable>
          )
        ) : null}
        <View style={styles.inner}>
          {header.format === 'TEXT' && header.text ? (
            <Filled text={header.text} values={headerValues ?? values} style={{ color: textColor, fontWeight: '700', fontSize: 15, lineHeight: 20 }} />
          ) : null}
          {body ? (
            <Filled text={body} values={values} style={{ color: textColor, fontSize: 14.5, lineHeight: 20 }} />
          ) : (
            <Text style={{ color: muted, fontStyle: 'italic' }}>…</Text>
          )}
          {footer ? <Text style={{ color: muted, fontSize: 12.5, lineHeight: 17 }}>{footer}</Text> : null}
          {bare ? (
            meta
          ) : (
            <Text style={{ color: muted, fontSize: 11, alignSelf: 'flex-end' }}>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
          )}
        </View>
        {buttons.map((b, i) => (
          <Pressable
            key={i}
            onPress={onButtonPress ? () => onButtonPress(b, i) : undefined}
            onLongPress={onLongPress}
            delayLongPress={250}
            disabled={!onButtonPress}
            style={({ pressed }) => [
              styles.button,
              { borderTopColor: dark ? '#2A3942' : '#E9EDEF' },
              pressed && { backgroundColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' },
            ]}
          >
            {b.type === 'URL' ? (
              <ExternalLink size={15} color={link} />
            ) : b.type === 'PHONE_NUMBER' ? (
              <Phone size={15} color={link} />
            ) : (
              <Reply size={15} color={link} />
            )}
            <Text style={{ color: link, fontWeight: '600' }}>{b.text || '…'}</Text>
          </Pressable>
        ))}
      </View>
      {!body && !header.text && !media ? (
        <Text variant="caption" tone="faint" center style={{ color: colors.textFaint }}>
          —
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { borderRadius: 16, padding: 14 },
  bubble: { borderRadius: 12, borderTopLeftRadius: 2, overflow: 'hidden', maxWidth: 320, alignSelf: 'flex-start', width: '100%' },
  inner: { padding: 10, gap: 6 },
  media: { width: '100%', height: 150 },
  mediaEmpty: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  token: { backgroundColor: 'rgba(255,193,7,0.35)', fontWeight: '700' },
});
