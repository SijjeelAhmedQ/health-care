import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Button, Result } from 'antd';
import { useAppSelector } from '@/store';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageRegistry } from '@/registry/pageRegistry';

/**
 * Lazily loads a named export from a page module. Each module bundles a
 * feature area so the initial payload stays small while related pages share
 * a chunk.
 */
function named<M extends Record<string, unknown>>(loader: () => Promise<M>, key: keyof M): LazyExoticComponent<ComponentType> {
  return lazy(() => loader().then((m) => ({ default: m[key] as ComponentType })));
}

const dashboards = () => import('@/pages/dashboard/OtherDashboards');
const patients = () => import('@/pages/patients/PatientListPages');
const clinicalNotes = () => import('@/pages/clinical/ClinicalNotesPages');
const clinicalLists = () => import('@/pages/clinical/ClinicalListPages');
const appointments = () => import('@/pages/appointments/AppointmentPages');
const providers = () => import('@/pages/providers/ProviderPages');
const roster = () => import('@/pages/roster/RosterPages');
const practice = () => import('@/pages/practice/PracticePages');
const users = () => import('@/pages/users/UserPages');
const configuration = () => import('@/pages/configuration/ConfigurationPages');
const reports = () => import('@/pages/reports/ReportPages');

/** Page id -> component. Paths come from the PageRegistry so they never drift. */
const components: Record<string, LazyExoticComponent<ComponentType>> = {
  dashboard: lazy(() => import('@/pages/dashboard/ExecutiveDashboard')),
  'practice-dashboard': named(dashboards, 'PracticeDashboard'),
  'provider-dashboard': named(dashboards, 'ProviderDashboard'),
  'operations-dashboard': named(dashboards, 'OperationsDashboard'),
  'financial-overview': named(dashboards, 'FinancialOverview'),
  'clinical-overview': named(dashboards, 'ClinicalOverview'),

  'patient-search': named(patients, 'PatientSearchPage'),
  'patient-list': named(patients, 'PatientListPage'),
  'patient-registration': named(patients, 'PatientRegistrationPage'),
  'patient-profile': lazy(() => import('@/pages/patients/PatientProfilePage')),

  'consultation-dashboard': named(clinicalNotes, 'ConsultationDashboardPage'),
  consultation: lazy(() => import('@/pages/clinical/ConsultationPage')),
  'clinical-notes': named(clinicalNotes, 'ClinicalNotesPage'),
  'soap-notes': named(clinicalNotes, 'SoapNotesPage'),
  'treatment-plan': named(clinicalNotes, 'TreatmentPlanPage'),
  diagnosis: named(clinicalLists, 'DiagnosisPage'),
  medications: named(clinicalLists, 'MedicationsPage'),
  prescriptions: named(clinicalLists, 'PrescriptionsPage'),
  'lab-orders': named(clinicalLists, 'LabOrdersPage'),
  'imaging-orders': named(clinicalLists, 'ImagingOrdersPage'),
  referrals: named(clinicalLists, 'ReferralsPage'),
  'clinical-documents': named(clinicalLists, 'ClinicalDocumentsPage'),

  'appointment-dashboard': named(appointments, 'AppointmentDashboardPage'),
  'appointment-search': named(appointments, 'AppointmentSearchPage'),
  'appointment-calendar': lazy(() => import('@/pages/appointments/AppointmentCalendarPage')),
  'create-appointment': named(appointments, 'CreateAppointmentPage'),
  'appointment-details': named(appointments, 'AppointmentDetailsPage'),
  'appointment-queue': named(appointments, 'AppointmentQueuePage'),
  'appointment-history': named(appointments, 'AppointmentHistoryPage'),
  'appointment-types': named(appointments, 'AppointmentTypesPage'),
  'appointment-status': named(appointments, 'AppointmentStatusPage'),

  'provider-list': named(providers, 'ProviderListPage'),
  'provider-profile': named(providers, 'ProviderProfilePage'),
  'provider-availability': named(providers, 'ProviderAvailabilityPage'),
  'provider-schedule': named(providers, 'ProviderSchedulePage'),
  'provider-performance': named(providers, 'ProviderPerformancePage'),
  'provider-credentials': named(providers, 'ProviderCredentialsPage'),

  'roster-dashboard': named(roster, 'RosterDashboardPage'),
  'create-roster': named(roster, 'CreateRosterPage'),
  'roster-calendar': named(roster, 'RosterCalendarPage'),
  'shift-management': named(roster, 'ShiftManagementPage'),
  'availability-management': named(roster, 'AvailabilityManagementPage'),
  'leave-management': named(roster, 'LeaveManagementPage'),

  'practice-management': named(practice, 'PracticeManagementPage'),
  'practice-profile': named(practice, 'PracticeProfilePage'),
  locations: named(practice, 'LocationsPage'),
  departments: named(practice, 'DepartmentsPage'),
  specialties: named(practice, 'SpecialtiesPage'),
  services: named(practice, 'ServicesPage'),
  rooms: named(practice, 'RoomsPage'),
  resources: named(practice, 'ResourcesPage'),

  'user-dashboard': named(users, 'UserDashboardPage'),
  'user-list': named(users, 'UserListPage'),
  'create-user': named(users, 'CreateUserPage'),
  'user-profile': named(users, 'UserProfilePage'),
  roles: named(users, 'RolesPage'),
  permissions: named(users, 'PermissionsPage'),
  'access-control': named(users, 'AccessControlPage'),
  'audit-logs': named(users, 'AuditLogsPage'),

  'general-configuration': named(configuration, 'GeneralConfigurationPage'),
  'clinical-configuration': named(configuration, 'ClinicalConfigurationPage'),
  'appointment-configuration': named(configuration, 'AppointmentConfigurationPage'),
  'medication-configuration': named(configuration, 'MedicationConfigurationPage'),
  'notification-configuration': named(configuration, 'NotificationConfigurationPage'),
  'security-configuration': named(configuration, 'SecurityConfigurationPage'),
  'system-preferences': named(configuration, 'SystemPreferencesPage'),

  'clinical-reports': named(reports, 'ClinicalReportsPage'),
  'patient-reports': named(reports, 'PatientReportsPage'),
  'appointment-reports': named(reports, 'AppointmentReportsPage'),
  'provider-reports': named(reports, 'ProviderReportsPage'),
  'practice-reports': named(reports, 'PracticeReportsPage'),
  'audit-reports': named(reports, 'AuditReportsPage'),

  'voice-console': lazy(() => import('@/pages/dev/VoiceConsolePage')),
};

/** Tab pages render their parent (the parent reads :tab from the URL). */
const routeComponent = (pageId: string) => {
  const page = PageRegistry.get(pageId)!;
  return components[page.parentId ?? pageId];
};

function RequireAuth() {
  const status = useAppSelector((s) => s.auth.status);
  const location = useLocation();
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

function NotFound() {
  return <Result status="404" title="Page not found" subTitle="The page you asked for is not in the page registry." extra={<Button type="primary" href="/dashboard">Back to dashboard</Button>} />;
}

const LoginPage = lazy(() => import('@/pages/LoginPage'));

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          // Explicit parent + tab routes for profiles.
          { path: '/patients/:id/:tab', Component: components['patient-profile'] },
          { path: '/providers/:id/:tab', Component: components['provider-profile'] },
          ...PageRegistry.all()
            .filter((p) => !p.parentId)
            .map((p) => ({ path: p.path, Component: routeComponent(p.id) })),
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]);
