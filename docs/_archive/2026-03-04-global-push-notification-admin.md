# Global Push Notification Admin Toggle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow admins to enable/disable each push notification type globally (per tenant) from `/opai/configuracion/notificaciones`, so a disabled type is never sent to any user regardless of their individual preferences.

**Architecture:** Global config is stored in the existing `Setting` model (key `push_global_config:{tenantId}`) as a JSON blob `{ [notifKey]: { pushEnabled: boolean } }`. The `sendPushToPortalUser()` function reads this config before sending and short-circuits if the type is globally disabled. The admin UI is added as a new section inside the existing `NotificationConfigClient` component.

**Tech Stack:** Next.js 15 App Router, Prisma (Setting model), TypeScript, Tailwind, Sonner toasts.

---

## Context: Key files

- `src/lib/pwa/portal-notification-types.ts` — defines `PORTAL_NOTIFICATION_TYPES` array (all notification keys + labels). Do NOT modify this file.
- `src/lib/pwa/push-service.ts` — `sendPushToPortalUser()`. Add global config check here.
- `src/app/api/notifications/config/route.ts` — GET/POST for notification settings. Currently handles `docExpiryDaysDefault`. Extend to also handle `pushGlobalConfig`.
- `src/components/opai/NotificationConfigClient.tsx` — Admin UI component. Add a new section with toggle switches.
- Prisma `Setting` model — `{ key: string @unique, value: string, type: string, category?: string, tenantId?: string }`. Stored in `public` schema.

## What NOT to change

- `portal-notification-types.ts` — never touch this
- `PortalNotificationPreference` model or user-level preferences — those are per-user and separate
- Any portal-side components — this is admin-only

---

### Task 1: Extend the config API to read/write `pushGlobalConfig`

**Files:**
- Modify: `src/app/api/notifications/config/route.ts`

**Context:** The API currently only handles `docExpiryDaysDefault`. We need it to also persist a `pushGlobalConfig` object that maps each notification key to `{ pushEnabled: boolean }`.

The `pushGlobalConfig` default is all keys enabled (i.e., `true`). We store it in the same `Setting` record alongside `docExpiryDaysDefault`.

**Step 1: Update the DEFAULTS constant and add validation helper**

Replace the existing `DEFAULTS` and `POST` handler with the following. The full new content of the route:

```typescript
/**
 * API: /api/notifications/config
 * GET  - Obtener preferencias de notificación del tenant
 * POST - Guardar preferencias de notificación del tenant
 *
 * Almacenadas en la tabla Setting con key="notification_preferences" + tenantId
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { hasPermission, PERMISSIONS, type Role } from "@/lib/rbac";
import { PORTAL_NOTIFICATION_TYPES } from "@/lib/pwa/portal-notification-types";

function settingKey(tenantId: string) {
  return `notification_preferences:${tenantId}`;
}

/** Default: all notification types push-enabled = true */
function defaultPushGlobalConfig(): Record<string, { pushEnabled: boolean }> {
  return Object.fromEntries(
    PORTAL_NOTIFICATION_TYPES.map((t) => [t.key, { pushEnabled: t.defaultPush }])
  );
}

const BASE_DEFAULTS = { docExpiryDaysDefault: 30 };

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const setting = await prisma.setting.findFirst({
      where: { key: settingKey(ctx.tenantId) },
    });

    let prefs = { ...BASE_DEFAULTS, pushGlobalConfig: defaultPushGlobalConfig() };
    if (setting?.value) {
      try {
        const parsed = JSON.parse(setting.value);
        prefs = {
          ...BASE_DEFAULTS,
          ...parsed,
          pushGlobalConfig: parsed.pushGlobalConfig ?? defaultPushGlobalConfig(),
        };
      } catch {
        // corrupted JSON — return defaults
      }
    }

    return NextResponse.json({ success: true, data: prefs });
  } catch (error) {
    console.error("Error fetching notification config:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener configuración" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    if (!hasPermission(ctx.userRole as Role, PERMISSIONS.MANAGE_SETTINGS)) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para cambiar la configuración" },
        { status: 403 }
      );
    }

    const body = await request.json();

    const docExpiryDays =
      typeof body.docExpiryDaysDefault === "number"
        ? Math.max(1, Math.min(365, body.docExpiryDaysDefault))
        : 30;

    // Sanitize pushGlobalConfig: only allow known keys, only boolean values
    const validKeys = new Set(PORTAL_NOTIFICATION_TYPES.map((t) => t.key));
    const rawPushConfig = body.pushGlobalConfig ?? {};
    const pushGlobalConfig: Record<string, { pushEnabled: boolean }> = {};
    for (const key of validKeys) {
      const val = rawPushConfig[key];
      pushGlobalConfig[key] = {
        pushEnabled: typeof val?.pushEnabled === "boolean" ? val.pushEnabled : true,
      };
    }

    const merged = { docExpiryDaysDefault: docExpiryDays, pushGlobalConfig };
    const value = JSON.stringify(merged);

    const existing = await prisma.setting.findFirst({
      where: { key: settingKey(ctx.tenantId) },
    });

    if (existing) {
      await prisma.setting.update({ where: { id: existing.id }, data: { value } });
    } else {
      await prisma.setting.create({
        data: {
          key: settingKey(ctx.tenantId),
          value,
          type: "json",
          category: "notifications",
          tenantId: ctx.tenantId,
        },
      });
    }

    return NextResponse.json({ success: true, data: merged });
  } catch (error) {
    console.error("Error saving notification config:", error);
    return NextResponse.json(
      { success: false, error: "Error al guardar configuración" },
      { status: 500 }
    );
  }
}
```

**Step 2: Verify TypeScript**

Run: `npx tsc --noEmit 2>&1 | grep "notifications/config"`
Expected: no errors for this file.

**Step 3: Commit**

```bash
git add src/app/api/notifications/config/route.ts
git commit -m "feat(notifications): extend config API to include global push toggles per type"
```

---

### Task 2: Add global push toggle UI to `NotificationConfigClient`

**Files:**
- Modify: `src/components/opai/NotificationConfigClient.tsx`

**Context:** The component currently shows one section (docExpiryDaysDefault). Add a second section that renders one toggle row per notification type from `PORTAL_NOTIFICATION_TYPES`. Toggling it calls the existing `handleSave` (optimistic — save on every toggle, not just on button click).

**Step 1: Replace the full component content**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Save, Loader2, Bell, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import Link from "next/link";
import { PORTAL_NOTIFICATION_TYPES } from "@/lib/pwa/portal-notification-types";

type PushGlobalConfig = Record<string, { pushEnabled: boolean }>;
type Prefs = { docExpiryDaysDefault?: number; pushGlobalConfig?: PushGlobalConfig };

function defaultPushConfig(): PushGlobalConfig {
  return Object.fromEntries(
    PORTAL_NOTIFICATION_TYPES.map((t) => [t.key, { pushEnabled: t.defaultPush }])
  );
}

export function NotificationConfigClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({});

  const fetchPrefs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications/config");
      const json = await res.json();
      if (json.success && json.data) setPrefs(json.data);
    } catch {
      toast.error("No se pudieron cargar las preferencias");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPrefs();
  }, [fetchPrefs]);

  const savePrefs = async (updated: Prefs) => {
    setSaving(true);
    try {
      const res = await fetch("/api/notifications/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Guardado");
        if (json.data) setPrefs(json.data);
      } else {
        toast.error(json.error || "Error al guardar");
      }
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleDocExpiryChange = (value: number) => {
    setPrefs((prev) => ({ ...prev, docExpiryDaysDefault: value }));
  };

  const handlePushToggle = (key: string, enabled: boolean) => {
    const current = prefs.pushGlobalConfig ?? defaultPushConfig();
    const updated: Prefs = {
      ...prefs,
      pushGlobalConfig: { ...current, [key]: { pushEnabled: enabled } },
    };
    setPrefs(updated);
    void savePrefs(updated);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const pushConfig = prefs.pushGlobalConfig ?? defaultPushConfig();

  // Group notification types by portal
  const portalLabels: Record<string, string> = {
    cliente: "Portal Clientes",
    guardia: "Portal Guardias",
    rondas: "Portal Rondas",
    app: "App OPAI",
  };
  const portalOrder = ["app", "cliente", "guardia", "rondas"] as const;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Las preferencias individuales (qué notificaciones quiere recibir cada usuario) se
        configuran en{" "}
        <Link
          href="/opai/perfil/notificaciones"
          className="text-primary underline hover:no-underline"
        >
          Perfil → Mis notificaciones
        </Link>
        . Aquí controlas los tipos que están activos a nivel global: si desactivas un tipo,
        nadie lo recibe sin importar su preferencia personal.
      </div>

      {/* Push notifications global toggle */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          Notificaciones Push — control global
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />}
        </h3>
        <p className="text-xs text-muted-foreground">
          Activa o desactiva cada tipo de notificación push para todos los portales. Los cambios
          aplican inmediatamente.
        </p>

        {portalOrder.map((portal) => {
          const types = PORTAL_NOTIFICATION_TYPES.filter((t) => t.portals.includes(portal));
          if (types.length === 0) return null;
          return (
            <div key={portal}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {portalLabels[portal]}
              </p>
              <div className="space-y-2">
                {types.map((t) => {
                  const enabled = pushConfig[t.key]?.pushEnabled ?? t.defaultPush;
                  return (
                    <div
                      key={t.key}
                      className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium flex items-center gap-1.5">
                          <Smartphone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          {t.label}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                      </div>
                      <Switch
                        checked={enabled}
                        onCheckedChange={(v) => handlePushToggle(t.key, v)}
                        aria-label={`Activar ${t.label}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      {/* Document expiry */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Documentos (módulo Documentos)
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Define cuántos días antes del vencimiento se considera &quot;por vencer&quot; al crear
          nuevos documentos.
        </p>
        <div className="flex items-center gap-3 py-3">
          <label className="text-xs text-muted-foreground whitespace-nowrap">
            Días antes del vencimiento (default para nuevos docs):
          </label>
          <Input
            type="number"
            min={1}
            max={365}
            className="w-20 text-sm"
            value={Number(prefs.docExpiryDaysDefault ?? 30)}
            onChange={(e) =>
              handleDocExpiryChange(
                Math.max(1, Math.min(365, Number(e.target.value) || 30))
              )
            }
          />
        </div>
      </section>

      <div className="flex justify-end">
        <Button
          onClick={() => void savePrefs(prefs)}
          disabled={saving}
          size="sm"
          className="gap-1.5"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Guardar
        </Button>
      </div>
    </div>
  );
}
```

**Note on `Switch` component:** Check if `@/components/ui/switch` exists by running:
```bash
ls src/components/ui/switch.tsx 2>/dev/null && echo "EXISTS" || echo "MISSING"
```
If MISSING, install it: `npx shadcn@latest add switch`

**Step 2: Verify TypeScript**

Run: `npx tsc --noEmit 2>&1 | grep "NotificationConfigClient"`
Expected: no errors.

**Step 3: Commit**

```bash
git add src/components/opai/NotificationConfigClient.tsx
git commit -m "feat(notifications): add global push toggle UI per notification type in admin config"
```

---

### Task 3: Enforce global config in `sendPushToPortalUser`

**Files:**
- Modify: `src/lib/pwa/push-service.ts`

**Context:** Before sending any push, check if that `notifKey` is globally enabled in the `Setting` model. If the admin disabled it, short-circuit without sending. This check runs after preference check (step 1) and before fetching subscriptions (step 2).

**Step 1: Add the global config check**

Add a helper function and update `sendPushToPortalUser`. The key section to add is between the preference check and the subscription query:

```typescript
// After imports, add:
function settingKey(tenantId: string) {
  return `notification_preferences:${tenantId}`;
}

async function isGloballyEnabled(tenantId: string, notifKey: string): Promise<boolean> {
  try {
    const setting = await prisma.setting.findFirst({
      where: { key: settingKey(tenantId) },
      select: { value: true },
    });
    if (!setting?.value) return true; // default: enabled
    const parsed = JSON.parse(setting.value);
    const globalConfig = parsed.pushGlobalConfig as Record<string, { pushEnabled?: boolean }> | undefined;
    if (!globalConfig) return true;
    return globalConfig[notifKey]?.pushEnabled !== false;
  } catch {
    return true; // on error, allow push to avoid silent drops
  }
}
```

Then in `sendPushToPortalUser`, after the user preference check and before `// 2. Get active push subscriptions`, add:

```typescript
  // 1b. Check global config (admin can disable a notification type for all users)
  const globallyEnabled = await isGloballyEnabled(tenantId, notifKey);
  if (!globallyEnabled) return;
```

Full updated `push-service.ts`:

```typescript
import webPush from 'web-push';
import { prisma } from '@/lib/prisma';

let vapidInitialized = false;
function ensureVapidInitialized() {
  if (vapidInitialized) return;
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    throw new Error('[push] VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set in environment');
  }
  webPush.setVapidDetails(
    'mailto:soporte@gardsecurity.cl',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  vapidInitialized = true;
}

function settingKey(tenantId: string) {
  return `notification_preferences:${tenantId}`;
}

async function isGloballyEnabled(tenantId: string, notifKey: string): Promise<boolean> {
  try {
    const setting = await prisma.setting.findFirst({
      where: { key: settingKey(tenantId) },
      select: { value: true },
    });
    if (!setting?.value) return true;
    const parsed = JSON.parse(setting.value);
    const globalConfig = parsed.pushGlobalConfig as Record<string, { pushEnabled?: boolean }> | undefined;
    if (!globalConfig) return true;
    return globalConfig[notifKey]?.pushEnabled !== false;
  } catch {
    return true; // fail open — never silently drop on error
  }
}

type UserType = 'contact' | 'guardia' | 'admin';

function toChatSenderType(userType: UserType) {
  const map = { contact: 'CLIENT', guardia: 'GUARD', admin: 'ADMIN' } as const;
  return map[userType];
}

interface SendPushParams {
  tenantId: string;
  notifKey: string;
  userType: UserType;
  userId: string;
  portalType: 'cliente' | 'guardia' | 'rondas' | 'app';
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export async function sendPushToPortalUser({
  tenantId,
  notifKey,
  userType,
  userId,
  portalType,
  title,
  body,
  url,
  tag,
}: SendPushParams) {
  ensureVapidInitialized();

  // 1. Check user-level preferences (portal users only)
  if (userType !== 'admin') {
    const prefs = await prisma.portalNotificationPreference.findUnique({
      where: {
        userType_userId_portalType: { userType, userId, portalType },
      },
    });
    if (prefs) {
      const prefMap = prefs.preferences as Record<string, { push?: boolean }>;
      if (prefMap[notifKey]?.push === false) return;
    }
  }

  // 1b. Check global config (admin can disable a type for all users)
  const globallyEnabled = await isGloballyEnabled(tenantId, notifKey);
  if (!globallyEnabled) return;

  // 2. Get active push subscriptions
  const senderType = toChatSenderType(userType);
  const subscriptions = await prisma.chatPushSubscription.findMany({
    where: {
      tenantId,
      subscriberType: senderType,
      subscriberId: userId,
      isActive: true,
    },
  });

  if (subscriptions.length === 0) return;

  const icon = '/iconos_azul/icon-192x192.png';

  // 3. Send to each subscription
  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify({
            title,
            body,
            icon,
            badge: icon,
            tag: tag || notifKey,
            data: { url, type: notifKey },
          })
        );
      } catch (error: any) {
        if (error.statusCode === 410 || error.statusCode === 404) {
          await prisma.chatPushSubscription.update({
            where: { id: sub.id },
            data: { isActive: false },
          });
        }
      }
    })
  );
}
```

**Step 2: Verify TypeScript**

Run: `npx tsc --noEmit 2>&1 | grep "push-service"`
Expected: no errors.

**Step 3: Commit and push**

```bash
git add src/lib/pwa/push-service.ts
git commit -m "feat(notifications): enforce global push toggle in sendPushToPortalUser"
git push origin main
```

---

## How to verify the feature works

1. Go to `/opai/configuracion/notificaciones`
2. You should see the new "Notificaciones Push — control global" section with toggle switches grouped by portal
3. Disable e.g. "Ticket creado" (guardia portal)
4. Create a ticket from the guardia portal — the guardia should NOT receive a push notification
5. Re-enable it — the guardia should receive push again

## No DB migration required

This feature stores data in the existing `Setting` table using a JSON blob. No schema changes needed.
