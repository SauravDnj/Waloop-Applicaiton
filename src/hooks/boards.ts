import { useMemo } from 'react';

import { useFields } from '@/hooks/queries';
import { boardFields, dropdownOptions, fieldLabel } from '@/services/crm/fields';

export type Board = { slug: string; label: string; options: string[] };

/** The workspace's boards: every dropdown custom field. */
export const useBoards = (): { boards: Board[]; isLoading: boolean } => {
  const fields = useFields();
  const boards = useMemo(
    () => boardFields(fields.data).map((f) => ({ slug: f.slug, label: fieldLabel(f), options: dropdownOptions(f) })),
    [fields.data],
  );
  return { boards, isLoading: fields.isLoading };
};
