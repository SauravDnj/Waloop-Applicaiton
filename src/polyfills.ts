/**
 * Polyfills the CPaaS SDK needs on React Native. Import this module first,
 * before anything that touches `@ab-ecosystem/cpaas`.
 *
 * - `URL` / `URLSearchParams`: Hermes ships a partial `URL`; the SDK builds every
 *   request with `new URL(...)` and `searchParams.set`, so the full polyfill is required.
 * - `AbortSignal.timeout`: the SDK passes `AbortSignal.timeout(ms)` as the fetch
 *   signal. Hermes has `AbortController` but not the static `timeout` helper.
 */
import 'react-native-url-polyfill/auto';

type AbortSignalWithTimeout = typeof AbortSignal & {
  timeout?: (ms: number) => AbortSignal;
};

const signalCtor = AbortSignal as AbortSignalWithTimeout;
if (typeof signalCtor.timeout !== 'function') {
  signalCtor.timeout = (ms: number) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error(`Request timed out after ${ms}ms`)), ms);
    return controller.signal;
  };
}
