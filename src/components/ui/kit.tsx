/**
 * Higher-level building blocks shared by every screen: list rows, stat tiles,
 * section headers, search, underline tabs, status dots, round action buttons
 * and grouped settings rows.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, Search, X } from 'lucide-react-native';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Avatar } from './Avatar';
import { Text } from './Text';
import { rtlFlip } from '@/lib/rtl';

/* ------------------------------ option colours ----------------------------- */

/**
 * A steady colour for a dropdown option (a board column, a chip): the same
 * option always gets the same colour, whatever the workspace calls it.
 */
export const useOptionColor = () => {
  const { colors } = useTheme();
  const palette = [colors.primary, colors.accent, colors.success, colors.warning, colors.danger, colors.sms];
  return (option: string): string => {
    if (!option) return colors.textFaint;
    let h = 0;
    for (let i = 0; i < option.length; i += 1) h = (h * 31 + option.charCodeAt(i)) | 0;
    return palette[Math.abs(h) % palette.length];
  };
};

export function StatusDot({ color, size = 10, ring }: { color: string; size?: number; ring?: string }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        borderWidth: ring ? 2 : 0,
        borderColor: ring,
      }}
    />
  );
}

/** Small rounded label with a dot, e.g. "● Follow-Up". */
export function StatusPill({ label, color, onPress, onHero }: { label: string; color: string; onPress?: () => void; onHero?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={[styles.pill, { backgroundColor: onHero ? colors.heroGlass : `${color}14` }]}>
      <StatusDot color={onHero ? '#fff' : color} size={6} />
      <Text variant="micro" style={{ color: onHero ? colors.onHero : color, fontWeight: '500', letterSpacing: 0 }}>
        {label}
      </Text>
    </Pressable>
  );
}

/* --------------------------------- list row -------------------------------- */

type ListRowProps = {
  title: string;
  subtitle?: ReactNode;
  meta?: ReactNode;
  avatarName?: string;
  avatarUri?: string;
  leading?: ReactNode;
  dotColor?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  titleTone?: 'default' | 'danger';
  chevron?: boolean;
};

/** The workhorse row: avatar with status dot, title, meta line(s), trailing slot. */
export function ListRow({
  title,
  subtitle,
  meta,
  avatarName,
  avatarUri,
  leading,
  dotColor,
  trailing,
  onPress,
  onLongPress,
  selected,
  titleTone = 'default',
  chevron,
}: ListRowProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: selected ? colors.primarySoft : pressed ? colors.surfaceAlt : 'transparent',
        },
      ]}
    >
      {leading ??
        (avatarName != null ? (
          <View>
            <Avatar name={avatarName} uri={avatarUri} size={42} />
            {dotColor ? (
              <View style={styles.dot}>
                <StatusDot color={dotColor} size={11} ring={colors.surface} />
              </View>
            ) : null}
          </View>
        ) : null)}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={1} tone={titleTone}>
          {title}
        </Text>
        {typeof subtitle === 'string' ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : (
          subtitle
        )}
        {typeof meta === 'string' ? (
          <Text variant="micro" tone="faint" numberOfLines={1}>
            {meta}
          </Text>
        ) : (
          meta
        )}
      </View>
      {trailing}
      {chevron ? <ChevronRight size={18} color={colors.textFaint} style={rtlFlip()} /> : null}
    </Pressable>
  );
}

/** Round icon action used at the end of rows (call, WhatsApp…). */
export function RoundAction({
  icon,
  onPress,
  tone = 'primary',
  size = 42,
  disabled,
  filled,
}: {
  icon: ReactNode;
  onPress?: () => void;
  tone?: 'primary' | 'success' | 'whatsapp' | 'neutral' | 'danger';
  size?: number;
  disabled?: boolean;
  filled?: boolean;
}) {
  const { colors } = useTheme();
  const bg = {
    primary: filled ? colors.primary : colors.primarySoft,
    success: filled ? colors.success : colors.successSoft,
    whatsapp: colors.whatsappSoft,
    neutral: colors.surfaceAlt,
    danger: filled ? colors.danger : colors.dangerSoft,
  }[tone];
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
          transform: [{ scale: pressed ? 0.94 : 1 }],
        },
      ]}
    >
      {icon}
    </Pressable>
  );
}

/* -------------------------------- stat tiles ------------------------------- */

export function StatTile({ icon, value, label, tint, style }: { icon?: ReactNode; value: string; label: string; tint?: string; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.stat, style]}>
      {icon ? <View style={[styles.statIcon, { backgroundColor: `${tint ?? colors.primary}1A` }]}>{icon}</View> : null}
      <Text variant="h2" style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text variant="micro" tone="muted" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/* ------------------------------ section header ----------------------------- */

export function SectionHeader({ title, action, onAction, style }: { title: string; action?: string; onAction?: () => void; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.section, style]}>
      <Text
        variant="micro"
        style={{
          color: colors.textMuted,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
        }}
      >
        {title}
      </Text>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text variant="caption" tone="primary" style={{ fontWeight: '700' }}>
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ---------------------------------- search --------------------------------- */

export function SearchField({
  value,
  onChangeText,
  placeholder,
  autoFocus,
  elevated,
  onSubmit,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  elevated?: boolean;
  onSubmit?: () => void;
}) {
  const { colors, radius, shadow } = useTheme();
  return (
    <View
      style={[
        styles.search,
        {
          backgroundColor: elevated ? colors.surface : colors.surfaceAlt,
          borderRadius: radius.md,
        },
        elevated && shadow.card,
      ]}
    >
      <Search size={18} color={colors.textFaint} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        autoFocus={autoFocus}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.searchInput, { color: colors.text }]}
      />
      {value ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={10} style={[styles.clear, { backgroundColor: colors.surfacePressed }]}>
          <X size={12} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/* ---------------------------------- tabs ----------------------------------- */

export function UnderlineTabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (v: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={styles.tab}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text variant="bodyStrong" style={{ color: active ? colors.text : colors.textFaint }}>
                {o.label}
              </Text>
              {o.count != null ? (
                <View
                  style={[
                    styles.count,
                    {
                      backgroundColor: active ? colors.primary : colors.surfaceAlt,
                    },
                  ]}
                >
                  <Text
                    variant="micro"
                    style={{
                      color: active ? colors.onPrimary : colors.textMuted,
                    }}
                  >
                    {o.count > 999 ? '999+' : o.count}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={[styles.underline, { backgroundColor: active ? colors.primary : 'transparent' }]} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* ------------------------------ settings group ----------------------------- */

export function Group({ title, children, style }: { title?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors, radius } = useTheme();
  return (
    <View style={[{ gap: 8 }, style]}>
      {title ? <SectionHeader title={title} style={{ paddingHorizontal: 4 }} /> : null}
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
    </View>
  );
}

export function GroupRow({
  icon,
  tint,
  title,
  subtitle,
  onPress,
  right,
  last,
  danger,
}: {
  icon: ReactNode;
  tint: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: ReactNode;
  last?: boolean;
  danger?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.groupRow, pressed && { backgroundColor: colors.surfaceAlt }]}>
      {/* One quiet icon style for every row (colour only where it means something: danger). */}
      <View style={[styles.groupIcon, { backgroundColor: danger ? `${tint}1F` : colors.surfaceAlt }]}>
        {danger || !isValidElement(icon) ? icon : cloneElement(icon as ReactElement<{ color?: string }>, { color: colors.textMuted })}
      </View>
      <View
        style={[
          styles.groupBody,
          !last && {
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong" tone={danger ? 'danger' : 'default'}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ?? (onPress ? <ChevronRight size={18} color={colors.textFaint} style={rtlFlip()} /> : null)}
      </View>
    </Pressable>
  );
}

/* ------------------------------- gradient disc ----------------------------- */

export function GradientDisc({ children, size = 72 }: { children: ReactNode; size?: number }) {
  const { colors } = useTheme();
  return (
    <LinearGradient
      colors={[colors.heroTo, colors.heroFrom]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </LinearGradient>
  );
}

/** Simple on/off switch. */
export function Switch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={() => onChange(!value)} hitSlop={8} style={[styles.switch, { backgroundColor: value ? colors.primary : colors.borderStrong }]}>
      <View style={[styles.knob, { alignSelf: value ? 'flex-end' : 'flex-start' }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dot: { position: 'absolute', bottom: -1, end: -1 },
  stat: { flex: 1, gap: 4, padding: 12 },
  statIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    height: 50,
  },
  searchInput: { flex: 1, fontSize: 15 },
  clear: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: { paddingHorizontal: 16, gap: 22 },
  tab: { paddingTop: 6, gap: 8 },
  count: {
    minWidth: 22,
    paddingHorizontal: 6,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  underline: { height: 3, borderRadius: 2 },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingStart: 14,
  },
  groupIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 13,
    paddingEnd: 14,
  },
  switch: { width: 46, height: 28, borderRadius: 14, padding: 3 },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
});
