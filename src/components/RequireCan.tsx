/**
 * A page a member reached without the permission for it (by a link, or a
 * screen kept open after their role changed): a plain "not allowed" page
 * instead of one whose every request fails.
 */
import { ShieldOff } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { EmptyState, Screen } from '@/components/ui';
import { useCanAll, useCanAny } from '@/stores/auth';

/** `any`: one of these is enough; `all`: each is needed too. */
export function RequireCan({ any = [], all = [], children }: { any?: string[]; all?: string[]; children: ReactNode }) {
  const { t } = useTranslation();
  const anyOk = useCanAny(any);
  const allOk = useCanAll(all);
  const allowed = (!any.length || anyOk) && allOk;
  if (allowed) return <>{children}</>;
  return (
    <Screen back>
      <EmptyState icon={<ShieldOff size={26} color="#fff" />} title={t('perm.deniedTitle')} body={t('perm.deniedBody')} />
    </Screen>
  );
}
