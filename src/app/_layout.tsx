import '@/polyfills';

import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, useFonts } from '@expo-google-fonts/inter';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import * as Network from 'expo-network';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, Text as RNText, View, type AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { DialogHost } from '@/components/ui/DialogHost';
import { BootSplash } from '@/components/BootSplash';
import { env, missingEnv } from '@/config/env';
import { applyLanguage, initI18n } from '@/i18n';
import { setDefaultCountry } from '@/lib/phone';
import { startInboxCache } from '@/services/inbox/cache';
import { useInboxStore } from '@/services/inbox/store';
import { crmFor } from '@/services/crm/client';
import { reconnectInboxes, syncInboxConnections } from '@/services/inbox/manager';
import { configureNotifications, registerPushDevice } from '@/services/notifications';
import { activeAccountId, onActiveAccountChange, useAccountsStore } from '@/stores/accounts';
import { restoreQueries, startQueryCache } from '@/services/queryCache';
import { useContactPanel } from '@/stores/contactPanel';
import { useAuthStore } from '@/stores/auth';
import { useAccountCountry, useSettingsStore } from '@/stores/settings';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

// The "WhatsApp messages" channel and the foreground handler exist before any inbox socket connects,
// so a message that arrives early (or for an account that is signed out on screen) still alerts properly.
if (Platform.OS !== 'web') void configureNotifications().catch(() => undefined);

// Language must be ready before the first render so no screen flashes English.
initI18n(useSettingsStore.getState().language);
void applyLanguage(useSettingsStore.getState().language);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, gcTime: 24 * 3600_000, refetchOnReconnect: true },
  },
});

// Refetch stale queries when the app returns to the foreground.
AppState.addEventListener('change', (state: AppStateStatus) => {
  focusManager.setFocused(state === 'active');
});

// Contacts, boards and the rest open from the copy saved on the phone, then refresh.
restoreQueries(queryClient, activeAccountId());
startQueryCache(queryClient);

// Each account has its own data: drop every cached query when the active one changes,
// then show that account's saved copy.
onActiveAccountChange(() => {
  queryClient.clear();
  restoreQueries(queryClient, activeAccountId());
  // A contact open in the desktop side panel belongs to the account we just left.
  useContactPanel.getState().close();
});

// The inbox is kept on the phone as it changes, so it opens instantly and works offline.
startInboxCache();

// Live WhatsApp inbox: one socket per signed-in account, kept across account switches.
useAccountsStore.subscribe((cur, prev) => {
  if (cur.sessions !== prev.sessions) syncInboxConnections();
});

// Back online: reconnect the inbox.
// (Not during the web server render, which has no `window`.)
let wasOffline = false;
if (typeof window !== 'undefined')
  Network.addNetworkStateListener((st) => {
    const online = !!st.isConnected && st.isInternetReachable !== false;
    if (!online) {
      wasOffline = true;
      return;
    }
    if (!wasOffline || useAuthStore.getState().status !== 'signedIn') return;
    wasOffline = false;
    reconnectInboxes();
  });

/** Opens the chat (or contact) a notification is about, in the account it belongs to. */
/**
 * The signed-in account a chat belongs to: one whose inbox already has it, else the first
 * whose server knows the contact. `null` when none does (it then opens in the active one).
 */
const accountWithChat = async (chatId: string): Promise<string | null> => {
  const { byAccount } = useInboxStore.getState();
  const local = Object.entries(byAccount).find(([, a]) => a.chats.some((c) => c.id === chatId) || !!a.threads[chatId]);
  if (local) return local[0];
  const { sessions, activeId } = useAccountsStore.getState();
  // The active account first: most taps are for it.
  const order = [...sessions].sort((a, b) => (a.id === activeId ? -1 : b.id === activeId ? 1 : 0));
  for (const s of order) {
    const found = await crmFor(s.id)
      .contacts.get(chatId)
      .then(() => true)
      .catch(() => false);
    if (found) return s.id;
  }
  return null;
};

const openedTaps = new Set<string>();
const openFromNotification = (r: Notifications.NotificationResponse) => {
  // Each tap opens once: the launch tap is also kept natively as the "last response", so it is cleared too.
  const tapId = `${r.notification.request.identifier}|${r.notification.date}`;
  if (openedTaps.has(tapId)) return;
  openedTaps.add(tapId);
  try {
    Notifications.clearLastNotificationResponse();
  } catch {
    // Older native module: nothing kept to clear.
  }
  // Our own notifications carry `url` (and `accountId`); CPaaS inbox pushes carry the chat id as `chat`.
  // On iOS a remote push's keys sit on the trigger's payload, not in `content.data`.
  const trigger = r.notification.request.trigger as { type?: string; payload?: Record<string, unknown> } | null;
  const data = (r.notification.request.content.data ?? (trigger?.type === 'push' ? trigger.payload : undefined)) as
    | { url?: string; accountId?: string; chat?: string }
    | undefined;
  const lead = data?.url?.match(/lead\/([^/?#]+)/)?.[1];
  const chat = data?.url?.match(/chat\/([^/?#]+)/)?.[1] ?? data?.chat;
  if (!lead && !chat) return;
  void (async () => {
    // Open it in the account it belongs to; give up rather than open it in the wrong one.
    // A CPaaS push names no account: find the signed-in account that has this chat.
    const target = data?.accountId ?? (chat ? await accountWithChat(chat) : null);
    if (target && target !== useAccountsStore.getState().activeId) {
      const switched = await useAuthStore
        .getState()
        .switchSession(target)
        .then(
          () => true,
          () => false,
        );
      if (!switched) return;
    }
    if (lead) router.push({ pathname: '/lead/[id]', params: { id: lead } });
    else router.push({ pathname: '/(app)/chat/[id]', params: { id: chat! } });
  })();
};

/** Any render error below the root shows here instead of a blank or closed app. */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <View style={{ flex: 1, padding: 24, paddingTop: 80, gap: 12, backgroundColor: '#FFFFFF' }}>
      <RNText style={{ fontSize: 20, fontWeight: '700', color: '#0E0E11' }}>Something went wrong</RNText>
      <RNText selectable style={{ fontSize: 13, color: '#5F5F6B' }}>
        {`${error.name}: ${error.message}\n\n${(error.stack ?? '').split('\n').slice(0, 10).join('\n')}`}
      </RNText>
      <RNText onPress={() => void retry()} style={{ fontSize: 16, fontWeight: '600', color: '#4F46E5', marginTop: 12 }}>
        Try again
      </RNText>
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <QueryClientProvider client={queryClient}>
            <ThemeProvider>
              <Root />
            </ThemeProvider>
          </QueryClientProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Root() {
  const { colors, scheme } = useTheme();
  const [fontsReady, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold });
  const fontsDone = fontsReady || !!fontError;
  const status = useAuthStore((s) => s.status);
  const activeId = useAccountsStore((s) => s.activeId);
  const boot = useAuthStore((s) => s.boot);
  // Numbers typed without a country code use the active account's country.
  const country = useAccountCountry(activeId);
  const language = useSettingsStore((s) => s.language);
  const [envProblem] = useState(() => missingEnv());

  useEffect(() => {
    setDefaultCountry(country);
  }, [country]);

  useEffect(() => {
    initI18n(language);
  }, [language]);

  useEffect(() => {
    void boot();
  }, [boot]);

  // Tapping a WhatsApp message notification opens that chat, in its own account. A tap that
  // launched the app (or came in while signing in) waits until the session is restored.
  const pendingTap = useRef<Notifications.NotificationResponse | null>(null);
  const handledLaunch = useRef(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      if (useAuthStore.getState().status === 'signedIn') openFromNotification(r);
      else pendingTap.current = r;
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (Platform.OS === 'web' || status !== 'signedIn') return;
    if (pendingTap.current) {
      openFromNotification(pendingTap.current);
      pendingTap.current = null;
    }
    if (handledLaunch.current) return;
    handledLaunch.current = true;
    try {
      const last = Notifications.getLastNotificationResponse();
      if (last) openFromNotification(last);
    } catch {
      // No native response store (web, tests).
    }
  }, [status]);

  useEffect(() => {
    // The native splash (one colour) hands over to the animated BootSplash straight away.
    SplashScreen.hideAsync().catch(() => undefined);
  }, [status, fontsDone]);

  // Post-sign-in: notifications, push and the live inbox. Nothing is created on the workspace.
  useEffect(() => {
    if (status !== 'signedIn') return;
    void (async () => {
      await configureNotifications().catch(() => undefined);
      void registerPushDevice();
      syncInboxConnections();
    })();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') reconnectInboxes();
    });
    return () => sub.remove();
  }, [status, activeId]);

  if (envProblem.length) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          gap: 8,
        }}
      >
        <Text variant="h2">Configuration needed</Text>
        <Text tone="muted" center>
          Set these in .env (see .env.example) and restart:
        </Text>
        {envProblem.map((m) => (
          <Text key={m.key} variant="mono" tone="danger">
            {m.key}
          </Text>
        ))}
        <Text variant="caption" tone="faint" center style={{ marginTop: 12 }}>
          SSO: {env.ssoUrl || '—'} · CPaaS: {env.cpassBaseUrl || '—'}
        </Text>
      </View>
    );
  }

  const booting = !fontsDone || status === 'booting';

  // Sign-in routing lives in the (app) and (auth) group layouts: a redirect
  // from here can fire before the navigator mounts, which Android ignores.

  return (
    <>
      <StatusBar style={booting || scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
      <DialogHost />
      <BootSplash visible={booting} />
    </>
  );
}
