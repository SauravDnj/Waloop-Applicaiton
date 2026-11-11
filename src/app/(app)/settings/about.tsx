import * as Application from 'expo-application';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { BrandMark } from '@/components/Brand';
import { Screen, Text } from '@/components/ui';

export default function AboutScreen() {
  const { t } = useTranslation();
  const version = (Application.nativeApplicationVersion ?? '1.0').split('.').slice(0, 2).join('.');
  return (
    <Screen title={t('settings.about')} back>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 80 }}>
        <BrandMark size={84} />
        <Text variant="h2">Inbox And Campaigns</Text>
        <Text tone="muted">v{version}</Text>
      </View>
    </Screen>
  );
}
