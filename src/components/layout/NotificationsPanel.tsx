import { Button, List, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarClock, FlaskConical, ShieldAlert } from 'lucide-react';

const notifications = [
  { id: 'n1', icon: <FlaskConical size={16} />, color: 'gold', title: 'Abnormal lab result', desc: 'HbA1c 8.4% for Ahmed Khan needs review', time: '12 min ago', path: '/clinical/labs' },
  { id: 'n2', icon: <CalendarClock size={16} />, color: 'blue', title: '3 patients waiting', desc: 'Queue wait time exceeds 15 minutes at Riverside', time: '25 min ago', path: '/appointments/queue' },
  { id: 'n3', icon: <ShieldAlert size={16} />, color: 'red', title: 'Credential expiring', desc: 'Dr. Okafor — DEA registration expires in 21 days', time: '2 h ago', path: '/providers/credentials' },
  { id: 'n4', icon: <AlertTriangle size={16} />, color: 'orange', title: 'Pending leave approval', desc: '4 leave requests awaiting your approval', time: 'Yesterday', path: '/roster/leave' },
];

export function NotificationsPanel() {
  const navigate = useNavigate();
  return (
    <div style={{ width: 360, maxWidth: '90vw' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Notifications</strong>
        <Button type="link" size="small">Mark all read</Button>
      </div>
      <List
        dataSource={notifications}
        renderItem={(n) => (
          <List.Item style={{ padding: '10px 16px', cursor: 'pointer' }} onClick={() => navigate(n.path)}>
            <List.Item.Meta
              avatar={<Tag color={n.color} style={{ padding: 6, display: 'grid', placeItems: 'center', margin: 0 }}>{n.icon}</Tag>}
              title={<span style={{ fontSize: 13.5 }}>{n.title}</span>}
              description={
                <span style={{ fontSize: 12 }}>
                  {n.desc} · <span className="muted">{n.time}</span>
                </span>
              }
            />
          </List.Item>
        )}
      />
    </div>
  );
}
