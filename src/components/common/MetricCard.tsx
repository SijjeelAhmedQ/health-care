import type { ReactNode } from 'react';
import { Skeleton } from 'antd';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

export interface MetricProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral';
  delta?: { value: string; direction: 'up' | 'down' | 'flat'; label?: string };
  loading?: boolean;
  onClick?: () => void;
}

const tones: Record<NonNullable<MetricProps['tone']>, { bg: string; fg: string }> = {
  primary: { bg: '#e6f3f7', fg: '#0f6e8c' },
  success: { bg: '#e6f6ee', fg: '#0f9d58' },
  warning: { bg: '#fff5e0', fg: '#b86e00' },
  error: { bg: '#fdecec', fg: '#d64545' },
  info: { bg: '#e9f1fb', fg: '#2a78d6' },
  neutral: { bg: '#f1f4f7', fg: '#5b6b7a' },
};

export function MetricCard({ label, value, icon, tone = 'primary', delta, loading, onClick }: MetricProps) {
  const t = tones[tone];
  return (
    <div className="metric-card" onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} style={onClick ? { cursor: 'pointer' } : undefined}>
      {icon && (
        <div className="metric-card-icon" style={{ background: t.bg, color: t.fg }}>
          {icon}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="metric-card-label">{label}</div>
        {loading ? (
          <Skeleton.Input active size="small" style={{ width: 90, marginTop: 6 }} />
        ) : (
          <div className="metric-card-value">{value}</div>
        )}
        {delta && !loading && (
          <div className={`metric-card-delta ${delta.direction}`}>
            {delta.direction === 'up' ? <ArrowUpRight size={14} /> : delta.direction === 'down' ? <ArrowDownRight size={14} /> : <Minus size={14} />}
            <span>{delta.value}</span>
            {delta.label && <span className="muted">{delta.label}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export function MetricGrid({ children }: { children: ReactNode }) {
  return <div className="metric-grid">{children}</div>;
}
