import React, { useMemo } from 'react';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

function formatDayLabel(iso) {
  const s = String(iso || '');
  // YYYY-MM-DD -> DD.MM
  if (s.length >= 10) return `${s.slice(8, 10)}.${s.slice(5, 7)}`;
  return s;
}

function StatsChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="opstat-chart-tooltip">
      <p className="opstat-chart-tooltip-date">{formatDayLabel(label)}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="opstat-chart-tooltip-row" style={{ color: entry.color }}>
          {entry.name}: <strong>{entry.value}</strong>
        </p>
      ))}
    </div>
  );
}

export default function OperatorStatsChart({ daily, dark }) {
  const data = useMemo(
    () =>
      (Array.isArray(daily) ? daily : []).map((d) => ({
        date: d.date,
        confirmed: Number(d.confirmed) || 0,
        cancelled: Number(d.cancelled) || 0,
      })),
    [daily],
  );

  const gridColor = dark ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.25)';
  const axisColor = dark ? '#94a3b8' : '#9ca3af';

  return (
    <div className="opstat-chart-wrap">
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDayLabel}
            tick={{ fontSize: 11, fill: axisColor }}
            tickLine={false}
            axisLine={{ stroke: gridColor }}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: axisColor }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<StatsChartTooltip />} cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }} />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
            iconType="circle"
            iconSize={8}
          />
          <Bar
            dataKey="cancelled"
            name="Bekor qilingan"
            fill="#f87171"
            radius={[4, 4, 0, 0]}
            maxBarSize={14}
          />
          <Line
            type="monotone"
            dataKey="confirmed"
            name="Tasdiqlangan"
            stroke="#3b82f6"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
