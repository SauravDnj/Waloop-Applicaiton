/**
 * "Pick date & time" that works everywhere. Android opens the system date
 * dialog then the time dialog (imperatively, so it works inside sheets and
 * modals); iOS shows an inline picker. The web build has its own file.
 */
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { CalendarClock } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

export type DateTimeFieldProps = { value: Date; onChange: (d: Date) => void; minimumDate?: Date; label: string; selected?: boolean };

const openAndroid = (value: Date, minimumDate: Date | undefined, onChange: (d: Date) => void) => {
  DateTimePickerAndroid.open({
    value,
    mode: 'date',
    minimumDate,
    onChange: (e, date) => {
      if (e.type !== 'set' || !date) return;
      const day = date;
      DateTimePickerAndroid.open({
        value,
        mode: 'time',
        onChange: (e2, time) => {
          if (e2.type !== 'set' || !time) return;
          const d = new Date(day);
          d.setHours(time.getHours(), time.getMinutes(), 0, 0);
          onChange(minimumDate && d < minimumDate ? minimumDate : d);
        },
      });
    },
  });
};

export function DateTimeField({ value, onChange, minimumDate, label, selected }: DateTimeFieldProps) {
  const { colors, radius } = useTheme();
  const [iosOpen, setIosOpen] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Pressable
        onPress={() => (Platform.OS === 'android' ? openAndroid(value, minimumDate, onChange) : setIosOpen((o) => !o))}
        style={[
          styles.btn,
          { borderRadius: radius.sm, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primarySoft : colors.surface },
        ]}
      >
        <CalendarClock size={15} color={colors.primary} />
        <Text variant="caption" style={{ color: selected ? colors.primary : colors.text, fontWeight: '500' }}>
          {label}
        </Text>
      </Pressable>
      {Platform.OS === 'ios' && iosOpen ? (
        <DateTimePicker value={value} mode="datetime" display="inline" minimumDate={minimumDate} onChange={(_, d) => d && onChange(d)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, alignSelf: 'flex-start' },
});
