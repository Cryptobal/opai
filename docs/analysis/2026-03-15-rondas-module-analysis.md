# Análisis Completo del Módulo de Rondas — Portal Guardia

> Generado: 2026-03-15
> Objetivo: Proveer contexto completo para diseñar un refactor de UX del módulo de rondas del portal guardia.

---

## 1. Estructura de Archivos

### Portal Guardia — Páginas

```
src/app/portal/rondas/
├── page.tsx              # Renderiza <RondasPortalClient />
└── layout.tsx            # Layout del portal rondas
```

### Portal Guardia — Componentes

```
src/components/portal/rondas/
├── RondasPortalClient.tsx       # (746 líneas) — Orchestrador principal: auth, navegación, sesión
├── MisRondas.tsx                # (984 líneas) — Lista de rondas agrupadas por sección
├── RondaActiva.tsx              # (1215 líneas) — Pantalla de ronda en curso: mapa, GPS, checkpoints
├── CheckpointMarker.tsx         # (1395 líneas) — Bottom sheet de marcación de checkpoint
├── RondaMap.tsx                 # (537 líneas) — Mapa Leaflet con checkpoints y posición guardia
├── RondaProgress.tsx            # (29 líneas) — Barra de progreso completados/total
├── RondaCompletada.tsx          # Pantalla post-completar con resumen y trust score
├── CheckpointMarker.tsx         # Bottom sheet para confirmar marcación
├── QrScanner.tsx                # Escáner QR para checkpoints
├── PhotoCapture.tsx             # Captura de foto de evidencia
├── LoginScreen.tsx              # Login legacy (PIN)
├── DevicePairingScreen.tsx      # Emparejamiento de dispositivo
├── GuardSelectorHeader.tsx      # Selector de guardia en dispositivo compartido
├── PanicoModal.tsx              # Modal de alerta de pánico
├── ReportarIncidente.tsx        # Formulario de incidente
├── HistorialRondaModal.tsx      # Detalle de ronda pasada
├── InstallBanner.tsx            # Banner PWA "Instalar app"
├── ChatRondasPortal.tsx         # Chat integrado
├── ChatRondasSection.tsx        # Sección de chat
├── PortalBottomNav.tsx          # Navegación inferior (tabs)
├── PortalPerfil.tsx             # Pantalla de perfil
├── ServiceWorkerRegistrar.tsx   # Registro de service worker unificado
├── leaflet-setup.ts             # Setup de Leaflet CSS + fix de iconos
└── tour/
    └── guard-tour-steps.ts      # Pasos del onboarding tour
```

### API Routes — Portal Guardia

```
src/app/api/portal/rondas/
├── auth/route.ts            # Autenticación legacy (PIN)
├── iniciar/route.ts         # POST — Iniciar ronda (startedAt, status=en_curso)
├── iniciar-libre/route.ts   # POST — Iniciar ronda libre (ad-hoc)
├── marcar/route.ts          # POST — Marcar checkpoint (delega a marcar-checkpoint-service)
├── completar/route.ts       # POST — Completar ronda (trust score, missed, status)
├── mis-rondas/route.ts      # GET — Lista de rondas del día con checkpoints
├── sync/route.ts            # POST — Sync batch de marcaciones offline
├── tracking/route.ts        # POST — Tracking GPS cada 30s
├── incidente/route.ts       # POST — Reportar incidente
├── panico/route.ts          # POST — Alerta de pánico
├── upload/route.ts          # POST — Upload de fotos
├── historial/route.ts       # GET — Historial de rondas (30 días)
├── historial/[id]/route.ts  # GET — Detalle de ronda pasada
└── mi-desempeno/route.ts    # GET — Métricas de desempeño
```

### Servicios y Utilidades

```
src/lib/
├── marcacion.ts                  # Haversine, hash de integridad, generación de código/PIN
├── rondas-offline.ts             # IndexedDB para marcaciones offline
└── rondas/
    ├── marcar-checkpoint-service.ts  # (439 líneas) — Servicio unificado de marcación
    ├── geo-utils.ts                  # (81 líneas) — Distancia, geocerca, velocidad
    ├── trust-score.ts                # (42 líneas) — Cálculo de trust score por checkpoint
    ├── trust-score-v2.ts             # Trust score v2 para ronda completa
    ├── anomaly-detection.ts          # (45 líneas) — Detección de anomalías
    ├── alert-engine.ts               # Evaluación post-marcación de alertas
    ├── alert-catalog.ts              # Catálogo de tipos de alerta
    ├── alert-config-service.ts       # Configuración de alertas por tenant
    ├── alert-notifications.ts        # Notificaciones push de alertas críticas
    ├── schedule-engine.ts            # Motor de programación de rondas
    ├── timezone.ts                   # Helpers de timezone Chile
    ├── get-active-turno.ts           # Obtiene turno de monitoreo activo
    ├── ia-config.ts                  # Configuración de IA y umbrales
    └── ...
```

### Service Worker y PWA

```
public/
├── sw.js                         # Service worker unificado (287 líneas)
├── rondas-sw.js                  # Legacy — auto-unregister, redirige a sw.js
├── portal-rondas-manifest.json   # Manifest PWA
└── offline.html                  # Fallback offline
```

---

## 2. Modelo de Datos (Prisma)

### OpsCheckpoint — Punto de control físico
```prisma
model OpsCheckpoint {
  id                String    @id @default(uuid())
  tenantId          String
  installationId    String
  name              String
  description       String?
  instrucciones     String?
  qrCode            String?   // Unique per tenant
  lat               Float?
  lng               Float?
  geoRadiusM        Int       @default(30)
  verificationType  String    @default("GEOFENCE")  // "GEOFENCE" | "QR" | "BOTH"
  isCritical        Boolean   @default(false)
  sortOrder         Int       @default(0)
  isActive          Boolean   @default(true)
  createdBy         String?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  installation      CrmInstallation          @relation(...)
  rondaLinks        OpsRondaCheckpoint[]
  marcaciones       OpsMarcacionCheckpoint[]
  incidentes        OpsRondaIncidente[]
  tasks             OpsCheckpointTask[]

  @@schema("ops")
  @@map("checkpoints")
}
```

### OpsCheckpointTask — Tareas en cada checkpoint
```prisma
model OpsCheckpointTask {
  id            String    @id @default(uuid())
  tenantId      String
  checkpointId  String
  sortOrder     Int       @default(0)
  label         String
  type          String    // "boolean" | "checklist" | "select" | "text" | "number" | "photo"
  required      Boolean   @default(false)
  options       Json?     // Array de opciones para checklist/select
  config        Json?     // { min, max, minPhotos, placeholder, alertOnValue }
  isActive      Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  checkpoint    OpsCheckpoint                @relation(...)
  responses     OpsCheckpointTaskResponse[]

  @@schema("ops")
  @@map("checkpoint_tasks")
}
```

### OpsCheckpointTaskResponse — Respuesta del guardia a una tarea
```prisma
model OpsCheckpointTaskResponse {
  id          String    @id @default(uuid())
  tenantId    String
  taskId      String
  marcacionId String
  guardiaId   String
  value       Json      // boolean | string | number | string[]
  photoUrls   Json?     // Array de URLs de fotos
  respondedAt DateTime  @default(now())
  lat         Float?
  lng         Float?

  task        OpsCheckpointTask          @relation(...)
  marcacion   OpsMarcacionCheckpoint     @relation(...)
  guardia     OpsGuardia                 @relation(...)

  @@schema("ops")
  @@map("checkpoint_task_responses")
}
```

### OpsRondaTemplate — Plantilla de ronda
```prisma
model OpsRondaTemplate {
  id                   String    @id @default(uuid())
  tenantId             String
  installationId       String
  name                 String
  description          String?
  orderMode            String    @default("flexible")  // "strict" | "flexible"
  estimatedDurationMin Int?
  qrRequerido          Boolean   @default(false)
  isActive             Boolean   @default(true)
  createdBy            String?
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt

  installation         CrmInstallation        @relation(...)
  checkpoints          OpsRondaCheckpoint[]
  programaciones       OpsRondaProgramacion[]
  ejecuciones          OpsRondaEjecucion[]
  incidentes           OpsRondaIncidente[]

  @@schema("ops")
  @@map("ronda_templates")
}
```

### OpsRondaCheckpoint — Junction: checkpoints ↔ template
```prisma
model OpsRondaCheckpoint {
  id               String    @id @default(uuid())
  tenantId         String
  rondaTemplateId  String
  checkpointId     String
  orderIndex       Int       @default(1)
  isRequired       Boolean   @default(true)
  maxTimeMinutes   Int?
  createdAt        DateTime  @default(now())

  rondaTemplate    OpsRondaTemplate  @relation(...)
  checkpoint       OpsCheckpoint     @relation(...)

  @@unique([rondaTemplateId, checkpointId])
  @@schema("ops")
  @@map("ronda_checkpoints")
}
```

### OpsRondaProgramacion — Programación recurrente
```prisma
model OpsRondaProgramacion {
  id                 String    @id @default(uuid())
  tenantId           String
  rondaTemplateId    String
  diasSemana         Json      // Array de días [0-6]
  horaInicio         String    // "HH:MM"
  horaFin            String    // "HH:MM"
  frecuenciaMinutos  Int       @default(120)
  toleranciaMinutos  Int       @default(10)
  isActive           Boolean   @default(true)
  createdBy          String?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  rondaTemplate      OpsRondaTemplate     @relation(...)
  ejecuciones        OpsRondaEjecucion[]

  @@schema("ops")
  @@map("ronda_programaciones")
}
```

### OpsRondaEjecucion — Instancia de ejecución de ronda
```prisma
model OpsRondaEjecucion {
  id                      String    @id @default(uuid())
  tenantId                String
  rondaTemplateId         String?
  isAdHoc                 Boolean   @default(false)
  programacionId          String?
  guardiaId               String?
  status                  String    @default("pendiente")
    // "pendiente" | "en_curso" | "completada" | "incompleta"
    // | "no_realizada" | "cerrada_auto" | "cerrada_admin"
  scheduledAt             DateTime
  startedAt               DateTime?
  completedAt             DateTime?
  checkpointsTotal        Int       @default(0)
  checkpointsCompletados  Int       @default(0)
  porcentajeCompletado    Float     @default(0)
  trustScore              Int       @default(0)
  trustBreakdown          Json?
  durationMinutes         Int?
  isOfflineSync           Boolean   @default(false)
  syncedAt                DateTime?
  notes                   String?
  penalizacionMotivo      String?
  installationId          String?
  deviceInfo              Json?
  walkRoute               Json?     // [{lat, lng}] GPS trail
  routeSnapshot           Json?     // [{id, name, lat, lng, status}]
  alertas                 Json?     // DEPRECATED
  createdAt               DateTime  @default(now())
  updatedAt               DateTime  @updatedAt

  rondaTemplate           OpsRondaTemplate?        @relation(...)
  programacion            OpsRondaProgramacion?    @relation(...)
  guardia                 OpsGuardia?              @relation(...)
  installation            CrmInstallation?         @relation(...)
  marcaciones             OpsMarcacionCheckpoint[]
  alertasRows             OpsAlertaRonda[]
  incidentes              OpsRondaIncidente[]
  trackingPoints          OpsRondaTracking[]

  @@schema("ops")
  @@map("ronda_ejecuciones")
}
```

### OpsRondaTracking — Puntos GPS durante ronda
```prisma
model OpsRondaTracking {
  id           String    @id @default(uuid())
  ejecucionId  String
  lat          Float
  lng          Float
  accuracy     Float?
  battery      Float?
  createdAt    DateTime  @default(now())

  ejecucion    OpsRondaEjecucion  @relation(...)

  @@schema("ops")
  @@map("ronda_tracking")
}
```

### OpsMarcacionCheckpoint — Marcación de checkpoint
```prisma
model OpsMarcacionCheckpoint {
  id                 String    @id @default(uuid())
  tenantId           String
  ejecucionId        String
  checkpointId       String?
  guardiaId          String
  timestamp          DateTime  @default(now())
  lat                Float
  lng                Float
  geoValidada        Boolean   @default(false)
  geoDistanciaM      Float?
  geoAccuracy        Float?
  geoConfidence      String?   // "high" | "low" | "unknown"
  batteryLevel       Float?
  motionData         Json?
  speedFromPrevKmh   Float?
  timeFromPrevSec    Int?
  fotoEvidenciaUrl   String?
  audioUrl           String?
  note               String?
  hashIntegridad     String
  anomalias          Json?     // RondaAnomalyCode[]
  status             String    @default("COMPLETED")  // "COMPLETED" | "MISSED"
  verificationMethod String    @default("QR")  // "QR" | "GEOFENCE" | "BOTH" | "MANUAL"
  isOfflineSync      Boolean   @default(false)
  createdAt          DateTime  @default(now())

  ejecucion          OpsRondaEjecucion          @relation(...)
  checkpoint         OpsCheckpoint?             @relation(...)
  guardia            OpsGuardia                 @relation(...)
  taskResponses      OpsCheckpointTaskResponse[]

  @@unique([ejecucionId, checkpointId])
  @@schema("ops")
  @@map("marcacion_checkpoints")
}
```

### OpsAlertaRonda — Alertas generadas
```prisma
model OpsAlertaRonda {
  id               String    @id @default(uuid())
  tenantId         String
  ejecucionId      String?
  installationId   String
  guardiaId        String?
  tipo             String    // RondaAnomalyCode
  severidad        String    @default("warning")  // "info" | "warning" | "critical"
  mensaje          String
  data             Json?
  resuelta         Boolean   @default(false)
  resueltaPor      String?
  resueltaAt       DateTime?
  resolutionNotes  String?   @db.Text
  isAcknowledged   Boolean   @default(false)
  acknowledgedBy   String?
  acknowledgedAt   DateTime?
  createdAt        DateTime  @default(now())
  turnoId          String?
  archivedAt       DateTime?

  ejecucion        OpsRondaEjecucion?  @relation(...)
  installation     CrmInstallation     @relation(...)
  guardia          OpsGuardia?         @relation(...)
  turno            OpsMonitoreoTurno?  @relation(...)

  @@schema("ops")
  @@map("alertas_ronda")
}
```

### OpsRondaIncidente — Incidentes reportados
```prisma
model OpsRondaIncidente {
  id               String    @id @default(uuid())
  tenantId         String
  ejecucionId      String?
  rondaTemplateId  String?
  checkpointId     String?
  guardiaId        String
  installationId   String?
  tipo             String
  descripcion      String
  fotoUrl          String?
  lat              Float?
  lng              Float?
  status           String    @default("abierto")
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  ejecucion        OpsRondaEjecucion?   @relation(...)
  rondaTemplate    OpsRondaTemplate?    @relation(...)
  checkpoint       OpsCheckpoint?       @relation(...)
  guardia          OpsGuardia           @relation(...)
  installation     CrmInstallation?     @relation(...)

  @@schema("ops")
  @@map("ronda_incidentes")
}
```

---

## 3. Flujo de Marcación

### Diagrama de flujo completo

```
Guardia en RondaActiva
      │
      ├── watchPosition activo → actualiza guardPos cada cambio GPS
      │
      ├── Cada 30s → POST /api/portal/rondas/tracking (lat, lng, accuracy, battery)
      │
      ├── Para cada checkpoint pendiente:
      │     Calcula haversine(guardPos, checkpoint) en cliente
      │     Si distancia <= geoRadiusM → muestra banner "Estás en el checkpoint"
      │
      ├── Guardia toca checkpoint (o ve banner auto-detección)
      │     └── Abre <CheckpointMarker> (bottom sheet)
      │
      └── Dentro de CheckpointMarker:
            │
            ├── 1. Obtiene GPS (usa guardPos compartido o getCurrentPosition)
            │     - enableHighAccuracy: true
            │     - timeout: 15000ms
            │
            ├── 2. Validación de geocerca (cliente)
            │     haversine(guardLat, guardLng, cpLat, cpLng)
            │     Si verificationType === "GEOFENCE" o "BOTH":
            │       Si distancia > geoRadiusM → BLOQUEA (no puede marcar)
            │     Si verificationType === "QR":
            │       Permite marcar sin validar geo
            │
            ├── 3. QR scan (si qrRequerido o verificationType incluye QR)
            │     Abre QrScanner → valida que el QR coincida con el checkpoint
            │
            ├── 4. Task responses (si checkpoint tiene tasks)
            │     Renderiza formulario dinámico según task.type:
            │     boolean, checklist, select, text, number, photo
            │
            ├── 5. Foto de evidencia (opcional o requerida según config)
            │     PhotoCapture → upload a /api/portal/rondas/upload → S3 URL
            │
            ├── 6. Anti-fraude: recopila batteryLevel, deviceMotion
            │
            ├── 7. Genera hash de integridad (SHA-256 client-side)
            │
            ├── 8. POST /api/portal/rondas/marcar
            │     Body: {
            │       ejecucionId, checkpointId, lat, lng, gpsAccuracy,
            │       batteryLevel, motionData, fotoEvidenciaUrl, note,
            │       verificationMethod, guardiaId, taskResponses
            │     }
            │
            └── 9. Si offline → savePendingMark(mark) en IndexedDB
                  Cuando vuelve online → POST /api/portal/rondas/sync
```

### Servicio unificado: `marcar-checkpoint-service.ts`

El archivo `src/lib/rondas/marcar-checkpoint-service.ts` (439 líneas) es el corazón de la marcación. Es usado tanto por `/api/portal/rondas/marcar` como por `/api/public/ronda/marcar`.

**Pasos internos:**

1. **Busca la ejecución** — `status in ["en_curso", "pendiente", "incompleta"]`
2. **Detecta ronda ad-hoc** — Si `isAdHoc && !checkpointId && !checkpointQrCode` → marca GPS-only
3. **Valida guardia** — Auto-asigna si la ejecución no tiene guardia, o valida match
4. **Resuelve checkpoint** — Por `checkpointId` o `qrCode`; verifica QR si requerido
5. **Validación geo** — `validateGeofenceWithAccuracy()`:
   - GEOFENCE/BOTH: bloquea si `!geo.valid`
   - QR: permite sin validar geo (QR = prueba de presencia)
6. **Cálculo de velocidad** — `speedKmh(distancia_al_previo, tiempo_transcurrido)`
7. **Detección de anomalías** — `detectCheckpointAnomalies()`:
   - `geo_fuera_rango`, `sin_movimiento`, `velocidad_anomala`
   - `mismo_punto_repetido`, `bateria_baja`, `bateria_estatica`
8. **Trust score** — `computeCheckpointTrustScore()`:
   - geo validada: +30, movimiento: +15, foto: +15, mismo dispositivo: +10
   - velocidad normal: +20, batería >10%: +10
9. **Hash integridad** — SHA-256 de `guardiaId|installationId|tipo|timestamp|lat|lng|metodoId|tenantId`
10. **Transacción DB** — En un `prisma.$transaction`:
    - Verifica duplicado (`ejecucionId + checkpointId` unique)
    - Crea `OpsMarcacionCheckpoint`
    - Guarda `OpsCheckpointTaskResponse[]` si hay
    - Actualiza `OpsRondaEjecucion` (completados, %, trustScore, startedAt)
    - Crea `OpsAlertaRonda` si hay anomalías
11. **Fire-and-forget** — Notificación push, evaluación post-mark alerts, Pusher event

---

## 4. Manejo de GPS

### Obtención de ubicación

**En `RondaActiva.tsx`** — GPS continuo:
```typescript
// watchPosition con high accuracy
useEffect(() => {
  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      setGuardPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setGpsAccuracy(pos.coords.accuracy);
      // Acumula trail para rondas ad-hoc
      if (isAdHoc) {
        setTrailPoints(prev => [...prev, { lat: pos.coords.latitude, lng: pos.coords.longitude }]);
      }
    },
    (err) => setGpsError(err.message),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 }
  );
  return () => navigator.geolocation.clearWatch(watchId);
}, []);
```

**En `CheckpointMarker.tsx`** — GPS one-shot (fallback):
```typescript
// Si no hay guardPos compartido, obtiene GPS one-shot
navigator.geolocation.getCurrentPosition(
  (pos) => { /* usa pos.coords */ },
  (err) => { /* error handling */ },
  { enableHighAccuracy: true, timeout: 15000 }
);
```

### Tracking al servidor (cada 30s)

```typescript
// En RondaActiva.tsx
useEffect(() => {
  const id = setInterval(() => {
    if (guardPos) {
      fetch("/api/portal/rondas/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ejecucionId, guardiaId: session.guardiaId,
          lat: guardPos.lat, lng: guardPos.lng,
          accuracy: gpsAccuracy, battery: batteryLevel
        }),
      }).catch(() => {});
    }
  }, 30000);
  return () => clearInterval(id);
}, [guardPos, ejecucionId]);
```

### Cálculo de distancia (Haversine)

```typescript
// src/lib/marcacion.ts
export function haversineDistance(lat1, lng1, lat2, lng2): number {
  const R = 6371000; // Radio Tierra en metros
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
```

### Validación de geocerca con precisión GPS

```typescript
// src/lib/rondas/geo-utils.ts
export function validateGeofenceWithAccuracy(
  fromLat, fromLng, toLat, toLng, radiusM, geoAccuracy
): GeofenceResult {
  const distanceM = haversineDistance(fromLat, fromLng, toLat, toLng);

  // Sin accuracy → check estándar, confidence "unknown"
  if (!geoAccuracy || geoAccuracy <= 0)
    return { valid: distanceM <= radiusM, distanceM, confidence: "unknown" };

  // Accuracy mala (>= radio) → tolerancia generosa, confidence "low"
  if (geoAccuracy >= radiusM)
    return { valid: distanceM <= radiusM + geoAccuracy, distanceM, confidence: "low" };

  // Accuracy buena (< radio) → tolerancia moderada, confidence "high"
  return { valid: distanceM <= radiusM + geoAccuracy * 0.5, distanceM, confidence: "high" };
}
```

### Auto-detección de geocerca (cliente)

En `RondaActiva.tsx`, cada vez que `guardPos` cambia, se calcula la distancia a cada checkpoint pendiente:

```typescript
// Pseudo-código del efecto en RondaActiva
const nearestCheckpoint = pendingCheckpoints
  .map(cp => ({ ...cp, dist: haversineDistance(guardPos.lat, guardPos.lng, cp.lat, cp.lng) }))
  .filter(cp => cp.dist <= cp.geoRadiusM)
  .sort((a, b) => a.dist - b.dist)[0];

if (nearestCheckpoint) {
  // Muestra banner: "Estás en {checkpoint.name}"
  // Con botón para abrir CheckpointMarker
  setAutoDetectedCheckpoint(nearestCheckpoint);
}
```

---

## 5. Modo Offline

### IndexedDB para marcaciones pendientes

```typescript
// src/lib/rondas-offline.ts
const DB_NAME = "rondas-portal";
const STORE_NAME = "pending-marks";

// Guarda una marcación pendiente
export async function savePendingMark(mark: Record<string, unknown>): Promise<void>

// Obtiene todas las marcaciones pendientes
export async function getPendingMarks(): Promise<Record<string, unknown>[]>

// Limpia después de sync exitoso
export async function clearPendingMarks(): Promise<void>
```

### Flujo offline en CheckpointMarker

```typescript
// En CheckpointMarker.tsx, al fallar el POST:
try {
  const res = await fetch("/api/portal/rondas/marcar", { ... });
  if (!res.ok) throw new Error("Network error");
} catch {
  // Guardar en IndexedDB para sync posterior
  await savePendingMark({
    ejecucionId, checkpointId, lat, lng, guardiaId,
    batteryLevel, motionData, fotoEvidenciaUrl, note,
    verificationMethod, clientTimestamp: new Date().toISOString()
  });
}
```

### Sync batch al reconectar

```typescript
// POST /api/portal/rondas/sync
// Body: { marks: [...pendingMarks] }
// Cada mark se procesa con marcarCheckpoint() con isOfflineSync: true
// Respuesta: { synced: N, failed: M, errors: [...] }
```

### Service Worker (`public/sw.js`, 287 líneas)

- **Cache strategy API routes**: Network-first con fallback a cache
- **Cache strategy assets**: Cache-first
- **Navigation**: Network-first con fallback a `offline.html`
- **Push notifications**: Manejo de alertas de pánico con vibración agresiva
- **Notification grouping**: Para mensajes de chat

### Incidentes offline

En `RondasPortalClient.tsx`:
```typescript
// Al reportar incidente offline → localStorage
localStorage.setItem("pending-incidents", JSON.stringify([...pending, newIncident]));

// Al reconectar → retryPendingIncidents()
// Intenta POST cada incidente, guarda los que fallen de nuevo
```

---

## 6. Componente del Mapa (`RondaMap.tsx`)

### Librería: **Leaflet** (react-leaflet)

```typescript
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
```

### Tiles: ESRI World Imagery (satélite)

```typescript
const TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
```

### Props del componente

```typescript
interface RondaMapProps {
  checkpoints: MapCheckpoint[];
  guardPosition?: { lat: number; lng: number } | null;
  height?: string;                    // default "300px"
  showRoute?: boolean;                // muestra polylines entre checkpoints
  interactive?: boolean;              // default true
  showCenterButton?: boolean;         // botón "centrar en guardia"
  onCenterGuard?: () => void;
  trailPoints?: { lat: number; lng: number }[];  // GPS trail (rondas ad-hoc)
  markingCheckpointId?: string | null;           // línea punteada guardia→checkpoint
}
```

### Markers de checkpoint (divIcon)

3 estados visuales:
- **completed**: Círculo verde (#22c55e) con checkmark blanco
- **active**: Círculo blanco con borde teal + animación pulse
- **pending**: Círculo blanco con borde gris + número de orden

### Marker del guardia

- Círculo azul (#3b82f6) de 18px con borde blanco
- Halo pulsante azul semitransparente de 40px

### Follow mode (`AutoFollowGuard`)

```typescript
function AutoFollowGuard({ guardPosition }) {
  const map = useMap();
  const lastManualInteraction = useRef(0);

  // Trackea interacciones del usuario
  useEffect(() => {
    map.on("dragstart", () => lastManualInteraction.current = Date.now());
    map.on("zoomstart", () => lastManualInteraction.current = Date.now());
  }, [map]);

  // Auto-pan cuando el guardia se mueve fuera del área visible
  useEffect(() => {
    // Pausa 10 segundos después de interacción manual
    if (Date.now() - lastManualInteraction.current < 10_000) return;

    // Solo pan si el guardia está fuera del bounds visible
    if (!map.getBounds().contains(L.latLng(guardPosition.lat, guardPosition.lng))) {
      map.panTo(guardPosition, { animate: true, duration: 0.5 });
    }
  }, [guardPosition.lat, guardPosition.lng]);
}
```

### Route polylines

Segmentos coloreados entre checkpoints ordenados por `orderIndex`:
- **completed → completed**: Verde sólido (#22c55e)
- **completed → active**: Teal sólido (#14b8a6)
- **otros**: Teal punteado (#2DD4BF, dashArray "8 6")

Cada segmento tiene un outline blanco semi-transparente para contraste sobre satélite.

### GPS trail polyline

Para rondas ad-hoc: polyline verde (#10B981) sólida mostrando el recorrido real.

### Guard → checkpoint line

Cuando se está marcando un checkpoint, dibuja una línea punteada teal desde la posición del guardia al checkpoint.

---

## 7. Bottom Sheet de Marcación (`CheckpointMarker.tsx`)

### Estructura: 1395 líneas

Este componente tiene **3 modos de renderizado**:

#### Modo 1: Ad-hoc GPS compact layout
Para rondas libres sin checkpoints predefinidos. Layout compacto que solo muestra botón de marcar punto GPS.

#### Modo 2: Quick mark (in-geofence)
Cuando el guardia ya está dentro de la geocerca. Muestra un layout simplificado con confirmación rápida.

#### Modo 3: Standard bottom sheet
El flujo completo con múltiples pasos.

### Props

```typescript
interface Props {
  checkpoint: CheckpointInfo;
  ejecucionId: string;
  guardiaId: string;
  qrRequerido: boolean;
  onComplete: (result: MarcarResult) => void;
  onBack: () => void;
  guardPos?: { lat: number; lng: number } | null;  // GPS compartido de RondaActiva
  isInGeofence?: boolean;                            // Pre-calculado por RondaActiva
}
```

### Flujo interno (pasos secuenciales)

```
1. GPS Acquisition
   ├── Usa guardPos compartido si disponible
   └── Fallback: getCurrentPosition(enableHighAccuracy, timeout 15s)

2. Geo validation (cliente)
   ├── Calcula distancia haversine
   ├── Si GEOFENCE/BOTH y fuera de rango → BLOQUEA con mensaje
   └── Si QR → salta validación geo

3. QR Scan (si requerido)
   ├── Abre <QrScanner />
   ├── Valida que QR coincida con checkpoint.qrCode
   └── Si no coincide → error "QR incorrecto"

4. Task Responses (si checkpoint tiene tasks)
   ├── Renderiza formulario dinámico:
   │   ├── boolean → Switch/toggle
   │   ├── checklist → Lista de checkboxes
   │   ├── select → Dropdown
   │   ├── text → TextArea
   │   ├── number → Input numérico con min/max
   │   └── photo → PhotoCapture con minPhotos
   ├── Valida campos required
   └── Valida constraints (min, max, minPhotos)

5. Photo Capture (evidencia)
   ├── <PhotoCapture /> con cámara del dispositivo
   ├── Upload a /api/portal/rondas/upload
   └── Retorna URL S3

6. Confirmation
   ├── Muestra resumen: checkpoint, distancia, GPS accuracy
   ├── Campo de nota opcional
   └── Botón "Confirmar Marcación"

7. Submit
   ├── Recopila anti-fraude: batteryLevel, deviceMotion
   ├── Genera hash de integridad
   ├── POST /api/portal/rondas/marcar
   ├── Si error de red → savePendingMark() en IndexedDB
   └── onComplete(result) → vuelve a RondaActiva
```

### Datos anti-fraude recopilados

```typescript
{
  batteryLevel: navigator.getBattery().level * 100,
  motionData: {
    movementScore: /* calculado de DeviceMotionEvent */,
    acceleration: { x, y, z },
    rotationRate: { alpha, beta, gamma }
  }
}
```

### Manejo de error de geocerca

Cuando `verificationType === "GEOFENCE"` o `"BOTH"` y el guardia está fuera del rango:
- Muestra distancia actual vs radio permitido
- Muestra GPS accuracy
- Bloquea el botón de confirmar
- Mensaje: "Debe estar en el rango del checkpoint para marcar"

---

## 8. Ordenamiento de Puntos

### En la lista de checkpoints (`MisRondas.tsx`)

Los checkpoints vienen del API `/mis-rondas` ordenados por `orderIndex ASC`:

```typescript
// En el API route
checkpoints: {
  include: { checkpoint: { ... } },
  orderBy: { orderIndex: "asc" },
}
```

Luego en el frontend se mapean manteniendo ese orden:

```typescript
checkpoints: template?.checkpoints.map(tc => ({
  id: tc.checkpoint.id,
  name: tc.checkpoint.name,
  orderIndex: tc.orderIndex,    // <-- el orderIndex del OpsRondaCheckpoint
  completed: ej.marcaciones.some(m => m.checkpointId === tc.checkpointId && m.status === "COMPLETED"),
  ...
}))
```

### En `RondaActiva.tsx`

La lista se divide en 3 grupos visuales:
1. **Completados** — `cp.completed === true`
2. **Activo/Siguiente** — El primer checkpoint no completado
3. **Pendientes** — El resto de no completados

Dentro de cada grupo, el orden se mantiene por `orderIndex`.

### En el mapa (`RondaMap.tsx`)

Las polylines de ruta se dibujan entre checkpoints ordenados por `orderIndex`:
```typescript
const sorted = [...checkpoints].sort((a, b) => a.orderIndex - b.orderIndex);
```

### Modos de orden: `strict` vs `flexible`

- **`flexible`** (default): El guardia puede marcar checkpoints en cualquier orden
- **`strict`**: El guardia debe marcar en el orden definido (orderIndex ascendente)

El enforcement de `strict` se hace en `alert-engine.ts` (genera alerta "orden_incorrecto"), pero **no bloquea** la marcación — solo genera una alerta/anomalía.

### Cómo se define `orderIndex`

Se define al crear/editar la plantilla de ronda (`OpsRondaCheckpoint.orderIndex`). El admin arrastra los checkpoints en el formulario de template y se asigna el índice secuencial.

---

## 9. Tipos TypeScript Clave (resumen)

### Sesión del portal
```typescript
export interface RondasSession {
  guardiaId: string;
  tenantId: string;
  installationId: string;
  nombre: string;
  installationName: string;
  authenticatedAt: string;
}
```

### Pantallas del portal
```typescript
export type RondasScreen = "login" | "mis-rondas" | "ronda-activa" | "completada" | "chat" | "perfil" | "incidente";
```

### Ronda data (de API a componente)
```typescript
export interface RondaData {
  ejecucionId: string;
  templateId: string;
  templateName: string;
  status: string;
  scheduledAt: string;
  startedAt: string | null;
  checkpointsTotal: number;
  checkpointsCompletados: number;
  qrRequerido: boolean;
  orderMode: string;
  estimatedDurationMin: number | null;
  checkpoints: ApiCheckpoint[];
}
```

### Resultado de marcación
```typescript
export interface MarcarResult {
  id: string;
  trustScore: number;
  anomalies: string[];
  geo: { valid: boolean; distanceM: number | null };
}
```

### Datos post-completar
```typescript
export interface CompletionData {
  trustScore: number;
  trustBreakdown?: Record<string, { score: number; weight: number }> | null;
  porcentajeCompletado: number;
  durationMinutes: number | null;
  missed: number;
  checkpoints?: {
    name: string;
    status: "COMPLETED" | "MISSED";
    timestamp?: string;
    distanceM?: number;
    geoValidada?: boolean;
    qrScanned?: boolean;
    hasPhoto?: boolean;
  }[];
}
```

### Códigos de anomalía
```typescript
export type RondaAnomalyCode =
  | "geo_fuera_rango"
  | "sin_movimiento"
  | "velocidad_anomala"
  | "mismo_punto_repetido"
  | "bateria_baja"
  | "bateria_estatica";
```

---

## 10. Clasificación de Rondas en MisRondas

Las rondas se agrupan en secciones basándose en `status` y tiempo:

```typescript
const SECTIONS = [
  { key: "en_curso",       label: "RONDA ACTIVA" },
  { key: "listas",         label: "LISTAS PARA INICIAR" },
  { key: "con_retraso",    label: "CON RETRASO" },
  { key: "proximas",       label: "PRÓXIMAS" },
  { key: "no_realizadas",  label: "NO REALIZADAS HOY",  collapsible: true },
  { key: "completadas",    label: "COMPLETADAS HOY",    collapsible: true },
];

function classifyPendiente(scheduledMs, toleranciaMin, nowMs) {
  const elapsed = nowMs - scheduledMs;
  const toleranciaMs = toleranciaMin * 60000;

  if (elapsed < -15 min)          → "proximas"
  if (elapsed < 0)                → "listas"
  if (elapsed <= tolerancia/2)    → "listas"
  if (elapsed <= tolerancia)      → "con_retraso"
  else                            → "no_realizadas"
}
```

**Ronda libre bloqueada** cuando hay rondas pendientes en "listas" o "con_retraso".

---

## 11. Archivos Completos de Referencia

Para el refactor de UX, los archivos más importantes a revisar son:

| Archivo | Líneas | Rol |
|---------|--------|-----|
| `RondasPortalClient.tsx` | 746 | Orchestrador: auth, navegación, sesión |
| `MisRondas.tsx` | 984 | Lista de rondas agrupada |
| `RondaActiva.tsx` | 1215 | Ronda en curso: mapa, GPS, checkpoints |
| `CheckpointMarker.tsx` | 1395 | Bottom sheet de marcación |
| `RondaMap.tsx` | 537 | Mapa Leaflet |
| `marcar-checkpoint-service.ts` | 439 | Servicio backend de marcación |
| `geo-utils.ts` | 81 | Geocerca y distancia |
| `trust-score.ts` | 42 | Trust score |
| `anomaly-detection.ts` | 45 | Detección de anomalías |
| `rondas-offline.ts` | 65 | IndexedDB offline |
| `/api/portal/rondas/marcar` | 82 | API route marcación |
| `/api/portal/rondas/completar` | 271 | API route completar |
| `/api/portal/rondas/mis-rondas` | 119 | API route lista rondas |

---
