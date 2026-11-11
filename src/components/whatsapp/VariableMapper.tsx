/**
 * Template variables, edited in place: each one is a text box to type or paste
 * into, and the box being edited shows the fields in one sideways row, where a
 * tap inserts that field (filled per lead at send time). A value that is just
 * one field is stored as that field. Everything starts empty.
 */
import { X } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View, type TextInputSelectionChangeEvent } from 'react-native';

import { Chip, Text } from '@/components/ui';
import { ChipRow } from '@/components/ui/ChipRow';
import { useFields } from '@/hooks/queries';
import { fieldLabel } from '@/services/crm/fields';
import { BASE_FIELDS, FIELD_TOKEN, fieldToken, type FieldOption, type Slot } from '@/services/crm/whatsapp';
import type { VariableSource } from '@/stores/whatsapp';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';

/** Name and phone, then every custom field the workspace has. */
export const useVariableFields = (): FieldOption[] => {
  const fields = useFields();
  const { t } = useTranslation();
  return useMemo(
    () => [
      ...BASE_FIELDS.map((f) => ({ key: f.key, label: String(t(`wa.field.${f.key}`, { defaultValue: f.label })) })),
      ...(fields.data ?? []).map((f) => ({ key: f.slug, label: fieldLabel(f) })),
    ],
    [fields.data, t],
  );
};

const slotLabel = (s: Slot, t: TFunction) =>
  s.part === 'header' ? t('wa.slotHeader', { name: s.name }) : s.part === 'button' ? t('wa.slotButton', { name: s.name }) : `{{${s.name}}}`;

const toText = (src?: VariableSource) => (!src ? '' : src.kind === 'field' ? fieldToken(src.key) : src.value);
const toSource = (text: string): VariableSource | null => {
  if (!text.trim()) return null;
  const only = /^\[\[\s*([a-zA-Z0-9_]+)\s*\]\]$/.exec(text.trim());
  return only ? { kind: 'field', key: only[1] } : { kind: 'text', value: text };
};

export function VariableMapper({
  slots,
  mapping,
  onChange,
  resolve,
  extraFields,
}: {
  slots: Slot[];
  mapping: Record<string, VariableSource>;
  onChange: (next: Record<string, VariableSource>) => void;
  /** The value a slot resolves to for the current lead (for the hint line). */
  resolve?: (slot: Slot) => string;
  /** More sources offered first, e.g. a CSV file's columns. */
  extraFields?: FieldOption[];
}) {
  const { t } = useTranslation();
  const leadFields = useVariableFields();
  const fields = extraFields?.length ? [...extraFields, ...leadFields] : leadFields;
  // The box being edited shows the field chips.
  const [active, setActive] = useState<string | null>(null);

  if (!slots.length)
    return (
      <Text variant="caption" tone="muted">
        {t('wa.noVariables')}
      </Text>
    );

  const set = (key: string, text: string) => {
    const src = toSource(text);
    const { [key]: _old, ...rest } = mapping;
    onChange(src ? { ...rest, [key]: src } : rest);
  };

  return (
    <View style={{ gap: 10 }}>
      {slots.map((s) => (
        <VariableRow
          key={s.key}
          slot={s}
          text={toText(mapping[s.key])}
          fields={fields}
          active={active === s.key}
          onFocus={() => setActive(s.key)}
          onChange={(v) => set(s.key, v)}
          resolved={resolve?.(s)}
          showResolved={!!resolve}
        />
      ))}
    </View>
  );
}

function VariableRow({
  slot,
  text,
  fields,
  active,
  onFocus,
  onChange,
  resolved,
  showResolved,
}: {
  slot: Slot;
  text: string;
  fields: FieldOption[];
  active: boolean;
  onFocus: () => void;
  onChange: (v: string) => void;
  resolved?: string;
  showResolved: boolean;
}) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const selection = useRef({ start: text.length, end: text.length });
  const labelOf = (k: string) => fields.find((f) => f.key === k)?.label ?? k;
  const insert = (key: string) => {
    const { start, end } = selection.current;
    const token = fieldToken(key);
    onChange(text.slice(0, start) + token + text.slice(end));
    selection.current = { start: start + token.length, end: start + token.length };
  };
  const hasTokens = /\[\[\s*[a-zA-Z0-9_]+\s*\]\]/.test(text);

  return (
    <View style={{ gap: 6 }}>
      <View style={[styles.box, { borderRadius: radius.md, borderColor: active ? colors.primary : text ? colors.border : colors.warning, backgroundColor: colors.surface }]}>
        <View style={[styles.slot, { backgroundColor: colors.primarySoft }]}>
          <Text variant="caption" style={{ color: colors.primary, fontWeight: '800' }}>
            {slotLabel(slot, t)}
          </Text>
        </View>
        <TextInput
          value={text}
          onChangeText={onChange}
          onFocus={onFocus}
          onSelectionChange={(e: TextInputSelectionChangeEvent) => {
            selection.current = e.nativeEvent.selection;
          }}
          placeholder={t('wa.typeOrField')}
          placeholderTextColor={colors.textFaint}
          multiline
          style={[styles.input, { color: colors.text, fontFamily: fonts.regular }]}
        />
        {text ? (
          <Pressable onPress={() => onChange('')} hitSlop={10} accessibilityLabel={t('wa.clearValue')}>
            <X size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {hasTokens ? (
        <Text variant="caption" tone="muted" numberOfLines={2}>
          {t('wa.looksLike')}{' '}
          <Text variant="caption" style={{ fontWeight: '600' }}>
            {text.replace(FIELD_TOKEN, (_: string, k: string) => `{${labelOf(k)}}`)}
          </Text>
        </Text>
      ) : null}
      {showResolved && text ? (
        <Text variant="caption" tone={resolved ? 'muted' : 'danger'} numberOfLines={1}>
          {resolved ? `→ ${resolved}` : t('wa.emptyForLead')}
        </Text>
      ) : null}
      {active ? (
        <ChipRow bleed={0}>
          {fields.map((f) => (
            <Chip key={f.key} small label={`+ ${f.label}`} onPress={() => insert(f.key)} />
          ))}
        </ChipRow>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1 },
  slot: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  input: { flex: 1, fontSize: 15, lineHeight: 20, paddingVertical: 6, maxHeight: 120 },
});
