# Portal Rondas "Mission Control" — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the guard rondas portal from a basic list-based UI into a map-driven "Mission Control" experience with Leaflet maps, GPS live tracking, grouped round dashboard, bottom-sheet checkpoint marking, incident reporting, and cross-browser QR scanning.

**Architecture:** Replace/rewrite 7 of 12 existing components in `src/components/portal/rondas/`. Add `react-leaflet` for maps, switch QR scanner from native `BarcodeDetector` to `html5-qrcode` (already in package.json). New `ReportarIncidente` modal component + API route. No schema changes needed — `OpsRondaIncidente` model already has all required fields.

**Tech Stack:** Next.js 14, React 18, Leaflet + react-leaflet, html5-qrcode (already installed), Tailwind CSS, Prisma, IndexedDB (existing offline infra)

**Design doc:** `docs/plans/2026-03-04-portal-rondas-redesign-design.md`

---

## Task 1: Install Dependencies & Configure Leaflet

**Files:**
- Modify: `package.json`
- Create: `src/components/portal/rondas/leaflet-setup.ts`

**Step 1: Install react-leaflet and leaflet**

Run:
```bash
npm install leaflet react-leaflet
npm install -D @types/leaflet
```

**Step 2: Create Leaflet CSS setup helper**

Create `src/components/portal/rondas/leaflet-setup.ts`:

```typescript
"use client";

// Import Leaflet CSS — must be loaded before any map renders
import "leaflet/dist/leaflet.css";

// Fix Leaflet default icon path issue with bundlers
import L from "leaflet";

// Fix default marker icons (bundlers break the default asset paths)
delete (L.Icon.Default.prototype as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export { L };
```

**Step 3: Verify installation**

Run:
```bash
npx tsc --noEmit src/components/portal/rondas/leaflet-setup.ts 2>&1 | head -20
```

**Step 4: Commit**

```bash
git add package.json package-lock.json src/components/portal/rondas/leaflet-setup.ts
git commit -m "feat(rondas): install react-leaflet and configure leaflet setup"
```

---

## Task 2: Rewrite LoginScreen — Remove Installation Selector, Add PIN Dots

**Files:**
- Modify: `src/components/portal/rondas/LoginScreen.tsx` (185 lines → ~120 lines)

**Step 1: Rewrite LoginScreen**

Simplify to single-step login (no installation selector). Guard always has exactly 1 installation. Add visual PIN dots instead of plain password input.

Key changes:
- Remove `step`, `installations`, `installationId` state
- Remove step 2 (installation selector UI)
- Remove `sessionStorage("rondas_portal_auth_temp")`
- Add PIN dots visualization (filled/empty circles based on PIN length)
- PIN input remains hidden, dots are visual only
- On successful auth, call `onLogin` directly with the single installation from response
- If API returns no `currentInstallationId`, show error "No tienes instalación asignada. Contacta a tu supervisor."
- Keep: `formatRut`, `isValidRut` from `@/lib/guard-portal`
- Keep: dark theme, large touch targets (min-h-14), teal CTA button

PIN dots UI:
```tsx
<div className="flex justify-center gap-3 my-4">
  {[0, 1, 2, 3, 4, 5].map((i) => (
    <div
      key={i}
      className={`w-4 h-4 rounded-full border-2 transition-all ${
        i < pin.length
          ? "bg-teal-400 border-teal-400 scale-110"
          : "bg-transparent border-zinc-600"
      }`}
    />
  ))}
</div>
```

Error when no installation:
```tsx
if (data.installations?.length === 0 && !data.currentInstallationId) {
  setError("No tienes instalación asignada. Contacta a tu supervisor.");
  return;
}
```

**Step 2: Verify build compiles**

Run:
```bash
npx next build 2>&1 | tail -20
```

**Step 3: Commit**

```bash
git add src/components/portal/rondas/LoginScreen.tsx
git commit -m "feat(rondas): simplify login - auto installation, PIN dots UI"
```

---

## Task 3: Create RondaMap Component (Reusable Leaflet Map)

**Files:**
- Create: `src/components/portal/rondas/RondaMap.tsx` (~180 lines)

**Step 1: Create the map component**

This is a reusable map used in both MisRondas (static mini-map) and RondaActiva (interactive with GPS live).

```typescript
"use client";

import { useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";

// Types for checkpoint pins
export interface MapCheckpoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: "completed" | "active" | "pending";
  orderIndex: number;
}

export interface RondaMapProps {
  checkpoints: MapCheckpoint[];
  // Guard live position (optional — only for RondaActiva)
  guardPosition?: { lat: number; lng: number } | null;
  // Map height
  height?: string;
  // Whether to show route line between checkpoints
  showRoute?: boolean;
  // Whether map is interactive (zoom/pan) or static
  interactive?: boolean;
  // Callback when "Center" button is tapped
  onCenterGuard?: () => void;
  // Whether to show the center button
  showCenterButton?: boolean;
}
```

Implementation details:
- Use `dynamic(() => import(...), { ssr: false })` pattern for Leaflet (it accesses `window`)
- Create an inner `RondaMapInner` component that does the actual Leaflet rendering
- Custom circle markers instead of default pins:
  - Completed: green filled circle with white checkmark
  - Active: teal pulsing circle (CSS animation)
  - Pending: gray circle
- Guard position: blue pulsing dot with accuracy circle
- Route: dashed polyline connecting checkpoints in order, gray for pending segments, green for completed
- Auto-fit bounds to show all checkpoints + guard position
- "Centrar" button positioned bottom-left of map (Leaflet control)
- Use `L.divIcon` for custom markers to avoid external image dependencies

**Step 2: Verify it compiles**

Run:
```bash
npx next build 2>&1 | tail -20
```

**Step 3: Commit**

```bash
git add src/components/portal/rondas/RondaMap.tsx
git commit -m "feat(rondas): create reusable RondaMap component with Leaflet"
```

---

## Task 4: Rewrite MisRondas — Grouped Dashboard with Mini-Maps

**Files:**
- Modify: `src/components/portal/rondas/MisRondas.tsx` (391 lines → ~450 lines)

**Step 1: Rewrite MisRondas with grouped sections**

Key changes:
- Group rondas into 4 sections: `en_curso`, `atrasadas`, `proximas`, `completadas`
- Each section has a header with icon and label
- Add countdown/elapsed time per ronda:
  - En curso: "⏱️ 12:34 transcurridos" (live timer via `useEffect` + `setInterval`)
  - Atrasadas: "🔴 hace 2h 15m" (computed from `scheduledAt`)
  - Próximas: "⏳ en 1h 30m" (countdown to `scheduledAt`)
  - Completadas: just show completion time
- Add mini-map per ronda card using `<RondaMap>` with `interactive={false}` and `height="120px"`
- Próximas: no "Iniciar" button unless within tolerance window. Check: `now >= scheduledAt - toleranciaMinutos * 60000`
- Completadas section: collapsible, shows trust score and percentage inline
- Progress bar on en_curso cards
- Add date header: "Miércoles 4 de marzo" using `toChileTime` + `format`
- Add "Reportar Incidente" button at bottom of page

For tolerance window check, the API `mis-rondas` response includes `scheduledAt` and the template's schedule has `toleranciaMinutos`. Add `toleranciaMinutos` to the API response if not already included.

**Step 2: Update mis-rondas API to include toleranciaMinutos**

Modify: `src/app/api/portal/rondas/mis-rondas/route.ts`

In the response mapping, include `toleranciaMinutos` from the programacion:
```typescript
toleranciaMinutos: ejecucion.programacion?.toleranciaMinutos ?? 10,
```

**Step 3: Verify build**

Run:
```bash
npx next build 2>&1 | tail -20
```

**Step 4: Commit**

```bash
git add src/components/portal/rondas/MisRondas.tsx src/app/api/portal/rondas/mis-rondas/route.ts
git commit -m "feat(rondas): redesign MisRondas with grouped sections, mini-maps, countdowns"
```

---

## Task 5: Rewrite RondaActiva — Map + Timer + Improved Layout

**Files:**
- Modify: `src/components/portal/rondas/RondaActiva.tsx` (354 lines → ~400 lines)
- Modify: `src/components/portal/rondas/RondaProgress.tsx` (29 lines → same, minor styling)

**Step 1: Rewrite RondaActiva with map and timer**

Key changes:
- **Header**: back button, ronda name, refresh, live timer (`⏱️ MM:SS`), progress `X/Y`, progress bar
- Timer: `useEffect` with `setInterval(1000ms)`, calculates elapsed from `rondaData.startedAt` or from first interaction
- **Top half**: `<RondaMap>` with:
  - `guardPosition` from `watchPosition` (new state + effect)
  - `checkpoints` mapped from `rondaData.checkpoints` with status derived from completion
  - `showRoute={true}`, `interactive={true}`, `showCenterButton={true}`
  - Height: `"45vh"` (collapses to `"20vh"` on swipe/button)
- Map collapse: toggle button (chevron up/down) between 45vh and 20vh
- **Bottom half (scrollable list)**:
  - Active checkpoint: prominent card with real-time distance (use `watchPosition` coords + haversine), "Obligatorio" / "QR requerido" badges, tap to open bottom sheet
  - Pending checkpoints: compact rows
  - Completed checkpoints: at bottom, green, with timestamp, collapsed
- **Bottom buttons (sticky)**:
  - "🚨 Reportar Incidente" — opens incident modal
  - "✓ Completar Ronda" — with confirmation modal if missing checkpoints
- Confirmation modal: "Te faltan N puntos: [names]. ¿Completar de todas formas?" with "Cancelar" / "Completar" buttons

GPS watchPosition setup:
```typescript
const [guardPos, setGuardPos] = useState<{ lat: number; lng: number } | null>(null);
const watchIdRef = useRef<number | null>(null);

useEffect(() => {
  if (!navigator.geolocation) return;
  watchIdRef.current = navigator.geolocation.watchPosition(
    (pos) => setGuardPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    () => {}, // silent error — map just won't show guard
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
  return () => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
  };
}, []);
```

Distance calculation for active checkpoint (reuse haversine from `@/lib/rondas/geo-utils.ts` — but that's server code, so inline the haversine or import from a shared module):

```typescript
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

**Step 2: Verify build**

Run:
```bash
npx next build 2>&1 | tail -20
```

**Step 3: Commit**

```bash
git add src/components/portal/rondas/RondaActiva.tsx src/components/portal/rondas/RondaProgress.tsx
git commit -m "feat(rondas): redesign RondaActiva with Leaflet map, live GPS, timer"
```

---

## Task 6: Rewrite CheckpointMarker as Bottom Sheet

**Files:**
- Modify: `src/components/portal/rondas/CheckpointMarker.tsx` (767 lines → ~500 lines)

**Step 1: Convert CheckpointMarker to bottom sheet**

Key changes:
- Instead of a full-screen replacement, render as a **bottom sheet overlay** that slides up from the bottom
- The parent (`RondaActiva`) still shows behind it with the map visible
- Use CSS `transform: translateY()` animation for slide-up
- Drag handle at top for dismiss (swipe down to close)
- Content stays the same but reorganized:
  - Checkpoint name as header
  - GPS status card (simplified: icon + "✅ Listo · 12m" or "⏳ Obteniendo..." or "❌ Error")
  - Distance indicator: green if within radius, yellow warning if outside ("Estás a 85m — radio: 30m")
  - QR card (only if required): status + "Escanear QR" button
  - Photo card: "Agregar Foto" button, preview if captured
  - Notes textarea
  - "Confirmar Marcación" button (full width, teal, disabled until ready)
  - Hint text when disabled
- **Remove**: the full-screen rendering pattern. Instead, the component positions itself as `fixed bottom-0` with `z-50`
- **Keep**: all anti-fraud sensor collection (battery, motion, clientHash)
- **Keep**: offline fallback with IndexedDB
- **Keep**: online sync on mount
- GPS acquisition: still `getCurrentPosition` (not `watchPosition` — that's in RondaActiva)
- Photo upload flow: unchanged
- Bottom sheet height: `max-h-[75vh]` with overflow-y scroll

Bottom sheet wrapper:
```tsx
<div className="fixed inset-0 z-50 flex items-end">
  {/* Backdrop */}
  <div className="absolute inset-0 bg-black/50" onClick={onBack} />
  {/* Sheet */}
  <div className="relative w-full max-h-[75vh] bg-zinc-900 rounded-t-2xl overflow-y-auto animate-slide-up">
    {/* Drag handle */}
    <div className="flex justify-center py-3">
      <div className="w-10 h-1 bg-zinc-600 rounded-full" />
    </div>
    {/* Content */}
    ...
  </div>
</div>
```

Add CSS animation in a `<style>` JSX tag or Tailwind arbitrary:
```css
@keyframes slide-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
.animate-slide-up {
  animation: slide-up 0.3s ease-out;
}
```

**Step 2: Verify build**

Run:
```bash
npx next build 2>&1 | tail -20
```

**Step 3: Commit**

```bash
git add src/components/portal/rondas/CheckpointMarker.tsx
git commit -m "feat(rondas): convert CheckpointMarker to bottom sheet overlay"
```

---

## Task 7: Rewrite QrScanner — Use html5-qrcode

**Files:**
- Modify: `src/components/portal/rondas/QrScanner.tsx` (96 lines → ~120 lines)

**Step 1: Replace BarcodeDetector with html5-qrcode**

The library `html5-qrcode` is already in `package.json`. Replace the native `BarcodeDetector` implementation.

```typescript
"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { X, Camera, Keyboard } from "lucide-react";

interface QrScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

export function QrScanner({ onScan, onClose }: QrScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<string>("qr-reader-" + Date.now());

  useEffect(() => {
    const scanner = new Html5Qrcode(containerRef.current);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
        },
        (decodedText) => {
          scanner.stop().catch(() => {});
          onScan(decodedText);
        },
        () => {} // ignore scan failures (no QR in frame)
      )
      .catch((err: Error) => {
        setError("No se pudo acceder a la cámara. Verifica los permisos.");
        setShowManual(true);
        console.error("QR scanner error:", err);
      });

    return () => {
      scanner.stop().catch(() => {});
    };
  }, [onScan]);

  const handleManualSubmit = () => {
    const code = manualCode.trim();
    if (code) onScan(code);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <span className="text-white text-lg font-semibold">Escanear QR</span>
        <button onClick={onClose} className="text-white p-2">
          <X size={24} />
        </button>
      </div>

      {/* Scanner area */}
      {!showManual && (
        <div className="flex-1 flex items-center justify-center px-4">
          <div id={containerRef.current} className="w-full max-w-sm" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-2">
          <p className="text-red-400 text-sm text-center">{error}</p>
        </div>
      )}

      {/* Manual fallback */}
      <div className="p-4 space-y-3">
        {!showManual ? (
          <button
            onClick={() => setShowManual(true)}
            className="w-full flex items-center justify-center gap-2 py-3 text-zinc-400 text-sm"
          >
            <Keyboard size={16} />
            ¿No puedes escanear? Ingresa el código manual
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-zinc-400 text-sm text-center">
              Ingresa el código impreso debajo del QR
            </p>
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value.toUpperCase())}
              placeholder="Ej: CP-NORTE-001"
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-center text-lg uppercase"
              autoFocus
            />
            <button
              onClick={handleManualSubmit}
              disabled={!manualCode.trim()}
              className="w-full py-3 bg-teal-600 text-white rounded-lg font-semibold disabled:opacity-40"
            >
              Verificar Código
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify build**

Run:
```bash
npx next build 2>&1 | tail -20
```

**Step 3: Commit**

```bash
git add src/components/portal/rondas/QrScanner.tsx
git commit -m "feat(rondas): replace BarcodeDetector with html5-qrcode for cross-browser QR"
```

---

## Task 8: Rewrite RondaCompletada — Enhanced Summary

**Files:**
- Modify: `src/components/portal/rondas/RondaCompletada.tsx` (176 lines → ~250 lines)

**Step 1: Enhance the completion screen**

Key changes:
- Keep animated SVG gauge (existing), adjust thresholds:
  - Green ≥80 → "Excelente"
  - Yellow ≥60 → "Buen trabajo"
  - Red <60 → "Puedes mejorar"
- Add expanded summary card:
  - ✅ Completado: N%
  - ⏱️ Duración: N min
  - 📍 Puntos: X/Y
  - ⏰ Puntualidad: "A tiempo" or "X min tarde" (derive from `scheduledAt` vs `startedAt`)
  - 🚫 Omitidos: N (red if >0, green if 0)
- Add **per-checkpoint detail list**:
  - Each checkpoint: name, timestamp, distance, verification badges (GPS ✓, QR ✓, Foto ✓)
  - Missed checkpoints: shown with ❌ in red, "No visitado"
- Props need to be extended: the parent must pass `checkpoints` data (array with per-checkpoint detail) and `scheduledAt`

Update `CompletionData` type in `RondaActiva.tsx`:
```typescript
export interface CompletionData {
  trustScore: number;
  porcentajeCompletado: number;
  durationMinutes: number;
  missed: number;
  // New fields
  checkpoints?: {
    name: string;
    status: "COMPLETED" | "MISSED";
    timestamp?: string;
    distanceM?: number;
    geoValidada?: boolean;
    qrScanned?: boolean;
    hasPhoto?: boolean;
  }[];
  scheduledAt?: string;
  startedAt?: string;
}
```

Update `/completar` API response to include checkpoint details. Modify `src/app/api/portal/rondas/completar/route.ts` to return:
```typescript
checkpoints: allCheckpoints.map(cp => ({
  name: cp.checkpoint.name,
  status: marcacion ? "COMPLETED" : "MISSED",
  timestamp: marcacion?.timestamp?.toISOString(),
  distanceM: marcacion?.geoDistanciaM,
  geoValidada: marcacion?.geoValidada ?? false,
  qrScanned: marcacion?.verificationMethod === "QR" || marcacion?.verificationMethod === "BOTH",
  hasPhoto: !!marcacion?.fotoEvidenciaUrl,
}))
```

**Step 2: Verify build**

Run:
```bash
npx next build 2>&1 | tail -20
```

**Step 3: Commit**

```bash
git add src/components/portal/rondas/RondaCompletada.tsx src/components/portal/rondas/RondaActiva.tsx src/app/api/portal/rondas/completar/route.ts
git commit -m "feat(rondas): enhanced completion screen with per-checkpoint detail"
```

---

## Task 9: Create ReportarIncidente — Modal + API

**Files:**
- Create: `src/components/portal/rondas/ReportarIncidente.tsx` (~280 lines)
- Create: `src/app/api/portal/rondas/incidente/route.ts` (~80 lines)

**Step 1: Create the incident report modal component**

```typescript
"use client";

interface ReportarIncidenteProps {
  session: RondasSession;
  // If a round is active, pre-link the incident
  activeEjecucionId?: string;
  activeCheckpointId?: string;
  activeCheckpointName?: string;
  // All checkpoints for the active round (for dropdown)
  checkpoints?: { id: string; name: string }[];
  onClose: () => void;
  onSubmitted: () => void;
}

const INCIDENT_TYPES = [
  { id: "incendio", label: "Incendio", icon: "🔥" },
  { id: "fuga_agua", label: "Fuga de agua", icon: "💧" },
  { id: "acceso_forzado", label: "Acceso forzado", icon: "🚪" },
  { id: "persona_sospechosa", label: "Persona sospechosa", icon: "👤" },
  { id: "falla_electrica", label: "Falla eléctrica", icon: "💡" },
  { id: "otro", label: "Otro", icon: "⚠️" },
] as const;
```

UI structure:
- Modal overlay (fixed inset-0, z-50, bg-black/60 backdrop)
- Content card (bg-zinc-900, rounded-2xl, max-h-[85vh], overflow-y-auto)
- Close button top-right
- "🚨 Reportar Incidente" title
- Type grid: 3x2 grid of large touch-friendly buttons (min-h-20), selected has teal border
- Photo section: "Agregar Foto" button → opens PhotoCapture, shows preview if captured
- Description textarea: required, 3 rows, 500 char max
- GPS: captured automatically on mount, show "📍 Ubicación capturada ✅" or "📍 Obteniendo ubicación..."
- Checkpoint link: if active round, show dropdown pre-selecting active checkpoint
- "🚨 Enviar Reporte" button: disabled until type + description filled
- On submit: upload photo if present → POST to `/api/portal/rondas/incidente`
- Offline support: if fetch fails, save to IndexedDB under `pending-incidents` store and sync later

**Step 2: Create the API route**

`src/app/api/portal/rondas/incidente/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const body = await req.json();
  const { tenantId, guardiaId, installationId, ejecucionId, checkpointId, tipo, descripcion, fotoUrl, lat, lng } = body;

  if (!tenantId || !guardiaId || !tipo || !descripcion) {
    return NextResponse.json({ error: "Campos requeridos faltantes" }, { status: 400 });
  }

  const incidente = await prisma.opsRondaIncidente.create({
    data: {
      tenantId,
      guardiaId,
      installationId: installationId || undefined,
      ejecucionId: ejecucionId || undefined,
      checkpointId: checkpointId || undefined,
      rondaTemplateId: undefined,
      tipo,
      descripcion,
      fotoUrl: fotoUrl || undefined,
      lat: lat || undefined,
      lng: lng || undefined,
      status: "abierto",
    },
  });

  return NextResponse.json({ id: incidente.id });
}
```

**Step 3: Verify build**

Run:
```bash
npx next build 2>&1 | tail -20
```

**Step 4: Commit**

```bash
git add src/components/portal/rondas/ReportarIncidente.tsx src/app/api/portal/rondas/incidente/route.ts
git commit -m "feat(rondas): add incident reporting modal and API endpoint"
```

---

## Task 10: Update RondasPortalClient — Wire Everything Together

**Files:**
- Modify: `src/components/portal/rondas/RondasPortalClient.tsx` (274 lines → ~320 lines)

**Step 1: Update the orchestrator**

Key changes:
- Add `showIncidentModal` state (boolean)
- Add `activeCheckpoints` state to pass checkpoint list context to incident modal
- Remove `"marcar"` from `RondasScreen` type — CheckpointMarker is now a bottom sheet rendered WITHIN `ronda-activa`, not a separate screen
- Update screen flow:
  - `"login"` → `"mis-rondas"` → `"ronda-activa"` → `"completada"`
  - `"chat"` remains as a separate screen from the FAB
- The `ronda-activa` screen internally manages the bottom sheet for marking
- Pass `onReportIncident` callback to MisRondas and RondaActiva
- Render `<ReportarIncidente>` conditionally when `showIncidentModal` is true
- Update the `onMark` flow: since CheckpointMarker is now inside RondaActiva, RondasPortalClient no longer needs `activeCheckpointId` state or the `"marcar"` screen
- Keep: session management, offline banner, chat FAB, install banner

Updated screen rendering:
```tsx
{screen === "login" && <LoginScreen onLogin={handleLogin} />}
{screen === "mis-rondas" && (
  <MisRondas
    session={session}
    onLogout={handleLogout}
    onIniciarRonda={handleIniciarRonda}
    onReportIncident={() => setShowIncidentModal(true)}
  />
)}
{screen === "ronda-activa" && activeRondaData && (
  <RondaActiva
    session={session}
    rondaData={activeRondaData}
    onComplete={handleComplete}
    onBack={() => setScreen("mis-rondas")}
    onReportIncident={() => setShowIncidentModal(true)}
  />
)}
{screen === "completada" && completionData && (
  <RondaCompletada {...completionData} onBackToRondas={() => setScreen("mis-rondas")} />
)}
{screen === "chat" && session && (
  <ChatRondasSection session={session} onBack={() => setScreen("mis-rondas")} />
)}
{showIncidentModal && session && (
  <ReportarIncidente
    session={session}
    activeEjecucionId={activeEjecucionId ?? undefined}
    activeCheckpointId={undefined}
    onClose={() => setShowIncidentModal(false)}
    onSubmitted={() => setShowIncidentModal(false)}
  />
)}
```

**Step 2: Verify full build**

Run:
```bash
npx next build 2>&1 | tail -30
```

**Step 3: Commit**

```bash
git add src/components/portal/rondas/RondasPortalClient.tsx
git commit -m "feat(rondas): wire redesigned components in portal orchestrator"
```

---

## Task 11: Add slide-up Animation + Final Polish

**Files:**
- Modify: `src/app/portal/rondas/layout.tsx` (add global animation styles if needed)
- Modify: Various components for final polish

**Step 1: Add global CSS animation for bottom sheet**

If Tailwind's `@keyframes` in arbitrary values doesn't work cleanly, add to `globals.css` or inline in layout:

```css
@keyframes slide-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
```

**Step 2: Final UI polish pass**

- Verify dark theme consistency across all new/modified components
- Ensure all touch targets are ≥ 44px (WCAG)
- Verify haptic feedback (`navigator.vibrate`) on: successful mark, round completion
- Verify offline banner still works
- Verify chat FAB positioning doesn't conflict with new bottom buttons

**Step 3: Verify full build and no TypeScript errors**

Run:
```bash
npx next build 2>&1 | tail -30
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat(rondas): final polish — animations, dark theme consistency, touch targets"
```

---

## Task 12: Manual Integration Testing

**No code changes — testing checklist:**

1. **Login flow**: RUT + PIN → direct to Mis Rondas (no installation selector)
2. **Mis Rondas**: verify 4 sections render correctly, countdown timers tick, mini-maps show pins
3. **Tolerancia**: verify "Iniciar" button only appears within tolerance window
4. **Ronda Activa**: map loads with checkpoints, guard position shows (requires GPS), timer ticks
5. **Checkpoint marking**: bottom sheet slides up, GPS acquires, QR scanner works (test on iOS Safari + Chrome Android), photo capture works, confirm marks correctly
6. **Completion**: confirmation modal when checkpoints missing, completion screen shows per-checkpoint detail
7. **Incident report**: modal opens from both screens, photo + description + type, submit works
8. **QR scanner**: test on Safari iOS, Chrome Android, desktop Chrome
9. **Offline**: disable network → mark checkpoint → verify saved to IndexedDB → re-enable → verify sync
10. **PWA**: install prompt still works, standalone mode works

---

## Summary

| Task | Component | Action | Est. Lines Changed |
|------|-----------|--------|-------------------|
| 1 | Dependencies | Install leaflet, react-leaflet | +2 files |
| 2 | LoginScreen | Simplify, PIN dots | ~185 → ~120 |
| 3 | RondaMap | New reusable map | +180 |
| 4 | MisRondas | Grouped dashboard, mini-maps | ~391 → ~450 |
| 5 | RondaActiva | Map + timer + GPS live | ~354 → ~400 |
| 6 | CheckpointMarker | Bottom sheet conversion | ~767 → ~500 |
| 7 | QrScanner | html5-qrcode replacement | ~96 → ~120 |
| 8 | RondaCompletada | Per-checkpoint detail | ~176 → ~250 |
| 9 | ReportarIncidente | New modal + API | +360 |
| 10 | RondasPortalClient | Rewire orchestrator | ~274 → ~320 |
| 11 | Polish | Animations, consistency | minor |
| 12 | Testing | Manual integration test | 0 |
