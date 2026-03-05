# PWA Multi-Portal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert OPAI into an installable PWA with 4 independent apps (OPAI, OPAI Clientes, OPAI Guardias, OPAI Rondas), a shared service worker, smart install banners, and native push notifications integrated into the existing notification system.

**Architecture:** Single codebase, single deploy. One shared `sw.js` at scope `/`. Each portal has its own manifest with different `start_url`/`scope`. Push notifications reuse the existing `ChatPushSubscription` model (already supports ADMIN/GUARD/CLIENT sender types). Portal notification preferences stored in a new `PortalNotificationPreference` model in `public` schema.

**Tech Stack:** Next.js 15 App Router, Prisma (PostgreSQL, multi-schema), `web-push` (already installed for chat), Tailwind, Sonner for toasts, Auth.js v5.

---

## Pre-flight: Important Codebase Facts

Before starting, read these — they differ from the spec:

1. **Icons live in `/public/iconos_azul/`** (not `/public/icons/`). Sizes: 48, 72, 96, 128, 144, 192, 512. No per-portal variants exist — all portals share the same icon set. Do NOT rename or move icons.

2. **Rondas already has partial PWA**: `public/portal-rondas-manifest.json` and `public/rondas-sw.js` exist. `src/app/portal/rondas/layout.tsx` references `manifest: "/portal-rondas-manifest.json"`. The `ServiceWorkerRegistrar` component registers `/rondas-sw.js`. We'll migrate to the unified setup.

3. **No supervisores portal**: `src/app/portal/supervisores/` does not exist. Skip all supervisores tasks — this portal is out of scope.

4. **ChatPushSubscription already exists** in `chat` schema at `@@map("push_subscriptions")`. Uses `ChatSenderType` enum: `ADMIN | GUARD | CLIENT`. Reuse this model instead of creating a new one.

5. **UserNotificationPreference** is in `crm` schema, admin-only (unique on `userId_tenantId`). We need a new model for portal users (contacts/guardias).

6. **Middleware**: `/portal/` routes are already public (line 34 in middleware.ts). No change needed.

7. **`web-push` package**: Already installed (used for chat). Check `package.json` to confirm before installing.

8. **VAPID keys**: Check if `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` env vars exist. If not, generate with `npx web-push generate-vapid-keys` and add to `.env.local`.

---

## Phase 1: Manifests and Layouts

### Task 1.1: Create OPAI main manifest

**Files:**
- Create: `public/manifest.json`

**Step 1: Create the file**

```json
{
  "name": "OPAI",
  "short_name": "OPAI",
  "description": "ERP Gard Security",
  "start_url": "/opai/login",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#0a0a0f",
  "background_color": "#0a0a0f",
  "icons": [
    { "src": "/iconos_azul/icon-192x192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/iconos_azul/icon-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

**Step 2: Verify**
Open browser → DevTools → Application → Manifest. Should parse without errors.

---

### Task 1.2: Create portal manifests

**Files:**
- Create: `public/manifest-cliente.json`
- Create: `public/manifest-guardia.json`
- Modify: `public/portal-rondas-manifest.json` (update icon paths + add scope + add purpose)

**Step 1: Create manifest-cliente.json**

```json
{
  "name": "OPAI Clientes",
  "short_name": "OPAI Clientes",
  "description": "Portal de clientes — Gard Security",
  "start_url": "/portal/cliente",
  "scope": "/portal/cliente",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#0a0a0f",
  "background_color": "#0a0a0f",
  "icons": [
    { "src": "/iconos_azul/icon-192x192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/iconos_azul/icon-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

**Step 2: Create manifest-guardia.json**

```json
{
  "name": "OPAI Guardias",
  "short_name": "OPAI Guardias",
  "description": "Portal de guardias — Gard Security",
  "start_url": "/portal/guardia",
  "scope": "/portal/guardia",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#0a0a0f",
  "background_color": "#0a0a0f",
  "icons": [
    { "src": "/iconos_azul/icon-192x192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/iconos_azul/icon-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

**Step 3: Update portal-rondas-manifest.json** (add scope, add purpose to icons, keep existing filename)

```json
{
  "name": "OPAI Rondas",
  "short_name": "OPAI Rondas",
  "description": "Portal de rondas — Gard Security",
  "start_url": "/portal/rondas",
  "scope": "/portal/rondas",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#0a0a0f",
  "background_color": "#0a0a0f",
  "icons": [
    { "src": "/iconos_azul/icon-192x192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/iconos_azul/icon-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

Note: Keep filename as `portal-rondas-manifest.json` — the rondas layout already references it correctly.

**Step 4: Commit**

```bash
git add public/manifest.json public/manifest-cliente.json public/manifest-guardia.json public/portal-rondas-manifest.json
git commit -m "feat(pwa): add web app manifests for all portals"
```

---

### Task 1.3: Link manifests in layouts

**Files:**
- Modify: `src/app/portal/cliente/layout.tsx`
- Modify: `src/app/portal/guardia/page.tsx` (has metadata, no layout.tsx — add layout.tsx)
- Modify: `src/app/layout.tsx` (root layout for OPAI main app)

**Step 1: Update portal/cliente/layout.tsx**

Add `manifest` and `appleWebApp` to the existing metadata export:

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
  title: "OPAI Clientes — Gard Security",
  description: "Portal de clientes de seguridad.",
  manifest: "/manifest-cliente.json",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OPAI Clientes",
  },
  icons: { apple: "/iconos_azul/icon-192x192.png" },
};

export default function PortalClienteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#0a0a0f] text-white">
      {children}
    </div>
  );
}
```

**Step 2: Create src/app/portal/guardia/layout.tsx** (new file — guardia only has page.tsx currently)

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
  title: "OPAI Guardias — Gard Security",
  description: "Portal de guardias de seguridad.",
  manifest: "/manifest-guardia.json",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OPAI Guardias",
  },
  icons: { apple: "/iconos_azul/icon-192x192.png" },
};

export default function PortalGuardiaLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```

**Step 3: Update src/app/layout.tsx**

Find the existing metadata export and add manifest + appleWebApp:

```tsx
export const metadata: Metadata = {
  // ... keep existing fields ...
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OPAI",
  },
  icons: { apple: "/iconos_azul/icon-192x192.png" },
};
```

Note: `src/app/portal/rondas/layout.tsx` already has the manifest link — skip it.

**Step 4: Commit**

```bash
git add src/app/portal/cliente/layout.tsx src/app/portal/guardia/layout.tsx src/app/layout.tsx
git commit -m "feat(pwa): link manifests to portal layouts"
```

---

### Task 1.4: Add service worker headers to next.config.js

**Files:**
- Modify: `next.config.js`

**Step 1: Add headers config**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  turbopack: {
    root: __dirname,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/rondas-sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
```

**Step 2: Commit**

```bash
git add next.config.js
git commit -m "feat(pwa): add service worker cache-control headers"
```

---

### Task 1.5: Add /descargar to middleware public paths

**Files:**
- Modify: `src/middleware.ts`

**Step 1: Add descargar routes to isPublicPath function**

After the `/portal/` line (around line 34), add:

```ts
if (pathname.startsWith('/descargar')) return true; // PWA download landing pages
```

**Step 2: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(pwa): add /descargar routes as public paths"
```

---

## Phase 2: Shared Service Worker

### Task 2.1: Create unified /public/sw.js

**Files:**
- Create: `public/sw.js`

This replaces the portal-specific approach. The rondas-sw.js stays for backward compat but the unified sw.js handles all portals.

**Step 1: Create the file**

```js
const CACHE_NAME = 'opai-v1';

const PRECACHE_URLS = [
  '/portal/cliente',
  '/portal/guardia',
  '/portal/rondas',
  '/opai/login',
];

// INSTALL: pre-cache shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// ACTIVATE: remove old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// FETCH: strategy by resource type
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  // API: network-first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Static assets: cache-first
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/iconos_azul/') ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|woff2?)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }

  // Navigation: network-first
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Default: network with fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// PUSH NOTIFICATIONS
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const {
    title = 'OPAI',
    body = '',
    icon,
    badge,
    tag,
    image,
    data: notifData,
  } = data;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: icon || '/iconos_azul/icon-192x192.png',
      badge: badge || '/iconos_azul/icon-192x192.png',
      image,
      tag,
      renotify: !!tag,
      data: notifData,
      vibrate: [200, 100, 200],
      actions: notifData?.actions || [],
    })
  );
});

// NOTIFICATION CLICK
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  if (event.action) {
    const actionUrl = event.notification.data?.actionUrls?.[event.action];
    if (actionUrl) {
      event.waitUntil(self.clients.openWindow(actionUrl));
      return;
    }
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          const clientPath = new URL(client.url).pathname;
          const targetPath = new URL(targetUrl, self.location.origin).pathname.split('?')[0];
          if (clientPath.startsWith(targetPath)) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});

// SKIP WAITING message
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
```

**Step 2: Commit**

```bash
git add public/sw.js
git commit -m "feat(pwa): add unified service worker for all portals"
```

---

### Task 2.2: Create PWA lib files

**Files:**
- Create: `src/lib/pwa/register-sw.ts`
- Create: `src/lib/pwa/use-service-worker.ts`

**Step 1: Create register-sw.ts**

```ts
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
          window.dispatchEvent(new CustomEvent('sw-updated'));
        }
      });
    });

    return registration;
  } catch (error) {
    console.error('[SW] Registration failed:', error);
    return null;
  }
}
```

**Step 2: Create use-service-worker.ts**

```ts
'use client';
import { useEffect, useState } from 'react';
import { registerServiceWorker } from './register-sw';

export function useServiceWorker() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    registerServiceWorker().then(setRegistration);

    const handleUpdate = () => setUpdateAvailable(true);
    window.addEventListener('sw-updated', handleUpdate);
    return () => window.removeEventListener('sw-updated', handleUpdate);
  }, []);

  const applyUpdate = () => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  };

  return { registration, updateAvailable, applyUpdate };
}
```

**Step 3: Commit**

```bash
git add src/lib/pwa/
git commit -m "feat(pwa): add service worker registration utilities"
```

---

### Task 2.3: Create PWAProvider and integrate into root layout

**Files:**
- Create: `src/components/pwa/PWAProvider.tsx`
- Modify: `src/app/layout.tsx`

**Step 1: Create PWAProvider.tsx**

```tsx
'use client';
import { useServiceWorker } from '@/lib/pwa/use-service-worker';
import { toast } from 'sonner';
import { useEffect } from 'react';

export function PWAProvider({ children }: { children: React.ReactNode }) {
  const { updateAvailable, applyUpdate } = useServiceWorker();

  useEffect(() => {
    if (updateAvailable) {
      toast('Nueva versión disponible', {
        description: 'Toca para actualizar la aplicación',
        action: {
          label: 'Actualizar',
          onClick: applyUpdate,
        },
        duration: Infinity,
      });
    }
  }, [updateAvailable, applyUpdate]);

  return <>{children}</>;
}
```

**Step 2: Wrap children in root layout**

In `src/app/layout.tsx`, import `PWAProvider` and wrap children:

```tsx
import { PWAProvider } from '@/components/pwa/PWAProvider';

// Inside the JSX return:
<PWAProvider>
  {children}
</PWAProvider>
```

**Step 3: Update ServiceWorkerRegistrar for rondas to use unified sw**

Modify `src/components/portal/rondas/ServiceWorkerRegistrar.tsx`:

```tsx
"use client";
import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      // Use unified sw.js — scope '/' covers all portals
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
        console.warn("[SW] Registration failed:", err);
      });
    }
  }, []);

  return null;
}
```

**Step 4: Commit**

```bash
git add src/components/pwa/ src/app/layout.tsx src/components/portal/rondas/ServiceWorkerRegistrar.tsx
git commit -m "feat(pwa): add PWAProvider with update toast, unify service worker"
```

---

## Phase 3: Install Banner

### Task 3.1: Create useInstallPrompt hook

**Files:**
- Create: `src/lib/pwa/use-install-prompt.ts`

**Step 1: Create the file**

```ts
'use client';
import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsInstalled(isStandalone);

    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return outcome === 'accepted';
  };

  return {
    canInstall: !!deferredPrompt && !isInstalled,
    isInstalled,
    isIOS: isIOS && !isInstalled,
    install,
  };
}
```

**Step 2: Commit**

```bash
git add src/lib/pwa/use-install-prompt.ts
git commit -m "feat(pwa): add useInstallPrompt hook"
```

---

### Task 3.2: Create PWAInstallBanner component

**Files:**
- Create: `src/components/pwa/PWAInstallBanner.tsx`

**Step 1: Create the file**

```tsx
'use client';
import { useState, useEffect } from 'react';
import { useInstallPrompt } from '@/lib/pwa/use-install-prompt';
import { X, Download, Share } from 'lucide-react';

interface PWAInstallBannerProps {
  appName: string;
  appDescription?: string;
  iconSrc: string;
  variant?: 'banner' | 'fullscreen' | 'inline';
  dismissKey?: string;
}

export function PWAInstallBanner({
  appName,
  appDescription = 'Instala la app para acceso rápido',
  iconSrc,
  variant = 'banner',
  dismissKey,
}: PWAInstallBannerProps) {
  const { canInstall, isIOS, isInstalled, install } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!dismissKey) return;
    const stored = localStorage.getItem(`pwa-dismiss-${dismissKey}`);
    if (stored) {
      const dismissedAt = new Date(stored);
      const daysSince = (Date.now() - dismissedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) setDismissed(true);
    }
  }, [dismissKey]);

  const handleDismiss = () => {
    setDismissed(true);
    if (dismissKey) {
      localStorage.setItem(`pwa-dismiss-${dismissKey}`, new Date().toISOString());
    }
  };

  if (isInstalled || dismissed) return null;
  if (!canInstall && !isIOS) return null;

  const handleInstall = async () => {
    const accepted = await install();
    if (!accepted) handleDismiss();
  };

  if (variant === 'fullscreen') {
    return (
      <div className="fixed inset-0 z-50 bg-[#0a0a0f] flex flex-col items-center justify-center p-8 text-center">
        <img src={iconSrc} alt={appName} className="w-24 h-24 rounded-2xl mb-6 shadow-lg" />
        <h1 className="text-2xl font-bold text-white mb-2">{appName}</h1>
        <p className="text-zinc-400 mb-8 max-w-xs">{appDescription}</p>

        {canInstall && (
          <button
            onClick={handleInstall}
            className="w-full max-w-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-colors"
          >
            <Download className="w-5 h-5" />
            Descargar App
          </button>
        )}

        {isIOS && (
          <div className="w-full max-w-xs">
            <div className="bg-zinc-800/80 rounded-2xl p-6 text-left space-y-4">
              <p className="text-white font-medium text-center mb-4">Para instalar en iPhone:</p>
              <div className="flex items-center gap-3">
                <div className="bg-zinc-700 rounded-lg p-2 shrink-0">
                  <Share className="w-5 h-5 text-blue-400" />
                </div>
                <p className="text-zinc-300 text-sm">
                  Toca el botón <strong className="text-white">Compartir</strong> en Safari
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-zinc-700 rounded-lg p-2 shrink-0">
                  <Download className="w-5 h-5 text-blue-400" />
                </div>
                <p className="text-zinc-300 text-sm">
                  Selecciona <strong className="text-white">&quot;Agregar a Inicio&quot;</strong>
                </p>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={handleDismiss}
          className="mt-6 text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
        >
          Continuar en el navegador
        </button>
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div className="w-full bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-4 flex items-center gap-4">
        <img src={iconSrc} alt={appName} className="w-12 h-12 rounded-xl shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium truncate">{appName}</p>
          <p className="text-zinc-400 text-xs truncate">{appDescription}</p>
        </div>
        {canInstall && (
          <button
            onClick={handleInstall}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg shrink-0 transition-colors"
          >
            Instalar
          </button>
        )}
        {isIOS && (
          <div className="text-blue-400 text-xs text-right shrink-0">
            <Share className="w-4 h-4 mx-auto mb-1" />
            <span>Agregar a Inicio</span>
          </div>
        )}
      </div>
    );
  }

  // Default: banner (fixed bottom)
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-safe animate-in slide-in-from-bottom duration-300">
      <div className="bg-zinc-900 border border-zinc-700/50 rounded-2xl p-4 flex items-center gap-4 shadow-2xl max-w-lg mx-auto">
        <img src={iconSrc} alt={appName} className="w-12 h-12 rounded-xl shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium truncate">{appName}</p>
          <p className="text-zinc-400 text-xs truncate">{appDescription}</p>
        </div>
        {canInstall && (
          <button
            onClick={handleInstall}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg shrink-0 transition-colors"
          >
            Instalar
          </button>
        )}
        {isIOS && (
          <div className="text-blue-400 text-xs text-right shrink-0">
            <Share className="w-4 h-4 mx-auto mb-1" />
            Compartir → Inicio
          </div>
        )}
        <button onClick={handleDismiss} className="text-zinc-500 hover:text-zinc-300 shrink-0">
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/pwa/PWAInstallBanner.tsx
git commit -m "feat(pwa): add PWAInstallBanner component (banner/inline/fullscreen variants)"
```

---

### Task 3.3: Integrate install banners into portal logins

**Goal:** Find where each portal renders its login UI and add the inline banner.

**Step 1: Find portal client components**

Run:
```bash
# Find the cliente portal client component
grep -r "Portal.*Cliente\|PortalCliente" src/app/portal/cliente/ src/components/portal/ --include="*.tsx" -l
# Find the guardia portal client component
grep -r "GuardPortal\|portal.*guardia" src/components/portal/GuardPortalClient.tsx -n | head -5
# Find rondas login component
ls src/app/portal/rondas/
```

**Step 2: Read and understand each login component before modifying**

Read:
- `src/app/portal/cliente/page.tsx` or `src/components/crm/PortalClienteClient.tsx` (check which renders login)
- `src/components/portal/GuardPortalClient.tsx` — look for login screen
- `src/app/portal/rondas/page.tsx` or rondas login

**Step 3: Add PWAInstallBanner inline to each login screen**

The banner should appear between the logo and the login form. Example pattern:

```tsx
import { PWAInstallBanner } from '@/components/pwa/PWAInstallBanner';

// In the login JSX, before the form:
<PWAInstallBanner
  appName="OPAI Clientes"
  appDescription="Tu portal de seguridad siempre disponible"
  iconSrc="/iconos_azul/icon-192x192.png"
  variant="inline"
  dismissKey="cliente"
/>
```

For guardia:
```tsx
<PWAInstallBanner
  appName="OPAI Guardias"
  appDescription="Turnos, chat y más desde tu celular"
  iconSrc="/iconos_azul/icon-192x192.png"
  variant="inline"
  dismissKey="guardia"
/>
```

For rondas:
```tsx
<PWAInstallBanner
  appName="OPAI Rondas"
  appDescription="Rondas y marcaciones sin complicaciones"
  iconSrc="/iconos_azul/icon-192x192.png"
  variant="inline"
  dismissKey="rondas"
/>
```

**Step 4: Verify it renders without breaking existing layout**

Run dev server and visit each portal login. Banner should appear only on mobile/when installable.

**Step 5: Commit**

```bash
git add src/
git commit -m "feat(pwa): add install banners to portal login screens"
```

---

## Phase 4: Download Landing Pages

### Task 4.1: Create /descargar route structure

**Files:**
- Create: `src/components/pwa/DescargarPageClient.tsx`
- Create: `src/app/descargar/layout.tsx`
- Create: `src/app/descargar/page.tsx`
- Create: `src/app/descargar/cliente/page.tsx`
- Create: `src/app/descargar/guardia/page.tsx`
- Create: `src/app/descargar/rondas/page.tsx`

**Step 1: Create DescargarPageClient.tsx**

```tsx
'use client';
import { useEffect } from 'react';
import { useInstallPrompt } from '@/lib/pwa/use-install-prompt';
import { PWAInstallBanner } from './PWAInstallBanner';

interface Props {
  appName: string;
  appDescription: string;
  iconSrc: string;
  redirectTo: string;
}

export function DescargarPageClient({ appName, appDescription, iconSrc, redirectTo }: Props) {
  const { isInstalled } = useInstallPrompt();

  useEffect(() => {
    if (isInstalled) {
      window.location.href = redirectTo;
    }
  }, [isInstalled, redirectTo]);

  return (
    <PWAInstallBanner
      appName={appName}
      appDescription={appDescription}
      iconSrc={iconSrc}
      variant="fullscreen"
    />
  );
}
```

**Step 2: Create descargar/layout.tsx**

```tsx
export default function DescargarLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-[#0a0a0f]">{children}</body>
    </html>
  );
}
```

**Step 3: Create descargar/page.tsx** (OPAI main)

```tsx
import type { Metadata } from 'next';
import { DescargarPageClient } from '@/components/pwa/DescargarPageClient';

export const metadata: Metadata = {
  title: 'Descargar OPAI',
  description: 'Descarga la app de OPAI — Gard Security',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'OPAI' },
  icons: { apple: '/iconos_azul/icon-192x192.png' },
};

export default function Page() {
  return (
    <DescargarPageClient
      appName="OPAI"
      appDescription="Gestiona tu operación de seguridad desde cualquier lugar"
      iconSrc="/iconos_azul/icon-192x192.png"
      redirectTo="/opai/login"
    />
  );
}
```

**Step 4: Create descargar/cliente/page.tsx**

```tsx
import type { Metadata } from 'next';
import { DescargarPageClient } from '@/components/pwa/DescargarPageClient';

export const metadata: Metadata = {
  title: 'Descargar OPAI Clientes',
  description: 'Portal de clientes — Gard Security',
  manifest: '/manifest-cliente.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'OPAI Clientes' },
  icons: { apple: '/iconos_azul/icon-192x192.png' },
};

export default function Page() {
  return (
    <DescargarPageClient
      appName="OPAI Clientes"
      appDescription="Tu portal de seguridad siempre disponible"
      iconSrc="/iconos_azul/icon-192x192.png"
      redirectTo="/portal/cliente"
    />
  );
}
```

**Step 5: Create descargar/guardia/page.tsx**

```tsx
import type { Metadata } from 'next';
import { DescargarPageClient } from '@/components/pwa/DescargarPageClient';

export const metadata: Metadata = {
  title: 'Descargar OPAI Guardias',
  description: 'Portal de guardias — Gard Security',
  manifest: '/manifest-guardia.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'OPAI Guardias' },
  icons: { apple: '/iconos_azul/icon-192x192.png' },
};

export default function Page() {
  return (
    <DescargarPageClient
      appName="OPAI Guardias"
      appDescription="Turnos, chat y más desde tu celular"
      iconSrc="/iconos_azul/icon-192x192.png"
      redirectTo="/portal/guardia"
    />
  );
}
```

**Step 6: Create descargar/rondas/page.tsx**

```tsx
import type { Metadata } from 'next';
import { DescargarPageClient } from '@/components/pwa/DescargarPageClient';

export const metadata: Metadata = {
  title: 'Descargar OPAI Rondas',
  description: 'Portal de rondas — Gard Security',
  manifest: '/portal-rondas-manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'OPAI Rondas' },
  icons: { apple: '/iconos_azul/icon-192x192.png' },
};

export default function Page() {
  return (
    <DescargarPageClient
      appName="OPAI Rondas"
      appDescription="Rondas y marcaciones sin complicaciones"
      iconSrc="/iconos_azul/icon-192x192.png"
      redirectTo="/portal/rondas"
    />
  );
}
```

**Step 7: Commit**

```bash
git add src/app/descargar/ src/components/pwa/DescargarPageClient.tsx
git commit -m "feat(pwa): add /descargar landing pages for each portal"
```

---

## Phase 5: Push Notifications

### Task 5.1: Setup VAPID keys

**Step 1: Check if VAPID keys exist**

```bash
grep -E "VAPID" .env.local .env 2>/dev/null
```

**Step 2: If not found, generate and add to .env.local**

```bash
npx web-push generate-vapid-keys
```

Add to `.env.local`:
```
VAPID_PUBLIC_KEY=<output_public_key>
VAPID_PRIVATE_KEY=<output_private_key>
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<same_public_key>
```

**Step 3: Confirm web-push is installed**

```bash
grep '"web-push"' package.json
```

If not installed: `npm install web-push` and `npm install --save-dev @types/web-push`

**Step 4: Commit nothing** (env vars are not committed)

---

### Task 5.2: Add PortalNotificationPreference model to Prisma schema

**Files:**
- Modify: `prisma/schema.prisma`

**Context:** `UserNotificationPreference` is in `crm` schema and admin-only (unique on userId+tenantId). For portal users (contacts/guardias), we need a separate model in the `public` schema.

**Step 1: Add model to schema**

Find a good location in the schema (near other `@@schema("public")` models) and add:

```prisma
model PortalNotificationPreference {
  id          String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId    String   @map("tenant_id")
  userType    String   @map("user_type")  // 'contact' | 'guardia'
  userId      String   @map("user_id")    // contactId or guardiaId
  portalType  String   @map("portal_type") // 'cliente' | 'guardia' | 'rondas'
  preferences Json     @default("{}") @db.JsonB
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@unique([userType, userId, portalType], map: "uq_portal_notif_prefs")
  @@index([tenantId], map: "idx_portal_notif_prefs_tenant")
  @@map("portal_notification_preferences")
  @@schema("public")
}
```

**Step 2: Create migration**

```bash
npx prisma migrate dev --name add_portal_notification_preferences
```

**Step 3: Generate Prisma client**

```bash
npx prisma generate
```

**Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(pwa): add PortalNotificationPreference model for portal push prefs"
```

---

### Task 5.3: Create portal notification types

**Files:**
- Create: `src/lib/pwa/portal-notification-types.ts`

**Step 1: Create the file**

```ts
export interface PortalNotifTypeDef {
  key: string;
  label: string;
  description: string;
  portals: Array<'cliente' | 'guardia' | 'rondas' | 'app'>;
  defaultPush: boolean;
  defaultEmail: boolean;
}

export const PORTAL_NOTIFICATION_TYPES: PortalNotifTypeDef[] = [
  // === SHARED ===
  {
    key: 'chat_message',
    label: 'Mensajes de chat',
    description: 'Cuando recibes un nuevo mensaje',
    portals: ['cliente', 'guardia', 'rondas', 'app'],
    defaultPush: true,
    defaultEmail: false,
  },

  // === PORTAL CLIENTE ===
  {
    key: 'ticket_created',
    label: 'Ticket creado',
    description: 'Cuando se crea un ticket en tu instalación',
    portals: ['cliente'],
    defaultPush: true,
    defaultEmail: true,
  },
  {
    key: 'ticket_updated',
    label: 'Ticket actualizado',
    description: 'Cuando un ticket cambia de estado',
    portals: ['cliente'],
    defaultPush: true,
    defaultEmail: false,
  },
  {
    key: 'ronda_completed',
    label: 'Ronda completada',
    description: 'Cuando una ronda de vigilancia se completa',
    portals: ['cliente'],
    defaultPush: true,
    defaultEmail: false,
  },
  {
    key: 'ronda_alert',
    label: 'Alerta de ronda',
    description: 'Cuando hay un problema en una ronda',
    portals: ['cliente'],
    defaultPush: true,
    defaultEmail: true,
  },

  // === PORTAL GUARDIA ===
  {
    key: 'shift_reminder',
    label: 'Recordatorio de turno',
    description: 'Recordatorio antes de tu turno',
    portals: ['guardia'],
    defaultPush: true,
    defaultEmail: false,
  },
  {
    key: 'schedule_change',
    label: 'Cambio de horario',
    description: 'Cuando tu horario o asignación cambia',
    portals: ['guardia'],
    defaultPush: true,
    defaultEmail: true,
  },

  // === PORTAL RONDAS ===
  {
    key: 'ronda_assigned',
    label: 'Ronda asignada',
    description: 'Cuando te toca una nueva ronda',
    portals: ['rondas'],
    defaultPush: true,
    defaultEmail: false,
  },
  {
    key: 'ronda_overdue',
    label: 'Ronda atrasada',
    description: 'Cuando una ronda no se ha iniciado a tiempo',
    portals: ['rondas'],
    defaultPush: true,
    defaultEmail: true,
  },
];

export const PORTAL_NOTIFICATION_TYPE_MAP = new Map(
  PORTAL_NOTIFICATION_TYPES.map((t) => [t.key, t])
);
```

**Step 2: Commit**

```bash
git add src/lib/pwa/portal-notification-types.ts
git commit -m "feat(pwa): define portal notification types"
```

---

### Task 5.4: Create push service

**Files:**
- Create: `src/lib/pwa/push-service.ts`

**Context:** Reuses existing `ChatPushSubscription` model. Maps userType to `ChatSenderType`: contact → CLIENT, guardia → GUARD, admin → ADMIN.

**Step 1: Create the file**

```ts
import webPush from 'web-push';
import { prisma } from '@/lib/prisma';
import type { PortalNotifTypeDef } from './portal-notification-types';

webPush.setVapidDetails(
  'mailto:soporte@gardsecurity.cl',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

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
  // 1. Check preferences (only for portal users — admin uses UserNotificationPreference)
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

**Step 2: Commit**

```bash
git add src/lib/pwa/push-service.ts
git commit -m "feat(pwa): add portal push notification service (reuses ChatPushSubscription)"
```

---

### Task 5.5: Create API routes for subscribe and preferences

**Files:**
- Create: `src/app/api/notifications/push/subscribe/route.ts`
- Create: `src/app/api/notifications/push/preferences/route.ts`

**Step 1: Create subscribe route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const { subscription, portalType, userType, userId, tenantId } = await req.json();

    if (!subscription?.endpoint || !userType || !userId || !tenantId || !portalType) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const senderTypeMap: Record<string, string> = {
      contact: 'CLIENT',
      guardia: 'GUARD',
      admin: 'ADMIN',
    };
    const subscriberType = senderTypeMap[userType];
    if (!subscriberType) {
      return NextResponse.json({ error: 'Invalid userType' }, { status: 400 });
    }

    await prisma.chatPushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        isActive: true,
      },
      create: {
        tenantId,
        subscriberType: subscriberType as any,
        subscriberId: userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent: req.headers.get('user-agent') || undefined,
      },
    });

    // Create default preferences if they don't exist
    if (userType !== 'admin') {
      const existing = await prisma.portalNotificationPreference.findUnique({
        where: { userType_userId_portalType: { userType, userId, portalType } },
      });

      if (!existing) {
        const { PORTAL_NOTIFICATION_TYPES } = await import('@/lib/pwa/portal-notification-types');
        const defaults: Record<string, any> = {};
        for (const t of PORTAL_NOTIFICATION_TYPES) {
          if (t.portals.includes(portalType as any)) {
            defaults[t.key] = { push: t.defaultPush, email: t.defaultEmail };
          }
        }
        await prisma.portalNotificationPreference.create({
          data: { tenantId, userType, userId, portalType, preferences: defaults },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[push/subscribe] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { endpoint } = await req.json();
    if (!endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });

    await prisma.chatPushSubscription.update({
      where: { endpoint },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[push/subscribe] DELETE error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
```

**Step 2: Create preferences route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const userType = req.nextUrl.searchParams.get('userType');
  const userId = req.nextUrl.searchParams.get('userId');
  const portalType = req.nextUrl.searchParams.get('portalType');

  if (!userType || !userId || !portalType) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  }

  const prefs = await prisma.portalNotificationPreference.findUnique({
    where: { userType_userId_portalType: { userType, userId, portalType } },
  });

  return NextResponse.json({ preferences: prefs?.preferences || {} });
}

export async function PUT(req: NextRequest) {
  const { userType, userId, tenantId, portalType, preferences } = await req.json();

  if (!userType || !userId || !portalType || !preferences) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  await prisma.portalNotificationPreference.upsert({
    where: { userType_userId_portalType: { userType, userId, portalType } },
    update: { preferences },
    create: { tenantId, userType, userId, portalType, preferences },
  });

  return NextResponse.json({ success: true });
}
```

**Step 3: Commit**

```bash
git add src/app/api/notifications/push/
git commit -m "feat(pwa): add push subscribe and notification preferences API routes"
```

---

### Task 5.6: Create push client utility

**Files:**
- Create: `src/lib/pwa/push-client.ts`

**Step 1: Create the file**

```ts
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export async function subscribeToPush(params: {
  registration: ServiceWorkerRegistration;
  portalType: 'app' | 'cliente' | 'guardia' | 'rondas';
  userType: 'admin' | 'contact' | 'guardia';
  userId: string;
  tenantId: string;
}): Promise<boolean> {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) {
    console.error('[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY not set');
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const subscription = await params.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });

    const res = await fetch('/api/notifications/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        portalType: params.portalType,
        userType: params.userType,
        userId: params.userId,
        tenantId: params.tenantId,
      }),
    });

    return res.ok;
  } catch (error) {
    console.error('[push] Subscription failed:', error);
    return false;
  }
}

export async function unsubscribeFromPush(
  registration: ServiceWorkerRegistration
): Promise<boolean> {
  try {
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return true;

    await fetch('/api/notifications/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });

    await subscription.unsubscribe();
    return true;
  } catch (error) {
    console.error('[push] Unsubscribe failed:', error);
    return false;
  }
}
```

**Step 2: Commit**

```bash
git add src/lib/pwa/push-client.ts
git commit -m "feat(pwa): add push subscription client utility"
```

---

### Task 5.7: Create PushPermissionPrompt component

**Files:**
- Create: `src/components/pwa/PushPermissionPrompt.tsx`

**Step 1: Create the file**

```tsx
'use client';
import { useState } from 'react';
import { useServiceWorker } from '@/lib/pwa/use-service-worker';
import { subscribeToPush } from '@/lib/pwa/push-client';
import { Bell, X } from 'lucide-react';

interface Props {
  portalType: 'app' | 'cliente' | 'guardia' | 'rondas';
  userType: 'admin' | 'contact' | 'guardia';
  userId: string;
  tenantId: string;
}

export function PushPermissionPrompt({ portalType, userType, userId, tenantId }: Props) {
  const { registration } = useServiceWorker();
  const [dismissed, setDismissed] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  if (subscribed || dismissed || !registration) return null;
  if (typeof Notification === 'undefined') return null;
  if (Notification.permission === 'granted' || Notification.permission === 'denied') return null;

  const handleEnable = async () => {
    const success = await subscribeToPush({ registration, portalType, userType, userId, tenantId });
    if (success) {
      setSubscribed(true);
    } else {
      setDismissed(true);
    }
  };

  return (
    <div className="bg-blue-600/10 border border-blue-500/20 rounded-xl p-4 flex items-center gap-4">
      <div className="bg-blue-600/20 rounded-lg p-2 shrink-0">
        <Bell className="w-5 h-5 text-blue-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium">Activar notificaciones</p>
        <p className="text-zinc-400 text-xs">Recibe alertas importantes en tu celular</p>
      </div>
      <button
        onClick={handleEnable}
        className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg shrink-0 transition-colors"
      >
        Activar
      </button>
      <button onClick={() => setDismissed(true)} className="text-zinc-500 hover:text-zinc-300 shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/pwa/PushPermissionPrompt.tsx
git commit -m "feat(pwa): add PushPermissionPrompt component"
```

---

### Task 5.8: Create NotificationSettings component

**Files:**
- Create: `src/components/pwa/NotificationSettings.tsx`

**Step 1: Create the file**

```tsx
'use client';
import { useState, useEffect } from 'react';
import { PORTAL_NOTIFICATION_TYPES } from '@/lib/pwa/portal-notification-types';
import { Smartphone, Mail } from 'lucide-react';

interface Props {
  userType: 'contact' | 'guardia';
  userId: string;
  tenantId: string;
  portalType: 'cliente' | 'guardia' | 'rondas';
}

interface Pref {
  push: boolean;
  email: boolean;
}

export function NotificationSettings({ userType, userId, tenantId, portalType }: Props) {
  const [preferences, setPreferences] = useState<Record<string, Pref>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const relevantTypes = PORTAL_NOTIFICATION_TYPES.filter((t) =>
    t.portals.includes(portalType as any)
  );

  useEffect(() => {
    fetch(`/api/notifications/push/preferences?userType=${userType}&userId=${userId}&portalType=${portalType}`)
      .then((r) => r.json())
      .then((data) => {
        setPreferences(data.preferences || {});
        setLoading(false);
      });
  }, [userType, userId, portalType]);

  const updatePref = async (type: string, field: keyof Pref, value: boolean) => {
    const updated = {
      ...preferences,
      [type]: { ...preferences[type], [field]: value },
    };
    setPreferences(updated);

    setSaving(true);
    await fetch('/api/notifications/push/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userType, userId, tenantId, portalType, preferences: updated }),
    });
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-zinc-800/50 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold">Notificaciones</h3>
        {saving && <span className="text-xs text-zinc-500">Guardando...</span>}
      </div>

      {relevantTypes.map((config) => {
        const pref = preferences[config.key] || {
          push: config.defaultPush,
          email: config.defaultEmail,
        };

        return (
          <div key={config.key} className="bg-zinc-800/40 border border-zinc-700/30 rounded-xl p-4">
            <p className="text-white text-sm font-medium">{config.label}</p>
            <p className="text-zinc-400 text-xs mt-0.5 mb-3">{config.description}</p>
            <div className="flex items-center gap-4">
              <button
                onClick={() => updatePref(config.key, 'push', !pref.push)}
                className={`flex items-center gap-1.5 text-xs transition-colors ${
                  pref.push ? 'text-blue-400' : 'text-zinc-500'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                Push
              </button>
              <button
                onClick={() => updatePref(config.key, 'email', !pref.email)}
                className={`flex items-center gap-1.5 text-xs transition-colors ${
                  pref.email ? 'text-blue-400' : 'text-zinc-500'
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                Email
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/pwa/NotificationSettings.tsx
git commit -m "feat(pwa): add NotificationSettings component for portal users"
```

---

### Task 5.9: Integrate PushPermissionPrompt into portals (post-login)

**Goal:** After a portal user logs in, show the PushPermissionPrompt in their dashboard.

**Step 1: Find where each portal renders the authenticated dashboard**

```bash
# Check the portal cliente client component for session/user data
grep -n "contactId\|tenantId\|session" src/app/portal/cliente/PortalClienteClient.tsx 2>/dev/null | head -10
# Check guardia portal
grep -rn "guardiaId\|tenantId" src/components/portal/GuardPortalClient.tsx | head -10
```

**Step 2: Read the components to understand props/session structure before modifying**

Read `src/app/portal/cliente/PortalClienteClient.tsx` (or equivalent) to understand the user data shape.

**Step 3: Add PushPermissionPrompt to portal cliente dashboard**

Find the main authenticated view and add near the top of the content area:

```tsx
import { PushPermissionPrompt } from '@/components/pwa/PushPermissionPrompt';

// After login check, in the authenticated view:
<PushPermissionPrompt
  portalType="cliente"
  userType="contact"
  userId={contact.id}
  tenantId={tenantId}
/>
```

**Step 4: Repeat for guardia portal**

```tsx
<PushPermissionPrompt
  portalType="guardia"
  userType="guardia"
  userId={guardia.id}
  tenantId={tenantId}
/>
```

**Step 5: Commit**

```bash
git add src/
git commit -m "feat(pwa): integrate push permission prompt into portal dashboards"
```

---

### Task 5.10: Add push channel to chat notification-service

**Files:**
- Modify: `src/lib/notification-service.ts`

**Context:** The existing notification service handles admin bell + email. Chat push is separate (handled by the chat module). For portal push (contacts/guardias), we integrate `sendPushToPortalUser` into any existing portal notification dispatchers.

**Step 1: Identify where portal notifications are sent**

```bash
grep -rn "sendNotification\|notif" src/app/api/portal/ --include="*.ts" -l 2>/dev/null
grep -rn "sendNotification" src/lib/ --include="*.ts" -l | grep -v notification-service
```

**Step 2: For any API route that notifies contacts or guardias, add push call**

Example: if a ticket status change notifies a contact, find that route and add:

```ts
import { sendPushToPortalUser } from '@/lib/pwa/push-service';

// After creating the in-app notification:
await sendPushToPortalUser({
  tenantId,
  notifKey: 'ticket_updated',
  userType: 'contact',
  userId: contact.id,
  portalType: 'cliente',
  title: 'Ticket actualizado',
  body: `Tu ticket #${ticketId} cambió a ${newStatus}`,
  url: `/portal/cliente/tickets/${ticketId}`,
});
```

**Step 3: Commit**

```bash
git add src/
git commit -m "feat(pwa): integrate push channel into portal notification dispatchers"
```

---

## Final Verification Checklist

Run through all of these before calling the implementation complete:

```bash
# 1. Build passes
npm run build

# 2. All manifests are valid JSON
node -e "require('./public/manifest.json'); console.log('OK')"
node -e "require('./public/manifest-cliente.json'); console.log('OK')"
node -e "require('./public/manifest-guardia.json'); console.log('OK')"
node -e "require('./public/portal-rondas-manifest.json'); console.log('OK')"

# 3. sw.js exists and is accessible
curl -I http://localhost:3000/sw.js 2>/dev/null | grep -E "Cache-Control|Service-Worker"

# 4. /descargar routes return 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/descargar/cliente

# 5. Prisma migration applied
npx prisma db pull --schema=prisma/schema.prisma 2>/dev/null | grep portal_notification
```

**Browser tests (manual, on mobile or with Chrome DevTools → mobile emulation):**
- [ ] Open `/portal/cliente` → manifest loads in Application tab
- [ ] Open `/portal/guardia` → manifest loads
- [ ] Open `/portal/rondas` → existing manifest still loads
- [ ] Open `/descargar/cliente` → fullscreen install UI appears
- [ ] Chrome DevTools → Application → Service Workers → sw.js registered
- [ ] Lighthouse PWA score ≥ 90

---

## Notes and Caveats

1. **Portal Supervisores skipped**: `src/app/portal/supervisores/` does not exist. All supervisores tasks from the original spec are out of scope.

2. **Shared icons**: All portals use the same icon set from `/iconos_azul/`. Per-portal icon variants are not implemented.

3. **Admin push**: OPAI admin users' push preferences should use `UserNotificationPreference` (existing). The push subscription (ChatPushSubscription) is already used for chat — extend `sendNotification()` in notification-service.ts separately if needed for admin push.

4. **VAPID keys**: Must be generated and added to `.env.local` before push notifications work. The app won't crash without them (push calls are fire-and-forget), but no pushes will be delivered.

5. **rondas-sw.js**: The existing rondas service worker (`public/rondas-sw.js`) is kept for backward compat with any already-installed PWAs. New installations will use `sw.js`. Eventually `rondas-sw.js` can be removed.
