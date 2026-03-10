# Rondas Libres Fix Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix free rounds (rondas libres) to auto-close after 2 hours, add GPS server tracking, enable admin cleanup of orphan rounds, and improve the guard's UX during free rounds.

**Architecture:** Three incremental phases — B3 (admin cleanup endpoint + UI button), B1 (new Prisma model for GPS tracking + cron auto-close + portal warning banners), B2 (improved RondaActiva layout for ad-hoc mode with route polyline and mini-timeline). Each phase is independently deployable.

**Tech Stack:** Next.js 14 App Router, Prisma ORM, PostgreSQL, Vercel Cron, Pusher (real-time), Leaflet (maps), Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-03-09-rondas-libres-design.md`

---

## Chunk 1: B3 — Orphan Round Cleanup

### Task 1: Admin cleanup endpoint

**Files:**
- Create: `src/app/api/ops/rondas/cerrar-huerfanas/route.ts`

- [ ] **Step 1: Create the endpoint file**

```typescript
// src/app/api/ops/rondas/cerrar-huerfanas/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getPusherServer } from "@/lib/chat";

/**
 * POST /api/ops/rondas/cerrar-huerfanas
 *
 * Admin endpoint to close orphaned free rounds (ad-hoc rondas stuck in "en_curso").
 * Requires ops.rondas edit permission + rondas_configure capability.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops", "rondas") || !hasCapability(perms, "rondas_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const maxHoursOpen = typeof body.maxHoursOpen === "number" && body.maxHoursOpen > 0
      ? body.maxHoursOpen
      : 4;

    const now = new Date();
    const cutoff = new Date(now.getTime() - maxHoursOpen * 60 * 60 * 1000);

    const orphans = await prisma.opsRondaEjecucion.findMany({
      where: {
        tenantId: ctx.tenantId,
        isAdHoc: true,
        status: "en_curso",
        startedAt: { lte: cutoff },
      },
      select: { id: true, installationId: true, guardiaId: true },
    });

    if (orphans.length === 0) {
      return NextResponse.json({ success: true, data: { cerradas: 0, ids: [] } });
    }

    const ids = orphans.map((o) => o.id);

    await prisma.opsRondaEjecucion.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "cerrada_admin",
        completedAt: now,
        trustScore: 0,
        trustBreakdown: {
          reason: "admin_closed_orphan",
          closedBy: ctx.userId,
          closedAt: now.toISOString(),
        },
        notes: "Cerrada por administrador — excedió duración máxima",
      },
    });

    // Notify monitoring dashboard
    try {
      const pusher = getPusherServer();
      await pusher.trigger(`monitoreo-${ctx.tenantId}`, "ronda-completed", {
        bulkClose: true,
        count: ids.length,
        ids,
      });
    } catch (pusherErr) {
      console.error("[CERRAR_HUERFANAS] Pusher error:", pusherErr);
    }

    return NextResponse.json({ success: true, data: { cerradas: ids.length, ids } });
  } catch (error) {
    console.error("[CERRAR_HUERFANAS]", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Test manually with curl (dev server running)**

```bash
# Should return 403 without auth
curl -X POST http://localhost:3000/api/ops/rondas/cerrar-huerfanas
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ops/rondas/cerrar-huerfanas/route.ts
git commit -m "feat(rondas): add admin endpoint to close orphaned free rounds"
```

---

### Task 2: Update status filters across the app

All queries that filter by status need to handle `cerrada_auto` and `cerrada_admin`. These statuses should be treated similarly to `no_realizada` (terminal states, shown in history).

**Files:**
- Modify: `src/app/(app)/ops/rondas/monitoreo/page.tsx:50`
- Modify: `src/app/api/portal/rondas/mis-rondas/route.ts:60`
- Modify: `src/components/portal/rondas/MisRondas.tsx:598-682`
- Modify: `prisma/schema.prisma:3362` (comment only)

- [ ] **Step 1: Update schema comment**

In `prisma/schema.prisma:3362`, update the status comment:
```
Old: status String @default("pendiente") // "pendiente" | "en_curso" | "completada" | "incompleta" | "no_realizada"
New: status String @default("pendiente") // "pendiente" | "en_curso" | "completada" | "incompleta" | "no_realizada" | "cerrada_auto" | "cerrada_admin"
```

- [ ] **Step 2: Update monitoreo page to show cerrada_auto/cerrada_admin in history**

In `src/app/(app)/ops/rondas/monitoreo/page.tsx:50`, add the new statuses to the upcoming/missed query:
```typescript
// Old line 50:
{ status: "no_realizada", scheduledAt: { gte: twelveHoursAgo } },

// New — add after line 50:
{ status: "cerrada_auto", scheduledAt: { gte: twelveHoursAgo } },
{ status: "cerrada_admin", scheduledAt: { gte: twelveHoursAgo } },
```

- [ ] **Step 3: Update mis-rondas API to include new statuses**

In `src/app/api/portal/rondas/mis-rondas/route.ts:60`:
```typescript
// Old:
status: { in: ["pendiente", "en_curso", "incompleta", "completada", "no_realizada"] },

// New:
status: { in: ["pendiente", "en_curso", "incompleta", "completada", "no_realizada", "cerrada_auto", "cerrada_admin"] },
```

- [ ] **Step 4: Update MisRondas badges for new statuses**

In `src/components/portal/rondas/MisRondas.tsx`, after the existing `isNoRealizada` badge block (line ~602), add badges for the new statuses. Find the status badge section and add:

```tsx
{ronda.status === "cerrada_auto" && (
  <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-xs font-medium text-orange-400">
    Cerrada auto
  </span>
)}
{ronda.status === "cerrada_admin" && (
  <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-400">
    Cerrada admin
  </span>
)}
```

Also update the `isNoRealizada` derivation to include new terminal statuses for card styling. Find where `isNoRealizada` is computed and update:
```typescript
// Old:
const isNoRealizada = ronda.status === "no_realizada";

// New:
const isNoRealizada = ronda.status === "no_realizada" || ronda.status === "cerrada_auto" || ronda.status === "cerrada_admin";
```

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma src/app/\(app\)/ops/rondas/monitoreo/page.tsx src/app/api/portal/rondas/mis-rondas/route.ts src/components/portal/rondas/MisRondas.tsx
git commit -m "feat(rondas): handle cerrada_auto and cerrada_admin statuses in queries and UI"
```

---

### Task 3: Orphan cleanup button in MonitoreoTurnoHeader

**Files:**
- Modify: `src/components/ops/rondas/MonitoreoTurnoHeader.tsx`
- Modify: `src/components/ops/rondas/RondasMonitoreoClient.tsx` (pass orphan count + handler)

- [ ] **Step 1: Add orphan cleanup props and button to MonitoreoTurnoHeader**

In `src/components/ops/rondas/MonitoreoTurnoHeader.tsx`, add new props and button.

Add to the `Props` interface:
```typescript
orphanCount?: number;
onCloseOrphans?: () => void;
closingOrphans?: boolean;
```

Add the button in the alerts section (before the "Cerrar turno" button, inside the `ml-auto` div at line ~136):
```tsx
{(orphanCount ?? 0) > 0 && !isReadOnly && (
  <Button
    size="sm"
    variant="outline"
    className="h-7 text-[11px] gap-1 text-orange-400 border-orange-500/30 hover:bg-orange-500/10"
    onClick={onCloseOrphans}
    disabled={closingOrphans}
  >
    <AlertTriangle className="h-3 w-3" />
    {closingOrphans ? "Cerrando..." : `${orphanCount} huérfana${orphanCount !== 1 ? "s" : ""}`}
  </Button>
)}
```

- [ ] **Step 2: Wire up orphan count and handler in RondasMonitoreoClient**

In `src/components/ops/rondas/RondasMonitoreoClient.tsx`, compute orphan count from activeRows and add handler.

Add state and derived value:
```typescript
const [closingOrphans, setClosingOrphans] = useState(false);

// Derive orphan count: ad-hoc rondas en_curso for > 4 hours
const orphanCount = rows.filter((r: any) => {
  if (!r.isAdHoc || r.status !== "en_curso" || !r.startedAt) return false;
  const hoursOpen = (Date.now() - new Date(r.startedAt).getTime()) / 3600000;
  return hoursOpen > 4;
}).length;
```

Add handler:
```typescript
const handleCloseOrphans = async () => {
  if (!confirm(`¿Cerrar ${orphanCount} ronda${orphanCount !== 1 ? "s" : ""} libre${orphanCount !== 1 ? "s" : ""} huérfana${orphanCount !== 1 ? "s" : ""}?`)) return;
  setClosingOrphans(true);
  try {
    const res = await fetch("/api/ops/rondas/cerrar-huerfanas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxHoursOpen: 4 }),
    });
    const json = await res.json();
    if (json.success) {
      refreshData();
    }
  } finally {
    setClosingOrphans(false);
  }
};
```

Pass to MonitoreoTurnoHeader:
```tsx
<MonitoreoTurnoHeader
  // ... existing props
  orphanCount={orphanCount}
  onCloseOrphans={handleCloseOrphans}
  closingOrphans={closingOrphans}
/>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ops/rondas/MonitoreoTurnoHeader.tsx src/components/ops/rondas/RondasMonitoreoClient.tsx
git commit -m "feat(rondas): add orphan cleanup button to monitoring header"
```

---

## Chunk 2: B1 — Auto-close Cron + GPS Tracking

### Task 4: Add OpsRondaTracking Prisma model

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add OpsRondaTracking model**

Add after the `OpsRondaEjecucion` model (after line 3401):

```prisma
model OpsRondaTracking {
  id          String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  ejecucionId String   @map("ejecucion_id") @db.Uuid
  lat         Float
  lng         Float
  accuracy    Float?
  battery     Int?
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  ejecucion OpsRondaEjecucion @relation(fields: [ejecucionId], references: [id], onDelete: Cascade)

  @@index([ejecucionId, createdAt], map: "idx_ronda_tracking_ej_created")
  @@map("ronda_tracking")
  @@schema("ops")
}
```

- [ ] **Step 2: Add relation to OpsRondaEjecucion**

In `OpsRondaEjecucion` model (around line 3388, after the existing relations), add:
```prisma
trackingPoints    OpsRondaTracking[]
```

- [ ] **Step 3: Run Prisma migration**

```bash
npx prisma migrate dev --name add-ronda-tracking
```

- [ ] **Step 4: Commit**

```bash
git add prisma/
git commit -m "feat(rondas): add OpsRondaTracking model for GPS server tracking"
```

---

### Task 5: GPS tracking endpoint

**Files:**
- Create: `src/app/api/portal/rondas/tracking/route.ts`

- [ ] **Step 1: Create the tracking endpoint**

```typescript
// src/app/api/portal/rondas/tracking/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/portal/rondas/tracking
 *
 * Receives periodic GPS positions from the guard's device during a ronda.
 * Called every ~30 seconds. Lightweight — no trust score recalculation.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ejecucionId, guardiaId, lat, lng, accuracy, battery } = body as {
      ejecucionId?: string;
      guardiaId?: string;
      lat?: number;
      lng?: number;
      accuracy?: number;
      battery?: number;
    };

    if (!ejecucionId || !UUID_RE.test(ejecucionId)) {
      return NextResponse.json({ success: false, error: "ejecucionId inválido" }, { status: 400 });
    }
    if (!guardiaId || !UUID_RE.test(guardiaId)) {
      return NextResponse.json({ success: false, error: "guardiaId inválido" }, { status: 400 });
    }
    if (typeof lat !== "number" || typeof lng !== "number") {
      return NextResponse.json({ success: false, error: "lat/lng requeridos" }, { status: 400 });
    }

    // Verify execution is en_curso and belongs to this guard
    const execution = await prisma.opsRondaEjecucion.findFirst({
      where: { id: ejecucionId, guardiaId, status: "en_curso" },
      select: { id: true },
    });

    if (!execution) {
      return NextResponse.json({ success: false, error: "Ejecución no encontrada o no activa" }, { status: 404 });
    }

    await prisma.opsRondaTracking.create({
      data: {
        ejecucionId,
        lat,
        lng,
        accuracy: accuracy ?? null,
        battery: typeof battery === "number" ? battery : null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[TRACKING]", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/portal/rondas/tracking/route.ts
git commit -m "feat(rondas): add GPS tracking endpoint for periodic position updates"
```

---

### Task 6: Auto-close cron for free rounds

**Files:**
- Create: `src/app/api/cron/rondas/cerrar-libres/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Create the cron endpoint**

```typescript
// src/app/api/cron/rondas/cerrar-libres/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPusherServer } from "@/lib/chat";

const FREE_ROUND_MAX_DURATION_MINUTES = 120;
const NO_SIGNAL_CLOSE_MINUTES = 30;

/**
 * CRON: /api/cron/rondas/cerrar-libres
 *
 * Auto-closes free rounds (ad-hoc) that exceed max duration or have lost GPS signal.
 * Runs hourly via Vercel Cron.
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret && process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { success: false, error: "CRON_SECRET not configured" },
        { status: 500 },
      );
    }
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const now = new Date();
    const maxDurationCutoff = new Date(now.getTime() - FREE_ROUND_MAX_DURATION_MINUTES * 60 * 1000);
    const noSignalCutoff = new Date(now.getTime() - NO_SIGNAL_CLOSE_MINUTES * 60 * 1000);

    // Find all ad-hoc rondas still en_curso
    const activeLibres = await prisma.opsRondaEjecucion.findMany({
      where: {
        isAdHoc: true,
        status: "en_curso",
      },
      select: {
        id: true,
        tenantId: true,
        installationId: true,
        guardiaId: true,
        startedAt: true,
        trackingPoints: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
      take: 500,
    });

    if (activeLibres.length === 0) {
      return NextResponse.json({ success: true, data: { cerradas: 0 } });
    }

    const toClose: { id: string; tenantId: string; reason: string }[] = [];

    for (const ej of activeLibres) {
      const startedAt = ej.startedAt ? new Date(ej.startedAt) : null;

      // Check 1: exceeded max duration
      if (startedAt && startedAt <= maxDurationCutoff) {
        toClose.push({ id: ej.id, tenantId: ej.tenantId, reason: "timeout" });
        continue;
      }

      // Check 2: no GPS signal for 30+ minutes (only if tracking points exist)
      const lastTracking = ej.trackingPoints[0];
      if (lastTracking && new Date(lastTracking.createdAt) <= noSignalCutoff) {
        toClose.push({ id: ej.id, tenantId: ej.tenantId, reason: "no_signal" });
        continue;
      }
    }

    if (toClose.length === 0) {
      return NextResponse.json({ success: true, data: { cerradas: 0 } });
    }

    const ids = toClose.map((r) => r.id);

    // Batch update
    await prisma.opsRondaEjecucion.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "cerrada_auto",
        completedAt: now,
        trustScore: 0,
        trustBreakdown: {
          reason: "auto_closed_free_round",
          closedBy: "system_cron",
          closedAt: now.toISOString(),
        },
      },
    });

    // Create alerts per-ronda (group by tenant for Pusher)
    const alertData = toClose
      .filter((r) => {
        const ej = activeLibres.find((e) => e.id === r.id);
        return ej?.installationId;
      })
      .map((r) => {
        const ej = activeLibres.find((e) => e.id === r.id)!;
        return {
          tenantId: r.tenantId,
          ejecucionId: r.id,
          installationId: ej.installationId!,
          guardiaId: ej.guardiaId,
          tipo: "ronda_libre_timeout",
          severidad: "warning" as const,
          mensaje: `Ronda Libre cerrada automáticamente (${r.reason === "no_signal" ? "sin señal GPS" : "excedió 2 horas"})`,
          data: {
            reason: r.reason,
            closedAt: now.toISOString(),
            closedBy: "system_cron",
          } as never,
        };
      });

    if (alertData.length > 0) {
      await prisma.opsAlertaRonda.createMany({ data: alertData });
    }

    // Notify monitoring dashboards
    const tenantIds = [...new Set(toClose.map((r) => r.tenantId))];
    try {
      const pusher = getPusherServer();
      for (const tid of tenantIds) {
        await pusher.trigger(`monitoreo-${tid}`, "ronda-completed", {
          bulkClose: true,
          count: toClose.filter((r) => r.tenantId === tid).length,
        });
      }
    } catch (pusherErr) {
      console.error("[CRON_CERRAR_LIBRES] Pusher error:", pusherErr);
    }

    console.log(`[CRON] cerrar-libres: ${toClose.length} rondas cerradas`);

    return NextResponse.json({
      success: true,
      data: {
        cerradas: toClose.length,
        reasons: {
          timeout: toClose.filter((r) => r.reason === "timeout").length,
          no_signal: toClose.filter((r) => r.reason === "no_signal").length,
        },
      },
    });
  } catch (error) {
    console.error("[CRON] cerrar-libres error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Register cron in vercel.json**

Add to the `crons` array in `vercel.json`:
```json
{"path":"/api/cron/rondas/cerrar-libres","schedule":"0 * * * *"}
```

Also add the missing `cerrar-atrasadas` cron while we're here:
```json
{"path":"/api/cron/rondas/cerrar-atrasadas","schedule":"0 * * * *"}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/rondas/cerrar-libres/route.ts vercel.json
git commit -m "feat(rondas): add auto-close cron for free rounds + register cerrar-atrasadas in vercel.json"
```

---

### Task 7: Auto-close warning banner in RondaActiva

**Files:**
- Modify: `src/components/portal/rondas/RondaActiva.tsx`

- [ ] **Step 1: Add timeout constants and banner logic**

At the top of `RondaActiva.tsx` (after imports, before the component), add:
```typescript
const FREE_ROUND_MAX_DURATION_MINUTES = 120;
const FREE_ROUND_WARNING_MINUTES = 15; // show warning when X minutes left
const FREE_ROUND_CRITICAL_MINUTES = 5;  // show critical banner when X minutes left
```

- [ ] **Step 2: Add derived state for time remaining**

Inside the component, after the `elapsedSeconds` calculation (line ~205), add:
```typescript
const freeRoundTimeLeftMinutes = isAdHoc && startTime
  ? FREE_ROUND_MAX_DURATION_MINUTES - Math.floor((now - startTime) / 60000)
  : null;

const showFreeRoundWarning = isAdHoc && freeRoundTimeLeftMinutes !== null && freeRoundTimeLeftMinutes <= FREE_ROUND_WARNING_MINUTES && freeRoundTimeLeftMinutes > FREE_ROUND_CRITICAL_MINUTES;
const showFreeRoundCritical = isAdHoc && freeRoundTimeLeftMinutes !== null && freeRoundTimeLeftMinutes <= FREE_ROUND_CRITICAL_MINUTES;
```

- [ ] **Step 3: Add banner JSX**

After the `</header>` tag (line ~458) and before the map section, add:
```tsx
{/* Auto-close warning banner for free rounds */}
{showFreeRoundWarning && (
  <div className="mx-4 mt-2 rounded-lg border border-yellow-600/50 bg-yellow-950/40 px-4 py-2 text-center text-sm font-medium text-yellow-300">
    Tu ronda libre se cerrará automáticamente en {freeRoundTimeLeftMinutes} min
  </div>
)}
{showFreeRoundCritical && (
  <div className="mx-4 mt-2 animate-pulse rounded-lg border border-red-600/50 bg-red-950/40 px-4 py-2 text-center text-sm font-semibold text-red-300">
    Tu ronda se cerrará en {Math.max(0, freeRoundTimeLeftMinutes!)} min — finalízala ahora
  </div>
)}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/portal/rondas/RondaActiva.tsx
git commit -m "feat(rondas): add auto-close warning banners for free rounds"
```

---

### Task 8: GPS tracking from portal (client-side)

**Files:**
- Modify: `src/components/portal/rondas/RondaActiva.tsx`

- [ ] **Step 1: Add tracking interval**

Inside the component, after the GPS watchPosition effect (line ~181), add a new effect for server tracking:

```typescript
// -- Server-side GPS tracking (every 30s for ad-hoc rondas) --
const trackingPointsRef = useRef<Array<{ lat: number; lng: number; ts: number }>>([]);

useEffect(() => {
  if (!isAdHoc || !session?.guardiaId) return;

  const sendTracking = async () => {
    if (!guardPos) return;
    try {
      await fetch("/api/portal/rondas/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ejecucionId: rondaData.ejecucionId,
          guardiaId: session.guardiaId,
          lat: guardPos.lat,
          lng: guardPos.lng,
          accuracy: undefined,
          battery: undefined,
        }),
      });
      // Accumulate locally for polyline
      trackingPointsRef.current = [
        ...trackingPointsRef.current,
        { lat: guardPos.lat, lng: guardPos.lng, ts: Date.now() },
      ];
    } catch {
      // Silent fail — tracking is best-effort
    }
  };

  // Send immediately on mount
  sendTracking();
  const id = setInterval(sendTracking, 30000);
  return () => clearInterval(id);
}, [isAdHoc, guardPos?.lat, guardPos?.lng, rondaData.ejecucionId, session?.guardiaId]);
```

Note: The `session` prop needs to be available. Check if `RondaActiva` already receives session info — it gets `guardiaId` through `rondaData` or a session prop. Adjust accordingly based on how the component receives the guard ID. The key fields needed are `ejecucionId` (from `rondaData.ejecucionId`) and `guardiaId` (from `session.guardiaId` or passed as prop).

- [ ] **Step 2: Commit**

```bash
git add src/components/portal/rondas/RondaActiva.tsx
git commit -m "feat(rondas): add periodic GPS tracking to server during free rounds"
```

---

## Chunk 3: B2 — Flexible Navigation UX

### Task 9: Improved ad-hoc layout in RondaActiva

**Files:**
- Modify: `src/components/portal/rondas/RondaActiva.tsx`

- [ ] **Step 1: Expand map for ad-hoc mode**

In `RondaActiva.tsx:465`, change the map height to be larger for ad-hoc:
```typescript
// Old:
height={mapCollapsed ? "20vh" : "45vh"}

// New:
height={mapCollapsed ? "20vh" : isAdHoc ? "55vh" : "45vh"}
```

- [ ] **Step 2: Improve the empty state for ad-hoc mode**

Replace the current ad-hoc empty state (lines 496-506) with a more informative view:

```tsx
{isAdHoc && (
  <div className="space-y-4">
    {/* Timer + counter */}
    <div className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900/60 p-4">
      <div>
        <p className="text-2xl font-mono font-bold text-white">{formatElapsed(elapsedSeconds)}</p>
        <p className="text-xs text-gray-500">Tiempo transcurrido</p>
      </div>
      <div className="text-right">
        <p className="text-2xl font-bold text-teal-400">{completedCount}</p>
        <p className="text-xs text-gray-500">Puntos registrados</p>
      </div>
    </div>

    {/* Mini-timeline of completed marcaciones */}
    {sortedCheckpoints.length === 0 ? (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-teal-500/10">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <p className="text-sm text-gray-400">Recorrido en curso — escanea puntos QR o finaliza cuando termines</p>
      </div>
    ) : (
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Puntos registrados</p>
        {sortedCheckpoints.filter(c => c.completed).map((cp, i) => (
          <div key={cp.id} className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900/40 px-3 py-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-500/20 text-xs font-semibold text-teal-400">
              {i + 1}
            </span>
            <span className="flex-1 text-sm text-gray-300">{cp.name}</span>
            <span className="text-xs text-gray-600">
              {new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        ))}
      </div>
    )}
  </div>
)}
```

Wrap the existing non-ad-hoc checkpoint list in a conditional:
```tsx
{!isAdHoc && (
  // ... existing checkpoint rendering (sortedCheckpoints.map etc.)
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/portal/rondas/RondaActiva.tsx
git commit -m "feat(rondas): improved ad-hoc layout with timer, counter, and mini-timeline"
```

---

### Task 10: RondaCompletada handle new statuses

**Files:**
- Modify: `src/components/portal/rondas/RondaCompletada.tsx`

- [ ] **Step 1: Check current completion screen**

Read the file to find where the status label is displayed and the trust score gauge color logic.

- [ ] **Step 2: Add handling for cerrada_auto/cerrada_admin**

If the completion data shows `status === "cerrada_auto"` or `status === "cerrada_admin"`, display an appropriate message instead of the success celebration:

```tsx
{(completionData.status === "cerrada_auto" || completionData.status === "cerrada_admin") && (
  <div className="mb-4 rounded-xl border border-orange-700/50 bg-orange-950/20 p-4 text-center">
    <p className="text-sm font-medium text-orange-300">
      {completionData.status === "cerrada_auto"
        ? "Esta ronda fue cerrada automáticamente por exceder el tiempo máximo"
        : "Esta ronda fue cerrada por un administrador"}
    </p>
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/portal/rondas/RondaCompletada.tsx
git commit -m "feat(rondas): handle cerrada_auto/admin display in completion screen"
```

---

### Task 11: Final verification

- [ ] **Step 1: Run TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 2: Run linter**

```bash
npx next lint
```

- [ ] **Step 3: Run dev server and manually test**

```bash
npm run dev
```

Verify:
1. Portal: "Iniciar Ronda Libre" creates a round, shows expanded map, timer, and mini-timeline
2. Portal: Warning banner appears near the 2-hour mark (test by temporarily lowering `FREE_ROUND_MAX_DURATION_MINUTES`)
3. Monitoreo: "Cerrar huérfanas" button appears when orphan rounds exist
4. Cron: Manually call `GET /api/cron/rondas/cerrar-libres` with `Authorization: Bearer <CRON_SECRET>` to verify auto-close
5. Status: `cerrada_auto` and `cerrada_admin` display correctly in MisRondas and Monitoreo

- [ ] **Step 4: Final commit with all adjustments**

```bash
git add -A
git commit -m "feat(rondas): complete rondas libres auto-close, GPS tracking, and UX improvements"
```
