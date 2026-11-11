/** Small pieces shared by the channel screens: the type icon, the status badge, and the "finish setup" card. */
import { Globe, Mail, MessageCircle, MessageSquare, MessagesSquare, Radio, Send, ShieldCheck } from 'lucide-react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Input, Row, Text } from '@/components/ui';
import { StatusPill } from '@/components/ui/kit';
import { showAlert } from '@/lib/dialog';
import { activateBizAppNumber, channelState, humanizeKind, kindColor, registerWithPin, type Channel, type ChannelKind } from '@/services/crm/channels';
import { describeCrmError } from '@/services/crm/client';
import { useTheme } from '@/theme/ThemeProvider';

/** White glyph for a channel kind, sized to sit on its coloured tile. */
function KindGlyph({ kind, size }: { kind: ChannelKind; size: number }) {
  const stroke = { stroke: '#fff', strokeWidth: 2, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (kind) {
    case 'instagram':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect x={3} y={3} width={18} height={18} rx={5} {...stroke} />
          <Circle cx={12} cy={12} r={4} {...stroke} />
          <Circle cx={17.5} cy={6.5} r={1.2} fill="#fff" />
        </Svg>
      );
    case 'facebook':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8.5a.5.5 0 0 1 .5-.5Z" fill="#fff" />
        </Svg>
      );
    case 'messenger':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M12 3C7 3 3 6.7 3 11.4c0 2.6 1.2 4.9 3.2 6.4V21l2.9-1.6c.9.3 1.9.4 2.9.4 5 0 9-3.7 9-8.4S17 3 12 3Z" {...stroke} />
          <Path d="m7.5 13.5 3-3.2 2 2 3.5-2.3-3 3.2-2-2z" fill="#fff" />
        </Svg>
      );
    case 'telegram':
      return <Send size={size} color="#fff" />;
    case 'sms':
      return <MessageSquare size={size} color="#fff" />;
    case 'rcs':
      return <MessagesSquare size={size} color="#fff" />;
    case 'email':
      return <Mail size={size} color="#fff" />;
    case 'webchat':
      return <Globe size={size} color="#fff" />;
    case 'whatsapp':
      return <MessageCircle size={size} color="#fff" />;
    default:
      return <Radio size={size} color="#fff" />;
  }
}

export function ChannelIcon({ type, color, size = 40 }: { type: ChannelKind; color?: string; size?: number }) {
  return (
    <View style={[styles.icon, { width: size, height: size, borderRadius: size * 0.3, backgroundColor: color || kindColor(type) }]}>
      <KindGlyph kind={type} size={Math.round(size * 0.48)} />
    </View>
  );
}

/** "WhatsApp", "Instagram"…, translated; a kind with no translation shows its own name, tidied. */
export const useKindLabel = () => {
  const { t } = useTranslation();
  return (kind: ChannelKind) => t(`channels.type.${kind}`, { defaultValue: humanizeKind(kind) });
};

/** Meta rates a number GREEN / YELLOW / RED (or HIGH / MEDIUM / LOW). */
export const qualityColor = (rating: string, colors: { success: string; warning: string; danger: string; textMuted: string }) =>
  /green|high/i.test(rating) ? colors.success : /yellow|medium/i.test(rating) ? colors.warning : /red|low/i.test(rating) ? colors.danger : colors.textMuted;

export function ChannelStateBadge({ channel }: { channel: Channel }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const state = channelState(channel);
  const color = state === 'live' ? colors.success : state === 'setup' ? colors.warning : colors.textMuted;
  return <StatusPill label={t(`channels.state.${state}`)} color={color} />;
}

/**
 * Registration, the step between "created" and "can send": a number new to the
 * Cloud API is registered with a PIN; one moved from the WhatsApp Business app
 * is already registered and only needs activating.
 */
export function SetupCard({ channel, onDone }: { channel: Channel; onDone: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const bizApp = !!channel.cloud?.is_on_biz_app;
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!bizApp && !/^\d{6}$/.test(pin)) return showAlert(t('channels.pinInvalid'));
    setBusy(true);
    try {
      if (bizApp) await activateBizAppNumber(channel.id);
      else await registerWithPin(channel.id, pin);
      onDone();
    } catch (err) {
      showAlert(t('channels.setupFailed'), describeCrmError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={[styles.setup, { borderColor: colors.warning }]}>
      <Row gap={10}>
        <ShieldCheck size={20} color={colors.warning} />
        <Text variant="h3" style={{ flex: 1 }}>
          {t('channels.setupTitle')}
        </Text>
      </Row>
      <Text variant="caption" tone="muted">
        {bizApp ? t('channels.setupBizBody') : t('channels.setupPinBody')}
      </Text>
      {bizApp ? null : (
        <Input
          label={t('channels.pin')}
          value={pin}
          onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          secureTextEntry
          placeholder="••••••"
          accessibilityLabel={t('channels.pin')}
        />
      )}
      <Button title={bizApp ? t('channels.activate') : t('channels.register')} onPress={() => void run()} loading={busy} full />
    </Card>
  );
}

const styles = StyleSheet.create({
  icon: { alignItems: 'center', justifyContent: 'center' },
  setup: { gap: 12, borderWidth: 1.5 },
});
