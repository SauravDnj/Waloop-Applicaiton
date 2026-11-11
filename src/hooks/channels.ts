/** React Query hooks for channels. Writes invalidate `channelKeys.all` and the WhatsApp channel list. */
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { getChannel, listChannels } from '@/services/crm/channels';
import { waKeys } from './queries';

export const channelKeys = {
  all: ['channels'] as const,
  list: ['channels', 'list'] as const,
  one: (id: string) => ['channels', 'one', id] as const,
  prop: (id: string, prop: string) => ['channels', 'prop', id, prop] as const,
};

export const useChannels = () => useQuery({ queryKey: channelKeys.list, queryFn: () => listChannels(), staleTime: 60_000 });

export const useChannel = (id: string | undefined) =>
  useQuery({
    queryKey: channelKeys.one(id ?? ''),
    queryFn: () => getChannel(id!),
    enabled: !!id,
    staleTime: 30_000,
  });

export const useRefreshChannels = () => {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: channelKeys.all }), qc.invalidateQueries({ queryKey: waKeys.channels })]);
};
