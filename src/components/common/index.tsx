import type { CSSProperties, ReactNode } from 'react';
import { Alert, Button, Card, Empty, Skeleton, Tag, Tooltip } from 'antd';
import { Inbox, RefreshCw } from 'lucide-react';
import { statusColor } from '@/constants/status';
import { hashColor, initials } from '@/utils/format';

export { PageHeader } from './PageHeader';
export { MetricCard, MetricGrid } from './MetricCard';

export function StatusTag({ status, style }: { status?: string | null; style?: CSSProperties }) {
  if (!status) return <span className="muted">—</span>;
  return (
    <Tag color={statusColor[status] ?? 'default'} style={{ marginInlineEnd: 0, ...style }}>
      {status}
    </Tag>
  );
}

export function Avatar({ name, size = 36, color }: { name: string; size?: number; color?: string }) {
  const bg = color ?? hashColor(name);
  return (
    <div className="avatar-initials" style={{ width: size, height: size, background: `${bg}22`, color: bg, fontSize: size * 0.36 }} aria-hidden>
      {initials(name)}
    </div>
  );
}

export function PrimaryCell({ title, subtitle, avatar }: { title: ReactNode; subtitle?: ReactNode; avatar?: string }) {
  return (
    <div className="flex items-center gap-2">
      {avatar && <Avatar name={avatar} size={32} />}
      <div className="table-primary-cell">
        <strong>{title}</strong>
        {subtitle && <span>{subtitle}</span>}
      </div>
    </div>
  );
}

export function SectionCard({ title, extra, children, className, bodyStyle, id, loading }: { title?: ReactNode; extra?: ReactNode; children: ReactNode; className?: string; bodyStyle?: CSSProperties; id?: string; loading?: boolean }) {
  return (
    <Card id={id} title={title} extra={extra} className={`section-card ${className ?? ''}`} styles={{ body: bodyStyle }} loading={loading}>
      {children}
    </Card>
  );
}

export function EmptyState({ title = 'Nothing here yet', description, action, icon }: { title?: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <Empty
      image={<div style={{ display: 'grid', placeItems: 'center', height: 64, color: '#8a97a4' }}>{icon ?? <Inbox size={44} strokeWidth={1.4} />}</div>}
      description={
        <div>
          <div style={{ fontWeight: 600, color: '#1a2733' }}>{title}</div>
          {description && <div className="muted" style={{ marginTop: 4 }}>{description}</div>}
        </div>
      }
    >
      {action}
    </Empty>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert
      type="error"
      showIcon
      message="Something went wrong"
      description={message}
      action={
        onRetry && (
          <Button size="small" icon={<RefreshCw size={14} />} onClick={onRetry}>
            Retry
          </Button>
        )
      }
    />
  );
}

export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return <Skeleton active paragraph={{ rows }} />;
}

export function FormSection({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <div className="form-section-title">
        {title}
        {hint && (
          <Tooltip title={hint}>
            <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>ⓘ</span>
          </Tooltip>
        )}
      </div>
      {children}
    </div>
  );
}

export function FormGrid({ children, cols }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  return <div className={`form-grid ${cols === 2 ? 'cols-2' : cols === 3 ? 'cols-3' : ''}`}>{children}</div>;
}

export function KeyValue({ items, columns = 2 }: { items: Array<{ label: string; value: ReactNode }>; columns?: 1 | 2 | 3 | 4 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: '12px 20px' }}>
      {items.map((it) => (
        <div key={it.label}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 2 }}>{it.label}</div>
          <div style={{ fontWeight: 500, wordBreak: 'break-word' }}>{it.value ?? '—'}</div>
        </div>
      ))}
    </div>
  );
}

export function Dot({ color }: { color: string }) {
  return <span className="status-dot" style={{ background: color }} />;
}
