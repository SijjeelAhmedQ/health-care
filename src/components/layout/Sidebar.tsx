import { Button, Layout, Menu, Tooltip, type MenuProps } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { Activity, Lock, Mic, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { PageRegistry, moduleLabels } from '@/registry/pageRegistry';
import { useAppSelector } from '@/store';
import { selectCurrentPatient } from '@/store/slices/patientSlice';
import { layout as layoutTokens } from '@/theme/tokens';
import { moduleIcons } from './MobileNav';

interface Props {
  collapsed: boolean;
  onCollapse: (c: boolean) => void;
}

/**
 * The whole application in four entries: the provider's Dashboard, Patients,
 * Inbox and the selected patient's Summary. The Summary is marked while no
 * patient is selected, so the requirement is visible before the click.
 */
export function Sidebar({ collapsed, onCollapse }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const patient = useAppSelector(selectCurrentPatient);
  const voiceStatus = useAppSelector((s) => s.voice.status);
  const micOn = useAppSelector((s) => s.voice.micActive);
  const currentPage = PageRegistry.matchPath(location.pathname);
  const activeKey = currentPage?.parentId ?? currentPage?.id;

  const items: MenuProps['items'] = PageRegistry.sidebarPages().map((p) => {
    const locked = !!p.requiresPatient && !patient;
    return {
      key: p.id,
      icon: moduleIcons[p.module],
      label: (
        <span className="app-sider-item">
          <span>{moduleLabels[p.module]}</span>
          {locked && (
            <Tooltip title="Select a patient first">
              <Lock size={12} className="app-sider-lock" aria-label="Requires a selected patient" />
            </Tooltip>
          )}
        </span>
      ),
    };
  });

  return (
    <Layout.Sider
      className="app-sider"
      theme="dark"
      width={layoutTokens.sidebarWidth}
      collapsedWidth={layoutTokens.sidebarCollapsedWidth}
      collapsed={collapsed}
      onCollapse={onCollapse}
      trigger={null}
      style={{ height: '100%', overflow: 'hidden' }}
    >
      <div className={`app-sider-brand ${collapsed ? 'collapsed' : ''}`}>
        <div className="app-sider-brand-mark">
          <Activity size={18} color="#fff" />
        </div>
        {!collapsed && (
          <div>
            <div className="app-sider-brand-title">CareFlow</div>
            <div className="app-sider-brand-sub">Practice Management</div>
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="app-sider-context">
          <div className="app-sider-context-label">Working on</div>
          <div className="app-sider-context-value">{patient ? patient.fullName : 'No patient selected'}</div>
          {patient && <div className="app-sider-context-meta">{patient.mrn} · {patient.age}y {patient.gender}</div>}
        </div>
      )}

      <Menu
        className="app-sider-menu"
        theme="dark"
        mode="inline"
        items={items}
        selectedKeys={activeKey ? [activeKey] : []}
        onClick={({ key }) => {
          const page = PageRegistry.get(String(key));
          if (page) navigate(page.path);
        }}
      />

      <div className={`app-sider-footer ${collapsed ? 'collapsed' : ''}`}>
        {!collapsed && (
          <span className="app-sider-status">
            <Mic size={13} color={micOn ? '#ff7a7a' : '#4fc3f7'} />
            <span>
              {micOn ? 'Microphone on' : 'Voice ready'} · {voiceStatus === 'idle' ? (micOn ? 'listening' : 'idle') : voiceStatus.replace('_', ' ')}
            </span>
          </span>
        )}
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
    </Layout.Sider>
  );
}
