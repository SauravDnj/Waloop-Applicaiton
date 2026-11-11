import { X } from 'lucide-react-native';
import type { PropsWithChildren, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDesktop } from '@/hooks/useDesktop';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

type Props = PropsWithChildren<{
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  footer?: ReactNode;
  /** Stop a tap on the backdrop from closing (e.g. while saving). */
  locked?: boolean;
  scroll?: boolean;
}>;

/**
 * Bottom sheet built on a transparent Modal so it works identically inside
 * tabs, stacks and the full-screen dial session. Grabber, title, scrollable
 * body, pinned footer.
 *
 * Desktop web: the same content as a centred dialog instead (a sheet rising
 * across a wide screen reads as a phone layout), with a close button; Esc
 * closes it.
 */
export function Sheet(props: Props) {
  const desktop = useDesktop();
  return desktop ? <DialogSheet {...props} /> : <BottomSheet {...props} />;
}

function BottomSheet({ open, onClose, title, subtitle, footer, locked, scroll = true, children }: Props) {
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const body = <View style={styles.body}>{children}</View>;
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={locked ? undefined : onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={locked ? undefined : onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav}>
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.surface,
                borderTopLeftRadius: radius.xl,
                borderTopRightRadius: radius.xl,
                paddingBottom: Math.max(insets.bottom, 16),
              },
            ]}
          >
            <View style={[styles.grabber, { backgroundColor: colors.borderStrong }]} />
            {title ? (
              <View style={styles.header}>
                <Text variant="h2">{title}</Text>
                {subtitle ? (
                  <Text variant="caption" tone="muted">
                    {subtitle}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {scroll ? (
              <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
                {body}
              </ScrollView>
            ) : (
              body
            )}
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function DialogSheet({ open, onClose, title, subtitle, footer, locked, scroll = true, children }: Props) {
  const { t } = useTranslation();
  const { colors, radius, shadow } = useTheme();
  const body = <View style={styles.body}>{children}</View>;
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={locked ? undefined : onClose}>
      <View style={styles.center}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
          onPress={locked ? undefined : onClose}
          accessibilityLabel={t('common.close')}
        />
        <View
          accessibilityRole={'dialog' as never}
          aria-modal
          style={[styles.dialog, shadow.floating, { backgroundColor: colors.surface, borderRadius: radius.xl, borderColor: colors.border }]}
        >
          <View style={styles.dialogHeader}>
            <View style={{ flex: 1, gap: 2 }}>
              {title ? <Text variant="h2">{title}</Text> : null}
              {subtitle ? (
                <Text variant="caption" tone="muted">
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={onClose}
              disabled={locked}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              hitSlop={8}
              style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
                styles.close,
                { backgroundColor: hovered || pressed ? colors.surfaceAlt : 'transparent', opacity: locked ? 0.4 : 1 },
              ]}
            >
              <X size={20} color={colors.textMuted} />
            </Pressable>
          </View>
          {scroll ? (
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.dialogScroll} contentContainerStyle={styles.dialogBody}>
              {body}
            </ScrollView>
          ) : (
            <View style={styles.dialogBody}>{body}</View>
          )}
          {footer ? <View style={[styles.dialogFooter, { borderTopColor: colors.border }]}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: 560, maxWidth: '100%', maxHeight: '88%', borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  dialogHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 12 },
  close: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: -4, marginEnd: -8 },
  dialogScroll: { flexShrink: 1 },
  dialogBody: { paddingHorizontal: 24, paddingBottom: 24 },
  dialogFooter: { paddingHorizontal: 24, paddingVertical: 16, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  root: { flex: 1, justifyContent: 'flex-end' },
  kav: { justifyContent: 'flex-end' },
  sheet: { paddingHorizontal: 18, paddingTop: 8 },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
  },
  header: { marginBottom: 12, gap: 2 },
  body: { gap: 12 },
  footer: { marginTop: 16, gap: 10 },
});
