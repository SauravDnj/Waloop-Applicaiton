/**
 * A contact in a list: who, their label fields and tags; WhatsApp on the side.
 * Tap opens it; long-press selects (then taps add to the selection).
 */
import { Check, MessageCircle } from 'lucide-react-native';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ContactChips } from '@/components/leads/ContactChips';
import { ListRow, RoundAction, Text } from '@/components/ui';
import { messageOnWhatsApp } from '@/lib/actions';
import { formatPhone } from '@/lib/phone';
import type { Lead } from '@/services/crm/leads';
import { useTheme } from '@/theme/ThemeProvider';
import { openContact } from '@/stores/contactPanel';

type Props = {
  lead: Lead;
  selected?: boolean;
  selecting?: boolean;
  onSelect?: () => void;
  compact?: boolean;
};

function LeadCardInner({ lead, selected, selecting, onSelect }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const open = () => (selecting ? onSelect?.() : openContact(lead.id));

  const row = (
    <ListRow
      title={lead.name}
      avatarName={lead.name}
      avatarUri={lead.avatarUrl}
      selected={selected}
      onPress={open}
      onLongPress={onSelect}
      subtitle={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text variant="caption" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
            {lead.phone ? formatPhone(lead.phone) : t('leads.noNumber')}
          </Text>
        </View>
      }
      meta={
        <View style={{ marginTop: 5 }}>
          <ContactChips hash={lead.fields} tags={lead.tags} />
        </View>
      }
      trailing={
        selecting ? (
          <View
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              borderWidth: 2,
              borderColor: selected ? colors.primary : colors.borderStrong,
              backgroundColor: selected ? colors.primary : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {selected ? <Check size={15} color="#fff" /> : null}
          </View>
        ) : (
          <RoundAction
            size={38}
            tone="whatsapp"
            icon={<MessageCircle size={17} color="#128C7E" />}
            disabled={!lead.phone}
            onPress={() => messageOnWhatsApp({ phone: lead.phone, leadId: lead.id })}
          />
        )
      }
    />
  );

  return row;
}

export const LeadCard = memo(LeadCardInner);
