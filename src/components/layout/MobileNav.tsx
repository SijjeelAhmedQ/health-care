import { useState } from 'react';
import { Button, Modal, Tag } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { Activity, ClipboardList, Inbox, LayoutDashboard, LogOut, Menu as MenuIcon, Settings, UserRound, UserRoundCog, Users, X } from 'lucide-react';
import { PageRegistry, moduleLabels, type PageModule } from '@/registry/pageRegistry';
import { useAppDispatch, useAppSelector } from '@/store';
import { uiActions } from '@/store/slices/uiSlice';
import { logout } from '@/store/slices/authSlice';
import { selectCurrentPatient } from '@/store/slices/patientSlice';
import { Avatar } from '@/components/common';
import { PatientPicker } from '@/components/patient/PatientPicker';

export const moduleIcons: Record<PageModule, JSX.Element> = {
  dashboard: <LayoutDashboard size={18} />,
  patient: <Users size={18} />,
  inbox: <Inbox size={18} />,
  summary: <ClipboardList size={18} />,
  configuration: <Settings size={18} />,
};

/** The patient-work modules in the bottom bar; the rest (Configuration) is in the full menu. */
const primary: Array<{ label: string; path: string; module: PageModule }> = PageRegistry.sidebarPages()
  .filter((p) => p.module !== 'configuration')
  .map((p) => ({ label: moduleLabels[p.module], path: p.path, module: p.module }));

/**
 * Mobile navigation. A fixed bottom bar for the most-used modules and a
 * full-screen menu dialog for the rest — no slide-out drawer anywhere.
 */
export function MobileNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const open = useAppSelector((s) => s.ui.mobileSidebarOpen);
  const currentPage = PageRegistry.matchPath(location.pathname);
  const activeModule = currentPage?.module;

  const setOpen = (v: boolean) => dispatch(uiActions.setMobileSidebarOpen(v));

  return (
    <>
      <nav className="mobile-nav" aria-label="Main navigation">
        <div className="mobile-nav-inner">
          {primary.map((item) => {
            const active = activeModule === item.module && !open;
            return (
              <button
                key={item.path}
                type="button"
                className={`mobile-nav-item ${active ? 'active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => {
                  setOpen(false);
                  navigate(item.path);
                }}
              >
                <span className="mobile-nav-icon">{moduleIcons[item.module]}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
          <button type="button" className={`mobile-nav-item ${open ? 'active' : ''}`} aria-expanded={open} onClick={() => setOpen(true)}>
            <span className="mobile-nav-icon">
              <MenuIcon size={18} />
            </span>
            <span>Menu</span>
          </button>
        </div>
      </nav>
      <MobileMenu open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const patient = useAppSelector(selectCurrentPatient);
  const currentPage = PageRegistry.matchPath(location.pathname);
  const [pickerOpen, setPickerOpen] = useState(false);

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <>
      <Modal
        open={open}
        onCancel={onClose}
        footer={null}
        closable={false}
        width="100vw"
        className="mobile-menu-modal"
        styles={{ mask: { background: 'rgba(16,24,40,0.45)' } }}
        destroyOnHidden
      >
        <div className="mobile-menu-head">
          <div className="app-sider-brand-mark">
            <Activity size={16} color="#fff" />
          </div>
          <span className="mobile-menu-title">All modules</span>
          <Button type="text" icon={<X size={20} />} onClick={onClose} aria-label="Close menu" />
        </div>

        <div className="mobile-menu-patient">
          {patient ? (
            <>
              <Avatar name={patient.fullName} size={36} />
              <div className="mobile-menu-patient-who">
                <strong>{patient.fullName}</strong>
                <span className="muted">{patient.mrn} · {patient.age}y {patient.gender}</span>
              </div>
              <Button size="small" icon={<UserRoundCog size={14} />} onClick={() => setPickerOpen(true)}>
                Change
              </Button>
            </>
          ) : (
            <>
              <div className="mobile-menu-patient-who">
                <strong>No patient selected</strong>
                <span className="muted">Select one to open their Summary</span>
              </div>
              <Button size="small" type="primary" icon={<UserRound size={14} />} onClick={() => setPickerOpen(true)}>
                Select
              </Button>
            </>
          )}
        </div>

        <div className="mobile-menu-body">
          <div className="mobile-menu-group mobile-menu-flat">
            <div className="mobile-menu-links" style={{ borderTop: 'none' }}>
              {PageRegistry.sidebarPages().map((p) => {
                const locked = p.requiresPatient && !patient;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`mobile-menu-link ${currentPage?.id === p.id ? 'active' : ''}`}
                    onClick={() => go(p.path)}
                  >
                    <span className="mobile-menu-group-icon">{moduleIcons[p.module]}</span>
                    {moduleLabels[p.module]}
                    {locked && <Tag style={{ marginInlineStart: 8 }}>needs patient</Tag>}
                    <span className="page-num">#{p.number}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mobile-menu-footer">
          <Button
            block
            size="large"
            danger
            icon={<LogOut size={16} />}
            onClick={() => {
              onClose();
              dispatch(logout());
            }}
          >
            Sign out
          </Button>
        </div>
      </Modal>

      <PatientPicker open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </>
  );
}
