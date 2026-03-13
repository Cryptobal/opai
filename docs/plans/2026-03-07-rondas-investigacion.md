# Rondas: Investigacion Exhaustiva del Modulo

**Fecha:** 2026-03-07
**Proposito:** Investigacion end-to-end del modulo de Rondas para diagnosticar problemas y planificar mejoras.

---

## 1. Estructura de Archivos (132 archivos)

### App Pages & Routes

**Portal (Ejecucion de rondas por guardia):**
- `src/app/ronda/[code]/RondaClient.tsx`
- `src/app/ronda/[code]/page.tsx`
- `src/app/portal/rondas/layout.tsx`
- `src/app/portal/rondas/page.tsx`
- `src/app/descargar/rondas/page.tsx`

**Dashboard Operaciones:**
- `src/app/(app)/ops/rondas/page.tsx`
- `src/app/(app)/ops/rondas/monitoreo/page.tsx`
- `src/app/(app)/ops/rondas/alertas/page.tsx`
- `src/app/(app)/ops/rondas/checkpoints/page.tsx`
- `src/app/(app)/ops/rondas/templates/page.tsx`
- `src/app/(app)/ops/rondas/programacion/page.tsx`
- `src/app/(app)/ops/rondas/reportes/page.tsx`
- `src/app/(app)/ops/rondas/configuracion/page.tsx`
- `src/app/(app)/ops/rondas/centro-ia/page.tsx`
- `src/app/(app)/ops/rondas/loading.tsx`
- `src/app/(app)/ops/rondas/error.tsx`

### API Routes — Portal

- `src/app/api/portal/rondas/auth/route.ts` — Login RUT+PIN
- `src/app/api/portal/rondas/mis-rondas/route.ts` — Rondas del dia
- `src/app/api/portal/rondas/iniciar/route.ts` — Iniciar ronda programada
- `src/app/api/portal/rondas/iniciar-libre/route.ts` — Iniciar ronda ad-hoc
- `src/app/api/portal/rondas/marcar/route.ts` — Marcar checkpoint
- `src/app/api/portal/rondas/completar/route.ts` — Completar ronda
- `src/app/api/portal/rondas/sync/route.ts` — Sync offline
- `src/app/api/portal/rondas/panico/route.ts` — Boton de panico
- `src/app/api/portal/rondas/incidente/route.ts` — Reportar incidente
- `src/app/api/portal/rondas/mi-desempeno/route.ts` — Performance del guardia
- `src/app/api/portal/rondas/upload/route.ts` — Subir foto
- `src/app/api/portal/cliente/rondas/route.ts` — Rondas por cliente
- `src/app/api/portal/cliente/rondas/[id]/route.ts`

### API Routes — Public (Mobile/Anonymous)

- `src/app/api/public/ronda/autenticar/route.ts`
- `src/app/api/public/ronda/validar/route.ts`
- `src/app/api/public/ronda/pendientes/route.ts`
- `src/app/api/public/ronda/iniciar/route.ts`
- `src/app/api/public/ronda/marcar/route.ts`
- `src/app/api/public/ronda/completar/route.ts`
- `src/app/api/public/ronda/sync/route.ts`
- `src/app/api/public/ronda/panico/route.ts`
- `src/app/api/public/ronda/incidente/route.ts`

### API Routes — Operations (Admin)

**Core:**
- `src/app/api/ops/rondas/route.ts`
- `src/app/api/ops/rondas/ejecuciones/route.ts`

**Checkpoints:**
- `src/app/api/ops/rondas/checkpoints/route.ts`
- `src/app/api/ops/rondas/checkpoints/[id]/route.ts`
- `src/app/api/ops/rondas/checkpoints/[id]/tasks/route.ts`
- `src/app/api/ops/rondas/checkpoints/[id]/tasks/[taskId]/route.ts`
- `src/app/api/ops/rondas/checkpoints/[id]/tasks/reorder/route.ts`

**Templates & Scheduling:**
- `src/app/api/ops/rondas/templates/route.ts`
- `src/app/api/ops/rondas/templates/[id]/route.ts`
- `src/app/api/ops/rondas/programacion/route.ts`
- `src/app/api/ops/rondas/programacion/[id]/route.ts`

**Monitoreo & Turnos:**
- `src/app/api/ops/rondas/monitoreo/route.ts`
- `src/app/api/ops/rondas/monitoreo/nota/route.ts`
- `src/app/api/ops/rondas/monitoreo/turno/start/route.ts`
- `src/app/api/ops/rondas/monitoreo/turno/active/route.ts`
- `src/app/api/ops/rondas/monitoreo/turno/[id]/close/route.ts`

**Alertas:**
- `src/app/api/ops/rondas/alertas/route.ts`
- `src/app/api/ops/rondas/alertas/[id]/resolve/route.ts`
- `src/app/api/ops/rondas/alertas/[id]/acknowledge/route.ts`

**Reportes:**
- `src/app/api/ops/rondas/reportes/route.ts`
- `src/app/api/ops/rondas/reportes/heatmap/route.ts`

**Dispositivos & IA:**
- `src/app/api/ops/rondas/dispositivos/route.ts`
- `src/app/api/ops/rondas/dispositivos/[id]/route.ts`
- `src/app/api/ops/rondas/dispositivos/validate/route.ts`
- `src/app/api/ops/rondas/ia/config/route.ts`
- `src/app/api/ops/rondas/ia/recommendations/route.ts`

**Cron:**
- `src/app/api/ops/rondas/cron/check-pending/route.ts`
- `src/app/api/cron/rondas/generar/route.ts` — Genera ejecuciones cada 10 min
- `src/app/api/cron/rondas/cerrar-atrasadas/route.ts` — Cierra rondas vencidas

### Components — Operations Dashboard (38 archivos)

**Monitoreo:**
- `src/components/ops/rondas/RondasMonitoreoClient.tsx` — Dashboard principal
- `src/components/ops/rondas/monitoreo-map.tsx` — Google Maps
- `src/components/ops/rondas/MonitoreoGuardPanel.tsx` — Panel de guardias
- `src/components/ops/rondas/MonitoreoTurnoHeader.tsx` — Header turno
- `src/components/ops/rondas/CerrarTurnoModal.tsx` — Modal cierre turno
- `src/components/ops/rondas/EventFeedItem.tsx`

**Alertas:**
- `src/components/ops/rondas/RondasAlertasClient.tsx`
- `src/components/ops/rondas/alerta-card.tsx`
- `src/components/ops/rondas/PanicAlertBanner.tsx` — Banner panico + audio

**Checkpoints:**
- `src/components/ops/rondas/RondasCheckpointsClient.tsx`
- `src/components/ops/rondas/checkpoint-form.tsx`
- `src/components/ops/rondas/checkpoint-tasks-editor.tsx`
- `src/components/ops/rondas/checkpoint-qr-generator.tsx`
- `src/components/ops/rondas/CheckpointMapCreator.tsx`

**Templates & Programacion:**
- `src/components/ops/rondas/RondasTemplatesClient.tsx`
- `src/components/ops/rondas/ronda-template-form.tsx`
- `src/components/ops/rondas/RondasProgramacionClient.tsx`
- `src/components/ops/rondas/programacion-form.tsx`
- `src/components/ops/rondas/QuickTimePicker.tsx`

**Reportes:**
- `src/components/ops/rondas/RondasReportesClient.tsx`
- `src/components/ops/rondas/RondasReportesTable.tsx`
- `src/components/ops/rondas/RondasReportPDF.tsx`
- `src/components/ops/rondas/RondasReportesHeatmap.tsx`
- `src/components/ops/rondas/RondasReportesPorGuardia.tsx`
- `src/components/ops/rondas/RondasComplianceChart.tsx`

**Trust Score & IA:**
- `src/components/ops/rondas/TrustScoreGauge.tsx`
- `src/components/ops/rondas/trust-score-badge.tsx`
- `src/components/ops/rondas/RondasTrustTrendChart.tsx`
- `src/components/ops/rondas/RondasCentroIaClient.tsx`
- `src/components/ops/rondas/IaUmbralesConfig.tsx`
- `src/components/ops/rondas/IaRecommendations.tsx`

### Components — Portal (Guard-facing, 18 archivos)

- `src/components/portal/rondas/RondasPortalClient.tsx` — State machine principal
- `src/components/portal/rondas/LoginScreen.tsx` — Auth RUT+PIN
- `src/components/portal/rondas/MisRondas.tsx` — Lista de rondas
- `src/components/portal/rondas/RondaActiva.tsx` — Ejecucion activa
- `src/components/portal/rondas/RondaProgress.tsx` — Progreso
- `src/components/portal/rondas/RondaCompletada.tsx` — Resumen final
- `src/components/portal/rondas/RondaMap.tsx` — Leaflet map
- `src/components/portal/rondas/CheckpointMarker.tsx` — Bottom sheet marcacion
- `src/components/portal/rondas/QrScanner.tsx` — Scanner QR
- `src/components/portal/rondas/PanicoModal.tsx` — Panico 3s countdown
- `src/components/portal/rondas/ReportarIncidente.tsx` — Incidentes
- `src/components/portal/rondas/PhotoCapture.tsx` — Captura foto
- `src/components/portal/rondas/PortalBottomNav.tsx` — Nav inferior
- `src/components/portal/rondas/PortalPerfil.tsx` — Perfil
- `src/components/portal/rondas/ChatRondasSection.tsx` — Chat
- `src/components/portal/rondas/ServiceWorkerRegistrar.tsx` — PWA
- `src/components/portal/rondas/InstallBanner.tsx` — PWA install
- `src/components/portal/rondas/leaflet-setup.ts`

### Library & Business Logic

- `src/lib/validations/rondas.ts` — Zod schemas
- `src/lib/rondas-offline.ts` — Soporte offline
- `src/lib/rondas/trust-score.ts` — Trust score v1 (por checkpoint)
- `src/lib/rondas/trust-score-v2.ts` — Trust score v2 (por ronda completa)
- `src/lib/rondas/alert-engine.ts` — Motor de alertas automaticas
- `src/lib/rondas/geo-utils.ts` — Haversine, geofence validation
- `src/lib/rondas/anomaly-detection.ts` — Deteccion anomalias
- `src/lib/rondas/schedule-engine.ts` — Generacion de slots horarios
- `src/lib/rondas/guardia-assignment.ts` — Asignacion de guardia por turno
- `src/lib/rondas/ia-config.ts` — Configuracion IA
- `src/lib/rondas/timezone.ts` — Manejo timezone Chile

---

## 2. Schema de Base de Datos

### Modelo principal: OpsRondaEjecucion

```
OpsRondaProgramacion (horarios)
        │
        ▼
OpsRondaTemplate (plantilla) ──── OpsRondaCheckpoint (vincula template↔checkpoint)
        │                                    │
        ▼                                    ▼
OpsRondaEjecucion (ejecucion) ◄───── OpsCheckpoint (punto fisico)
        │                                    │
        ├── OpsMarcacionCheckpoint           ├── OpsCheckpointTask (tareas)
        │       └── OpsCheckpointTaskResponse│
        ├── OpsAlertaRonda (alertas)         │
        ├── OpsRondaIncidente (incidentes)   │
        └── OpsControlNocturnoRonda          │
                                             │
OpsGuardia ─────────────────────────────────┘
CrmInstallation ────────────────────────────┘
OpsMonitoreoTurno (turno del operador central)
OpsPatrullajeSesion (sesion del guardia)
```

### Modelos detallados:

**OpsRondaTemplate** — Plantilla de ronda por instalacion
- `orderMode`: "strict" (orden fijo) | "flexible" (cualquier orden)
- `estimatedDurationMin`: duracion estimada
- `qrRequerido`: obliga QR en checkpoints

**OpsRondaProgramacion** — Horario de generacion
- `diasSemana`: JSON array [0-6] (dias de la semana Chile)
- `horaInicio`/`horaFin`: "HH:mm" hora Chile
- `frecuenciaMinutos`: default 120 (cada 2h)
- `toleranciaMinutos`: default 10 (margen para alerta)

**OpsRondaEjecucion** — Instancia de ronda ejecutada
- `status`: pendiente | en_curso | completada | incompleta | no_realizada
- `isAdHoc`: true para rondas libres sin template
- `trustScore`: 0-100 score final
- `trustBreakdown`: JSON con detalle por factor
- `isOfflineSync`: marcada desde offline

**OpsCheckpoint** — Punto fisico de control
- `geoRadiusM`: radio geofence (default 30m)
- `verificationType`: QR | GEOFENCE | BOTH
- `isCritical`: checkpoint critico

**OpsCheckpointTask** — Tarea en checkpoint
- `type`: boolean | checklist | select | text | number | photo
- `options`: JSON array para select/checklist
- `config`: JSON con min/max/minPhotos/alertOnValue

**OpsMarcacionCheckpoint** — Marcacion individual
- `geoValidada`: dentro del geofence
- `geoDistanciaM`: distancia real al checkpoint
- `speedFromPrevKmh`: velocidad desde marcacion anterior
- `hashIntegridad`: hash anti-tampering
- `anomalias`: JSON con anomalias detectadas
- `verificationMethod`: QR | GEOFENCE | BOTH

**OpsAlertaRonda** — Alerta generada
- `tipo`: breach_geocerca | guardia_estatico | velocidad_anomala | checkpoint_saltado | ronda_no_iniciada | panico
- `severidad`: info | warning | critical
- Dos etapas: acknowledge → resolve

**OpsRondaIncidente** — Incidente reportado por guardia
- `tipo`: panico | incendio | fuga_agua | acceso_forzado | persona_sospechosa | falla_electrica | otro

**OpsMonitoreoTurno** — Turno del operador central
- `status`: active | completed
- `aiSummary`: resumen generado al cerrar
- `emailSentTo`: emails destinatarios (sin envio real implementado)

---

## 3. Pagina de Monitor (`/ops/rondas/monitoreo`)

### Arquitectura:

```
page.tsx (server) → fetch datos → RondasMonitoreoClient (client)
                                      ├── MonitoreoTurnoHeader
                                      ├── MonitoreoMap (Google Maps)
                                      ├── MonitoreoGuardPanel
                                      ├── PanicAlertBanner
                                      └── CerrarTurnoModal
```

### Flujo de datos:

1. **Server page** valida auth, fetch rondas activas/upcoming/missed, cuenta alertas
2. **Client** recibe datos iniciales como props
3. **Polling cada 10s**: GET `/api/ops/rondas/monitoreo` + GET `/api/ops/rondas/alertas?open=true`
4. **Pusher WebSocket**: suscripcion a `monitoreo-${tenantId}:alerta-panico` para alertas criticas

### MonitoreoMap (Google Maps):
- Tema oscuro hardcodeado (no toggle dia/noche)
- Marcadores: instalaciones (cyan), guardias (verde/rojo), checkpoints (verde/azul/gris), alertas (rojo/naranja con pulso)
- Circulos de geofence visibles por checkpoint
- Auto-fit bounds en carga inicial
- NO hay clustering de marcadores

### MonitoreoGuardPanel:
- Cards por guardia activo
- Progreso de checkpoints (barra + %)
- Alertas activas por guardia
- Expandible: timeline de marcaciones, incidentes con fotos
- Acciones: llamar, agregar nota

### PanicAlertBanner:
- Banner fullscreen rojo animado
- Alarma audio Web Audio API (800Hz + 600Hz, repite cada 10s)
- Boton ATENDER (acknowledge)
- Link Google Maps con coordenadas
- Auto-dismiss 30s post-acknowledge

---

## 4. Sistema de Turnos

### Ciclo de vida:

```
Start Turno (POST /turno/start)
  → OpsMonitoreoTurno status="active"
  → operatorId, operatorName, startedAt
  → Solo 1 turno activo por operador

Durante turno:
  → Polling stats cada 10s (roundsCompleted, alertsGenerated)
  → Monitoreo de rondas y alertas

Close Turno (POST /turno/[id]/close)
  → Recopila datos del periodo (startedAt → now)
  → Calcula: rondas completadas/incompletas, alertas resueltas/pendientes, trust promedio
  → Genera "AI Summary" (texto formateado, NO es LLM)
  → status="completed", endedAt, stats guardados
  → emailSentTo guardado pero NO se envia email
```

**PROBLEMA:** No hay implementacion de envio de email. Los campos existen pero no se usan.

---

## 5. Sistema de Alertas

### Tipos generados automaticamente (alert-engine.ts):

| Tipo | Severidad | Trigger |
|------|-----------|---------|
| `breach_geocerca` | warning | Marcacion fuera del radio geofence |
| `guardia_estatico` | warning | Sin movimiento por X minutos |
| `velocidad_anomala` | warning | Speed > umbral entre checkpoints |
| `checkpoint_saltado` | warning | Fuera de orden en modo strict |
| `ronda_no_iniciada` | warning | No iniciada dentro de tolerancia |
| `panico` | critical | Boton manual del guardia |

### Flujo de alertas:

```
1. Post-mark (automatico):
   Guardia marca checkpoint → evaluatePostMarkAlerts()
   → Evalua: geofence, estatico, velocidad, orden
   → prisma.opsAlertaRonda.createMany()

2. Cron (check-pending):
   Cada 10 min → checkPendingRounds()
   → Busca rondas pendientes pasadas de tolerancia
   → Crea alertas "ronda_no_iniciada"

3. Panico (manual):
   Guardia presiona boton → POST /panico
   → Crea OpsRondaIncidente + OpsAlertaRonda
   → Pusher trigger: monitoreo-${tenantId}:alerta-panico
   → Monitor recibe via WebSocket → PanicAlertBanner + alarma audio
```

### Resolucion en dos etapas:
1. **Acknowledge**: isAcknowledged=true (reconocida pero no resuelta)
2. **Resolve**: resuelta=true + resolutionNotes (cerrada con notas)

### Comunicacion en tiempo real:
- **Pusher** solo para alertas de panico (criticas)
- **Polling 10s** para todo lo demas (rondas activas, alertas normales)
- No hay SSE ni Socket.io

---

## 6. Mapa y Marcadores

### Dos implementaciones:

| Aspecto | Monitor (Ops) | Portal (Guardia) |
|---------|---------------|-------------------|
| Libreria | Google Maps API | Leaflet (react-leaflet) |
| Tiles | Custom dark style | Esri ArcGIS Satellite |
| Archivo | `monitoreo-map.tsx` | `RondaMap.tsx` |
| Carga | Script tag dinamico | npm package |

### Marcadores del Monitor:

| Elemento | Color | Shape | Z-Index |
|----------|-------|-------|---------|
| Instalaciones | Cyan #06b6d4 | Pin building | 10 |
| Guardias (ok) | Verde #22c55e | Circulo grande | 100 |
| Guardias (alerta) | Rojo #ef4444 | Circulo grande | 100 |
| CP completado | Verde #22c55e | Circulo + geofence | - |
| CP activo | Azul #3b82f6 | Circulo + geofence | - |
| CP pendiente | Gris #6b7280 | Circulo + geofence | - |
| Alerta critica | Rojo #ef4444 | Triangulo + pulso | 200 |
| Alerta warning | Naranja #f97316 | Triangulo + pulso | 200 |

### Geofencing:
- **Metodo:** Distancia Haversine (radio circular, no poligonos)
- **Archivo:** `src/lib/rondas/geo-utils.ts`
- `isWithinGeoRadius(fromLat, fromLng, toLat, toLng, radiusM)` → `{ valid, distanceM }`
- Radio configurable por checkpoint: `geoRadiusM` (default 30m)
- Visualizado como circulos en el mapa

### Tema dia/noche:
- **Monitor:** Tema oscuro HARDCODEADO, no hay toggle
- **Portal:** Siempre tiles satelitales
- Las referencias a "nocturno" son del modulo Control Nocturno (separado)

### Clustering:
- **NO IMPLEMENTADO** — cada marcador individual
- Riesgo de performance con muchas instalaciones/guardias

---

## 7. Generacion de Rondas

### Metodo: Cron cada 10 minutos

**Archivo cron:** `src/app/api/cron/rondas/generar/route.ts`
**Motor:** `src/lib/rondas/schedule-engine.ts`

```
buildScheduleSlots({ from, to, diasSemana, horaInicio, horaFin, frecuenciaMinutos })
  1. Itera dia por dia desde `from` hasta `to`
  2. Filtra por diasSemana (en hora Chile)
  3. Parsea horaInicio/horaFin como hora Chile → UTC
  4. Maneja turnos nocturnos (22:00 → 06:00 siguiente)
  5. Genera slots cada frecuenciaMinutos
  6. Retorna timestamps UTC
```

### Flujo completo:
1. Fetch OpsRondaProgramacion activas
2. Pre-carga ejecuciones existentes (evita duplicados)
3. Por cada programacion: buildScheduleSlots() → filtra existentes → crea nuevas
4. Por cada slot nuevo: resuelve guardia → crea OpsRondaEjecucion (pendiente)

### Por que hay rondas cada 10 min:
- Si `frecuenciaMinutos=10` en la programacion, generara una ronda cada 10 minutos
- El cron corre cada 10 min pero la frecuencia real depende de la configuracion
- Default: 120 min (cada 2 horas)

### Otro cron: `cerrar-atrasadas`
- Cierra automaticamente rondas pendientes que pasaron su ventana temporal

### Timezone:
- Todo en Chile time (America/Santiago), DST-aware via date-fns-tz
- BD almacena UTC

---

## 8. Trust Score

### Version 1 — Por checkpoint (`trust-score.ts`):

| Factor | Peso | Condicion |
|--------|------|-----------|
| Geo validada | 30% | Dentro del geofence |
| Speed ok | 20% | Velocidad < umbral |
| Has movement | 15% | Movimiento detectado |
| Has photo | 15% | Foto de evidencia |
| Same device | 10% | Mismo dispositivo |
| Battery ok | 10% | Battery > 10% |

Bandas: green (>=80), yellow (>=60), red (<60)

### Version 2 — Por ronda completa (`trust-score-v2.ts`):

| Factor | Peso | Calculo |
|--------|------|---------|
| Completion | 30% | marcaciones_completadas / total_checkpoints |
| Time | 20% | Desviacion vs estimatedDurationMin |
| Speed consistency | 20% | CV de intervalos entre marcaciones |
| Sequence | 15% | Orden correcto (solo modo strict) |
| Punctuality | 15% | scheduledAt vs startedAt con tolerancia |

### Uso:
- **v1**: Real-time, calculado al marcar cada checkpoint
- **v2**: Al completar ronda, scoring final almacenado en `trustScore` + `trustBreakdown`

---

## 9. Portal del Guardia

### Pantallas:
```
Login (RUT+PIN) → Mis Rondas → Ronda Activa → Completada
                      │              │
                      │              ├── Marcar Checkpoint (bottom sheet)
                      │              ├── QR Scanner
                      │              └── Mapa Leaflet
                      │
                      ├── Chat
                      ├── Perfil
                      ├── Panico (modal 3s countdown)
                      └── Reportar Incidente (modal)
```

### Flujo de ejecucion:
1. **Login**: RUT + PIN → POST `/auth` → session con guardiaId, installationId, tenantId
2. **Mis Rondas**: GET `/mis-rondas` → lista del dia + boton "Ronda Libre"
3. **Iniciar**: POST `/iniciar` → status=en_curso, startedAt
4. **Marcar**: Para cada checkpoint:
   - GPS validation (geofence)
   - QR scanner (si requerido)
   - Tareas del checkpoint (boolean/text/photo/etc)
   - POST `/marcar` → geoValidada, anomalias, trustScore parcial
5. **Completar**: POST `/completar`
   - Crea marcaciones MISSED para faltantes
   - Calcula trust score final (v2)
   - status = completada | incompleta (>20% missed)
6. **Resultado**: Score, %, duracion, detalle por checkpoint

### Alertas desde portal:
- **Panico**: Boton rojo → countdown 3s → POST `/panico` → Pusher → Monitor
- **Incidente**: 6 tipos + foto + descripcion → POST `/incidente`

### Soporte offline:
- Session en localStorage (TTL 7 dias)
- Incidents pendientes en localStorage `pending-incidents`
- Marcaciones pendientes via `savePendingMark()`/`getPendingMarks()`

---

## 10. Configuracion

### Template:
- name, description, orderMode (strict/flexible)
- estimatedDurationMin, qrRequerido
- checkpoints[] con orderIndex, isRequired

### Programacion:
- diasSemana[], horaInicio, horaFin
- frecuenciaMinutos (default 120)
- toleranciaMinutos (default 10)

### Checkpoint:
- name, lat, lng, geoRadiusM, verificationType
- instrucciones, isCritical
- tasks[] con type, label, required, options, config

### Task types:
- `boolean` — Si/No
- `checklist` — Seleccion multiple
- `select` — Dropdown
- `text` — Texto libre
- `number` — Numerico (con min/max)
- `photo` — Captura foto (con minPhotos)

---

## 11. Problemas Detectados

1. **Email no implementado:** `emailSentTo`/`emailSentAt` se guardan al cerrar turno pero no hay logica de envio (ni SMTP, ni Resend, ni Nodemailer)

2. **No hay clustering de marcadores:** Todos los marcadores se renderizan individualmente. Con muchas instalaciones/guardias puede causar problemas de performance

3. **Tema oscuro hardcodeado en monitor:** No hay toggle dia/noche, siempre dark. Las referencias a "nocturno" son del modulo Control Nocturno (separado)

4. **Panico sin ejecucion activa:** Si el guardia no tiene ronda activa, la API podria no crear la alerta critica (bug conocido, fix en design doc)

5. **IA config sin uso real:** `ia-config.ts` existe pero `alert-engine.ts` usa umbrales hardcodeados, no lee la configuracion dinamica

6. **Cron check-pending trigger no claro:** `checkPendingRounds()` esta definida pero su schedule/trigger no es obvio en el codigo

7. **Bottom nav tapa contenido:** `pb-24` insuficiente con safe-area-inset-bottom (fix planificado)

8. **Duplicacion API public/portal:** Existen rutas casi identicas en `/api/public/ronda/` y `/api/portal/rondas/` — posible codigo duplicado

9. **Campo alertas deprecado:** `OpsRondaEjecucion.alertas` (JSON) esta marcado como DEPRECATED pero aun existe, deberia usar la relacion `alertasRows`

10. **No hay rate limiting:** Los endpoints de panico y marcacion no tienen rate limiting, un guardia podria spamear alertas
