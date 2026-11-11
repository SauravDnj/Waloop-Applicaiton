import { useCallback, useState } from 'react';

/** State for a pull-to-refresh control around any async reload. */
export const usePullRefresh = (reload: () => unknown) => {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  }, [reload]);
  return { refreshing, onRefresh };
};
