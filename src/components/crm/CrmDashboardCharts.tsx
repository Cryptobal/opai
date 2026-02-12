'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LabelList,
} from 'recharts';

const CHART_COLORS = {
  pending: 'hsl(38 92% 50%)',      // amber
  in_review: 'hsl(217 91% 60%)',   // blue
  approved: 'hsl(142 71% 45%)',    // emerald
  rejected: 'hsl(0 72% 51%)',      // red
  quotes: 'hsl(38 92% 50%)',       // amber/dorado ref Pipedrive
  chart1: 'hsl(var(--chart-1))',
  chart2: 'hsl(var(--chart-2))',
  chart3: 'hsl(var(--chart-3))',
  chart4: 'hsl(var(--chart-4))',
  chart5: 'hsl(var(--chart-5))',
};

const LEAD_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  in_review: 'En revisión',
  approved: 'Aprobado',
  rejected: 'Rechazado',
};

const GUARD_LIFECYCLE_LABELS: Record<string, string> = {
  contratado_activo: 'Contratados',
  postulante: 'Postulantes',
  seleccionado: 'Seleccionados',
  inactivo: 'Inactivos',
  desvinculado: 'Desvinculados',
};

export type LeadByMonthRow = { month: string; monthLabel: string; pending: number; in_review: number; approved: number; rejected: number; total: number };
export type QuotesByMonthRow = { month: string; monthLabel: string; count: number };
export type LeadBySourceRow = { source: string; sourceLabel: string; count: number; percent: number };
export type GuardsByStatusRow = { status: string; label: string; count: number };

interface LeadsByMonthChartProps {
  data: LeadByMonthRow[];
}

export function LeadsByMonthChart({ data }: LeadsByMonthChartProps) {
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
          <XAxis
            dataKey="monthLabel"
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
            angle={-35}
            textAnchor="end"
            height={56}
          />
          <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" allowDecimals={false} />
          <Tooltip
            contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '0.5rem' }}
            labelStyle={{ color: 'hsl(var(--foreground))' }}
            formatter={(value: number | undefined) => [value ?? 0, '']}
            labelFormatter={(label) => label}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} formatter={(value) => LEAD_STATUS_LABELS[value] ?? value} />
          <Bar dataKey="pending" stackId="a" fill={CHART_COLORS.pending} name="pending" radius={[0, 0, 0, 0]} />
          <Bar dataKey="in_review" stackId="a" fill={CHART_COLORS.in_review} name="in_review" radius={[0, 0, 0, 0]} />
          <Bar dataKey="approved" stackId="a" fill={CHART_COLORS.approved} name="approved" radius={[0, 0, 0, 0]} />
          <Bar dataKey="rejected" stackId="a" fill={CHART_COLORS.rejected} name="rejected" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface QuotesByMonthChartProps {
  data: QuotesByMonthRow[];
}

export function QuotesByMonthChart({ data }: QuotesByMonthChartProps) {
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 24, right: 8, left: 0, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
          <XAxis
            dataKey="monthLabel"
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
            angle={-35}
            textAnchor="end"
            height={56}
          />
          <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" allowDecimals={false} />
          <Tooltip
            contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '0.5rem' }}
            formatter={(value: number | undefined) => [value ?? 0, 'Cotizaciones']}
            labelFormatter={(label) => label}
          />
          <Bar dataKey="count" fill={CHART_COLORS.quotes} name="Cotizaciones" radius={[4, 4, 0, 0]}>
            <LabelList dataKey="count" position="top" className="fill-foreground" style={{ fontSize: 11 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface LeadsBySourceChartProps {
  data: LeadBySourceRow[];
}

export function LeadsBySourceChart({ data }: LeadsBySourceChartProps) {
  const pieData = data.map((d) => ({ name: d.sourceLabel, value: d.count }));
  const colors = [CHART_COLORS.chart1, CHART_COLORS.chart2, CHART_COLORS.chart3, CHART_COLORS.chart4, CHART_COLORS.chart5];

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="h-[220px] w-full min-w-[200px] sm:w-[220px] sm:shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={56}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              nameKey="name"
            >
              {pieData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
              <LabelList dataKey="name" position="outside" style={{ fontSize: 10 }} />
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '0.5rem' }}
              formatter={(value, _name, props) => {
                const p = props?.payload as { name: string; value: number } | undefined;
                return [Number(value ?? 0), p ? `${p.name}` : ''];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5 text-sm">
        {data.map((row) => (
          <div key={row.source} className="flex items-center justify-between gap-2">
            <span className="truncate text-muted-foreground">{row.sourceLabel}</span>
            <span className="shrink-0 font-medium tabular-nums">
              {row.count} <span className="text-muted-foreground">({row.percent}%)</span>
            </span>
          </div>
        ))}
        {data.length === 0 && <p className="text-muted-foreground">Sin datos en el periodo</p>}
      </div>
    </div>
  );
}

interface GuardsByStatusChartProps {
  data: GuardsByStatusRow[];
}

export function GuardsByStatusChart({ data }: GuardsByStatusChartProps) {
  const colors = [CHART_COLORS.chart1, CHART_COLORS.chart2, CHART_COLORS.chart3, CHART_COLORS.chart4, CHART_COLORS.chart5];
  const maxCount = Math.max(1, ...data.map((d) => d.count));

  return (
    <div className="space-y-2">
      {data.map((row, i) => (
        <div key={row.status} className="flex items-center gap-2">
          <span className="w-24 shrink-0 truncate text-xs text-muted-foreground" title={row.label}>
            {row.label}
          </span>
          <div className="min-w-0 flex-1">
            <div
              className="h-6 rounded-md transition-all"
              style={{
                width: `${(row.count / maxCount) * 100}%`,
                minWidth: row.count > 0 ? 8 : 0,
                backgroundColor: colors[i % colors.length],
                opacity: 0.85,
              }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-xs font-medium tabular-nums">{row.count}</span>
        </div>
      ))}
      {data.length === 0 && <p className="text-sm text-muted-foreground">Sin datos de guardias</p>}
    </div>
  );
}
