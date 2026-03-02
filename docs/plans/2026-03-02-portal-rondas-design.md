# Portal de Rondas — Design Doc

**Fecha:** 2026-03-02
**Estado:** Aprobado

## Resumen

Portal independiente en `/portal/rondas` para que los guardias ejecuten rondas de supervisión desde el celular (browser). PWA con soporte offline básico, autenticación por RUT+PIN, verificación de checkpoints por QR (primario) + GPS (secundario), captura de fotos a Cloudflare R2.

## Decisiones Clave

- **Approach:** Monolito Next.js (misma app, ruta pública)
- **Auth:** RUT+PIN contra `OpsGuardia.marcacionPin`, sin NextAuth
- **Verificación:** QR como prueba primaria de presencia física, GPS como evidencia secundaria
- **QR configurable:** Campo `qrRequerido` en `OpsRondaTemplate` — permite rondas solo-GPS para pruebas
- **Offline:** Básico — cache de ronda activa en IndexedDB, sync al volver conexión
- **Fotos:** Upload a Cloudflare R2 (ya configurado)
- **UI:** Dark optimizado para terreno — botones grandes, tipografía grande, una mano con guantes

## Arquitectura de Rutas

### Páginas

```
src/app/portal/rondas/
  layout.tsx          — viewport meta, PWA manifest link, theme-color
  page.tsx            — wrapper que renderiza RondasPortalClient
```

### Componentes

```
src/components/portal/rondas/
  RondasPortalClient.tsx   — componente raíz (login + app)
  LoginScreen.tsx          — RUT + PIN, selector de instalación
  RondaActiva.tsx          — vista de ronda en curso
  CheckpointMarker.tsx     — marcar checkpoint (QR + GPS + foto)
  RondaProgress.tsx        — progreso visual de la ronda
  QrScanner.tsx            — cámara para escaneo QR
  PhotoCapture.tsx         — captura de foto evidencia
```

### APIs

```
src/app/api/portal/rondas/
  auth/route.ts            — POST login RUT+PIN
  mis-rondas/route.ts      — GET rondas del turno actual
  marcar/route.ts          — POST marcar checkpoint
  completar/route.ts       — POST completar ronda
  sync/route.ts            — POST sincronizar marcaciones offline
```

## Flujo de Auth

1. Guardia abre `/portal/rondas`
2. Ingresa RUT + PIN (4-6 dígitos)
3. API valida con bcrypt contra `OpsGuardia.marcacionPin`
4. Retorna sesión: `{ guardiaId, tenantId, installationId, nombre, installationName }`
5. Se guarda en `sessionStorage` (key: `rondas_portal_session`)
6. Instalación se asigna desde `currentInstallationId`, con selector si cubre múltiples

## Flujo de Ronda

### Pantallas

```
[Login] → [Mis Rondas] → [Ronda Activa] → [Marcar Checkpoint] → [Ronda Completada]
```

**Mis Rondas:** Lista de rondas programadas para el turno actual. Tarjetas con nombre, hora, cantidad de checkpoints, estado. Botón grande "Iniciar Ronda".

**Ronda Activa:** Barra de progreso (3/8 checkpoints). Lista de checkpoints ordenados con estado (completado/activo/pendiente). Checkpoint activo destacado.

**Marcar Checkpoint:**
- Si `qrRequerido = true` → abre cámara QR automáticamente
- Si `qrRequerido = false` → según `checkpoint.verificationType` (GEOFENCE/QR/BOTH)
- GPS se captura siempre si está disponible
- Sección opcional: foto + nota
- Botón grande "Confirmar Marcación"

**Ronda Completada:** Resumen con checkpoints completados, duración, trust score visual.

### Lógica de Verificación

```
Template.qrRequerido = true  → QR obligatorio siempre, GPS como bonus
Template.qrRequerido = false → según checkpoint.verificationType:
  GEOFENCE → solo GPS (distancia < geoRadiusM)
  QR       → solo QR scan
  BOTH     → QR + GPS ambos
```

### Anti-fraude (captura automática por marcación)

- `lat`, `lng` — Geolocation API
- `batteryLevel` — Battery API
- `motionData` — DeviceMotion API (acelerómetro)
- `speedFromPrevKmh` — calculado vs checkpoint anterior
- `timeFromPrevSec` — tiempo desde marcación anterior
- `hashIntegridad` — SHA-256(checkpointId + timestamp + lat + lng + guardiaId)
- GPS desactivado → marcación se registra con trust score reducido + alerta GPS_DISABLED

## Cambio al Schema

Un solo campo nuevo en `OpsRondaTemplate`:

```prisma
qrRequerido  Boolean  @default(false)
```

No se agregan tablas nuevas. Todo se registra en modelos existentes:
- `OpsRondaEjecucion` — ejecución de la ronda
- `OpsMarcacionCheckpoint` — marcación de cada checkpoint
- `OpsAlertaRonda` — alertas generadas
- `OpsPatrullajeSesion` — sesión del guardia

## Offline y PWA

### Service Worker — Offline Básico

**Qué se cachea:**
- Ronda activa completa (template, checkpoints, programación) al iniciarla → IndexedDB
- Marcaciones sin conexión → IndexedDB con `isOfflineSync: true`
- Assets estáticos (JS, CSS, iconos) → service worker cache

**Flujo offline:**
1. Guardia inicia ronda → data se cachea en IndexedDB
2. Pierde conexión → app sigue funcionando, marcaciones se guardan local
3. Vuelve conexión → sync automático via evento `online`
4. POST a `/api/portal/rondas/sync` con marcaciones pendientes
5. Servidor procesa, calcula trust score, genera alertas
6. Registros se marcan con `isOfflineSync: true` + `syncedAt`

**Qué NO funciona offline:** Login, historial de rondas anteriores, upload de fotos (se encolan).

### PWA Manifest

```
public/portal-rondas-manifest.json
- name: "Rondas Gard"
- short_name: "Rondas"
- start_url: "/portal/rondas"
- display: "standalone"
- theme_color: "#0a0a0f"
- background_color: "#0a0a0f"
- icons: /public/iconos_azul/icon-{48..512}x512.png
```

### Service Worker

- Archivo: `public/rondas-sw.js`
- Registro desde layout del portal
- Cache strategies:
  - App shell (HTML/JS/CSS): cache-first, actualiza en background
  - API de rondas: network-first, fallback a cache para ronda activa
  - Fotos: encolan en IndexedDB, upload cuando hay conexión

## UI/UX — Diseño para Terreno

### Principios

- **Una mano, con guantes** — botones min 56px alto, zonas de tap generosas
- **Legible en oscuridad** — fondo #0a0a0f, texto #f5f5f5, acentos teal #14b8a6
- **Tipografía grande** — títulos 24px, body 18px, labels 16px
- **Minimal** — max 2-3 elementos por pantalla
- **Feedback inmediato** — vibración al marcar (Vibration API), toast grande

### Navegación

Header fijo: nombre del guardia, instalación, ícono de conexión (online/offline), logout.

Solo 3 estados: `[Mis Rondas] ↔ [Ronda Activa] ↔ [Marcar Checkpoint]`

### Colores de Estado

- Completado: `#22c55e` (verde)
- Activo/En curso: `#14b8a6` (teal)
- Pendiente: `#6b7280` (gris)
- Error/Fuera de rango: `#ef4444` (rojo)
- Offline: `#f59e0b` (amber)

## Reutilización de Código

Libs existentes que se importan directo:
- `src/lib/rondas/trust-score-v2.ts`
- `src/lib/rondas/geo-utils.ts`
- `src/lib/rondas/alert-engine.ts`
- `src/lib/rondas/anomaly-detection.ts`
- `src/lib/rondas/timezone.ts`
- `src/lib/rondas/schedule-engine.ts`
- `src/lib/guard-portal.ts` (formatRut, isValidRut)

## Lo que NO se toca

- APIs existentes de `/api/ops/rondas/*` (panel admin)
- Portal guardia existente (`/portal/guardia`)
- Tablas del schema (excepto agregar `qrRequerido` a `OpsRondaTemplate`)
