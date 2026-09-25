import { lazy } from 'react';
import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Button, Result } from 'antd';
import { useAppSelector } from '@/store';
import { AppLayout } from '@/components/layout/AppLayout';
import { RequirePatient } from '@/components/patient/RequirePatient';

const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const PatientModulePage = lazy(() => import('@/pages/PatientModulePage'));
const SummaryPage = lazy(() => import('@/pages/SummaryPage'));
const InboxPage = lazy(() => import('@/pages/InboxPage'));
const ConfigurationPage = lazy(() => import('@/pages/ConfigurationPage'));
const LoginPage = lazy(() => import('@/pages/LoginPage'));

function RequireAuth() {
  const status = useAppSelector((s) => s.auth.status);
  const location = useLocation();
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}


function NotFound() {
  return (
    <Result
      status="404"
      title="Page not found"
      subTitle="This application has Dashboard, Patients, Inbox, Summary and Configuration."
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
          // The front door is the signed-in provider's own dashboard.
          { index: true, element: <Navigate to="/dashboard" replace /> },
          // These work without a selected patient: the Dashboard is the provider's
          // own view, the Patient module is where the patient is chosen, and the
          // Inbox is a provider workqueue that spans patients.
          { path: '/dashboard', Component: DashboardPage },
          { path: '/patients', Component: PatientModulePage },
          { path: '/configuration', Component: ConfigurationPage },
          { path: '/inbox', element: <Navigate to="/inbox/all" replace /> },
          { path: '/inbox/:category', Component: InboxPage },
          {
            // The Summary is the selected patient's chart, and is not rendered at
            // all until a patient has been selected.
            element: <RequirePatient />,
            children: [
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
