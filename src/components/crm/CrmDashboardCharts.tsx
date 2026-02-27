'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LabelList,
} from 'recharts';

/* ─── Paleta coherente con el design system oscuro + teal ─── */

const PALETTE = {
  teal: '#1db990',
  blue: '#3b82f6',
  amber: '#f59e0b',
  redMuted: 'rgba(239,68,68,0.5)',
  donut: ['#1db990', '#3b82f6', '#8b5cf6', '#f59e0b', '#64748b'],
  grid: 'rgba(255,255,255,0.04)',
  axis: 'rgba(255,255,255,0.3)',
};

const LEAD_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  in_review: 'En revisión',
  approved: 'Aprobado',
  rejected: 'Rechazado',
};

/* ─── Types ─── */

export type LeadByMonthRow = {
  month: string;
  monthLabel: string;
  pending: number;
  in_review: number;
  approved: number;
  rejected: number;
  total: number;
};
export type QuotesByMonthRow = { month: string; monthLabel: string; count: number };
export type LeadBySourceRow = { source: string; sourceLabel: string; count: number; percent: number };

/* ─── Custom Tooltip ─── */

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ color?: string; name?: string; value?: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-popover/95 px-3 py-2 shadow-xl backdrop-blur-sm">
      <p className="mb-1.5 text-xs font-medium text-foreground">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{typeof entry.name === 'string' ? (LEAD_STATUS_LABELS[entry.name] ?? entry.name) : ''}</span>
          <span className="ml-auto font-medium tabular-nums text-foreground">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Leads por Mes ─── */

export function LeadsByMonthChart({ data }: { data: LeadByMonthRow[] }) {
  if (data.length === 0) return <EmptyChart message="Sin leads en el periodo" />;

  return (
    <div>
      <div className="h-[220px] sm:h-[280px] lg:h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, right: 4, left: -12, bottom: 0 }} barCategoryGap="20%">
            <CartesianGrid stroke={PALETTE.grid} vertical={false} />
            <XAxis dataKey="monthLabel" tick={{ fontSize: 11, fill: PALETTE.axis }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: PALETTE.axis }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Bar dataKey="rejected" stackId="stack" fill={PALETTE.redMuted} name="rejected" />
            <Bar dataKey="pending" stackId="stack" fill={PALETTE.amber} name="pending" />
            <Bar dataKey="in_review" stackId="stack" fill={PALETTE.blue} name="in_review" />
            <Bar dataKey="approved" stackId="stack" fill={PALETTE.teal} name="approved" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <LegendDot color={PALETTE.teal} label="Aprobado" />
        <LegendDot color={PALETTE.blue} label="En revisión" />
        <LegendDot color={PALETTE.amber} label="Pendiente" />
        <LegendDot color={PALETTE.redMuted} label="Rechazado" />
      </div>
    </div>
  );
}

/* ─── Cotizaciones por Mes ─── */

export function QuotesByMonthChart({ data }: { data: QuotesByMonthRow[] }) {
  if (data.length === 0) return <EmptyChart message="Sin cotizaciones en el periodo" />;

  return (
    <div className="h-[220px] sm:h-[280px] lg:h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 24, right: 4, left: -12, bottom: 0 }} barCategoryGap="25%">
          <CartesianGrid stroke={PALETTE.grid} vertical={false} />
          <XAxis dataKey="monthLabel" tick={{ fontSize: 11, fill: PALETTE.axis }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: PALETTE.axis }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Bar dataKey="count" fill={PALETTE.teal} name="Cotizaciones" radius={[4, 4, 0, 0]}>
            <LabelList dataKey="count" position="top" style={{ fontSize: 10, fill: 'rgba(255,255,255,0.5)', fontWeight: 500 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── Leads por Fuente ─── */

export function LeadsBySourceChart({ data }: { data: LeadBySourceRow[] }) {
  if (data.length === 0) return <EmptyChart message="Sin datos de fuente" />;

  const pieData = data.map((d) => ({ name: d.sourceLabel, value: d.count }));

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="h-[200px] w-full sm:w-[200px] sm:shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={pieData} cx="50%" cy="50%" innerRadius={52} outerRadius={78} paddingAngle={3} dataKey="value" nameKey="name" stroke="none">
              {pieData.map((_, index) => (
                <Cell key={index} fill={PALETTE.donut[index % PALETTE.donut.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {data.map((row, i) => (
          <div key={row.source} className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: PALETTE.donut[i % PALETTE.donut.length] }} />
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{row.sourceLabel}</span>
            <span className="shrink-0 text-sm font-medium tabular-nums">{row.count}</span>
            <span className="w-10 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{row.percent}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Helpers ─── */

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[200px] items-center justify-center">
      <p className="text-sm text-muted-foreground/60">{message}</p>
    </div>
  );
}
