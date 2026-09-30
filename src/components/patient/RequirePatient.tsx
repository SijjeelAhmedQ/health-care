import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppSelector } from '@/store';

/**
 * Patient selection is mandatory.
 *
 * Every patient-dependent route sits behind this guard. With no selected
 * patient the module is not rendered at all — the user is sent to the patient
 * list, which is where the choice is made. The route they were heading for
 * travels along, so selecting a patient takes them straight there.
 */
export function RequirePatient() {
  const location = useLocation();
  const currentPatientId = useAppSelector((s) => s.patients.currentPatientId);

  if (!currentPatientId) {
    return <Navigate to="/patients" replace state={{ needsPatientFor: location.pathname }} />;
  }
  return <Outlet />;
}
