# Bloque 3 — Polish + Historial + Scorecard — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 4 polish improvements: checkpoint marking feedback, rondas historial tab in CRM, guard scorecard in profile, reduce polling to 10s.

**Architecture:** Thin modifications to existing components (CheckpointMarker, PortalPerfil, RondasMonitoreoClient), one new CRM tab component, one new API endpoint for guard stats.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS, Prisma, Web Audio API, lucide-react.

---

### Task 1: Checkpoint Marking Feedback

**Files:**
- Modify: `src/components/portal/rondas/CheckpointMarker.tsx:457-461`

**Context:**
Currently at lines 457-461, after API success, there's only `navigator.vibrate?.(200)` and then `onComplete(result)`. We need to add success sound, improved vibration pattern, and a visual flash before calling `onComplete`.

**Step 1: Add `playSuccessSound` function and `showSuccessFlash` state**

At the top of the component (inside the function body), add the state:

```typescript
const [showSuccessFlash, setShowSuccessFlash] = useState(false);
```

Add this helper function inside the component (before the `handleSubmit` callback):

```typescript
function playSuccessSound() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch { /* Web Audio not available */ }
}
```

**Step 2: Replace the success handler (lines 457-461)**

Replace:
```typescript
      // 6. Haptic feedback
      navigator.vibrate?.(200);

      // 7. Callback
      onComplete(result);
```

With:
```typescript
      // 6. Success feedback: vibration + sound + flash
      navigator.vibrate?.([100, 50, 100]);
      playSuccessSound();
      setShowSuccessFlash(true);
      setTimeout(() => {
        setShowSuccessFlash(false);
        onComplete(result);
      }, 500);
```

**Step 3: Add flash overlay in the render**

Find the outermost container div of the bottom sheet content (the main render return). Add this as the first child inside it:

```tsx
{showSuccessFlash && (
  <div className="pointer-events-none absolute inset-0 z-50 rounded-t-2xl bg-emerald-500/20 transition-opacity" />
)}
```

The container div needs `relative` class if it doesn't already have it.

**Step 4: Verify**

Run: `npx tsc --noEmit --pretty src/components/portal/rondas/CheckpointMarker.tsx 2>&1 | head -20`

**Step 5: Commit**

```bash
git add src/components/portal/rondas/CheckpointMarker.tsx
git commit -m "feat(portal): improved checkpoint marking feedback — sound, double-pulse vibration, flash"
```

---

### Task 2: Reduce Polling Interval from 30s to 10s

**Files:**
- Modify: `src/components/ops/rondas/RondasMonitoreoClient.tsx:54`

**Step 1: Change the interval**

At line 54, change:
```typescript
    }, 30000);
```
to:
```typescript
    }, 10000);
```

**Step 2: Commit**

```bash
git add src/components/ops/rondas/RondasMonitoreoClient.tsx
git commit -m "feat(monitoreo): reduce polling interval from 30s to 10s"
```

---

### Task 3: Guard Performance API Endpoint

**Files:**
- Create: `src/app/api/portal/rondas/mi-desempeno/route.ts`

**Context:**
This API returns guard stats for the current month. It uses the same session validation pattern as other portal APIs (e.g., `/api/portal/rondas/panico/route.ts`). The guard authenticates via a session stored in cookies/headers — check how `/api/portal/rondas/marcar/route.ts` or `/api/portal/rondas/panico/route.ts` validates the guard.

**Step 1: Create the endpoint**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const guardiaId = sp.get("guardiaId");
    const mes = sp.get("mes"); // YYYY-MM

    if (!guardiaId || !mes) {
      return NextResponse.json(
        { success: false, error: "guardiaId y mes son requeridos" },
        { status: 400 }
      );
    }

    // Parse month range
    const [year, month] = mes.split("-").map(Number);
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 0, 23, 59, 59, 999);

    // Verify guard exists
    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: guardiaId },
      select: { id: true, tenantId: true },
    });
    if (!guardia) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado" },
        { status: 404 }
      );
    }

    // Get all executions for this guard in the month
    const ejecuciones = await prisma.opsRondaEjecucion.findMany({
      where: {
        guardiaId,
        tenantId: guardia.tenantId,
        scheduledAt: { gte: from, lte: to },
      },
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        startedAt: true,
        trustScore: true,
        rondaTemplate: {
          select: { toleranciaMinutos: true },
        },
      },
      orderBy: { scheduledAt: "desc" },
    });

    const total = ejecuciones.length;
    const completadas = ejecuciones.filter(
      (e) => e.status === "completada" || e.status === "completada_con_retraso"
    ).length;

    let aTiempo = 0;
    let conRetraso = 0;
    for (const ej of ejecuciones) {
      if (ej.status !== "completada" && ej.status !== "completada_con_retraso") continue;
      const tolerancia = ej.rondaTemplate?.toleranciaMinutos ?? 15;
      const deadline = new Date(ej.scheduledAt.getTime() + tolerancia * 60 * 1000);
      if (ej.startedAt && ej.startedAt <= deadline) {
        aTiempo++;
      } else {
        conRetraso++;
      }
    }

    const noRealizadas = ejecuciones.filter(
      (e) => e.status === "no_realizada"
    ).length;

    const scoresArr = ejecuciones
      .filter((e) => e.trustScore !== null && e.trustScore !== undefined)
      .map((e) => e.trustScore as number);
    const trustScorePromedio =
      scoresArr.length > 0
        ? Math.round((scoresArr.reduce((a, b) => a + b, 0) / scoresArr.length) * 10) / 10
        : 0;

    // Streak: consecutive days backwards from today where ALL scheduled rounds were completed
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    let rachaActual = 0;
    const streakEjecuciones = await prisma.opsRondaEjecucion.findMany({
      where: {
        guardiaId,
        tenantId: guardia.tenantId,
        scheduledAt: { lte: today },
      },
      select: { scheduledAt: true, status: true },
      orderBy: { scheduledAt: "desc" },
      take: 500,
    });

    // Group by date
    const byDate = new Map<string, { total: number; completed: number }>();
    for (const ej of streakEjecuciones) {
      const dateKey = ej.scheduledAt.toISOString().slice(0, 10);
      const entry = byDate.get(dateKey) ?? { total: 0, completed: 0 };
      entry.total++;
      if (ej.status === "completada" || ej.status === "completada_con_retraso") {
        entry.completed++;
      }
      byDate.set(dateKey, entry);
    }

    // Walk backwards from today
    const cursor = new Date(today);
    while (true) {
      const key = cursor.toISOString().slice(0, 10);
      const day = byDate.get(key);
      if (!day || day.total === 0) break; // no rounds scheduled = streak breaks
      if (day.completed < day.total) break; // incomplete = streak breaks
      rachaActual++;
      cursor.setDate(cursor.getDate() - 1);
    }

    return NextResponse.json({
      success: true,
      data: { completadas, aTiempo, conRetraso, noRealizadas, total, trustScorePromedio, rachaActual },
    });
  } catch (err) {
    console.error("Error en mi-desempeno:", err);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit --pretty src/app/api/portal/rondas/mi-desempeno/route.ts 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/app/api/portal/rondas/mi-desempeno/route.ts
git commit -m "feat(portal): add /api/portal/rondas/mi-desempeno endpoint for guard stats"
```

---

### Task 4: Expand PortalPerfil with Scorecard + Gamification Placeholder

**Files:**
- Modify: `src/components/portal/rondas/PortalPerfil.tsx`

**Context:**
Current file is 58 lines. We need to add:
1. A stats section with 6 stat items in a 2x3 grid (Completadas, A tiempo, Con retraso, No realizadas, Trust promedio, Racha)
2. A gamification placeholder card
3. A useEffect to fetch from `/api/portal/rondas/mi-desempeno?guardiaId=X&mes=YYYY-MM`

The component receives `session: RondasSession` which has `guardiaId`.

**Step 1: Rewrite PortalPerfil.tsx**

```typescript
"use client";

import { useEffect, useState } from "react";
import { LogOut, Shield, MapPin, User, Flame, Trophy } from "lucide-react";
import type { RondasSession } from "./RondasPortalClient";

interface GuardStats {
  completadas: number;
  aTiempo: number;
  conRetraso: number;
  noRealizadas: number;
  total: number;
  trustScorePromedio: number;
  rachaActual: number;
}

interface PortalPerfilProps {
  session: RondasSession;
  onLogout: () => void;
}

export function PortalPerfil({ session, onLogout }: PortalPerfilProps) {
  const [stats, setStats] = useState<GuardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const now = new Date();
    const mes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    fetch(`/api/portal/rondas/mi-desempeno?guardiaId=${session.guardiaId}&mes=${mes}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setStats(d.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session.guardiaId]);

  const trustColor = stats
    ? stats.trustScorePromedio >= 80
      ? "text-emerald-400"
      : stats.trustScorePromedio >= 60
        ? "text-yellow-400"
        : "text-red-400"
    : "text-gray-400";

  return (
    <div className="flex min-h-dvh flex-col bg-[#0a0a0f] pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-800 bg-[#0a0a0f]/90 px-4 py-4 backdrop-blur-sm">
        <h1 className="text-lg font-semibold text-white">Mi Perfil</h1>
      </header>

      <div className="flex-1 space-y-6 px-4 pt-6">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-teal-900/40 ring-2 ring-teal-600/30">
            <User className="h-10 w-10 text-teal-400" />
          </div>
          <h2 className="text-xl font-semibold text-white">{session.nombre}</h2>
        </div>

        {/* Info cards */}
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl bg-gray-900/50 px-4 py-3">
            <MapPin className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">Instalacion</p>
              <p className="text-sm text-gray-200">{session.installationName}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl bg-gray-900/50 px-4 py-3">
            <Shield className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">Estado</p>
              <p className="text-sm text-teal-400">Sesion activa</p>
            </div>
          </div>
        </div>

        {/* Stats section */}
        <div>
          <h3 className="mb-3 text-sm font-medium text-gray-400">Desempeno del mes</h3>
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 gap-3">
              <StatItem label="Completadas" value={stats.completadas} sub={`de ${stats.total}`} />
              <StatItem label="A tiempo" value={stats.aTiempo} color="text-emerald-400" />
              <StatItem label="Con retraso" value={stats.conRetraso} color="text-yellow-400" />
              <StatItem label="No realizadas" value={stats.noRealizadas} color="text-red-400" />
              <StatItem label="Trust Score" value={stats.trustScorePromedio} color={trustColor} suffix="%" />
              <StatItem label="Racha" value={stats.rachaActual} color="text-orange-400" icon={<Flame className="h-4 w-4" />} suffix=" dias" />
            </div>
          ) : (
            <p className="text-center text-sm text-gray-500">Sin datos disponibles</p>
          )}
        </div>

        {/* Gamification placeholder */}
        <div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/30 px-4 py-5 text-center">
          <Trophy className="mx-auto mb-2 h-8 w-8 text-gray-600" />
          <p className="text-sm font-medium text-gray-500">Sistema de puntos y rankings</p>
          <p className="text-xs text-gray-600">Proximamente</p>
        </div>

        {/* Logout */}
        <button
          onClick={onLogout}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-red-800/50 bg-red-950/20 py-3.5 text-base font-medium text-red-400 transition-colors hover:bg-red-950/40 active:bg-red-900/30"
        >
          <LogOut className="h-5 w-5" />
          Cerrar sesion
        </button>
      </div>
    </div>
  );
}

function StatItem({
  label,
  value,
  color = "text-white",
  sub,
  suffix = "",
  icon,
}: {
  label: string;
  value: number;
  color?: string;
  sub?: string;
  suffix?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-gray-900/50 px-3 py-3">
      <div className={`flex items-center gap-1 text-2xl font-bold ${color}`}>
        {icon}
        {value}{suffix}
      </div>
      <p className="text-xs text-gray-500">
        {label}
        {sub && <span className="text-gray-600"> {sub}</span>}
      </p>
    </div>
  );
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit --pretty src/components/portal/rondas/PortalPerfil.tsx 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/components/portal/rondas/PortalPerfil.tsx
git commit -m "feat(portal): guard scorecard stats + gamification placeholder in profile"
```

---

### Task 5: Rondas Historial Tab in CRM Installation Detail

**Files:**
- Create: `src/components/crm/InstalacionRondasTab.tsx`
- Modify: `src/components/crm/CrmInstallationDetailClient.tsx:7,1890-1898,2341-2360`

**Context:**
The CRM installation detail page has a tabbed layout managed by `useEntityTabs`. We add a "Rondas" tab that fetches from the existing `/api/ops/rondas/reportes?installationId=X&from=...&to=...` API. No new API endpoint needed.

The `CrmInstallationDetailClient` does NOT receive tenantId as a prop. The reportes API already filters by tenant server-side via auth session, so the tab component just needs `installationId`.

**Step 1: Create `InstalacionRondasTab.tsx`**

```typescript
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";

interface Marcacion {
  id: string;
  checkpointName: string;
  timestamp: string;
  status: string;
  hasPhoto: boolean;
  distanceM: number | null;
}

interface Ejecucion {
  id: string;
  scheduledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  guardia: string;
  template: string;
  status: string;
  checkpointsTotal: number;
  checkpointsCompletados: number;
  porcentajeCompletado: number;
  trustScore: number | null;
  durationMinutes: number | null;
  marcaciones: Marcacion[];
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  completada: { label: "Completada", color: "bg-emerald-500/20 text-emerald-400" },
  completada_con_retraso: { label: "Con retraso", color: "bg-yellow-500/20 text-yellow-400" },
  en_progreso: { label: "En progreso", color: "bg-blue-500/20 text-blue-400" },
  no_realizada: { label: "No realizada", color: "bg-red-500/20 text-red-400" },
  programada: { label: "Programada", color: "bg-gray-500/20 text-gray-400" },
};

function trustBadge(score: number | null) {
  if (score == null) return { color: "bg-gray-100 text-gray-600", label: "-" };
  if (score >= 80) return { color: "bg-emerald-100 text-emerald-700", label: `${score}%` };
  if (score >= 60) return { color: "bg-yellow-100 text-yellow-700", label: `${score}%` };
  return { color: "bg-red-100 text-red-700", label: `${score}%` };
}

export function InstalacionRondasTab({ installationId }: { installationId: string }) {
  const [rows, setRows] = useState<Ejecucion[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  // Default: last 30 days
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        installationId,
        from: dateFrom,
        to: dateTo,
      });
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/ops/rondas/reportes?${params}`);
      const json = await res.json();
      if (json.success) setRows(json.data);
    } catch { /* ignore */ }
    setLoading(false);
  }, [installationId, dateFrom, dateTo, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // KPIs
  const kpis = useMemo(() => {
    const completed = rows.filter((r) => r.status === "completada" || r.status === "completada_con_retraso").length;
    const total = rows.length;
    const cumplimiento = total > 0 ? Math.round((completed / total) * 100) : 0;
    const scores = rows.filter((r) => r.trustScore != null).map((r) => r.trustScore as number);
    const avgTrust = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const today = new Date().toISOString().slice(0, 10);
    const todayRows = rows.filter((r) => r.scheduledAt.slice(0, 10) === today);
    const todayCompleted = todayRows.filter((r) => r.status === "completada" || r.status === "completada_con_retraso").length;
    return { cumplimiento, avgTrust, todayCompleted, todayTotal: todayRows.length, completed, total };
  }, [rows]);

  // Pagination
  const paginated = useMemo(() => rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [rows, page]);
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Cumplimiento" value={`${kpis.cumplimiento}%`} sub={`${kpis.completed}/${kpis.total}`} />
        <KpiCard label="Trust Score" value={`${kpis.avgTrust}%`} />
        <KpiCard label="Hoy" value={`${kpis.todayCompleted}/${kpis.todayTotal}`} />
        <KpiCard label="Total periodo" value={`${kpis.total}`} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Desde</label>
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Hasta</label>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Estado</label>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm">
            <option value="all">Todos</option>
            <option value="completada">Completada</option>
            <option value="completada_con_retraso">Con retraso</option>
            <option value="no_realizada">No realizada</option>
            <option value="en_progreso">En progreso</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium"></th>
              <th className="px-3 py-2 text-left font-medium">Fecha</th>
              <th className="px-3 py-2 text-left font-medium">Guardia</th>
              <th className="px-3 py-2 text-left font-medium">Trust</th>
              <th className="px-3 py-2 text-left font-medium">Checkpoints</th>
              <th className="px-3 py-2 text-left font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paginated.map((row) => {
              const isExpanded = expandedId === row.id;
              const statusInfo = STATUS_LABELS[row.status] ?? { label: row.status, color: "bg-gray-100 text-gray-600" };
              const trust = trustBadge(row.trustScore);
              return (
                <>
                  <tr key={row.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : row.id)}>
                    <td className="px-3 py-2">
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(row.scheduledAt).toLocaleDateString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-3 py-2">{row.guardia || "-"}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${trust.color}`}>{trust.label}</span>
                    </td>
                    <td className="px-3 py-2">{row.checkpointsCompletados}/{row.checkpointsTotal}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
                    </td>
                  </tr>
                  {isExpanded && row.marcaciones.length > 0 && (
                    <tr key={`${row.id}-detail`}>
                      <td colSpan={6} className="bg-muted/20 px-6 py-3">
                        <div className="space-y-1">
                          {row.marcaciones.map((m) => (
                            <div key={m.id} className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="w-16">{new Date(m.timestamp).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</span>
                              <span className="flex-1">{m.checkpointName}</span>
                              {m.distanceM != null && <span>{Math.round(m.distanceM)}m</span>}
                              {m.hasPhoto && <span className="text-blue-400">Foto</span>}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {paginated.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Sin rondas en este periodo</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{rows.length} rondas</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
              className="rounded border border-border px-3 py-1 text-xs disabled:opacity-50">Anterior</button>
            <span className="px-2 py-1 text-xs text-muted-foreground">{page + 1}/{totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="rounded border border-border px-3 py-1 text-xs disabled:opacity-50">Siguiente</button>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}{sub && <span className="ml-1 text-muted-foreground/60">{sub}</span>}</p>
    </div>
  );
}
```

**Step 2: Integrate tab in CrmInstallationDetailClient.tsx**

Add import at line ~7 (with other imports from lucide-react), add `Route` to the lucide import:

```typescript
// Add Route to the existing lucide import line
import { ..., Route } from "lucide-react";
```

Add import for the new component:

```typescript
import { InstalacionRondasTab } from "./InstalacionRondasTab";
```

At line 1894, add the rondas tab after "protocolo" and before "files":

```typescript
    { id: "protocolo", label: "Protocolo", icon: BookOpen },
    { id: "rondas", label: "Rondas", icon: Route },
    { id: "files", label: "Documentos", icon: FileText, count: fileCount },
```

In the tab rendering block (after `activeTab === "protocolo"` block around line 2341), add:

```typescript
        {activeTab === "rondas" && (
          <InstalacionRondasTab installationId={installation.id} />
        )}
```

**Step 3: Verify**

Run: `npx tsc --noEmit --pretty src/components/crm/InstalacionRondasTab.tsx src/components/crm/CrmInstallationDetailClient.tsx 2>&1 | head -20`

**Step 4: Commit**

```bash
git add src/components/crm/InstalacionRondasTab.tsx src/components/crm/CrmInstallationDetailClient.tsx
git commit -m "feat(crm): add Rondas historial tab in installation detail with KPIs and expandable table"
```

---

### Task 6: Final TypeScript Verification

**Step 1: Run full type check**

```bash
NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit 2>&1 | tail -30
```

Note: There's a pre-existing `esrecurse` type error in the build that is NOT caused by our changes. Only check for errors in our modified files.

**Step 2: Commit any fixes if needed**

```bash
git commit -m "fix: address any type errors from bloque 3"
```
