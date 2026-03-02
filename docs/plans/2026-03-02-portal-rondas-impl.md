# Portal de Rondas — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an independent guard portal at `/portal/rondas` for executing supervision rounds from a mobile browser — PWA with offline support, QR+GPS verification, photo capture to R2.

**Architecture:** Next.js App Router monolith (same app, public route). Client-side session via sessionStorage (RUT+PIN auth). All rondas backend libs reused. Service worker for offline basic. Cloudflare R2 for photo uploads.

**Tech Stack:** Next.js 15, Prisma, Tailwind CSS, shadcn/ui, date-fns, bcryptjs, BarcodeDetector/html5-qrcode, Geolocation API, IndexedDB (idb-keyval)

---

## Task 1: Schema Migration — Add `qrRequerido` to OpsRondaTemplate

**Files:**
- Modify: `prisma/schema.prisma:2991` (add field after `estimatedDurationMin`)
- Create: `prisma/migrations/YYYYMMDD_add_qr_requerido/migration.sql`
- Modify: `src/lib/validations/rondas.ts:19-26` (add to rondaTemplateSchema)

**Step 1: Add field to Prisma schema**

In `prisma/schema.prisma`, after line 2991 (`estimatedDurationMin`), add:

```prisma
  qrRequerido          Boolean  @default(false) @map("qr_requerido")
```

**Step 2: Add to validation schema**

In `src/lib/validations/rondas.ts`, add to `rondaTemplateSchema`:

```typescript
  qrRequerido: z.boolean().default(false),
```

**Step 3: Generate and run migration**

Run: `npx prisma migrate dev --name add_qr_requerido`
Expected: Migration created and applied successfully.

**Step 4: Generate Prisma client**

Run: `npx prisma generate`
Expected: Prisma Client generated.

**Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ src/lib/validations/rondas.ts
git commit -m "feat(rondas): add qrRequerido field to OpsRondaTemplate"
```

---

## Task 2: PWA Manifest + Layout + Page Shell

**Files:**
- Create: `public/portal-rondas-manifest.json`
- Create: `src/app/portal/rondas/layout.tsx`
- Create: `src/app/portal/rondas/page.tsx`
- Create: `src/components/portal/rondas/RondasPortalClient.tsx` (shell only)

**Step 1: Create PWA manifest**

Create `public/portal-rondas-manifest.json`:

```json
{
  "name": "Rondas Gard",
  "short_name": "Rondas",
  "start_url": "/portal/rondas",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#0a0a0f",
  "background_color": "#0a0a0f",
  "icons": [
    { "src": "/iconos_azul/icon-48x48.png", "sizes": "48x48", "type": "image/png" },
    { "src": "/iconos_azul/icon-72x72.png", "sizes": "72x72", "type": "image/png" },
    { "src": "/iconos_azul/icon-96x96.png", "sizes": "96x96", "type": "image/png" },
    { "src": "/iconos_azul/icon-128x128.png", "sizes": "128x128", "type": "image/png" },
    { "src": "/iconos_azul/icon-144x144.png", "sizes": "144x144", "type": "image/png" },
    { "src": "/iconos_azul/icon-152x152.png", "sizes": "152x152", "type": "image/png" },
    { "src": "/iconos_azul/icon-192x192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/iconos_azul/icon-384x384.png", "sizes": "384x384", "type": "image/png" },
    { "src": "/iconos_azul/icon-512x512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**Step 2: Create layout**

Create `src/app/portal/rondas/layout.tsx` following the portal/cliente pattern:

```tsx
import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0a0f",
};

export const metadata: Metadata = {
  title: "Rondas — Gard Security",
  description: "Portal de rondas de supervisión para guardias.",
  manifest: "/portal-rondas-manifest.json",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Rondas Gard",
  },
};

export default function PortalRondasLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#0a0a0f] text-[#f5f5f5] antialiased">
      {children}
    </div>
  );
}
```

**Step 3: Create page**

Create `src/app/portal/rondas/page.tsx`:

```tsx
import { RondasPortalClient } from "@/components/portal/rondas/RondasPortalClient";

export default function PortalRondasPage() {
  return <RondasPortalClient />;
}
```

**Step 4: Create client shell**

Create `src/components/portal/rondas/RondasPortalClient.tsx`:

```tsx
"use client";

import { useState } from "react";

export type RondasScreen = "login" | "mis-rondas" | "ronda-activa" | "marcar" | "completada";

export interface RondasSession {
  guardiaId: string;
  tenantId: string;
  installationId: string;
  nombre: string;
  installationName: string;
  authenticatedAt: string;
}

export function RondasPortalClient() {
  const [screen, setScreen] = useState<RondasScreen>("login");
  const [session, setSession] = useState<RondasSession | null>(null);

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Screens will be added in subsequent tasks */}
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-lg text-gray-400">Portal de Rondas — En construcción</p>
      </div>
    </div>
  );
}
```

**Step 5: Verify build**

Run: `npx next build --no-lint 2>&1 | tail -20`
Expected: Build succeeds, `/portal/rondas` route appears.

**Step 6: Commit**

```bash
git add public/portal-rondas-manifest.json src/app/portal/rondas/ src/components/portal/rondas/
git commit -m "feat(rondas-portal): add PWA manifest, layout, and page shell"
```

---

## Task 3: Auth API — `/api/portal/rondas/auth`

**Files:**
- Create: `src/app/api/portal/rondas/auth/route.ts`

**Step 1: Create auth route**

Create `src/app/api/portal/rondas/auth/route.ts`. Follows the exact pattern from `src/app/api/portal/guardia/auth/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rut, pin } = body as { rut?: string; pin?: string };

    if (!rut || !pin) {
      return NextResponse.json(
        { success: false, error: "RUT y PIN son requeridos" },
        { status: 401 },
      );
    }

    // Clean RUT: remove dots and dashes, uppercase
    const cleanRut = rut.replace(/[.\-]/g, "").toUpperCase();
    const rutBody = cleanRut.slice(0, -1);
    const rutDv = cleanRut.slice(-1);
    const rutWithDash = `${rutBody}-${rutDv}`;

    // Dotted variant
    let rutWithDots = rutWithDash;
    if (rutBody.length >= 2) {
      const reversed = rutBody.split("").reverse();
      const groups: string[] = [];
      for (let i = 0; i < reversed.length; i += 3) {
        groups.push(reversed.slice(i, i + 3).reverse().join(""));
      }
      rutWithDots = `${groups.reverse().join(".")}-${rutDv}`;
    }

    const personas = await prisma.opsPersona.findMany({
      where: {
        OR: [
          { rut: cleanRut },
          { rut: rutWithDash },
          { rut: rutWithDots },
          { rut },
        ],
      },
      include: {
        guardia: {
          include: {
            currentInstallation: { select: { id: true, name: true } },
            installations: {
              include: { installation: { select: { id: true, name: true } } },
              where: { isActive: true },
            },
          },
        },
      },
    });

    if (personas.length === 0) {
      return NextResponse.json(
        { success: false, error: "RUT no encontrado" },
        { status: 401 },
      );
    }

    const withGuardia = personas.filter((p) => p.guardia);
    if (withGuardia.length === 0) {
      return NextResponse.json(
        { success: false, error: "RUT no asociado a guardia activo" },
        { status: 401 },
      );
    }

    withGuardia.sort((a, b) => {
      const aActive = a.guardia!.status === "active" ? 1 : 0;
      const bActive = b.guardia!.status === "active" ? 1 : 0;
      if (bActive !== aActive) return bActive - aActive;
      const aHasPin = (a.guardia!.marcacionPin || a.guardia!.marcacionPinVisible) ? 1 : 0;
      const bHasPin = (b.guardia!.marcacionPin || b.guardia!.marcacionPinVisible) ? 1 : 0;
      return bHasPin - aHasPin;
    });

    const persona = withGuardia[0];
    const guardia = persona.guardia!;

    const storedPin = guardia.marcacionPin;
    const visiblePin = guardia.marcacionPinVisible;

    if (!storedPin && !visiblePin) {
      return NextResponse.json(
        { success: false, error: "PIN no configurado. Contacte a su supervisor." },
        { status: 401 },
      );
    }

    let pinValid = false;
    if (storedPin) {
      pinValid = storedPin.startsWith("$2")
        ? await bcrypt.compare(pin, storedPin)
        : storedPin === pin;
    }
    if (!pinValid && visiblePin) {
      pinValid = visiblePin === pin;
    }

    if (!pinValid) {
      return NextResponse.json(
        { success: false, error: "PIN incorrecto" },
        { status: 401 },
      );
    }

    // Build installations list for selector
    const installations = guardia.installations?.map((gi: any) => ({
      id: gi.installation.id,
      name: gi.installation.name,
    })) ?? [];

    // Add current installation if not in list
    if (guardia.currentInstallationId && guardia.currentInstallation) {
      if (!installations.find((i: any) => i.id === guardia.currentInstallationId)) {
        installations.unshift({
          id: guardia.currentInstallation.id,
          name: guardia.currentInstallation.name,
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        guardiaId: guardia.id,
        tenantId: persona.tenantId,
        nombre: `${persona.firstName} ${persona.lastName}`,
        currentInstallationId: guardia.currentInstallationId,
        installations,
      },
    });
  } catch (error) {
    console.error("[Portal Rondas] Auth error:", error);
    return NextResponse.json(
      { success: false, error: "Error al autenticar" },
      { status: 500 },
    );
  }
}
```

**Step 2: Test manually**

Run dev server and test with curl or similar.

**Step 3: Commit**

```bash
git add src/app/api/portal/rondas/auth/route.ts
git commit -m "feat(rondas-portal): add auth API (RUT+PIN)"
```

---

## Task 4: LoginScreen Component

**Files:**
- Create: `src/components/portal/rondas/LoginScreen.tsx`
- Modify: `src/components/portal/rondas/RondasPortalClient.tsx`

**Step 1: Create LoginScreen**

Create `src/components/portal/rondas/LoginScreen.tsx`:

```tsx
"use client";

import { useState, useCallback } from "react";
import { formatRut, isValidRut } from "@/lib/guard-portal";
import type { RondasSession } from "./RondasPortalClient";

interface Props {
  onLogin: (session: RondasSession) => void;
}

export function LoginScreen({ onLogin }: Props) {
  const [rut, setRut] = useState("");
  const [pin, setPin] = useState("");
  const [installationId, setInstallationId] = useState("");
  const [installations, setInstallations] = useState<{ id: string; name: string }[]>([]);
  const [step, setStep] = useState<"credentials" | "select-installation">("credentials");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = useCallback(async () => {
    if (!isValidRut(rut)) {
      setError("RUT inválido");
      return;
    }
    if (pin.length < 4) {
      setError("PIN debe tener al menos 4 dígitos");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/portal/rondas/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rut, pin }),
      });
      const json = await res.json();

      if (!json.success) {
        setError(json.error || "Error al autenticar");
        return;
      }

      const { guardiaId, tenantId, nombre, currentInstallationId, installations: instList } = json.data;

      if (instList.length === 0) {
        setError("No tiene instalaciones asignadas");
        return;
      }

      if (instList.length === 1) {
        const inst = instList[0];
        const session: RondasSession = {
          guardiaId,
          tenantId,
          installationId: inst.id,
          nombre,
          installationName: inst.name,
          authenticatedAt: new Date().toISOString(),
        };
        sessionStorage.setItem("rondas_portal_session", JSON.stringify(session));
        onLogin(session);
        return;
      }

      // Multiple installations — show selector
      setInstallations(instList);
      if (currentInstallationId) setInstallationId(currentInstallationId);
      setStep("select-installation");
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, [rut, pin, onLogin]);

  const handleSelectInstallation = useCallback(() => {
    // This requires auth data from the previous step — store temporarily
    const authDataStr = sessionStorage.getItem("rondas_portal_auth_temp");
    if (!authDataStr || !installationId) return;
    const authData = JSON.parse(authDataStr);
    const inst = installations.find(i => i.id === installationId);
    if (!inst) return;

    const session: RondasSession = {
      guardiaId: authData.guardiaId,
      tenantId: authData.tenantId,
      installationId: inst.id,
      nombre: authData.nombre,
      installationName: inst.name,
      authenticatedAt: new Date().toISOString(),
    };
    sessionStorage.setItem("rondas_portal_session", JSON.stringify(session));
    onLogin(session);
  }, [installationId, installations, onLogin]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white">Rondas</h1>
          <p className="mt-2 text-lg text-gray-400">Ingrese su RUT y PIN</p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-500/20 px-4 py-3 text-center text-base text-red-300">
            {error}
          </div>
        )}

        {step === "credentials" ? (
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-base text-gray-300">RUT</label>
              <input
                type="text"
                inputMode="numeric"
                value={rut}
                onChange={(e) => setRut(formatRut(e.target.value))}
                placeholder="12.345.678-9"
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-4 text-xl text-white placeholder:text-gray-600 focus:border-teal-500 focus:outline-none"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="mb-2 block text-base text-gray-300">PIN</label>
              <input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="****"
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-4 text-xl tracking-[0.3em] text-white placeholder:text-gray-600 focus:border-teal-500 focus:outline-none"
                autoComplete="off"
              />
            </div>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full rounded-xl bg-teal-600 py-4 text-xl font-semibold text-white transition-colors hover:bg-teal-500 active:bg-teal-700 disabled:opacity-50"
            >
              {loading ? "Verificando..." : "Ingresar"}
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <label className="mb-2 block text-base text-gray-300">Seleccione instalación</label>
            {installations.map(inst => (
              <button
                key={inst.id}
                onClick={() => { setInstallationId(inst.id); }}
                className={`w-full rounded-xl border px-4 py-4 text-left text-lg transition-colors ${
                  installationId === inst.id
                    ? "border-teal-500 bg-teal-900/30 text-white"
                    : "border-gray-700 bg-gray-900 text-gray-300"
                }`}
              >
                {inst.name}
              </button>
            ))}
            <button
              onClick={handleSelectInstallation}
              disabled={!installationId}
              className="w-full rounded-xl bg-teal-600 py-4 text-xl font-semibold text-white transition-colors hover:bg-teal-500 active:bg-teal-700 disabled:opacity-50"
            >
              Continuar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Wire into RondasPortalClient**

Update `RondasPortalClient.tsx` to render LoginScreen when `screen === "login"`, and check for existing session on mount from `sessionStorage`.

**Step 3: Commit**

```bash
git add src/components/portal/rondas/LoginScreen.tsx src/components/portal/rondas/RondasPortalClient.tsx
git commit -m "feat(rondas-portal): add LoginScreen with RUT+PIN auth"
```

---

## Task 5: Mis Rondas API — `/api/portal/rondas/mis-rondas`

**Files:**
- Create: `src/app/api/portal/rondas/mis-rondas/route.ts`

**Step 1: Create API**

This endpoint returns rondas scheduled for the guard's current shift at a specific installation.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const guardiaId = request.nextUrl.searchParams.get("guardiaId");
    const installationId = request.nextUrl.searchParams.get("installationId");
    const tenantId = request.nextUrl.searchParams.get("tenantId");

    if (!guardiaId || !installationId || !tenantId) {
      return NextResponse.json({ success: false, error: "Parámetros requeridos" }, { status: 400 });
    }

    // Get active templates for this installation
    const templates = await prisma.opsRondaTemplate.findMany({
      where: { tenantId, installationId, isActive: true },
      include: {
        checkpoints: {
          include: { checkpoint: { select: { id: true, name: true, qrCode: true, lat: true, lng: true, geoRadiusM: true, verificationType: true } } },
          orderBy: { orderIndex: "asc" },
        },
        programaciones: { where: { isActive: true } },
      },
    });

    // Get today's ejecuciones for this guard
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const ejecuciones = await prisma.opsRondaEjecucion.findMany({
      where: {
        tenantId,
        rondaTemplateId: { in: templates.map(t => t.id) },
        scheduledAt: { gte: startOfDay, lte: endOfDay },
        OR: [
          { guardiaId },
          { guardiaId: null, status: "pendiente" },
        ],
      },
      include: {
        marcaciones: {
          select: { checkpointId: true, status: true, timestamp: true },
        },
      },
      orderBy: { scheduledAt: "asc" },
    });

    const result = ejecuciones.map(ej => {
      const template = templates.find(t => t.id === ej.rondaTemplateId);
      return {
        ejecucionId: ej.id,
        templateId: ej.rondaTemplateId,
        templateName: template?.name ?? "Ronda",
        status: ej.status,
        scheduledAt: ej.scheduledAt.toISOString(),
        startedAt: ej.startedAt?.toISOString() ?? null,
        checkpointsTotal: ej.checkpointsTotal,
        checkpointsCompletados: ej.checkpointsCompletados,
        qrRequerido: template?.qrRequerido ?? false,
        orderMode: template?.orderMode ?? "flexible",
        estimatedDurationMin: template?.estimatedDurationMin ?? null,
        checkpoints: template?.checkpoints.map(tc => ({
          id: tc.checkpoint.id,
          name: tc.checkpoint.name,
          qrCode: tc.checkpoint.qrCode,
          lat: tc.checkpoint.lat,
          lng: tc.checkpoint.lng,
          geoRadiusM: tc.checkpoint.geoRadiusM,
          verificationType: tc.checkpoint.verificationType,
          orderIndex: tc.orderIndex,
          isRequired: tc.isRequired,
          completed: ej.marcaciones.some(m => m.checkpointId === tc.checkpointId && m.status === "COMPLETED"),
        })) ?? [],
      };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Portal Rondas] Mis rondas error:", error);
    return NextResponse.json({ success: false, error: "Error al obtener rondas" }, { status: 500 });
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/portal/rondas/mis-rondas/route.ts
git commit -m "feat(rondas-portal): add mis-rondas API"
```

---

## Task 6: MisRondas UI Component

**Files:**
- Create: `src/components/portal/rondas/MisRondas.tsx`
- Modify: `src/components/portal/rondas/RondasPortalClient.tsx`

**Step 1: Create MisRondas component**

Large card per scheduled round: name, time, checkpoint count, status badge. Big "Iniciar Ronda" button. Header with guard name, installation, online/offline indicator, logout.

**Step 2: Wire into RondasPortalClient**

Render when `screen === "mis-rondas"`. On "Iniciar", call start API and transition to `"ronda-activa"`.

**Step 3: Commit**

```bash
git add src/components/portal/rondas/MisRondas.tsx src/components/portal/rondas/RondasPortalClient.tsx
git commit -m "feat(rondas-portal): add MisRondas UI"
```

---

## Task 7: Marcar Checkpoint API — `/api/portal/rondas/marcar`

**Files:**
- Create: `src/app/api/portal/rondas/marcar/route.ts`

**Step 1: Create mark API**

Follows the exact pattern from `src/app/api/public/ronda/marcar/route.ts`:
- Validates ejecucion and checkpoint exist
- Checks geofence distance via `isWithinGeoRadius` from `@/lib/rondas/geo-utils`
- Calculates speed from previous checkpoint via `speedKmh`
- Detects anomalies via `detectCheckpointAnomalies` from `@/lib/rondas/anomaly-detection`
- Computes integrity hash (SHA-256 of checkpointId + timestamp + lat + lng + guardiaId)
- Creates `OpsMarcacionCheckpoint` record
- Updates `OpsRondaEjecucion` progress counters
- Calls `evaluatePostMarkAlerts` async
- Handles QR verification: if `qrRequerido` and verification is QR, requires matching `checkpointQrCode`

Key imports:
```typescript
import { isWithinGeoRadius, speedKmh } from "@/lib/rondas/geo-utils";
import { detectCheckpointAnomalies } from "@/lib/rondas/anomaly-detection";
import { evaluatePostMarkAlerts } from "@/lib/rondas/alert-engine";
```

**Step 2: Commit**

```bash
git add src/app/api/portal/rondas/marcar/route.ts
git commit -m "feat(rondas-portal): add marcar checkpoint API"
```

---

## Task 8: Completar Ronda API — `/api/portal/rondas/completar`

**Files:**
- Create: `src/app/api/portal/rondas/completar/route.ts`

**Step 1: Create complete API**

Follows pattern from `src/app/api/public/ronda/completar/route.ts`:
- Records missed checkpoints as `MISSED`
- Calculates completion percentage
- Computes trust score via `calculateRondaTrustScore` from `@/lib/rondas/trust-score-v2`
- Updates execution status to `completada` or `incompleta`
- Records duration

**Step 2: Commit**

```bash
git add src/app/api/portal/rondas/completar/route.ts
git commit -m "feat(rondas-portal): add completar ronda API"
```

---

## Task 9: QR Scanner Component

**Files:**
- Create: `src/components/portal/rondas/QrScanner.tsx`

**Step 1: Create QR scanner**

Uses native `BarcodeDetector` API with fallback to `html5-qrcode` library.

```tsx
"use client";

import { useRef, useState, useEffect, useCallback } from "react";

interface Props {
  onScan: (code: string) => void;
  onClose: () => void;
}

export function QrScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function startScan() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // Use BarcodeDetector if available
        if ("BarcodeDetector" in window) {
          const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
          const interval = setInterval(async () => {
            if (cancelled || !videoRef.current) { clearInterval(interval); return; }
            try {
              const barcodes = await detector.detect(videoRef.current);
              if (barcodes.length > 0) {
                clearInterval(interval);
                stopCamera();
                onScan(barcodes[0].rawValue);
              }
            } catch { /* ignore detection errors */ }
          }, 300);
          return () => clearInterval(interval);
        }
      } catch (err) {
        if (!cancelled) setError("No se pudo acceder a la cámara");
      }
    }

    startScan();
    return () => { cancelled = true; stopCamera(); };
  }, [onScan, stopCamera]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-lg font-semibold text-white">Escanear QR</h2>
        <button
          onClick={() => { stopCamera(); onClose(); }}
          className="rounded-lg bg-gray-800 px-4 py-2 text-base text-white"
        >
          Cerrar
        </button>
      </div>
      {error ? (
        <div className="flex flex-1 items-center justify-center px-6">
          <p className="text-center text-lg text-red-400">{error}</p>
        </div>
      ) : (
        <div className="relative flex-1">
          <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-64 w-64 rounded-2xl border-4 border-teal-500/50" />
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/portal/rondas/QrScanner.tsx
git commit -m "feat(rondas-portal): add QR scanner with BarcodeDetector API"
```

---

## Task 10: Photo Capture Component

**Files:**
- Create: `src/components/portal/rondas/PhotoCapture.tsx`

**Step 1: Create photo capture**

Opens camera (rear), captures to canvas, returns blob for upload.

```tsx
"use client";

import { useRef, useState, useCallback, useEffect } from "react";

interface Props {
  onCapture: (blob: Blob) => void;
  onClose: () => void;
}

export function PhotoCapture({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      })
      .catch(() => {});
    return () => { cancelled = true; stopCamera(); };
  }, [stopCamera]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    setPreview(canvas.toDataURL("image/jpeg", 0.8));
    stopCamera();
  }, [stopCamera]);

  const confirm = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(blob => { if (blob) onCapture(blob); }, "image/jpeg", 0.8);
  }, [onCapture]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-lg font-semibold text-white">Foto Evidencia</h2>
        <button onClick={() => { stopCamera(); onClose(); }} className="rounded-lg bg-gray-800 px-4 py-2 text-base text-white">
          Cerrar
        </button>
      </div>
      <canvas ref={canvasRef} className="hidden" />
      {preview ? (
        <div className="flex flex-1 flex-col">
          <img src={preview} alt="Preview" className="flex-1 object-contain" />
          <div className="flex gap-3 px-4 py-4">
            <button onClick={() => { setPreview(null); /* restart camera */ }} className="flex-1 rounded-xl bg-gray-700 py-4 text-lg text-white">
              Repetir
            </button>
            <button onClick={confirm} className="flex-1 rounded-xl bg-teal-600 py-4 text-lg font-semibold text-white">
              Usar Foto
            </button>
          </div>
        </div>
      ) : (
        <div className="relative flex-1">
          <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
          <div className="absolute inset-x-0 bottom-0 flex justify-center pb-8">
            <button
              onClick={capture}
              className="h-20 w-20 rounded-full border-4 border-white bg-white/20 active:bg-white/40"
            />
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/portal/rondas/PhotoCapture.tsx
git commit -m "feat(rondas-portal): add PhotoCapture component"
```

---

## Task 11: Photo Upload API — `/api/portal/rondas/upload`

**Files:**
- Create: `src/app/api/portal/rondas/upload/route.ts`

**Step 1: Create upload route**

Uses existing `uploadFile` from `@/lib/storage` with prefix `"rondas"`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { uploadFile } from "@/lib/storage";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadFile(buffer, file.name, file.type, "rondas");

    return NextResponse.json({ success: true, data: { url: result.publicUrl, key: result.storageKey } });
  } catch (error) {
    console.error("[Portal Rondas] Upload error:", error);
    return NextResponse.json({ success: false, error: "Error al subir archivo" }, { status: 500 });
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/portal/rondas/upload/route.ts
git commit -m "feat(rondas-portal): add photo upload API (R2)"
```

---

## Task 12: CheckpointMarker UI

**Files:**
- Create: `src/components/portal/rondas/CheckpointMarker.tsx`

**Step 1: Create CheckpointMarker**

This is the main interaction screen for marking a checkpoint:
- If `qrRequerido` → open QR scanner automatically
- Capture GPS always (with fallback for GPS disabled)
- Optional photo + note
- Big "Confirmar Marcación" button
- Collects anti-fraud data: battery level (Battery API), motion data (DeviceMotion), GPS coords
- Computes hash integrity client-side
- Posts to `/api/portal/rondas/marcar`
- Vibrates on success (Vibration API)

Key flow:
1. Component mounts → requests GPS
2. If QR required → opens QrScanner overlay
3. Shows checkpoint name, distance from GPS, status
4. Optional: tap "Foto" to open PhotoCapture
5. Optional: type note
6. Tap "Confirmar Marcación" → POST to API → vibrate → callback

**Step 2: Commit**

```bash
git add src/components/portal/rondas/CheckpointMarker.tsx
git commit -m "feat(rondas-portal): add CheckpointMarker UI with anti-fraud data"
```

---

## Task 13: RondaActiva + RondaCompletada UI

**Files:**
- Create: `src/components/portal/rondas/RondaActiva.tsx`
- Create: `src/components/portal/rondas/RondaProgress.tsx`
- Create: `src/components/portal/rondas/RondaCompletada.tsx`
- Modify: `src/components/portal/rondas/RondasPortalClient.tsx`

**Step 1: Create RondaProgress**

Visual progress bar showing `N/M checkpoints`. Uses status colors from design doc:
- Completed: `#22c55e` (green)
- Active: `#14b8a6` (teal)
- Pending: `#6b7280` (gray)

**Step 2: Create RondaActiva**

- Progress bar at top
- List of checkpoints with status icons
- Active checkpoint highlighted in teal
- Tapping a checkpoint → navigate to CheckpointMarker
- "Completar Ronda" button at bottom

**Step 3: Create RondaCompletada**

- Summary card: checkpoints completed, duration, trust score visual (circular gauge or bar)
- "Volver a Mis Rondas" button

**Step 4: Wire all screens into RondasPortalClient**

The client shell now manages all screen transitions: login → mis-rondas → ronda-activa (with marcar sub-screen) → completada.

**Step 5: Commit**

```bash
git add src/components/portal/rondas/RondaActiva.tsx src/components/portal/rondas/RondaProgress.tsx src/components/portal/rondas/RondaCompletada.tsx src/components/portal/rondas/RondasPortalClient.tsx
git commit -m "feat(rondas-portal): add RondaActiva, RondaProgress, RondaCompletada UI"
```

---

## Task 14: Service Worker + Offline Support

**Files:**
- Create: `public/rondas-sw.js`
- Create: `src/components/portal/rondas/ServiceWorkerRegistrar.tsx`
- Create: `src/lib/rondas-offline.ts` (IndexedDB helpers)
- Modify: `src/app/portal/rondas/layout.tsx` (add SW registrar)

**Step 1: Create service worker**

Create `public/rondas-sw.js`:

```javascript
const CACHE_NAME = "rondas-v1";
const STATIC_ASSETS = [
  "/portal/rondas",
  "/portal-rondas-manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API calls: network-first
  if (url.pathname.startsWith("/api/portal/rondas/")) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Static: cache-first
  if (url.pathname.startsWith("/portal/rondas")) {
    event.respondWith(
      caches.match(event.request).then((cached) =>
        cached || fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
      )
    );
  }
});
```

**Step 2: Create IndexedDB helpers**

Create `src/lib/rondas-offline.ts` using `idb-keyval` or raw IndexedDB:

```typescript
const DB_NAME = "rondas-portal";
const STORE_NAME = "pending-marks";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function savePendingMark(mark: Record<string, unknown>): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).add({ ...mark, createdAt: new Date().toISOString() });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingMarks(): Promise<Record<string, unknown>[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const req = tx.objectStore(STORE_NAME).getAll();
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function clearPendingMarks(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).clear();
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
```

**Step 3: Create ServiceWorkerRegistrar component**

Create `src/components/portal/rondas/ServiceWorkerRegistrar.tsx`:

```tsx
"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/rondas-sw.js").catch((err) => {
        console.warn("[Rondas SW] Registration failed:", err);
      });
    }
  }, []);

  return null;
}
```

**Step 4: Add to layout**

In `src/app/portal/rondas/layout.tsx`, import and render `<ServiceWorkerRegistrar />` inside the layout div.

**Step 5: Commit**

```bash
git add public/rondas-sw.js src/lib/rondas-offline.ts src/components/portal/rondas/ServiceWorkerRegistrar.tsx src/app/portal/rondas/layout.tsx
git commit -m "feat(rondas-portal): add service worker, IndexedDB offline support"
```

---

## Task 15: Sync API — `/api/portal/rondas/sync`

**Files:**
- Create: `src/app/api/portal/rondas/sync/route.ts`

**Step 1: Create sync API**

Uses existing `rondaSyncSchema` from `@/lib/validations/rondas` for validation. Processes batch of offline marcaciones:

- Validates each marcacion
- Creates `OpsMarcacionCheckpoint` records with `isOfflineSync: true`
- Updates execution progress
- Calculates trust scores
- Generates alerts
- Returns sync results

**Step 2: Add online listener in CheckpointMarker**

When navigator goes online, check IndexedDB for pending marks and POST to `/api/portal/rondas/sync`.

**Step 3: Commit**

```bash
git add src/app/api/portal/rondas/sync/route.ts
git commit -m "feat(rondas-portal): add offline sync API"
```

---

## Task 16: Install Banner + Final Polish

**Files:**
- Create: `src/components/portal/rondas/InstallBanner.tsx`
- Modify: `src/components/portal/rondas/RondasPortalClient.tsx`

**Step 1: Create install banner**

Listens for `beforeinstallprompt` event, shows "Instalar App" banner with teal accent:

```tsx
"use client";

import { useState, useEffect } from "react";

export function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-gray-900 border-t border-gray-700 px-4 py-3 flex items-center gap-3">
      <p className="flex-1 text-base text-gray-200">Instalar Rondas para acceso rápido</p>
      <button
        onClick={async () => {
          if (deferredPrompt) {
            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            setShow(false);
            setDeferredPrompt(null);
          }
        }}
        className="rounded-lg bg-teal-600 px-4 py-2 text-base font-semibold text-white"
      >
        Instalar
      </button>
      <button onClick={() => setShow(false)} className="text-gray-500 text-sm">
        No
      </button>
    </div>
  );
}
```

**Step 2: Add to RondasPortalClient**

Render `<InstallBanner />` at the bottom of the main layout.

**Step 3: Final polish**

- Add online/offline indicator in header (listen to `navigator.onLine` + `online`/`offline` events)
- Add loading states and error boundaries
- Test full flow: login → view rounds → start round → mark checkpoints → complete → see summary

**Step 4: Commit**

```bash
git add src/components/portal/rondas/InstallBanner.tsx src/components/portal/rondas/RondasPortalClient.tsx
git commit -m "feat(rondas-portal): add install banner and final polish"
```

---

## Summary

| Task | Component | Files |
|------|-----------|-------|
| 1 | Schema migration | prisma/schema.prisma, validations |
| 2 | PWA + layout + page | manifest, layout, page, shell |
| 3 | Auth API | api/portal/rondas/auth |
| 4 | LoginScreen | LoginScreen.tsx |
| 5 | Mis Rondas API | api/portal/rondas/mis-rondas |
| 6 | MisRondas UI | MisRondas.tsx |
| 7 | Marcar API | api/portal/rondas/marcar |
| 8 | Completar API | api/portal/rondas/completar |
| 9 | QR Scanner | QrScanner.tsx |
| 10 | Photo Capture | PhotoCapture.tsx |
| 11 | Photo Upload API | api/portal/rondas/upload |
| 12 | CheckpointMarker UI | CheckpointMarker.tsx |
| 13 | RondaActiva + Completada | RondaActiva, Progress, Completada |
| 14 | Offline (SW + IndexedDB) | rondas-sw.js, rondas-offline.ts |
| 15 | Sync API | api/portal/rondas/sync |
| 16 | Install banner + polish | InstallBanner.tsx |
