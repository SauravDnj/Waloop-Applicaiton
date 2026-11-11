/** Web: the browser's own date-and-time input, styled like a chip. */
import { CalendarClock } from 'lucide-react-native';
import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

export type DateTimeFieldProps = { value: Date; onChange: (d: Date) => void; minimumDate?: Date; label: string; selected?: boolean };

/** `YYYY-MM-DDTHH:mm` in local time, the format datetime-local uses. */
const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function DateTimeField({ value, onChange, minimumDate, label, selected }: DateTimeFieldProps) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderWidth: 1,
        borderRadius: 10,
        alignSelf: 'flex-start',
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.primarySoft : colors.surface,
      }}
    >
      <CalendarClock size={15} color={colors.primary} />
      <Text variant="caption" style={{ color: colors.text, fontWeight: '500' }}>
        {label}
      </Text>
      <input
        type="datetime-local"
        value={toLocalInput(value)}
        min={minimumDate ? toLocalInput(minimumDate) : undefined}
        onChange={(e) => {
          const d = new Date(e.currentTarget.value);
          if (!Number.isNaN(d.getTime())) onChange(minimumDate && d < minimumDate ? minimumDate : d);
        }}
        style={{
          border: 'none',
          background: 'transparent',
          color: colors.text,
          font: 'inherit',
          fontSize: 13,
          outline: 'none',
          colorScheme: colors.scheme,
        }}
      />
    </View>
  );
}
