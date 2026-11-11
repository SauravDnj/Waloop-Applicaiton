import { Check, Languages } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { reloadAppAsync } from 'expo';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { confirmAction } from '@/lib/dialog';
import { Card, Row, Screen, Text } from '@/components/ui';
import { applyLanguage, LANGUAGES, type LanguageCode } from '@/i18n';
import { useSettingsStore } from '@/stores/settings';
import { useTheme } from '@/theme/ThemeProvider';

export default function LanguageScreen() {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const [busy, setBusy] = useState<LanguageCode | null>(null);

  const pick = async (code: LanguageCode) => {
    if (code === language) return;
    setBusy(code);
    setLanguage(code);
    const needsReload = await applyLanguage(code);
    setBusy(null);
    if (needsReload && Platform.OS !== 'web') {
      const ok = await confirmAction({
        title: t('language.reloadTitle'),
        message: t('language.reloadBody'),
        confirmText: t('language.reloadNow'),
        cancelText: t('language.later'),
      });
      // Works in release builds too (React Native's DevSettings.reload only does in development).
      if (ok) void reloadAppAsync('Language direction changed').catch(() => undefined);
    }
  };

  return (
    <Screen title={t('language.title')} subtitle={t('language.subtitle')} back scroll>
      <Card padded={false} style={{ marginTop: 8 }}>
        {LANGUAGES.map((l, i) => {
          const active = l.code === language;
          return (
            <Pressable
              key={l.code}
              onPress={() => void pick(l.code)}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
                  borderTopWidth: i ? StyleSheet.hairlineWidth : 0,
                  borderTopColor: colors.border,
                },
              ]}
            >
              <View
                style={[
                  styles.icon,
                  {
                    backgroundColor: active ? colors.primarySoft : colors.surfaceAlt,
                    borderRadius: radius.sm,
                  },
                ]}
              >
                <Languages size={18} color={active ? colors.primary : colors.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{l.native}</Text>
                <Text variant="caption" tone="muted">
                  {l.name}
                  {l.rtl ? ' · RTL' : ''}
                </Text>
              </View>
              {busy === l.code ? null : active ? <Check size={18} color={colors.primary} /> : null}
            </Pressable>
          );
        })}
      </Card>
      {LANGUAGES.find((l) => l.code === language)?.rtl ? (
        <Row gap={8} style={{ marginTop: 12 }}>
          <Text variant="caption" tone="muted">
            {t('language.rtlNote')}
          </Text>
        </Row>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  icon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
