/**
 * Native captcha: the provider widget inside a WebView.
 *
 * The WebView is given `baseUrl = EXPO_PUBLIC_APP_ORIGIN`, so the page's
 * origin is your web app's domain and the site key's domain check passes.
 * Add that host to the reCAPTCHA / hCaptcha key's allowed domains.
 */
import { Check, ShieldCheck, X } from 'lucide-react-native';
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';

import { Text } from '@/components/ui';
import { env } from '@/config/env';
import { useTheme } from '@/theme/ThemeProvider';
import { buildCaptchaHtml, captchaHeight, captchaMode } from './html';
import type { CaptchaHandle, CaptchaProps } from './types';

// react-native-webview's class typings do not line up with React 19's JSX types; cast once here.
const NativeWebView = WebView as unknown as React.ComponentType<WebViewProps & { ref?: React.Ref<WebView> }>;

type Msg = {
  type: 'ready' | 'token' | 'expired' | 'error' | 'needs_interaction';
  token?: string;
  message?: string;
};

const EXECUTE_TIMEOUT_MS = 30_000;

/**
 * Visible widgets (v2 checkbox, hCaptcha) open full screen: the image
 * challenge is ~580px tall and would scroll inside a small inline frame. The
 * form shows a compact "I'm not a robot" row instead; solving closes the popup.
 */
export const Captcha = forwardRef<CaptchaHandle, CaptchaProps>(function Captcha({ config, action = 'submit', onToken }, ref) {
  const { scheme, colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [solved, setSolved] = useState(false);
  const { i18n, t } = useTranslation();
  const web = useRef<WebView>(null);
  const token = useRef<string | null>(null);
  const pending = useRef<{
    resolve: (t: string) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const mode = captchaMode(config);
  const html = useMemo(
    () => buildCaptchaHtml(config, { action, theme: scheme, lang: i18n.language, fullPage: mode !== 'v3' }),
    [config, action, scheme, i18n.language, mode],
  );

  const settle = (fn: (p: NonNullable<typeof pending.current>) => void) => {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.timer);
    pending.current = null;
    fn(p);
  };

  const onMessage = (e: WebViewMessageEvent) => {
    let msg: Msg;
    try {
      msg = JSON.parse(e.nativeEvent.data) as Msg;
    } catch {
      return;
    }
    switch (msg.type) {
      case 'ready':
        setReady(true);
        setError(null);
        break;
      case 'token':
        token.current = msg.token ?? null;
        onToken?.(token.current);
        setSolved(!!token.current);
        // A short beat so the user sees the tick, then back to the form.
        if (mode !== 'v3') setTimeout(() => setOpen(false), 600);
        settle((p) => p.resolve(msg.token ?? ''));
        break;
      case 'expired':
        token.current = null;
        setSolved(false);
        onToken?.(null);
        break;
      case 'needs_interaction':
        settle((p) => p.reject(new Error(t('auth.captchaRequired'))));
        break;
      case 'error':
        setError(t('auth.captchaFailed'));
        settle((p) => p.reject(new Error(t('auth.captchaFailed'))));
        break;
    }
  };

  useImperativeHandle(ref, () => ({
    execute: () =>
      new Promise<string>((resolve, reject) => {
        // Visible widgets: the user's tick already produced a token.
        if (mode !== 'v3') {
          if (token.current) return resolve(token.current);
          return reject(new Error(t('auth.captchaRequired')));
        }
        if (!ready) return reject(new Error(t('auth.captchaFailed')));
        settle((p) => p.reject(new Error('superseded')));
        pending.current = {
          resolve,
          reject,
          timer: setTimeout(() => settle((p) => p.reject(new Error(t('auth.captchaFailed')))), EXECUTE_TIMEOUT_MS),
        };
        web.current?.injectJavaScript('window.__captchaExecute && window.__captchaExecute(); true;');
      }),
    reset: () => {
      token.current = null;
      setSolved(false);
      onToken?.(null);
      web.current?.injectJavaScript('window.__captchaReset && window.__captchaReset(); true;');
    },
  }));

  const webView = (full: boolean) => (
    <NativeWebView
      ref={web}
      source={{ html, baseUrl: env.appOrigin || undefined }}
      originWhitelist={['*']}
      onMessage={onMessage}
      javaScriptEnabled
      domStorageEnabled
      scrollEnabled={full}
      bounces={false}
      androidLayerType="hardware"
      setSupportMultipleWindows={false}
      style={full ? styles.webFull : [styles.web, { height: captchaHeight(config) }]}
      onError={() => setError(t('auth.captchaFailed'))}
    />
  );

  // Invisible v3: a hidden frame, nothing to show.
  if (mode === 'v3') return <View style={styles.hidden}>{webView(false)}</View>;

  return (
    <View style={{ gap: 6 }}>
      <Pressable
        onPress={() => !solved && setOpen(true)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: solved }}
        style={({ pressed }) => [
          styles.row,
          { borderRadius: radius.md, borderColor: solved ? colors.success : colors.border, backgroundColor: pressed ? colors.surfaceAlt : colors.surface },
        ]}
      >
        <View style={[styles.box, { borderColor: solved ? colors.success : colors.borderStrong, backgroundColor: solved ? colors.success : 'transparent' }]}>
          {solved ? <Check size={16} color="#fff" strokeWidth={3} /> : null}
        </View>
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          {solved ? t('auth.captchaVerified') : t('auth.captchaPrompt')}
        </Text>
        <ShieldCheck size={20} color={solved ? colors.success : colors.textFaint} />
      </Pressable>
      {error ? (
        <Text variant="caption" tone="danger" center>
          {error}
        </Text>
      ) : null}
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <View style={[styles.sheet, { backgroundColor: colors.background, paddingTop: insets.top + 8, paddingBottom: insets.bottom }]}>
          <View style={styles.sheetHead}>
            <Text variant="h3" style={{ flex: 1 }}>
              {t('auth.captchaTitle')}
            </Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={12} accessibilityLabel={t('common.cancel')}>
              <X size={22} color={colors.text} />
            </Pressable>
          </View>
          <Text variant="caption" tone="muted" style={{ paddingHorizontal: 16 }}>
            {t('auth.captchaHint')}
          </Text>
          {!ready ? <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} /> : null}
          {open ? webView(true) : null}
        </View>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  hidden: { height: 1, opacity: 0.01, overflow: 'hidden' },
  web: { width: 320, backgroundColor: 'transparent' },
  webFull: { flex: 1, backgroundColor: 'transparent' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 56, borderWidth: 1 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  sheet: { flex: 1, gap: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
});
