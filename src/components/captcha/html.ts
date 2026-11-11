/**
 * The page the native captcha WebView loads. One HTML for all three widget
 * modes; it talks to React Native with `postMessage` and exposes two hooks:
 *
 *   window.__captchaExecute()  → for reCAPTCHA v3 obtains a fresh token for
 *                                `action`; for visible widgets reports that the
 *                                user still has to tick the box.
 *   window.__captchaReset()    → clears a visible widget.
 *
 * Messages: { type: 'ready' | 'token' | 'expired' | 'error' | 'needs_interaction', token?, message? }
 */
import type { CaptchaConfig } from '@ab-ecosystem/sso';

export type CaptchaMode = 'v2' | 'v3' | 'hcaptcha';

export const captchaMode = (c: CaptchaConfig): CaptchaMode => (c.provider === 'hcaptcha' ? 'hcaptcha' : (c.version ?? 'v2') === 'v3' ? 'v3' : 'v2');

export const captchaScriptUrl = (c: CaptchaConfig, onload = 'onCaptchaLoad', lang?: string): string => {
  const hl = lang ? `&hl=${encodeURIComponent(lang)}` : '';
  switch (captchaMode(c)) {
    case 'hcaptcha':
      return `https://js.hcaptcha.com/1/api.js?onload=${onload}&render=explicit${hl}`;
    case 'v3':
      return `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(c.clientId)}&onload=${onload}${hl}`;
    default:
      return `https://www.google.com/recaptcha/api.js?onload=${onload}&render=explicit${hl}`;
  }
};

/** Visible widgets are 78px tall; v3 renders nothing. */
export const captchaHeight = (c: CaptchaConfig) => (captchaMode(c) === 'v3' ? 1 : 82);

export const buildCaptchaHtml = (c: CaptchaConfig, options: { action: string; theme: 'light' | 'dark'; lang?: string; fullPage?: boolean }): string => {
  const mode = captchaMode(c);
  const key = JSON.stringify(c.clientId);
  const action = JSON.stringify(options.action);
  const theme = JSON.stringify(options.theme);
  return `<!doctype html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<style>html,body{margin:0;padding:0;background:transparent;overflow:${options.fullPage ? 'auto' : 'hidden'}}#c{display:flex;justify-content:center;align-items:flex-start;${options.fullPage ? 'padding-top:24px;min-height:640px' : ''}}</style>
</head><body>
<div id="c"></div>
<script>
var KEY=${key}, MODE=${JSON.stringify(mode)}, ACTION=${action}, THEME=${theme}, widget=null;
function post(m){ try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch (e) {} }
function api(){ return MODE === 'hcaptcha' ? window.hcaptcha : window.grecaptcha; }
function onCaptchaLoad(){
  try {
    if (MODE === 'v3') { window.grecaptcha.ready(function(){ post({type:'ready'}); }); return; }
    widget = api().render('c', {
      sitekey: KEY, theme: THEME,
      callback: function(t){ post({type:'token', token:t}); },
      'expired-callback': function(){ post({type:'expired'}); },
      'error-callback': function(){ post({type:'error', message:'captcha error'}); }
    });
    post({type:'ready'});
  } catch (e) { post({type:'error', message:String(e)}); }
}
window.__captchaExecute = function(){
  try {
    if (MODE === 'v3') {
      window.grecaptcha.execute(KEY, {action: ACTION}).then(function(t){ post({type:'token', token:t}); }, function(e){ post({type:'error', message:String(e)}); });
    } else { post({type:'needs_interaction'}); }
  } catch (e) { post({type:'error', message:String(e)}); }
};
window.__captchaReset = function(){ try { if (widget !== null) api().reset(widget); } catch (e) {} };
window.onerror = function(m){ post({type:'error', message:String(m)}); };
</script>
<script src="${captchaScriptUrl(c, 'onCaptchaLoad', options.lang)}" async defer></script>
</body></html>`;
};
