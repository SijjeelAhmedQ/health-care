import { useMemo } from 'react';
import { useAppSelector, type RootState } from '@/store';
import { providerSelectors } from '@/store/slices/providerSlice';
import { patientSelectors } from '@/store/slices/patientSlice';
import { appointmentsSlice, recallsSlice, tasksSlice } from '@/store/slices/recordSlices';
import { buildProviderWorkload, type ProviderWorkload } from '@/services/provider/providerWorkload';
import type { Provider } from '@/types/domain';

/** The provider record of the signed-in user. */
export const selectCurrentProvider = (s: RootState): Provider | undefined => {
  const id = s.auth.user?.providerId;
  return id ? providerSelectors.selectById(s, id) : undefined;
};

export function useCurrentProvider() {
  return useAppSelector(selectCurrentProvider);
}

/** Everything on the signed-in provider's plate, recomputed whenever the data changes. */
export function useProviderWorkload(): { workload: ProviderWorkload | null; loading: boolean } {
  const provider = useCurrentProvider();
  const patients = useAppSelector(patientSelectors.selectAll);
  const appointments = useAppSelector(appointmentsSlice.selectors.selectAll);
  const tasks = useAppSelector(tasksSlice.selectors.selectAll);
  const recalls = useAppSelector(recallsSlice.selectors.selectAll);
  const inbox = useAppSelector((s) => s.inbox.items);
  const reviewedInboxIds = useAppSelector((s) => s.inbox.reviewedIds);
  const loading = useAppSelector(
    (s) => s.providers.status !== 'succeeded' || s.appointments.status === 'loading' || s.tasks.status === 'loading' || s.recalls.status === 'loading' || s.patients.status === 'loading',
  );

  const workload = useMemo(
    () => (provider ? buildProviderWorkload({ provider, patients, appointments, tasks, recalls, inbox, reviewedInboxIds }) : null),
    [provider, patients, appointments, tasks, recalls, inbox, reviewedInboxIds],
  );
  return { workload, loading };
}
