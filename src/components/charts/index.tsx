import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { chartSeries } from '@/theme/tokens';

const axisStyle = { fontSize: 12, fill: '#8a97a4' };
const gridStroke = '#eef1f4';
const tooltipStyle = { borderRadius: 8, border: '1px solid #e3e8ee', boxShadow: '0 8px 24px rgba(16,24,40,0.12)', fontSize: 13 };

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
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => (formatValue ? formatValue(v) : v)} cursor={{ stroke: '#cbd4dd' }} />
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
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f2f7fa' }} formatter={(v: number) => (formatValue ? formatValue(v) : v)} />
        {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={chartSeries[i]} stackId={stacked ? 'stack' : undefined} radius={stacked && i < series.length - 1 ? 0 : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={28} stroke="#fff" strokeWidth={stacked ? 2 : 0} />
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
            <Pie data={data} dataKey={valueKey} nameKey={nameKey} innerRadius="66%" outerRadius="92%" paddingAngle={2} stroke="#fff" strokeWidth={2}>
              {data.map((_, i) => (
                <Cell key={i} fill={chartSeries[i % chartSeries.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{total}</div>
            <div className="muted" style={{ fontSize: 11 }}>Total</div>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 150, flex: 1 }}>
        {data.map((d, i) => (
          <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: chartSeries[i % chartSeries.length] }} />
            <span style={{ flex: 1 }}>{d.name}</span>
            <strong>{d.value}</strong>
            <span className="muted" style={{ width: 40, textAlign: 'right' }}>{total ? Math.round((d.value / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
