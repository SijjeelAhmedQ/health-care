import { Suspense, useEffect } from 'react';
import { Drawer, Layout, Skeleton } from 'antd';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store';
import { uiActions } from '@/store/slices/uiSlice';
import { voiceActions } from '@/store/slices/voiceSlice';
import { fetchPatients } from '@/store/slices/patientSlice';
import { fetchAppointments } from '@/store/slices/appointmentSlice';
import { fetchProviders } from '@/store/slices/providerSlice';
import { fetchMedications, fetchPrescriptions } from '@/store/slices/medicationSlice';
import { NavigationRegistry } from '@/registry/navigationRegistry';
import { usePageTracking, useResponsive } from '@/hooks';
import { getVoiceController } from '@/services/ai/voiceController';
import { aiConfig } from '@/services/ai/config';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { VoiceAssistant } from '@/components/voice/VoiceAssistant';
import { CommandPalette } from '@/components/command-palette/CommandPalette';
import { DebugPanel } from '@/components/debug/DebugPanel';

function PageFallback() {
  return (
    <div>
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
  const { isMobile } = useResponsive();
  const collapsed = useAppSelector((s) => s.ui.sidebarCollapsed);
  const mobileOpen = useAppSelector((s) => s.ui.mobileSidebarOpen);
  usePageTracking();

  // Install imperative navigation for the command executor.
  useEffect(() => {
    NavigationRegistry.install((to, options) => (typeof to === 'number' ? navigate(to) : navigate(to, options)));
  }, [navigate]);

  // Bootstrap core datasets once.
  useEffect(() => {
    dispatch(fetchPatients());
    dispatch(fetchAppointments());
    dispatch(fetchProviders());
    dispatch(fetchMedications());
    dispatch(fetchPrescriptions());
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
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dispatch]);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <a href="#main-content" className="skip-link">Skip to content</a>
      {isMobile ? (
        <Drawer open={mobileOpen} placement="left" onClose={() => dispatch(uiActions.setMobileSidebarOpen(false))} width={280} styles={{ body: { padding: 0, background: '#0e1f2b' }, header: { display: 'none' } }}>
          <Sidebar collapsed={false} onCollapse={() => undefined} mobile onNavigate={() => dispatch(uiActions.setMobileSidebarOpen(false))} />
        </Drawer>
      ) : (
        <Sidebar collapsed={collapsed} onCollapse={(c) => dispatch(uiActions.setSidebarCollapsed(c))} />
      )}
      <Layout style={{ minWidth: 0 }}>
        <Header isMobile={isMobile} />
        <Layout.Content id="main-content" className="app-content" tabIndex={-1}>
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </Layout.Content>
      </Layout>
      {aiConfig.enableVoice && <VoiceAssistant />}
      <CommandPalette />
      {aiConfig.enableDebugPanel && <DebugPanel />}
    </Layout>
  );
}
