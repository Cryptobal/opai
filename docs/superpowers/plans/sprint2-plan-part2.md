# Sprint 2: Historial Marcaciones + Reportes DT — Plan Parte 2 (Pasos 11–21)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Pre-requisito:** Completar `sprint2-plan-part1.md` antes de iniciar este archivo.

**Goal:** Tab historial en ficha de guardia (Parte A), tab historial en ficha de instalación (Parte B), y 4 reportes DT con PDF + Excel (Parte C).

**Spec:** `docs/superpowers/specs/2026-03-12-sprint2-historial-marcaciones-reportes-dt-design.md`

---

## Chunk 3: Parte A — Tab Marcaciones en ficha del guardia

### Task 11: API GET /api/ops/guardias/[id]/marcaciones

**Files:**
- Create: `src/app/api/ops/guardias/[id]/marcaciones/route.ts`

- [ ] **Step 1: Crear la ruta**

```typescript
/**
 * GET /api/ops/guardias/[id]/marcaciones?year=YYYY&month=MM
 * Devuelve marcaciones del guardia en el mes dado + estadísticas.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { startOfMonth, endOfMonth, getDaysInMonth } from "date-fns";
import { toZonedTime } from "date-fns-tz";

const TZ = "America/Santiago";
type Params = { id: string };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const sp = request.nextUrl.searchParams;
    const now = toZonedTime(new Date(), TZ);
    const year = parseInt(sp.get("year") ?? String(now.getFullYear()), 10);
    const month = parseInt(sp.get("month") ?? String(now.getMonth() + 1), 10);

    // Guardar start/end en UTC para la query
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const guardia = await prisma.opsGuardia.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!guardia) {
      return NextResponse.json({ success: false, error: "Guardia no encontrado" }, { status: 404 });
    }

    const marcaciones = await prisma.opsMarcacion.findMany({
      where: {
        guardiaId: id,
        tenantId: ctx.tenantId,
        timestamp: { gte: start, lte: end },
        deletedAt: null,
      },
      select: {
        id: true,
        tipo: true,
        timestamp: true,
        metodoId: true,
        gpsStatus: true,
        atrasoMinutos: true,
        isModified: true,
        modifiedAt: true,
        modificationReason: true,
        opposedAt: true,
        consolidatedAt: true,
        installation: { select: { id: true, name: true } },
      },
      orderBy: { timestamp: "asc" },
    });

    // Estadísticas del mes
    const entradas = marcaciones.filter((m) => m.tipo === "entrada");
    const salidas = marcaciones.filter((m) => m.tipo === "salida");
    const modificadas = marcaciones.filter((m) => m.isModified);
    const conAtraso = entradas.filter((m) => (m.atrasoMinutos ?? 0) > 0);
    const fuera = marcaciones.filter((m) => m.gpsStatus === "fuera_rango");

    return NextResponse.json({
      success: true,
      data: {
        marcaciones: marcaciones.map((m) => ({
          ...m,
          timestamp: m.timestamp.toISOString(),
          modifiedAt: m.modifiedAt?.toISOString() ?? null,
          opposedAt: m.opposedAt?.toISOString() ?? null,
          consolidatedAt: m.consolidatedAt?.toISOString() ?? null,
        })),
        stats: {
          totalEntradas: entradas.length,
          totalSalidas: salidas.length,
          diasConMarcacion: new Set(
            marcaciones.map((m) =>
              new Date(m.timestamp).toISOString().slice(0, 10)
            )
          ).size,
          diasEnMes: getDaysInMonth(new Date(year, month - 1)),
          conAtraso: conAtraso.length,
          modificadas: modificadas.length,
          fueraDeRango: fuera.length,
        },
      },
    });
  } catch (error) {
    console.error("[OPS] Error fetching guardia marcaciones:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "guardias/\[id\]/marcaciones" | head -5
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ops/guardias/[id]/marcaciones/
git commit -m "feat(api): GET guardia marcaciones con stats mensuales"
```

---

### Task 12: GuardiaMarcacionesTab component

**Files:**
- Create: `src/components/ops/GuardiaMarcacionesTab.tsx`

- [ ] **Step 1: Crear el componente**

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Clock, MapPin, Fingerprint, User, AlertCircle } from "lucide-react";
import { MarcacionModificadaBadge } from "./MarcacionModificadaBadge";
import { cn } from "@/lib/utils";

interface Marcacion {
  id: string;
  tipo: "entrada" | "salida";
  timestamp: string;
  metodoId: string;
  gpsStatus: "dentro_rango" | "fuera_rango" | "sin_gps";
  atrasoMinutos: number | null;
  isModified: boolean;
  modifiedAt: string | null;
  modificationReason: string | null;
  opposedAt: string | null;
  consolidatedAt: string | null;
  installation: { id: string; name: string };
}

interface Stats {
  totalEntradas: number;
  totalSalidas: number;
  diasConMarcacion: number;
  diasEnMes: number;
  conAtraso: number;
  modificadas: number;
  fueraDeRango: number;
}

const METODO_LABEL: Record<string, string> = {
  face_id: "Face ID",
  rut_pin: "RUT+PIN",
  manual: "Manual",
  import: "Importado",
};

const GPS_CONFIG = {
  dentro_rango: { label: "En rango", className: "text-emerald-600" },
  fuera_rango: { label: "Fuera de rango", className: "text-amber-600" },
  sin_gps: { label: "Sin GPS", className: "text-slate-400" },
};

export function GuardiaMarcacionesTab({ guardiaId }: { guardiaId: string }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [marcaciones, setMarcaciones] = useState<Marcacion[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/ops/guardias/${guardiaId}/marcaciones?year=${year}&month=${month}`
      );
      const d = await r.json();
      if (d.success) {
        setMarcaciones(d.data.marcaciones);
        setStats(d.data.stats);
      }
    } catch {}
    setLoading(false);
  }, [guardiaId, year, month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
    setSelectedDate(null);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
    setSelectedDate(null);
  };

  // Build calendar data
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay(); // 0=Sun
  // Adjust so Monday is first (0=Mon...6=Sun)
  const startOffset = (firstDayOfWeek + 6) % 7;

  // Group marcaciones by date
  const byDate = new Map<string, Marcacion[]>();
  for (const m of marcaciones) {
    const dateKey = m.timestamp.slice(0, 10);
    const arr = byDate.get(dateKey) ?? [];
    arr.push(m);
    byDate.set(dateKey, arr);
  }

  const monthLabel = new Date(year, month - 1, 1).toLocaleString("es-CL", {
    month: "long", year: "numeric",
  });

  const selectedDayMarcaciones = selectedDate ? (byDate.get(selectedDate) ?? []) : [];

  return (
    <div className="space-y-4">
      {/* Navegación mes */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-1 rounded hover:bg-accent transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h3 className="text-sm font-semibold capitalize">{monthLabel}</h3>
        <button onClick={nextMonth} className="p-1 rounded hover:bg-accent transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Entradas", value: stats.totalEntradas },
            { label: "Salidas", value: stats.totalSalidas },
            { label: "Días con marca", value: `${stats.diasConMarcacion}/${stats.diasEnMes}` },
            { label: "Modificadas", value: stats.modificadas, warn: stats.modificadas > 0 },
          ].map((s) => (
            <div key={s.label} className="bg-card rounded-lg border border-border p-2 text-center">
              <p className={cn("text-lg font-bold", s.warn ? "text-amber-600" : "text-foreground")}>
                {s.value}
              </p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Calendario */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        {/* Cabecera días */}
        <div className="grid grid-cols-7 border-b border-border">
          {["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"].map((d) => (
            <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-2">
              {d}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="h-40 flex items-center justify-center">
            <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {/* Empty cells before first day */}
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`empty-${i}`} className="border-b border-r border-border/40 h-14" />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const dayMarcaciones = byDate.get(dateStr) ?? [];
              const hasEntrada = dayMarcaciones.some((m) => m.tipo === "entrada");
              const hasSalida = dayMarcaciones.some((m) => m.tipo === "salida");
              const hasModificada = dayMarcaciones.some((m) => m.isModified);
              const hasFueraRango = dayMarcaciones.some((m) => m.gpsStatus === "fuera_rango");
              const isSelected = selectedDate === dateStr;
              const isToday = dateStr === new Date().toISOString().slice(0, 10);

              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  className={cn(
                    "border-b border-r border-border/40 h-14 p-1 text-left relative hover:bg-accent/50 transition-colors",
                    isSelected && "bg-primary/10 border-primary/30",
                    isToday && "font-bold"
                  )}
                >
                  <span className={cn("text-xs", isToday && "text-primary")}>{day}</span>
                  <div className="flex flex-wrap gap-0.5 mt-0.5">
                    {hasEntrada && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500" title="Entrada" />
                    )}
                    {hasSalida && (
                      <span className="w-2 h-2 rounded-full bg-orange-500" title="Salida" />
                    )}
                    {hasModificada && (
                      <span className="w-2 h-2 rounded-full bg-amber-400" title="Modificada" />
                    )}
                    {hasFueraRango && (
                      <span className="w-2 h-2 rounded-full bg-red-400" title="GPS fuera de rango" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Panel de detalle del día seleccionado */}
      {selectedDate && (
        <div className="bg-card rounded-lg border border-border p-4 space-y-3">
          <h4 className="text-sm font-medium text-foreground">
            {new Date(selectedDate + "T12:00:00Z").toLocaleDateString("es-CL", {
              weekday: "long", day: "numeric", month: "long",
            })}
          </h4>

          {selectedDayMarcaciones.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin marcaciones en este día.</p>
          ) : (
            <div className="space-y-2">
              {selectedDayMarcaciones.map((m) => {
                const hora = new Date(m.timestamp).toLocaleTimeString("es-CL", {
                  hour: "2-digit", minute: "2-digit", second: "2-digit",
                  timeZone: "America/Santiago",
                });
                const gps = GPS_CONFIG[m.gpsStatus] ?? GPS_CONFIG.sin_gps;
                return (
                  <div key={m.id} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                    <div className={cn(
                      "w-2 h-2 rounded-full mt-1.5 shrink-0",
                      m.tipo === "entrada" ? "bg-emerald-500" : "bg-orange-500"
                    )} />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn(
                          "text-xs font-semibold",
                          m.tipo === "entrada" ? "text-emerald-600" : "text-orange-600"
                        )}>
                          {m.tipo === "entrada" ? "Entrada" : "Salida"}
                        </span>
                        <span className="text-sm font-mono font-bold">{hora}</span>
                        {m.atrasoMinutos && m.atrasoMinutos > 0 && (
                          <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                            +{m.atrasoMinutos}min atraso
                          </span>
                        )}
                        <MarcacionModificadaBadge
                          isModified={m.isModified}
                          consolidatedAt={m.consolidatedAt}
                          opposedAt={m.opposedAt}
                        />
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Fingerprint className="w-3 h-3" />
                          {METODO_LABEL[m.metodoId] ?? m.metodoId}
                        </span>
                        <span className={cn("flex items-center gap-1", gps.className)}>
                          <MapPin className="w-3 h-3" />
                          {gps.label}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 opacity-0" />
                          {m.installation.name}
                        </span>
                      </div>
                      {m.isModified && m.modificationReason && (
                        <p className="text-[11px] text-amber-600 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          Motivo: {m.modificationReason}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Leyenda */}
      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Entrada</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" /> Salida</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> Modificada</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> GPS fuera de rango</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "GuardiaMarcaciones" | head -5
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/ops/GuardiaMarcacionesTab.tsx
git commit -m "feat(ops): GuardiaMarcacionesTab con calendario mensual y panel de detalle"
```

---

### Task 13: Conectar GuardiaMarcacionesTab en GuardiaDetailClient

**Files:**
- Modify: `src/components/ops/GuardiaDetailClient.tsx`

- [ ] **Step 1: Agregar import al tope del archivo**

```typescript
import { GuardiaMarcacionesTab } from "./GuardiaMarcacionesTab";
```

También agregar `Clock` al import de lucide-react (si no está ya):
```typescript
// Buscar la línea de import de lucide-react y agregar Clock
import { ..., Clock } from "lucide-react";
```

- [ ] **Step 2: Actualizar `TabKey` (línea ~225)**

```typescript
// ANTES:
type TabKey = "perfil" | "operaciones" | "contractual" | "eventos_laborales" | "documentos" | "actividad" | "desempeno";

// DESPUÉS:
type TabKey = "perfil" | "operaciones" | "contractual" | "eventos_laborales" | "documentos" | "actividad" | "desempeno" | "marcaciones";
```

- [ ] **Step 3: Agregar tab a TABS array (línea ~227), después de "desempeno"**

```typescript
  { key: "marcaciones", label: "Marcaciones", icon: Clock },
```

- [ ] **Step 4: Agregar case en `renderTabContent()` (al final del switch, antes del default/closing bracket)**

```typescript
      case "marcaciones":
        return <GuardiaMarcacionesTab guardiaId={guardia.id} />;
```

- [ ] **Step 5: Eliminar el placeholder de marcaciones en `associatedSections` (línea ~658)**

Remover el objeto completo:
```typescript
// ELIMINAR este bloque:
    {
      id: "marcaciones",
      label: "Marcaciones",
      content: (
        <div className="py-6 text-center text-sm text-muted-foreground">
          Historial de marcaciones próximamente.
        </div>
      ),
    },
```

- [ ] **Step 6: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "GuardiaDetailClient" | head -5
```

Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/components/ops/GuardiaDetailClient.tsx
git commit -m "feat(ops): tab Marcaciones en ficha del guardia, reemplaza placeholder"
```

---

## Chunk 4: Parte B — Tab Marcaciones en ficha de instalación

### Task 14: API GET /api/ops/installations/[id]/marcaciones

**Files:**
- Create: `src/app/api/ops/installations/[id]/marcaciones/route.ts`

- [ ] **Step 1: Crear la ruta**

```typescript
/**
 * GET /api/ops/installations/[id]/marcaciones?date=YYYY-MM-DD
 * Devuelve marcaciones del día dado para todos los guardias de la instalación.
 * Agrupa por guardia: entrada + salida del día.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

type Params = { id: string };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const sp = request.nextUrl.searchParams;

    const dateStr = sp.get("date") ?? new Date().toISOString().slice(0, 10);
    const [y, mo, d] = dateStr.split("-").map(Number);
    const dayStart = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(y, mo - 1, d, 23, 59, 59, 999));

    const installation = await prisma.crmInstallation.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, name: true },
    });
    if (!installation) {
      return NextResponse.json({ success: false, error: "Instalación no encontrada" }, { status: 404 });
    }

    const marcaciones = await prisma.opsMarcacion.findMany({
      where: {
        installationId: id,
        tenantId: ctx.tenantId,
        timestamp: { gte: dayStart, lte: dayEnd },
        deletedAt: null,
      },
      select: {
        id: true,
        tipo: true,
        timestamp: true,
        metodoId: true,
        gpsStatus: true,
        atrasoMinutos: true,
        isModified: true,
        modifiedAt: true,
        modificationReason: true,
        opposedAt: true,
        consolidatedAt: true,
        guardiaId: true,
        guardia: {
          select: {
            id: true,
            persona: { select: { firstName: true, lastName: true, rut: true } },
          },
        },
      },
      orderBy: { timestamp: "asc" },
    });

    // Agrupar por guardia
    const byGuardia = new Map<string, {
      guardiaId: string;
      guardiaName: string;
      guardiaRut: string;
      entradas: typeof marcaciones;
      salidas: typeof marcaciones;
    }>();

    for (const m of marcaciones) {
      const key = m.guardiaId;
      if (!byGuardia.has(key)) {
        byGuardia.set(key, {
          guardiaId: m.guardia.id,
          guardiaName: `${m.guardia.persona.firstName} ${m.guardia.persona.lastName}`,
          guardiaRut: m.guardia.persona.rut ?? "",
          entradas: [],
          salidas: [],
        });
      }
      const g = byGuardia.get(key)!;
      if (m.tipo === "entrada") g.entradas.push(m);
      else g.salidas.push(m);
    }

    const rows = Array.from(byGuardia.values()).map((g) => ({
      guardiaId: g.guardiaId,
      guardiaName: g.guardiaName,
      guardiaRut: g.guardiaRut,
      entrada: g.entradas[0]
        ? {
            id: g.entradas[0].id,
            timestamp: g.entradas[0].timestamp.toISOString(),
            metodoId: g.entradas[0].metodoId,
            gpsStatus: g.entradas[0].gpsStatus,
            atrasoMinutos: g.entradas[0].atrasoMinutos,
            isModified: g.entradas[0].isModified,
            modificationReason: g.entradas[0].modificationReason,
            opposedAt: g.entradas[0].opposedAt?.toISOString() ?? null,
            consolidatedAt: g.entradas[0].consolidatedAt?.toISOString() ?? null,
          }
        : null,
      salida: g.salidas[0]
        ? {
            id: g.salidas[0].id,
            timestamp: g.salidas[0].timestamp.toISOString(),
            metodoId: g.salidas[0].metodoId,
            gpsStatus: g.salidas[0].gpsStatus,
            isModified: g.salidas[0].isModified,
            modificationReason: g.salidas[0].modificationReason,
            opposedAt: g.salidas[0].opposedAt?.toISOString() ?? null,
            consolidatedAt: g.salidas[0].consolidatedAt?.toISOString() ?? null,
          }
        : null,
    }));

    // Summary del día
    const summary = {
      totalGuardias: rows.length,
      conEntrada: rows.filter((r) => r.entrada).length,
      conSalida: rows.filter((r) => r.salida).length,
      sinSalida: rows.filter((r) => r.entrada && !r.salida).length,
      conAtraso: rows.filter((r) => (r.entrada?.atrasoMinutos ?? 0) > 0).length,
      modificadas: marcaciones.filter((m) => m.isModified).length,
    };

    return NextResponse.json({ success: true, data: { rows, summary, date: dateStr } });
  } catch (error) {
    console.error("[OPS] Error fetching installation marcaciones:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "installations/\[id\]/marcaciones" | head -5
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ops/installations/[id]/marcaciones/
git commit -m "feat(api): GET installation marcaciones del día con agrupación por guardia"
```

---

### Task 15: InstalacionMarcacionesTab component

**Files:**
- Create: `src/components/ops/InstalacionMarcacionesTab.tsx`

- [ ] **Step 1: Crear el componente**

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, CheckCircle, XCircle, AlertCircle, Clock } from "lucide-react";
import { MarcacionModificadaBadge } from "./MarcacionModificadaBadge";
import { cn } from "@/lib/utils";

interface MarcacionEntry {
  id: string;
  timestamp: string;
  metodoId: string;
  gpsStatus: string;
  atrasoMinutos?: number | null;
  isModified: boolean;
  modificationReason: string | null;
  opposedAt: string | null;
  consolidatedAt: string | null;
}

interface GuardiaRow {
  guardiaId: string;
  guardiaName: string;
  guardiaRut: string;
  entrada: MarcacionEntry | null;
  salida: MarcacionEntry | null;
}

interface Summary {
  totalGuardias: number;
  conEntrada: number;
  conSalida: number;
  sinSalida: number;
  conAtraso: number;
  modificadas: number;
}

function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-CL", {
    hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago",
  });
}

export function InstalacionMarcacionesTab({ installationId }: { installationId: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState<GuardiaRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/ops/installations/${installationId}/marcaciones?date=${date}`
      );
      const d = await r.json();
      if (d.success) {
        setRows(d.data.rows);
        setSummary(d.data.summary);
      }
    } catch {}
    setLoading(false);
  }, [installationId, date]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const prevDay = () => {
    const d = new Date(date + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    setDate(d.toISOString().slice(0, 10));
  };
  const nextDay = () => {
    const d = new Date(date + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    setDate(d.toISOString().slice(0, 10));
  };

  const dateLabel = new Date(date + "T12:00:00Z").toLocaleDateString("es-CL", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="space-y-4">
      {/* Navegación día */}
      <div className="flex items-center justify-between">
        <button onClick={prevDay} className="p-1 rounded hover:bg-accent transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold capitalize">{dateLabel}</h3>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="text-xs border border-border rounded px-2 py-1 bg-background"
          />
        </div>
        <button onClick={nextDay} className="p-1 rounded hover:bg-accent transition-colors"
          disabled={date >= today}>
          <ChevronRight className={cn("w-4 h-4", date >= today && "opacity-30")} />
        </button>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Con entrada", value: summary.conEntrada, of: summary.totalGuardias },
            { label: "Con salida", value: summary.conSalida, of: summary.totalGuardias },
            { label: "Sin salida", value: summary.sinSalida, warn: summary.sinSalida > 0 },
          ].map((s) => (
            <div key={s.label} className="bg-card rounded-lg border border-border p-2 text-center">
              <p className={cn("text-lg font-bold", s.warn ? "text-amber-600" : "text-foreground")}>
                {s.value}{s.of !== undefined ? `/${s.of}` : ""}
              </p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabla */}
      {loading ? (
        <div className="h-32 flex items-center justify-center">
          <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          Sin marcaciones registradas en este día.
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border text-left">
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Guardia</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Entrada</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Salida</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.guardiaId} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2">
                    <p className="font-medium text-foreground text-xs">{row.guardiaName}</p>
                    <p className="text-[10px] text-muted-foreground">{row.guardiaRut}</p>
                  </td>
                  <td className="px-3 py-2">
                    {row.entrada ? (
                      <div className="space-y-0.5">
                        <p className="font-mono text-xs text-emerald-600 font-bold">
                          {fmtHora(row.entrada.timestamp)}
                        </p>
                        {row.entrada.atrasoMinutos && row.entrada.atrasoMinutos > 0 && (
                          <p className="text-[10px] text-red-500">+{row.entrada.atrasoMinutos}min</p>
                        )}
                        <MarcacionModificadaBadge
                          isModified={row.entrada.isModified}
                          consolidatedAt={row.entrada.consolidatedAt}
                          opposedAt={row.entrada.opposedAt}
                        />
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.salida ? (
                      <div className="space-y-0.5">
                        <p className="font-mono text-xs text-orange-600 font-bold">
                          {fmtHora(row.salida.timestamp)}
                        </p>
                        <MarcacionModificadaBadge
                          isModified={row.salida.isModified}
                          consolidatedAt={row.salida.consolidatedAt}
                          opposedAt={row.salida.opposedAt}
                        />
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {!row.entrada && !row.salida ? (
                      <span className="text-[10px] text-slate-400">Sin marcas</span>
                    ) : row.entrada && row.salida ? (
                      <CheckCircle className="w-4 h-4 text-emerald-500" title="Completo" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-500" title="Incompleto" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "InstalacionMarcaciones" | head -5
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/ops/InstalacionMarcacionesTab.tsx
git commit -m "feat(ops): InstalacionMarcacionesTab con navegación por día y tabla de asistencia"
```

---

### Task 16: Conectar InstalacionMarcacionesTab en CrmInstallationDetailClient

**Files:**
- Modify: `src/components/crm/CrmInstallationDetailClient.tsx`

- [ ] **Step 1: Agregar import**

```typescript
import { InstalacionMarcacionesTab } from "@/components/ops/InstalacionMarcacionesTab";
```

También agregar `Clock` al import de lucide-react si no está.

- [ ] **Step 2: Agregar tab al array `tabs` (línea ~1925), después de "rondas"**

```typescript
    { id: "marcaciones", label: "Marcaciones", icon: Clock },
```

- [ ] **Step 3: Agregar renderizado del tab (después del bloque `{activeTab === "rondas" && ...}`)**

```typescript
        {activeTab === "marcaciones" && (
          <InstalacionMarcacionesTab installationId={installation.id} />
        )}
```

- [ ] **Step 4: Eliminar el placeholder en `associatedSections` (línea ~2167)**

Remover:
```typescript
    {
      id: "marcaciones-faceid",
      label: "Historial Face ID",
      content: (
        // ... placeholder text
      ),
    },
```

- [ ] **Step 5: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "CrmInstallationDetailClient" | head -5
```

Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/components/crm/CrmInstallationDetailClient.tsx
git commit -m "feat(crm): tab Marcaciones en ficha de instalación, reemplaza placeholder"
```

---

## Chunk 5: Parte C — Reportes DT

### Task 17: Nav entry en AppLayoutClient + rutas de página

**Files:**
- Modify: `src/components/opai/AppLayoutClient.tsx`
- Create: `src/app/(app)/reportes/dt/page.tsx`
- Create: `src/app/(app)/reportes/dt/layout.tsx`

- [ ] **Step 1: Agregar import `FileBarChart` a AppLayoutClient.tsx**

```typescript
import { ..., FileBarChart } from "lucide-react";
```

- [ ] **Step 2: Agregar entrada de nav después del bloque "Personas" (línea ~169)**

```typescript
    {
      href: '/reportes/dt',
      label: 'Reportes DT',
      icon: FileBarChart,
      show: canView(permissions, 'reportes_dt'),
      children: [
        { href: '/reportes/dt/asistencia-diaria', label: 'Asistencia Diaria', icon: FileBarChart },
        { href: '/reportes/dt/jornada-diaria', label: 'Jornada Diaria', icon: FileBarChart },
        { href: '/reportes/dt/domingos-festivos', label: 'Domingos y Festivos', icon: FileBarChart },
        { href: '/reportes/dt/modificaciones-turnos', label: 'Modificaciones', icon: FileBarChart },
      ],
    },
```

- [ ] **Step 3: Crear el layout de reportes DT**

```typescript
// src/app/(app)/reportes/dt/layout.tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";

export default async function ReportesDtLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/reportes/dt");
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "reportes_dt")) redirect("/hub");
  return <>{children}</>;
}
```

- [ ] **Step 4: Crear página índice**

```typescript
// src/app/(app)/reportes/dt/page.tsx
import { PageHeader } from "@/components/opai";
import Link from "next/link";
import { FileBarChart } from "lucide-react";

const REPORTS = [
  { href: "/reportes/dt/asistencia-diaria", label: "Asistencia Diaria", desc: "Listado de asistencia para el período seleccionado (Res. N°38 Art. 4)" },
  { href: "/reportes/dt/jornada-diaria", label: "Jornada Diaria", desc: "Horas normales y extras por trabajador (Res. N°38 Art. 6)" },
  { href: "/reportes/dt/domingos-festivos", label: "Domingos y Festivos", desc: "Días domingo y festivos trabajados (Art. 38 CT)" },
  { href: "/reportes/dt/modificaciones-turnos", label: "Modificaciones de Turnos", desc: "Registro de todas las marcaciones modificadas" },
];

export default function ReportesDtPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Reportes DT" description="Reportes obligatorios Dirección del Trabajo — Res. Exenta N°38." />
      <div className="grid gap-4 sm:grid-cols-2">
        {REPORTS.map((r) => (
          <Link key={r.href} href={r.href}
            className="flex items-start gap-4 p-5 rounded-xl border border-border bg-card hover:bg-accent/30 transition-colors">
            <FileBarChart className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-sm">{r.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{r.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/opai/AppLayoutClient.tsx src/app/(app)/reportes/
git commit -m "feat(nav): entrada Reportes DT en sidebar + índice de reportes"
```

---

### Task 18: Reporte 1 — Asistencia Diaria

**Files:**
- Create: `src/app/api/reportes/dt/asistencia-diaria/route.ts`
- Create: `src/app/api/reportes/dt/asistencia-diaria/export-pdf/route.ts`
- Create: `src/app/api/reportes/dt/asistencia-diaria/export-excel/route.ts`
- Create: `src/app/(app)/reportes/dt/asistencia-diaria/page.tsx`
- Create: `src/components/reportes-dt/AsistenciaDiariaClient.tsx`

**Nota de schema:** La tabla `OpsAsistenciaDiaria` se join a `OpsPuestoOperativo` via `puestoId`. El campo de jornada se encuentra en `puesto.shiftStart` / `puesto.shiftEnd`.

- [ ] **Step 1: Crear API de datos**

```typescript
// src/app/api/reportes/dt/asistencia-diaria/route.ts
/**
 * GET /api/reportes/dt/asistencia-diaria?from=YYYY-MM-DD&to=YYYY-MM-DD&installationId=...
 * Devuelve registros de asistencia para el reporte DT.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "reportes_dt")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const from = sp.get("from");
    const to = sp.get("to");
    const installationId = sp.get("installationId");

    if (!from || !to) {
      return NextResponse.json({ success: false, error: "Parámetros from/to requeridos" }, { status: 400 });
    }

    const [fy, fm, fd] = from.split("-").map(Number);
    const [ty, tm, td] = to.split("-").map(Number);
    const startDate = new Date(Date.UTC(fy, fm - 1, fd));
    const endDate = new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59));

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      date: { gte: startDate, lte: endDate },
      deletedAt: null,
    };
    if (installationId) where.installationId = installationId;

    const records = await prisma.opsAsistenciaDiaria.findMany({
      where,
      select: {
        id: true,
        date: true,
        attendanceStatus: true,
        checkInAt: true,
        checkOutAt: true,
        workedMinutes: true,
        plannedMinutes: true,
        overtimeMinutes: true,
        marcacionEntradaId: true,
        marcacionSalidaId: true,
        // OpsAsistenciaDiaria NO tiene relación "guardia"; usar plannedGuardia o actualGuardia
        plannedGuardia: {
          select: {
            id: true,
            persona: { select: { firstName: true, lastName: true, rut: true } },
          },
        },
        installation: { select: { id: true, name: true } },
        puesto: { select: { name: true, shiftStart: true, shiftEnd: true } },
        marcacionEntrada: {
          select: {
            timestamp: true, metodoId: true, gpsStatus: true,
            isModified: true, atrasoMinutos: true,
            opposedAt: true, consolidatedAt: true,
          },
        },
        marcacionSalida: {
          select: {
            timestamp: true, metodoId: true, gpsStatus: true,
            isModified: true,
            opposedAt: true, consolidatedAt: true,
          },
        },
      },
      orderBy: [{ date: "asc" }, { plannedGuardia: { persona: { lastName: "asc" } } }],
    });

    return NextResponse.json({ success: true, data: records });
  } catch (error) {
    console.error("[DT] Error asistencia-diaria:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Crear ruta export-excel**

```typescript
// src/app/api/reportes/dt/asistencia-diaria/export-excel/route.ts
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "reportes_dt")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const { from, to, installationId } = await request.json();

    const [fy, fm, fd] = from.split("-").map(Number);
    const [ty, tm, td] = to.split("-").map(Number);
    const startDate = new Date(Date.UTC(fy, fm - 1, fd));
    const endDate = new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59));

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      date: { gte: startDate, lte: endDate },
      deletedAt: null,
    };
    if (installationId) where.installationId = installationId;

    const records = await prisma.opsAsistenciaDiaria.findMany({
      where,
      select: {
        date: true,
        attendanceStatus: true,
        checkInAt: true,
        checkOutAt: true,
        workedMinutes: true,
        overtimeMinutes: true,
        // OpsAsistenciaDiaria NO tiene relación genérica "guardia"; usar "plannedGuardia"
        plannedGuardia: { select: { persona: { select: { firstName: true, lastName: true, rut: true } } } },
        installation: { select: { name: true } },
        puesto: { select: { name: true } },
        marcacionEntrada: { select: { timestamp: true, isModified: true, atrasoMinutos: true } },
        marcacionSalida: { select: { timestamp: true, isModified: true } },
      },
      orderBy: [{ date: "asc" }],
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = "OPAI";
    const ws = wb.addWorksheet("Asistencia Diaria");

    ws.columns = [
      { header: "Fecha", key: "fecha", width: 12 },
      { header: "RUT", key: "rut", width: 13 },
      { header: "Apellido", key: "apellido", width: 18 },
      { header: "Nombre", key: "nombre", width: 16 },
      { header: "Instalación", key: "instalacion", width: 22 },
      { header: "Puesto", key: "puesto", width: 18 },
      { header: "Estado", key: "estado", width: 14 },
      { header: "Entrada", key: "entrada", width: 10 },
      { header: "Salida", key: "salida", width: 10 },
      { header: "Horas Norm.", key: "horas_norm", width: 12 },
      { header: "Horas Extra", key: "horas_extra", width: 12 },
      { header: "Atraso (min)", key: "atraso", width: 12 },
      { header: "Modificada", key: "modificada", width: 12 },
    ];

    // Header styling
    ws.getRow(1).eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    });

    for (const r of records) {
      const fmtHora = (d: Date | null | undefined) =>
        d ? new Date(d).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" }) : "";

      ws.addRow({
        fecha: new Date(r.date).toLocaleDateString("es-CL"),
        rut: r.plannedGuardia?.persona.rut ?? "",
        apellido: r.plannedGuardia?.persona.lastName ?? "",
        nombre: r.plannedGuardia?.persona.firstName ?? "",
        instalacion: r.installation.name,
        puesto: r.puesto?.name ?? "",
        estado: r.attendanceStatus,
        entrada: fmtHora(r.marcacionEntrada?.timestamp ?? r.checkInAt),
        salida: fmtHora(r.marcacionSalida?.timestamp ?? r.checkOutAt),
        horas_norm: r.workedMinutes ? Math.round((r.workedMinutes / 60) * 100) / 100 : "",
        horas_extra: r.overtimeMinutes ? Math.round((r.overtimeMinutes / 60) * 100) / 100 : "",
        atraso: r.marcacionEntrada?.atrasoMinutos ?? "",
        modificada: (r.marcacionEntrada?.isModified || r.marcacionSalida?.isModified) ? "Sí" : "No",
      });
    }

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="asistencia-diaria-${from}-${to}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("[DT] Error export-excel asistencia-diaria:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Crear ruta export-pdf**

```typescript
// src/app/api/reportes/dt/asistencia-diaria/export-pdf/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { renderToBuffer } from "@react-pdf/renderer";
import { AsistenciaDiariaPdf } from "@/components/reportes-dt/AsistenciaDiariaPdf";
import React from "react";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "reportes_dt")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const { from, to, installationId } = await request.json();
    const [fy, fm, fd] = from.split("-").map(Number);
    const [ty, tm, td] = to.split("-").map(Number);

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      date: { gte: new Date(Date.UTC(fy, fm - 1, fd)), lte: new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59)) },
      deletedAt: null,
    };
    if (installationId) where.installationId = installationId;

    const records = await prisma.opsAsistenciaDiaria.findMany({
      where,
      select: {
        date: true,
        attendanceStatus: true,
        checkInAt: true,
        checkOutAt: true,
        workedMinutes: true,
        overtimeMinutes: true,
        plannedGuardia: { select: { persona: { select: { firstName: true, lastName: true, rut: true } } } },
        installation: { select: { name: true } },
        puesto: { select: { name: true } },
        marcacionEntrada: { select: { timestamp: true, isModified: true, atrasoMinutos: true } },
        marcacionSalida: { select: { timestamp: true, isModified: true } },
      },
      orderBy: [{ date: "asc" }],
    });

    const buffer = await renderToBuffer(
      React.createElement(AsistenciaDiariaPdf, { records, from, to })
    );

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="asistencia-diaria-${from}-${to}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[DT] Error export-pdf asistencia-diaria:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Crear el componente PDF**

```typescript
// src/components/reportes-dt/AsistenciaDiariaPdf.tsx
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 8, fontFamily: "Helvetica" },
  header: { marginBottom: 16 },
  title: { fontSize: 13, fontWeight: "bold", color: "#1e3a5f", marginBottom: 4 },
  subtitle: { fontSize: 8, color: "#64748b" },
  table: { marginTop: 8 },
  thead: { flexDirection: "row", backgroundColor: "#1e3a5f", padding: 4 },
  theadCell: { color: "#ffffff", fontSize: 7, fontWeight: "bold" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", padding: 3 },
  rowAlt: { backgroundColor: "#f8fafc" },
  cell: { fontSize: 7, color: "#0f172a" },
  modBadge: { fontSize: 6, color: "#d97706", backgroundColor: "#fffbeb", padding: 1, borderRadius: 2 },
  footer: { marginTop: 16, fontSize: 6, color: "#94a3b8", borderTopWidth: 0.5, borderTopColor: "#e2e8f0", paddingTop: 8 },
});

const COL_WIDTHS = ["10%", "11%", "13%", "12%", "18%", "8%", "8%", "7%", "7%", "6%"];
const HEADERS = ["Fecha", "RUT", "Apellido", "Nombre", "Instalación", "Entrada", "Salida", "H.Norm", "H.Extra", "Mod."];

function fmtHora(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" });
}

export function AsistenciaDiariaPdf({ records, from, to }: {
  records: Array<{
    date: Date;
    attendanceStatus: string;
    checkInAt: Date | null;
    checkOutAt: Date | null;
    workedMinutes: number | null;
    overtimeMinutes: number | null;
    plannedGuardia: { persona: { firstName: string; lastName: string; rut: string | null } } | null;
    installation: { name: string };
    puesto: { name: string } | null;
    marcacionEntrada: { timestamp: Date; isModified: boolean; atrasoMinutos: number | null } | null;
    marcacionSalida: { timestamp: Date; isModified: boolean } | null;
  }>;
  from: string;
  to: string;
}) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Reporte de Asistencia Diaria</Text>
          <Text style={styles.subtitle}>Res. Exenta N°38 — DT Chile · Período: {from} — {to}</Text>
        </View>
        <View style={styles.table}>
          <View style={styles.thead}>
            {HEADERS.map((h, i) => (
              <Text key={h} style={[styles.theadCell, { width: COL_WIDTHS[i] }]}>{h}</Text>
            ))}
          </View>
          {records.map((r, idx) => {
            const isModified = r.marcacionEntrada?.isModified || r.marcacionSalida?.isModified;
            return (
              <View key={idx} style={[styles.row, idx % 2 === 1 ? styles.rowAlt : {}]}>
                <Text style={[styles.cell, { width: COL_WIDTHS[0] }]}>
                  {new Date(r.date).toLocaleDateString("es-CL")}
                </Text>
                <Text style={[styles.cell, { width: COL_WIDTHS[1] }]}>{r.plannedGuardia?.persona.rut ?? ""}</Text>
                <Text style={[styles.cell, { width: COL_WIDTHS[2] }]}>{r.plannedGuardia?.persona.lastName ?? ""}</Text>
                <Text style={[styles.cell, { width: COL_WIDTHS[3] }]}>{r.plannedGuardia?.persona.firstName ?? ""}</Text>
                <Text style={[styles.cell, { width: COL_WIDTHS[4] }]}>{r.installation.name}</Text>
                <Text style={[styles.cell, { width: COL_WIDTHS[5] }]}>
                  {fmtHora(r.marcacionEntrada?.timestamp ?? r.checkInAt)}
                </Text>
                <Text style={[styles.cell, { width: COL_WIDTHS[6] }]}>
                  {fmtHora(r.marcacionSalida?.timestamp ?? r.checkOutAt)}
                </Text>
                <Text style={[styles.cell, { width: COL_WIDTHS[7] }]}>
                  {r.workedMinutes ? (r.workedMinutes / 60).toFixed(1) : "—"}
                </Text>
                <Text style={[styles.cell, { width: COL_WIDTHS[8] }]}>
                  {r.overtimeMinutes ? (r.overtimeMinutes / 60).toFixed(1) : "—"}
                </Text>
                <Text style={[isModified ? styles.modBadge : styles.cell, { width: COL_WIDTHS[9] }]}>
                  {isModified ? "MOD" : "—"}
                </Text>
              </View>
            );
          })}
        </View>
        <View style={styles.footer}>
          <Text>Generado por OPAI · {new Date().toLocaleString("es-CL")} · Conforme Res. Exenta N°38 DT Chile</Text>
        </View>
      </Page>
    </Document>
  );
}
```

- [ ] **Step 5: Crear page + ReporteDtLayout reutilizable**

```typescript
// src/components/reportes-dt/ReporteDtShell.tsx
// Componente contenedor compartido por los 4 reportes
"use client";

import { useState, ReactNode } from "react";
import { Download, FileText } from "lucide-react";

interface Props {
  title: string;
  description: string;
  filters: ReactNode;
  children: ReactNode;
  onExportExcel?: () => Promise<void>;
  onExportPdf?: () => Promise<void>;
  exporting?: boolean;
}

export function ReporteDtShell({ title, description, filters, children, onExportExcel, onExportPdf, exporting }: Props) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex gap-2">
          {onExportExcel && (
            <button
              onClick={onExportExcel}
              disabled={exporting}
              className="flex items-center gap-1.5 text-sm border border-border px-3 py-1.5 rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Excel
            </button>
          )}
          {onExportPdf && (
            <button
              onClick={onExportPdf}
              disabled={exporting}
              className="flex items-center gap-1.5 text-sm border border-border px-3 py-1.5 rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
            >
              <FileText className="w-4 h-4" />
              PDF
            </button>
          )}
        </div>
      </div>
      <div className="bg-card rounded-lg border border-border p-4">
        {filters}
      </div>
      {children}
    </div>
  );
}
```

```typescript
// src/app/(app)/reportes/dt/asistencia-diaria/page.tsx
import { PageHeader } from "@/components/opai";
import { AsistenciaDiariaClient } from "@/components/reportes-dt/AsistenciaDiariaClient";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getDefaultTenantId } from "@/lib/tenant";

export default async function AsistenciaDiariaPage() {
  const session = await auth();
  const tenantId = session?.user?.tenantId ?? (await getDefaultTenantId());
  const installations = await prisma.crmInstallation.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Asistencia Diaria" description="Res. Exenta N°38 Art. 4 — DT Chile" />
      <AsistenciaDiariaClient installations={installations} />
    </div>
  );
}
```

- [ ] **Step 6: Crear `AsistenciaDiariaClient`**

```typescript
// src/components/reportes-dt/AsistenciaDiariaClient.tsx
"use client";

import { useState, useCallback } from "react";
import { ReporteDtShell } from "./ReporteDtShell";
import { MarcacionModificadaBadge } from "@/components/ops/MarcacionModificadaBadge";
import { cn } from "@/lib/utils";

interface Installation { id: string; name: string; }

const today = new Date().toISOString().slice(0, 10);
const firstOfMonth = today.slice(0, 8) + "01";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function AsistenciaDiariaClient({ installations }: { installations: Installation[] }) {
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [installationId, setInstallationId] = useState("");
  const [records, setRecords] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [searched, setSearched] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (installationId) params.set("installationId", installationId);
      const r = await fetch(`/api/reportes/dt/asistencia-diaria?${params}`);
      const d = await r.json();
      if (d.success) setRecords(d.data);
    } catch {}
    setLoading(false);
  }, [from, to, installationId]);

  const exportExcel = async () => {
    setExporting(true);
    try {
      const r = await fetch("/api/reportes/dt/asistencia-diaria/export-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, installationId: installationId || undefined }),
      });
      const blob = await r.blob();
      downloadBlob(blob, `asistencia-diaria-${from}-${to}.xlsx`);
    } catch {}
    setExporting(false);
  };

  const exportPdf = async () => {
    setExporting(true);
    try {
      const r = await fetch("/api/reportes/dt/asistencia-diaria/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, installationId: installationId || undefined }),
      });
      const blob = await r.blob();
      downloadBlob(blob, `asistencia-diaria-${from}-${to}.pdf`);
    } catch {}
    setExporting(false);
  };

  const filters = (
    <div className="flex flex-wrap gap-3 items-end">
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Desde</label>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
          className="border border-border rounded px-2 py-1.5 text-sm bg-background" />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Hasta</label>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
          className="border border-border rounded px-2 py-1.5 text-sm bg-background" />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Instalación</label>
        <select value={installationId} onChange={(e) => setInstallationId(e.target.value)}
          className="border border-border rounded px-2 py-1.5 text-sm bg-background">
          <option value="">Todas</option>
          {installations.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
      </div>
      <button onClick={fetchData}
        className="px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
        Buscar
      </button>
    </div>
  );

  return (
    <ReporteDtShell
      title="Asistencia Diaria"
      description="Listado de marcaciones de asistencia por trabajador y fecha."
      filters={filters}
      onExportExcel={searched ? exportExcel : undefined}
      onExportPdf={searched ? exportPdf : undefined}
      exporting={exporting}
    >
      {loading ? (
        <div className="h-32 flex items-center justify-center">
          <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : searched && records.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Sin registros para el período seleccionado.</p>
      ) : records.length > 0 ? (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                {["Fecha","RUT","Apellido","Nombre","Instalación","Puesto","Estado","Entrada","Salida","H.Norm","H.Extra","Mod."].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(records as Record<string, unknown>[]).map((r, i) => {
                // API returns "plannedGuardia" (not "guardia") for OpsAsistenciaDiaria
                const g = r.plannedGuardia as Record<string, Record<string, string>> | null;
                const inst = r.installation as Record<string, string>;
                const puesto = r.puesto as Record<string, string> | null;
                const me = r.marcacionEntrada as Record<string, unknown> | null;
                const ms = r.marcacionSalida as Record<string, unknown> | null;
                const isModified = (me?.isModified as boolean) || (ms?.isModified as boolean);
                const fmtHora = (d: unknown) => d ? new Date(d as string).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" }) : "—";
                return (
                  <tr key={i} className={cn("border-b border-border/40", i % 2 === 1 && "bg-muted/20")}>
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(r.date as string).toLocaleDateString("es-CL")}</td>
                    <td className="px-3 py-2">{g?.persona.rut ?? "—"}</td>
                    <td className="px-3 py-2">{g?.persona.lastName ?? "—"}</td>
                    <td className="px-3 py-2">{g?.persona.firstName ?? "—"}</td>
                    <td className="px-3 py-2">{inst.name}</td>
                    <td className="px-3 py-2">{puesto?.name ?? "—"}</td>
                    <td className="px-3 py-2">{r.attendanceStatus as string}</td>
                    <td className="px-3 py-2 font-mono">{fmtHora(me?.timestamp ?? r.checkInAt)}</td>
                    <td className="px-3 py-2 font-mono">{fmtHora(ms?.timestamp ?? r.checkOutAt)}</td>
                    <td className="px-3 py-2">{r.workedMinutes ? ((r.workedMinutes as number) / 60).toFixed(1) : "—"}</td>
                    <td className="px-3 py-2">{r.overtimeMinutes ? ((r.overtimeMinutes as number) / 60).toFixed(1) : "—"}</td>
                    <td className="px-3 py-2">
                      {isModified && (
                        <MarcacionModificadaBadge
                          isModified={true}
                          consolidatedAt={(me?.consolidatedAt ?? ms?.consolidatedAt) as string | null}
                          opposedAt={(me?.opposedAt ?? ms?.opposedAt) as string | null}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </ReporteDtShell>
  );
}
```

- [ ] **Step 7: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "asistencia-diaria\|AsistenciaDiaria\|ReporteDt" | head -10
```

Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/reportes/dt/asistencia-diaria/ src/app/(app)/reportes/dt/asistencia-diaria/ src/components/reportes-dt/
git commit -m "feat(reportes-dt): Reporte 1 Asistencia Diaria con export Excel y PDF"
```

---

### Task 19–21: Reportes 2, 3 y 4 (Jornada Diaria, Domingos/Festivos, Modificaciones)

Los reportes 2, 3 y 4 siguen el **mismo patrón exacto** que el Reporte 1. Cada uno tiene:
- `src/app/api/reportes/dt/<nombre>/route.ts` (datos)
- `src/app/api/reportes/dt/<nombre>/export-excel/route.ts`
- `src/app/api/reportes/dt/<nombre>/export-pdf/route.ts`
- `src/app/(app)/reportes/dt/<nombre>/page.tsx`
- `src/components/reportes-dt/<Nombre>Client.tsx`
- `src/components/reportes-dt/<Nombre>Pdf.tsx`

---

### Task 19: Reporte 2 — Jornada Diaria

**Files:**
- Create: `src/app/api/reportes/dt/jornada-diaria/route.ts`
- Create: `src/app/api/reportes/dt/jornada-diaria/export-excel/route.ts`
- Create: `src/app/api/reportes/dt/jornada-diaria/export-pdf/route.ts`
- Create: `src/app/(app)/reportes/dt/jornada-diaria/page.tsx`
- Create: `src/components/reportes-dt/JornadaDiariaClient.tsx`
- Create: `src/components/reportes-dt/JornadaDiariaPdf.tsx`

- [ ] **Step 1: Crear API de datos**

Misma estructura que asistencia-diaria, pero la query agrega por guardia sumando horas:

```typescript
// src/app/api/reportes/dt/jornada-diaria/route.ts
// Igual estructura que asistencia-diaria/route.ts pero con:
// - Filtro: agrupa por guardiaId para el período
// - SELECT adicional: suma workedMinutes, overtimeMinutes
// - Incluye puesto.shiftStart / puesto.shiftEnd para jornada contractual

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "reportes_dt")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const from = sp.get("from"); const to = sp.get("to");
    const installationId = sp.get("installationId");
    if (!from || !to) return NextResponse.json({ success: false, error: "from/to requeridos" }, { status: 400 });

    const [fy, fm, fd] = from.split("-").map(Number);
    const [ty, tm, td] = to.split("-").map(Number);
    const startDate = new Date(Date.UTC(fy, fm - 1, fd));
    const endDate = new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59));

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      date: { gte: startDate, lte: endDate },
      deletedAt: null,
      attendanceStatus: "asistio",
    };
    if (installationId) where.installationId = installationId;

    const records = await prisma.opsAsistenciaDiaria.findMany({
      where,
      select: {
        date: true,
        workedMinutes: true,
        plannedMinutes: true,
        overtimeMinutes: true,
        checkInAt: true,
        checkOutAt: true,
        plannedGuardia: { select: { id: true, persona: { select: { firstName: true, lastName: true, rut: true } } } },
        installation: { select: { name: true } },
        puesto: { select: { name: true, shiftStart: true, shiftEnd: true } },
        marcacionEntrada: { select: { timestamp: true, atrasoMinutos: true, isModified: true } },
        marcacionSalida: { select: { timestamp: true, isModified: true } },
      },
      orderBy: [{ date: "asc" }, { plannedGuardia: { persona: { lastName: "asc" } } }],
    });

    return NextResponse.json({ success: true, data: records });
  } catch (error) {
    console.error("[DT] Error jornada-diaria:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Crear export-excel (mismo patrón, columnas diferentes)**

Las columnas del Excel para jornada-diaria son:
`Fecha | RUT | Apellido | Nombre | Instalación | Puesto | Jornada Contrat. | Entrada | Salida | Horas Trabajadas | Horas Extra 50% | Atraso (min) | Modificada`

Usar exactamente el mismo esqueleto de `asistencia-diaria/export-excel/route.ts` cambiando: URL de endpoint, columnas, y cálculo de horas.

- [ ] **Step 3: Crear export-pdf**

Mismo patrón que `AsistenciaDiariaPdf`, títulos distintos.

- [ ] **Step 4: Crear page + client**

```typescript
// src/app/(app)/reportes/dt/jornada-diaria/page.tsx
// Igual a asistencia-diaria/page.tsx pero con:
// title="Jornada Diaria" description="Res. Exenta N°38 Art. 6 — DT Chile"
// client=JornadaDiariaClient
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/reportes/dt/jornada-diaria/ src/app/(app)/reportes/dt/jornada-diaria/ src/components/reportes-dt/JornadaDiaria*
git commit -m "feat(reportes-dt): Reporte 2 Jornada Diaria con export Excel y PDF"
```

---

### Task 20: Reporte 3 — Domingos y Festivos

**Files:**
- Create: `src/app/api/reportes/dt/domingos-festivos/route.ts`
- Create: `src/app/api/reportes/dt/domingos-festivos/export-excel/route.ts`
- Create: `src/app/api/reportes/dt/domingos-festivos/export-pdf/route.ts`
- Create: `src/app/(app)/reportes/dt/domingos-festivos/page.tsx`
- Create: `src/components/reportes-dt/DomingosFestivosClient.tsx`
- Create: `src/components/reportes-dt/DomingosFestivosPdf.tsx`

- [ ] **Step 1: Crear API de datos**

```typescript
// src/app/api/reportes/dt/domingos-festivos/route.ts
// DIFERENCIA vs otros reportes:
// - WHERE adicional: filtrar por día domingo (dayOfWeek=0) O fecha en PayrollHoliday

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { getDay } from "date-fns";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "reportes_dt")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const from = sp.get("from"); const to = sp.get("to");
    const installationId = sp.get("installationId");
    if (!from || !to) return NextResponse.json({ success: false, error: "from/to requeridos" }, { status: 400 });

    const [fy, fm, fd] = from.split("-").map(Number);
    const [ty, tm, td] = to.split("-").map(Number);
    const startDate = new Date(Date.UTC(fy, fm - 1, fd));
    const endDate = new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59));

    // Obtener feriados del período
    const holidays = await prisma.payrollHoliday.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      select: { date: true },
    });
    const holidaySet = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      date: { gte: startDate, lte: endDate },
      deletedAt: null,
      attendanceStatus: "asistio",
    };
    if (installationId) where.installationId = installationId;

    const records = await prisma.opsAsistenciaDiaria.findMany({
      where,
      select: {
        date: true,
        workedMinutes: true,
        checkInAt: true,
        checkOutAt: true,
        plannedGuardia: { select: { id: true, persona: { select: { firstName: true, lastName: true, rut: true } } } },
        installation: { select: { name: true } },
        puesto: { select: { name: true } },
        marcacionEntrada: { select: { timestamp: true } },
        marcacionSalida: { select: { timestamp: true } },
      },
      orderBy: [{ date: "asc" }],
    });

    // Filtrar solo domingos y feriados
    const filtered = records.filter((r) => {
      const dateStr = r.date.toISOString().slice(0, 10);
      const isSunday = getDay(r.date) === 0;
      const isHoliday = holidaySet.has(dateStr);
      return isSunday || isHoliday;
    });

    const data = filtered.map((r) => ({
      ...r,
      date: r.date.toISOString().slice(0, 10),
      esDomingo: getDay(r.date) === 0,
      esFeriado: holidaySet.has(r.date.toISOString().slice(0, 10)),
      checkInAt: r.checkInAt?.toISOString() ?? null,
      checkOutAt: r.checkOutAt?.toISOString() ?? null,
      marcacionEntrada: r.marcacionEntrada
        ? { timestamp: r.marcacionEntrada.timestamp.toISOString() } : null,
      marcacionSalida: r.marcacionSalida
        ? { timestamp: r.marcacionSalida.timestamp.toISOString() } : null,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[DT] Error domingos-festivos:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Crear export-excel con columna "Tipo Día" (Domingo / Feriado / Dom+Feriado)**

- [ ] **Step 3: Crear export-pdf**

- [ ] **Step 4: Crear page + client**

Client similar a AsistenciaDiariaClient. Columnas adicionales: "Tipo Día".

- [ ] **Step 5: Commit**

```bash
git add src/app/api/reportes/dt/domingos-festivos/ src/app/(app)/reportes/dt/domingos-festivos/ src/components/reportes-dt/DomingosFestivos*
git commit -m "feat(reportes-dt): Reporte 3 Domingos y Festivos con export Excel y PDF"
```

---

### Task 21: Reporte 4 — Modificaciones de Turnos

**Files:**
- Create: `src/app/api/reportes/dt/modificaciones-turnos/route.ts`
- Create: `src/app/api/reportes/dt/modificaciones-turnos/export-excel/route.ts`
- Create: `src/app/api/reportes/dt/modificaciones-turnos/export-pdf/route.ts`
- Create: `src/app/(app)/reportes/dt/modificaciones-turnos/page.tsx`
- Create: `src/components/reportes-dt/ModificacionesTurnosClient.tsx`
- Create: `src/components/reportes-dt/ModificacionesTurnosPdf.tsx`

- [ ] **Step 1: Crear API de datos**

```typescript
// src/app/api/reportes/dt/modificaciones-turnos/route.ts
// DIFERENCIA vs otros:
// - Origen: OpsMarcacion (no OpsAsistenciaDiaria)
// - WHERE: isModified = true
// - Incluye: modifiedAt, modificationReason, modifiedBy
// - JOIN: AuditLog para mostrar timestamp original

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "reportes_dt")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const from = sp.get("from"); const to = sp.get("to");
    const installationId = sp.get("installationId");
    if (!from || !to) return NextResponse.json({ success: false, error: "from/to requeridos" }, { status: 400 });

    const [fy, fm, fd] = from.split("-").map(Number);
    const [ty, tm, td] = to.split("-").map(Number);
    const startDate = new Date(Date.UTC(fy, fm - 1, fd));
    const endDate = new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59));

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      isModified: true,
      modifiedAt: { gte: startDate, lte: endDate },
      deletedAt: null,
    };
    if (installationId) where.installationId = installationId;

    const marcaciones = await prisma.opsMarcacion.findMany({
      where,
      select: {
        id: true,
        tipo: true,
        timestamp: true,
        modifiedAt: true,
        modificationReason: true,
        modifiedBy: true,
        opposedAt: true,
        consolidatedAt: true,
        plannedGuardia: { select: { persona: { select: { firstName: true, lastName: true, rut: true } } } },
        installation: { select: { name: true } },
      },
      orderBy: { modifiedAt: "desc" },
    });

    // Recuperar timestamps originales desde AuditLog
    const marcacionIds = marcaciones.map((m) => m.id);
    // AuditLog: modelo es "AuditLog" (prisma.auditLog), campo es "entity" (no entityType)
    // El valor "entity" usado por createOpsAuditLog para marcaciones es "ops_marcacion"
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entity: "ops_marcacion",
        entityId: { in: marcacionIds },
        action: "ops.marcacion.modified",
      },
      select: { entityId: true, details: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    // Deduplicate: keep last entry per entityId
    const auditLatest = new Map<string, typeof auditLogs[0]>();
    for (const a of auditLogs) {
      if (a.entityId && !auditLatest.has(a.entityId)) auditLatest.set(a.entityId, a);
    }
    const data = marcaciones.map((m) => {
      const audit = auditLatest.get(m.id);
      const details = audit?.details as Record<string, unknown> | null;
      const originalTimestamp = details?.changes?.timestamp?.from ?? null;
      return {
        id: m.id,
        tipo: m.tipo,
        timestampActual: m.timestamp.toISOString(),
        timestampOriginal: originalTimestamp,
        modifiedAt: m.modifiedAt?.toISOString() ?? null,
        modificationReason: m.modificationReason,
        modifiedBy: m.modifiedBy,
        opposedAt: m.opposedAt?.toISOString() ?? null,
        consolidatedAt: m.consolidatedAt?.toISOString() ?? null,
        guardiaName: `${m.guardia.persona.firstName} ${m.guardia.persona.lastName}`,
        guardiaRut: m.guardia.persona.rut ?? "",
        installationName: m.installation.name,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[DT] Error modificaciones-turnos:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Crear export-excel**

Columnas: `Tipo | Instalación | RUT | Apellido | Nombre | Marca Original | Marca Actual | Modificada el | Motivo | Modificado por | Estado`

- [ ] **Step 3: Crear export-pdf**

Orientación landscape. Columnas: Tipo, Instalación, Trabajador, Orig. → Nuevo, Motivo, Estado.

- [ ] **Step 4: Crear page + client**

Client muestra tabla con badge de estado por cada modificación usando `MarcacionModificadaBadge`.

- [ ] **Step 5: Commit final**

```bash
git add src/app/api/reportes/dt/modificaciones-turnos/ src/app/(app)/reportes/dt/modificaciones-turnos/ src/components/reportes-dt/ModificacionesTurnos*
git commit -m "feat(reportes-dt): Reporte 4 Modificaciones de Turnos con export Excel y PDF"
```

---

## Verificación Final del Sprint 2

- [ ] **TypeScript limpio**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```

Expected: 0 errores.

- [ ] **Build exitoso**

```bash
npx next build 2>&1 | tail -20
```

Expected: Build completo sin errores.

- [ ] **Smoke test manual en dev**

```bash
npx next dev
```

Verificar:
1. `/personas/guardias/[id]` → tab "Marcaciones" visible y carga datos
2. `/crm/installations/[id]` → tab "Marcaciones" visible y carga datos
3. `/marcacion/oposicion/token-invalido` → muestra "Link inválido"
4. `/reportes/dt` → visible para roles `rrhh` y `jefe_operaciones`
5. `/reportes/dt/asistencia-diaria` → filtros, tabla, botones Excel/PDF funcionan
6. PATCH `/api/ops/marcacion/[id]` → devuelve `oppositionToken` en response

---

## Resumen Completo Sprint 2

| Parte | Tasks | Estado |
|-------|-------|--------|
| Foundation (migración, permisos, badge, middleware) | 1–4 | Ver part1.md |
| Oposición (email, PATCH, API pública, página, cron) | 5–9 | Ver part1.md |
| Tab guardia historial (API + component + wiring) | 11–13 | Este archivo |
| Tab instalación historial (API + component + wiring) | 14–16 | Este archivo |
| Reportes DT (nav + 4 reportes) | 17–21 | Este archivo |
