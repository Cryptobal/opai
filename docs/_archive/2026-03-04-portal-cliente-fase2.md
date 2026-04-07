# Portal Cliente — Fase 2: Operaciones

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add operational sections: Rondas, Posta, Tickets, Chat grupos, Alertas config

**Architecture:** All portal APIs use `getClientSession(request)` from `@/lib/portal-chat-auth` (reads `x-contact-id`, `x-tenant-id`, `x-account-id` headers set by the portal middleware). All queries filter by `accountId` from session. UI components go in `src/components/portal/cliente/`.

**Session note:** The existing portal API routes use two patterns:
1. **Header-based** (preferred for new routes): `getClientSession(request)` from `@/lib/portal-chat-auth` — reads `x-contact-id`, `x-tenant-id`, `x-account-id` headers
2. **Query-param fallback** (legacy, used in `summary`, `activity`): accepts `installationId` + `tenantId` as query params with no auth check

All new routes in this plan **must** use pattern 1 (`getClientSession`) for proper auth, then derive `installationId`s from `session.accountId` via a `CrmInstallation` lookup when needed.

**Tech Stack:** Next.js 15, Prisma, Tailwind + shadcn, Lucide React, Recharts

---

## Task 1: Rondas API

**Files:**
- `src/app/api/portal/cliente/rondas/route.ts`
- `src/app/api/portal/cliente/rondas/[id]/route.ts`

### `src/app/api/portal/cliente/rondas/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientSession } from "@/lib/portal-chat-auth";

export async function GET(request: NextRequest) {
  try {
    const session = getClientSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const installationId = request.nextUrl.searchParams.get("installationId");
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");

    // Verify the requested installationId belongs to this account
    if (installationId) {
      const inst = await prisma.crmInstallation.findFirst({
        where: { id: installationId, accountId: session.accountId, tenantId: session.tenantId },
        select: { id: true },
      });
      if (!inst) {
        return NextResponse.json({ success: false, error: "Instalacion no encontrada" }, { status: 404 });
      }
    } else {
      // Fall back to all installations for the account
      const installations = await prisma.crmInstallation.findMany({
        where: { accountId: session.accountId, tenantId: session.tenantId },
        select: { id: true },
      });
      // Use installationIds array in where clause (see below)
    }

    const where: Record<string, unknown> = {
      tenantId: session.tenantId,
      ...(installationId ? { installationId } : {
        installationId: {
          in: (await prisma.crmInstallation.findMany({
            where: { accountId: session.accountId, tenantId: session.tenantId },
            select: { id: true },
          })).map(i => i.id),
        },
      }),
      ...(from ? { scheduledAt: { gte: new Date(from) } } : {}),
      ...(to ? { scheduledAt: { ...(from ? { gte: new Date(from) } : {}), lte: new Date(to) } } : {}),
    };

    const ejecuciones = await prisma.opsRondaEjecucion.findMany({
      where,
      select: {
        id: true,
        installationId: true,
        status: true,
        scheduledAt: true,
        startedAt: true,
        completedAt: true,
        checkpointsTotal: true,
        checkpointsCompletados: true,
        porcentajeCompletado: true,
        trustScore: true,
        durationMinutes: true,
        notes: true,
        guardia: {
          select: {
            persona: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { scheduledAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ success: true, data: ejecuciones });
  } catch (error) {
    console.error("[Portal Cliente] rondas", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
```

### `src/app/api/portal/cliente/rondas/[id]/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientSession } from "@/lib/portal-chat-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = getClientSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const ejecucion = await prisma.opsRondaEjecucion.findUnique({
      where: { id: params.id },
      include: {
        marcaciones: {
          select: {
            id: true,
            checkpointId: true,
            timestamp: true,
            lat: true,
            lng: true,
            geoValidada: true,
            fotoEvidenciaUrl: true,
            note: true,
            status: true,
          },
          orderBy: { timestamp: "asc" },
        },
        incidentes: {
          select: {
            id: true,
            tipo: true,
            descripcion: true,
            fotoUrl: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
        guardia: {
          select: {
            persona: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!ejecucion) {
      return NextResponse.json({ success: false, error: "No encontrado" }, { status: 404 });
    }

    // Verify the installation belongs to this account
    const inst = await prisma.crmInstallation.findFirst({
      where: { id: ejecucion.installationId, accountId: session.accountId },
      select: { id: true },
    });
    if (!inst) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: ejecucion });
  } catch (error) {
    console.error("[Portal Cliente] rondas/[id]", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
```

**Commit:**
```bash
git add src/app/api/portal/cliente/rondas/
git commit -m "feat(portal-cliente): add rondas API (list + detail with checkpoints)"
```

---

## Task 2: Rondas UI

**Files:**
- `src/components/portal/cliente/PortalRondas.tsx`
- `src/app/portal/cliente/PortalClienteClient.tsx` (add `rondas` case to `renderSection`)

### `src/components/portal/cliente/PortalRondas.tsx`

```tsx
'use client'

import { useEffect, useState } from 'react'
import { MapPin, ChevronRight, CheckCircle2, XCircle, Clock, AlertTriangle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ClienteSession } from '@/lib/portal-cliente'

interface Ejecucion {
  id: string
  installationId: string
  status: string
  scheduledAt: string
  startedAt: string | null
  completedAt: string | null
  checkpointsTotal: number
  checkpointsCompletados: number
  porcentajeCompletado: number
  trustScore: number
  durationMinutes: number | null
  notes: string | null
  guardia?: { persona: { firstName: string; lastName: string } }
}

interface EjecucionDetail extends Ejecucion {
  marcaciones: Array<{
    id: string; checkpointId: string; timestamp: string
    lat: number | null; lng: number | null; geoValidada: boolean
    fotoEvidenciaUrl: string | null; note: string | null; status: string
  }>
  incidentes: Array<{
    id: string; tipo: string; descripcion: string
    fotoUrl: string | null; status: string; createdAt: string
  }>
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pendiente:  { label: 'Pendiente',   color: 'bg-zinc-800 text-zinc-400',    icon: Clock },
  en_curso:   { label: 'En curso',    color: 'bg-yellow-500/20 text-yellow-400', icon: Clock },
  completada: { label: 'Completada',  color: 'bg-emerald-500/20 text-emerald-400', icon: CheckCircle2 },
  incompleta: { label: 'Incompleta',  color: 'bg-amber-500/20 text-amber-400', icon: AlertTriangle },
  fallida:    { label: 'Fallida',     color: 'bg-red-500/20 text-red-400',   icon: XCircle },
}

interface Props {
  session: ClienteSession
  selectedInstallation: string
}

export function PortalRondas({ session, selectedInstallation }: Props) {
  const [rondas, setRondas] = useState<Ejecucion[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<EjecucionDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/portal/cliente/rondas?installationId=${selectedInstallation}`, {
      headers: {
        'x-contact-id': session.contactId,
        'x-tenant-id': session.tenantId,
        'x-account-id': session.accountId,
      },
    })
      .then(r => r.json())
      .then(j => { if (j.success) setRondas(j.data) })
      .finally(() => setLoading(false))
  }, [selectedInstallation, session])

  async function loadDetail(id: string) {
    setLoadingDetail(true)
    const res = await fetch(`/api/portal/cliente/rondas/${id}`, {
      headers: {
        'x-contact-id': session.contactId,
        'x-tenant-id': session.tenantId,
        'x-account-id': session.accountId,
      },
    })
    const json = await res.json()
    if (json.success) setSelected(json.data)
    setLoadingDetail(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    )
  }

  // Detail view
  if (selected) {
    const cfg = STATUS_CONFIG[selected.status] ?? STATUS_CONFIG.pendiente
    const Icon = cfg.icon
    return (
      <div className="max-w-lg mx-auto px-4 py-4 pb-24">
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 mb-4"
        >
          ← Volver
        </button>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full', cfg.color)}>
              <Icon className="h-3.5 w-3.5" /> {cfg.label}
            </span>
            <span className="text-xs text-zinc-500">
              {new Date(selected.scheduledAt).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-lg font-bold text-white">{selected.porcentajeCompletado}%</p>
              <p className="text-[10px] text-zinc-500">Completado</p>
            </div>
            <div>
              <p className="text-lg font-bold text-white">{selected.trustScore}</p>
              <p className="text-[10px] text-zinc-500">Trust Score</p>
            </div>
            <div>
              <p className="text-lg font-bold text-white">{selected.durationMinutes ?? '--'}</p>
              <p className="text-[10px] text-zinc-500">Minutos</p>
            </div>
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
              <span>Checkpoints</span>
              <span>{selected.checkpointsCompletados}/{selected.checkpointsTotal}</span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-500 rounded-full transition-all"
                style={{ width: `${selected.porcentajeCompletado}%` }}
              />
            </div>
          </div>
        </div>

        {selected.incidentes.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Incidentes</h3>
            <div className="space-y-2">
              {selected.incidentes.map(inc => (
                <div key={inc.id} className="bg-zinc-900 border border-red-900/40 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-red-400">{inc.tipo.replace(/_/g, ' ')}</span>
                    <span className="text-[10px] text-zinc-500">{new Date(inc.createdAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-xs text-zinc-300">{inc.descripcion}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Checkpoints ({selected.marcaciones.length})</h3>
          <div className="space-y-1.5">
            {selected.marcaciones.map(m => (
              <div key={m.id} className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
                <div className={cn('w-2 h-2 rounded-full flex-shrink-0', m.status === 'ok' ? 'bg-emerald-400' : 'bg-amber-400')} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-300 truncate">{m.note || 'Sin nota'}</p>
                  <p className="text-[10px] text-zinc-600">{m.geoValidada ? 'GPS validado' : 'GPS no validado'}</p>
                </div>
                <span className="text-[10px] text-zinc-500 flex-shrink-0">
                  {new Date(m.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // List view
  return (
    <div className="max-w-lg mx-auto px-4 py-4 pb-24">
      <div className="flex items-center gap-2 mb-4">
        <MapPin className="h-4 w-4 text-teal-400" />
        <h2 className="text-base font-semibold">Rondas</h2>
        <span className="text-xs text-zinc-500 ml-auto">{rondas.length} registros</span>
      </div>

      {rondas.length === 0 ? (
        <div className="text-center py-12 text-zinc-600 text-sm">Sin rondas registradas</div>
      ) : (
        <div className="space-y-2">
          {rondas.map(r => {
            const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.pendiente
            const Icon = cfg.icon
            return (
              <button
                key={r.id}
                onClick={() => loadDetail(r.id)}
                disabled={loadingDetail}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 text-left hover:border-zinc-700 transition-colors active:bg-zinc-800"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full', cfg.color)}>
                    <Icon className="h-3 w-3" /> {cfg.label}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-zinc-500">
                      {new Date(r.scheduledAt).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-zinc-600" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex justify-between text-[10px] text-zinc-500 mb-0.5">
                      <span>{r.checkpointsCompletados}/{r.checkpointsTotal} checkpoints</span>
                      <span>{r.porcentajeCompletado}%</span>
                    </div>
                    <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-teal-500 rounded-full"
                        style={{ width: `${r.porcentajeCompletado}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-white">{r.trustScore}</p>
                    <p className="text-[10px] text-zinc-600">trust</p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

### Wire up in `PortalClienteClient.tsx`

In `renderSection()`, add the `rondas` case before `default`:

```tsx
// Add import at top:
import { PortalRondas } from "@/components/portal/cliente/PortalRondas";

// In renderSection() switch:
case "rondas":
  return (
    <PortalRondas
      session={session}
      selectedInstallation={selectedInstallation}
    />
  );
```

**Commit:**
```bash
git add src/components/portal/cliente/PortalRondas.tsx src/app/portal/cliente/PortalClienteClient.tsx
git commit -m "feat(portal-cliente): add Rondas UI with list + detail view"
```

---

## Task 3: Posta API + UI

**Files:**
- `src/app/api/portal/cliente/posta/route.ts`
- `src/components/portal/cliente/PortalPosta.tsx`
- `src/app/portal/cliente/PortalClienteClient.tsx` (add `posta` case — note: `posta` is not yet in `PortalSection` type; check if it needs adding to `PortalClienteNav.tsx`)

**Note on schema:** `OpsControlNocturno` does not have a direct `installationId`. The link is through `OpsControlNocturnoInstalacion.installationId`. Filter by joining through that relation. Also note `PortalSection` type does not currently include `'posta'` — it would need to be added to `PortalClienteNav.tsx` if Posta gets its own nav item; alternatively it can be surfaced as a tab inside the Rondas section.

### `src/app/api/portal/cliente/posta/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientSession } from "@/lib/portal-chat-auth";

export async function GET(request: NextRequest) {
  try {
    const session = getClientSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const installationId = request.nextUrl.searchParams.get("installationId");
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");

    // Resolve installation IDs for this account
    const installations = await prisma.crmInstallation.findMany({
      where: {
        accountId: session.accountId,
        tenantId: session.tenantId,
        ...(installationId ? { id: installationId } : {}),
      },
      select: { id: true, name: true },
    });

    if (installations.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const installationIds = installations.map(i => i.id);
    const installationNameMap = new Map(installations.map(i => [i.id, i.name]));

    // Find OpsControlNocturnoInstalacion rows that match, then get parent OpsControlNocturno
    const cnInstalaciones = await prisma.opsControlNocturnoInstalacion.findMany({
      where: {
        installationId: { in: installationIds },
        ...(from || to ? {
          controlNocturno: {
            date: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          },
        } : {}),
      },
      select: {
        id: true,
        installationId: true,
        installationName: true,
        guardiasRequeridos: true,
        guardiasPresentes: true,
        statusInstalacion: true,
        notes: true,
        controlNocturno: {
          select: {
            id: true,
            date: true,
            centralOperatorName: true,
            status: true,
            generalNotes: true,
          },
        },
      },
      orderBy: { controlNocturno: { date: "desc" } },
      take: 60,
    });

    // Group by date
    const byDate: Record<string, typeof cnInstalaciones> = {}
    for (const row of cnInstalaciones) {
      const dateKey = row.controlNocturno.date.toISOString().slice(0, 10)
      if (!byDate[dateKey]) byDate[dateKey] = []
      byDate[dateKey].push(row)
    }

    const data = Object.entries(byDate).map(([date, rows]) => ({
      date,
      registros: rows.map(r => ({
        id: r.id,
        installationId: r.installationId,
        installationName: r.installationId
          ? (installationNameMap.get(r.installationId) ?? r.installationName)
          : r.installationName,
        guardiasRequeridos: r.guardiasRequeridos,
        guardiasPresentes: r.guardiasPresentes,
        statusInstalacion: r.statusInstalacion,
        notes: r.notes,
        controlId: r.controlNocturno.id,
        centralOperator: r.controlNocturno.centralOperatorName,
        controlStatus: r.controlNocturno.status,
        generalNotes: r.controlNocturno.generalNotes,
      })),
    }))

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Portal Cliente] posta", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
```

### `src/components/portal/cliente/PortalPosta.tsx`

```tsx
'use client'

import { useEffect, useState } from 'react'
import { BookOpen, Loader2, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ClienteSession } from '@/lib/portal-cliente'

interface PostaRegistro {
  id: string
  installationId: string | null
  installationName: string
  guardiasRequeridos: number
  guardiasPresentes: number
  statusInstalacion: string
  notes: string | null
  centralOperator: string
  controlStatus: string
  generalNotes: string | null
}

interface PostaDay {
  date: string
  registros: PostaRegistro[]
}

const STATUS_INSTALACION_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  normal:      { label: 'Normal',   color: 'bg-emerald-500/20 text-emerald-400', icon: CheckCircle2 },
  novedad:     { label: 'Novedad',  color: 'bg-amber-500/20 text-amber-400',    icon: AlertTriangle },
  critico:     { label: 'Critico',  color: 'bg-red-500/20 text-red-400',         icon: XCircle },
  no_aplica:   { label: 'N/A',      color: 'bg-zinc-800 text-zinc-500',          icon: CheckCircle2 },
}

interface Props {
  session: ClienteSession
  selectedInstallation: string
}

export function PortalPosta({ session, selectedInstallation }: Props) {
  const [days, setDays] = useState<PostaDay[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/portal/cliente/posta?installationId=${selectedInstallation}`, {
      headers: {
        'x-contact-id': session.contactId,
        'x-tenant-id': session.tenantId,
        'x-account-id': session.accountId,
      },
    })
      .then(r => r.json())
      .then(j => { if (j.success) setDays(j.data) })
      .finally(() => setLoading(false))
  }, [selectedInstallation, session])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-4 pb-24">
      <div className="flex items-center gap-2 mb-4">
        <BookOpen className="h-4 w-4 text-teal-400" />
        <h2 className="text-base font-semibold">Bitacora de Posta</h2>
        <span className="text-xs text-zinc-500 ml-auto">{days.length} dias</span>
      </div>

      {days.length === 0 ? (
        <div className="text-center py-12 text-zinc-600 text-sm">Sin registros de posta</div>
      ) : (
        <div className="space-y-4">
          {days.map(day => (
            <div key={day.date}>
              <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                {new Date(day.date + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: '2-digit', month: 'long' })}
              </p>
              <div className="space-y-2">
                {day.registros.map(r => {
                  const cfg = STATUS_INSTALACION_CONFIG[r.statusInstalacion] ?? STATUS_INSTALACION_CONFIG.normal
                  const Icon = cfg.icon
                  return (
                    <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-sm font-medium text-white">{r.installationName}</p>
                        <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0', cfg.color)}>
                          <Icon className="h-3 w-3" /> {cfg.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-[11px] text-zinc-400 mb-2">
                        <span>Guardias: {r.guardiasPresentes}/{r.guardiasRequeridos}</span>
                        <span>Central: {r.centralOperator}</span>
                      </div>
                      {r.notes && (
                        <p className="text-xs text-zinc-400 border-t border-zinc-800 pt-2 mt-2">{r.notes}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

**Wire up in `PortalClienteClient.tsx`:** Add `'posta'` to `PortalSection` type in `PortalClienteNav.tsx` (add it to the union) or surface Posta as a sub-tab inside Rondas. To add as its own nav item:

1. In `PortalClienteNav.tsx`, add `'posta'` to the `PortalSection` union and add an entry to `ALL_NAV_ITEMS`:
```tsx
{ id: 'posta', label: 'Bitacora', icon: BookOpen, configKey: 'posta' },
```

2. In `PortalClienteClient.tsx`, add the case:
```tsx
import { PortalPosta } from "@/components/portal/cliente/PortalPosta";
// ...
case "posta":
  return <PortalPosta session={session} selectedInstallation={selectedInstallation} />;
```

**Commit:**
```bash
git add src/app/api/portal/cliente/posta/ src/components/portal/cliente/PortalPosta.tsx \
  src/components/portal/cliente/PortalClienteNav.tsx src/app/portal/cliente/PortalClienteClient.tsx
git commit -m "feat(portal-cliente): add Posta/Bitacora API and UI"
```

---

## Task 4: Tickets API

**Files:**
- `src/app/api/portal/cliente/tickets/route.ts`
- `src/app/api/portal/cliente/tickets/[id]/route.ts`
- `src/app/api/portal/cliente/tickets/[id]/comments/route.ts`

**Schema notes:**
- `OpsTicket.code` is auto-assigned; generate with format `TKT-YYYYMMDD-XXXXX`
- `OpsTicket.assignedTeam` is required — default to `'operaciones'` for portal-created tickets
- `OpsTicket.reportedBy` stores a string (contact name or contactId)
- `OpsTicketComment.userId` stores a string (contactId works here)

### `src/app/api/portal/cliente/tickets/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientSession } from "@/lib/portal-chat-auth";

export async function GET(request: NextRequest) {
  try {
    const session = getClientSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const installationId = request.nextUrl.searchParams.get("installationId");
    const status = request.nextUrl.searchParams.get("status");

    const installations = await prisma.crmInstallation.findMany({
      where: { accountId: session.accountId, tenantId: session.tenantId },
      select: { id: true },
    });
    const installationIds = installations.map(i => i.id);

    const tickets = await prisma.opsTicket.findMany({
      where: {
        tenantId: session.tenantId,
        installationId: installationId
          ? installationId
          : { in: installationIds },
        ...(status ? { status } : {}),
      },
      select: {
        id: true,
        code: true,
        status: true,
        priority: true,
        title: true,
        description: true,
        installationId: true,
        source: true,
        createdAt: true,
        slaDueAt: true,
        resolvedAt: true,
        ticketType: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ success: true, data: tickets });
  } catch (error) {
    console.error("[Portal Cliente] tickets GET", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getClientSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { installationId, title, description, priority = "p3" } = body;

    if (!title?.trim()) {
      return NextResponse.json({ success: false, error: "Titulo requerido" }, { status: 400 });
    }

    // Verify installation belongs to account (if provided)
    if (installationId) {
      const inst = await prisma.crmInstallation.findFirst({
        where: { id: installationId, accountId: session.accountId, tenantId: session.tenantId },
        select: { id: true },
      });
      if (!inst) {
        return NextResponse.json({ success: false, error: "Instalacion no autorizada" }, { status: 403 });
      }
    }

    // Generate code
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "")
    const rand = Math.random().toString(36).toUpperCase().slice(2, 7)
    const code = `TKT-${datePart}-${rand}`

    const ticket = await prisma.opsTicket.create({
      data: {
        tenantId: session.tenantId,
        code,
        title: title.trim(),
        description: description?.trim() ?? null,
        priority,
        status: "open",
        assignedTeam: "operaciones",
        source: "portal_cliente",
        reportedBy: session.contactId,
        installationId: installationId ?? null,
      },
    });

    return NextResponse.json({ success: true, data: ticket }, { status: 201 });
  } catch (error) {
    console.error("[Portal Cliente] tickets POST", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
```

### `src/app/api/portal/cliente/tickets/[id]/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientSession } from "@/lib/portal-chat-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = getClientSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const ticket = await prisma.opsTicket.findUnique({
      where: { id: params.id },
      include: {
        ticketType: { select: { id: true, name: true, slug: true } },
        comments: {
          where: { isInternal: false },
          orderBy: { createdAt: "asc" },
          select: { id: true, userId: true, body: true, isInternal: true, createdAt: true },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json({ success: false, error: "No encontrado" }, { status: 404 });
    }

    // Verify installation belongs to account
    if (ticket.installationId) {
      const inst = await prisma.crmInstallation.findFirst({
        where: { id: ticket.installationId, accountId: session.accountId },
        select: { id: true },
      });
      if (!inst) {
        return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
      }
    } else if (ticket.tenantId !== session.tenantId) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: ticket });
  } catch (error) {
    console.error("[Portal Cliente] tickets/[id] GET", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
```

### `src/app/api/portal/cliente/tickets/[id]/comments/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientSession } from "@/lib/portal-chat-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = getClientSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { body: commentBody } = await request.json();
    if (!commentBody?.trim()) {
      return NextResponse.json({ success: false, error: "Comentario requerido" }, { status: 400 });
    }

    // Verify ticket access
    const ticket = await prisma.opsTicket.findUnique({
      where: { id: params.id },
      select: { tenantId: true, installationId: true },
    });
    if (!ticket || ticket.tenantId !== session.tenantId) {
      return NextResponse.json({ success: false, error: "No encontrado" }, { status: 404 });
    }

    const comment = await prisma.opsTicketComment.create({
      data: {
        ticketId: params.id,
        userId: session.contactId,
        body: commentBody.trim(),
        isInternal: false,
      },
    });

    return NextResponse.json({ success: true, data: comment }, { status: 201 });
  } catch (error) {
    console.error("[Portal Cliente] tickets/[id]/comments POST", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
```

**Commit:**
```bash
git add src/app/api/portal/cliente/tickets/
git commit -m "feat(portal-cliente): add Tickets API (CRUD + comments)"
```

---

## Task 5: Tickets UI

**Files:**
- `src/components/portal/cliente/PortalTickets.tsx`
- `src/components/portal/cliente/PortalCreateTicket.tsx`
- `src/app/portal/cliente/PortalClienteClient.tsx` (add `tickets` case)

### `src/components/portal/cliente/PortalTickets.tsx`

```tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Ticket, Plus, ChevronRight, Loader2, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ClienteSession } from '@/lib/portal-cliente'
import { PortalCreateTicket } from './PortalCreateTicket'

interface TicketItem {
  id: string; code: string; status: string; priority: string
  title: string; description: string | null; installationId: string | null
  createdAt: string; slaDueAt: string | null; resolvedAt: string | null
  ticketType: { id: string; name: string; slug: string } | null
}

interface TicketDetail extends TicketItem {
  comments: Array<{ id: string; userId: string; body: string; createdAt: string }>
}

type StatusFilter = 'all' | 'open' | 'in_progress' | 'resolved' | 'closed'

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  open:        { label: 'Abierto',      color: 'bg-blue-500/20 text-blue-400' },
  in_progress: { label: 'En progreso',  color: 'bg-yellow-500/20 text-yellow-400' },
  pending:     { label: 'Pendiente',    color: 'bg-zinc-700 text-zinc-400' },
  resolved:    { label: 'Resuelto',     color: 'bg-emerald-500/20 text-emerald-400' },
  closed:      { label: 'Cerrado',      color: 'bg-zinc-800 text-zinc-500' },
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  p1: { label: 'P1', color: 'bg-red-500/20 text-red-400' },
  p2: { label: 'P2', color: 'bg-orange-500/20 text-orange-400' },
  p3: { label: 'P3', color: 'bg-zinc-700 text-zinc-400' },
}

const FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all',         label: 'Todos' },
  { value: 'open',        label: 'Abiertos' },
  { value: 'in_progress', label: 'En progreso' },
  { value: 'resolved',    label: 'Resueltos' },
]

interface Props {
  session: ClienteSession
  selectedInstallation: string
}

export function PortalTickets({ session, selectedInstallation }: Props) {
  const [tickets, setTickets] = useState<TicketItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [selected, setSelected] = useState<TicketDetail | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)

  const headers = {
    'x-contact-id': session.contactId,
    'x-tenant-id': session.tenantId,
    'x-account-id': session.accountId,
  }

  const fetchTickets = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ installationId: selectedInstallation })
    if (filter !== 'all') params.set('status', filter)
    fetch(`/api/portal/cliente/tickets?${params}`, { headers })
      .then(r => r.json())
      .then(j => { if (j.success) setTickets(j.data) })
      .finally(() => setLoading(false))
  }, [selectedInstallation, filter, session])

  useEffect(() => { fetchTickets() }, [fetchTickets])

  async function loadDetail(id: string) {
    const res = await fetch(`/api/portal/cliente/tickets/${id}`, { headers })
    const json = await res.json()
    if (json.success) setSelected(json.data)
  }

  async function submitComment() {
    if (!selected || !commentText.trim()) return
    setSubmittingComment(true)
    await fetch(`/api/portal/cliente/tickets/${selected.id}/comments`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: commentText.trim() }),
    })
    setCommentText('')
    await loadDetail(selected.id)
    setSubmittingComment(false)
  }

  if (selected) {
    const sCfg = STATUS_CONFIG[selected.status] ?? { label: selected.status, color: 'bg-zinc-700 text-zinc-400' }
    const pCfg = PRIORITY_CONFIG[selected.priority] ?? PRIORITY_CONFIG.p3
    return (
      <div className="max-w-lg mx-auto px-4 py-4 pb-24">
        <button onClick={() => setSelected(null)} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 mb-4">
          ← Volver
        </button>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', sCfg.color)}>{sCfg.label}</span>
            <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', pCfg.color)}>{pCfg.label}</span>
            <span className="text-[11px] text-zinc-600 ml-auto">{selected.code}</span>
          </div>
          <h3 className="text-sm font-semibold text-white mb-1">{selected.title}</h3>
          {selected.description && <p className="text-xs text-zinc-400">{selected.description}</p>}
          <p className="text-[10px] text-zinc-600 mt-2">
            {new Date(selected.createdAt).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
        </div>

        <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Comentarios</h4>
        <div className="space-y-2 mb-4">
          {selected.comments.length === 0 ? (
            <p className="text-xs text-zinc-600 text-center py-4">Sin comentarios aun</p>
          ) : (
            selected.comments.map(c => (
              <div key={c.id} className={cn(
                'rounded-xl px-3 py-2 text-xs max-w-[85%]',
                c.userId === session.contactId
                  ? 'ml-auto bg-teal-600/30 text-teal-100'
                  : 'bg-zinc-800 text-zinc-300'
              )}>
                <p>{c.body}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  {new Date(c.createdAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            ))
          )}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitComment()}
            placeholder="Escribe un comentario..."
            className="flex-1 h-9 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
          <button
            onClick={submitComment}
            disabled={!commentText.trim() || submittingComment}
            className="h-9 w-9 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-40 flex items-center justify-center"
          >
            {submittingComment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-4 pb-24">
      <div className="flex items-center gap-2 mb-4">
        <Ticket className="h-4 w-4 text-teal-400" />
        <h2 className="text-base font-semibold">Tickets</h2>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              'flex-shrink-0 text-xs px-3 py-1.5 rounded-lg transition-colors',
              filter === f.value
                ? 'bg-teal-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-12 text-zinc-600 text-sm">Sin tickets</div>
      ) : (
        <div className="space-y-2">
          {tickets.map(t => {
            const sCfg = STATUS_CONFIG[t.status] ?? { label: t.status, color: 'bg-zinc-700 text-zinc-400' }
            const pCfg = PRIORITY_CONFIG[t.priority] ?? PRIORITY_CONFIG.p3
            return (
              <button
                key={t.id}
                onClick={() => loadDetail(t.id)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 text-left hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', pCfg.color)}>{pCfg.label}</span>
                  <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', sCfg.color)}>{sCfg.label}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-zinc-600 ml-auto" />
                </div>
                <p className="text-sm font-medium text-white">{t.title}</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">{t.code} · {new Date(t.createdAt).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}</p>
              </button>
            )
          })}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setShowCreate(true)}
        className="fixed bottom-24 right-4 h-12 w-12 rounded-full bg-teal-600 hover:bg-teal-500 shadow-lg flex items-center justify-center transition-colors z-10"
      >
        <Plus className="h-5 w-5" />
      </button>

      {showCreate && (
        <PortalCreateTicket
          session={session}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchTickets() }}
        />
      )}
    </div>
  )
}
```

### `src/components/portal/cliente/PortalCreateTicket.tsx`

```tsx
'use client'

import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ClienteSession } from '@/lib/portal-cliente'

interface Props {
  session: ClienteSession
  onClose: () => void
  onCreated: () => void
}

const PRIORITIES = [
  { value: 'p1', label: 'P1 — Critico',   color: 'text-red-400' },
  { value: 'p2', label: 'P2 — Alto',       color: 'text-orange-400' },
  { value: 'p3', label: 'P3 — Normal',     color: 'text-zinc-400' },
]

export function PortalCreateTicket({ session, onClose, onCreated }: Props) {
  const [installationId, setInstallationId] = useState(
    session.installations[0]?.id ?? ''
  )
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('p3')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!title.trim()) { setError('Ingresa un titulo'); return }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/portal/cliente/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-contact-id': session.contactId,
          'x-tenant-id': session.tenantId,
          'x-account-id': session.accountId,
        },
        body: JSON.stringify({ installationId, title: title.trim(), description: description.trim(), priority }),
      })
      const json = await res.json()
      if (json.success) {
        onCreated()
      } else {
        setError(json.error ?? 'Error al crear ticket')
      }
    } catch {
      setError('Error de conexion')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-t-2xl p-5 pb-8 animate-in slide-in-from-bottom">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">Nuevo Ticket</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors">
            <X className="h-4 w-4 text-zinc-400" />
          </button>
        </div>

        <div className="space-y-3">
          {session.installations.length > 1 && (
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Instalacion</label>
              <select
                value={installationId}
                onChange={e => setInstallationId(e.target.value)}
                className="w-full h-9 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                {session.installations.map(i => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Titulo *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Describe el problema brevemente"
              className="w-full h-9 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Descripcion</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Detalles adicionales..."
              rows={3}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Prioridad</label>
            <div className="flex gap-2">
              {PRIORITIES.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPriority(p.value)}
                  className={cn(
                    'flex-1 h-9 rounded-lg border text-xs font-medium transition-colors',
                    priority === p.value
                      ? 'border-teal-500 bg-teal-600/20 text-teal-300'
                      : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  )}
                >
                  <span className={cn('font-bold', p.color)}>{p.value.toUpperCase()}</span>
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={submitting || !title.trim()}
            className="w-full h-11 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-sm font-medium transition-colors flex items-center justify-center gap-2 mt-2"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crear Ticket'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

**Wire up in `PortalClienteClient.tsx`:**

```tsx
import { PortalTickets } from "@/components/portal/cliente/PortalTickets";
// ...
case "tickets":
  return (
    <PortalTickets
      session={session}
      selectedInstallation={selectedInstallation}
    />
  );
```

**Commit:**
```bash
git add src/components/portal/cliente/PortalTickets.tsx \
  src/components/portal/cliente/PortalCreateTicket.tsx \
  src/app/portal/cliente/PortalClienteClient.tsx
git commit -m "feat(portal-cliente): add Tickets UI with list, detail, comments, and create sheet"
```

---

## Task 6: Chat Grupos Gard

**Files:**
- `src/app/api/portal/cliente/chat/groups/route.ts`
- `src/components/portales/ChatClienteSection.tsx` (modify to add Groups tab)

**Schema notes:**
- `ChatChannel.channelType` enum has `GROUP` value (confirmed in schema)
- `ChatChannel.groupId` is an optional `String?` — use a slug like `"admin_finanzas"` as the groupId since there is no separate Group model for these predefined channels
- `ChatChannel.installationId` has `@unique` constraint — GROUP channels must have `installationId: null`

### `src/app/api/portal/cliente/chat/groups/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientSession } from "@/lib/portal-chat-auth";

const PREDEFINED_GROUPS = [
  { groupId: "admin_finanzas",  name: "Administracion & Finanzas" },
  { groupId: "rrhh",            name: "Recursos Humanos" },
  { groupId: "comercial",       name: "Comercial" },
  { groupId: "operaciones",     name: "Operaciones" },
]

export async function GET(request: NextRequest) {
  try {
    const session = getClientSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    // Upsert predefined GROUP channels for this tenant
    const channels = await Promise.all(
      PREDEFINED_GROUPS.map(g =>
        prisma.chatChannel.upsert({
          where: {
            // Use a compound unique — but ChatChannel has no compound unique on groupId+tenantId.
            // Instead, find by tenantId+groupId manually, then create if missing.
            // Workaround: use findFirst + create pattern below
            id: "00000000-0000-0000-0000-000000000000", // force upsert to never match
          },
          update: {},
          create: {
            tenantId: session.tenantId,
            channelType: "GROUP",
            groupId: g.groupId,
            name: g.name,
            isActive: true,
          },
        }).catch(() => null)
      )
    )

    // Better pattern — use findFirst + createIfMissing
    const result = await Promise.all(
      PREDEFINED_GROUPS.map(async g => {
        let ch = await prisma.chatChannel.findFirst({
          where: { tenantId: session.tenantId, channelType: "GROUP", groupId: g.groupId },
          select: { id: true, name: true, groupId: true, lastMessageAt: true, lastMessagePreview: true, messageCount: true },
        })
        if (!ch) {
          ch = await prisma.chatChannel.create({
            data: {
              tenantId: session.tenantId,
              channelType: "GROUP",
              groupId: g.groupId,
              name: g.name,
              isActive: true,
            },
            select: { id: true, name: true, groupId: true, lastMessageAt: true, lastMessagePreview: true, messageCount: true },
          })
        }
        return ch
      })
    )

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Portal Cliente] chat/groups", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
```

**Note:** The `upsert` attempt above is a placeholder to illustrate intent — the `findFirst + create` pattern below it is the actual correct implementation. Remove the first `Promise.all` block and keep only the second one.

### Modify `ChatClienteSection` to add Groups tab

Find the existing `src/components/portales/ChatClienteSection.tsx` and add a tab toggle at the top:

```tsx
// Add state:
const [chatMode, setChatMode] = useState<'instalaciones' | 'grupos'>('instalaciones')

// Add in JSX before the channel list:
<div className="flex gap-1 p-1 bg-zinc-800/60 rounded-lg mb-3">
  <button
    onClick={() => setChatMode('instalaciones')}
    className={cn(
      'flex-1 text-xs py-1.5 rounded-md transition-colors font-medium',
      chatMode === 'instalaciones'
        ? 'bg-zinc-700 text-white'
        : 'text-zinc-500 hover:text-zinc-300'
    )}
  >
    Mis Instalaciones
  </button>
  <button
    onClick={() => setChatMode('grupos')}
    className={cn(
      'flex-1 text-xs py-1.5 rounded-md transition-colors font-medium',
      chatMode === 'grupos'
        ? 'bg-zinc-700 text-white'
        : 'text-zinc-500 hover:text-zinc-300'
    )}
  >
    Equipos Gard
  </button>
</div>

{/* When chatMode === 'grupos', fetch from /api/portal/cliente/chat/groups and render the group channel list using the same channel item component */}
```

The groups channel list uses the same chat infrastructure (pusher, messages) — just pass the group channel ID to the existing chat view component once a group is selected.

**Commit:**
```bash
git add src/app/api/portal/cliente/chat/groups/ src/components/portales/ChatClienteSection.tsx
git commit -m "feat(portal-cliente): add Chat Grupos Gard API and tab toggle in ChatClienteSection"
```

---

## Task 7: Alertas API + UI

**Files:**
- `src/app/api/portal/cliente/alertas/config/route.ts`
- `src/components/portal/cliente/PortalAlertas.tsx`
- `src/app/portal/cliente/PortalClienteClient.tsx` (add `alertas` case)

**Schema:** `PortalClienteAlertConfig` fields: `id, tenantId, contactId, accountId, alertType, channels(Json), isActive`

The `channels` Json field stores an object like `{ email: boolean, push: boolean }`.

### `src/app/api/portal/cliente/alertas/config/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientSession } from "@/lib/portal-chat-auth";

const ALERT_TYPES = [
  'guard_absent',
  'ronda_incomplete',
  'checkpoint_missed',
  'incident',
  'new_document',
  'ticket_replied',
]

export async function GET(request: NextRequest) {
  try {
    const session = getClientSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const configs = await prisma.portalClienteAlertConfig.findMany({
      where: { contactId: session.contactId, tenantId: session.tenantId },
    });

    // Return full set — fill missing alert types with defaults
    const configMap = new Map(configs.map(c => [c.alertType, c]))
    const data = ALERT_TYPES.map(type => {
      const existing = configMap.get(type)
      return {
        alertType: type,
        channels: existing?.channels ?? { email: false, push: false },
        isActive: existing?.isActive ?? false,
        id: existing?.id ?? null,
      }
    })

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Portal Cliente] alertas/config GET", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = getClientSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { alertType, channels, isActive } = await request.json();

    if (!alertType || !ALERT_TYPES.includes(alertType)) {
      return NextResponse.json({ success: false, error: "Tipo de alerta invalido" }, { status: 400 });
    }

    // Upsert: find by contactId + alertType
    const existing = await prisma.portalClienteAlertConfig.findFirst({
      where: { contactId: session.contactId, tenantId: session.tenantId, alertType },
      select: { id: true },
    })

    let config
    if (existing) {
      config = await prisma.portalClienteAlertConfig.update({
        where: { id: existing.id },
        data: { channels, isActive },
      })
    } else {
      config = await prisma.portalClienteAlertConfig.create({
        data: {
          tenantId: session.tenantId,
          contactId: session.contactId,
          accountId: session.accountId,
          alertType,
          channels,
          isActive,
        },
      })
    }

    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error("[Portal Cliente] alertas/config PUT", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
```

### `src/components/portal/cliente/PortalAlertas.tsx`

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Bell, Mail, Smartphone, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ClienteSession } from '@/lib/portal-cliente'

interface AlertConfig {
  alertType: string
  channels: { email: boolean; push: boolean }
  isActive: boolean
  id: string | null
}

const ALERT_LABELS: Record<string, { label: string; description: string }> = {
  guard_absent:      { label: 'Guardia ausente',      description: 'Cuando un guardia no se presenta a turno' },
  ronda_incomplete:  { label: 'Ronda incompleta',     description: 'Cuando una ronda no llega al 100%' },
  checkpoint_missed: { label: 'Checkpoint omitido',   description: 'Cuando se omite un punto de control' },
  incident:          { label: 'Incidente reportado',  description: 'Cuando un guardia reporta un incidente' },
  new_document:      { label: 'Nuevo documento',      description: 'Cuando se publica un contrato o documento' },
  ticket_replied:    { label: 'Respuesta en ticket',  description: 'Cuando hay una respuesta en tus tickets' },
}

interface Props {
  session: ClienteSession
}

export function PortalAlertas({ session }: Props) {
  const [configs, setConfigs] = useState<AlertConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  const headers = {
    'x-contact-id': session.contactId,
    'x-tenant-id': session.tenantId,
    'x-account-id': session.accountId,
  }

  useEffect(() => {
    fetch('/api/portal/cliente/alertas/config', { headers })
      .then(r => r.json())
      .then(j => { if (j.success) setConfigs(j.data) })
      .finally(() => setLoading(false))
  }, [session])

  async function toggle(alertType: string, field: 'email' | 'push' | 'isActive', value: boolean) {
    setUpdating(alertType + field)
    const current = configs.find(c => c.alertType === alertType)
    if (!current) return

    const updated: AlertConfig = {
      ...current,
      isActive: field === 'isActive' ? value : current.isActive,
      channels: field === 'isActive' ? current.channels : {
        ...current.channels,
        [field]: value,
      },
    }

    // Optimistic update
    setConfigs(prev => prev.map(c => c.alertType === alertType ? updated : c))

    await fetch('/api/portal/cliente/alertas/config', {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alertType,
        channels: updated.channels,
        isActive: updated.isActive,
      }),
    })
    setUpdating(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-4 pb-24">
      <div className="flex items-center gap-2 mb-1">
        <Bell className="h-4 w-4 text-teal-400" />
        <h2 className="text-base font-semibold">Configuracion de Alertas</h2>
      </div>
      <p className="text-xs text-zinc-500 mb-4">Elige que notificaciones quieres recibir y por que canal.</p>

      <div className="space-y-3">
        {configs.map(cfg => {
          const meta = ALERT_LABELS[cfg.alertType]
          if (!meta) return null
          return (
            <div
              key={cfg.alertType}
              className={cn(
                'bg-zinc-900 border rounded-xl p-3.5 transition-colors',
                cfg.isActive ? 'border-zinc-700' : 'border-zinc-800 opacity-60'
              )}
            >
              <div className="flex items-start justify-between gap-3 mb-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{meta.label}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{meta.description}</p>
                </div>
                {/* Main toggle */}
                <button
                  onClick={() => toggle(cfg.alertType, 'isActive', !cfg.isActive)}
                  disabled={updating === cfg.alertType + 'isActive'}
                  className={cn(
                    'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 transition-colors focus:outline-none',
                    cfg.isActive
                      ? 'bg-teal-600 border-teal-600'
                      : 'bg-zinc-700 border-zinc-700'
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                      cfg.isActive ? 'translate-x-4' : 'translate-x-0'
                    )}
                  />
                </button>
              </div>

              {cfg.isActive && (
                <div className="flex items-center gap-3 pt-2 border-t border-zinc-800">
                  {/* Email toggle */}
                  <button
                    onClick={() => toggle(cfg.alertType, 'email', !cfg.channels.email)}
                    disabled={!cfg.isActive || updating === cfg.alertType + 'email'}
                    className={cn(
                      'flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border transition-colors',
                      cfg.channels.email
                        ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                        : 'border-zinc-700 text-zinc-500 hover:border-zinc-600'
                    )}
                  >
                    <Mail className="h-3 w-3" />
                    Email
                  </button>
                  {/* Push toggle */}
                  <button
                    onClick={() => toggle(cfg.alertType, 'push', !cfg.channels.push)}
                    disabled={!cfg.isActive || updating === cfg.alertType + 'push'}
                    className={cn(
                      'flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border transition-colors',
                      cfg.channels.push
                        ? 'border-teal-500/50 bg-teal-500/10 text-teal-400'
                        : 'border-zinc-700 text-zinc-500 hover:border-zinc-600'
                    )}
                  >
                    <Smartphone className="h-3 w-3" />
                    Push
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

**Wire up in `PortalClienteClient.tsx`:**

```tsx
import { PortalAlertas } from "@/components/portal/cliente/PortalAlertas";
// ...
case "alertas":
  return <PortalAlertas session={session} />;
```

**Commit:**
```bash
git add src/app/api/portal/cliente/alertas/ src/components/portal/cliente/PortalAlertas.tsx \
  src/app/portal/cliente/PortalClienteClient.tsx
git commit -m "feat(portal-cliente): add Alertas config API and toggle UI"
```

---

## Implementation Order

1. Task 1 (Rondas API) — no UI deps
2. Task 2 (Rondas UI) — depends on Task 1
3. Task 3 (Posta API + UI) — independent
4. Task 4 (Tickets API) — independent
5. Task 5 (Tickets UI) — depends on Task 4
6. Task 6 (Chat Grupos) — independent, additive to existing chat
7. Task 7 (Alertas API + UI) — independent

## Cross-cutting Notes

- **Session headers pattern:** All new API routes use `getClientSession(request)` from `@/lib/portal-chat-auth`. The portal middleware (or the fetch call in the client component) must pass `x-contact-id`, `x-tenant-id`, `x-account-id` headers. Check how `ChatClienteSection` passes these headers — replicate the same pattern in new UI components.
- **No server-side session cookie:** The existing portal APIs (summary, activity) skip auth entirely and rely on query params. The chat APIs use header-based session. Stick to the header pattern for all new routes.
- **`PortalSection` type additions:** If adding `'posta'` as a nav item, update the union in `PortalClienteNav.tsx` and add a `BookOpen` import.
- **Prisma schema already has:** `PortalClienteAlertConfig`, `OpsTicket`, `OpsTicketComment`, `OpsRondaEjecucion`, `OpsMarcacionCheckpoint`, `OpsRondaIncidente`, `OpsControlNocturno`, `OpsControlNocturnoInstalacion`, `ChatChannel` (with GROUP type). No migrations needed for Phase 2.
