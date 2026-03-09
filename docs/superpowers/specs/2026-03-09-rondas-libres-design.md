# Rondas Libres — Audit & Fix Design

**Date:** 2026-03-09
**Status:** Approved
**Order:** B3 (cleanup) → B1 (auto-close) → B2 (UX)

---

## Problem

Free rounds (rondas libres) have no auto-close mechanism. If a guard starts one and doesn't manually finish it, it stays `en_curso` forever. There are currently 3+ orphaned free rounds from production tests. Additionally, the UX during a free round lacks progress indicators and duration visibility.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auto-close mechanism | Vercel Cron (hourly) | Robust, runs without users connected, pattern already exists |
| GPS server tracking | Yes, every 30s | Enables "no signal" detection, route visualization in monitoring |
| New status values | `cerrada_auto`, `cerrada_admin` | Clear semantics in queries/reports vs overloading existing status |
| Max duration config | Code constant (120 min) | YAGNI — promote to DB when per-tenant config is needed |

## Status Values (updated)

```
pendiente → en_curso → completada
                     → incompleta
                     → no_realizada    (existing: cron for scheduled rounds)
                     → cerrada_auto    (NEW: timeout / no signal)
                     → cerrada_admin   (NEW: manual admin cleanup)
```

---

## B3: Orphan Round Cleanup (immediate fix)

### New endpoint

`POST /api/ops/rondas/cerrar-huerfanas`

- Auth: requires `ops.rondas` permission + `rondas_configure` capability
- Input: `{ maxHoursOpen?: number }` (default: 4)
- Query: `isAdHoc: true, status: "en_curso", startedAt < NOW() - maxHours`
- Update: `status: "cerrada_admin"`, `completedAt: NOW()`, `trustScore: 0`
- trustBreakdown: `{ reason: "admin_closed_orphan", closedBy: userId }`
- notes: `"Cerrada por administrador — excedió duración máxima"`
- Returns: `{ cerradas: number, ids: string[] }`

### UI

Button in MonitoreoTurnoHeader: "Cerrar rondas huérfanas" (warning icon).
Only visible when there are free rounds `en_curso` > 4 hours old.
Shows confirmation dialog with count before executing.

### Filter updates

All places that query `status` need to handle new values:
- Monitoring page queries
- MisRondas portal queries
- Ejecuciones API route
- Any reports/exports

---

## B1: Auto-close with Cron + GPS Tracking

### New Prisma model

```prisma
model OpsRondaTracking {
  id           String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  ejecucionId  String   @map("ejecucion_id") @db.Uuid
  lat          Float
  lng          Float
  accuracy     Float?
  battery      Int?
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  ejecucion OpsRondaEjecucion @relation(fields: [ejecucionId], references: [id], onDelete: Cascade)

  @@index([ejecucionId, createdAt])
  @@map("ronda_tracking")
  @@schema("ops")
}
```

Add `trackingPoints OpsRondaTracking[]` relation to `OpsRondaEjecucion`.

### New endpoint: GPS tracking

`POST /api/portal/rondas/tracking`

- Input: `{ ejecucionId, guardiaId, lat, lng, accuracy?, battery?, timestamp }`
- Validates ejecucion exists and is `en_curso`
- Creates OpsRondaTracking record
- Lightweight — no trust score recalculation

### New cron: `/api/cron/rondas/cerrar-libres`

Registered in `vercel.json` at `0 * * * *` (hourly).

Logic:
1. Find `isAdHoc: true, status: "en_curso", startedAt < NOW() - 120min`
2. For each, check last OpsRondaTracking record:
   - If last tracking > 30 min ago: close with reason `"no_signal"`
   - If startedAt > 120 min ago: close with reason `"timeout"`
3. Update to `status: "cerrada_auto"`, `completedAt: NOW()`, `trustScore: 0`
4. Create alert `tipo: "ronda_libre_timeout"`, severidad: `"warning"`
5. Trigger Pusher `ronda-completed` event

### Portal banner

In RondaActiva.tsx when `isAdHoc: true`:
- At 105 min (15 min left): yellow banner "Tu ronda se cerrará en X min"
- At 115 min (5 min left): red pulsing banner
- Constant: `FREE_ROUND_MAX_DURATION_MINUTES = 120`

---

## B2: Flexible Navigation UX

### Changes to RondaActiva.tsx (ad-hoc mode)

When `isAdHoc: true`, adjust layout:
1. **Map expanded** — 60vh (vs 45vh for template rounds)
2. **Simplified bottom panel:**
   - Large timer showing elapsed time
   - Counter: "X puntos registrados"
   - Mini-timeline of completed marcaciones (scrollable)
3. **FAB "Escanear punto"** — existing, keep as-is
4. **Route polyline** — render OpsRondaTracking points as blue polyline on map
5. **Bottom bar:** "Reportar Novedad" + "Finalizar Ronda"

### Client-side GPS tracking

New `useInterval` hook in RondaActiva that POSTs to `/api/portal/rondas/tracking` every 30 seconds. Accumulates points locally for polyline rendering without waiting for server response.

---

## Files to Modify

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Add OpsRondaTracking model + relation on OpsRondaEjecucion |
| `vercel.json` | Add cerrar-libres cron |
| `src/app/api/ops/rondas/cerrar-huerfanas/route.ts` | NEW: admin cleanup endpoint |
| `src/app/api/cron/rondas/cerrar-libres/route.ts` | NEW: auto-close cron |
| `src/app/api/portal/rondas/tracking/route.ts` | NEW: GPS tracking endpoint |
| `src/components/ops/rondas/MonitoreoTurnoHeader.tsx` | Add orphan cleanup button |
| `src/components/ops/rondas/RondasMonitoreoClient.tsx` | Handle new status values |
| `src/components/portal/rondas/RondaActiva.tsx` | Ad-hoc UX: expanded map, timer banner, tracking, polyline |
| `src/components/portal/rondas/MisRondas.tsx` | Handle new status display |
| `src/components/portal/rondas/RondaCompletada.tsx` | Handle cerrada_auto/admin display |
| `src/app/(app)/ops/rondas/monitoreo/page.tsx` | Include new statuses in queries |
| `src/app/api/portal/rondas/mis-rondas/route.ts` | Include new statuses |
| `src/app/api/ops/rondas/monitoreo/route.ts` | Include new statuses |
