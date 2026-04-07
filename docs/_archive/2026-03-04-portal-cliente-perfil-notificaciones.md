# Portal Cliente: Perfil + Preferencias de Notificaciones

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Agregar un menú de usuario en el header del portal cliente (nombre + iniciales arriba a la derecha) con dropdown que muestre "Notificaciones" y "Salir", donde "Notificaciones" abre un sheet inferior con los toggles de alertas.

**Architecture:** Dos nuevos componentes de cliente (`PortalUserMenu` y `PortalNotificacionesSheet`). El sheet reutiliza exactamente la misma lógica fetch/toggle de `PortalAlertas`. `PortalClienteClient` reemplaza el botón de logout actual por el nuevo `PortalUserMenu` y gestiona el estado del sheet.

**Tech Stack:** React 18, Next.js 15 App Router, Tailwind CSS, Lucide icons, `'use client'` components, TypeScript.

---

## Contexto del codebase

- Portal cliente vive en `src/app/portal/cliente/PortalClienteClient.tsx`
- El header actual tiene un `<button onClick={logout}><LogOut /></button>` a la derecha
- `PortalAlertas` (`src/components/portal/cliente/PortalAlertas.tsx`) ya tiene la lógica completa de toggles de alertas — copiar ese patrón en el sheet
- Tipos del portal en `src/lib/portal-cliente-types.ts` (NO importar de `src/lib/portal-cliente.ts` en client components — ese tiene `server-only`)
- API de alertas: `GET /api/portal/cliente/alertas/config` y `PUT /api/portal/cliente/alertas/config` con headers `x-contact-id`, `x-tenant-id`, `x-account-id`

### Bug colateral a corregir
`src/components/portal/cliente/PortalClienteNav.tsx` línea 7 importa de `@/lib/portal-cliente` (tiene `server-only`). Hay que cambiarlo a `@/lib/portal-cliente-types`.

---

## Task 1: Fix import en PortalClienteNav

**Files:**
- Modify: `src/components/portal/cliente/PortalClienteNav.tsx:7`

**Step 1: Cambiar el import**

En `PortalClienteNav.tsx` línea 7, cambiar:
```ts
import { PortalConfig } from '@/lib/portal-cliente'
```
por:
```ts
import { PortalConfig } from '@/lib/portal-cliente-types'
```

**Step 2: Verificar TypeScript**
```bash
npx tsc --noEmit 2>&1 | grep "PortalClienteNav"
```
Expected: sin errores.

**Step 3: Commit**
```bash
git add src/components/portal/cliente/PortalClienteNav.tsx
git commit -m "fix(portal-cliente): fix server-only import in PortalClienteNav"
```

---

## Task 2: Crear `PortalUserMenu`

Componente que muestra el nombre del usuario con iniciales y un dropdown con "Notificaciones" y "Salir".

**Files:**
- Create: `src/components/portal/cliente/PortalUserMenu.tsx`

**Step 1: Crear el componente**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, LogOut } from "lucide-react";
import { ClienteSession } from "@/lib/portal-cliente-types";
import { cn } from "@/lib/utils";

interface Props {
  session: ClienteSession;
  onNotificaciones: () => void;
  onLogout: () => void;
}

export function PortalUserMenu({ session, onNotificaciones, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const initials = `${session.firstName.charAt(0)}${session.lastName.charAt(0)}`.toUpperCase();
  const shortName = `${session.firstName} ${session.lastName.charAt(0)}.`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 h-8 px-2 rounded-lg hover:bg-white/5 transition-colors"
      >
        <div className="h-6 w-6 rounded-full bg-teal-500/20 text-teal-400 text-[10px] font-semibold flex items-center justify-center shrink-0">
          {initials}
        </div>
        <span className="text-xs text-zinc-300 max-w-[90px] truncate hidden sm:block">{shortName}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-zinc-500 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 top-10 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl py-1.5 min-w-[180px] z-50">
          <button
            onClick={() => { setOpen(false); onNotificaciones(); }}
            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
          >
            <Bell className="h-4 w-4 text-zinc-400" />
            Notificaciones
          </button>
          <div className="my-1 border-t border-zinc-700" />
          <button
            onClick={() => { setOpen(false); onLogout(); }}
            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-zinc-700 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Salir
          </button>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verificar TypeScript**
```bash
npx tsc --noEmit 2>&1 | grep "PortalUserMenu"
```
Expected: sin errores.

**Step 3: Commit**
```bash
git add src/components/portal/cliente/PortalUserMenu.tsx
git commit -m "feat(portal-cliente): add PortalUserMenu dropdown component"
```

---

## Task 3: Crear `PortalNotificacionesSheet`

Sheet inferior con los mismos toggles de `PortalAlertas`. La lógica fetch/toggle es copia directa.

**Files:**
- Create: `src/components/portal/cliente/PortalNotificacionesSheet.tsx`

**Step 1: Crear el componente**

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Bell, Loader2, Mail, Smartphone } from "lucide-react";
import { ClienteSession } from "@/lib/portal-cliente-types";

interface AlertConfig {
  id: string | null;
  alertType: string;
  channels: { push: boolean; email: boolean };
  isActive: boolean;
}

const ALERT_LABELS: Record<string, { label: string; desc: string }> = {
  guard_absent: { label: "Guardia ausente", desc: "Cuando un guardia no se presenta a su turno" },
  ronda_incomplete: { label: "Ronda incompleta", desc: "Cuando una ronda no alcanza el 100%" },
  checkpoint_missed: { label: "Checkpoint sin marcar", desc: "Cuando un checkpoint no fue marcado" },
  incident: { label: "Incidente reportado", desc: "Cuando un guardia reporta un incidente" },
  new_document: { label: "Nuevo documento", desc: "Cuando se sube un documento a tu portal" },
  ticket_replied: { label: "Respuesta en ticket", desc: "Cuando el equipo Gard responde tu ticket" },
  quote_pending: { label: "Cotización pendiente", desc: "Cuando hay una cotización esperando tu revisión" },
  contract_expiring: { label: "Contrato por vencer", desc: "Cuando un contrato está próximo a expirar" },
};

interface Props {
  session: ClienteSession;
  open: boolean;
  onClose: () => void;
}

export function PortalNotificacionesSheet({ session, open, onClose }: Props) {
  const [configs, setConfigs] = useState<AlertConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const headers: Record<string, string> = {
    "x-contact-id": session.contactId,
    "x-tenant-id": session.tenantId,
    "x-account-id": session.accountId,
    "Content-Type": "application/json",
  };

  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    fetch("/api/portal/cliente/alertas/config", { headers })
      .then((r) => r.json())
      .then((res) => { if (res.success) setConfigs(res.data ?? []); })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(async (updated: AlertConfig[]) => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/portal/cliente/alertas/config", {
        method: "PUT",
        headers,
        body: JSON.stringify(updated.map((c) => ({
          alertType: c.alertType,
          channels: c.channels,
          isActive: c.isActive,
        }))),
      }).then((r) => r.json());
      if (res.success && res.data) {
        const serverMap = new Map<string, string>(res.data.map((d: AlertConfig) => [d.alertType, d.id as string]));
        setConfigs((prev) => prev.map((c) => ({ ...c, id: serverMap.get(c.alertType) ?? c.id })));
      }
    } catch {}
    setIsSaving(false);
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (alertType: string, field: "isActive" | "push" | "email") => {
    setConfigs((prev) => {
      const next = prev.map((c) => {
        if (c.alertType !== alertType) return c;
        if (field === "isActive") return { ...c, isActive: !c.isActive };
        return { ...c, channels: { ...c.channels, [field]: !c.channels[field] } };
      });
      save(next);
      return next;
    });
  };

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/60 z-50"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-900 border-t border-zinc-700 rounded-t-2xl max-h-[85dvh] overflow-y-auto">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-zinc-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-zinc-100">Preferencias de notificaciones</h2>
          </div>
          <div className="flex items-center gap-2">
            {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <X className="h-4 w-4 text-zinc-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 py-3 pb-8">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          ) : (
            <>
              {/* Column labels */}
              <div className="flex items-center gap-2 px-2 mb-2">
                <div className="flex-1" />
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-[10px] text-zinc-600 uppercase tracking-wider w-8 text-center flex flex-col items-center gap-0.5">
                    <Mail className="h-3.5 w-3.5" />Email
                  </span>
                  <span className="text-[10px] text-zinc-600 uppercase tracking-wider w-8 text-center flex flex-col items-center gap-0.5">
                    <Smartphone className="h-3.5 w-3.5" />Push
                  </span>
                  <span className="text-[10px] text-zinc-600 uppercase tracking-wider w-8 text-center">
                    Activo
                  </span>
                </div>
              </div>

              {/* Rows */}
              <div className="space-y-2">
                {configs.map((cfg) => {
                  const meta = ALERT_LABELS[cfg.alertType];
                  if (!meta) return null;
                  return (
                    <div
                      key={cfg.alertType}
                      className={`flex items-center gap-3 px-3 py-3 rounded-xl border transition-colors ${
                        cfg.isActive
                          ? "border-white/10 bg-white/[0.02]"
                          : "border-white/5 bg-white/[0.01] opacity-60"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-100">{meta.label}</p>
                        <p className="text-[11px] text-zinc-500 leading-tight">{meta.desc}</p>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <button
                          onClick={() => toggle(cfg.alertType, "email")}
                          disabled={!cfg.isActive}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                            cfg.channels.email && cfg.isActive
                              ? "bg-blue-500/20 text-blue-400"
                              : "bg-zinc-800/50 text-zinc-600"
                          } disabled:cursor-not-allowed`}
                        >
                          <Mail className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => toggle(cfg.alertType, "push")}
                          disabled={!cfg.isActive}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                            cfg.channels.push && cfg.isActive
                              ? "bg-amber-500/20 text-amber-400"
                              : "bg-zinc-800/50 text-zinc-600"
                          } disabled:cursor-not-allowed`}
                        >
                          <Smartphone className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => toggle(cfg.alertType, "isActive")}
                          className={`w-8 h-5 rounded-full relative transition-colors ${
                            cfg.isActive ? "bg-teal-500" : "bg-zinc-700"
                          }`}
                        >
                          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                            cfg.isActive ? "translate-x-3" : "translate-x-0.5"
                          }`} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
```

**Step 2: Verificar TypeScript**
```bash
npx tsc --noEmit 2>&1 | grep "PortalNotificacionesSheet"
```
Expected: sin errores.

**Step 3: Commit**
```bash
git add src/components/portal/cliente/PortalNotificacionesSheet.tsx
git commit -m "feat(portal-cliente): add PortalNotificacionesSheet slide-up panel"
```

---

## Task 4: Integrar en `PortalClienteClient`

Reemplazar el botón de logout en el header por `PortalUserMenu` y montar el sheet de notificaciones.

**Files:**
- Modify: `src/app/portal/cliente/PortalClienteClient.tsx`

**Step 1: Agregar imports**

Buscar el bloque de imports (líneas 1-24 aprox.) y agregar los dos nuevos componentes:

```tsx
import { PortalUserMenu } from "@/components/portal/cliente/PortalUserMenu";
import { PortalNotificacionesSheet } from "@/components/portal/cliente/PortalNotificacionesSheet";
```

Eliminar el import de `LogOut` de lucide-react si ya no se usa en ningún otro lugar del archivo (revisar antes).

**Step 2: Agregar estado del sheet**

En el bloque de estado (donde están los `useState`), agregar:

```tsx
const [notifSheetOpen, setNotifSheetOpen] = useState(false);
```

**Step 3: Reemplazar el botón de logout en el header**

Buscar y reemplazar este bloque en el header (dentro del `<div className="flex items-center gap-2">`):

```tsx
// ANTES — eliminar esto:
<button
  onClick={() => {
    setSession(null);
    setScreen("login");
    setActiveSection("dashboard");
  }}
  className="p-2 rounded hover:bg-white/5 transition-colors"
>
  <LogOut className="h-4 w-4 text-zinc-400" />
</button>

// DESPUÉS — poner esto:
{session && (
  <PortalUserMenu
    session={session}
    onNotificaciones={() => setNotifSheetOpen(true)}
    onLogout={() => {
      setSession(null);
      setScreen("login");
      setActiveSection("dashboard");
    }}
  />
)}
```

**Step 4: Montar el sheet al final del return del dashboard**

Buscar el cierre `</div>` final del return del dashboard (después de `<PortalClienteNav ... />`), y antes de ese cierre agregar:

```tsx
{/* Notificaciones sheet */}
{session && (
  <PortalNotificacionesSheet
    session={session}
    open={notifSheetOpen}
    onClose={() => setNotifSheetOpen(false)}
  />
)}
```

**Step 5: Verificar TypeScript**
```bash
npx tsc --noEmit 2>&1 | grep -E "PortalClienteClient|PortalUserMenu|PortalNotificaciones"
```
Expected: sin errores.

**Step 6: Commit**
```bash
git add src/app/portal/cliente/PortalClienteClient.tsx
git commit -m "feat(portal-cliente): integrate user menu and notifications sheet in header"
```

---

## Verificación final

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"
```
Expected: `0`

El flujo funcional a verificar manualmente en el browser:
1. Ingresar al portal cliente → en el header arriba a la derecha se ve el nombre/iniciales del contacto
2. Hacer clic → dropdown con "Notificaciones" y "Salir"
3. Hacer clic en "Notificaciones" → sheet sube desde el borde inferior
4. Los toggles de alertas funcionan (se guardan al hacer clic)
5. Hacer clic en overlay o `×` → sheet se cierra
6. Hacer clic en "Salir" → logout correcto
