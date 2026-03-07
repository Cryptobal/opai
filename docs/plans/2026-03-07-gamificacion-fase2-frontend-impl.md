# Gamificación Fase 2 — Frontend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the complete gamificación frontend across 5 surfaces: guardia detail tab, installation section, guard portal, client portal, and admin configuration/management.

**Architecture:** Component-first approach — build shared gamification components first (`src/components/gamification/`), then integrate into each surface. Data fetching via `fetch()` + `useState` + `useCallback` (OPAI pattern). Charts via Recharts v3. Dark/light mode via existing ThemeProvider with `dark:` classes and semantic tokens.

**Tech Stack:** Next.js 15 App Router, React 18, TypeScript, Tailwind CSS, shadcn/ui (Card, Badge, Button, Dialog, Sheet, Select, Input, Switch, Progress), Recharts v3, Lucide React icons.

---

## Integration Points Summary

| Surface | File to Modify | Integration Mechanism |
|---------|---------------|----------------------|
| Guardia detail tab | `src/components/ops/GuardiaDetailClient.tsx:215-224` | Add to `TabKey` union, `TABS[]` array, and `renderTabContent()` switch |
| Guard portal section | `src/lib/guard-portal.ts:85-130` + `src/components/portal/GuardPortalClient.tsx:64-214` | Add `"desempeno"` to `PortalSection` type, `PORTAL_NAV_ITEMS`, `PORTAL_BOTTOM_NAV`, `NAV_ICONS`, and `activeSection` switch |
| Client portal section | `src/lib/portal-cliente-types.ts:4-42` + `src/components/portal/cliente/PortalClienteNav.tsx:12-43` + `src/app/portal/cliente/PortalClienteClient.tsx:130-216` | Add `gamificacion` to `PortalConfig`, `PortalSection`, `ALL_NAV_ITEMS`, and `renderSection()` switch |
| Config page | `src/app/(app)/opai/configuracion/page.tsx:44-187` | Add gamificación item to `CONFIG_SECTIONS` "modulos" group |
| Config sub-pages | New files in `src/app/(app)/opai/configuracion/gamificacion/` | New pages following existing config page patterns |

---

## Task 1: Shared Gamification Types

**Files:**
- Create: `src/components/gamification/types.ts`

**Step 1: Create the shared frontend types file**

```typescript
// src/components/gamification/types.ts

// ── Trust Score & Dimensions ──

export interface DimensionScore {
  dimension: "rondas" | "asistencia" | "sistema_digital" | "supervision" | "capacitacion";
  label: string;
  score: number; // 0-100
  peso: number;  // weight 0-100
  color: string; // tailwind color class
}

export interface GuardiaScorecard {
  guardiaId: string;
  nombre: string;
  trustScore: number;
  nivel: string;
  puntosMes: number;
  rachaActual: number;
  rankingInstalacion: number;
  totalGuardiasInstalacion: number;
  percentil: number;
  tendenciaMesAnterior: number; // previous month score
  dimensiones: DimensionScore[];
}

// ── Badges ──

export interface BadgeData {
  id: string;
  nombre: string;
  descripcion: string;
  categoria: string;
  icono: string;
  puntosBonus: number;
  secreto: boolean;
  ganado: boolean;
  fechaDesbloqueo?: string;
  progreso?: string; // "Faltan 7 días"
}

// ── Points History ──

export interface PointEvent {
  id: string;
  fecha: string;
  tipo: string;
  dimension: string;
  dimensionLabel: string;
  descripcion: string;
  puntos: number;
}

// ── Ranking ──

export interface RankingEntry {
  posicion: number;
  nombre?: string; // only in admin/client views
  anonimo?: string; // "Guardia #3"
  trustScore: number;
  puntosMes: number;
  nivel: string;
  rachaActual: number;
  tendencia: "up" | "down" | "neutral";
  esYo?: boolean;
}

// ── Desafíos ──

export interface DesafioData {
  id: string;
  nombre: string;
  descripcion: string;
  tipo: string;
  fechaInicio: string;
  fechaFin: string;
  recompensaPuntos: number;
  badgeRecompensaId?: string;
  progresoPersonal?: number; // 0-100
  completado?: boolean;
  participantes?: number;
  completados?: number;
}

// ── Beneficios & Canje ──

export interface BeneficioData {
  id: string;
  nombre: string;
  descripcion: string;
  categoria: string;
  costoPuntos: number;
  proveedor: string;
  disponible: boolean;
  imagen?: string;
}

// ── Feed ──

export interface FeedItem {
  id: string;
  tipo: "badge" | "reconocimiento" | "desafio" | "canje";
  texto: string;
  fecha: string;
  icono?: string;
}

// ── Trend ──

export interface TrendPoint {
  mes: string;
  label: string;
  trustScore: number;
}

// ── Constants ──

export const DIMENSION_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  rondas: { label: "Rondas", color: "text-teal-500", bgColor: "bg-teal-500" },
  asistencia: { label: "Asistencia", color: "text-cyan-500", bgColor: "bg-cyan-500" },
  sistema_digital: { label: "Sistema Digital", color: "text-purple-500", bgColor: "bg-purple-500" },
  supervision: { label: "Supervisión", color: "text-yellow-500", bgColor: "bg-yellow-500" },
  capacitacion: { label: "Capacitación", color: "text-orange-500", bgColor: "bg-orange-500" },
  social: { label: "Social", color: "text-pink-500", bgColor: "bg-pink-500" },
  bonus: { label: "Bonus", color: "text-amber-500", bgColor: "bg-amber-500" },
};

export const NIVEL_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  centinela: { label: "Centinela", color: "text-amber-600", bgColor: "bg-amber-500/15" },
  vigia: { label: "Vigía", color: "text-slate-400", bgColor: "bg-slate-500/15" },
  guardian: { label: "Guardián", color: "text-yellow-500", bgColor: "bg-yellow-500/15" },
  protector: { label: "Protector", color: "text-cyan-400", bgColor: "bg-cyan-500/15" },
  comandante: { label: "Comandante", color: "text-teal-400", bgColor: "bg-teal-500/15" },
};

export function getTrustScoreColor(score: number): string {
  if (score >= 85) return "text-teal-500";
  if (score >= 70) return "text-yellow-500";
  if (score >= 50) return "text-orange-500";
  return "text-red-500";
}

export function getTrustScoreStrokeColor(score: number): string {
  if (score >= 85) return "#14b8a6";
  if (score >= 70) return "#eab308";
  if (score >= 50) return "#f97316";
  return "#ef4444";
}

export function getTrustScoreBgColor(score: number): string {
  if (score >= 85) return "bg-teal-500/15";
  if (score >= 70) return "bg-yellow-500/15";
  if (score >= 50) return "bg-orange-500/15";
  return "bg-red-500/15";
}
```

**Step 2: Commit**

```bash
git add src/components/gamification/types.ts
git commit -m "feat(gamificacion): add shared frontend types and constants for gamification UI"
```

---

## Task 2: TrustScoreGauge Component

**Files:**
- Create: `src/components/gamification/TrustScoreGauge.tsx`

**Step 1: Build the SVG circular gauge**

```typescript
// src/components/gamification/TrustScoreGauge.tsx
"use client";

import { getTrustScoreStrokeColor } from "./types";
import { cn } from "@/lib/utils";

interface TrustScoreGaugeProps {
  score: number;
  size?: "sm" | "md" | "lg";
  className?: string;
  showLabel?: boolean;
}

const SIZES = {
  sm: { width: 80, stroke: 6, fontSize: "text-lg", radius: 32 },
  md: { width: 120, stroke: 8, fontSize: "text-3xl", radius: 48 },
  lg: { width: 160, stroke: 10, fontSize: "text-4xl", radius: 64 },
};

export function TrustScoreGauge({ score, size = "md", className, showLabel = true }: TrustScoreGaugeProps) {
  const { width, stroke, fontSize, radius } = SIZES[size];
  const center = width / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, score));
  const dashOffset = circumference - (progress / 100) * circumference;
  const color = getTrustScoreStrokeColor(score);

  return (
    <div className={cn("relative inline-flex flex-col items-center", className)}>
      <svg width={width} height={width} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-muted-foreground/15"
        />
        {/* Progress arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      {/* Score number overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn("font-bold tabular-nums", fontSize)} style={{ color }}>
          {Math.round(score)}
        </span>
      </div>
      {showLabel && (
        <span className="mt-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          Trust Score
        </span>
      )}
    </div>
  );
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/caco/Desktop/Cursor/opai.worktrees/gamificacion && npx tsc --noEmit src/components/gamification/TrustScoreGauge.tsx 2>&1 | head -20`

If tsc doesn't work standalone, just check for import errors and move on.

**Step 3: Commit**

```bash
git add src/components/gamification/TrustScoreGauge.tsx
git commit -m "feat(gamificacion): add TrustScoreGauge SVG circular component"
```

---

## Task 3: NivelBadge, StreakCounter, RankingPosition Components

**Files:**
- Create: `src/components/gamification/NivelBadge.tsx`
- Create: `src/components/gamification/StreakCounter.tsx`
- Create: `src/components/gamification/RankingPosition.tsx`

**Step 1: Create NivelBadge**

```typescript
// src/components/gamification/NivelBadge.tsx
"use client";

import { NIVEL_CONFIG } from "./types";
import { cn } from "@/lib/utils";

interface NivelBadgeProps {
  nivel: string;
  className?: string;
}

export function NivelBadge({ nivel, className }: NivelBadgeProps) {
  const config = NIVEL_CONFIG[nivel.toLowerCase()] ?? { label: nivel, color: "text-muted-foreground", bgColor: "bg-muted" };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border", config.color, config.bgColor, "border-current/20", className)}>
      {config.label}
    </span>
  );
}
```

**Step 2: Create StreakCounter**

```typescript
// src/components/gamification/StreakCounter.tsx
"use client";

import { cn } from "@/lib/utils";
import { Flame } from "lucide-react";

interface StreakCounterProps {
  days: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function StreakCounter({ days, size = "md", className }: StreakCounterProps) {
  const sizes = {
    sm: { icon: "h-3.5 w-3.5", text: "text-xs" },
    md: { icon: "h-4 w-4", text: "text-sm" },
    lg: { icon: "h-5 w-5", text: "text-base" },
  };
  const s = sizes[size];

  if (days <= 0) return null;

  return (
    <span className={cn("inline-flex items-center gap-1 font-semibold tabular-nums", className)}>
      <Flame className={cn(s.icon, "text-orange-500")} />
      <span className={s.text}>{days} días</span>
    </span>
  );
}
```

**Step 3: Create RankingPosition**

```typescript
// src/components/gamification/RankingPosition.tsx
"use client";

import { cn } from "@/lib/utils";
import { Trophy } from "lucide-react";

interface RankingPositionProps {
  posicion: number;
  total: number;
  className?: string;
}

export function RankingPosition({ posicion, total, className }: RankingPositionProps) {
  const percentil = total > 0 ? Math.round(((total - posicion + 1) / total) * 100) : 0;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", className)}>
      <Trophy className="h-4 w-4 text-amber-500" />
      <span className="font-medium">Top {100 - percentil}%</span>
      <span className="text-muted-foreground">— #{posicion} de {total}</span>
    </span>
  );
}
```

**Step 4: Commit**

```bash
git add src/components/gamification/NivelBadge.tsx src/components/gamification/StreakCounter.tsx src/components/gamification/RankingPosition.tsx
git commit -m "feat(gamificacion): add NivelBadge, StreakCounter, RankingPosition components"
```

---

## Task 4: DimensionBreakdown Component

**Files:**
- Create: `src/components/gamification/DimensionBreakdown.tsx`

**Step 1: Build the dimension bars**

```typescript
// src/components/gamification/DimensionBreakdown.tsx
"use client";

import { DIMENSION_CONFIG, type DimensionScore } from "./types";
import { cn } from "@/lib/utils";

interface DimensionBreakdownProps {
  dimensiones: DimensionScore[];
  compact?: boolean;
  className?: string;
}

export function DimensionBreakdown({ dimensiones, compact, className }: DimensionBreakdownProps) {
  return (
    <div className={cn("space-y-3", compact && "space-y-2", className)}>
      {dimensiones.map((dim) => {
        const config = DIMENSION_CONFIG[dim.dimension] ?? { label: dim.dimension, bgColor: "bg-muted-foreground" };
        return (
          <div key={dim.dimension} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">
                {config.label}{" "}
                <span className="text-muted-foreground">({dim.peso}%)</span>
              </span>
              <span className="tabular-nums font-semibold">{Math.round(dim.score)}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-all duration-500", config.bgColor)}
                style={{ width: `${Math.max(0, Math.min(100, dim.score))}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/gamification/DimensionBreakdown.tsx
git commit -m "feat(gamificacion): add DimensionBreakdown progress bars component"
```

---

## Task 5: BadgeGrid and BadgeCard Components

**Files:**
- Create: `src/components/gamification/BadgeCard.tsx`
- Create: `src/components/gamification/BadgeGrid.tsx`

**Step 1: Create BadgeCard**

```typescript
// src/components/gamification/BadgeCard.tsx
"use client";

import { cn } from "@/lib/utils";
import { Lock, Award } from "lucide-react";
import type { BadgeData } from "./types";

interface BadgeCardProps {
  badge: BadgeData;
  compact?: boolean;
  onClick?: () => void;
}

// Map icon names to emoji/lucide icons
const BADGE_ICONS: Record<string, string> = {
  puntualidad: "⏰",
  rondero: "🛡️",
  velocista: "⚡",
  mentor: "🎓",
  estrella: "⭐",
  fuego: "🔥",
  capitan: "🏆",
  guardian: "🛡️",
  detective: "🔍",
  perfeccionista: "💎",
  social: "🤝",
  incansable: "💪",
};

function getBadgeEmoji(icono: string): string {
  const key = Object.keys(BADGE_ICONS).find((k) => icono.toLowerCase().includes(k));
  return key ? BADGE_ICONS[key] : "🏅";
}

export function BadgeCard({ badge, compact, onClick }: BadgeCardProps) {
  const emoji = getBadgeEmoji(badge.icono);

  if (!badge.ganado) {
    return (
      <div className={cn(
        "flex flex-col items-center gap-1 rounded-lg border border-border/50 p-3 opacity-50",
        compact && "p-2",
      )}>
        <div className="relative">
          <span className={cn("text-2xl grayscale", compact && "text-xl")}>{emoji}</span>
          <Lock className="absolute -bottom-0.5 -right-0.5 h-3 w-3 text-muted-foreground" />
        </div>
        <span className={cn("text-[11px] text-muted-foreground text-center line-clamp-2", compact && "text-[10px]")}>
          {badge.nombre}
        </span>
        {badge.progreso && (
          <span className="text-[10px] text-muted-foreground/70">{badge.progreso}</span>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 rounded-lg border border-border bg-card p-3 hover:bg-accent/50 transition-colors",
        compact && "p-2",
      )}
    >
      <span className={cn("text-2xl", compact && "text-xl")}>{emoji}</span>
      <span className={cn("text-[11px] font-medium text-center line-clamp-2", compact && "text-[10px]")}>
        {badge.nombre}
      </span>
      {badge.fechaDesbloqueo && (
        <span className="text-[10px] text-muted-foreground">
          {new Date(badge.fechaDesbloqueo).toLocaleDateString("es-CL", { day: "2-digit", month: "short" })}
        </span>
      )}
    </button>
  );
}
```

**Step 2: Create BadgeGrid**

```typescript
// src/components/gamification/BadgeGrid.tsx
"use client";

import { cn } from "@/lib/utils";
import { BadgeCard } from "./BadgeCard";
import type { BadgeData } from "./types";

interface BadgeGridProps {
  badges: BadgeData[];
  compact?: boolean;
  className?: string;
  onBadgeClick?: (badge: BadgeData) => void;
}

export function BadgeGrid({ badges, compact, className, onBadgeClick }: BadgeGridProps) {
  const ganados = badges.filter((b) => b.ganado);
  const noGanados = badges.filter((b) => !b.ganado && !b.secreto);

  return (
    <div className={cn("space-y-4", className)}>
      {ganados.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Obtenidos ({ganados.length})
          </h4>
          <div className={cn("grid gap-2", compact ? "grid-cols-4" : "grid-cols-3 sm:grid-cols-4 md:grid-cols-5")}>
            {ganados.map((b) => (
              <BadgeCard key={b.id} badge={b} compact={compact} onClick={() => onBadgeClick?.(b)} />
            ))}
          </div>
        </div>
      )}
      {noGanados.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Por desbloquear
          </h4>
          <div className={cn("grid gap-2", compact ? "grid-cols-4" : "grid-cols-3 sm:grid-cols-4 md:grid-cols-5")}>
            {noGanados.map((b) => (
              <BadgeCard key={b.id} badge={b} compact={compact} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/components/gamification/BadgeCard.tsx src/components/gamification/BadgeGrid.tsx
git commit -m "feat(gamificacion): add BadgeCard and BadgeGrid components"
```

---

## Task 6: PointsHistory Component

**Files:**
- Create: `src/components/gamification/PointsHistory.tsx`

**Step 1: Build the points history list**

```typescript
// src/components/gamification/PointsHistory.tsx
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { DIMENSION_CONFIG, type PointEvent } from "./types";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";

interface PointsHistoryProps {
  events: PointEvent[];
  compact?: boolean;
  className?: string;
  pageSize?: number;
  showFilter?: boolean;
}

export function PointsHistory({ events, compact, className, pageSize = 20, showFilter = true }: PointsHistoryProps) {
  const [filterDimension, setFilterDimension] = useState<string>("todas");
  const [visibleCount, setVisibleCount] = useState(pageSize);

  const filtered = filterDimension === "todas"
    ? events
    : events.filter((e) => e.dimension === filterDimension);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  const dimensions = ["todas", ...Object.keys(DIMENSION_CONFIG)];

  return (
    <div className={cn("space-y-3", className)}>
      {showFilter && (
        <div className="flex flex-wrap gap-1.5">
          {dimensions.map((dim) => {
            const isActive = filterDimension === dim;
            const config = dim === "todas" ? null : DIMENSION_CONFIG[dim];
            return (
              <button
                key={dim}
                onClick={() => { setFilterDimension(dim); setVisibleCount(pageSize); }}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors border",
                  isActive
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-transparent text-muted-foreground border-border hover:border-foreground/30",
                )}
              >
                {config?.label ?? "Todas"}
              </button>
            );
          })}
        </div>
      )}

      <div className="divide-y divide-border">
        {visible.map((event) => {
          const dimConfig = DIMENSION_CONFIG[event.dimension];
          return (
            <div key={event.id} className={cn("flex items-center gap-3 py-2.5", compact && "py-2")}>
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm truncate", compact && "text-xs")}>{event.descripcion}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(event.fecha).toLocaleDateString("es-CL", { day: "2-digit", month: "short" })}
                  </span>
                  {dimConfig && (
                    <span className={cn("inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-medium", dimConfig.bgColor, "text-white/90")}>
                      {dimConfig.label}
                    </span>
                  )}
                </div>
              </div>
              <span className={cn(
                "shrink-0 text-sm font-semibold tabular-nums",
                event.puntos > 0 ? "text-emerald-500" : "text-red-500",
              )}>
                {event.puntos > 0 ? "+" : ""}{event.puntos}
              </span>
            </div>
          );
        })}
      </div>

      {visible.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">Sin eventos registrados</p>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setVisibleCount((v) => v + pageSize)}
            className="text-xs"
          >
            Ver más <ChevronDown className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/gamification/PointsHistory.tsx
git commit -m "feat(gamificacion): add PointsHistory list with dimension filter"
```

---

## Task 7: TrendChart Component

**Files:**
- Create: `src/components/gamification/TrendChart.tsx`

**Step 1: Build the recharts line chart**

Reference the chart patterns in `src/components/crm/CrmDashboardCharts.tsx` — use `ResponsiveContainer`, custom tooltip with `bg-popover/95 backdrop-blur-sm`, axis styling with `rgba(255,255,255,0.3)` fill and `fontSize: 11`.

```typescript
// src/components/gamification/TrendChart.tsx
"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import type { TrendPoint } from "./types";
import { cn } from "@/lib/utils";

interface TrendChartProps {
  data: TrendPoint[];
  height?: number;
  className?: string;
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-popover/95 px-3 py-2 shadow-xl backdrop-blur-sm">
      <p className="mb-1 text-xs font-medium text-foreground">{label}</p>
      <div className="flex items-center gap-2 text-xs">
        <span className="h-2 w-2 rounded-full bg-teal-500" />
        <span className="text-muted-foreground">Trust Score</span>
        <span className="ml-auto font-medium tabular-nums text-foreground">{payload[0].value}</span>
      </div>
    </div>
  );
}

export function TrendChart({ data, height = 220, className }: TrendChartProps) {
  if (!data.length) {
    return (
      <div className={cn("flex items-center justify-center text-sm text-muted-foreground", className)} style={{ height }}>
        Sin datos de tendencia
      </div>
    );
  }

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "rgba(255,255,255,0.3)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: "rgba(255,255,255,0.3)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<ChartTooltip />} />
          <ReferenceLine y={70} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
          <Line
            type="monotone"
            dataKey="trustScore"
            stroke="#14b8a6"
            strokeWidth={2.5}
            dot={{ r: 4, fill: "#14b8a6", strokeWidth: 0 }}
            activeDot={{ r: 6, fill: "#14b8a6", strokeWidth: 2, stroke: "#fff" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/gamification/TrendChart.tsx
git commit -m "feat(gamificacion): add TrendChart line chart component with recharts"
```

---

## Task 8: Barrel Export

**Files:**
- Create: `src/components/gamification/index.ts`

**Step 1: Create barrel export**

```typescript
// src/components/gamification/index.ts
export { TrustScoreGauge } from "./TrustScoreGauge";
export { NivelBadge } from "./NivelBadge";
export { StreakCounter } from "./StreakCounter";
export { RankingPosition } from "./RankingPosition";
export { DimensionBreakdown } from "./DimensionBreakdown";
export { BadgeCard } from "./BadgeCard";
export { BadgeGrid } from "./BadgeGrid";
export { PointsHistory } from "./PointsHistory";
export { TrendChart } from "./TrendChart";
export * from "./types";
```

**Step 2: Commit**

```bash
git add src/components/gamification/index.ts
git commit -m "feat(gamificacion): add barrel export for gamification components"
```

---

## Task 9: GuardiaDesempenoTab — Ficha de Guardia

**Files:**
- Create: `src/components/gamification/GuardiaDesempenoTab.tsx`
- Modify: `src/components/ops/GuardiaDetailClient.tsx` (lines 215-224 for TabKey/TABS, plus renderTabContent switch)

**Step 1: Create the full tab component**

This component fetches data from the admin API and renders all gamification sections for a specific guardia. It receives the `guardiaId` as a prop.

```typescript
// src/components/gamification/GuardiaDesempenoTab.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrustScoreGauge } from "./TrustScoreGauge";
import { NivelBadge } from "./NivelBadge";
import { StreakCounter } from "./StreakCounter";
import { RankingPosition } from "./RankingPosition";
import { DimensionBreakdown } from "./DimensionBreakdown";
import { BadgeGrid } from "./BadgeGrid";
import { PointsHistory } from "./PointsHistory";
import { TrendChart } from "./TrendChart";
import { LoadingState } from "@/components/opai/LoadingState";
import { EmptyState } from "@/components/opai/EmptyState";
import { TrendingUp, TrendingDown, Minus, Award, BarChart3, History, Medal } from "lucide-react";
import type { GuardiaScorecard, BadgeData, PointEvent, TrendPoint } from "./types";

interface GuardiaDesempenoTabProps {
  guardiaId: string;
}

export function GuardiaDesempenoTab({ guardiaId }: GuardiaDesempenoTabProps) {
  const [loading, setLoading] = useState(true);
  const [scorecard, setScorecard] = useState<GuardiaScorecard | null>(null);
  const [badges, setBadges] = useState<BadgeData[]>([]);
  const [historial, setHistorial] = useState<PointEvent[]>([]);
  const [tendencia, setTendencia] = useState<TrendPoint[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [scRes, bgRes, hiRes, trRes] = await Promise.all([
        fetch(`/api/gamification/guardia/${guardiaId}`),
        fetch(`/api/gamification/guardia/${guardiaId}/badges`),
        fetch(`/api/gamification/guardia/${guardiaId}/historial`),
        fetch(`/api/gamification/guardia/${guardiaId}/tendencia`),
      ]);
      const [scJ, bgJ, hiJ, trJ] = await Promise.all([
        scRes.json(),
        bgRes.json(),
        hiRes.json(),
        trRes.json(),
      ]);
      if (scJ.success) setScorecard(scJ.data);
      if (bgJ.success) setBadges(bgJ.data ?? []);
      if (hiJ.success) setHistorial(hiJ.data ?? []);
      if (trJ.success) setTendencia(trJ.data ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [guardiaId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) return <LoadingState type="skeleton" rows={4} />;
  if (!scorecard) return <EmptyState title="Sin datos de gamificación" description="No hay datos de desempeño para este guardia aún" compact />;

  const diff = scorecard.trustScore - scorecard.tendenciaMesAnterior;
  const TrendIcon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  const trendColor = diff > 0 ? "text-emerald-500" : diff < 0 ? "text-red-500" : "text-muted-foreground";

  return (
    <div className="space-y-4">
      {/* Trust Score Header */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <TrustScoreGauge score={scorecard.trustScore} size="lg" />
            <div className="flex-1 space-y-2 text-center sm:text-left">
              <div className="flex items-center gap-2 justify-center sm:justify-start">
                <NivelBadge nivel={scorecard.nivel} />
                <span className="text-sm text-muted-foreground">{scorecard.puntosMes} pts este mes</span>
              </div>
              <StreakCounter days={scorecard.rachaActual} size="md" />
              <RankingPosition
                posicion={scorecard.rankingInstalacion}
                total={scorecard.totalGuardiasInstalacion}
              />
              <div className={`flex items-center gap-1 text-sm ${trendColor} justify-center sm:justify-start`}>
                <TrendIcon className="h-4 w-4" />
                <span className="font-medium">{diff > 0 ? "+" : ""}{diff.toFixed(1)} vs mes anterior</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dimension Breakdown */}
      <Card>
        <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            Desglose por Dimensión
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2 sm:p-5 sm:pt-2">
          <DimensionBreakdown dimensiones={scorecard.dimensiones} />
        </CardContent>
      </Card>

      {/* Badges */}
      {badges.length > 0 && (
        <Card>
          <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Award className="h-4 w-4 text-muted-foreground" />
              Badges
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2 sm:p-5 sm:pt-2">
            <BadgeGrid badges={badges} />
          </CardContent>
        </Card>
      )}

      {/* Trend Chart */}
      {tendencia.length > 1 && (
        <Card>
          <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Medal className="h-4 w-4 text-muted-foreground" />
              Tendencia
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2 sm:p-5 sm:pt-2">
            <TrendChart data={tendencia} height={200} />
          </CardContent>
        </Card>
      )}

      {/* Points History */}
      <Card>
        <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            Historial de Puntos
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2 sm:p-5 sm:pt-2">
          <PointsHistory events={historial} />
        </CardContent>
      </Card>
    </div>
  );
}
```

**Step 2: Integrate into GuardiaDetailClient**

In `src/components/ops/GuardiaDetailClient.tsx`:

1. Add import at top:
```typescript
import { GuardiaDesempenoTab } from "@/components/gamification/GuardiaDesempenoTab";
import { TrendingUp } from "lucide-react"; // if not already imported
```

2. Update TabKey type (line 215):
```typescript
type TabKey = "perfil" | "operaciones" | "contractual" | "eventos_laborales" | "documentos" | "actividad" | "desempeno";
```

3. Add to TABS array (after line 223):
```typescript
  { key: "desempeno", label: "Desempeño", icon: TrendingUp },
```

4. Add case in `renderTabContent()` switch (find the switch statement, add before `default`):
```typescript
      case "desempeno":
        return <GuardiaDesempenoTab guardiaId={guardia.id} />;
```

**Step 3: Commit**

```bash
git add src/components/gamification/GuardiaDesempenoTab.tsx src/components/ops/GuardiaDetailClient.tsx
git commit -m "feat(gamificacion): add Desempeño tab to guardia detail page"
```

---

## Task 10: Guard Portal — Add "Desempeño" Section to Bottom Nav

**Files:**
- Modify: `src/lib/guard-portal.ts` (lines 85-130)
- Modify: `src/components/portal/GuardPortalClient.tsx` (lines 64-214)

**Step 1: Update guard-portal.ts types and constants**

In `src/lib/guard-portal.ts`:

1. Add `"desempeno"` to `PortalSection` type (line 85-98):
```typescript
export type PortalSection =
  | "inicio"
  | "solicitudes"
  | "pauta"
  | "asistencia"
  | "marcaciones"
  | "turnos-extra"
  | "documentos"
  | "perfil"
  | "protocolo"
  | "examenes"
  | "resultados"
  | "chat"
  | "control-acceso"
  | "desempeno";
```

2. Add to `PORTAL_NAV_ITEMS` (line 107-121, before the closing bracket):
```typescript
  { key: "desempeno", label: "Desempeño", icon: "TrendingUp", description: "Mi puntaje, badges y ranking" },
```

3. Add `"desempeno"` to `PORTAL_BOTTOM_NAV` (line 124-130). Replace the array to include desempeno:
```typescript
export const PORTAL_BOTTOM_NAV: PortalSection[] = [
  "inicio",
  "desempeno",
  "solicitudes",
  "chat",
  "perfil",
];
```

**Step 2: Update GuardPortalClient.tsx**

In `src/components/portal/GuardPortalClient.tsx`:

1. Add `TrendingUp` to lucide imports (line 6-31).

2. Add to `NAV_ICONS` (line 64-71):
```typescript
  TrendingUp: <TrendingUp className="h-5 w-5" />,
```

3. Add conditional render in the activeSection block (around line 151-191). Add before `{activeSection === "control-acceso"`:
```typescript
        {activeSection === "desempeno" && (
          <GuardDesempenoSection session={session} />
        )}
```

4. Import `GuardDesempenoSection` at the top (we'll create it in Task 11).

**Step 3: Commit**

```bash
git add src/lib/guard-portal.ts src/components/portal/GuardPortalClient.tsx
git commit -m "feat(gamificacion): add Desempeño section to guard portal bottom nav"
```

---

## Task 11: GuardDesempenoSection — Portal Guardia Mobile UI

**Files:**
- Create: `src/components/portal/GuardDesempenoSection.tsx`

This is the main mobile-first gamification section for the guard portal. It uses ChipTabs internally for sub-navigation: Scorecard, Ranking, Badges, Desafíos, Reconocimiento, Beneficios.

**Step 1: Create the section component**

This is a large component. Build it with internal sub-tabs using the existing `ChipTabs` component. Each sub-tab fetches its own data.

```typescript
// src/components/portal/GuardDesempenoSection.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import type { GuardSession } from "@/lib/guard-portal";
import { ChipTabs } from "@/components/ui/chip-tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TrustScoreGauge,
  NivelBadge,
  StreakCounter,
  RankingPosition,
  DimensionBreakdown,
  BadgeGrid,
  PointsHistory,
  TrendChart,
  DIMENSION_CONFIG,
  NIVEL_CONFIG,
  getTrustScoreColor,
  type GuardiaScorecard,
  type BadgeData,
  type PointEvent,
  type TrendPoint,
  type RankingEntry,
  type DesafioData,
  type BeneficioData,
  type FeedItem,
} from "@/components/gamification";
import { LoadingState } from "@/components/opai/LoadingState";
import { EmptyState } from "@/components/opai/EmptyState";
import {
  Trophy, Award, Target, Heart, Gift, BarChart3,
  TrendingUp, TrendingDown, Minus, Send, ChevronRight,
  CheckCircle2, Clock, Users,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  session: GuardSession;
}

type SubTab = "scorecard" | "ranking" | "badges" | "desafios" | "reconocimiento" | "beneficios";

const SUB_TABS = [
  { id: "scorecard" as SubTab, label: "Mi Score", icon: BarChart3 },
  { id: "ranking" as SubTab, label: "Ranking", icon: Trophy },
  { id: "badges" as SubTab, label: "Badges", icon: Award },
  { id: "desafios" as SubTab, label: "Desafíos", icon: Target },
  { id: "reconocimiento" as SubTab, label: "Social", icon: Heart },
  { id: "beneficios" as SubTab, label: "Beneficios", icon: Gift },
];

export function GuardDesempenoSection({ session }: Props) {
  const [activeTab, setActiveTab] = useState<SubTab>("scorecard");

  return (
    <div className="px-4 py-4 pb-24 space-y-4">
      <ChipTabs
        tabs={SUB_TABS}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as SubTab)}
        centered={false}
        compact
      />

      {activeTab === "scorecard" && <ScorecardView session={session} />}
      {activeTab === "ranking" && <RankingView session={session} />}
      {activeTab === "badges" && <BadgesView session={session} />}
      {activeTab === "desafios" && <DesafiosView session={session} />}
      {activeTab === "reconocimiento" && <ReconocimientoView session={session} />}
      {activeTab === "beneficios" && <BeneficiosView session={session} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  SCORECARD VIEW
// ═══════════════════════════════════════════════════════════════

function ScorecardView({ session }: { session: GuardSession }) {
  const [loading, setLoading] = useState(true);
  const [scorecard, setScorecard] = useState<GuardiaScorecard | null>(null);
  const [historial, setHistorial] = useState<PointEvent[]>([]);
  const [tendencia, setTendencia] = useState<TrendPoint[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [scRes, hiRes, trRes] = await Promise.all([
        fetch("/api/portal/guardia/gamification/scorecard"),
        fetch("/api/portal/guardia/gamification/historial?limit=10"),
        fetch("/api/portal/guardia/gamification/tendencia"),
      ]);
      const [scJ, hiJ, trJ] = await Promise.all([scRes.json(), hiRes.json(), trRes.json()]);
      if (scJ.success) setScorecard(scJ.data);
      if (hiJ.success) setHistorial(hiJ.data ?? []);
      if (trJ.success) setTendencia(trJ.data ?? []);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  if (loading) return <LoadingState type="skeleton" rows={4} />;
  if (!scorecard) return <EmptyState title="Sin datos de desempeño" compact />;

  const diff = scorecard.trustScore - scorecard.tendenciaMesAnterior;
  const TrendIcon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  const trendColor = diff > 0 ? "text-emerald-500" : diff < 0 ? "text-red-500" : "text-muted-foreground";

  // Determine next level
  const niveles = Object.entries(NIVEL_CONFIG);
  const currentIdx = niveles.findIndex(([k]) => k === scorecard.nivel.toLowerCase());
  const nextNivel = currentIdx < niveles.length - 1 ? niveles[currentIdx + 1] : null;

  return (
    <div className="space-y-3">
      {/* Hero Card */}
      <Card>
        <CardContent className="p-4 flex flex-col items-center gap-3">
          <TrustScoreGauge score={scorecard.trustScore} size="lg" />
          <NivelBadge nivel={scorecard.nivel} />
          {nextNivel && (
            <div className="w-full space-y-1">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>{scorecard.nivel}</span>
                <span>{nextNivel[1].label}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted">
                <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${Math.min(100, (scorecard.puntosMes / 3500) * 100)}%` }} />
              </div>
              <p className="text-[11px] text-muted-foreground text-center">
                {scorecard.puntosMes.toLocaleString()} pts
              </p>
            </div>
          )}
          <StreakCounter days={scorecard.rachaActual} size="lg" />
        </CardContent>
      </Card>

      {/* KPI Grid 2x2 */}
      <div className="grid grid-cols-2 gap-2">
        <MiniKpi label="Puntos del mes" value={scorecard.puntosMes.toLocaleString()} />
        <MiniKpi label="Ranking" value={`#${scorecard.rankingInstalacion} de ${scorecard.totalGuardiasInstalacion}`} />
        <MiniKpi label="Badges" value={`${scorecard.dimensiones.length}`} />
        <MiniKpi
          label="Tendencia"
          value={`${diff > 0 ? "+" : ""}${diff.toFixed(1)}`}
          valueClassName={trendColor}
        />
      </div>

      {/* Dimension Breakdown */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Desglose</h3>
          <DimensionBreakdown dimensiones={scorecard.dimensiones} compact />
        </CardContent>
      </Card>

      {/* Trend */}
      {tendencia.length > 1 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Tendencia</h3>
            <TrendChart data={tendencia} height={180} />
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      {historial.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Actividad reciente</h3>
            <PointsHistory events={historial} compact showFilter={false} pageSize={10} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MiniKpi({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <Card>
      <CardContent className="p-3 text-center">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className={`text-lg font-bold tabular-nums mt-0.5 ${valueClassName ?? ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
//  RANKING VIEW
// ═══════════════════════════════════════════════════════════════

function RankingView({ session }: { session: GuardSession }) {
  const [loading, setLoading] = useState(true);
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [miPosicion, setMiPosicion] = useState<RankingEntry | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/portal/guardia/gamification/ranking");
        const j = await res.json();
        if (j.success) {
          setRanking(j.data?.ranking ?? []);
          setMiPosicion(j.data?.miPosicion ?? null);
        }
      } catch { /* silent */ } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingState type="skeleton" rows={5} />;

  return (
    <div className="space-y-3">
      {miPosicion && (
        <Card className="border-teal-500/30">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Tu posición</p>
            <p className="text-3xl font-bold text-teal-500 mt-1">#{miPosicion.posicion}</p>
            <p className="text-sm text-muted-foreground mt-1">Top {100 - (miPosicion.posicion * 100 / (ranking.length || 1))}%</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Ranking</h3>
          <div className="divide-y divide-border">
            {ranking.map((entry) => (
              <div key={entry.posicion} className={`flex items-center gap-3 py-2.5 ${entry.esYo ? "bg-teal-500/5 -mx-4 px-4 rounded-lg" : ""}`}>
                <span className="w-8 text-center text-sm font-bold tabular-nums text-muted-foreground">
                  #{entry.posicion}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${entry.esYo ? "text-teal-500" : ""}`}>
                    {entry.esYo ? "Tú" : entry.anonimo ?? `Guardia #${entry.posicion}`}
                  </p>
                  <p className="text-xs text-muted-foreground">{entry.puntosMes} pts</p>
                </div>
                <span className="text-sm font-semibold tabular-nums">{entry.trustScore}</span>
                {entry.tendencia === "up" && <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
                {entry.tendencia === "down" && <TrendingDown className="h-3.5 w-3.5 text-red-500" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  BADGES VIEW
// ═══════════════════════════════════════════════════════════════

function BadgesView({ session }: { session: GuardSession }) {
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState<BadgeData[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/portal/guardia/gamification/badges");
        const j = await res.json();
        if (j.success) setBadges(j.data ?? []);
      } catch { /* silent */ } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingState type="skeleton" rows={3} />;

  return (
    <div className="space-y-3">
      <BadgeGrid badges={badges} compact />
      {badges.length === 0 && <EmptyState title="Sin badges aún" description="Completa actividades para desbloquear badges" compact />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  DESAFIOS VIEW
// ═══════════════════════════════════════════════════════════════

function DesafiosView({ session }: { session: GuardSession }) {
  const [loading, setLoading] = useState(true);
  const [desafios, setDesafios] = useState<DesafioData[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/portal/guardia/gamification/desafios");
        const j = await res.json();
        if (j.success) setDesafios(j.data ?? []);
      } catch { /* silent */ } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingState type="skeleton" rows={3} />;
  if (!desafios.length) return <EmptyState title="Sin desafíos activos" compact />;

  return (
    <div className="space-y-2">
      {desafios.map((d) => (
        <Card key={d.id}>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{d.nombre}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{d.descripcion}</p>
              </div>
              {d.completado && <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Hasta {new Date(d.fechaFin).toLocaleDateString("es-CL", { day: "2-digit", month: "short" })}</span>
              <span>·</span>
              <span>{d.recompensaPuntos} pts</span>
            </div>
            {d.progresoPersonal != null && !d.completado && (
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Progreso</span>
                  <span className="font-medium">{d.progresoPersonal}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted">
                  <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${d.progresoPersonal}%` }} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  RECONOCIMIENTO VIEW
// ═══════════════════════════════════════════════════════════════

function ReconocimientoView({ session }: { session: GuardSession }) {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [companeros, setCompaneros] = useState<Array<{ id: string; nombre: string }>>([]);
  const [selectedCompanero, setSelectedCompanero] = useState("");
  const [categoria, setCategoria] = useState("companerismo");
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/portal/guardia/gamification/feed");
        const j = await res.json();
        if (j.success) {
          setFeed(j.data?.feed ?? []);
          setCompaneros(j.data?.companeros ?? []);
        }
      } catch { /* silent */ } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSend = async () => {
    if (!selectedCompanero) return;
    setSending(true);
    try {
      const res = await fetch("/api/portal/guardia/gamification/reconocimiento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guardiaDestinoId: selectedCompanero, categoria, mensaje }),
      });
      const j = await res.json();
      if (j.success) {
        toast.success("Reconocimiento enviado");
        setShowForm(false);
        setSelectedCompanero("");
        setMensaje("");
      } else {
        toast.error(j.error ?? "Error al enviar");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSending(false);
    }
  };

  const CATEGORIAS = [
    { value: "companerismo", label: "Compañerismo" },
    { value: "puntualidad", label: "Puntualidad" },
    { value: "profesionalismo", label: "Profesionalismo" },
    { value: "liderazgo", label: "Liderazgo" },
    { value: "iniciativa", label: "Iniciativa" },
  ];

  if (loading) return <LoadingState type="skeleton" rows={3} />;

  return (
    <div className="space-y-3">
      {/* Send Button */}
      {!showForm ? (
        <Button onClick={() => setShowForm(true)} className="w-full" size="lg">
          <Heart className="h-4 w-4 mr-2" /> Enviar reconocimiento
        </Button>
      ) : (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold">Enviar reconocimiento</h3>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Compañero</label>
              <select
                value={selectedCompanero}
                onChange={(e) => setSelectedCompanero(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">Seleccionar...</option>
                {companeros.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Categoría</label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIAS.map((cat) => (
                  <button
                    key={cat.value}
                    onClick={() => setCategoria(cat.value)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                      categoria === cat.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-transparent text-muted-foreground border-border"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Mensaje (opcional)</label>
              <textarea
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none"
                rows={2}
                placeholder="Un mensaje breve..."
              />
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)} className="flex-1">
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSend} disabled={!selectedCompanero || sending} className="flex-1">
                <Send className="h-3.5 w-3.5 mr-1.5" /> Enviar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Feed */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Feed</h3>
          {feed.length === 0 ? (
            <EmptyState title="Sin actividad social" inline />
          ) : (
            <div className="divide-y divide-border">
              {feed.map((item) => (
                <div key={item.id} className="py-2.5">
                  <p className="text-sm">{item.texto}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {new Date(item.fecha).toLocaleDateString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  BENEFICIOS VIEW
// ═══════════════════════════════════════════════════════════════

function BeneficiosView({ session }: { session: GuardSession }) {
  const [loading, setLoading] = useState(true);
  const [beneficios, setBeneficios] = useState<BeneficioData[]>([]);
  const [puntosDisponibles, setPuntosDisponibles] = useState(0);
  const [canjeando, setCanjeando] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/portal/guardia/gamification/beneficios");
        const j = await res.json();
        if (j.success) {
          setBeneficios(j.data?.beneficios ?? []);
          setPuntosDisponibles(j.data?.puntosDisponibles ?? 0);
        }
      } catch { /* silent */ } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleCanjear = async (beneficioId: string) => {
    setCanjeando(beneficioId);
    try {
      const res = await fetch("/api/portal/guardia/gamification/canjear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beneficioId }),
      });
      const j = await res.json();
      if (j.success) {
        toast.success("Canje realizado exitosamente");
        setPuntosDisponibles((prev) => prev - (beneficios.find((b) => b.id === beneficioId)?.costoPuntos ?? 0));
      } else {
        toast.error(j.error ?? "Error al canjear");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setCanjeando(null);
    }
  };

  if (loading) return <LoadingState type="skeleton" rows={3} />;

  return (
    <div className="space-y-3">
      <Card className="border-teal-500/30">
        <CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Puntos disponibles</p>
          <p className="text-2xl font-bold text-teal-500 tabular-nums mt-1">{puntosDisponibles.toLocaleString()}</p>
        </CardContent>
      </Card>

      {beneficios.length === 0 ? (
        <EmptyState title="Sin beneficios disponibles" compact />
      ) : (
        beneficios.map((b) => (
          <Card key={b.id}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{b.nombre}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{b.descripcion}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="secondary" className="text-[11px]">{b.categoria}</Badge>
                    <span className="text-xs text-muted-foreground">{b.proveedor}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold tabular-nums">{b.costoPuntos.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">pts</p>
                  <Button
                    size="sm"
                    variant={puntosDisponibles >= b.costoPuntos ? "default" : "ghost"}
                    disabled={puntosDisponibles < b.costoPuntos || canjeando === b.id}
                    onClick={() => handleCanjear(b.id)}
                    className="mt-2 text-xs h-7"
                  >
                    {canjeando === b.id ? "..." : "Canjear"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/portal/GuardDesempenoSection.tsx
git commit -m "feat(gamificacion): add full mobile-first Desempeño section for guard portal"
```

---

## Task 12: Portal Cliente — Gamificación Section

**Files:**
- Create: `src/components/portal/cliente/PortalDesempeno.tsx`
- Modify: `src/lib/portal-cliente-types.ts` — add `gamificacion` to `PortalConfig`
- Modify: `src/components/portal/cliente/PortalClienteNav.tsx` — add nav item
- Modify: `src/app/portal/cliente/PortalClienteClient.tsx` — add to `renderSection()` switch

**Step 1: Create PortalDesempeno component**

```typescript
// src/components/portal/cliente/PortalDesempeno.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/opai/KpiCard";
import { KpiGrid } from "@/components/opai/KpiGrid";
import { TrustScoreGauge, NivelBadge, getTrustScoreColor } from "@/components/gamification";
import { LoadingState } from "@/components/opai/LoadingState";
import { EmptyState } from "@/components/opai/EmptyState";
import { TrendingUp, TrendingDown, Minus, Users, Shield, Calendar, CheckCircle2 } from "lucide-react";
import type { ClienteSession } from "@/lib/portal-cliente-types";

interface Props {
  session: ClienteSession;
  selectedInstallation: string | null;
}

interface InstalacionGamificacion {
  trustScorePromedio: number;
  tendencia: number;
  promedioGard: number;
  guardias: Array<{
    id: string;
    nombre: string;
    trustScore: number;
    nivel: string;
    tendencia: "up" | "down" | "neutral";
    asistenciaMes: number;
  }>;
  kpis: {
    guardiasActivos: number;
    asistenciaMes: number;
    rondasCompletadas: number;
    diasSinIncidentes: number;
  };
}

export function PortalDesempeno({ session, selectedInstallation }: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<InstalacionGamificacion | null>(null);

  const fetchData = useCallback(async () => {
    if (!selectedInstallation) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/portal/cliente/gamification/instalacion/${selectedInstallation}?tenantId=${encodeURIComponent(session.tenantId)}`
      );
      const j = await res.json();
      if (j.success) setData(j.data);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [selectedInstallation, session.tenantId]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  if (!selectedInstallation) return <EmptyState title="Selecciona una instalación" compact />;
  if (loading) return <LoadingState type="skeleton" rows={4} />;
  if (!data) return <EmptyState title="Sin datos de desempeño" compact />;

  const diff = data.trustScorePromedio - data.promedioGard;

  return (
    <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-4 pb-24 space-y-4">
      {/* Trust Score Card */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row items-center gap-4">
          <TrustScoreGauge score={data.trustScorePromedio} size="lg" />
          <div className="flex-1 text-center sm:text-left space-y-1">
            <p className="text-sm text-muted-foreground">Trust Score promedio de tu instalación</p>
            <p className="text-sm">
              <span className="font-semibold">{data.trustScorePromedio.toFixed(1)}</span>
              {" vs "}
              <span className="text-muted-foreground">{data.promedioGard.toFixed(1)} promedio Gard</span>
              {" "}
              <span className={diff >= 0 ? "text-emerald-500" : "text-red-500"}>
                ({diff > 0 ? "+" : ""}{diff.toFixed(1)})
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <KpiGrid columns={4}>
        <KpiCard title="Guardias" value={data.kpis.guardiasActivos} variant="teal" icon={<Users className="h-4 w-4" />} />
        <KpiCard title="Asistencia" value={`${data.kpis.asistenciaMes}%`} variant="emerald" icon={<Calendar className="h-4 w-4" />} />
        <KpiCard title="Rondas" value={`${data.kpis.rondasCompletadas}%`} variant="blue" icon={<Shield className="h-4 w-4" />} />
        <KpiCard title="Días sin incidentes" value={data.kpis.diasSinIncidentes} variant="amber" icon={<CheckCircle2 className="h-4 w-4" />} />
      </KpiGrid>

      {/* Guard Ranking Table */}
      <Card>
        <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
          <CardTitle className="text-sm font-semibold">Ranking de Guardias</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2 sm:p-5 sm:pt-2">
          <div className="divide-y divide-border">
            {data.guardias.map((g, i) => {
              const TrendIcon = g.tendencia === "up" ? TrendingUp : g.tendencia === "down" ? TrendingDown : Minus;
              const trendColor = g.tendencia === "up" ? "text-emerald-500" : g.tendencia === "down" ? "text-red-500" : "text-muted-foreground";
              return (
                <div key={g.id} className="flex items-center gap-3 py-2.5">
                  <span className="w-6 text-center text-xs font-bold text-muted-foreground">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{g.nombre}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <NivelBadge nivel={g.nivel} />
                      <span className="text-[11px] text-muted-foreground">Asistencia: {g.asistenciaMes}%</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-2">
                    <span className={`text-sm font-semibold tabular-nums ${getTrustScoreColor(g.trustScore)}`}>
                      {g.trustScore}
                    </span>
                    <TrendIcon className={`h-3.5 w-3.5 ${trendColor}`} />
                  </div>
                </div>
              );
            })}
          </div>
          {data.guardias.length === 0 && <EmptyState title="Sin guardias asignados" inline />}
        </CardContent>
      </Card>
    </div>
  );
}
```

**Step 2: Update portal-cliente-types.ts**

Add `gamificacion: boolean` to `PortalConfig` type and `DEFAULT_PORTAL_CONFIG`:

```typescript
// In PortalConfig type, add:
  gamificacion: boolean

// In DEFAULT_PORTAL_CONFIG, add:
  gamificacion: true,
```

**Step 3: Update PortalClienteNav.tsx**

Add to `PortalSection` type:
```typescript
  | 'desempeno'
```

Add to `ALL_NAV_ITEMS` array (after 'comparativa'):
```typescript
  { id: 'desempeno', label: 'Desempeño', icon: TrendingUp, configKey: 'gamificacion' },
```

Import `TrendingUp` from lucide-react.

**Step 4: Update PortalClienteClient.tsx**

Add to `renderSection()` switch:
```typescript
      case "desempeno":
        return <PortalDesempeno session={session} selectedInstallation={selectedInstallation} />;
```

Import `PortalDesempeno` at the top.

**Step 5: Commit**

```bash
git add src/components/portal/cliente/PortalDesempeno.tsx src/lib/portal-cliente-types.ts src/components/portal/cliente/PortalClienteNav.tsx src/app/portal/cliente/PortalClienteClient.tsx
git commit -m "feat(gamificacion): add Desempeño section to client portal"
```

---

## Task 13: Admin Config — Add Gamificación Section

**Files:**
- Modify: `src/app/(app)/opai/configuracion/page.tsx` — add gamificacion to CONFIG_SECTIONS
- Create: `src/app/(app)/opai/configuracion/gamificacion/page.tsx` — main config page

**Step 1: Add to CONFIG_SECTIONS**

In `src/app/(app)/opai/configuracion/page.tsx`, add to the "modulos" section items array (after the "Finanzas" item, around line 184):

```typescript
      {
        submodule: "gamificacion",
        href: "/opai/configuracion/gamificacion",
        title: "Gamificación",
        description: "Pesos, niveles, puntos, badges y beneficios",
        icon: Trophy,
        adminOnly: true,
      },
```

Import `Trophy` from lucide-react at the top.

**Step 2: Create the gamificacion config page**

```typescript
// src/app/(app)/opai/configuracion/gamificacion/page.tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { resolvePermissions, hasModuleAccess } from "@/lib/permissions";
import { GamificacionConfigClient } from "./GamificacionConfigClient";

export default async function GamificacionConfigPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/opai/configuracion/gamificacion");

  const perms = await resolvePermissions({
    role: session.user.role,
    roleTemplateId: session.user.roleTemplateId,
  });

  if (!hasModuleAccess(perms, "gamificacion")) redirect("/hub");

  return <GamificacionConfigClient />;
}
```

**Step 3: Create GamificacionConfigClient**

```typescript
// src/app/(app)/opai/configuracion/gamificacion/GamificacionConfigClient.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/opai/PageHeader";
import { ChipTabs } from "@/components/ui/chip-tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { LoadingState } from "@/components/opai/LoadingState";
import { KpiCard } from "@/components/opai/KpiCard";
import { KpiGrid } from "@/components/opai/KpiGrid";
import { DataTable } from "@/components/opai/DataTable";
import { EmptyState } from "@/components/opai/EmptyState";
import { BadgeCard } from "@/components/gamification/BadgeCard";
import { DIMENSION_CONFIG, NIVEL_CONFIG } from "@/components/gamification/types";
import {
  Settings, Award, Target, Gift, DollarSign, BarChart3,
  Plus, Pencil, Trash2, Check, X, Save, Users, TrendingUp,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";

type ConfigTab = "general" | "badges" | "desafios" | "fondos" | "beneficios" | "dashboard";

const TABS = [
  { id: "general" as ConfigTab, label: "Configuración", icon: Settings },
  { id: "badges" as ConfigTab, label: "Badges", icon: Award },
  { id: "desafios" as ConfigTab, label: "Desafíos", icon: Target },
  { id: "fondos" as ConfigTab, label: "Fondos", icon: DollarSign },
  { id: "beneficios" as ConfigTab, label: "Beneficios", icon: Gift },
  { id: "dashboard" as ConfigTab, label: "Dashboard", icon: BarChart3 },
];

export function GamificacionConfigClient() {
  const [activeTab, setActiveTab] = useState<ConfigTab>("general");

  return (
    <>
      <PageHeader
        title="Gamificación"
        description="Configuración del módulo de gamificación"
        backHref="/opai/configuracion"
        backLabel="Configuración"
      />
      <div className="space-y-5 min-w-0">
        <ChipTabs
          tabs={TABS}
          activeTab={activeTab}
          onTabChange={(id) => setActiveTab(id as ConfigTab)}
        />

        {activeTab === "general" && <GeneralConfigTab />}
        {activeTab === "badges" && <BadgesManagementTab />}
        {activeTab === "desafios" && <DesafiosManagementTab />}
        {activeTab === "fondos" && <FondosManagementTab />}
        {activeTab === "beneficios" && <BeneficiosManagementTab />}
        {activeTab === "dashboard" && <DashboardTab />}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
//  GENERAL CONFIG TAB
// ═══════════════════════════════════════════════════════════════

function GeneralConfigTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<any>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/gamification/config");
        const j = await res.json();
        if (j.success) setConfig(j.data);
      } catch { /* silent */ } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/gamification/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const j = await res.json();
      if (j.success) toast.success("Configuración guardada");
      else toast.error(j.error ?? "Error al guardar");
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState type="skeleton" rows={6} />;
  if (!config) return <EmptyState title="No se pudo cargar la configuración" />;

  const updateField = (field: string, value: any) => setConfig((prev: any) => ({ ...prev, [field]: value }));

  return (
    <div className="space-y-4">
      {/* Kill Switch */}
      <Card className="border-red-500/20">
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Módulo activo</p>
            <p className="text-xs text-muted-foreground">Activa o desactiva todo el módulo de gamificación</p>
          </div>
          <Switch
            checked={config.enabled ?? true}
            onCheckedChange={(v) => updateField("enabled", v)}
          />
        </CardContent>
      </Card>

      {/* Pesos por dimensión */}
      <Card>
        <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
          <CardTitle className="text-sm font-semibold">Pesos por Dimensión</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2 sm:p-5 sm:pt-2 space-y-3">
          {Object.entries(DIMENSION_CONFIG).filter(([k]) => k !== "social" && k !== "bonus").map(([key, cfg]) => (
            <div key={key} className="flex items-center gap-3">
              <div className={`h-2.5 w-2.5 rounded-full ${cfg.bgColor}`} />
              <Label className="flex-1 text-sm">{cfg.label}</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={config[`peso${key.charAt(0).toUpperCase() + key.slice(1)}`] ?? 20}
                onChange={(e) => updateField(`peso${key.charAt(0).toUpperCase() + key.slice(1)}`, Number(e.target.value))}
                className="w-20 text-center"
              />
              <span className="text-xs text-muted-foreground w-4">%</span>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">Los pesos deben sumar 100%</p>
        </CardContent>
      </Card>

      {/* General Parameters */}
      <Card>
        <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
          <CardTitle className="text-sm font-semibold">Parámetros Generales</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2 sm:p-5 sm:pt-2 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Tasa conversión pts/CLP</Label>
              <Input
                type="number"
                value={config.tasaConversionClp ?? 1}
                onChange={(e) => updateField("tasaConversionClp", Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Máximo puntos diarios</Label>
              <Input
                type="number"
                value={config.maxPuntosDiarios ?? 500}
                onChange={(e) => updateField("maxPuntosDiarios", Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Expiración puntos (meses)</Label>
              <Input
                type="number"
                value={config.expiracionPuntosMeses ?? 12}
                onChange={(e) => updateField("expiracionPuntosMeses", Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Día reset ranking semanal</Label>
              <Input
                type="number"
                min={0}
                max={6}
                value={config.diaResetRanking ?? 1}
                onChange={(e) => updateField("diaResetRanking", Number(e.target.value))}
              />
            </div>
          </div>
          <div className="flex items-center justify-between pt-2">
            <div>
              <p className="text-sm font-medium">Bonos habilitados</p>
              <p className="text-xs text-muted-foreground">Generar sugerencias de bono automáticamente</p>
            </div>
            <Switch
              checked={config.bonosEnabled ?? false}
              onCheckedChange={(v) => updateField("bonosEnabled", v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" /> {saving ? "Guardando..." : "Guardar Cambios"}
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  BADGES MANAGEMENT TAB
// ═══════════════════════════════════════════════════════════════

function BadgesManagementTab() {
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/gamification/badges");
        const j = await res.json();
        if (j.success) setBadges(j.data ?? []);
      } catch { /* silent */ } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingState type="skeleton" rows={5} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Badges ({badges.length})</h3>
        <Button size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" /> Nuevo Badge</Button>
      </div>
      <DataTable
        columns={[
          { key: "icono", label: "Ícono", render: (v: string) => <span className="text-lg">{v}</span> },
          { key: "nombre", label: "Nombre" },
          { key: "categoria", label: "Categoría" },
          { key: "puntosBonus", label: "Puntos", render: (v: number) => <span className="tabular-nums">+{v}</span> },
          { key: "secreto", label: "Secreto", render: (v: boolean) => v ? "Sí" : "No" },
          {
            key: "id",
            label: "",
            render: (_: string, row: any) => (
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7"><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500"><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            ),
          },
        ]}
        data={badges}
        emptyMessage="No hay badges configurados"
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  DESAFIOS MANAGEMENT TAB
// ═══════════════════════════════════════════════════════════════

function DesafiosManagementTab() {
  const [loading, setLoading] = useState(true);
  const [desafios, setDesafios] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/gamification/desafios");
        const j = await res.json();
        if (j.success) setDesafios(j.data ?? []);
      } catch { /* silent */ } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingState type="skeleton" rows={5} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Desafíos ({desafios.length})</h3>
        <Button size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" /> Nuevo Desafío</Button>
      </div>
      <DataTable
        columns={[
          { key: "nombre", label: "Nombre" },
          { key: "tipo", label: "Tipo" },
          { key: "fechaInicio", label: "Inicio", render: (v: string) => v ? new Date(v).toLocaleDateString("es-CL") : "-" },
          { key: "fechaFin", label: "Fin", render: (v: string) => v ? new Date(v).toLocaleDateString("es-CL") : "-" },
          { key: "recompensaPuntos", label: "Puntos", render: (v: number) => <span className="tabular-nums">+{v}</span> },
          {
            key: "id",
            label: "",
            render: () => (
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7"><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500"><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            ),
          },
        ]}
        data={desafios}
        emptyMessage="No hay desafíos configurados"
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  FONDOS MANAGEMENT TAB
// ═══════════════════════════════════════════════════════════════

function FondosManagementTab() {
  const [loading, setLoading] = useState(true);
  const [fondos, setFondos] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/gamification/fondos");
        const j = await res.json();
        if (j.success) setFondos(j.data ?? []);
      } catch { /* silent */ } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingState type="skeleton" rows={5} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Fondos de Premio ({fondos.length})</h3>
        <Button size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" /> Nuevo Fondo</Button>
      </div>
      <DataTable
        columns={[
          { key: "nombre", label: "Nombre" },
          { key: "tipo", label: "Tipo" },
          { key: "montoTotal", label: "Monto", render: (v: number) => `$${(v ?? 0).toLocaleString()}` },
          { key: "fechaInicio", label: "Inicio", render: (v: string) => v ? new Date(v).toLocaleDateString("es-CL") : "-" },
          { key: "fechaFin", label: "Fin", render: (v: string) => v ? new Date(v).toLocaleDateString("es-CL") : "-" },
          {
            key: "id",
            label: "",
            render: () => (
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7"><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500"><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            ),
          },
        ]}
        data={fondos}
        emptyMessage="No hay fondos configurados"
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  BENEFICIOS MANAGEMENT TAB
// ═══════════════════════════════════════════════════════════════

function BeneficiosManagementTab() {
  const [loading, setLoading] = useState(true);
  const [beneficios, setBeneficios] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/gamification/beneficios");
        const j = await res.json();
        if (j.success) setBeneficios(j.data ?? []);
      } catch { /* silent */ } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingState type="skeleton" rows={5} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Beneficios ({beneficios.length})</h3>
        <Button size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" /> Nuevo Beneficio</Button>
      </div>
      <DataTable
        columns={[
          { key: "nombre", label: "Nombre" },
          { key: "categoria", label: "Categoría" },
          { key: "costoPuntos", label: "Costo", render: (v: number) => <span className="tabular-nums">{v} pts</span> },
          { key: "proveedor", label: "Proveedor" },
          { key: "disponible", label: "Activo", render: (v: boolean) => v ? <Check className="h-4 w-4 text-emerald-500" /> : <X className="h-4 w-4 text-red-500" /> },
          {
            key: "id",
            label: "",
            render: () => (
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7"><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500"><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            ),
          },
        ]}
        data={beneficios}
        emptyMessage="No hay beneficios configurados"
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  DASHBOARD TAB
// ═══════════════════════════════════════════════════════════════

function DashboardTab() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [configRes, rankRes] = await Promise.all([
          fetch("/api/gamification/config"),
          fetch("/api/gamification/rankings/global?limit=10"),
        ]);
        const [configJ, rankJ] = await Promise.all([configRes.json(), rankRes.json()]);
        setStats({
          config: configJ.success ? configJ.data : null,
          ranking: rankJ.success ? rankJ.data : [],
        });
      } catch { /* silent */ } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingState type="skeleton" rows={6} />;

  return (
    <div className="space-y-4">
      <KpiGrid columns={4}>
        <KpiCard title="Guardias activos" value={stats?.ranking?.length ?? 0} variant="teal" icon={<Users className="h-4 w-4" />} />
        <KpiCard title="Trust Score prom." value={(stats?.ranking?.reduce((sum: number, r: any) => sum + (r.trustScore ?? 0), 0) / (stats?.ranking?.length || 1)).toFixed(1)} variant="blue" icon={<TrendingUp className="h-4 w-4" />} />
        <KpiCard title="Badges" value="—" variant="purple" icon={<Award className="h-4 w-4" />} />
        <KpiCard title="Puntos otorgados" value="—" variant="amber" icon={<Trophy className="h-4 w-4" />} />
      </KpiGrid>

      {/* Top Guardias */}
      <Card>
        <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
          <CardTitle className="text-sm font-semibold">Top 10 Guardias</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2 sm:p-5 sm:pt-2">
          {stats?.ranking?.length > 0 ? (
            <DataTable
              columns={[
                { key: "posicion", label: "#", className: "w-10" },
                { key: "nombre", label: "Guardia" },
                { key: "trustScore", label: "Trust Score", render: (v: number) => <span className="font-semibold tabular-nums">{v}</span> },
                { key: "nivel", label: "Nivel" },
                { key: "puntosMes", label: "Puntos", render: (v: number) => <span className="tabular-nums">{v?.toLocaleString()}</span> },
              ]}
              data={(stats?.ranking ?? []).map((r: any, i: number) => ({ ...r, posicion: i + 1 }))}
              compact
            />
          ) : (
            <EmptyState title="Sin datos de ranking" compact />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add src/app/(app)/opai/configuracion/page.tsx src/app/(app)/opai/configuracion/gamificacion/page.tsx src/app/(app)/opai/configuracion/gamificacion/GamificacionConfigClient.tsx
git commit -m "feat(gamificacion): add admin gamificación config page with CRUD tabs and dashboard"
```

---

## Task 14: Instalación Desempeño Section

**Files:**
- Create: `src/components/gamification/InstalacionDesempenoSection.tsx`

**Note:** The installation detail page needs to be identified. Based on codebase exploration, there's no standalone installation detail page — installations are shown within CRM accounts or ops. This component can be imported wherever the installation detail lives. It follows the `CollapsibleSection` pattern.

**Step 1: Create the component**

```typescript
// src/components/gamification/InstalacionDesempenoSection.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/opai/KpiCard";
import { KpiGrid } from "@/components/opai/KpiGrid";
import { TrustScoreGauge } from "./TrustScoreGauge";
import { NivelBadge } from "./NivelBadge";
import { StreakCounter } from "./StreakCounter";
import { getTrustScoreColor } from "./types";
import { LoadingState } from "@/components/opai/LoadingState";
import { EmptyState } from "@/components/opai/EmptyState";
import { Users, Calendar, Shield, CheckCircle2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useRouter } from "next/navigation";

interface Props {
  instalacionId: string;
}

export function InstalacionDesempenoSection({ instalacionId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/gamification/instalacion/${instalacionId}`);
        const j = await res.json();
        if (j.success) setData(j.data);
      } catch { /* silent */ } finally {
        setLoading(false);
      }
    })();
  }, [instalacionId]);

  if (loading) return <LoadingState type="skeleton" rows={4} />;
  if (!data) return <EmptyState title="Sin datos de gamificación" compact />;

  return (
    <div className="space-y-4">
      {/* Trust Score + KPIs */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Card className="sm:w-48 shrink-0">
          <CardContent className="p-4 flex flex-col items-center">
            <TrustScoreGauge score={data.trustScorePromedio ?? 0} size="md" />
            <p className="text-xs text-muted-foreground mt-2">
              vs {(data.promedioGard ?? 0).toFixed(1)} promedio
            </p>
          </CardContent>
        </Card>
        <div className="flex-1">
          <KpiGrid columns={2}>
            <KpiCard title="Guardias" value={data.kpis?.guardiasActivos ?? 0} variant="teal" size="sm" icon={<Users className="h-4 w-4" />} />
            <KpiCard title="Asistencia" value={`${data.kpis?.asistenciaMes ?? 0}%`} variant="emerald" size="sm" icon={<Calendar className="h-4 w-4" />} />
            <KpiCard title="Rondas" value={`${data.kpis?.rondasCompletadas ?? 0}%`} variant="blue" size="sm" icon={<Shield className="h-4 w-4" />} />
            <KpiCard title="Badges este mes" value={data.kpis?.badgesMes ?? 0} variant="purple" size="sm" icon={<CheckCircle2 className="h-4 w-4" />} />
          </KpiGrid>
        </div>
      </div>

      {/* Ranking Table */}
      <Card>
        <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
          <CardTitle className="text-sm font-semibold">Ranking de Guardias</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2 sm:p-5 sm:pt-2">
          <div className="divide-y divide-border">
            {(data.guardias ?? []).map((g: any, i: number) => {
              const TrendIcon = g.tendencia === "up" ? TrendingUp : g.tendencia === "down" ? TrendingDown : Minus;
              const trendColor = g.tendencia === "up" ? "text-emerald-500" : g.tendencia === "down" ? "text-red-500" : "text-muted-foreground";
              return (
                <button
                  key={g.id}
                  onClick={() => router.push(`/personas/guardias/${g.id}?tab=desempeno`)}
                  className="flex items-center gap-3 py-2.5 w-full text-left hover:bg-muted/30 -mx-2 px-2 rounded-md transition-colors"
                >
                  <span className="w-6 text-center text-xs font-bold text-muted-foreground">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{g.nombre}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <NivelBadge nivel={g.nivel} />
                      <StreakCounter days={g.rachaActual ?? 0} size="sm" />
                    </div>
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-2">
                    <div>
                      <span className={`text-sm font-semibold tabular-nums ${getTrustScoreColor(g.trustScore)}`}>
                        {g.trustScore}
                      </span>
                      <p className="text-[10px] text-muted-foreground">{g.puntosMes} pts</p>
                    </div>
                    <TrendIcon className={`h-3.5 w-3.5 ${trendColor}`} />
                  </div>
                </button>
              );
            })}
          </div>
          {(!data.guardias || data.guardias.length === 0) && (
            <EmptyState title="Sin guardias asignados" inline />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

**Step 2: Add to barrel export**

In `src/components/gamification/index.ts`, add:
```typescript
export { InstalacionDesempenoSection } from "./InstalacionDesempenoSection";
```

**Step 3: Commit**

```bash
git add src/components/gamification/InstalacionDesempenoSection.tsx src/components/gamification/index.ts
git commit -m "feat(gamificacion): add InstalacionDesempenoSection component"
```

---

## Task 15: TypeScript Compilation Check

**Step 1: Run tsc across the project**

```bash
cd /Users/caco/Desktop/Cursor/opai.worktrees/gamificacion && npx tsc --noEmit 2>&1 | head -50
```

**Step 2: Fix any TypeScript errors found**

Common issues to watch for:
- Missing imports (lucide icons, component props)
- Type mismatches between API response shapes and component props
- Missing properties on existing types (PortalSection, TabKey, etc.)

Fix all errors before proceeding.

**Step 3: Run the dev server and verify no build errors**

```bash
cd /Users/caco/Desktop/Cursor/opai.worktrees/gamificacion && npm run build 2>&1 | tail -30
```

If build errors, fix them.

**Step 4: Commit fixes**

```bash
git add -A
git commit -m "fix(gamificacion): fix TypeScript compilation errors in gamification UI"
```

---

## Task 16: Final Verification

**Step 1: Verify all integration points are connected**

Check each file was modified correctly:
1. `GuardiaDetailClient.tsx` — has `desempeno` tab
2. `guard-portal.ts` — has `desempeno` in PortalSection and PORTAL_BOTTOM_NAV
3. `GuardPortalClient.tsx` — has desempeno in NAV_ICONS and section render
4. `portal-cliente-types.ts` — has `gamificacion` in PortalConfig
5. `PortalClienteNav.tsx` — has `desempeno` nav item
6. `PortalClienteClient.tsx` — has desempeno in renderSection
7. `configuracion/page.tsx` — has gamificacion config link
8. `configuracion/gamificacion/page.tsx` — exists and renders

**Step 2: List all new files created**

```bash
cd /Users/caco/Desktop/Cursor/opai.worktrees/gamificacion && git diff --name-only main...HEAD --diff-filter=A | grep -i gamif
```

**Step 3: Final commit if needed**

```bash
git status
```
