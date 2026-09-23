import { useState } from 'react';
import { Avatar as AntAvatar, Button, Dropdown, Layout, Modal, Tag, Tooltip } from 'antd';
import { Activity, Bug, Command, LogOut, Mic, Search, UserRoundCog } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { uiActions } from '@/store/slices/uiSlice';
import { logout } from '@/store/slices/authSlice';
import { selectCurrentPatient } from '@/store/slices/patientSlice';
import { voiceActions } from '@/store/slices/voiceSlice';
import { aiConfig } from '@/services/ai/config';
import { PatientPicker } from '@/components/patient/PatientPicker';
import { GlobalSearch } from './GlobalSearch';

export function Header({ isMobile }: { isMobile: boolean }) {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const patient = useAppSelector(selectCurrentPatient);
  const micOn = useAppSelector((s) => s.voice.micActive);
  const debugOpen = useAppSelector((s) => s.ui.debugPanelOpen);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <Layout.Header className="app-header">
      <div className="app-header-left">
        {isMobile ? (
          <div className="app-header-brand-mobile">
            <div className="app-sider-brand-mark">
              <Activity size={15} color="#fff" />
            </div>
            CareFlow
          </div>
        ) : (
          <GlobalSearch />
        )}
      </div>

      <div className="app-header-right">
        {/* The working context is never more than one glance and one click away. */}
        <Tooltip title={patient ? `Working on ${patient.fullName} — click to change` : 'No patient selected — click to select one'}>
          <button type="button" className={`header-patient-chip ${patient ? '' : 'is-empty'}`} onClick={() => setPickerOpen(true)}>
            <UserRoundCog size={15} aria-hidden />
            {!isMobile && <span>{patient ? patient.fullName : 'Select patient'}</span>}
            {patient && !isMobile && <Tag>{patient.mrn}</Tag>}
          </button>
        </Tooltip>

        {isMobile && <Button type="text" className="app-header-icon-btn" icon={<Search size={19} />} onClick={() => setSearchOpen(true)} aria-label="Search" />}

        {!isMobile && (
          <Tooltip title="Command palette (Ctrl+K)">
            <Button type="text" className="app-header-icon-btn" icon={<Command size={18} />} onClick={() => dispatch(uiActions.setCommandPaletteOpen(true))} aria-label="Open command palette" />
          </Tooltip>
        )}

        <Tooltip title={micOn ? 'Microphone on — listening' : 'Voice assistant (Ctrl+Shift+V)'}>
          <Button
            type="text"
            className={`app-header-icon-btn ${micOn ? 'is-live' : ''}`}
            icon={<Mic size={18} />}
            onClick={() => dispatch(voiceActions.setPanelOpen(true))}
            aria-label="Voice assistant"
            aria-pressed={micOn}
          />
        </Tooltip>

        {aiConfig.enableDebugPanel && !isMobile && (
          <Tooltip title="Debug panel (Ctrl+Shift+D)">
            <Button
              type="text"
              className={`app-header-icon-btn ${debugOpen ? 'is-active' : ''}`}
              icon={<Bug size={18} />}
              onClick={() => dispatch(uiActions.setDebugPanelOpen(!debugOpen))}
              aria-label="Toggle debug panel"
              aria-pressed={debugOpen}
            />
          </Tooltip>
        )}

        {!isMobile && <span className="app-header-divider" aria-hidden />}

        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              {
                key: 'who',
                label: (
                  <div style={{ padding: '2px 0' }}>
                    <div style={{ fontWeight: 600 }}>{user?.fullName ?? 'User'}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{user?.email ?? user?.role}</div>
                  </div>
                ),
                disabled: true,
              },
              { type: 'divider' },
              { key: 'logout', icon: <LogOut size={15} />, label: 'Sign out', danger: true, onClick: () => dispatch(logout()) },
            ],
          }}
        >
          <button type="button" className="app-account-btn" aria-label={`Account menu for ${user?.fullName ?? 'user'}`}>
            <AntAvatar style={{ background: user?.avatarColor ?? '#0f6e8c', fontWeight: 600 }} size={34}>
              {user ? `${user.firstName[0]}${user.lastName[0]}` : 'U'}
            </AntAvatar>
            {!isMobile && (
              <span style={{ textAlign: 'left' }}>
                <span className="app-account-name" style={{ display: 'block' }}>{user?.fullName ?? 'User'}</span>
                <span className="app-account-role" style={{ display: 'block' }}>{user?.role ?? ''}</span>
              </span>
            )}
          </button>
        </Dropdown>
      </div>

      {/* Mobile search opens as a dialog so the header stays uncluttered on small screens. */}
      <Modal open={searchOpen} onCancel={() => setSearchOpen(false)} footer={null} title="Search" className="app-modal search-modal" style={{ top: 12 }} width="calc(100vw - 24px)" destroyOnHidden>
        <GlobalSearch autoFocus onSelect={() => setSearchOpen(false)} />
        <p className="muted" style={{ fontSize: 12.5, marginTop: 12, marginBottom: 0 }}>
          Search patients by name or MRN, this patient's records, and the eight modules.
        </p>
      </Modal>

      <PatientPicker open={pickerOpen} onClose={() => setPickerOpen(false)} title={patient ? 'Change patient' : 'Select a patient'} />
    </Layout.Header>
  );
}
