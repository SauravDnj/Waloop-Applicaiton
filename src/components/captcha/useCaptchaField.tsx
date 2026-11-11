/**
 * One hook for every auth form: renders the captcha when the project needs
 * one and hands back a `getToken()` to call at submit time.
 *
 * ```tsx
 * const captcha = useCaptchaField('submit');
 * …
 * {captcha.element}
 * const captchaToken = await captcha.getToken();   // undefined when captcha is off
 * ```
 */
import { useQuery } from '@tanstack/react-query';
import { useRef, useState, useSyncExternalStore } from 'react';

import { getAuthAccessId, onAuthAccessIdChange } from '@/services/accessId';
import { getAuthConfig } from '@/services/sso/client';
import { Captcha } from './Captcha';
import type { CaptchaHandle } from './types';

/** The sign-in flow's Access ID, re-rendering when the user changes it. */
export const useAuthAccessId = () => useSyncExternalStore(onAuthAccessIdChange, getAuthAccessId, getAuthAccessId);

/** `forAccessId`: another project's config than the sign-in flow's (an app-lock password check). */
export const useAuthConfig = (forAccessId?: string) => {
  const flowId = useAuthAccessId();
  const accessId = forAccessId || flowId;
  return useQuery({
    queryKey: ['auth-config', accessId],
    queryFn: () => getAuthConfig(accessId),
    enabled: !!accessId,
    staleTime: 10 * 60_000,
    retry: 1,
  });
};

export function useCaptchaField(action: 'submit' | 'verify_2fa' = 'submit', accessId?: string) {
  const config = useAuthConfig(accessId);
  const ref = useRef<CaptchaHandle>(null);
  const [solved, setSolved] = useState(false);
  const captcha = config.data?.captcha;
  const enabled = !!captcha?.enabled && !!captcha.clientId;

  const element = enabled && captcha ? <Captcha ref={ref} config={captcha} action={action} onToken={(t) => setSolved(!!t)} /> : null;

  /** `undefined` when the project does not use a captcha. Throws with a user-facing message otherwise. */
  const getToken = async (): Promise<string | undefined> => {
    if (!enabled) return undefined;
    if (!ref.current) throw new Error('captcha');
    return ref.current.execute();
  };

  const reset = () => {
    ref.current?.reset();
    setSolved(false);
  };

  return {
    element,
    getToken,
    reset,
    enabled,
    solved,
    loading: config.isLoading,
    config: config.data,
  };
}
