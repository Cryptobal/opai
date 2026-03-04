# Rondas Visual Refactor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the visual design of all 6 Rondas screens to be world-class: consistent dark theme, mobile-first, with proper visual hierarchy and shared primitives.

**Architecture:** Refactor existing `*Client.tsx` files in-place (zero API/schema changes). Extract 5 shared primitives into dedicated files first, then refactor each screen. All screens consume the same data shapes — only JSX/CSS changes.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Tailwind CSS, shadcn/ui, Google Maps (existing), Lucide icons, sonner (toasts)

---

## Design Reference

See [design doc](./2026-03-04-rondas-visual-refactor-design.md) for full palette, specs per screen, and component details.

**Quick palette:**
- Bg: `#0a0e1a` · Card: `#111827` · Border: `#1e293b`
- Accent: `#2dd4bf` · Success: `#22c55e` · Warning: `#f59e0b` · Danger: `#ef4444`
- Text: `#f1f5f9` · Muted: `#94a3b8` · Dim: `#64748b`

**Trust gauge colors:** green ≥70 · yellow 40–69 · red <40

---

## Task 1: TrustScoreGauge primitive

**Files:**
- Create: `src/components/ops/rondas/TrustScoreGauge.tsx`

**Step 1: Write the component**

```tsx
// src/components/ops/rondas/TrustScoreGauge.tsx
import { cn } from "@/lib/utils";

interface TrustScoreGaugeProps {
  score: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  trend?: number; // positive = up, negative = down
}

export function TrustScoreGauge({ score, size = "md", showLabel = true, trend }: TrustScoreGaugeProps) {
  const clamped = Math.min(100, Math.max(0, score));
  const color = clamped >= 70 ? "#22c55e" : clamped >= 40 ? "#f59e0b" : "#ef4444";
  const textColor = clamped >= 70 ? "text-green-400" : clamped >= 40 ? "text-amber-400" : "text-red-400";

  const dims = { sm: 40, md: 64, lg: 96 };
  const strokeWidths = { sm: 4, md: 5, lg: 6 };
  const dim = dims[size];
  const strokeWidth = strokeWidths[size];
  const radius = (dim - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const center = dim / 2;

  const trendIcon = trend !== undefined
    ? trend > 0 ? "↑" : trend < 0 ? "↓" : "→"
    : null;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: dim, height: dim }}>
        <svg width={dim} height={dim} className="-rotate-90">
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#1e293b"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-700"
          />
        </svg>
        {showLabel && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={cn("font-bold tabular-nums leading-none", textColor,
              size === "sm" ? "text-[10px]" : size === "md" ? "text-sm" : "text-xl"
            )}>
              {clamped}
            </span>
          </div>
        )}
      </div>
      {trend !== undefined && (
        <span className={cn("text-[10px] font-semibold", trend > 0 ? "text-green-400" : trend < 0 ? "text-red-400" : "text-[#64748b]")}>
          {trendIcon}{Math.abs(trend)}%
        </span>
      )}
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**
```bash
npx tsc --noEmit 2>&1 | grep TrustScoreGauge
```
Expected: no output (no errors).

**Step 3: Commit**
```bash
git add src/components/ops/rondas/TrustScoreGauge.tsx
git commit -m "feat(rondas): add TrustScoreGauge SVG primitive"
```

---

## Task 2: StatusBadge primitive

**Files:**
- Create: `src/components/ops/rondas/StatusBadge.tsx`

**Step 1: Write the component**

```tsx
// src/components/ops/rondas/StatusBadge.tsx
import { cn } from "@/lib/utils";

type StatusVariant = "en_curso" | "completada" | "atrasada" | "pendiente" | "no_realizada" | "critica" | "warning" | "info";

const STATUS_CONFIG: Record<StatusVariant, { label: string; dot: string; bg: string; text: string; border: string }> = {
  en_curso:      { label: "En curso",      dot: "bg-blue-400",    bg: "bg-blue-500/10",   text: "text-blue-400",   border: "border-blue-500/20" },
  completada:    { label: "Completada",    dot: "bg-green-400",   bg: "bg-green-500/10",  text: "text-green-400",  border: "border-green-500/20" },
  atrasada:      { label: "Atrasada",      dot: "bg-red-400",     bg: "bg-red-500/10",    text: "text-red-400",    border: "border-red-500/20" },
  pendiente:     { label: "Pendiente",     dot: "bg-amber-400",   bg: "bg-amber-500/10",  text: "text-amber-400",  border: "border-amber-500/20" },
  no_realizada:  { label: "No realizada",  dot: "bg-[#64748b]",   bg: "bg-white/5",       text: "text-[#94a3b8]",  border: "border-white/10" },
  critica:       { label: "Crítica",       dot: "bg-red-400 animate-pulse", bg: "bg-red-500/10",    text: "text-red-400",    border: "border-red-500/20" },
  warning:       { label: "Warning",       dot: "bg-amber-400",   bg: "bg-amber-500/10",  text: "text-amber-400",  border: "border-amber-500/20" },
  info:          { label: "Info",          dot: "bg-blue-400",    bg: "bg-blue-500/10",   text: "text-blue-400",   border: "border-blue-500/20" },
};

// Normalize raw DB status strings to our variants
export function normalizeStatus(raw: string): StatusVariant {
  const map: Record<string, StatusVariant> = {
    EN_CURSO: "en_curso",
    COMPLETADA: "completada",
    ATRASADA: "atrasada",
    PENDIENTE: "pendiente",
    NO_REALIZADA: "no_realizada",
    en_curso: "en_curso",
    completada: "completada",
    atrasada: "atrasada",
    pendiente: "pendiente",
    no_realizada: "no_realizada",
    CRITICA: "critica",
    WARNING: "warning",
    INFO: "info",
  };
  return map[raw] ?? "pendiente";
}

export function StatusBadge({ status, customLabel }: { status: StatusVariant | string; customLabel?: string }) {
  const variant = normalizeStatus(status);
  const cfg = STATUS_CONFIG[variant] ?? STATUS_CONFIG.pendiente;
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
      cfg.bg, cfg.text, cfg.border
    )}>
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", cfg.dot)} />
      {customLabel ?? cfg.label}
    </span>
  );
}
```

**Step 2: Verify TypeScript**
```bash
npx tsc --noEmit 2>&1 | grep StatusBadge
```
Expected: no output.

**Step 3: Commit**
```bash
git add src/components/ops/rondas/StatusBadge.tsx
git commit -m "feat(rondas): add StatusBadge pill primitive"
```

---

## Task 3: FilterPills primitive

**Files:**
- Create: `src/components/ops/rondas/FilterPills.tsx`

**Step 1: Write the component**

```tsx
// src/components/ops/rondas/FilterPills.tsx
import { cn } from "@/lib/utils";

interface FilterPill {
  id: string;
  label: string;
  count?: number;
}

interface FilterPillsProps {
  pills: FilterPill[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

export function FilterPills({ pills, value, onChange, className }: FilterPillsProps) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {pills.map((pill) => {
        const active = value === pill.id;
        return (
          <button
            key={pill.id}
            onClick={() => onChange(pill.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-all",
              active
                ? "bg-[#2dd4bf]/15 border-[#2dd4bf]/40 text-[#2dd4bf]"
                : "bg-white/5 border-white/10 text-[#94a3b8] hover:border-white/20 hover:text-[#f1f5f9]"
            )}
          >
            {pill.label}
            {pill.count !== undefined && (
              <span className={cn(
                "rounded-full px-1 min-w-[16px] text-center",
                active ? "bg-[#2dd4bf]/20 text-[#2dd4bf]" : "bg-white/10 text-[#64748b]"
              )}>
                {pill.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
```

**Step 2: Verify TypeScript**
```bash
npx tsc --noEmit 2>&1 | grep FilterPills
```
Expected: no output.

**Step 3: Commit**
```bash
git add src/components/ops/rondas/FilterPills.tsx
git commit -m "feat(rondas): add FilterPills chip row primitive"
```

---

## Task 4: EventFeedItem primitive

**Files:**
- Create: `src/components/ops/rondas/EventFeedItem.tsx`

**Step 1: Write the component**

```tsx
// src/components/ops/rondas/EventFeedItem.tsx
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, Play, Flag, Info } from "lucide-react";

type EventType = "check" | "alert" | "start" | "complete" | "info";

const EVENT_CONFIG: Record<EventType, { icon: React.ElementType; color: string; bg: string }> = {
  check:    { icon: CheckCircle2,  color: "text-green-400",  bg: "bg-green-500/10" },
  alert:    { icon: AlertTriangle, color: "text-red-400",    bg: "bg-red-500/10" },
  start:    { icon: Play,          color: "text-blue-400",   bg: "bg-blue-500/10" },
  complete: { icon: Flag,          color: "text-[#2dd4bf]",  bg: "bg-[#2dd4bf]/10" },
  info:     { icon: Info,          color: "text-[#94a3b8]",  bg: "bg-white/5" },
};

interface EventFeedItemProps {
  type: EventType | string;
  message: string;
  timestamp: string; // ISO string
  actor?: string;
  isLast?: boolean;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return new Date(iso).toLocaleString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

export function EventFeedItem({ type, message, timestamp, actor, isLast }: EventFeedItemProps) {
  const cfg = EVENT_CONFIG[type as EventType] ?? EVENT_CONFIG.info;
  const Icon = cfg.icon;
  return (
    <div className="flex gap-3 group">
      <div className="flex flex-col items-center">
        <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0", cfg.bg)}>
          <Icon className={cn("w-3.5 h-3.5", cfg.color)} />
        </div>
        {!isLast && <div className="w-px flex-1 bg-white/[0.06] mt-1" />}
      </div>
      <div className="pb-4 flex-1 min-w-0">
        <p className="text-[13px] text-[#f1f5f9] leading-snug">{message}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {actor && <span className="text-[11px] text-[#64748b]">{actor}</span>}
          <span className="text-[11px] text-[#64748b]">{formatRelative(timestamp)}</span>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify TypeScript**
```bash
npx tsc --noEmit 2>&1 | grep EventFeedItem
```
Expected: no output.

**Step 3: Commit**
```bash
git add src/components/ops/rondas/EventFeedItem.tsx
git commit -m "feat(rondas): add EventFeedItem timeline primitive"
```

---

## Task 5: RondaRowCard mobile primitive

**Files:**
- Create: `src/components/ops/rondas/RondaRowCard.tsx`

**Step 1: Write the component**

```tsx
// src/components/ops/rondas/RondaRowCard.tsx
import { cn } from "@/lib/utils";
import { TrustScoreGauge } from "./TrustScoreGauge";
import { StatusBadge, normalizeStatus } from "./StatusBadge";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { formatPersonName } from "@/lib/personas";

interface RondaRowCardProps {
  id: string;
  status: string;
  installationName: string;
  templateName: string;
  guardiaFirstName?: string;
  guardiaLastName?: string;
  scheduledAt: string;
  checkpointsCompleted: number;
  checkpointsTotal: number;
  trustScore: number;
  onView?: (id: string) => void;
}

export function RondaRowCard({
  id, status, installationName, templateName,
  guardiaFirstName, guardiaLastName,
  scheduledAt, checkpointsCompleted, checkpointsTotal, trustScore,
  onView,
}: RondaRowCardProps) {
  const isAtrasada = normalizeStatus(status) === "atrasada";
  const pct = checkpointsTotal > 0 ? Math.round((checkpointsCompleted / checkpointsTotal) * 100) : 0;

  return (
    <div className={cn(
      "rounded-xl border p-4 space-y-3 transition-colors",
      isAtrasada
        ? "bg-red-500/5 border-red-500/20 border-l-2 border-l-red-500"
        : "bg-[#111827] border-[#1e293b]"
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[#f1f5f9] truncate">{installationName}</p>
          <p className="text-[11px] text-[#94a3b8] truncate">{templateName}</p>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 space-y-1">
          <div className="flex justify-between text-[11px] text-[#64748b]">
            <span>{checkpointsCompleted}/{checkpointsTotal} checks</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1 bg-[#1e293b] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                background: pct >= 70 ? "#22c55e" : pct >= 40 ? "#f59e0b" : "#ef4444"
              }}
            />
          </div>
        </div>
        <TrustScoreGauge score={trustScore} size="sm" showLabel />
      </div>

      <div className="flex items-center justify-between">
        <div>
          {guardiaFirstName && (
            <p className="text-[11px] text-[#94a3b8]">
              {formatPersonName(guardiaFirstName, guardiaLastName ?? "")}
            </p>
          )}
          <p className="text-[11px] text-[#64748b]">
            {new Date(scheduledAt).toLocaleString("es-CL", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        {onView && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-[#94a3b8] hover:text-[#f1f5f9]"
            onClick={() => onView(id)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify TypeScript**
```bash
npx tsc --noEmit 2>&1 | grep RondaRowCard
```
Expected: no output.

**Step 3: Commit**
```bash
git add src/components/ops/rondas/RondaRowCard.tsx
git commit -m "feat(rondas): add RondaRowCard mobile card primitive"
```

---

## Task 6: Refactor Dashboard (`RondasDashboardClient.tsx`)

**Files:**
- Modify: `src/components/ops/rondas/RondasDashboardClient.tsx`

**Context:** Current file has 82 lines. KpiGrid with 6 cards + DataTable. No filtering.

**Step 1: Rewrite the component**

Replace entire file content with:

```tsx
"use client";

import { useMemo, useState } from "react";
import { TrustScoreGauge } from "./TrustScoreGauge";
import { StatusBadge, normalizeStatus } from "./StatusBadge";
import { FilterPills } from "./FilterPills";
import { formatPersonName } from "@/lib/personas";
import type { DataTableColumn } from "@/components/opai";
import { DataTable } from "@/components/opai";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";

interface Row {
  id: string;
  status: string;
  checkpointsTotal: number;
  checkpointsCompletados: number;
  trustScore: number;
  scheduledAt: string;
  rondaTemplate: { name: string; installation: { name: string } };
  guardia: { persona: { firstName: string; lastName: string } } | null;
}

interface Stats {
  total: number;
  completadas: number;
  enCurso: number;
  pendientes: number;
  noRealizadas: number;
  trustPromedio: number;
  atrasadas?: number;
}

const FILTER_PILLS = [
  { id: "all",         label: "Todas" },
  { id: "en_curso",    label: "En curso" },
  { id: "atrasada",    label: "Atrasadas" },
  { id: "pendiente",   label: "Pendientes" },
  { id: "completada",  label: "Completadas" },
];

export function RondasDashboardClient({ rows, stats }: { rows: Row[]; stats: Stats }) {
  const [filter, setFilter] = useState("all");

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((r) => normalizeStatus(r.status) === filter);
  }, [rows, filter]);

  // Count per status for pills
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    rows.forEach((r) => {
      const s = normalizeStatus(r.status);
      c[s] = (c[s] ?? 0) + 1;
    });
    return c;
  }, [rows]);

  const pillsWithCounts = FILTER_PILLS.map((p) => ({
    ...p,
    count: p.id !== "all" ? (counts[p.id] ?? 0) : undefined,
  }));

  const atrasadas = counts["atrasada"] ?? stats.atrasadas ?? 0;

  const columns: DataTableColumn[] = [
    {
      key: "instalacion",
      label: "Instalación / Guardia",
      render: (_v, row) => (
        <div>
          <p className="text-[13px] font-medium text-[#f1f5f9]">{row.rondaTemplate.installation.name}</p>
          <p className="text-[11px] text-[#94a3b8]">
            {row.guardia
              ? formatPersonName(row.guardia.persona.firstName, row.guardia.persona.lastName)
              : "Sin asignar"}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      label: "Estado",
      render: (_v, row) => <StatusBadge status={row.status} />,
    },
    {
      key: "scheduledAt",
      label: "Hora",
      render: (_v, row) => (
        <span className="text-[13px] text-[#94a3b8] tabular-nums">
          {new Date(row.scheduledAt).toLocaleString("es-CL", { hour: "2-digit", minute: "2-digit" })}
        </span>
      ),
    },
    {
      key: "progreso",
      label: "Progreso",
      className: "min-w-[140px]",
      render: (_v, row) => {
        const pct = row.checkpointsTotal > 0
          ? Math.round((row.checkpointsCompletados / row.checkpointsTotal) * 100)
          : 0;
        return (
          <div className="space-y-1">
            <div className="h-1 bg-[#1e293b] rounded-full overflow-hidden w-28">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, background: pct >= 70 ? "#22c55e" : pct >= 40 ? "#f59e0b" : "#ef4444" }}
              />
            </div>
            <p className="text-[11px] text-[#64748b]">
              {row.checkpointsCompletados}/{row.checkpointsTotal}
            </p>
          </div>
        );
      },
    },
    {
      key: "trust",
      label: "Trust",
      render: (_v, row) => <TrustScoreGauge score={row.trustScore} size="sm" />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiTile
          label="En curso"
          value={stats.enCurso}
          color="#3b82f6"
        />
        <KpiTile
          label="Completadas"
          value={stats.completadas}
          color="#22c55e"
        />
        <KpiTile
          label="Atrasadas"
          value={atrasadas}
          color="#ef4444"
          highlight={atrasadas > 0}
        />
        <KpiTile
          label="Pendientes"
          value={stats.pendientes}
          color="#f59e0b"
        />
      </div>

      {/* Trust Score Hero */}
      <div className="rounded-xl border border-[#1e293b] bg-[#111827] p-5">
        <div className="flex items-center justify-between gap-6">
          <div>
            <p className="text-[11px] uppercase tracking-widest font-semibold text-[#64748b] mb-1">
              Trust Score promedio
            </p>
            <p className="text-[13px] text-[#94a3b8] leading-relaxed">
              Indicador consolidado de calidad de rondas basado en checkpoints, tiempo, velocidad, secuencia y puntualidad.
            </p>
            <div className="flex flex-wrap gap-4 mt-3">
              {[
                { label: "Checkpoints", pct: 30, color: "#22c55e" },
                { label: "Tiempo", pct: 20, color: "#3b82f6" },
                { label: "Velocidad", pct: 20, color: "#a855f7" },
                { label: "Secuencia", pct: 15, color: "#f59e0b" },
                { label: "Puntualidad", pct: 15, color: "#2dd4bf" },
              ].map((f) => (
                <div key={f.label} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: f.color }} />
                  <span className="text-[11px] text-[#94a3b8]">{f.label} {f.pct}%</span>
                </div>
              ))}
            </div>
          </div>
          <TrustScoreGauge score={stats.trustPromedio} size="lg" showLabel />
        </div>
      </div>

      {/* Table with filters */}
      <div className="rounded-xl border border-[#1e293b] bg-[#111827] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[#1e293b]">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#2dd4bf]" />
            <span className="text-[13px] font-semibold text-[#f1f5f9]">Ejecuciones</span>
            <span className="text-[11px] text-[#64748b] border border-[#1e293b] rounded-full px-2 py-0.5">
              Hoy
            </span>
          </div>
          <FilterPills pills={pillsWithCounts} value={filter} onChange={setFilter} />
        </div>
        <DataTable
          columns={columns}
          data={filtered}
          emptyMessage="Sin rondas para este filtro."
          rowClassName={(row) =>
            normalizeStatus(row.status) === "atrasada"
              ? "bg-red-500/5 border-l-2 border-l-red-500"
              : ""
          }
        />
      </div>
    </div>
  );
}

function KpiTile({ label, value, color, highlight }: {
  label: string;
  value: number;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="rounded-xl border bg-[#111827] p-4 relative overflow-hidden"
      style={{ borderColor: `${color}20`, borderLeftColor: color, borderLeftWidth: 3 }}
    >
      {highlight && (
        <div className="absolute inset-0 bg-red-500/5 pointer-events-none" />
      )}
      <p className="text-[11px] uppercase tracking-wider font-semibold mb-2" style={{ color: `${color}99` }}>
        {label}
      </p>
      <p className="text-3xl font-extrabold tracking-tight" style={{ color }}>
        {value}
      </p>
    </div>
  );
}
```

> **Note:** `rowClassName` may not exist on the current `DataTable`. If it doesn't, wrap each row manually or skip that prop — the filter pills already visually separate atrasadas. Check `src/components/opai/DataTable.tsx` to see if `rowClassName` is supported before adding it.

**Step 2: Check if DataTable supports rowClassName**
```bash
grep -n "rowClassName" src/components/opai/DataTable.tsx
```
If not found, remove `rowClassName` from the DataTable call in step 1.

**Step 3: Verify TypeScript**
```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

**Step 4: Visual check**
Navigate to `/ops/rondas` in the browser:
- [ ] 4 KPI tiles visible with left colored borders
- [ ] Trust Score hero with SVG gauge
- [ ] Filter pills work (click "Atrasadas" filters the table)
- [ ] StatusBadge replaces plain text in Estado column
- [ ] Mobile (375px): KPIs in 2-col grid, table scrolls horizontally

**Step 5: Commit**
```bash
git add src/components/ops/rondas/RondasDashboardClient.tsx
git commit -m "feat(rondas): refactor Dashboard with KPI tiles, trust gauge, filter pills"
```

---

## Task 7: Refactor Monitor (`RondasMonitoreoClient.tsx`)

**Files:**
- Modify: `src/components/ops/rondas/RondasMonitoreoClient.tsx`

**Context:** Currently uses `MonitoreoMap`, `MonitoreoGuardPanel`, `MonitoreoTurnoHeader`, `CerrarTurnoModal`. Keep these sub-components. Only refactor the outer layout shell and add the "En vivo" badge + panel structure.

**Step 1: Read the full current file**

Read `src/components/ops/rondas/RondasMonitoreoClient.tsx` to understand the full render tree before modifying.

**Step 2: Refactor the layout wrapper**

The key change is the outer layout. Find the return statement and restructure:

```tsx
// The key structural change — wrap existing content in new layout shell
return (
  <div className="flex flex-col h-[calc(100vh-120px)] gap-0 -mx-4 -mb-4 md:-mx-6 md:-mb-6 overflow-hidden">
    {/* Top bar with live indicator + installation filter */}
    <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-[#1e293b] bg-[#111827] shrink-0">
      <div className="flex items-center gap-3">
        {/* En vivo badge */}
        <div className="flex items-center gap-2 rounded-full bg-green-500/10 border border-green-500/20 px-3 py-1">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-[11px] font-semibold text-green-400 uppercase tracking-wider">En vivo</span>
        </div>
        <span className="text-[13px] text-[#64748b]">{filtered.length} rondas activas</span>
      </div>
      {/* Installation filter — keep existing SearchableSelect */}
      <SearchableSelect ... />
    </div>

    {/* Main content: map + panel */}
    <div className="flex flex-1 overflow-hidden">
      {/* Map takes remaining space */}
      <div className="flex-1 relative">
        <MonitoreoMap ... />  {/* keep existing map component */}
      </div>

      {/* Side panel — desktop only */}
      <div className="hidden md:flex w-80 flex-col border-l border-[#1e293b] bg-[#111827]">
        {/* Section: Guardias en turno */}
        <div className="px-4 py-3 border-b border-[#1e293b]">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-[#64748b]">Guardias en turno</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {/* existing MonitoreoGuardPanel content or map over filtered */}
          <MonitoreoGuardPanel rows={filtered} onSelect={setSelectedRondaId} />
        </div>

        {/* Section: Feed de eventos */}
        <div className="px-4 py-2 border-t border-b border-[#1e293b]">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-[#64748b]">Eventos recientes</p>
        </div>
        <div className="h-48 overflow-y-auto p-3">
          {/* EventFeedItem list — if events data available */}
        </div>

        {/* CTA fixed at bottom */}
        <div className="p-3 border-t border-[#1e293b] shrink-0">
          <button
            onClick={() => setCloseTurnoId(filtered[0]?.id ?? null)}
            className="w-full py-2.5 rounded-lg bg-[#2dd4bf] text-black text-[13px] font-semibold hover:bg-[#2dd4bf]/90 transition-colors"
          >
            Cerrar turno con resumen IA
          </button>
        </div>
      </div>
    </div>

    {/* Mobile: bottom sheet (Sheet from shadcn) */}
    {/* Keep existing mobile behavior or wrap in Sheet trigger */}

    <CerrarTurnoModal ... />  {/* keep existing modal */}
  </div>
);
```

> Adapt the exact props by reading the current file first. The goal is wrapping the existing sub-components in a new layout shell — not rewriting their internals.

**Step 3: Visual check at `/ops/rondas/monitoreo`**
- [ ] "En vivo" badge with pulsing dot visible
- [ ] Map takes full available width
- [ ] Right panel visible on desktop (≥768px)
- [ ] Panel sections: Guardias / Feed / CTA button
- [ ] Mobile (375px): full-width map, panel hidden

**Step 4: Commit**
```bash
git add src/components/ops/rondas/RondasMonitoreoClient.tsx
git commit -m "feat(rondas): refactor Monitor layout with live badge and side panel"
```

---

## Task 8: Refactor Alertas (`RondasAlertasClient.tsx`)

**Files:**
- Modify: `src/components/ops/rondas/RondasAlertasClient.tsx`

**Context:** Already has good filter logic. Needs visual overhaul of filter area + table rows using new primitives.

**Step 1: Read the full current file**

Read `src/components/ops/rondas/RondasAlertasClient.tsx` (continue reading from line 80).

**Step 2: Refactor filter section**

Replace the existing filter UI with two-row layout:

```tsx
{/* Filters */}
<div className="space-y-2">
  {/* Row 1: Severity + Installation + Date */}
  <div className="flex flex-wrap items-center gap-2">
    <FilterPills
      pills={[
        { id: "all", label: "Todas" },
        { id: "CRITICA", label: "Crítica" },
        { id: "WARNING", label: "Warning" },
        { id: "INFO", label: "Info" },
      ]}
      value={severityFilter}
      onChange={setSeverityFilter}
    />
    <div className="flex items-center gap-2 ml-auto">
      <SearchableSelect
        options={installations.map((i) => ({ id: i.id, label: i.name }))}
        value={installationFilter}
        onChange={setInstallationFilter}
        placeholder="Instalación..."
        className="w-48"
      />
      <input
        type="date"
        value={dateFrom}
        onChange={(e) => setDateFrom(e.target.value)}
        className="h-8 rounded-lg border border-[#1e293b] bg-[#111827] text-[13px] text-[#f1f5f9] px-3"
      />
      <input
        type="date"
        value={dateTo}
        onChange={(e) => setDateTo(e.target.value)}
        className="h-8 rounded-lg border border-[#1e293b] bg-[#111827] text-[13px] text-[#f1f5f9] px-3"
      />
    </div>
  </div>

  {/* Row 2: State */}
  <FilterPills
    pills={[
      { id: "no_resueltas", label: "No resueltas" },
      { id: "no_reconocidas", label: "Sin reconocer" },
      { id: "reconocidas", label: "Reconocidas" },
      { id: "resueltas", label: "Resueltas" },
      { id: "all_states", label: "Todas" },
    ]}
    value={stateFilter}
    onChange={setStateFilter}
  />
</div>
```

**Step 3: Refactor the AlertaCard or table rows**

Read `src/components/ops/rondas/alerta-card.tsx` to understand current structure, then update to use `StatusBadge` for severity display and improve the action buttons:

```tsx
// In alerta-card.tsx or inline in the list:
// Replace plain text severity with StatusBadge
<StatusBadge status={alerta.severidad} />

// Action buttons
<div className="flex gap-1">
  {!alerta.isAcknowledged && (
    <button
      onClick={() => onAcknowledge(alerta.id)}
      className="text-[11px] px-2.5 py-1 rounded-lg border border-[#1e293b] text-[#94a3b8] hover:text-[#f1f5f9] hover:border-[#2dd4bf]/40 transition-colors"
    >
      Reconocer
    </button>
  )}
  {!alerta.resuelta && (
    <button
      onClick={() => onResolve(alerta.id)}
      className="text-[11px] px-2.5 py-1 rounded-lg border border-green-500/20 text-green-400 hover:bg-green-500/10 transition-colors"
    >
      Resolver
    </button>
  )}
</div>
```

**Step 4: Add improved empty state**

```tsx
{filtered.length === 0 && (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
      <ShieldCheck className="w-6 h-6 text-green-400" />
    </div>
    <p className="text-[15px] font-semibold text-[#f1f5f9] mb-1">Sin alertas activas</p>
    <p className="text-[13px] text-[#94a3b8]">
      Sistema activo · Monitoreando {/* pass active count as prop */} rondas activas
    </p>
  </div>
)}
```

**Step 5: Visual check at `/ops/rondas/alertas`**
- [ ] Two-row filter layout
- [ ] StatusBadge shows severity with dot + color
- [ ] Action buttons are styled correctly
- [ ] Empty state shows shield + message

**Step 6: Commit**
```bash
git add src/components/ops/rondas/RondasAlertasClient.tsx src/components/ops/rondas/alerta-card.tsx
git commit -m "feat(rondas): refactor Alertas with two-row filters and improved cards"
```

---

## Task 9: Refactor Configuración — wizard layout (`RondasConfiguracionClient.tsx`)

**Files:**
- Modify: `src/components/ops/rondas/RondasConfiguracionClient.tsx`

This is the most complex task. Read the full file before editing.

**Step 1: Read the full file**
```bash
# Run in terminal to see full file
cat src/components/ops/rondas/RondasConfiguracionClient.tsx
```

**Step 2: Replace tab navigation with wizard-style steps**

Find the `TABS` constant and the `ChipTabs` render. Replace with:

```tsx
// Replace TABS array and tab render
const STEPS = [
  { id: "checkpoints", label: "Checkpoints", desc: "Define los puntos de control", icon: MapPin },
  { id: "plantillas",  label: "Plantillas",  desc: "Agrupa checkpoints en rutas",   icon: FileText },
  { id: "programacion",label: "Programación", desc: "Programa cuándo se ejecutan",  icon: Clock },
];

// Completion check per step
const stepComplete = {
  checkpoints: checkpoints.length > 0,
  plantillas:  templates.length > 0,
  programacion: programaciones.length > 0,
};

// Replace ChipTabs render with:
<div className="flex items-center gap-0 border border-[#1e293b] rounded-xl overflow-hidden">
  {STEPS.map((step, i) => {
    const isActive = activeTab === step.id;
    const isDone = stepComplete[step.id as keyof typeof stepComplete];
    const Icon = step.icon;
    return (
      <button
        key={step.id}
        onClick={() => setActiveTab(step.id)}
        className={cn(
          "flex-1 flex flex-col items-center gap-1 px-4 py-3 text-center transition-colors border-r border-[#1e293b] last:border-r-0",
          isActive ? "bg-[#2dd4bf]/10 text-[#2dd4bf]" : "bg-[#111827] text-[#94a3b8] hover:text-[#f1f5f9]"
        )}
      >
        <div className="flex items-center gap-2">
          <span className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0",
            isDone ? "bg-green-500/20 text-green-400" : isActive ? "bg-[#2dd4bf]/20 text-[#2dd4bf]" : "bg-white/10 text-[#64748b]"
          )}>
            {isDone ? "✓" : i + 1}
          </span>
          <span className="text-[13px] font-semibold hidden sm:block">{step.label}</span>
        </div>
        <span className="text-[11px] text-[#64748b] hidden lg:block">{step.desc}</span>
      </button>
    );
  })}
</div>
```

**Step 3: Add sticky header with installation summary**

Wrap the installation selectors in a sticky header:

```tsx
<div className="sticky top-0 z-10 bg-[#0a0e1a] pb-4 space-y-3">
  {/* Installation selectors — keep existing SearchableSelect */}
  <div className="flex flex-wrap gap-3 items-end">
    <div className="w-48">
      <p className="text-[11px] uppercase tracking-wider font-semibold text-[#64748b] mb-1">Cliente</p>
      {/* existing client SearchableSelect */}
    </div>
    <div className="w-64">
      <p className="text-[11px] uppercase tracking-wider font-semibold text-[#64748b] mb-1">Instalación</p>
      {/* existing installation SearchableSelect */}
    </div>
    {installationId && (
      <div className="flex gap-2 ml-auto flex-wrap">
        {[
          { label: "checkpoints", value: checkpoints.length, color: "#a855f7" },
          { label: "plantillas",  value: templates.length,   color: "#2dd4bf" },
          { label: "programaciones", value: programaciones.length, color: "#3b82f6" },
        ].map((s) => (
          <span key={s.label} className="text-[11px] text-[#94a3b8] border border-[#1e293b] rounded-full px-2.5 py-0.5">
            <span className="font-bold" style={{ color: s.color }}>{s.value}</span> {s.label}
          </span>
        ))}
      </div>
    )}
  </div>

  {/* Wizard step tabs */}
  {installationId && <div>{/* step tabs from step 2 */}</div>}
</div>
```

**Step 4: Add 50/50 layout wrapper to each tab content**

For Checkpoints tab:
```tsx
{activeTab === "checkpoints" && (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
    {/* Left: Map */}
    <div className="rounded-xl border border-[#1e293b] overflow-hidden h-[500px]">
      <CheckpointMapCreator ... /> {/* existing map component */}
    </div>
    {/* Right: Checkpoint list */}
    <div className="space-y-2">
      {checkpoints.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-[#1e293b] p-8 text-center text-[#64748b]">
          <MapPin className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-[13px]">Click en el mapa para agregar checkpoints</p>
        </div>
      )}
      {checkpoints.map((cp: any, idx: number) => (
        <div key={cp.id} className="rounded-xl border border-[#1e293b] bg-[#111827] p-3 flex items-center gap-3">
          <span className="w-7 h-7 rounded-full bg-[#2dd4bf]/10 text-[#2dd4bf] text-[11px] font-bold flex items-center justify-center shrink-0">
            {idx + 1}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-[#f1f5f9] truncate">{cp.name}</p>
            <div className="flex gap-1.5 mt-0.5">
              <span className="text-[10px] border rounded-full px-1.5 py-px border-purple-500/20 text-purple-400">
                {cp.type ?? "QR"}
              </span>
              {cp.isCritical && (
                <span className="text-[10px] border rounded-full px-1.5 py-px border-red-500/20 text-red-400">
                  Crítico
                </span>
              )}
            </div>
          </div>
          {/* existing delete/edit buttons */}
        </div>
      ))}
    </div>
  </div>
)}
```

Apply the same 50/50 pattern to Plantillas and Programación tabs (keep existing form components, wrap in grid).

**Step 5: Visual check at `/ops/rondas/configuracion`**
- [ ] Sticky header with client/installation selectors + summary badges
- [ ] Wizard tabs with numbered steps and completion indicators
- [ ] 50/50 layout in each step on desktop
- [ ] Step numbers turn green when data exists
- [ ] Mobile: stacked layout (map on top, list below)

**Step 6: Commit**
```bash
git add src/components/ops/rondas/RondasConfiguracionClient.tsx
git commit -m "feat(rondas): refactor Configuracion as visual wizard with 50/50 layouts"
```

---

## Task 10: Refactor Reportes (`RondasReportesClient.tsx`)

**Files:**
- Modify: `src/components/ops/rondas/RondasReportesClient.tsx`

**Step 1: Read the full current file**

Read `src/components/ops/rondas/RondasReportesClient.tsx` to see existing period selector and KPI layout.

**Step 2: Replace KpiGrid with trend KPIs**

Find the `KpiGrid` section and replace with:

```tsx
{/* Period selector */}
<div className="flex items-center justify-between gap-3">
  <h2 className="text-[15px] font-bold text-[#f1f5f9]">Resumen del período</h2>
  <FilterPills
    pills={[
      { id: "7", label: "7 días" },
      { id: "14", label: "14 días" },
      { id: "30", label: "30 días" },
    ]}
    value={String(days)}
    onChange={(v) => setDays(Number(v))}
  />
</div>

{/* Trend KPIs */}
<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
  <TrendKpi
    label="Compliance"
    value={`${totals.compliance}%`}
    trend={/* calculate vs previous period if available */ undefined}
    color="#22c55e"
  />
  <TrendKpi
    label="Trust Score"
    value={totals.trustPromedio}
    color="#2dd4bf"
  />
  <TrendKpi
    label="Completadas"
    value={totals.completadas}
    color="#3b82f6"
  />
  <TrendKpi
    label="No realizadas"
    value={totals.noRealizadas}
    color="#ef4444"
    highlight={totals.noRealizadas > 0}
  />
</div>
```

Add `TrendKpi` as a local component in the same file:

```tsx
function TrendKpi({ label, value, trend, color, highlight }: {
  label: string;
  value: string | number;
  trend?: number;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="rounded-xl border bg-[#111827] p-4 relative"
      style={{ borderColor: `${color}20`, borderLeftColor: color, borderLeftWidth: 3 }}
    >
      <p className="text-[11px] uppercase tracking-wider font-semibold mb-2" style={{ color: `${color}99` }}>
        {label}
      </p>
      <p className="text-2xl font-extrabold tracking-tight" style={{ color }}>
        {value}
      </p>
      {trend !== undefined && (
        <p className={cn("text-[11px] font-semibold mt-1", trend >= 0 ? "text-green-400" : "text-red-400")}>
          {trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}% vs anterior
        </p>
      )}
    </div>
  );
}
```

**Step 3: Visual check at `/ops/rondas/reportes`**
- [ ] Period pills (7d/14d/30d) work
- [ ] KPIs have colored left borders
- [ ] Existing charts and tabs still work

**Step 4: Commit**
```bash
git add src/components/ops/rondas/RondasReportesClient.tsx
git commit -m "feat(rondas): refactor Reportes with trend KPIs and period pills"
```

---

## Task 11: Refactor Centro IA (`RondasCentroIaClient.tsx`)

**Files:**
- Modify: `src/components/ops/rondas/RondasCentroIaClient.tsx`

This screen is already well-structured. Changes are minor.

**Step 1: Read the full current file**

Read the complete `RondasCentroIaClient.tsx` including the `IaUmbralesConfig` and `IaRecommendations` sub-components.

**Step 2: Add section headers + historial section**

In `RondasCentroIaClient.tsx`, after the 2-column grid, add:

```tsx
{/* Historial de recomendaciones */}
<details className="group">
  <summary className="flex items-center justify-between cursor-pointer list-none rounded-xl border border-[#1e293b] bg-[#111827] px-4 py-3">
    <div className="flex items-center gap-2">
      <History className="w-4 h-4 text-[#2dd4bf]" />
      <span className="text-[13px] font-semibold text-[#f1f5f9]">Historial de recomendaciones</span>
    </div>
    <ChevronDown className="w-4 h-4 text-[#64748b] transition-transform group-open:rotate-180" />
  </summary>
  <div className="mt-2 rounded-xl border border-[#1e293b] bg-[#111827] p-4">
    <p className="text-[13px] text-[#64748b] text-center py-4">
      Las recomendaciones anteriores aparecerán aquí.
    </p>
  </div>
</details>
```

Add `History, ChevronDown` to lucide imports.

**Step 3: Read `IaRecommendations.tsx` and trigger auto-load**

In `IaRecommendations.tsx`, check if there's already an auto-load on mount. If there's a button that triggers generation, add a `useEffect` to call it on mount when data is available.

**Step 4: Visual check at `/ops/rondas/centro-ia`**
- [ ] 2-column layout intact
- [ ] Historial section collapsible
- [ ] Recommendations auto-load on page visit (no manual click needed)

**Step 5: Commit**
```bash
git add src/components/ops/rondas/RondasCentroIaClient.tsx
git commit -m "feat(rondas): add historial section and auto-load to Centro IA"
```

---

## Task 12: Mobile pass — verify 375px breakpoints

**Step 1: Open browser DevTools at 375px width and check each route:**

| Route | Check |
|-------|-------|
| `/ops/rondas` | KPIs in 2-col, table scrolls, filter pills wrap |
| `/ops/rondas/monitoreo` | Map full width, panel hidden, layout usable |
| `/ops/rondas/alertas` | Filters stack vertically, alert cards readable |
| `/ops/rondas/configuracion` | Wizard tabs show numbers only, map stacked above list |
| `/ops/rondas/reportes` | Period pills wrap, KPIs in 2-col |
| `/ops/rondas/centro-ia` | Single column, collapsible sections |

**Step 2: Fix any overflow or touch target issues**

Minimum touch target: `min-h-[44px]` on all interactive elements.

**Step 3: Final commit**
```bash
git add -A
git commit -m "fix(rondas): mobile layout fixes for 375px breakpoint"
```

---

## Task 13: TypeScript final check and cleanup

```bash
npx tsc --noEmit 2>&1
```

Fix any remaining type errors. Common issues:
- `rowClassName` prop on DataTable if not supported (remove it)
- Missing `cn` import in new files
- `any` types that need narrowing

```bash
git add -A
git commit -m "fix(rondas): resolve TypeScript errors from visual refactor"
```

---

## Completion Checklist

- [ ] All 5 primitives created and compiling
- [ ] Dashboard: KPI tiles + Trust hero + filter pills + styled table
- [ ] Monitor: "En vivo" badge + side panel layout
- [ ] Alertas: 2-row filters + StatusBadge + improved empty state
- [ ] Configuración: wizard tabs + sticky header + 50/50 layouts
- [ ] Reportes: trend KPIs + period pills
- [ ] Centro IA: historial + auto-load
- [ ] Mobile 375px: all screens usable
- [ ] TypeScript: no errors
- [ ] Zero API changes, zero schema changes
