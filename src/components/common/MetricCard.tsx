import type { CSSProperties, ReactNode } from 'react';
import { Skeleton } from 'antd';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from 'lucide-react';

export interface MetricProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral';
  delta?: { value: string; direction: 'up' | 'down' | 'flat'; label?: string };
  loading?: boolean;
  onClick?: () => void;
  /** Explains what the number counts — shown under the value. */
  hint?: string;
}

const tones: Record<NonNullable<MetricProps['tone']>, { bg: string; fg: string; tint: string }> = {
  primary: { bg: '#e8f4fd', fg: '#0780d8', tint: '#e8f4fd' },
  success: { bg: '#e5f7ee', fg: '#0f9d63', tint: '#e5f7ee' },
  warning: { bg: '#fff4e0', fg: '#c26a00', tint: '#fff4e0' },
  error: { bg: '#fdeced', fg: '#e5484d', tint: '#fdeced' },
  info: { bg: '#e6f4fb', fg: '#0284c7', tint: '#e6f4fb' },
  neutral: { bg: '#f1f3f8', fg: '#5d6478', tint: '#f4f5fa' },
};

const directionLabel = { up: 'up', down: 'down', flat: 'no change' };

export function MetricCard({ label, value, icon, tone = 'primary', delta, loading, onClick, hint }: MetricProps) {
  const t = tones[tone];
  const style = { '--metric-tint': t.tint } as CSSProperties;
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
          <Skeleton.Input active size="small" style={{ width: 90, marginTop: 6, height: 28 }} />
        ) : (
          <div className="metric-card-value">{value}</div>
        )}
        {hint && !loading && <div className="metric-card-hint">{hint}</div>}
        {delta && !loading && (
          <div className={`metric-card-delta ${delta.direction}`}>
            {delta.direction === 'up' ? <ArrowUpRight size={14} aria-hidden /> : delta.direction === 'down' ? <ArrowDownRight size={14} aria-hidden /> : <Minus size={14} aria-hidden />}
            <span className="sr-only">{directionLabel[delta.direction]}</span>
            <span>{delta.value}</span>
            {delta.label && <span className="muted">{delta.label}</span>}
          </div>
        )}
      </div>
      {onClick && <ArrowRight size={16} className="metric-card-arrow" aria-hidden />}
    </>
  );

  return onClick ? (
    <button type="button" className="metric-card is-clickable" style={style} title={hint} onClick={onClick} aria-label={`${label}: ${typeof value === 'string' || typeof value === 'number' ? value : ''}. Open details.`}>
      {content}
    </button>
  ) : (
    <div className="metric-card" style={style} title={hint}>
      {content}
    </div>
  );
}

export function MetricGrid({ children }: { children: ReactNode }) {
  return <div className="metric-grid">{children}</div>;
}
