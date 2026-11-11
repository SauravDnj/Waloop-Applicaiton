/**
 * In-app viewer for chat media. Images open in a swipeable lightbox over every
 * image in the conversation; videos play in the app; documents open in an
 * in-app document viewer (Google Docs viewer for PDFs and Office files), with
 * a button to open them in the browser instead, and one to save to the phone.
 */
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as WebBrowser from 'expo-web-browser';
import { Check, Download, ExternalLink, X } from 'lucide-react-native';
import { createElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewProps } from 'react-native-webview';

import { Text } from '@/components/ui';
import { showAlert } from '@/lib/dialog';
import { saveMedia } from '@/services/inbox/download';
import type { MediaKind } from '@/services/inbox/render';

const NativeWebView = WebView as unknown as React.ComponentType<WebViewProps>;

export type ViewerState =
  | { kind: 'images'; links: string[]; index: number }
  | { kind: 'video'; link: string }
  | { kind: 'document'; link: string; name: string }
  | null;

const openExternal = (url: string) => void WebBrowser.openBrowserAsync(url).catch(() => undefined);

function Chrome({ title, onClose, link, save, children }: { title: string; onClose: () => void; link?: string; save?: { kind: MediaKind; name?: string }; children: React.ReactNode }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // Per file, so several can save at once while swiping on; a tick says it's done.
  const [saves, setSaves] = useState<Record<string, 'saving' | 'saved'>>({});
  const state = link ? saves[link] : undefined;
  const download = async () => {
    if (!link || !save || state) return;
    const target = link;
    const mark = (v?: 'saving' | 'saved') =>
      setSaves((cur) => {
        const { [target]: _old, ...rest } = cur;
        return v ? { ...rest, [target]: v } : rest;
      });
    mark('saving');
    try {
      const res = await saveMedia(target, save.kind, save.name);
      // A document goes through the share sheet, which can be cancelled: no tick, it can be tried again.
      mark(res === 'saved' ? 'saved' : undefined);
      if (res === 'denied') showAlert(t('inbox.saveDenied'));
    } catch (e) {
      mark();
      showAlert(t('inbox.saveFailed'), e instanceof Error ? e.message : '');
    }
  };
  return (
    <View style={styles.root}>
      {children}
      <View style={[styles.bar, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={onClose} hitSlop={12} style={styles.btn} accessibilityLabel="Close">
          <X size={22} color="#fff" />
        </Pressable>
        <Text numberOfLines={1} style={{ color: '#fff', flex: 1, fontWeight: '600' }}>
          {title}
        </Text>
        {link && save ? (
          <Pressable onPress={() => void download()} disabled={!!state} hitSlop={12} style={styles.btn} accessibilityLabel={t('inbox.saveToPhone')}>
            {state === 'saving' ? <ActivityIndicator color="#fff" /> : state === 'saved' ? <Check size={20} color="#4ADE80" /> : <Download size={20} color="#fff" />}
          </Pressable>
        ) : null}
        {link ? (
          <Pressable onPress={() => openExternal(link)} hitSlop={12} style={styles.btn}>
            <ExternalLink size={20} color="#fff" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function Images({ links, index, onClose }: { links: string[]; index: number; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const [at, setAt] = useState(index);
  return (
    <Chrome title={links.length > 1 ? `${at + 1} / ${links.length}` : ''} onClose={onClose} link={links[at]} save={{ kind: 'image' }}>
      <FlatList
        data={links}
        horizontal
        pagingEnabled
        initialScrollIndex={index}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        keyExtractor={(l, i) => `${i}-${l}`}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setAt(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => <Image source={{ uri: item }} style={{ width, height }} contentFit="contain" />}
      />
    </Chrome>
  );
}

function Video({ link, onClose }: { link: string; onClose: () => void }) {
  const player = useVideoPlayer(link, (p) => p.play());
  return (
    <Chrome title="" onClose={onClose} link={link} save={{ kind: 'video' }}>
      <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls contentFit="contain" fullscreenOptions={{ enable: true }} />
    </Chrome>
  );
}

function Document({ link, name, onClose }: { link: string; name: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const viewable = /\.(pdf|docx?|xlsx?|pptx?|txt|csv)(\?|$)/i.test(link) || /\.(pdf|docx?|xlsx?|pptx?|txt|csv)$/i.test(name);
  const url = viewable ? `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(link)}` : link;
  return (
    <Chrome title={name || t('inbox.document')} onClose={onClose} link={link} save={{ kind: 'document', name }}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', marginTop: 90 }]}>
        {Platform.OS === 'web' ? (
          // No WebView on the web: the browser shows it in a frame.
          createElement('iframe', { src: url, title: name, onLoad: () => setLoading(false), style: { border: 0, width: '100%', height: '100%' } })
        ) : (
          <NativeWebView source={{ uri: url }} onLoadEnd={() => setLoading(false)} style={{ flex: 1 }} />
        )}
        {loading ? <ActivityIndicator style={StyleSheet.absoluteFill} color="#4F46E5" /> : null}
      </View>
    </Chrome>
  );
}

export function MediaViewer({ state, onClose }: { state: ViewerState; onClose: () => void }) {
  return (
    <Modal visible={!!state} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {state?.kind === 'images' ? <Images links={state.links} index={state.index} onClose={onClose} /> : null}
      {state?.kind === 'video' ? <Video link={state.link} onClose={onClose} /> : null}
      {state?.kind === 'document' ? <Document link={state.link} name={state.name} onClose={onClose} /> : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  btn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
