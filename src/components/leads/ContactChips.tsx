/**
 * A contact's label values and tags as small chips, for list rows, inbox rows
 * and the chat header. A field shows here when the workspace marks it "show
 * as label" in CPaaS. Shows a few and counts the rest.
 */
import type { ContactTag } from '@ab-ecosystem/cpaas';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useFields } from '@/hooks/queries';
import { formatFieldValue } from '@/services/crm/fields';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * A tag's chip text. Its `icon` is either an emoji or an icon-library name from the
 * CPaaS panel (`FaTag`, `fa-tag`); only an emoji can be drawn as text, so a name is dropped.
 */
export const tagLabel = (tg: Pick<ContactTag, 'icon' | 'name'>) => {
  const icon = tg.icon?.trim();
  return icon && !/[A-Za-z0-9]/.test(icon) ? `${icon} ${tg.name}` : tg.name;
};

/** Only a full #RRGGBB colour can be tinted by appending alpha; anything else uses the default chip colours. */
const hex = (c?: string) => !!c && /^#[0-9a-f]{6}$/i.test(c);

export function ContactChips({
  hash,
  tags,
  max = 4,
  scroll = false,
}: {
  hash?: Record<string, unknown> | null;
  tags?: ContactTag[] | null;
  max?: number;
  /** One scrollable line with everything (chat header) instead of a few + "+N". */
  scroll?: boolean;
}) {
  const { colors } = useTheme();
  const fields = useFields();

  const values: { key: string; label: string; color?: string; field?: boolean }[] = [];
  for (const f of fields.data ?? []) {
    if (!f.showAsLabel) continue;
    const v = hash?.[f.slug];
    if (Array.isArray(v)) {
      for (const x of v) if (x) values.push({ key: `${f.slug}:${String(x)}`, label: String(x), field: true });
      continue;
    }
    const label = formatFieldValue(f, v);
    if (label) values.push({ key: f.slug, label, field: true });
  }
  for (const tg of tags ?? []) values.push({ key: tg.id, label: tagLabel(tg), color: tg.color || undefined });
  if (!values.length) return null;

  const shown = scroll ? values : values.slice(0, max);
  const rest = values.length - shown.length;
  const chips = (
    <>
      {shown.map((v) => (
        <View
          key={v.key}
          style={[
            styles.chip,
            // Tags look like field chips: the same filled pill, in the tag's own colour when it has one.
            { backgroundColor: v.field || !hex(v.color) ? colors.primarySoft : `${v.color}26` },
          ]}
        >
          <Text numberOfLines={1} style={[styles.text, { color: v.field || !hex(v.color) ? colors.primary : v.color }]}>
            {v.label}
          </Text>
        </View>
      ))}
      {rest > 0 ? (
        <View style={[styles.chip, { backgroundColor: colors.surfaceAlt }]}>
          <Text style={[styles.text, { color: colors.textMuted }]}>+{rest}</Text>
        </View>
      ) : null}
    </>
  );
  return scroll ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {chips}
    </ScrollView>
  ) : (
    // Whole chips only: they wrap onto a second line rather than being cut off mid-word.
    <View style={[styles.row, { flexWrap: 'wrap', rowGap: 4 }]}>{chips}</View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chip: { paddingHorizontal: 7, height: 18, borderRadius: 9, justifyContent: 'center', maxWidth: 120 },
  text: { fontSize: 10.5, fontWeight: '600' },
});
