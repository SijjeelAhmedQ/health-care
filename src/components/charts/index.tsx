import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { chartSeries } from '@/theme/tokens';

const axisStyle = { fontSize: 12, fill: '#8c93a6', fontWeight: 500 };
const gridStroke = '#eef0f5';
const tooltipStyle = { borderRadius: 14, border: '1px solid #e8eaf1', boxShadow: '0 8px 20px rgba(11,16,32,0.07), 0 28px 56px rgba(11,16,32,0.12)', fontSize: 13, padding: '8px 12px' };

export interface SeriesDef {
  key: string;
  label: string;
}

interface XYProps {
  data: Array<Record<string, string | number>>;
  xKey: string;
  series: SeriesDef[];
  height?: number;
  stacked?: boolean;
  formatValue?: (v: number) => string;
}

/** Change over time: a line (or filled area for a single series). */
export function TrendChart({ data, xKey, series, height = 260, formatValue }: XYProps) {
  const single = series.length === 1;
  const Chart = single ? AreaChart : LineChart;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Chart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={gridStroke} />
        <XAxis dataKey={xKey} tick={axisStyle} axisLine={false} tickLine={false} />
        <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={formatValue} width={56} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => (formatValue ? formatValue(v) : v)} cursor={{ stroke: '#d3d7e3' }} />
        {!single && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) =>
          single ? (
            <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={chartSeries[i]} fill={chartSeries[i]} fillOpacity={0.12} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} />
          ) : (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={chartSeries[i]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} />
          ),
        )}
      </Chart>
    </ResponsiveContainer>
  );
}

/** Magnitude by category: thin bars with rounded data-ends anchored to the baseline. */
export function BarsChart({ data, xKey, series, height = 260, stacked, formatValue, horizontal }: XYProps & { horizontal?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 8, left: horizontal ? 8 : -12, bottom: 0 }} barCategoryGap="30%" barGap={2}>
        <CartesianGrid vertical={horizontal} horizontal={!horizontal} stroke={gridStroke} />
        {horizontal ? (
          <>
            <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={formatValue} />
            <YAxis type="category" dataKey={xKey} tick={axisStyle} axisLine={false} tickLine={false} width={120} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} tick={axisStyle} axisLine={false} tickLine={false} />
            <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={formatValue} width={56} />
          </>
        )}
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f1f2fb' }} formatter={(v: number) => (formatValue ? formatValue(v) : v)} />
        {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={chartSeries[i]} stackId={stacked ? 'stack' : undefined} radius={stacked && i < series.length - 1 ? 0 : horizontal ? [0, 8, 8, 0] : [8, 8, 2, 2]} maxBarSize={30} stroke="#fff" strokeWidth={stacked ? 2 : 0} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Part-to-whole with few categories (≤ 5). */
export function DonutChart({ data, height = 240, nameKey = 'name', valueKey = 'value' }: { data: Array<{ name: string; value: number }>; height?: number; nameKey?: string; valueKey?: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ width: height, height, position: 'relative', flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey={valueKey} nameKey={nameKey} innerRadius="68%" outerRadius="94%" paddingAngle={3} cornerRadius={6} stroke="#fff" strokeWidth={2}>
              {data.map((_, i) => (
                <Cell key={i} fill={chartSeries[i % chartSeries.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--color-ink)' }}>{total}</div>
            <div className="muted" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Total</div>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 150, flex: 1 }}>
        {data.map((d, i) => (
          <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, padding: '5px 10px', borderRadius: 10, background: 'var(--color-surface-subtle)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 4, background: chartSeries[i % chartSeries.length], flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{d.name}</span>
            <strong>{d.value}</strong>
            <span className="muted" style={{ width: 40, textAlign: 'right' }}>{total ? Math.round((d.value / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
