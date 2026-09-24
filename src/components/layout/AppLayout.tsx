import { Suspense, useEffect } from 'react';
import { Layout, Skeleton } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store';
import { uiActions } from '@/store/slices/uiSlice';
import { voiceActions } from '@/store/slices/voiceSlice';
import { fetchPatients } from '@/store/slices/patientSlice';
import { fetchProviders } from '@/store/slices/providerSlice';
import { appointmentsSlice, diagnosesSlice, medicationsSlice, recallsSlice, tasksSlice } from '@/store/slices/recordSlices';
import { NavigationRegistry } from '@/registry/navigationRegistry';
import { PageRegistry } from '@/registry/pageRegistry';
import { usePageTracking, useResponsive } from '@/hooks';
import { getVoiceController } from '@/services/ai/voiceController';
import { aiConfig } from '@/services/ai/config';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { SelectedPatientBanner } from '@/components/patient/SelectedPatientBanner';
import { DashboardSummaryWidget } from '@/components/dashboard/DashboardSummaryWidget';
import { VoiceAssistant } from '@/components/voice/VoiceAssistant';
import { VoiceConfirmDialog } from '@/components/voice/VoiceConfirmDialog';
import { CommandPalette } from '@/components/command-palette/CommandPalette';
import { DebugPanel } from '@/components/debug/DebugPanel';

function PageFallback() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading page…</span>
      <Skeleton active paragraph={{ rows: 1 }} style={{ maxWidth: 400 }} />
      <div className="metric-grid" style={{ marginTop: 16 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="metric-card">
            <Skeleton active paragraph={{ rows: 1 }} />
          </div>
        ))}
      </div>
      <Skeleton active paragraph={{ rows: 8 }} />
    </div>
  );
}

export function AppLayout() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobile, isTablet } = useResponsive();
  const collapsed = useAppSelector((s) => s.ui.sidebarCollapsed);
  const hasPatient = useAppSelector((s) => !!s.patients.currentPatientId);
  // "show dashboard summary" docks the dashboard to the right; it belongs to the
  // selected patient, so it is only on screen while there is one.
  const dashboardSummaryOpen = useAppSelector((s) => s.ui.dashboardSummaryOpen) && hasPatient;
  usePageTracking();

  // Install imperative navigation for the command executor.
  useEffect(() => {
    NavigationRegistry.install((to, options) => (typeof to === 'number' ? navigate(to) : navigate(to, options)));
  }, [navigate]);

  // Bootstrap every dataset once — the banner and dashboard need all of them.
  useEffect(() => {
    dispatch(fetchPatients());
    dispatch(fetchProviders());
    dispatch(medicationsSlice.fetchAll());
    dispatch(diagnosesSlice.fetchAll());
    dispatch(tasksSlice.fetchAll());
    dispatch(recallsSlice.fetchAll());
    dispatch(appointmentsSlice.fetchAll());
  }, [dispatch]);

  // Global keyboard shortcuts.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        dispatch(uiActions.setCommandPaletteOpen(true));
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        getVoiceController().toggleListening();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd' && aiConfig.enableDebugPanel) {
        e.preventDefault();
        dispatch(uiActions.setDebugPanelOpen(true));
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b' && !typing) {
        e.preventDefault();
        dispatch(uiActions.toggleSidebar());
      } else if (e.key === 'Escape') {
        dispatch(voiceActions.setPanelOpen(false));
        dispatch(uiActions.setDashboardSummaryOpen(false));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dispatch]);

  // The mobile menu only exists on small screens — never leave it "open" behind a desktop layout.
  useEffect(() => {
    if (!isMobile) dispatch(uiActions.setMobileSidebarOpen(false));
  }, [isMobile, dispatch]);

  // On a tablet the full sidebar costs a third of the width, so start collapsed there.
  useEffect(() => {
    if (isTablet) dispatch(uiActions.setSidebarCollapsed(true));
  }, [isTablet, dispatch]);

  // The banner belongs to the patient workflow — it is shown wherever a patient
  // is selected, so the active context is never in doubt. The Inbox is the
  // exception: it spans every patient and names each item's own patient, so a
  // banner for a different (selected) patient above it would invite a
  // wrong-patient mistake. The selection stays visible in the header and sidebar.
  const page = PageRegistry.matchPath(location.pathname);
  const showBanner = hasPatient && page?.id !== undefined && page.module !== 'inbox';

  return (
    // The shell is exactly one viewport tall: the header, sidebar and mobile nav
    // stay put, and only #main-content (or a region inside a workspace page) scrolls.
    <Layout className={`app-shell${dashboardSummaryOpen ? ' has-right-dock' : ''}`}>
      <a href="#main-content" className="skip-link">Skip to content</a>
      {!isMobile && <Sidebar collapsed={collapsed} onCollapse={(c) => dispatch(uiActions.setSidebarCollapsed(c))} />}
      <Layout className="app-main">
        <Header isMobile={isMobile} />
        <Layout.Content id="main-content" className="app-content" tabIndex={-1}>
          {showBanner && <SelectedPatientBanner />}
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </Layout.Content>
      </Layout>
      {dashboardSummaryOpen && <DashboardSummaryWidget />}
      {isMobile && <MobileNav />}
      {aiConfig.enableVoice && <VoiceAssistant />}
      <VoiceConfirmDialog />
      <CommandPalette />
      {aiConfig.enableDebugPanel && <DebugPanel />}
    </Layout>
  );
}
