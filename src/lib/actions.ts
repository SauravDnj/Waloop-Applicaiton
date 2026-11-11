/**
 * Outbound actions that leave the app: WhatsApp, SMS, copy.
 */
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Linking } from 'react-native';

import { formatPhone, smsUri, whatsappUri } from './phone';
import { showAlert } from '@/lib/dialog';

export const openWhatsApp = async (phone: string, text?: string) => {
  const url = whatsappUri(phone, text);
  try {
    await Linking.openURL(url);
  } catch {
    showAlert('WhatsApp not available', 'Install WhatsApp to message this lead.');
  }
};

export const openSms = async (phone: string, body?: string) => {
  try {
    await Linking.openURL(smsUri(phone, body));
  } catch {
    showAlert('Messages not available');
  }
};

export const copyPhone = async (phone: string) => {
  await Clipboard.setStringAsync(formatPhone(phone));
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
};

/** `{{name}}` / `{{first_name}}` / `{{product}}` substitution for message templates. */
export const fillTemplate = (template: string, vars: Record<string, string | undefined>) =>
  template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key: string) => vars[key] ?? vars[key.toLowerCase()] ?? '');

/**
 * The WhatsApp button: a saved contact opens its live inbox chat (which offers
 * templates outside the 24-hour window); a bare number opens WhatsApp.
 */
export const messageOnWhatsApp = ({ phone, leadId }: { phone: string; leadId?: string | null }) => {
  if (leadId) {
    router.push({ pathname: '/(app)/chat/[id]', params: { id: leadId } });
    return;
  }
  void openWhatsApp(phone);
};
