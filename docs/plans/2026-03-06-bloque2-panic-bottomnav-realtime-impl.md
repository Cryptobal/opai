# Bloque 2 — Bottom Nav + Panic Button + Real-time Alerts — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a bottom navigation bar to the guard portal, implement a panic button with 3-second confirmation, and wire real-time Pusher alerts to the monitoring dashboard so operators receive instant panic notifications with alarm sound.

**Architecture:** 6 new files (3 portal components, 1 dashboard component, 1 API route, 1 Pusher helper), 7 modified files. The guard portal gets a fixed bottom nav replacing the chat FAB; the panic flow creates an alert+incident via a new API route that triggers a Pusher event; the monitoring dashboard subscribes to Pusher and renders an alarm banner. No schema changes needed.

**Tech Stack:** Next.js 15, React 18, TypeScript, Tailwind CSS, Pusher (server `pusher` + client `pusher-js`), Prisma

**Design doc:** `docs/plans/2026-03-06-bloque2-panic-bottomnav-realtime-design.md`

---

## Task 1: Export Pusher Server Helper for Non-Chat Events

**Files:**
- Modify: `src/lib/chat.ts` (add 1 export)

**Step 1: Add `getPusherServer` export**

The file already has a private `getPusher()` function (line 12). Export it with a public name so the panic API can use it:

At the bottom of `src/lib/chat.ts` (after the existing `authorizePusherChannel` function, ~line 68), add:

```typescript
/**
 * Get the server-side Pusher instance for triggering events
 * outside of chat (e.g., monitoring alerts).
 */
export function getPusherServer(): Pusher {
  return getPusher();
}
```

**Step 2: Verify build compiles**

Run:
```bash
npx tsc --noEmit src/lib/chat.ts 2>&1 | head -10
```

**Step 3: Commit**

```bash
git add src/lib/chat.ts
git commit -m "feat(pusher): export getPusherServer for non-chat event triggers"
```

---

## Task 2: Create Panic API Endpoint

**Files:**
- Create: `src/app/api/portal/rondas/panico/route.ts`

**Step 1: Create the endpoint**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPusherServer } from "@/lib/chat";

const schema = z.object({
  guardiaId: z.string().uuid(),
  installationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  ejecucionId: z.string().uuid().optional(),
  note: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Datos invalidos" }, { status: 400 });
    }

    const { guardiaId, installationId, tenantId, lat, lng, ejecucionId, note } = parsed.data;

    // Validate guard exists and belongs to tenant
    const guardia = await prisma.opsGuardia.findFirst({
      where: { id: guardiaId, tenantId },
      include: { persona: { select: { firstName: true, lastName: true } } },
    });
    if (!guardia) {
      return NextResponse.json({ success: false, error: "Guardia no encontrado" }, { status: 404 });
    }

    // Get installation name for the alert payload
    const installation = await prisma.crmInstallation.findFirst({
      where: { id: installationId, tenantId },
      select: { id: true, name: true },
    });

    const guardiaNombre = `${guardia.persona.firstName} ${guardia.persona.lastName}`.trim();

    // Create incident + alert in a transaction
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

      const alerta = await tx.opsAlertaRonda.create({
        data: {
          tenantId,
          ejecucionId: ejecucionId || undefined,
          installationId,
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

    // Trigger Pusher event for real-time dashboard alert
    try {
      const pusher = getPusherServer();
      await pusher.trigger(`monitoreo-${tenantId}`, "alerta-panico", {
        alertaId: result.alerta.id,
        incidenteId: result.incidente.id,
        guardiaId,
        guardiaNombre,
        installationId,
        installationNombre: installation?.name ?? "Instalacion",
        lat: lat ?? null,
        lng: lng ?? null,
        timestamp: new Date().toISOString(),
      });
    } catch (pusherErr) {
      // Non-blocking: alert is already saved in DB
      console.error("[PANICO] Pusher trigger failed:", pusherErr);
    }

    return NextResponse.json({
      success: true,
      alertaId: result.alerta.id,
      incidenteId: result.incidente.id,
    });
  } catch (error) {
    console.error("[PORTAL_RONDAS_PANICO]", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
```

**Step 2: Verify the route compiles**

Run:
```bash
npx tsc --noEmit src/app/api/portal/rondas/panico/route.ts 2>&1 | head -10
```

**Step 3: Commit**

```bash
git add src/app/api/portal/rondas/panico/route.ts
git commit -m "feat(panico): new API endpoint with Pusher real-time trigger

POST /api/portal/rondas/panico — accepts guardiaId, installationId,
tenantId, optional GPS and ejecucionId. Creates OpsRondaIncidente +
OpsAlertaRonda and triggers Pusher event to monitoreo channel."
```

---

## Task 3: Create PortalBottomNav Component

**Files:**
- Create: `src/components/portal/rondas/PortalBottomNav.tsx`

**Step 1: Create the bottom nav component**

```typescript
"use client";

import { MapPin, MessageCircle, AlertTriangle, User } from "lucide-react";

export type PortalTab = "mis-rondas" | "chat" | "panico" | "perfil";

interface PortalBottomNavProps {
  activeScreen: string;
  onNavigate: (tab: PortalTab) => void;
}

const tabs: { id: PortalTab; label: string; icon: typeof MapPin }[] = [
  { id: "mis-rondas", label: "Rondas", icon: MapPin },
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "panico", label: "Panico", icon: AlertTriangle },
  { id: "perfil", label: "Perfil", icon: User },
];

export function PortalBottomNav({ activeScreen, onNavigate }: PortalBottomNavProps) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-slate-700/50 bg-slate-900/95 backdrop-blur-sm"
      style={{ height: 64, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {tabs.map((tab) => {
        const isPanico = tab.id === "panico";
        const isActive = !isPanico && (
          tab.id === activeScreen ||
          (tab.id === "mis-rondas" && (activeScreen === "ronda-activa" || activeScreen === "completada"))
        );

        if (isPanico) {
          return (
            <button
              key={tab.id}
              onClick={() => onNavigate("panico")}
              className="flex flex-col items-center justify-center gap-0.5 rounded-xl bg-red-950/80 px-4 py-1.5 transition-colors active:bg-red-900"
              aria-label="Activar panico"
            >
              <tab.icon className="h-6 w-6 text-red-400" />
              <span className="text-[10px] font-medium text-red-400">{tab.label}</span>
            </button>
          );
        }

        return (
          <button
            key={tab.id}
            onClick={() => onNavigate(tab.id)}
            className="flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 transition-colors"
            aria-label={tab.label}
          >
            <tab.icon className={`h-6 w-6 ${isActive ? "text-teal-400" : "text-gray-400"}`} />
            <span className={`text-[10px] font-medium ${isActive ? "text-teal-400" : "text-gray-400"}`}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
```

**Step 2: Verify build compiles**

Run:
```bash
npx tsc --noEmit src/components/portal/rondas/PortalBottomNav.tsx 2>&1 | head -10
```

**Step 3: Commit**

```bash
git add src/components/portal/rondas/PortalBottomNav.tsx
git commit -m "feat(portal): create PortalBottomNav component with 4 tabs"
```

---

## Task 4: Create PanicoModal Component

**Files:**
- Create: `src/components/portal/rondas/PanicoModal.tsx`

**Step 1: Create the panic modal with 3-second countdown**

```typescript
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { AlertTriangle, X } from "lucide-react";
import type { RondasSession } from "./RondasPortalClient";

interface PanicoModalProps {
  session: RondasSession;
  activeEjecucionId?: string | null;
  onClose: () => void;
  onPanicSent: () => void;
}

export function PanicoModal({ session, activeEjecucionId, onClose, onPanicSent }: PanicoModalProps) {
  const [countdown, setCountdown] = useState(3);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // 3-second countdown
  useEffect(() => {
    if (countdown <= 0) return;
    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleConfirm = useCallback(async () => {
    if (countdown > 0 || sending) return;
    setSending(true);
    setError(null);

    // Try to get GPS (non-blocking)
    let lat: number | undefined;
    let lng: number | undefined;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
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

  // Success state
  if (sent) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-red-950/95 backdrop-blur-sm">
        <div className="mx-4 text-center">
          <div className="mb-4 text-6xl">&#x2705;</div>
          <h2 className="mb-2 text-2xl font-bold text-white">Alerta enviada</h2>
          <p className="text-red-200">Central de monitoreo ha sido notificada.</p>
        </div>
      </div>
    );
  }

  const progressPercent = ((3 - countdown) / 3) * 100;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-red-950/95 backdrop-blur-sm">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full p-2 text-red-300 hover:bg-red-900/50"
        aria-label="Cancelar"
      >
        <X className="h-6 w-6" />
      </button>

      <div className="mx-4 w-full max-w-sm space-y-8 text-center">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-red-900/60 ring-4 ring-red-500/30">
            <AlertTriangle className="h-12 w-12 text-red-400" />
          </div>
        </div>

        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold text-white">ALERTA DE PANICO</h1>
          <p className="mt-2 text-red-200">
            Se notificara a central de monitoreo inmediatamente
          </p>
        </div>

        {/* Cancel button */}
        <button
          onClick={onClose}
          disabled={sending}
          className="w-full rounded-xl border border-red-700/50 bg-red-900/30 py-3.5 text-base font-medium text-red-300 transition-colors hover:bg-red-900/50 disabled:opacity-40"
        >
          Cancelar
        </button>

        {/* Progress bar */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-red-900/50">
          <div
            className="h-full rounded-full bg-red-500 transition-all duration-1000 ease-linear"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Confirm button */}
        <button
          onClick={handleConfirm}
          disabled={countdown > 0 || sending}
          className={`w-full rounded-xl py-4 text-lg font-bold text-white transition-all ${
            countdown > 0
              ? "bg-red-900/40 opacity-50"
              : sending
                ? "bg-red-700 opacity-70"
                : "bg-red-600 shadow-lg shadow-red-600/30 hover:bg-red-500 animate-pulse"
          }`}
        >
          {sending
            ? "Enviando..."
            : countdown > 0
              ? `Espera ${countdown}s...`
              : "CONFIRMAR PANICO"}
        </button>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-300">{error}</p>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify build compiles**

Run:
```bash
npx tsc --noEmit src/components/portal/rondas/PanicoModal.tsx 2>&1 | head -10
```

**Step 3: Commit**

```bash
git add src/components/portal/rondas/PanicoModal.tsx
git commit -m "feat(panico): create PanicoModal with 3-second countdown and GPS"
```

---

## Task 5: Create PortalPerfil Component

**Files:**
- Create: `src/components/portal/rondas/PortalPerfil.tsx`

**Step 1: Create a minimal profile screen**

```typescript
"use client";

import { LogOut, Shield, MapPin, User } from "lucide-react";
import type { RondasSession } from "./RondasPortalClient";

interface PortalPerfilProps {
  session: RondasSession;
  onLogout: () => void;
}

export function PortalPerfil({ session, onLogout }: PortalPerfilProps) {
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

        {/* Logout */}
        <button
          onClick={onLogout}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl border border-red-800/50 bg-red-950/20 py-3.5 text-base font-medium text-red-400 transition-colors hover:bg-red-950/40 active:bg-red-900/30"
        >
          <LogOut className="h-5 w-5" />
          Cerrar sesion
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Verify build compiles**

Run:
```bash
npx tsc --noEmit src/components/portal/rondas/PortalPerfil.tsx 2>&1 | head -10
```

**Step 3: Commit**

```bash
git add src/components/portal/rondas/PortalPerfil.tsx
git commit -m "feat(portal): create minimal PortalPerfil screen"
```

---

## Task 6: Wire Everything into RondasPortalClient

**Files:**
- Modify: `src/components/portal/rondas/RondasPortalClient.tsx`

**Step 1: Update the orchestrator**

Key changes:
1. Add imports for new components: `PortalBottomNav`, `PanicoModal`, `PortalPerfil`
2. Extend `RondasScreen` type to include `"perfil"`
3. Add `showPanicoModal` state (boolean)
4. Add `panicBannerActive` state (boolean) — persistent banner after panic sent
5. Remove the chat FAB button entirely (lines 239-247)
6. Add `<PortalBottomNav>` rendering when `session && screen !== "login"`
7. Add `<PanicoModal>` rendering when `showPanicoModal` is true
8. Add `<PortalPerfil>` rendering when `screen === "perfil"`
9. Add panic banner at the top when `panicBannerActive` is true

Changes to make:

**Line 1-14 (imports):** Add new imports after existing ones:
```typescript
import { PortalBottomNav } from "./PortalBottomNav";
import type { PortalTab } from "./PortalBottomNav";
import { PanicoModal } from "./PanicoModal";
import { PortalPerfil } from "./PortalPerfil";
```

**Line 15:** Extend screen type:
```typescript
export type RondasScreen = "login" | "mis-rondas" | "ronda-activa" | "completada" | "chat" | "perfil";
```

**Line 35:** Add new state after `showIncidentModal`:
```typescript
const [showPanicoModal, setShowPanicoModal] = useState(false);
const [panicBannerActive, setPanicBannerActive] = useState(false);
```

**After handleBackToRondas (line ~155):** Add bottom nav handler:
```typescript
const handleBottomNav = (tab: PortalTab) => {
  if (tab === "panico") {
    setShowPanicoModal(true);
    return;
  }
  if (tab === "mis-rondas" && (screen === "ronda-activa" || screen === "completada")) {
    // Don't navigate away from active ronda via bottom nav
    // User must use the back button or complete the ronda
    return;
  }
  setScreen(tab);
};
```

**In the JSX return, after the offline banner (`{isOffline && <div ...}`):** Add panic banner:
```tsx
{panicBannerActive && (
  <div className="fixed inset-x-0 top-0 z-[65] flex items-center justify-center gap-2 bg-red-900 px-4 py-2.5 text-center text-sm font-medium text-white shadow-lg">
    <span className="animate-pulse text-lg">&#x1F6A8;</span>
    Alerta de panico activa &mdash; Central notificada
  </div>
)}
{panicBannerActive && <div className="h-10 shrink-0" aria-hidden="true" />}
```

**Lines 239-247:** Delete the entire chat FAB button block:
```typescript
// DELETE THIS ENTIRE BLOCK:
{session && screen !== "login" && screen !== "chat" && (
  <button onClick={...} className="fixed bottom-20 ...">...</button>
)}
```

**After the `screen === "chat"` block (line ~236):** Add perfil screen:
```tsx
{screen === "perfil" && session && (
  <PortalPerfil session={session} onLogout={handleLogout} />
)}
```

**Before `<InstallBanner />` (line ~259):** Add bottom nav and panico modal:
```tsx
{/* Bottom Navigation */}
{session && screen !== "login" && (
  <PortalBottomNav activeScreen={screen} onNavigate={handleBottomNav} />
)}

{/* Panic Modal */}
{showPanicoModal && session && (
  <PanicoModal
    session={session}
    activeEjecucionId={activeEjecucionId}
    onClose={() => setShowPanicoModal(false)}
    onPanicSent={() => {
      setShowPanicoModal(false);
      setPanicBannerActive(true);
    }}
  />
)}
```

**Step 2: Verify build compiles**

Run:
```bash
npx next build 2>&1 | tail -30
```

**Step 3: Commit**

```bash
git add src/components/portal/rondas/RondasPortalClient.tsx
git commit -m "feat(portal): wire BottomNav, PanicoModal, Perfil into portal orchestrator

- Replace chat FAB with bottom navigation bar
- Add panic modal triggered from bottom nav
- Add persistent panic banner after alert sent
- Add profile screen with logout
- Extend RondasScreen type with 'perfil'"
```

---

## Task 7: Adjust Padding in Portal Screens

**Files:**
- Modify: `src/components/portal/rondas/MisRondas.tsx` (line ~507, the `<main>` wrapper)
- Modify: `src/components/portal/rondas/RondaActiva.tsx` (line 658, bottom buttons container)
- Modify: `src/components/portal/rondas/RondaCompletada.tsx` (outer wrapper)
- Modify: `src/components/portal/rondas/ChatRondasSection.tsx` (line 251, input area)

**Step 1: MisRondas — add bottom padding**

In `MisRondas.tsx`, find the `<main>` tag (around line ~70) that wraps all content. Its current bottom padding is likely `pb-8` or similar. Change it to `pb-24` to account for bottom nav (64px) + breathing room:

Find the `<main className="flex-1 ...` and add/update `pb-24`.

Also the "Reportar Incidente" button at lines 507-516 has `mt-8`. Add `mb-4` so it doesn't get cut off:
Change `<div className="mt-8">` to `<div className="mt-8 mb-4">`.

**Step 2: RondaActiva — raise bottom buttons above nav**

In `RondaActiva.tsx`, line 658:
```
className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-800 px-4 pb-6 pt-3"
```
Change `bottom-0` to `bottom-16` (64px for the nav bar):
```
className="fixed inset-x-0 bottom-16 z-20 border-t border-gray-800 px-4 pb-4 pt-3"
```
Also change `pb-6` to `pb-4` since the nav bar provides visual grounding.

Also update the main content padding. Find `pb-36` in the `<main>` tag (around line ~360) and increase to `pb-52` to account for bottom buttons + bottom nav.

**Step 3: RondaActiva — fix z-index of map toggle**

In `RondaActiva.tsx`, line 459:
```
className="absolute bottom-0 left-1/2 z-[1000] flex ...
```
Change `z-[1000]` to `z-10`:
```
className="absolute bottom-0 left-1/2 z-10 flex ...
```

Also, add `isolation: isolate` to the map container `<div>` to create a new stacking context so Leaflet internal z-indexes don't leak out. Find the map wrapper div (around line ~440) and add `style={{ isolation: "isolate" }}` to it.

**Step 4: RondaCompletada — add bottom padding**

In `RondaCompletada.tsx`, find the outermost wrapper div. Add `pb-24` class for bottom nav clearance.

**Step 5: ChatRondasSection — adjust input area**

In `ChatRondasSection.tsx`, line 251:
```
className="px-4 py-3 border-t border-zinc-800/50 bg-zinc-900/80 backdrop-blur pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
```
Change to account for the bottom nav (64px):
```
className="px-4 py-3 border-t border-zinc-800/50 bg-zinc-900/80 backdrop-blur pb-[calc(4.5rem+env(safe-area-inset-bottom))]"
```
(4.5rem = ~72px: 64px nav + 8px breathing)

**Step 6: Verify build compiles**

Run:
```bash
npx next build 2>&1 | tail -30
```

**Step 7: Commit**

```bash
git add src/components/portal/rondas/MisRondas.tsx src/components/portal/rondas/RondaActiva.tsx src/components/portal/rondas/RondaCompletada.tsx src/components/portal/rondas/ChatRondasSection.tsx
git commit -m "fix(portal): adjust padding and z-index for bottom nav compatibility

- MisRondas: pb-24 for nav clearance
- RondaActiva: bottom buttons raised to bottom-16, map toggle z-index lowered
- RondaCompletada: pb-24 for nav clearance
- ChatRondasSection: input area raised above bottom nav
- Map container isolation: isolate to contain Leaflet z-indexes"
```

---

## Task 8: Create PanicAlertBanner for Monitoring Dashboard

**Files:**
- Create: `src/components/ops/rondas/PanicAlertBanner.tsx`

**Step 1: Create the alert banner component**

```typescript
"use client";

import { useState, useEffect, useRef } from "react";
import { AlertTriangle, MapPin, Check, Volume2, VolumeX } from "lucide-react";

export interface PanicAlertData {
  alertaId: string;
  incidenteId: string;
  guardiaId: string;
  guardiaNombre: string;
  installationId: string;
  installationNombre: string;
  lat: number | null;
  lng: number | null;
  timestamp: string;
}

interface PanicAlertBannerProps {
  alerts: PanicAlertData[];
  onAcknowledge: (alertaId: string) => void;
}

function playWebAudioAlarm(audioCtx: AudioContext) {
  function beep(freq: number, start: number, dur: number) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = freq;
    osc.type = "square";
    gain.gain.value = 0.3;
    osc.start(start);
    osc.stop(start + dur);
  }
  for (let i = 0; i < 8; i++) {
    beep(800, audioCtx.currentTime + i * 0.5, 0.25);
    beep(600, audioCtx.currentTime + i * 0.5 + 0.25, 0.25);
  }
}

export function PanicAlertBanner({ alerts, onAcknowledge }: PanicAlertBannerProps) {
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(new Set());
  const [muted, setMuted] = useState(false);
  const alarmRef = useRef<NodeJS.Timeout | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const activeAlerts = alerts.filter((a) => !acknowledgedIds.has(a.alertaId));

  // Sound alarm for active alerts
  useEffect(() => {
    if (activeAlerts.length === 0 || muted) {
      if (alarmRef.current) {
        clearInterval(alarmRef.current);
        alarmRef.current = null;
      }
      return;
    }

    // Create audio context on first alert
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    // Play immediately
    playWebAudioAlarm(audioCtxRef.current);

    // Repeat every 10 seconds
    alarmRef.current = setInterval(() => {
      if (audioCtxRef.current) {
        playWebAudioAlarm(audioCtxRef.current);
      }
    }, 10000);

    return () => {
      if (alarmRef.current) {
        clearInterval(alarmRef.current);
        alarmRef.current = null;
      }
    };
  }, [activeAlerts.length, muted]);

  const handleAcknowledge = async (alertaId: string) => {
    try {
      const res = await fetch(`/api/ops/rondas/alertas/${alertaId}/acknowledge`, {
        method: "PUT",
      });
      if (res.ok) {
        setAcknowledgedIds((prev) => new Set([...prev, alertaId]));
        onAcknowledge(alertaId);
      }
    } catch {
      // Ignore errors — user can retry
    }
  };

  if (alerts.length === 0) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[9999] space-y-0">
      {/* Active alerts */}
      {activeAlerts.map((alert) => (
        <div
          key={alert.alertaId}
          className="flex flex-wrap items-center justify-between gap-3 border-b-4 border-red-500 bg-red-900 px-4 py-3 shadow-2xl animate-pulse"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 shrink-0 text-red-300" />
            <div>
              <p className="text-sm font-bold text-white">ALERTA DE PANICO</p>
              <p className="text-sm text-red-200">
                {alert.guardiaNombre} &mdash; {alert.installationNombre} &mdash;{" "}
                {new Date(alert.timestamp).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {alert.lat && alert.lng && (
              <a
                href={`https://maps.google.com/?q=${alert.lat},${alert.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-lg bg-red-800/60 px-3 py-1.5 text-xs text-red-200 hover:bg-red-800"
              >
                <MapPin className="h-3.5 w-3.5" /> Ver mapa
              </a>
            )}
            <button
              onClick={() => setMuted((m) => !m)}
              className="rounded-lg bg-red-800/60 p-1.5 text-red-200 hover:bg-red-800"
              aria-label={muted ? "Activar sonido" : "Silenciar"}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <button
              onClick={() => handleAcknowledge(alert.alertaId)}
              className="flex items-center gap-1 rounded-lg bg-red-600 px-4 py-1.5 text-sm font-bold text-white shadow hover:bg-red-500"
            >
              <Check className="h-4 w-4" /> ATENDER
            </button>
          </div>
        </div>
      ))}

      {/* Acknowledged alerts — thin bar that fades after 30s */}
      {alerts
        .filter((a) => acknowledgedIds.has(a.alertaId))
        .map((alert) => (
          <AcknowledgedBar key={`ack-${alert.alertaId}`} alert={alert} />
        ))}
    </div>
  );
}

function AcknowledgedBar({ alert }: { alert: PanicAlertData }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 30000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-red-950/80 px-4 py-1.5 text-xs text-red-300">
      <Check className="h-3.5 w-3.5" />
      Panico atendido &mdash; {alert.installationNombre} &mdash;{" "}
      {new Date(alert.timestamp).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
    </div>
  );
}
```

**Step 2: Verify build compiles**

Run:
```bash
npx tsc --noEmit src/components/ops/rondas/PanicAlertBanner.tsx 2>&1 | head -10
```

**Step 3: Commit**

```bash
git add src/components/ops/rondas/PanicAlertBanner.tsx
git commit -m "feat(monitoreo): create PanicAlertBanner with alarm sound and acknowledge"
```

---

## Task 9: Wire Pusher + Banner into Monitoring Dashboard

**Files:**
- Modify: `src/app/(app)/ops/rondas/monitoreo/page.tsx` (pass tenantId prop)
- Modify: `src/components/ops/rondas/RondasMonitoreoClient.tsx` (add Pusher subscription)

**Step 1: Pass tenantId from server page to client component**

In `src/app/(app)/ops/rondas/monitoreo/page.tsx`, at line 56-62, add `tenantId` prop:

```tsx
<RondasMonitoreoClient
  initialRows={JSON.parse(JSON.stringify(activeRows))}
  installations={JSON.parse(JSON.stringify(installations))}
  alertCount={alerts}
  userId={session.user.id ?? ""}
  userName={session.user.name ?? ""}
  tenantId={tenantId}
/>
```

**Step 2: Update RondasMonitoreoClient to accept tenantId and add Pusher**

In `src/components/ops/rondas/RondasMonitoreoClient.tsx`:

Add imports at the top:
```typescript
import PusherClient from "pusher-js";
import { PanicAlertBanner } from "./PanicAlertBanner";
import type { PanicAlertData } from "./PanicAlertBanner";
```

Update the component props (line 17-28) to include `tenantId`:
```typescript
export function RondasMonitoreoClient({
  initialRows,
  installations,
  alertCount,
  userId,
  userName,
  tenantId,
}: {
  initialRows: any[];
  installations: Installation[];
  alertCount: number;
  userId: string;
  userName: string;
  tenantId: string;
}) {
```

Add panic alert state after existing state declarations (line ~35):
```typescript
const [panicAlerts, setPanicAlerts] = useState<PanicAlertData[]>([]);
```

Add Pusher subscription effect after the existing polling `useEffect` (after line ~50):
```typescript
// Real-time panic alerts via Pusher
useEffect(() => {
  if (!tenantId) return;

  const pusher = new PusherClient(
    process.env.NEXT_PUBLIC_PUSHER_KEY!,
    { cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER! }
  );
  const channel = pusher.subscribe(`monitoreo-${tenantId}`);

  channel.bind("alerta-panico", (data: PanicAlertData) => {
    setPanicAlerts((prev) => [...prev, data]);
    // Also refresh data immediately
    fetch("/api/ops/rondas/monitoreo")
      .then((r) => r.json())
      .then((json) => { if (json.success) setRows(json.data); })
      .catch(() => {});
    fetch("/api/ops/rondas/alertas?open=true")
      .then((r) => r.json())
      .then((json) => { if (json.success) setCurrentAlertCount(json.data.length); })
      .catch(() => {});
  });

  return () => {
    channel.unbind_all();
    pusher.unsubscribe(`monitoreo-${tenantId}`);
    pusher.disconnect();
  };
}, [tenantId]);
```

Add the `PanicAlertBanner` to the JSX return — place it as the FIRST element inside the return statement, before any existing JSX:
```tsx
<PanicAlertBanner
  alerts={panicAlerts}
  onAcknowledge={(alertaId) => {
    setCurrentAlertCount((c) => Math.max(0, c - 1));
  }}
/>
```

**Step 3: Verify full build**

Run:
```bash
npx next build 2>&1 | tail -30
```

**Step 4: Commit**

```bash
git add src/app/(app)/ops/rondas/monitoreo/page.tsx src/components/ops/rondas/RondasMonitoreoClient.tsx
git commit -m "feat(monitoreo): wire Pusher real-time panic alerts to dashboard

- Pass tenantId from server page to client component
- Subscribe to Pusher monitoreo-{tenantId} channel
- Render PanicAlertBanner on alerta-panico events
- Auto-refresh monitoring data when panic alert received
- Alarm sound plays until operator acknowledges"
```

---

## Task 10: Final Build Verification + Polish

**Files:**
- All modified files from previous tasks

**Step 1: Run full TypeScript check**

Run:
```bash
npx tsc --noEmit 2>&1 | tail -20
```
Expected: No errors

**Step 2: Run full build**

Run:
```bash
npx next build 2>&1 | tail -40
```
Expected: Build succeeds

**Step 3: Fix any type errors**

If there are type errors, fix them. Common issues:
- Missing `tenantId` in component props interfaces
- `PusherClient` import — might need `import Pusher from "pusher-js"` instead of `import PusherClient from "pusher-js"`
- `window.AudioContext` typing — cast as `any` if needed

**Step 4: Commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve type errors from Bloque 2 implementation"
```

---

## Summary

| Task | Component | Action | Est. Lines |
|------|-----------|--------|-----------|
| 1 | `chat.ts` | Export getPusherServer | +5 |
| 2 | API `/panico` | New endpoint with Pusher trigger | +100 |
| 3 | `PortalBottomNav` | New bottom nav component | +70 |
| 4 | `PanicoModal` | New panic modal with countdown | +170 |
| 5 | `PortalPerfil` | New minimal profile screen | +65 |
| 6 | `RondasPortalClient` | Wire nav, modal, perfil, remove FAB | ~+40, -10 |
| 7 | Padding adjustments | 4 files: MisRondas, RondaActiva, Completada, Chat | ~10 edits |
| 8 | `PanicAlertBanner` | New dashboard alert banner | +180 |
| 9 | Monitoreo dashboard | Pusher subscription + banner | ~+40 |
| 10 | Build verification | TypeScript + Next.js build | 0 |

## Verification Checklist

1. [ ] Bottom nav visible in all portal screens except login
2. [ ] Chat FAB removed
3. [ ] Chat opens from bottom nav
4. [ ] Panic button: 3-second countdown, then enabled
5. [ ] Panic button: creates alert + incident via new API
6. [ ] Pusher event fires on panic creation
7. [ ] Dashboard receives real-time panic alert
8. [ ] Alarm sound plays on panic alert
9. [ ] Acknowledge stops alarm and minimizes banner
10. [ ] Map toggle z-index fixed (no longer z-1000)
11. [ ] Bottom buttons in RondaActiva raised above bottom nav
12. [ ] Profile screen shows guard info and logout
