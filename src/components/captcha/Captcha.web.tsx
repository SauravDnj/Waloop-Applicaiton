/**
 * Web captcha: loads the provider script into the document and renders the
 * widget into a plain div (the View's DOM node). Same handle as native.
 */
import type { CaptchaConfig } from '@ab-ecosystem/sso';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { captchaMode, captchaScriptUrl } from './html';
import type { CaptchaHandle, CaptchaProps } from './types';

type Widget = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => number | string;
  reset: (id?: number | string) => void;
  execute: (key: string, opts: { action: string }) => Promise<string>;
  ready?: (cb: () => void) => void;
};

declare global {
  interface Window {
    grecaptcha?: Widget;
    hcaptcha?: Widget;
    __captchaOnLoad?: () => void;
  }
}

const loadScript = (config: CaptchaConfig, lang: string): Promise<Widget> =>
  new Promise((resolve, reject) => {
    const name = config.provider === 'hcaptcha' ? 'hcaptcha' : 'grecaptcha';
    const existing = window[name];
    if (existing) return resolve(existing);
    const marker = config.provider === 'hcaptcha' ? 'hcaptcha.com' : 'recaptcha/api.js';
    if (!document.querySelector(`script[src*="${marker}"]`)) {
      const s = document.createElement('script');
      s.src = captchaScriptUrl(config, '__captchaOnLoad', lang);
      s.async = true;
      s.defer = true;
      s.onerror = () => reject(new Error('script'));
      document.head.appendChild(s);
    }
    let tries = 0;
    const poll = () => {
      const api = window[name];
      if (api) return api.ready ? api.ready(() => resolve(api)) : resolve(api);
      if (++tries > 100) return reject(new Error('init'));
      setTimeout(poll, 100);
    };
    window.__captchaOnLoad = poll;
    poll();
  });

export const Captcha = forwardRef<CaptchaHandle, CaptchaProps>(function Captcha({ config, action = 'submit', onToken }, ref) {
  const { scheme } = useTheme();
  const { i18n, t } = useTranslation();
  const host = useRef<React.ComponentRef<typeof View>>(null);
  const api = useRef<Widget | null>(null);
  const widget = useRef<number | string | null>(null);
  const token = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mode = captchaMode(config);

  useEffect(() => {
    let alive = true;
    loadScript(config, i18n.language)
      .then((w) => {
        if (!alive) return;
        api.current = w;
        if (mode === 'v3') return;
        const el = host.current as unknown as HTMLElement | null;
        if (!el || widget.current !== null) return;
        widget.current = w.render(el, {
          sitekey: config.clientId,
          theme: scheme,
          callback: (tok: string) => {
            token.current = tok;
            onToken?.(tok);
          },
          'expired-callback': () => {
            token.current = null;
            onToken?.(null);
          },
        });
      })
      .catch(() => alive && setError(t('auth.captchaFailed')));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.clientId, config.provider, config.version]);

  useImperativeHandle(ref, () => ({
    execute: async () => {
      if (mode !== 'v3') {
        if (token.current) return token.current;
        throw new Error(t('auth.captchaRequired'));
      }
      if (!api.current) throw new Error(t('auth.captchaFailed'));
      return api.current.execute(config.clientId, { action });
    },
    reset: () => {
      token.current = null;
      onToken?.(null);
      if (api.current && widget.current !== null) api.current.reset(widget.current);
    },
  }));

  if (mode === 'v3') return null;
  return (
    <View style={styles.wrap}>
      <View ref={host} />
      {error ? (
        <Text variant="caption" tone="danger" center>
          {error}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 6, minHeight: 78 },
});
