import { Avatar as AntAvatar, Badge, Button, Dropdown, Layout, Popover, Tooltip } from 'antd';
import { useNavigate } from 'react-router-dom';
import { Bell, Bug, Command, LogOut, Menu, Mic, PanelLeftClose, PanelLeftOpen, Settings, UserRound } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { uiActions } from '@/store/slices/uiSlice';
import { logout } from '@/store/slices/authSlice';
import { voiceActions } from '@/store/slices/voiceSlice';
import { aiConfig } from '@/services/ai/config';
import { GlobalSearch } from './GlobalSearch';
import { NotificationsPanel } from './NotificationsPanel';

export function Header({ isMobile }: { isMobile: boolean }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const collapsed = useAppSelector((s) => s.ui.sidebarCollapsed);
  const user = useAppSelector((s) => s.auth.user);
  const micOn = useAppSelector((s) => s.voice.micActive);
  const debugOpen = useAppSelector((s) => s.ui.debugPanelOpen);

  return (
    <Layout.Header className="app-header">
      <div className="app-header-left">
        {isMobile ? (
          <Button type="text" className="app-header-icon-btn" icon={<Menu size={18} />} onClick={() => dispatch(uiActions.setMobileSidebarOpen(true))} aria-label="Open menu" />
        ) : (
          <Tooltip title={`${collapsed ? 'Expand' : 'Collapse'} sidebar (Ctrl+B)`}>
            <Button type="text" className="app-header-icon-btn" icon={collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />} onClick={() => dispatch(uiActions.toggleSidebar())} aria-label="Toggle sidebar" />
          </Tooltip>
        )}
        <GlobalSearch />
      </div>
      <div className="app-header-right">
        <Tooltip title="Command palette (Ctrl+K)">
          <Button type="text" className="app-header-icon-btn" icon={<Command size={17} />} onClick={() => dispatch(uiActions.setCommandPaletteOpen(true))} aria-label="Open command palette" />
        </Tooltip>
        <Tooltip title={micOn ? 'Microphone on — listening' : 'Voice assistant (Ctrl+Shift+V)'}>
          <Button
            type="text"
            className="app-header-icon-btn"
            style={micOn ? { color: '#d64545' } : undefined}
            icon={<Mic size={17} />}
            onClick={() => dispatch(voiceActions.setPanelOpen(true))}
            aria-label="Voice assistant"
          />
        </Tooltip>
        {aiConfig.enableDebugPanel && (
          <Tooltip title="Debug panel (Ctrl+Shift+D)">
            <Button type="text" className="app-header-icon-btn" style={debugOpen ? { color: '#0f6e8c' } : undefined} icon={<Bug size={17} />} onClick={() => dispatch(uiActions.setDebugPanelOpen(!debugOpen))} aria-label="Toggle debug panel" />
          </Tooltip>
        )}
        <Popover trigger="click" placement="bottomRight" content={<NotificationsPanel />} styles={{ body: { padding: 0 } }}>
          <Badge count={4} size="small" offset={[-4, 4]}>
            <Button type="text" className="app-header-icon-btn" icon={<Bell size={17} />} aria-label="Notifications" />
          </Badge>
        </Popover>
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'profile', icon: <UserRound size={14} />, label: 'My profile', onClick: () => user && navigate(`/users/${user.id}`) },
              { key: 'settings', icon: <Settings size={14} />, label: 'Preferences', onClick: () => navigate('/configuration/preferences') },
              { type: 'divider' },
              { key: 'logout', icon: <LogOut size={14} />, label: 'Sign out', danger: true, onClick: () => dispatch(logout()) },
            ],
          }}
        >
          <button type="button" style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 8 }} aria-label="Account menu">
            <AntAvatar style={{ background: user?.avatarColor ?? '#0f6e8c', fontWeight: 600 }} size={32}>
              {user ? `${user.firstName[0]}${user.lastName[0]}` : 'U'}
            </AntAvatar>
            {!isMobile && (
              <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{user?.fullName ?? 'User'}</div>
                <div className="muted" style={{ fontSize: 11 }}>{user?.role ?? ''}</div>
              </div>
            )}
          </button>
        </Dropdown>
      </div>
    </Layout.Header>
  );
}
