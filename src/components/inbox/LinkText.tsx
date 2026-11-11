/**
 * Message text with tappable links: web addresses open in the in-app browser,
 * emails open the mail app, phone numbers open the dialer.
 */
import * as WebBrowser from 'expo-web-browser';
import { Linking, type TextStyle } from 'react-native';

import { Text } from '@/components/ui';
import { toDialable } from '@/lib/phone';

const PATTERN = /(https?:\/\/[^\s<]+|www\.[^\s<]+|[\w.+-]+@[\w-]+\.[\w.-]+|\+?\d[\d\s-]{7,}\d)/g;

const open = (token: string) => {
  if (/^[\w.+-]+@/.test(token)) return void Linking.openURL(`mailto:${token}`);
  if (/^\+?\d/.test(token) && !/[a-z]/i.test(token)) return void Linking.openURL(`tel:${toDialable(token)}`);
  const url = token.startsWith('http') ? token : `https://${token}`;
  // Trailing punctuation is part of the sentence, not the link.
  void WebBrowser.openBrowserAsync(url.replace(/[).,!?;:]+$/, '')).catch(() => Linking.openURL(url));
};

export function LinkText({ text, style, linkColor }: { text: string; style?: TextStyle; linkColor: string }) {
  const parts = text.split(PATTERN);
  return (
    <Text selectable style={style}>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <Text key={i} style={{ color: linkColor, textDecorationLine: 'underline' }} onPress={() => open(p)} suppressHighlighting={false}>
            {p}
          </Text>
        ) : (
          p
        ),
      )}
    </Text>
  );
}
