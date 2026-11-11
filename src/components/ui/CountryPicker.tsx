import { Check, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { searchCountries, type Country } from '@/lib/countries';
import { useTheme } from '@/theme/ThemeProvider';
import { Sheet } from './Sheet';
import { Text } from './Text';

type Props = {
  open: boolean;
  value?: Country;
  onClose: () => void;
  onSelect: (c: Country) => void;
  title: string;
  showDial?: boolean;
};

/** Searchable country list: flag, name, +dial code. Used for the dial code and the country field. */
export function CountryPicker({ open, value, onClose, onSelect, title, showDial = true }: Props) {
  if (!open) return null;
  return <PickerBody value={value} onClose={onClose} onSelect={onSelect} title={title} showDial={showDial} />;
}

function PickerBody({ value, onClose, onSelect, title, showDial }: Omit<Props, 'open'>) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const [q, setQ] = useState('');
  const rows = useMemo(() => searchCountries(q), [q]);
  return (
    <Sheet open onClose={onClose} title={title} scroll={false}>
      <View style={[styles.search, { backgroundColor: colors.surfaceAlt, borderRadius: radius.md }]}>
        <Search size={16} color={colors.textFaint} />
        <TextInput
          autoFocus
          placeholder={t('auth.searchCountry')}
          placeholderTextColor={colors.textFaint}
          value={q}
          onChangeText={setQ}
          style={[styles.input, { color: colors.text }]}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(c) => c.code}
        style={{ maxHeight: 380 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item: c }) => {
          const active = value?.code === c.code;
          return (
            <Pressable
              onPress={() => onSelect(c)}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: pressed || active ? colors.surfaceAlt : 'transparent',
                  borderRadius: radius.sm,
                },
              ]}
            >
              <Text style={{ fontSize: 22 }}>{c.flag}</Text>
              <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                {c.name}
              </Text>
              {showDial ? (
                <Text variant="caption" tone="muted">
                  +{c.dial}
                </Text>
              ) : null}
              {active ? <Check size={16} color={colors.primary} /> : null}
            </Pressable>
          );
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 44,
  },
  input: { flex: 1, fontSize: 15 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
});
