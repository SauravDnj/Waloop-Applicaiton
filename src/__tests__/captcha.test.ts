import type { CaptchaConfig } from '@ab-ecosystem/sso';

import { buildCaptchaHtml, captchaHeight, captchaMode, captchaScriptUrl } from '@/components/captcha/html';

const base = (over: Partial<CaptchaConfig>): CaptchaConfig => ({
  enabled: true,
  provider: 'recaptcha',
  clientId: 'site-key-123',
  ...over,
});

describe('captcha page builder', () => {
  it('picks the right mode and script per provider/version', () => {
    expect(captchaMode(base({}))).toBe('v2');
    expect(captchaMode(base({ version: 'v3' }))).toBe('v3');
    expect(captchaMode(base({ provider: 'hcaptcha' }))).toBe('hcaptcha');
    expect(captchaScriptUrl(base({}))).toBe('https://www.google.com/recaptcha/api.js?onload=onCaptchaLoad&render=explicit');
    expect(captchaScriptUrl(base({ version: 'v3' }))).toBe('https://www.google.com/recaptcha/api.js?render=site-key-123&onload=onCaptchaLoad');
    expect(captchaScriptUrl(base({ provider: 'hcaptcha' }), 'onCaptchaLoad', 'hi')).toBe(
      'https://js.hcaptcha.com/1/api.js?onload=onCaptchaLoad&render=explicit&hl=hi',
    );
  });

  it('renders nothing visible for v3 and a widget row otherwise', () => {
    expect(captchaHeight(base({ version: 'v3' }))).toBe(1);
    expect(captchaHeight(base({}))).toBeGreaterThan(60);
  });

  it('embeds the site key, mode, action and theme safely', () => {
    const html = buildCaptchaHtml(base({ version: 'v3', clientId: 'k"ey' }), {
      action: 'verify_2fa',
      theme: 'dark',
    });
    expect(html).toContain('var KEY="k\\"ey"');
    expect(html).toContain('MODE="v3"');
    expect(html).toContain('ACTION="verify_2fa"');
    expect(html).toContain('THEME="dark"');
    expect(html).toContain('window.__captchaExecute');
    expect(html).toContain('ReactNativeWebView.postMessage');
  });
});
