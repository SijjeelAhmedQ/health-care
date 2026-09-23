import type { CSSProperties, ReactNode } from 'react';
import { Alert, Button, Card, Empty, Skeleton, Tag, Tooltip } from 'antd';
import { Inbox, Info, RefreshCw } from 'lucide-react';
import { statusColor } from '@/constants/status';
import { hashColor, initials } from '@/utils/format';

export { PageHeader } from './PageHeader';
export { MetricCard, MetricGrid, type MetricProps } from './MetricCard';
export { AppModal, FormModal, confirmAction, modalWidths, type ModalSize } from './AppModal';

/**
 * Status badge. Colour is a reinforcement only — the label always states the status in words,
 * so it never relies on colour alone.
 */
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
    <div
      className="avatar-initials"
      style={{ width: size, height: size, background: `${bg}22`, color: bg, fontSize: Math.round(size * 0.36) }}
      aria-hidden
    >
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

export function SectionCard({
  title,
  extra,
  children,
  className,
  bodyStyle,
  id,
  loading,
  count,
  icon,
  description,
}: {
  title?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyStyle?: CSSProperties;
  id?: string;
  loading?: boolean;
  /** Rendered as a pill next to the title — tells the user how much is in this section at a glance. */
  count?: number;
  icon?: ReactNode;
  description?: string;
}) {
  const heading =
    title !== undefined ? (
      <>
        {icon}
        <span>{title}</span>
        {count !== undefined && <span className="section-card-count">{count}</span>}
        {description && (
          <Tooltip title={description}>
            <Info size={13} className="muted" style={{ cursor: 'help' }} />
          </Tooltip>
        )}
      </>
    ) : undefined;

  return (
    <Card id={id} title={heading} extra={extra} className={`section-card ${className ?? ''}`} styles={{ body: bodyStyle }} loading={loading}>
      {children}
    </Card>
  );
}

/** Empty state: says what is missing, why, and offers the action that fixes it. */
export function EmptyState({
  title = 'Nothing here yet',
  description,
  action,
  icon,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state-wrap">
      <Empty
        image={<div style={{ display: 'grid', placeItems: 'center', height: 64, color: 'var(--color-text-muted)' }}>{icon ?? <Inbox size={44} strokeWidth={1.4} />}</div>}
        description={
          <div>
            <div style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: 15 }}>{title}</div>
            {description && <div className="muted" style={{ marginTop: 6, maxWidth: 420, marginInline: 'auto', lineHeight: 1.5 }}>{description}</div>}
          </div>
        }
      >
        {action}
      </Empty>
    </div>
  );
}

/** Error state: plain language, plus a way to recover. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert
      type="error"
      showIcon
      message="Something went wrong"
      description={
        <>
          <div>{message}</div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>Nothing was changed. You can try again, or continue elsewhere in the app.</div>
        </>
      }
      action={
        onRetry && (
          <Button size="small" icon={<RefreshCw size={14} />} onClick={onRetry}>
            Try again
          </Button>
        )
      }
    />
  );
}

export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <Skeleton active paragraph={{ rows }} />
    </div>
  );
}

/** A labelled group of related fields. Keeps long forms scannable. */
export function FormSection({ title, children, hint, description }: { title: string; children: ReactNode; hint?: string; description?: string }) {
  return (
    <div className="form-section">
      <div className="form-section-title">
        {title}
        {hint && (
          <Tooltip title={hint}>
            <span className="form-section-hint" role="img" aria-label={hint}>
              <Info size={13} />
            </span>
          </Tooltip>
        )}
      </div>
      {description && <p className="form-section-description">{description}</p>}
      {children}
    </div>
  );
}

export function FormGrid({ children, cols }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  return <div className={`form-grid ${cols === 2 ? 'cols-2' : cols === 3 ? 'cols-3' : ''}`}>{children}</div>;
}

export function KeyValue({ items, columns = 2 }: { items: Array<{ label: string; value: ReactNode }>; columns?: 1 | 2 | 3 | 4 }) {
  return (
    <div className={`kv-grid ${columns === 1 ? 'kv-1' : ''}`} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {items.map((it) => (
        <div key={it.label}>
          <div className="kv-label">{it.label}</div>
          <div className="kv-value">{it.value ?? '—'}</div>
        </div>
      ))}
    </div>
  );
}

export function Dot({ color }: { color: string }) {
  return <span className="status-dot" style={{ background: color }} />;
}

/** Short inline "nothing here" line for small card sections, with an optional nudge. */
export function InlineEmpty({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="inline-empty">
      {icon}
      <span>{children}</span>
    </div>
  );
}
