# OPAI Welcome Screen + Capacitor Setup — Design Document

**Date:** 2026-03-08
**Status:** Approved

---

## Overview

Create a welcome screen at `/welcome` as the single entry point for all OPAI portals, a branding configuration system for multi-tenant customization, and Capacitor setup for native mobile apps (Android + iOS).

**Key constraint:** All existing portal routes (`/portal/guardia`, `/portal/rondas`, `/portal/cliente`, `/portal/supervisor`, `/portal/acceso`) and the ERP login (`/opai/login`) remain untouched. The welcome screen is a visual router that redirects to existing routes.

---

## Part 1: Branding System

### Storage — Settings KV (existing pattern)

New keys added to the empresa config Settings store:

| Setting Key | Purpose | Default |
|---|---|---|
| `empresa.branding.logoFull` | Logo horizontal completo | `""` (falls back to `empresa.logoUrl`) |
| `empresa.branding.logoIcon` | Ícono/isotipo | `""` |
| `empresa.branding.logoWhite` | Logo para fondos oscuros | `""` |
| `empresa.branding.logoDark` | Logo para fondos claros | `""` |
| `empresa.branding.favicon` | Favicon URL | `""` |
| `empresa.branding.primaryColor` | Color principal | `#0a1628` |
| `empresa.branding.secondaryColor` | Color secundario | `#0d9488` |
| `empresa.branding.accentColor` | Color accent | `#2dd4bf` |
| `empresa.branding.appName` | Nombre de la app | `OPAI` |
| `empresa.branding.tagline` | Subtítulo | `Plataforma de Operaciones` |

### Image Upload

Images uploaded via R2 (existing Cloudflare R2 infrastructure) with prefix `branding/`. Each logo field (logoFull, logoIcon, logoWhite, logoDark, favicon) has its own dropzone upload with preview. Not text URL inputs — real file upload.

Flow: User drops PNG/JPG/SVG → uploads to R2 (`branding/2026/03/uuid.png`) → stores resulting public URL in Setting.

### UI in Configuración Empresa

New 6th tab "Imagen Corporativa" in `EmpresaConfigTabs.tsx`:
- Upload fields with drag-drop and preview for each logo variant
- Color pickers with hex input for primaryColor, secondaryColor, accentColor
- Text inputs for appName and tagline
- Live preview card showing how branding looks applied

### useBranding() Hook

Client hook that fetches from `/api/branding` (public endpoint, no auth required). Returns typed branding object with Gard defaults as fallback. Caches in memory.

```typescript
const { branding, loading } = useBranding();
// branding.logoFull, branding.primaryColor, branding.appName, etc.
```

### Files

**Modified:**
- `src/lib/tenant-config.ts` — Add branding fields to interface, DEFAULTS, KEY_MAP
- `src/components/configuracion/EmpresaConfigTabs.tsx` — Add 6th "Imagen Corporativa" tab
- `src/app/api/configuracion/empresa/route.ts` — Add branding keys to EMPRESA_KEYS whitelist

**New:**
- `src/app/api/configuracion/branding/upload/route.ts` — Image upload to R2 with prefix `branding`
- `src/app/api/branding/route.ts` — Public GET endpoint returning branding config
- `src/lib/branding/useBranding.ts` — Client hook

---

## Part 2: Welcome Screen

### Route

`/welcome` — public page, no auth required. Outside `(app)` layout.

### Design

Dark theme (`bg-[#0a1628]`). Logo from branding config. Title: "Bienvenido a {appName}". Subtitle: "Selecciona tu perfil para continuar".

4 portal cards in 2x2 grid (desktop) / vertical stack (mobile):

| # | Card | Icon | Accent | Redirects to |
|---|------|------|--------|-------------|
| 1 | Guardia | Shield | `#2dd4bf` | Expands in-place (Option A) |
| 2 | Supervisor | UserCog | `#a78bfa` | `/portal/supervisor` |
| 3 | Cliente | Users | `#38bdf8` | `/portal/cliente` |
| 4 | OPAI | Zap | `#f472b6` | `/opai/login` |

**Guard sub-options (Option A — expand in-place):**

| Sub-option | Subtitle | Redirects to |
|------------|----------|-------------|
| Portal Guardia | Novedades, asistencia y documentos | `/portal/guardia` |
| Portal Rondas | Registro de rondas y checkpoints | `/portal/rondas` |

### Behavior

- Staggered entry animations (each card appears with delay)
- Hover: card elevates with accent-colored shadow
- Guard expand: smooth height animation with CSS transitions
- localStorage (`opai-last-portal`): remembers last portal, shows chip "Último acceso: X → Ir directo"
- Footer: app version

### Files

**New:**
- `src/app/welcome/page.tsx` — Server component wrapper
- `src/components/welcome/WelcomeScreen.tsx` — Client component with all UI
- `src/components/welcome/PortalCard.tsx` — Reusable card with expand support

---

## Part 3: Middleware Changes

Minimal changes to `src/middleware.ts`:

1. Add `/welcome` and `/api/branding` to `isPublicPath()`
2. Change `/` redirect without session: `/opai/login` → `/welcome`
3. Add redirect: `/welcome` with active NextAuth session → `/hub`

No other middleware rules are modified.

---

## Part 4: Capacitor Setup

### Strategy

Capacitor points to `https://opai.gard.cl` in production — WebView loading the live web app. No static build. Updates to web = updates to app automatically.

### Dependencies

Core: `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/ios`
Plugins: `@capacitor/push-notifications`, `@capacitor/geolocation`, `@capacitor/camera`, `@capacitor/haptics`, `@capacitor/status-bar`, `@capacitor/splash-screen`, `@capacitor/preferences`, `@capacitor/badge`, `capacitor-native-biometric`

### Files

**New:**
- `capacitor.config.ts` — appId `cl.gard.opai`, server URL `https://opai.gard.cl`
- `src/lib/capacitor/usePlatform.ts` — Platform detection hook
- `src/lib/capacitor/usePushNotifications.ts` — Push registration and listeners
- `src/lib/capacitor/useGeolocation.ts` — Current position, watch position
- `src/lib/capacitor/useBiometricAuth.ts` — Biometric availability and auth
- `src/lib/capacitor/useCamera.ts` — Take photo, pick from gallery

All native hooks are no-ops on web (check `Capacitor.isNativePlatform()` first).

### .gitignore

Add `android/`, `ios/` (regenerated with `npx cap add`).

---

## Part 5: Store Preparation

- Android: `npx cap add android`, configure signing in `build.gradle`, app icon 512x512, feature graphic 1024x500
- iOS: `npx cap add ios`, requires Apple Developer account + Mac + Xcode
- Both: Privacy policy URL required, HTTPS already configured

---

## Implementation Order

1. Branding system (storage + API + upload + hook + UI tab)
2. Welcome screen (`/welcome` page + components)
3. Middleware changes (whitelist + redirects)
4. Capacitor setup (install + config + native hooks)
5. Store preparation (Android/iOS project generation)
