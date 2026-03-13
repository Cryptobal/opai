# Rondas: 5 Mejoras — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix portal scroll overlap, add ad-hoc rounds, quick-access config, fast time picker, and fix panic button.

**Architecture:** CSS fix for overlap, Prisma schema changes for nullable fields + isAdHoc flag, new API endpoint for ad-hoc rounds, new QuickTimePicker component, and panic API fix. All changes are additive and backwards-compatible.

**Tech Stack:** Next.js 14, Prisma, PostgreSQL, React, Tailwind CSS, Pusher

---

## Task 1: Fix bottom nav overlap in portal

**Files:**
- Modify: `src/components/portal/rondas/MisRondas.tsx:338`

**Step 1: Fix padding-bottom on main content**

In `MisRondas.tsx`, line 338, change the `<main>` element:

```tsx
// Before:
<main className="flex-1 px-4 pb-24 pt-4">

// After:
<main className="flex-1 px-4 pt-4" style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom, 0px))" }}>
```

This ensures 80px base padding plus whatever safe-area-inset the device reports.

**Step 2: Verify visually**

Open the portal on mobile or devtools mobile emulation. Scroll to the bottom of the ronda list. Confirm the last card and "Reportar Incidente" button are fully visible above the bottom nav.

**Step 3: Commit**

```bash
git add src/components/portal/rondas/MisRondas.tsx
git commit -m "fix(portal): increase bottom padding to prevent nav overlap on rondas list"
```

---

## Task 2: Prisma schema changes (shared by Tasks 3 and 5)

**Files:**
- Modify: `prisma/schema.prisma` (OpsRondaEjecucion ~line 3319, OpsAlertaRonda ~line 3406)

**Step 1: Make rondaTemplateId nullable and add isAdHoc**

In `OpsRondaEjecucion` model (~line 3319):

```prisma
// Change:
  rondaTemplateId        String    @map("ronda_template_id") @db.Uuid
// To:
  rondaTemplateId        String?   @map("ronda_template_id") @db.Uuid
  isAdHoc                Boolean   @default(false) @map("is_ad_hoc")
```

Update the relation (~line 3345):

```prisma
// Change:
  rondaTemplate OpsRondaTemplate         @relation(fields: [rondaTemplateId], references: [id], onDelete: Cascade)
// To:
  rondaTemplate OpsRondaTemplate?        @relation(fields: [rondaTemplateId], references: [id], onDelete: Cascade)
```

**Step 2: Make ejecucionId nullable in OpsAlertaRonda**

In `OpsAlertaRonda` model (~line 3408):

```prisma
// Change:
  ejecucionId      String    @map("ejecucion_id") @db.Uuid
// To:
  ejecucionId      String?   @map("ejecucion_id") @db.Uuid
```

Update the relation (~line 3422):

```prisma
// Change:
  ejecucion    OpsRondaEjecucion @relation(fields: [ejecucionId], references: [id], onDelete: Cascade)
// To:
  ejecucion    OpsRondaEjecucion? @relation(fields: [ejecucionId], references: [id], onDelete: Cascade)
```

**Step 3: Generate migration**

```bash
npx prisma migrate dev --name rondas-adhoc-and-panic-nullable
```

Expected: Migration creates nullable columns and adds `is_ad_hoc` boolean with default false.

**Step 4: Generate Prisma client**

```bash
npx prisma generate
```

**Step 5: Commit**

```bash
git add prisma/
git commit -m "feat(schema): make rondaTemplateId and ejecucionId nullable, add isAdHoc flag"
```

---

## Task 3: Fix panic button

**Files:**
- Modify: `src/app/api/portal/rondas/panico/route.ts:69-91`
- Modify: `src/components/portal/rondas/PanicoModal.tsx:38-91`

**Step 1: Fix API to always create alert**

In `src/app/api/portal/rondas/panico/route.ts`, replace lines 69-91 (inside the transaction):

```typescript
    const result = await prisma.$transaction(async (tx) => {
      const incidente = await tx.opsRondaIncidente.create({
        data: {
          tenantId,
          guardiaId,
          installationId,
          ejecucionId: ejecucionId || undefined,
          tipo: "panico",
          descripcion: note || "Boton de panico activado",
          lat: lat ?? undefined,
          lng: lng ?? undefined,
          status: "abierto",
        },
      });

      // Always create alert — ejecucionId is now nullable
      const alerta = await tx.opsAlertaRonda.create({
        data: {
          tenantId,
          ejecucionId: ejecucionId || null,
          installationId,
          guardiaId,
          tipo: "panico",
          severidad: "critical",
          mensaje: `Boton de panico activado por ${guardiaNombre}`,
          data: {
            lat: lat ?? null,
            lng: lng ?? null,
            note: note ?? null,
            guardiaId,
          } as never,
        },
      });

      return { incidente, alerta };
    });
```

**Step 2: Add immediate feedback in PanicoModal**

In `src/components/portal/rondas/PanicoModal.tsx`, modify `handleConfirm` (lines 38-91). Replace the function body:

```typescript
  const handleConfirm = useCallback(async () => {
    if (countdown > 0 || sending) return;
    setSending(true);
    setError(null);

    // Start GPS in background — don't block the request
    let lat: number | undefined;
    let lng: number | undefined;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 30000,
        });
      });
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch {
      // GPS failed — send without coordinates
    }

    try {
      const res = await fetch("/api/portal/rondas/panico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guardiaId: session.guardiaId,
          installationId: session.installationId,
          tenantId: session.tenantId,
          lat,
          lng,
          ejecucionId: activeEjecucionId || undefined,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Error al enviar alerta");
      }

      // Haptic feedback
      if (navigator.vibrate) navigator.vibrate(1000);

      setSent(true);

      // Auto-close after 2 seconds
      setTimeout(() => {
        onPanicSent();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al enviar alerta");
      setSending(false);
    }
  }, [countdown, sending, session, activeEjecucionId, onPanicSent]);
```

Also update the confirm button text (line 165-169) to show GPS feedback:

```tsx
        {sending
          ? "Enviando alerta..."
          : countdown > 0
            ? `Espera ${countdown}s...`
            : "CONFIRMAR PANICO"}
```

**Step 3: Verify**

Open the portal without an active ronda. Press panic → wait countdown → confirm. Should show "Enviando alerta..." then "Alerta enviada" screen.

**Step 4: Commit**

```bash
git add src/app/api/portal/rondas/panico/route.ts src/components/portal/rondas/PanicoModal.tsx
git commit -m "fix(portal): panic button works without active ronda, reduced GPS timeout"
```

---

## Task 4: QuickTimePicker component

**Files:**
- Create: `src/components/ops/rondas/QuickTimePicker.tsx`
- Modify: `src/components/ops/rondas/programacion-form.tsx:39-40,87-94`

**Step 1: Create QuickTimePicker**

Create `src/components/ops/rondas/QuickTimePicker.tsx`:

```tsx
"use client";

import { useState, useRef, useEffect } from "react";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = ["00", "15", "30", "45"];

interface QuickTimePickerProps {
  value: string; // "HH:MM"
  onChange: (value: string) => void;
  label?: string;
}

export function QuickTimePicker({ value, onChange, label }: QuickTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [selectedHour, setSelectedHour] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const currentHour = value.split(":")[0] ?? "21";
  const currentMinute = value.split(":")[1] ?? "00";

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSelectedHour(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleHourClick = (h: string) => {
    setSelectedHour(h);
  };

  const handleMinuteClick = (m: string) => {
    const h = selectedHour ?? currentHour;
    onChange(`${h}:${m}`);
    setOpen(false);
    setSelectedHour(null);
  };

  return (
    <div className="relative" ref={ref}>
      {label && (
        <label className="text-[11px] text-muted-foreground mb-0.5 block">{label}</label>
      )}
      <button
        type="button"
        onClick={() => { setOpen(!open); setSelectedHour(null); }}
        className="flex h-9 w-full items-center justify-between rounded border border-border bg-background px-3 text-sm hover:border-primary/40 transition-colors"
      >
        <span>{value}</span>
        <svg className="h-3.5 w-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-[320px] rounded-xl border border-[#1e293b] bg-[#111827] p-3 shadow-xl">
          {/* Hour grid */}
          {!selectedHour && (
            <>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#64748b]">Hora</p>
              <div className="grid grid-cols-6 gap-1">
                {HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => handleHourClick(h)}
                    className={[
                      "rounded-lg py-1.5 text-xs font-medium transition-colors",
                      h === currentHour
                        ? "bg-[#2dd4bf]/20 text-[#2dd4bf] border border-[#2dd4bf]/30"
                        : "text-[#94a3b8] hover:bg-white/5 hover:text-[#f1f5f9]",
                    ].join(" ")}
                  >
                    {h}:00
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Minute selector */}
          {selectedHour && (
            <>
              <div className="mb-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedHour(null)}
                  className="text-[11px] text-[#64748b] hover:text-[#f1f5f9]"
                >
                  &larr; Volver
                </button>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#64748b]">
                  {selectedHour}:__
                </p>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {MINUTES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleMinuteClick(m)}
                    className={[
                      "rounded-lg py-3 text-sm font-semibold transition-colors",
                      selectedHour === currentHour && m === currentMinute
                        ? "bg-[#2dd4bf]/20 text-[#2dd4bf] border border-[#2dd4bf]/30"
                        : "bg-white/5 text-[#94a3b8] hover:bg-[#2dd4bf]/10 hover:text-[#2dd4bf]",
                    ].join(" ")}
                  >
                    {selectedHour}:{m}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Update programacion-form defaults and use QuickTimePicker**

In `src/components/ops/rondas/programacion-form.tsx`:

Add import at top (after line 3):

```tsx
import { QuickTimePicker } from "@/components/ops/rondas/QuickTimePicker";
```

Change defaults (lines 39-40):

```tsx
// Before:
  const [horaInicio, setHoraInicio] = useState(editingProgramacion?.horaInicio ?? "22:00");
  const [horaFin, setHoraFin] = useState(editingProgramacion?.horaFin ?? "06:00");

// After:
  const [horaInicio, setHoraInicio] = useState(editingProgramacion?.horaInicio ?? "21:00");
  const [horaFin, setHoraFin] = useState(editingProgramacion?.horaFin ?? "08:00");
```

Replace time inputs (lines 87-94):

```tsx
// Before:
        <div className="space-y-0.5">
          <label className="text-[11px] text-muted-foreground">Hora inicio</label>
          <Input type="time" className="h-9" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
        </div>
        <div className="space-y-0.5">
          <label className="text-[11px] text-muted-foreground">Hora fin</label>
          <Input type="time" className="h-9" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
        </div>

// After:
        <QuickTimePicker value={horaInicio} onChange={setHoraInicio} label="Hora inicio" />
        <QuickTimePicker value={horaFin} onChange={setHoraFin} label="Hora fin" />
```

**Step 3: Verify**

Open Configuracion > Programacion tab. Confirm:
- Default hours show 21:00 and 08:00
- Clicking opens hour grid, selecting hour shows minute grid
- Selecting minute sets the value and closes picker

**Step 4: Commit**

```bash
git add src/components/ops/rondas/QuickTimePicker.tsx src/components/ops/rondas/programacion-form.tsx
git commit -m "feat(rondas): quick time picker for programacion, default 21:00-08:00"
```

---

## Task 5: Quick-access instalaciones en Configuracion

**Files:**
- Modify: `src/app/(app)/ops/rondas/configuracion/page.tsx:18-35`
- Modify: `src/components/ops/rondas/RondasConfiguracionClient.tsx:35-41,484-493`

**Step 1: Add checkpoint count query to server page**

In `src/app/(app)/ops/rondas/configuracion/page.tsx`, after the existing queries (~line 35), add a third query. Replace lines 18-35:

```tsx
  const [installations, accounts, checkpointCounts] = await Promise.all([
    prisma.crmInstallation.findMany({
      where: { tenantId, isActive: true },
      select: {
        id: true, name: true, address: true, commune: true, lat: true, lng: true,
        accountId: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.crmAccount.findMany({
      where: {
        tenantId,
        installations: { some: { isActive: true } },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.opsCheckpoint.groupBy({
      by: ["installationId"],
      where: { tenantId, isActive: true },
      _count: { id: true },
    }),
  ]);

  const installationStats = checkpointCounts.map((c) => ({
    installationId: c.installationId,
    checkpointCount: c._count.id,
  }));
```

Pass the stats to the client component (~line 44):

```tsx
      <RondasConfiguracionClient
        installations={JSON.parse(JSON.stringify(installations))}
        clients={JSON.parse(JSON.stringify(accounts))}
        installationStats={installationStats}
      />
```

**Step 2: Update client component to accept and render stats**

In `src/components/ops/rondas/RondasConfiguracionClient.tsx`:

Update props (line 35-41):

```tsx
export function RondasConfiguracionClient({
  installations,
  clients,
  installationStats = [],
}: {
  installations: Installation[];
  clients: Client[];
  installationStats?: { installationId: string; checkpointCount: number }[];
}) {
```

Add a memo for installations with stats (after line 56):

```tsx
  const installationsWithCheckpoints = useMemo(() => {
    const statsMap = new Map(installationStats.map((s) => [s.installationId, s.checkpointCount]));
    return installations
      .filter((i) => statsMap.has(i.id))
      .map((i) => ({ ...i, checkpointCount: statsMap.get(i.id)! }))
      .sort((a, b) => b.checkpointCount - a.checkpointCount);
  }, [installations, installationStats]);
```

Replace the empty state (lines 484-493) with quick-access cards:

```tsx
      {/* No installation selected — show quick access */}
      {!installationId && (
        <div className="space-y-4">
          {installationsWithCheckpoints.length > 0 && (
            <>
              <p className="text-[11px] uppercase tracking-wider font-semibold text-[#64748b]">
                Instalaciones con checkpoints
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {installationsWithCheckpoints.map((inst) => (
                  <button
                    key={inst.id}
                    type="button"
                    onClick={() => {
                      if (inst.accountId) setClientId(inst.accountId);
                      setInstallationId(inst.id);
                    }}
                    className="flex items-start gap-3 rounded-xl border border-[#1e293b] bg-[#111827] p-4 text-left transition-colors hover:border-[#2dd4bf]/40 hover:bg-[#2dd4bf]/5"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#2dd4bf]/10">
                      <MapPin className="h-5 w-5 text-[#2dd4bf]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-[#f1f5f9] truncate">{inst.name}</p>
                      {inst.address && (
                        <p className="text-[11px] text-[#64748b] truncate">{inst.address}</p>
                      )}
                      <p className="mt-1 text-[11px]">
                        <span className="font-bold text-[#a855f7]">{inst.checkpointCount}</span>
                        <span className="text-[#64748b]"> checkpoint{inst.checkpointCount !== 1 ? "s" : ""}</span>
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {installationsWithCheckpoints.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-[#2dd4bf]/10 flex items-center justify-center mb-4">
                <MapPin className="w-6 h-6 text-[#2dd4bf]" />
              </div>
              <p className="text-[15px] font-semibold text-[#f1f5f9] mb-1">Selecciona una instalacion</p>
              <p className="text-[13px] text-[#94a3b8]">Elige un cliente e instalacion para configurar sus rondas.</p>
            </div>
          )}
        </div>
      )}
```

**Step 3: Verify**

Open Configuracion page without selecting anything. Should see grid of installation cards with checkpoint counts. Click one — should auto-select client + installation and load data.

**Step 4: Commit**

```bash
git add src/app/\(app\)/ops/rondas/configuracion/page.tsx src/components/ops/rondas/RondasConfiguracionClient.tsx
git commit -m "feat(rondas): quick-access installation cards in configuracion"
```

---

## Task 6: Ronda Libre — API endpoint

**Files:**
- Create: `src/app/api/portal/rondas/iniciar-libre/route.ts`

**Step 1: Create the ad-hoc ronda API**

Create `src/app/api/portal/rondas/iniciar-libre/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  guardiaId: z.string().uuid(),
  installationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  deviceInfo: z.record(z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Datos invalidos" }, { status: 400 });
    }

    const { guardiaId, installationId, tenantId, deviceInfo } = parsed.data;

    // Validate guard belongs to tenant
    const guardia = await prisma.opsGuardia.findFirst({
      where: { id: guardiaId, tenantId },
    });
    if (!guardia) {
      return NextResponse.json({ success: false, error: "Guardia no encontrado" }, { status: 404 });
    }

    // Check no other ad-hoc ronda is already en_curso for this guard
    const existing = await prisma.opsRondaEjecucion.findFirst({
      where: {
        guardiaId,
        tenantId,
        isAdHoc: true,
        status: "en_curso",
      },
    });
    if (existing) {
      return NextResponse.json({
        success: false,
        error: "Ya tienes una ronda libre en curso",
      }, { status: 409 });
    }

    const now = new Date();

    const ejecucion = await prisma.opsRondaEjecucion.create({
      data: {
        tenantId,
        guardiaId,
        installationId,
        isAdHoc: true,
        rondaTemplateId: null,
        programacionId: null,
        status: "en_curso",
        scheduledAt: now,
        startedAt: now,
        checkpointsTotal: 0,
        checkpointsCompletados: 0,
        deviceInfo: deviceInfo as any,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        ejecucionId: ejecucion.id,
        status: ejecucion.status,
        startedAt: ejecucion.startedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error("[PORTAL_RONDAS_INICIAR_LIBRE]", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/portal/rondas/iniciar-libre/route.ts
git commit -m "feat(api): POST /api/portal/rondas/iniciar-libre for ad-hoc rounds"
```

---

## Task 7: Ronda Libre — Update marcar API for ad-hoc

**Files:**
- Modify: `src/app/api/portal/rondas/marcar/route.ts`

**Step 1: Allow marking without template**

The existing marcar route fetches the execution with `rondaTemplate` included. For ad-hoc rounds, `rondaTemplateId` is null so the include returns null. Key changes:

1. In the execution fetch (~line 59), the include for `rondaTemplate` already handles null via the optional relation.

2. In the checkpoint lookup (~line 88), when `rondaTemplate` is null (ad-hoc), use `installationId` directly from the execution instead of `execution.rondaTemplate.installationId`:

```typescript
// Replace checkpoint lookup section:
    const cpInstallationId = execution.rondaTemplate?.installationId ?? execution.installationId;
    if (!cpInstallationId) {
      return NextResponse.json({ success: false, error: "Instalacion no encontrada" }, { status: 400 });
    }

    const checkpoint = await prisma.opsCheckpoint.findFirst({
      where: {
        tenantId: execution.tenantId,
        installationId: cpInstallationId,
        isActive: true,
        ...(checkpointId ? { id: checkpointId } : { qrCode: checkpointQrCode }),
      },
      select: { id: true, name: true, lat: true, lng: true, geoRadiusM: true, verificationType: true },
    });
```

3. In the QR enforcement section (~line 105), guard against null template:

```typescript
    if (
      execution.rondaTemplate?.qrRequerido &&
      (checkpoint.verificationType === "QR" || checkpoint.verificationType === "BOTH") &&
      !checkpointQrCode
    ) {
      return NextResponse.json({ success: false, error: "Se requiere escaneo QR para este checkpoint" }, { status: 400 });
    }
```

4. For the installationId used in alerts (~line 233), use the same fallback:

```typescript
    installationId: execution.rondaTemplate?.installationId ?? execution.installationId!,
```

**Step 2: Commit**

```bash
git add src/app/api/portal/rondas/marcar/route.ts
git commit -m "feat(api): marcar endpoint supports ad-hoc rondas without template"
```

---

## Task 8: Ronda Libre — Update completar API for ad-hoc

**Files:**
- Modify: `src/app/api/portal/rondas/completar/route.ts`

**Step 1: Handle ad-hoc completion**

In the completar route, the missed checkpoint logic (~lines 59-86) depends on `execution.rondaTemplate.checkpoints`. For ad-hoc rounds, there is no template, so all marked checkpoints are "completed" and there are no "missed" ones.

Guard the missed checkpoint section:

```typescript
    // Skip missed checkpoint logic for ad-hoc rondas
    const isAdHoc = !execution.rondaTemplateId;
    let missedData: any[] = [];

    if (!isAdHoc) {
      const markedCpIds = new Set(execution.marcaciones.map((m: any) => m.checkpointId));
      missedData = execution.rondaTemplate!.checkpoints
        .filter((tc: any) => !markedCpIds.has(tc.checkpointId))
        .map((tc: any) => ({
          // ... existing missed data creation
        }));

      if (missedData.length > 0) {
        await prisma.opsMarcacionCheckpoint.createMany({ data: missedData });
      }
    }
```

For status determination:

```typescript
    const status = isAdHoc
      ? "completada"
      : missedPercent > 20 ? "incompleta" : "completada";
```

For trust score, use a simplified calculation for ad-hoc:

```typescript
    const trustResult = isAdHoc
      ? { score: 100, breakdown: { adHoc: true } }
      : calculateRondaTrustScore({ /* existing params */ });
```

For checkpoint details at the end, for ad-hoc rounds use marcaciones directly:

```typescript
    let checkpointDetails;
    if (isAdHoc) {
      const marcaciones = await prisma.opsMarcacionCheckpoint.findMany({
        where: { ejecucionId },
        include: { checkpoint: { select: { id: true, name: true } } },
        orderBy: { timestamp: "asc" },
      });
      checkpointDetails = marcaciones.map((m: any) => ({
        name: m.checkpoint?.name ?? "Checkpoint",
        status: m.status ?? "COMPLETED",
        timestamp: m.timestamp?.toISOString(),
        distanceM: m.geoDistanciaM,
        geoValidada: m.geoValidada ?? false,
        qrScanned: m.verificationMethod === "QR" || m.verificationMethod === "BOTH",
        hasPhoto: !!m.fotoEvidenciaUrl,
      }));
    } else {
      // existing templateCheckpointsForDetail logic
    }
```

**Step 2: Commit**

```bash
git add src/app/api/portal/rondas/completar/route.ts
git commit -m "feat(api): completar endpoint supports ad-hoc rondas"
```

---

## Task 9: Ronda Libre — Portal UI (MisRondas + RondaActiva)

**Files:**
- Modify: `src/components/portal/rondas/MisRondas.tsx`
- Modify: `src/components/portal/rondas/RondaActiva.tsx`
- Modify: `src/components/portal/rondas/RondasPortalClient.tsx`

**Step 1: Add "Iniciar Ronda Libre" button in MisRondas**

In `src/components/portal/rondas/MisRondas.tsx`, update the Props interface (~line 49):

```tsx
interface Props {
  session: RondasSession;
  onLogout: () => void;
  onIniciarRonda: (ejecucionId: string) => void;
  onIniciarRondaLibre: () => void;
  onReportIncident: () => void;
}
```

Update destructuring (~line 181):

```tsx
export function MisRondas({ session, onLogout, onIniciarRonda, onIniciarRondaLibre, onReportIncident }: Props) {
```

Add the button after the date header and before the error section (~after line 366):

```tsx
        {/* Ad-hoc ronda button */}
        <button
          onClick={onIniciarRondaLibre}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-teal-700/50 bg-teal-950/30 py-4 text-lg font-semibold text-teal-400 transition-colors hover:bg-teal-900/40 active:bg-teal-900/60"
          style={{ minHeight: 56 }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Iniciar Ronda Libre
        </button>
```

**Step 2: Add ad-hoc handler in RondasPortalClient**

In `src/components/portal/rondas/RondasPortalClient.tsx`, add the handler after `handleIniciarRonda` (~after line 147):

```tsx
  const handleIniciarRondaLibre = useCallback(async () => {
    if (!session) return;
    setLoadingRonda(true);
    try {
      const res = await fetch("/api/portal/rondas/iniciar-libre", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guardiaId: session.guardiaId,
          installationId: session.installationId,
          tenantId: session.tenantId,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setLoadingRonda(false);
        return;
      }

      setActiveEjecucionId(json.data.ejecucionId);
      setActiveRondaData({
        ejecucionId: json.data.ejecucionId,
        templateId: "",
        templateName: "Ronda Libre",
        status: "en_curso",
        scheduledAt: new Date().toISOString(),
        startedAt: json.data.startedAt,
        checkpointsTotal: 0,
        checkpointsCompletados: 0,
        qrRequerido: false,
        orderMode: "flexible",
        estimatedDurationMin: null,
        checkpoints: [],
      });
      setScreen("ronda-activa");
    } catch {
      // Network error
    } finally {
      setLoadingRonda(false);
    }
  }, [session]);
```

Pass the prop to MisRondas (~line 203):

```tsx
          <MisRondas
            session={session}
            onLogout={handleLogout}
            onIniciarRonda={handleIniciarRonda}
            onIniciarRondaLibre={handleIniciarRondaLibre}
            onReportIncident={() => setShowIncidentModal(true)}
          />
```

**Step 3: Update RondaActiva to handle ad-hoc mode**

In `src/components/portal/rondas/RondaActiva.tsx`, the component needs to detect ad-hoc mode (no template, empty checkpoints) and adjust:

Add a derived value near the top of the component:

```tsx
  const isAdHoc = !rondaData.templateId;
```

Where `sortedCheckpoints` is computed, handle empty array for ad-hoc:

```tsx
  const sortedCheckpoints = useMemo(() => {
    if (isAdHoc) return checkpoints; // Show as-is, ordered by scan time
    // ... existing sorting logic
  }, [checkpoints, isAdHoc]);
```

In the render, when `isAdHoc && checkpoints.length === 0`, show a prompt to scan:

```tsx
  {isAdHoc && sortedCheckpoints.length === 0 && (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-teal-500/10">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-white">Ronda Libre</h3>
      <p className="mt-1 text-sm text-gray-400">Escanea codigos QR de los checkpoints que visites</p>
    </div>
  )}
```

For ad-hoc, the "Escanear QR" / scan button should always be visible (not tied to a specific checkpoint). Add a floating scan button when ad-hoc:

```tsx
  {isAdHoc && (
    <button
      onClick={() => setMarkingCheckpointId("ad-hoc-scan")}
      className="fixed bottom-24 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-teal-500 shadow-lg shadow-teal-500/30 transition-transform active:scale-95"
      aria-label="Escanear checkpoint"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
      </svg>
    </button>
  )}
```

The title should show "Ronda Libre" instead of the template name when ad-hoc.

**Step 4: Commit**

```bash
git add src/components/portal/rondas/MisRondas.tsx src/components/portal/rondas/RondaActiva.tsx src/components/portal/rondas/RondasPortalClient.tsx
git commit -m "feat(portal): ronda libre UI — button in MisRondas, ad-hoc mode in RondaActiva"
```

---

## Task 10: Ronda Libre — Monitor badge

**Files:**
- Modify: `src/components/ops/rondas/MonitoreoGuardPanel.tsx`
- Modify: `src/components/ops/rondas/RondasMonitoreoClient.tsx:144-179`

**Step 1: Add isAdHoc to guard panel data**

In `src/components/ops/rondas/RondasMonitoreoClient.tsx`, in the `guardPanelData` memo (~line 150), add:

```tsx
      isAdHoc: r.isAdHoc ?? false,
      templateName: r.isAdHoc ? "Ronda Libre" : (r.rondaTemplate?.name ?? "Ronda"),
```

**Step 2: Update monitoreo API to include isAdHoc**

In `src/app/api/ops/rondas/monitoreo/route.ts`, the query already fetches all `en_curso` executions. Ad-hoc rounds will automatically be included since they have `status: "en_curso"`. Just add `isAdHoc` to the select. Add after the `include` block (~line 17):

The `findMany` already returns all fields by default, so `isAdHoc` is already in the response. No API change needed.

**Step 3: Add badge in MonitoreoGuardPanel**

In `src/components/ops/rondas/MonitoreoGuardPanel.tsx`, wherever `templateName` is rendered, add a badge when `isAdHoc`:

```tsx
{ronda.isAdHoc && (
  <span className="ml-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-amber-400">
    Libre
  </span>
)}
```

**Step 4: Handle null template in mapCheckpoints**

In `RondasMonitoreoClient.tsx`, the `mapCheckpoints` memo (~line 95) iterates `r.rondaTemplate?.checkpoints`. For ad-hoc rounds, template is null, so use marcaciones directly:

```tsx
  const mapCheckpoints = useMemo(() => {
    const cps: any[] = [];
    filtered.forEach((r: any) => {
      if (r.rondaTemplate) {
        // Existing logic for template-based rondas
        const markedIds = new Set((r.marcaciones ?? []).map((m: any) => m.checkpointId));
        (r.rondaTemplate.checkpoints ?? []).forEach((tc: any, i: number) => {
          const cp = tc.checkpoint;
          if (cp?.lat != null && cp?.lng != null) {
            cps.push({
              id: `${r.id}-${cp.id}`,
              name: cp.name,
              lat: cp.lat,
              lng: cp.lng,
              radiusM: cp.geoRadiusM ?? 30,
              status: markedIds.has(cp.id) ? "completed" : i === 0 || markedIds.size === i ? "active" : "pending",
            });
          }
        });
      } else {
        // Ad-hoc: show marked checkpoints
        (r.marcaciones ?? []).forEach((m: any) => {
          if (m.lat != null && m.lng != null) {
            cps.push({
              id: `${r.id}-${m.checkpointId}`,
              name: m.checkpoint?.name ?? "Checkpoint",
              lat: m.lat,
              lng: m.lng,
              radiusM: 30,
              status: "completed",
            });
          }
        });
      }
    });
    return cps;
  }, [filtered]);
```

**Step 5: Commit**

```bash
git add src/components/ops/rondas/MonitoreoGuardPanel.tsx src/components/ops/rondas/RondasMonitoreoClient.tsx
git commit -m "feat(monitor): show ad-hoc rondas with 'Libre' badge"
```

---

## Task 11: Final verification

**Step 1: Run build**

```bash
npm run build
```

Expected: No TypeScript errors, successful build.

**Step 2: Manual QA checklist**

- [ ] Portal: scroll rondas list — bottom nav doesn't overlap
- [ ] Portal: panic button works without active ronda
- [ ] Portal: "Iniciar Ronda Libre" creates ad-hoc round
- [ ] Portal: ad-hoc round — can scan QR checkpoints freely
- [ ] Portal: ad-hoc round — can complete
- [ ] Monitor: ad-hoc ronda appears with "Libre" badge
- [ ] Monitor: ad-hoc checkpoints shown on map
- [ ] Config: installations with checkpoints shown as cards
- [ ] Config: clicking card selects installation
- [ ] Config: time picker shows hour grid → minute grid
- [ ] Config: default hours are 21:00 and 08:00

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat(rondas): 5 improvements — scroll fix, ad-hoc rounds, quick-access, time picker, panic fix"
```
