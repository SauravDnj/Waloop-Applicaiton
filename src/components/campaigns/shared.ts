import type { CampaignState } from '@/services/crm/campaigns';
import { useTheme } from '@/theme/ThemeProvider';

export const campaignKeys = {
  all: ['campaigns'] as const,
  list: (status: string) => ['campaigns', 'list', status] as const,
  one: (id: string) => ['campaigns', 'one', id] as const,
  stats: (id: string) => ['campaigns', 'stats', id] as const,
  replies: (id: string) => ['campaigns', 'replies', id] as const,
  rows: (id: string, status: string) => ['campaigns', 'rows', id, status] as const,
};

export const useStateColor = () => {
  const { colors } = useTheme();
  return (s: CampaignState) =>
    ({ draft: colors.textMuted, scheduled: colors.warning, sending: colors.primary, completed: colors.success, failed: colors.danger, cancelled: colors.textFaint })[s];
};
