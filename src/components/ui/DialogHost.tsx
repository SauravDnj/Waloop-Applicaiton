/**
 * Draws the dialogs queued by `showAlert` / `confirmAction` (lib/dialog): a
 * centred card with an icon in the tone's colour, title, message and buttons,
 * themed like the rest of the app. One at a time, in order.
 */
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useDialogStore, type DialogButton, type DialogTone } from '@/lib/dialog';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

export function DialogHost() {
  const { t } = useTranslation();
  const { colors, radius, shadow } = useTheme();
  const current = useDialogStore((s) => s.queue[0]);
  const close = useDialogStore((s) => s.close);
  if (!current) return null;

  const toneColor: Record<DialogTone, string> = { info: colors.primary, success: colors.success, warning: colors.warning, danger: colors.danger };
  const Icon = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle }[current.tone];
  const tint = toneColor[current.tone];
  const press = (b?: DialogButton) => {
    close(current.id);
    if (b) b.onPress?.();
    else current.onDismiss?.();
  };
  const buttons = current.buttons.map((b) => (b.text === 'OK' ? { ...b, text: t('common.ok') } : b));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => press()} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={() => press(buttons.find((b) => b.style === 'cancel'))} />
        <View style={[styles.card, shadow.floating, { backgroundColor: colors.surface, borderRadius: radius.xl }]}>
          <View style={[styles.icon, { backgroundColor: `${tint}1F` }]}>
            <Icon size={26} color={tint} />
          </View>
          <Text variant="h3" style={{ textAlign: 'center' }}>
            {current.title}
          </Text>
          {current.message ? (
            <ScrollView style={{ maxHeight: 280 }} contentContainerStyle={{ flexGrow: 0 }}>
              <Text tone="muted" style={{ textAlign: 'center', lineHeight: 21 }} selectable>
                {current.message}
              </Text>
            </ScrollView>
          ) : null}
          <View style={[styles.buttons, buttons.length > 2 && { flexDirection: 'column' }]}>
            {buttons.map((b, i) => {
              const primary = b.style !== 'cancel' && i === buttons.length - 1;
              const bg = !primary ? colors.surfaceAlt : b.style === 'destructive' ? colors.danger : colors.primary;
              return (
                <Pressable
                  key={`${b.text}${i}`}
                  onPress={() => press(b)}
                  style={({ pressed }) => [styles.button, { backgroundColor: bg, borderRadius: radius.md, opacity: pressed ? 0.85 : 1 }]}
                >
                  <Text variant="bodyStrong" style={{ color: primary ? '#fff' : colors.text }}>
                    {b.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: { width: '100%', maxWidth: 380, padding: 22, gap: 12, alignItems: 'center' },
  icon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  buttons: { flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginTop: 6 },
  button: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
});
