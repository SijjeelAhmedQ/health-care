import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Button, Result } from 'antd';
import { useAppSelector } from '@/store';
import { AppLayout } from '@/components/layout/AppLayout';
import { RequirePatient } from '@/components/patient/RequirePatient';

/** Lazily load a named export from a page module. */
function named<M extends Record<string, unknown>>(loader: () => Promise<M>, key: keyof M): LazyExoticComponent<ComponentType> {
  return lazy(() => loader().then((m) => ({ default: m[key] as ComponentType })));
}

const records = () => import('@/pages/RecordModulePages');

const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const PatientModulePage = lazy(() => import('@/pages/PatientModulePage'));
const SummaryPage = lazy(() => import('@/pages/SummaryPage'));
const InboxPage = lazy(() => import('@/pages/InboxPage'));
const MedicationPage = named(records, 'MedicationPage');
const DiagnosisPage = named(records, 'DiagnosisPage');
const TaskPage = named(records, 'TaskPage');
const RecallPage = named(records, 'RecallPage');
const AppointmentPage = named(records, 'AppointmentPage');
const LoginPage = lazy(() => import('@/pages/LoginPage'));

function RequireAuth() {
  const status = useAppSelector((s) => s.auth.status);
  const location = useLocation();
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** The front door: the patient list until someone is selected, the dashboard after. */
function Home() {
  const hasPatient = useAppSelector((s) => !!s.patients.currentPatientId);
  return <Navigate to={hasPatient ? '/dashboard' : '/patients'} replace />;
}

function NotFound() {
  return (
    <Result
      status="404"
      title="Page not found"
      subTitle="This application has eight modules: Dashboard, Patient, Medication, Diagnosis, Task, Recall, Appointment and Summary."
      extra={
        <Button type="primary" href="/dashboard">
          Back to dashboard
        </Button>
      }
    />
  );
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Home /> },
          // These two work without a selected patient: the Patient module is where
          // the patient is chosen, and the Inbox is a provider workqueue that spans
          // patients (it makes each item's patient explicit instead).
          { path: '/patients', Component: PatientModulePage },
          { path: '/inbox', element: <Navigate to="/inbox/lab" replace /> },
          { path: '/inbox/:category', Component: InboxPage },
          {
            // Everything below is patient-dependent and is not rendered at all
            // until a patient has been selected.
            element: <RequirePatient />,
            children: [
              { path: '/dashboard', Component: DashboardPage },
              { path: '/medications', Component: MedicationPage },
              { path: '/diagnoses', Component: DiagnosisPage },
              { path: '/tasks', Component: TaskPage },
              { path: '/recalls', Component: RecallPage },
              { path: '/appointments', Component: AppointmentPage },
              { path: '/summary', Component: SummaryPage },
              { path: '/summary/:tab', Component: SummaryPage },
            ],
          },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]);
