import type { ReactNode } from 'react';
import { Skeleton, Tooltip } from 'antd';
import { ArrowDownRight, ArrowUpRight, ChevronRight, Minus } from 'lucide-react';

export interface MetricProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral';
  delta?: { value: string; direction: 'up' | 'down' | 'flat'; label?: string };
  loading?: boolean;
  onClick?: () => void;
  /** Explains what the number counts — shown on hover/focus of the label. */
  hint?: string;
}

const tones: Record<NonNullable<MetricProps['tone']>, { bg: string; fg: string }> = {
  primary: { bg: '#e6f3f7', fg: '#0f6e8c' },
  success: { bg: '#e6f6ee', fg: '#0f9d58' },
  warning: { bg: '#fff5e0', fg: '#b86e00' },
  error: { bg: '#fdecec', fg: '#d64545' },
  info: { bg: '#e9f1fb', fg: '#2a78d6' },
  neutral: { bg: '#f1f4f7', fg: '#5b6b7a' },
};

const directionLabel = { up: 'up', down: 'down', flat: 'no change' };

export function MetricCard({ label, value, icon, tone = 'primary', delta, loading, onClick, hint }: MetricProps) {
  const t = tones[tone];
  const content = (
    <>
      {icon && (
        <div className="metric-card-icon" style={{ background: t.bg, color: t.fg }} aria-hidden>
          {icon}
        </div>
      )}
      <div className="metric-card-body">
        <div className="metric-card-label">{label}</div>
        {loading ? (
          <Skeleton.Input active size="small" style={{ width: 90, marginTop: 6, height: 26 }} />
        ) : (
          <div className="metric-card-value">{value}</div>
        )}
        {delta && !loading && (
          <div className={`metric-card-delta ${delta.direction}`}>
            {delta.direction === 'up' ? <ArrowUpRight size={14} aria-hidden /> : delta.direction === 'down' ? <ArrowDownRight size={14} aria-hidden /> : <Minus size={14} aria-hidden />}
            <span className="sr-only">{directionLabel[delta.direction]}</span>
            <span>{delta.value}</span>
            {delta.label && <span className="muted">{delta.label}</span>}
          </div>
        )}
      </div>
      {onClick && <ChevronRight size={16} className="metric-card-arrow" aria-hidden />}
    </>
  );

  const card = onClick ? (
    <button type="button" className="metric-card is-clickable" onClick={onClick} aria-label={`${label}: ${typeof value === 'string' || typeof value === 'number' ? value : ''}. Open details.`}>
      {content}
    </button>
  ) : (
    <div className="metric-card">{content}</div>
  );

  return hint ? <Tooltip title={hint}>{card}</Tooltip> : card;
}

export function MetricGrid({ children }: { children: ReactNode }) {
  return <div className="metric-grid">{children}</div>;
}
