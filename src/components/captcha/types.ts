import type { CaptchaConfig } from '@ab-ecosystem/sso';

export type CaptchaHandle = {
  /** Resolves a token to send as `captchaToken`; rejects when the user still has to solve a visible widget. */
  execute: () => Promise<string>;
  /** Clears a visible widget after a failed submit (tokens are single-use). */
  reset: () => void;
};

export type CaptchaProps = {
  config: CaptchaConfig;
  /** reCAPTCHA v3 action name: `submit` for login/signup/forgot, `verify_2fa` for the OTP step. */
  action?: string;
  /** Fired when a visible widget produces (or loses) a token. */
  onToken?: (token: string | null) => void;
};
