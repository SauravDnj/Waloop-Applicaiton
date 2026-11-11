/**
 * Text that mixes fixed words and custom fields. Tapping a field chip inserts a
 * `[[field]]` token at the cursor; each lead gets its own value when the
 * message is sent. A preview line shows the result with field names.
 */
import { Plus, Type } from 'lucide-react-native';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View, type TextInputSelectionChangeEvent } from 'react-native';

import { Text } from '@/components/ui';
import { FIELD_TOKEN, fieldToken, type FieldOption } from '@/services/crm/whatsapp';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';
import { useVariableFields } from './VariableMapper';

export function TokenTextInput({
  value,
  onChange,
  placeholder,
  minHeight = 64,
  label,
  extraFields,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minHeight?: number;
  label?: string;
  /** More fields offered first, e.g. a CSV file's columns. */
  extraFields?: FieldOption[];
}) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const leadFields = useVariableFields();
  const fields = extraFields?.length ? [...extraFields, ...leadFields] : leadFields;
  const selection = useRef({ start: value.length, end: value.length });
  const labelOf = (k: string) => fields.find((f) => f.key === k)?.label ?? k;

  const insert = (key: string) => {
    const { start, end } = selection.current;
    const token = fieldToken(key);
    onChange(value.slice(0, start) + token + value.slice(end));
    selection.current = { start: start + token.length, end: start + token.length };
  };
  const hasTokens = /\[\[\s*[a-zA-Z0-9_]+\s*\]\]/.test(value);

  return (
    <View style={{ gap: 8 }}>
      {label ? (
        <Text variant="caption" tone="muted" style={{ fontWeight: '500' }}>
          {label}
        </Text>
      ) : null}
      <View style={[styles.composer, { borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, minHeight }]}>
        <Type size={16} color={colors.textMuted} style={{ marginTop: 2 }} />
        <TextInput
          value={value}
          onChangeText={onChange}
          onSelectionChange={(e: TextInputSelectionChangeEvent) => {
            selection.current = e.nativeEvent.selection;
          }}
          placeholder={placeholder ?? t('wa.customTextPh')}
          placeholderTextColor={colors.textFaint}
          multiline
          style={[styles.input, { color: colors.text, fontFamily: fonts.regular }]}
        />
      </View>
      {hasTokens ? (
        <Text variant="caption" tone="muted">
          {t('wa.looksLike')}{' '}
          <Text variant="caption" style={{ fontWeight: '600' }}>
            {value.replace(FIELD_TOKEN, (_: string, k: string) => `{${labelOf(k)}}`)}
          </Text>
        </Text>
      ) : null}
      <Text variant="micro" tone="faint">
        {t('wa.insertField').toUpperCase()}
      </Text>
      <View style={styles.chips}>
        {fields.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => insert(f.key)}
            style={({ pressed }) => [styles.chip, { borderColor: colors.border, backgroundColor: pressed ? colors.primarySoft : colors.surface }]}
          >
            <Plus size={12} color={colors.primary} />
            <Text variant="caption">{f.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  composer: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderWidth: 1 },
  input: { flex: 1, fontSize: 15, lineHeight: 21, padding: 0, minHeight: 40 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderRadius: 8 },
});
