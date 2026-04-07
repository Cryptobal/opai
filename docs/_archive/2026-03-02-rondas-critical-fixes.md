# Rondas Critical Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all critical and high-priority warnings in the rondas system — security holes, timezone bugs, schema integrity gaps, and scoring formula issues — before building the guard portal.

**Architecture:** Five sequential phases: (1) Security patches, (2) Timezone overhaul with `date-fns-tz`, (3) Prisma schema + migration, (4) Trust score & anomaly fixes, (5) UI resilience. Each phase is independently testable and committable.

**Tech Stack:** Next.js 14, Prisma, PostgreSQL, TypeScript, date-fns + date-fns-tz, Zod

---

## Phase 1: Security Patches

### Task 1: Add authentication to `dispositivos/validate` endpoint

**Files:**
- Modify: `src/app/api/ops/rondas/dispositivos/validate/route.ts`

**Step 1: Add auth imports and gate**

Replace lines 1-16 of the file with:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { resolveApiPerms, canView } from "@/lib/permissions";

const schema = z.object({
  installationId: z.string().uuid(),
  deviceId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Datos inválidos" }, { status: 400 });
    }
```

**Step 2: Add tenantId filter to the query**

Replace the `findFirst` query (around line 18-21 in original) with:

```typescript
    const device = await prisma.opsDispositivoInstalacion.findFirst({
      where: {
        tenantId: ctx.tenantId,
        installationId: parsed.data.installationId,
        deviceId: parsed.data.deviceId,
      },
    });
```

**Step 3: Remove side-effect (lastAccessAt update) from validation**

Remove the `update` call that writes `lastAccessAt` on every validate call. The response should be read-only:

```typescript
    return NextResponse.json({
      success: true,
      data: {
        valid: !!device,
        isAuthorized: device?.isAuthorized ?? false,
      },
    });
  } catch (err) {
    console.error("[DISPOSITIVOS_VALIDATE]", err);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
```

**Step 4: Verify the fix compiles**

Run: `npx tsc --noEmit src/app/api/ops/rondas/dispositivos/validate/route.ts`
Expected: No errors

**Step 5: Commit**

```bash
git add src/app/api/ops/rondas/dispositivos/validate/route.ts
git commit -m "fix(security): add auth + tenant isolation to dispositivos/validate endpoint

Previously had no authentication at all - anyone could probe device/installation
combinations and trigger lastAccessAt writes. Now requires auth + tenant filter
and removes the write side-effect from validation."
```

---

### Task 2: Add `hasCapability` check to `ia/config` PUT

**Files:**
- Modify: `src/app/api/ops/rondas/ia/config/route.ts` (line 28)

**Step 1: Add capability import and check**

At line 28, change:

```typescript
// BEFORE:
    if (!canEdit(perms, "ops", "rondas")) {

// AFTER:
    if (!canEdit(perms, "ops", "rondas") || !hasCapability(perms, "rondas_configure")) {
```

Ensure `hasCapability` is in the import at the top of the file (add it if missing):

```typescript
import { resolveApiPerms, canEdit, canView, hasCapability } from "@/lib/permissions";
```

**Step 2: Commit**

```bash
git add src/app/api/ops/rondas/ia/config/route.ts
git commit -m "fix(security): require rondas_configure capability for IA config changes"
```

---

### Task 3: Add checkpoint-installation validation to templates PATCH

**Files:**
- Modify: `src/app/api/ops/rondas/templates/[id]/route.ts` (lines 65-76)

**Step 1: Add validation before checkpoint insert**

Inside the PATCH handler's transaction, after `if (parsed.data.checkpointIds)` on line 65, add validation before the `deleteMany`:

```typescript
      if (parsed.data.checkpointIds) {
        // Validate all checkpoints belong to this template's installation
        const validCheckpoints = await tx.opsCheckpoint.findMany({
          where: {
            id: { in: parsed.data.checkpointIds },
            tenantId: ctx.tenantId,
            installationId: current.installationId,
          },
          select: { id: true },
        });
        const validIds = new Set(validCheckpoints.map((c) => c.id));
        const invalidIds = parsed.data.checkpointIds.filter((id) => !validIds.has(id));
        if (invalidIds.length > 0) {
          return NextResponse.json(
            { success: false, error: `Checkpoints no pertenecen a la instalación: ${invalidIds.join(", ")}` },
            { status: 400 },
          );
        }

        await tx.opsRondaCheckpoint.deleteMany({ where: { rondaTemplateId: id, tenantId: ctx.tenantId } });
        await tx.opsRondaCheckpoint.createMany({
          data: parsed.data.checkpointIds.map((checkpointId, idx) => ({
            tenantId: ctx.tenantId,
            rondaTemplateId: id,
            checkpointId,
            orderIndex: idx + 1,
            isRequired: true,
          })),
        });
      }
```

**Step 2: Commit**

```bash
git add src/app/api/ops/rondas/templates/[id]/route.ts
git commit -m "fix(security): validate checkpoint-installation ownership in template PATCH

Matches the validation already present in the POST handler. Prevents
cross-installation checkpoint assignment via template updates."
```

---

### Task 4: Add CRON_SECRET support to check-pending endpoint

**Files:**
- Modify: `src/app/api/ops/rondas/cron/check-pending/route.ts`

**Step 1: Replace auth with dual auth (cron secret OR user session)**

Replace the entire file with:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { resolveApiPerms, canEdit, hasCapability } from "@/lib/permissions";
import { checkPendingRounds } from "@/lib/rondas/alert-engine";

export async function POST(request: NextRequest) {
  try {
    // Support two auth methods:
    // 1. CRON_SECRET header (for Vercel Cron / automated calls)
    // 2. User session (for manual trigger from admin UI)
    const cronSecret = request.headers.get("authorization")?.replace("Bearer ", "");
    const isCronAuth = cronSecret && cronSecret === process.env.CRON_SECRET;

    let tenantId: string;

    if (isCronAuth) {
      // Cron mode: run for all tenants (or a specific one from query)
      tenantId = request.nextUrl.searchParams.get("tenantId") ?? "";
      if (!tenantId) {
        return NextResponse.json({ success: false, error: "tenantId requerido para cron" }, { status: 400 });
      }
    } else {
      // User session mode
      const ctx = await requireAuth();
      if (!ctx) return unauthorized();
      const perms = await resolveApiPerms(ctx);
      if (!canEdit(perms, "ops", "rondas") || !hasCapability(perms, "rondas_configure")) {
        return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
      }
      tenantId = ctx.tenantId;
    }

    const result = await checkPendingRounds(tenantId);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error("[CRON_CHECK_PENDING]", err);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
```

**Step 2: Verify CRON_SECRET env var exists**

Check `.env.local` or `.env` for `CRON_SECRET`. If not present, add a placeholder:

```bash
echo "# Add a strong random secret for cron authentication" >> .env.local
echo "CRON_SECRET=change-me-to-a-real-secret" >> .env.local
```

**Step 3: Commit**

```bash
git add src/app/api/ops/rondas/cron/check-pending/route.ts
git commit -m "fix(auth): support CRON_SECRET for automated cron calls

Dual auth: Bearer token with CRON_SECRET for Vercel Cron, or user session
for manual admin triggers. Cron mode requires tenantId as query param."
```

---

## Phase 2: Timezone Overhaul

### Task 5: Install date-fns-tz and create timezone utility

**Files:**
- Create: `src/lib/rondas/timezone.ts`

**Step 1: Install date-fns-tz**

Run: `npm install date-fns-tz`

Note: `date-fns` is already a dependency. `date-fns-tz` adds timezone support.

**Step 2: Create the timezone utility**

```typescript
// src/lib/rondas/timezone.ts
import { toZonedTime, fromZonedTime } from "date-fns-tz";

/**
 * Default timezone for all ronda operations.
 * Chile Continental: America/Santiago (CLT UTC-4 / CLST UTC-3)
 */
export const CHILE_TZ = "America/Santiago";

/**
 * Convert a UTC Date to Chile local time.
 * Use this when you need to check what day/hour it is in Chile.
 */
export function toChileTime(utcDate: Date): Date {
  return toZonedTime(utcDate, CHILE_TZ);
}

/**
 * Convert a Chile local time to UTC.
 * Use this when storing dates that were entered as local Chilean times.
 */
export function fromChileTime(localDate: Date): Date {
  return fromZonedTime(localDate, CHILE_TZ);
}

/**
 * Get start of day in Chile timezone, returned as UTC.
 * Example: 2026-03-02 00:00:00 Chile time → 2026-03-02T03:00:00Z (CLT) or T04:00:00Z (CLST)
 */
export function startOfDayChile(utcDate: Date): Date {
  const local = toChileTime(utcDate);
  local.setHours(0, 0, 0, 0);
  return fromChileTime(local);
}

/**
 * Get end of day in Chile timezone, returned as UTC.
 */
export function endOfDayChile(utcDate: Date): Date {
  const local = toChileTime(utcDate);
  local.setHours(23, 59, 59, 999);
  return fromChileTime(local);
}

/**
 * Get the day-of-week (0=Sun, 6=Sat) for a UTC date in Chile timezone.
 */
export function getChileDayOfWeek(utcDate: Date): number {
  return toChileTime(utcDate).getDay();
}

/**
 * Parse "HH:mm" string as Chile local time on a given UTC date, return UTC.
 * Example: parseChileHour("08:00", someUtcDate) returns 08:00 Chile time as UTC.
 */
export function parseChileHour(timeStr: string, utcDate: Date): Date {
  const [h, m] = timeStr.split(":").map(Number);
  const local = toChileTime(utcDate);
  local.setHours(h, m, 0, 0);
  return fromChileTime(local);
}

/**
 * Format a UTC date to Chilean local time string "HH:mm".
 */
export function formatChileTime(utcDate: Date): string {
  const local = toChileTime(utcDate);
  return `${String(local.getHours()).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}`;
}
```

**Step 3: Commit**

```bash
git add src/lib/rondas/timezone.ts package.json package-lock.json
git commit -m "feat(rondas): add Chile timezone utility with date-fns-tz

Central utility for all ronda timezone operations. Handles CLT/CLST DST
transitions via America/Santiago IANA zone."
```

---

### Task 6: Fix schedule-engine to use Chile timezone

**Files:**
- Modify: `src/lib/rondas/schedule-engine.ts`

**Step 1: Rewrite schedule-engine with timezone support**

Replace the entire file with:

```typescript
import {
  toChileTime,
  parseChileHour,
  getChileDayOfWeek,
} from "./timezone";

interface ScheduleInput {
  from: Date; // UTC
  to: Date; // UTC
  diasSemana: number[]; // 0=Sun .. 6=Sat (Chile local days)
  horaInicio: string; // "HH:mm" in Chile time
  horaFin: string; // "HH:mm" in Chile time
  frecuenciaMinutos: number;
}

/**
 * Generate UTC schedule slots for the given range.
 * Hours are interpreted as Chile local time and converted to UTC.
 * Days of week are checked in Chile local time.
 */
export function buildScheduleSlots(input: ScheduleInput): Date[] {
  if (input.frecuenciaMinutos <= 0) return [];

  const slots: Date[] = [];
  const cursor = new Date(input.from);
  // Align cursor to start of day in Chile time
  const localStart = toChileTime(cursor);
  localStart.setHours(0, 0, 0, 0);

  // Iterate day by day (up to a reasonable limit)
  const maxDays = Math.ceil((input.to.getTime() - input.from.getTime()) / (24 * 60 * 60 * 1000)) + 1;

  for (let d = 0; d < maxDays && d < 366; d++) {
    const dayDate = new Date(input.from.getTime() + d * 24 * 60 * 60 * 1000);
    const dayOfWeek = getChileDayOfWeek(dayDate);

    if (!input.diasSemana.includes(dayOfWeek)) continue;

    // Parse start/end hours as Chile local time for this day, get UTC
    const windowStart = parseChileHour(input.horaInicio, dayDate);
    let windowEnd = parseChileHour(input.horaFin, dayDate);

    // Handle overnight shifts (e.g., 22:00 to 06:00)
    if (windowEnd <= windowStart) {
      windowEnd = new Date(windowEnd.getTime() + 24 * 60 * 60 * 1000);
    }

    // Generate slots within the window (exclusive of end to allow completion time)
    for (
      let ts = windowStart.getTime();
      ts < windowEnd.getTime();
      ts += input.frecuenciaMinutos * 60 * 1000
    ) {
      const slotTime = new Date(ts);
      if (slotTime >= input.from && slotTime <= input.to) {
        slots.push(slotTime);
      }
    }
  }

  return slots;
}
```

Key changes:
- Uses `getChileDayOfWeek` instead of `getUTCDay()`
- Uses `parseChileHour` instead of `Date.UTC` with raw hours
- Changed `ts <= windowEnd` to `ts < windowEnd` (exclusive end)
- Added `frecuenciaMinutos <= 0` guard
- Added `maxDays < 366` safety limit

**Step 2: Verify compilation**

Run: `npx tsc --noEmit src/lib/rondas/schedule-engine.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/rondas/schedule-engine.ts
git commit -m "fix(rondas): use Chile timezone in schedule-engine

All schedule hours are now interpreted as America/Santiago local time.
Days of week checked in local time. Handles DST transitions correctly.
Added frequency=0 guard and 366-day safety limit."
```

---

### Task 7: Fix guardia-assignment timezone + shift filtering

**Files:**
- Modify: `src/lib/rondas/guardia-assignment.ts`

**Step 1: Replace UTC boundary functions with Chile timezone**

Replace the `startOfDay`/`endOfDay` helpers at lines 10-17 with imports:

```typescript
import { startOfDayChile, endOfDayChile, toChileTime } from "./timezone";
```

Then in the main function, replace:

```typescript
// BEFORE:
  const dayStart = startOfDay(input.scheduledAt);
  const dayEnd = endOfDay(input.scheduledAt);

// AFTER:
  const dayStart = startOfDayChile(input.scheduledAt);
  const dayEnd = endOfDayChile(input.scheduledAt);
```

**Step 2: Add shift-time filtering to attendance query**

After fetching attendance rows, filter by which shift covers the scheduled time. The `slotNumber` or `checkInAt` should be used to determine if the guard was on duty at the scheduled hour:

```typescript
  // Filter attendance by shift that covers scheduledAt
  const scheduledHour = toChileTime(input.scheduledAt).getHours();
  const relevantAttendance = attendanceRows.filter((row) => {
    if (!row.checkInAt) return false;
    const checkInHour = toChileTime(row.checkInAt).getHours();
    // Simple heuristic: day shift = checkIn before 14:00, night shift = checkIn after 14:00
    // A ronda at 22:00 should match night-shift guards (checkIn >= 14:00)
    // A ronda at 08:00 should match day-shift guards (checkIn < 14:00)
    const isNightShift = checkInHour >= 14;
    const isNightRonda = scheduledHour >= 14 || scheduledHour < 6;
    return isNightShift === isNightRonda;
  });

  // Use filtered list, fall back to full list if no match
  const effectiveRows = relevantAttendance.length > 0 ? relevantAttendance : attendanceRows;
```

Then use `effectiveRows` instead of `attendanceRows` for the guard resolution logic.

**Step 3: Add logging when no guard is found**

At the end of the function where it returns null:

```typescript
  if (!fallback?.guardiaId) {
    console.warn(`[GUARDIA_ASSIGNMENT] No guard found for installation=${input.installationId} at ${input.scheduledAt.toISOString()}`);
    return { guardiaId: null, source: null };
  }
```

**Step 4: Commit**

```bash
git add src/lib/rondas/guardia-assignment.ts
git commit -m "fix(rondas): use Chile timezone in guard assignment + shift filtering

Day boundaries now use America/Santiago timezone. Added basic shift
filtering (day/night) so a night ronda doesn't get assigned a day guard.
Added warning log when no guard is found."
```

---

### Task 8: Fix alert-engine timezone + batch N+1

**Files:**
- Modify: `src/lib/rondas/alert-engine.ts`

**Step 1: Replace `toLocaleTimeString` with `formatChileTime`**

At line 184, change:

```typescript
// BEFORE:
mensaje: `Ronda "${prog.rondaTemplate.name}" no iniciada. Programada: ${ej.scheduledAt.toLocaleTimeString("es-CL")}`,

// AFTER:
mensaje: `Ronda "${prog.rondaTemplate.name}" no iniciada. Programada: ${formatChileTime(ej.scheduledAt)}`,
```

Add import at top:

```typescript
import { formatChileTime } from "./timezone";
```

**Step 2: Batch the N+1 in `checkPendingRounds`**

Replace the nested for-loop (lines 154-194) with a batched approach:

```typescript
  // 1. Fetch all pending ejecuciones across all programaciones in one query
  const allPendingEjecuciones = await prisma.opsRondaEjecucion.findMany({
    where: {
      tenantId,
      status: "pendiente",
      scheduledAt: { lte: new Date() },
      programacionId: { in: activeProgramaciones.map((p) => p.id) },
    },
    include: {
      rondaTemplate: { select: { name: true, installationId: true } },
    },
  });

  if (allPendingEjecuciones.length === 0) return { alertsCreated: 0 };

  // 2. Fetch all existing "ronda_no_iniciada" alerts for these ejecuciones in one query
  const existingAlerts = await prisma.opsAlertaRonda.findMany({
    where: {
      tenantId,
      tipo: "ronda_no_iniciada",
      ejecucionId: { in: allPendingEjecuciones.map((e) => e.id) },
    },
    select: { ejecucionId: true },
  });
  const alreadyAlerted = new Set(existingAlerts.map((a) => a.ejecucionId));

  // 3. Create missing alerts in bulk
  const newAlerts = allPendingEjecuciones
    .filter((ej) => !alreadyAlerted.has(ej.id))
    .map((ej) => ({
      tenantId,
      ejecucionId: ej.id,
      installationId: ej.rondaTemplate.installationId,
      tipo: "ronda_no_iniciada",
      severidad: "critical" as const,
      mensaje: `Ronda "${ej.rondaTemplate.name}" no iniciada. Programada: ${formatChileTime(ej.scheduledAt)}`,
      resuelta: false,
      isAcknowledged: false,
    }));

  if (newAlerts.length > 0) {
    await prisma.opsAlertaRonda.createMany({ data: newAlerts });
  }

  return { alertsCreated: newAlerts.length };
```

This replaces O(P * E * 2) queries with exactly 3 queries regardless of data size.

**Step 3: Commit**

```bash
git add src/lib/rondas/alert-engine.ts
git commit -m "fix(rondas): fix timezone in alerts + batch N+1 queries

Replace toLocaleTimeString with explicit Chile timezone formatting.
Replace nested N+1 loop in checkPendingRounds with 3 batched queries."
```

---

## Phase 3: Schema Integrity

### Task 9: Fix Prisma schema issues

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Fix OpsControlNocturnoRonda orphan FK (line ~3289)**

Add relation to the `ejecucionRondaId` field:

```prisma
  ejecucionRondaId     String?              @map("ejecucion_ronda_id") @db.Uuid
  ejecucionRonda       OpsRondaEjecucion?   @relation("ControlNocturnoRonda", fields: [ejecucionRondaId], references: [id], onDelete: SetNull)
```

And on `OpsRondaEjecucion`, add the back-reference:

```prisma
  controlNocturnoRondas OpsControlNocturnoRonda[] @relation("ControlNocturnoRonda")
```

**Step 2: Add installationId to OpsRondaIncidente (line ~3173)**

Add after `guardiaId`:

```prisma
  installationId  String?  @map("installation_id") @db.Uuid
  installation    CrmInstallation? @relation("IncidenteInstallation", fields: [installationId], references: [id], onDelete: SetNull)
```

Add index:

```prisma
  @@index([installationId], map: "idx_ops_ronda_incidente_installation")
```

And on `CrmInstallation`, add the back-reference:

```prisma
  rondaIncidentes OpsRondaIncidente[] @relation("IncidenteInstallation")
```

**Step 3: Fix OpsSupervisionFinding updatedAt (line ~2480)**

Change:

```prisma
// BEFORE:
  updatedAt  DateTime  @default(now()) @map("updated_at") @db.Timestamptz(6)

// AFTER:
  updatedAt  DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
```

**Step 4: Add unique constraint to OpsMarcacionCheckpoint (line ~3134)**

Change the index to a unique constraint:

```prisma
// BEFORE:
  @@index([ejecucionId, checkpointId], map: "idx_ops_marcacion_cp_ej_cp")

// AFTER:
  @@unique([ejecucionId, checkpointId], map: "uq_ops_marcacion_cp_ej_cp")
```

**Step 5: Remove redundant alertas Json from OpsRondaEjecucion (line ~3076)**

Remove or mark as deprecated:

```prisma
  // alertas  Json?  @db.JsonB  // DEPRECATED: use alertasRows relation instead
```

Note: If removing the column, do it in a separate migration after verifying no code reads from it. For now, leave it but add a comment.

**Step 6: Add missing index on OpsAlertaRonda.guardiaId**

Add:

```prisma
  @@index([guardiaId], map: "idx_ops_alerta_ronda_guardia")
```

**Step 7: Generate and run migration**

Run: `npx prisma migrate dev --name fix_rondas_schema_integrity`

Expected: Migration created and applied. Check for any warnings about data loss.

**Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "fix(schema): fix rondas schema integrity issues

- Add relation for OpsControlNocturnoRonda.ejecucionRondaId (was orphan FK)
- Add installationId to OpsRondaIncidente for direct queries
- Fix OpsSupervisionFinding.updatedAt (@updatedAt instead of @default(now()))
- Add unique constraint on OpsMarcacionCheckpoint(ejecucionId, checkpointId)
- Add missing index on OpsAlertaRonda.guardiaId
- Mark redundant alertas Json field as deprecated"
```

---

## Phase 4: Trust Score & Anomaly Fixes

### Task 10: Centralize speed threshold from ia-config

**Files:**
- Modify: `src/lib/rondas/ia-config.ts`
- Modify: `src/lib/rondas/anomaly-detection.ts`
- Modify: `src/lib/rondas/trust-score.ts`

**Step 1: Export default speed threshold from ia-config**

At the top of `ia-config.ts`, add:

```typescript
/** Default speed threshold in km/h — used by anomaly detection and trust scoring */
export const DEFAULT_SPEED_THRESHOLD_KMH = 15;
```

**Step 2: Use config in anomaly-detection.ts**

Replace line 23:

```typescript
// BEFORE:
  if ((input.speedFromPrevKmh ?? 0) > 15) anomalies.push("velocidad_anomala");

// AFTER:
  if ((input.speedFromPrevKmh ?? 0) > (input.speedThresholdKmh ?? DEFAULT_SPEED_THRESHOLD_KMH)) anomalies.push("velocidad_anomala");
```

Add to the `AnomalyInput` interface:

```typescript
  speedThresholdKmh?: number;
```

Add import:

```typescript
import { DEFAULT_SPEED_THRESHOLD_KMH } from "./ia-config";
```

**Step 3: Use config in trust-score.ts**

Replace line 18:

```typescript
// BEFORE:
  score += (input.speedFromPrevKmh ?? 0) <= 15 ? 20 : 0;

// AFTER:
  score += (input.speedFromPrevKmh ?? 0) <= (input.speedThresholdKmh ?? DEFAULT_SPEED_THRESHOLD_KMH) ? 20 : 0;
```

Add to `CheckpointTrustInput`:

```typescript
  speedThresholdKmh?: number;
```

Add import:

```typescript
import { DEFAULT_SPEED_THRESHOLD_KMH } from "./ia-config";
```

**Step 4: Commit**

```bash
git add src/lib/rondas/ia-config.ts src/lib/rondas/anomaly-detection.ts src/lib/rondas/trust-score.ts
git commit -m "fix(rondas): centralize speed threshold from ia-config

Speed threshold (15 km/h default) was hardcoded in 3 files. Now reads
from ia-config with DEFAULT_SPEED_THRESHOLD_KMH fallback."
```

---

### Task 11: Fix trust-score-v2 formula issues

**Files:**
- Modify: `src/lib/rondas/trust-score-v2.ts`

**Step 1: Soften time score penalty (line 39)**

Change from linear 1:1 penalty to a softer curve:

```typescript
// BEFORE:
  const timeScore = Math.round(Math.max(0, 100 - timeDeviation * 100));

// AFTER:
  // Softer curve: 50% deviation = 75 score, 100% = 50, 200% = 0
  const timeScore = Math.round(Math.max(0, 100 - timeDeviation * 50));
```

**Step 2: Fix speed consistency naming and formula (lines 55-57)**

```typescript
// BEFORE:
    const cv = avg > 0 ? variance / (avg * avg) : 0;
    speedScore = Math.round(Math.max(0, 100 - cv * 200));

// AFTER:
    const stddev = Math.sqrt(variance);
    const coefficientOfVariation = avg > 0 ? stddev / avg : 0;
    speedScore = Math.round(Math.max(0, 100 - coefficientOfVariation * 100));
```

**Step 3: Handle incomplete rondas explicitly (lines 34-37)**

```typescript
  let durationMin = 0;
  let timeScore: number;
  if (ejecucion.startedAt && ejecucion.completedAt) {
    durationMin = (new Date(ejecucion.completedAt).getTime() - new Date(ejecucion.startedAt).getTime()) / 60000;
    const timeDeviation = expectedMin > 0 ? Math.abs(durationMin - expectedMin) / expectedMin : 0;
    timeScore = Math.round(Math.max(0, 100 - timeDeviation * 50));
  } else if (ejecucion.startedAt && !ejecucion.completedAt) {
    // Started but not completed — partial penalty (not zero)
    timeScore = 30;
  } else {
    // Never started
    timeScore = 0;
  }
```

**Step 4: Commit**

```bash
git add src/lib/rondas/trust-score-v2.ts
git commit -m "fix(rondas): improve trust score formulas

- Soften time penalty: 50% curve instead of 100% (less aggressive)
- Fix speed consistency: use actual CV (stddev/mean) not CV-squared
- Handle incomplete rondas: partial score (30) instead of 0"
```

---

### Task 12: Fix anomaly-detection false positives

**Files:**
- Modify: `src/lib/rondas/anomaly-detection.ts`

**Step 1: Add minimum elapsed time check for battery anomaly**

Replace the battery check:

```typescript
// BEFORE:
  if (
    input.batteryLevel != null &&
    input.prevBatteryLevel != null &&
    input.batteryLevel === input.prevBatteryLevel
  ) {
    anomalies.push("bateria_estatica");
  }

// AFTER:
  // Only flag static battery if >10 minutes elapsed (short intervals naturally have same battery %)
  if (
    input.batteryLevel != null &&
    input.prevBatteryLevel != null &&
    input.batteryLevel === input.prevBatteryLevel &&
    (input.elapsedMinutes ?? 0) > 10
  ) {
    anomalies.push("bateria_estatica");
  }
```

Add `elapsedMinutes?: number` to the `AnomalyInput` interface.

**Step 2: Commit**

```bash
git add src/lib/rondas/anomaly-detection.ts
git commit -m "fix(rondas): reduce battery anomaly false positives

Only flag static battery when >10 minutes elapsed between checkpoints.
Short intervals naturally report same integer battery percentage."
```

---

## Phase 5: UI Resilience

### Task 13: Add error.tsx and loading.tsx to rondas routes

**Files:**
- Create: `src/app/(app)/ops/rondas/error.tsx`
- Create: `src/app/(app)/ops/rondas/loading.tsx`

**Step 1: Create error boundary**

```typescript
// src/app/(app)/ops/rondas/error.tsx
"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function RondasError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[RONDAS_ERROR]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <AlertTriangle className="h-12 w-12 text-destructive" />
      <h2 className="text-lg font-semibold">Error al cargar rondas</h2>
      <p className="text-sm text-muted-foreground max-w-md text-center">
        Ocurrió un error inesperado. Por favor intenta de nuevo.
      </p>
      <Button onClick={reset} variant="outline">
        Reintentar
      </Button>
    </div>
  );
}
```

**Step 2: Create loading state**

```typescript
// src/app/(app)/ops/rondas/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function RondasLoading() {
  return (
    <div className="space-y-6 p-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-lg" />
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/app/(app)/ops/rondas/error.tsx src/app/(app)/ops/rondas/loading.tsx
git commit -m "feat(rondas): add error boundary and loading state

Prevents blank screen on Prisma/permission errors.
Shows skeleton UI during server component loading."
```

---

### Task 14: Fix dead QR code ternary and minor code issues

**Files:**
- Modify: `src/app/api/ops/rondas/checkpoints/route.ts` (lines 88-89)

**Step 1: Fix the dead ternary**

```typescript
// BEFORE (line 88-89):
    const needsQr = parsed.data.verificationType === "QR" || parsed.data.verificationType === "BOTH";
    const qrCode = parsed.data.qrCode ?? (needsQr ? generateMarcacionCode() : generateMarcacionCode());

// AFTER:
    const needsQr = parsed.data.verificationType === "QR" || parsed.data.verificationType === "BOTH";
    const qrCode = parsed.data.qrCode ?? (needsQr ? generateMarcacionCode() : null);
```

**Step 2: Commit**

```bash
git add src/app/api/ops/rondas/checkpoints/route.ts
git commit -m "fix(rondas): only generate QR code when verification type requires it

Dead ternary was generating QR codes for GEOFENCE-only checkpoints."
```

---

## Final Step: Verify everything compiles

### Task 15: Full build verification

**Step 1: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 2: Run Prisma generate**

Run: `npx prisma generate`
Expected: Success

**Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds (or fails only on pre-existing issues unrelated to our changes)

**Step 4: Final commit if any type fixes needed**

```bash
git add -A
git commit -m "chore: fix type errors from rondas critical fixes"
```

---

## Summary

| Phase | Tasks | Est. Time | Impact |
|-------|-------|-----------|--------|
| 1. Security | Tasks 1-4 | 20 min | Closes auth holes and cross-tenant leaks |
| 2. Timezone | Tasks 5-8 | 30 min | Fixes 3-4 hour scheduling offset for Chile |
| 3. Schema | Task 9 | 15 min | Fixes data integrity gaps + migration |
| 4. Trust Score | Tasks 10-12 | 15 min | Fixes false positives and harsh penalties |
| 5. UI | Tasks 13-14 | 10 min | Prevents blank screens on errors |
| 6. Verify | Task 15 | 5 min | Ensures everything compiles and builds |
| **Total** | **15 tasks** | **~95 min** | |
