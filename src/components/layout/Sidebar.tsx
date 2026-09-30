import { useMemo, useState } from 'react';
import { Button, Layout, Tooltip } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { Activity, ChevronRight, Lock, Mic, PanelLeftClose, PanelLeftOpen, UserRoundPlus } from 'lucide-react';
import { PageRegistry, moduleLabels } from '@/registry/pageRegistry';
import { useAppDispatch, useAppSelector } from '@/store';
import { selectCurrentPatient } from '@/store/slices/patientSlice';
import { voiceActions } from '@/store/slices/voiceSlice';
import { layout as layoutTokens } from '@/theme/tokens';
import { aiConfig } from '@/services/ai/config';
import { Avatar } from '@/components/common';
import { PatientPicker } from '@/components/patient/PatientPicker';
import { moduleIcons } from './moduleIcons';

interface Props {
  collapsed: boolean;
  onCollapse: (c: boolean) => void;
}

/** What the assistant is doing, in words, for the sidebar's voice tile. */
const voiceWords: Record<string, string> = {
  idle: 'Ready when you are',
  listening: 'Listening…',
  transcribing: 'Transcribing…',
  processing: 'Understanding…',
  executing: 'Working on it…',
  confirmation_required: 'Waiting for your OK',
  completed: 'Done',
  error: 'Something went wrong',
  cancelled: 'Cancelled',
};

/**
 * The whole application in four entries: the provider's Dashboard, Patients,
 * Inbox and the selected patient's Summary. The Summary is marked while no
 * patient is selected, so the requirement is visible before the click.
 */
export function Sidebar({ collapsed, onCollapse }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const patient = useAppSelector(selectCurrentPatient);
  const voiceStatus = useAppSelector((s) => s.voice.status);
  const micOn = useAppSelector((s) => s.voice.micActive);
  const inboxItems = useAppSelector((s) => s.inbox.items);
  const filedIds = useAppSelector((s) => s.inbox.reviewedIds);
  const [pickerOpen, setPickerOpen] = useState(false);
  const currentPage = PageRegistry.matchPath(location.pathname);
  const activeKey = currentPage?.parentId ?? currentPage?.id;

  const unfiled = useMemo(() => {
    const filed = new Set(filedIds);
    return inboxItems.filter((i) => !filed.has(i.id)).length;
  }, [inboxItems, filedIds]);

  const voiceText = micOn && voiceStatus === 'idle' ? 'Listening…' : (voiceWords[voiceStatus] ?? voiceStatus.replace('_', ' '));

  return (
    <Layout.Sider
      className="app-sider"
      theme="light"
      width={layoutTokens.sidebarWidth}
      collapsedWidth={layoutTokens.sidebarCollapsedWidth}
      collapsed={collapsed}
      onCollapse={onCollapse}
      trigger={null}
      style={{ height: '100%', overflow: 'hidden' }}
    >
      <div className={`app-sider-brand ${collapsed ? 'collapsed' : ''}`}>
        <div className="app-sider-brand-mark">
          <Activity size={20} color="#fff" strokeWidth={2.4} />
        </div>
        {!collapsed && (
          <div>
            <div className="app-sider-brand-title">CareFlow</div>
            <div className="app-sider-brand-sub">Practice suite</div>
          </div>
        )}
      </div>

      {!collapsed && (
        <button
          type="button"
          className={`app-sider-context ${patient ? '' : 'is-empty'}`}
          onClick={() => setPickerOpen(true)}
          aria-label={patient ? `Working on ${patient.fullName} — change patient` : 'No patient selected — choose one'}
        >
          <div className="app-sider-context-top">
            {patient ? (
              <Avatar name={patient.fullName} size={38} />
            ) : (
              <span className="side-nav-icon" style={{ background: '#fff', color: '#a15c00' }} aria-hidden>
                <UserRoundPlus size={17} />
              </span>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="app-sider-context-label">Working on</div>
              <div className="app-sider-context-value">{patient ? patient.fullName : 'No patient selected'}</div>
              {patient && <div className="app-sider-context-meta">{patient.mrn} · {patient.age}y {patient.gender}</div>}
            </div>
          </div>
          <span className="app-sider-context-cta">
            {patient ? 'Change patient' : 'Choose a patient'} <ChevronRight size={13} aria-hidden />
          </span>
        </button>
      )}

      {!collapsed && <div className="app-sider-section">Workspace</div>}
      <nav className="app-sider-nav" aria-label="Main navigation">
        {PageRegistry.sidebarPages().map((p) => {
          const locked = !!p.requiresPatient && !patient;
          const active = activeKey === p.id;
          const label = moduleLabels[p.module];
          const badge = p.module === 'inbox' && unfiled > 0 ? unfiled : undefined;
          const item = (
            <button
              key={p.id}
              type="button"
              className={`side-nav-item ${active ? 'is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
              aria-label={collapsed ? label : undefined}
              onClick={() => navigate(p.path)}
            >
              <span className="side-nav-icon" aria-hidden>
                {moduleIcons[p.module]}
              </span>
              {!collapsed && <span className="side-nav-label">{label}</span>}
              {!collapsed && badge !== undefined && <span className="side-nav-badge" title={`${badge} unfiled`}>{badge > 99 ? '99+' : badge}</span>}
              {!collapsed && locked && (
                <Tooltip title="Select a patient first">
                  <Lock size={13} className="side-nav-lock" aria-label="Requires a selected patient" />
                </Tooltip>
              )}
              {collapsed && badge !== undefined && <span className="side-nav-dot" aria-hidden />}
            </button>
          );
          return collapsed ? (
            <Tooltip key={p.id} title={locked ? `${label} — select a patient first` : label} placement="right">
              {item}
            </Tooltip>
          ) : (
            item
          );
        })}
      </nav>

      {aiConfig.enableVoice && (
      <Tooltip title={collapsed ? 'Voice assistant (Ctrl+Shift+V)' : undefined} placement="right">
        <button
          type="button"
          className={`app-sider-voice ${micOn ? 'is-live' : ''} ${collapsed ? 'collapsed' : ''}`}
          onClick={() => dispatch(voiceActions.setPanelOpen(true))}
          aria-label="Open the voice assistant"
        >
          <span className="app-sider-voice-orb" aria-hidden>
            <Mic size={16} />
          </span>
          {!collapsed && (
            <>
              <span className="app-sider-voice-text">
                <strong>{micOn ? 'Microphone on' : 'Voice assistant'}</strong>
                <span>{voiceText}</span>
              </span>
            </>
          )}
        </button>
      </Tooltip>
      )}

      <div className={`app-sider-footer ${collapsed ? 'collapsed' : ''}`}>
        {!collapsed && aiConfig.enableVoice && (
          <span className="app-sider-status">
            <span className={`app-sider-status-dot ${micOn ? 'is-live' : ''}`} aria-hidden />
            <span>{micOn ? 'Microphone on' : 'Voice ready'}</span>
          </span>
        )}
        {!collapsed && !aiConfig.enableVoice && <span className="app-sider-status" />}
        <Tooltip title={`${collapsed ? 'Expand' : 'Collapse'} sidebar (Ctrl+B)`} placement="right">
          <Button
            type="text"
            className="app-sider-collapse-btn"
            icon={collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            onClick={() => onCollapse(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
          />
        </Tooltip>
      </div>

      <PatientPicker open={pickerOpen} onClose={() => setPickerOpen(false)} title={patient ? 'Change patient' : 'Select a patient'} />
    </Layout.Sider>
  );
}
