# BRIEF DE IMPLEMENTACIÓN — MÓDULO CÁMARAS (Fase 1: visualización en vivo)

## 1. Objetivo

Permitir que un tenant registre cámaras IP (Hikvision, Dahua, otras ONVIF/RTSP) en cada instalación y las visualice en vivo desde OPAI web: en la ficha de la instalación (tab "Cámaras") y en un video wall `/ops/camaras` con selector de cliente/instalación, grilla 1/4/9/16 y páginas guardadas por operador. El video no pasa por Vercel: OPAI configura un relay externo (go2rtc en VPS, ya operativo como `media.opai.cl`) y emite tokens de corta vida para que el navegador consuma el stream directamente. Base para fase 2 (grabaciones, eventos, analítica).

## 2. Contexto actual (verificado en `main` a70a689)

- No existe ningún modelo, ruta ni componente de cámaras. Los únicos usos de "camera" son captura móvil (Capacitor) y OCR.
- Módulos por tenant: `ALL_MODULES` + `PLAN_MODULES` en `src/lib/tenant-modules.ts`; guard de ruta en `src/lib/tenant-module-routes.ts`; helper `requireTenantModule()` en `src/lib/require-module.ts`.
- Permisos: catálogo de submódulos `ops.*` en `src/lib/permissions.ts` (lista de submodules ~L60-75, catálogo `{ key: "ops.x", ... }` ~L285-300, mapeo pathname→submódulo ~L1182 y ~L1316). Navegación en `src/lib/nav/registry.ts` (bloque Ops ~L735-765).
- Ficha instalación: `src/components/crm/CrmInstallationDetailClient.tsx` define `tabs: EntityTab[]` (~L2492) y renderiza por `activeTab` (~L3139-3230). Patrón de tab existente: `InstalacionRondasTab.tsx` (client component que hace fetch a `/api/...`).
- APIs: patrón `requireTenantModule` → `requireAuth` → `ensure*Access` → zod → prisma (ej. `src/app/api/ops/inventario/phone-lines/route.ts`). Helpers en `src/lib/api-auth.ts`.
- Cifrado disponible: `encryptText/decryptText(payload, secret)` AES-256-GCM en `src/lib/crypto.ts`.
- Módulo `ops_inventario` es la referencia más cercana (add-on con ruta propia + API + permisos).
- Migraciones: `prisma/migrations/` (456 carpetas); en local se usa `db push`, nunca `migrate deploy` ni `npm run build`.

## 3. Problema o necesidad

OPAI no tiene forma de conectar ni mostrar cámaras. Los tenants usan apps del fabricante fuera de OPAI, sin vínculo con instalaciones, turnos ni monitoreo.

## 4. Causa raíz

### Hechos confirmados
- Funcionalidad inexistente; no hay deuda previa que corregir.
- Vercel no puede mantener streams: la conversión RTSP→WebRTC debe ocurrir en el relay externo (go2rtc). OPAI actúa como plano de control (configura streams, emite tokens) y nunca como plano de datos.

## 5. Comportamiento esperado

1. En la instalación, un usuario con permiso edita cámaras: alta guiada (tipo NVR/cámara → marca → host/puerto/canal/credencial → probar → guardar), edición, baja lógica, estado (online/offline/sin_probar).
2. Al guardar, OPAI registra el stream en el relay vía su API admin (`PUT /api/streams`) con nombre `t{tenantShort}_{camaraId}` y source RTSP construido desde el perfil de marca. Credenciales se guardan cifradas en OPAI; en el relay quedan solo dentro de la URL RTSP del stream (el relay es infraestructura propia).
3. "Probar conexión" pide al relay un snapshot (`/api/frame.jpeg?src=...`) y muestra la imagen; actualiza `status` y `lastSeenAt`.
4. Tab "Cámaras": grilla de tiles con snapshot/live, nombre, marca, estado; click abre visor grande.
5. `/ops/camaras`: video wall. Selector de cliente → instalaciones (multi), grilla 1/4/9/16, "páginas" (layouts) guardadas por usuario con nombre; ciclado automático opcional (cada N s cambia de página). Tile: live WebRTC con fallback MSE, badge offline, botón fullscreen.
6. Para reproducir, el navegador pide a OPAI `POST /api/ops/camaras/relay-token` con `cameraIds[]`; OPAI valida tenant/permisos y devuelve JWT HS256 (exp 10 min, claims `tenantId`, `streams[]`). El navegador abre `wss://media.opai.cl/api/ws?src=<stream>&token=<jwt>` (MSE) o WHEP `POST /api/webrtc?src=...&token=...`. El relay valida el token contra `GET /api/ops/camaras/relay/verify` (forward_auth de Caddy).
7. PTZ (solo si `ptzCapable`): botones ↑↓←→ zoom ± en el visor; `POST /api/ops/camaras/[id]/ptz` ejecuta ONVIF ContinuousMove/Stop desde el servidor OPAI contra `onvifPort`. Best effort: si la cámara no expone ONVIF por internet, se muestra "PTZ no disponible".

## 6. Usuarios y permisos involucrados

- Nuevo submódulo `ops.camaras` (view/edit). Ver: operadores de monitoreo, supervisores, admin. Editar (alta/baja/credenciales): admin y quien tenga edit.
- Nueva capability `camaras_configure` (alta/edición/credenciales) — misma semántica que `rondas_configure`.
- Tenant module `ops_camaras` (add-on), incluido en plan `enterprise`; Gard debe tenerlo habilitado.
- Portal cliente: excluido de esta fase.

## 7. Alcance

### Incluido
- Schema: `OpsCamara`, `OpsCamaraLayout` (schema `ops`).
- Perfiles por marca (`src/lib/camaras/brand-profiles.ts`).
- Cliente del relay (`src/lib/camaras/relay-client.ts`) + JWT (`relay-token.ts`).
- API CRUD, test, relay-token, relay/verify, ptz, layouts.
- Tab "Cámaras" en instalación + asistente de alta.
- Página `/ops/camaras` (wall) + componentes.
- Módulo, permisos, nav, guard de rutas.
- Variables de entorno y documentación en `CLAUDE.md`.

### Excluido (fase 2+)
- Grabaciones/playback, clips a R2, eventos de cámara, analítica, alertas en Monitoreo, portal cliente, CPQ, conector Hik-Partner Pro, bridge físico, app nativa.

## 8. Arquitectura relevante

```
Navegador ──(1) POST /api/ops/camaras/relay-token──► OPAI (Vercel)
Navegador ──(2) ws/webrtc + token───────────────────► Caddy@media.opai.cl
Caddy ──(3) forward_auth GET /api/ops/camaras/relay/verify?token=…──► OPAI
Caddy ──(4) proxy──► go2rtc ──(5) RTSP──► NVR/cámara del cliente
OPAI ──(admin, server-side) PUT/DELETE /api/streams (header X-Relay-Admin)──► Caddy ──► go2rtc
```

Nuevo directorio `src/lib/camaras/` (todo < 150 líneas por archivo):
- `brand-profiles.ts`: `BRAND_PROFILES: Record<Brand, { rtspPort, onvifPort, mainPath(ch), subPath(ch), snapshotPath?, ptzViaOnvif }>` para `hikvision`, `dahua`, `uniview`, `tplink_vigi`, `hanwha`, `axis`, `generic`. `buildRtspUrl(camara, plain)`.
- `credentials.ts`: `encryptCameraSecret/decryptCameraSecret` usando `encryptText` con env `CAMERA_CREDENTIALS_SECRET` (fail-closed igual que `getGmailTokenSecret`).
- `relay-client.ts`: `upsertStream(name, src)`, `removeStream(name)`, `fetchSnapshot(name)`; usa `MEDIA_RELAY_URL` + header `X-Relay-Admin: MEDIA_RELAY_ADMIN_TOKEN`; timeout 8 s.
- `relay-token.ts`: `signRelayToken({tenantId, streams, userId})` / `verifyRelayToken(token)` con `jose` (ya en deps de NextAuth v5) y `MEDIA_RELAY_JWT_SECRET`.
- `stream-name.ts`: `streamNameFor(tenantId, camaraId)` determinista, sin caracteres especiales.
- `onvif-ptz.ts`: `ptzMove(camara, {pan,tilt,zoom})` / `ptzStop` con paquete `onvif` (npm, nueva dependencia justificada) o SOAP manual mínimo.
- `access.ts`: `ensureCamarasView(ctx)`, `ensureCamarasEdit(ctx)` (mismo patrón que `ensureInventarioAccess`).

## 9. Archivos relevantes

| Archivo | Función actual | Acción requerida |
|---|---|---|
| `prisma/schema.prisma` | Schema único multi-schema | Modificar: agregar `OpsCamara`, `OpsCamaraLayout`, relación en `CrmInstallation` |
| `prisma/migrations/<ts>_ops_camaras/migration.sql` | — | Archivo nuevo propuesto (aditivo) |
| `src/lib/tenant-modules.ts` | Catálogo módulos/planes | Modificar: `"ops_camaras"` en `ALL_MODULES` (sección Add-ons) y en `enterprise` |
| `src/lib/tenant-module-routes.ts` | Prefijos ruta→módulo | Modificar: `/ops/camaras`, `/api/ops/camaras` → `ops_camaras` |
| `src/lib/permissions.ts` | Submódulos, capabilities, mapeo rutas | Modificar: submodule `camaras`, entrada `ops.camaras`, capability `camaras_configure`, mapeos `/ops/camaras` y `/api/ops/camaras` |
| `src/lib/nav/registry.ts` | Navegación | Modificar: item `ops-camaras` (`/ops/camaras`, icon `Video`, `tenantModule: "ops_camaras"`) |
| `src/lib/__tests__/tenant-modules.test.ts`, `tenant-module-routes.test.ts` | Tests de catálogo | Modificar si enumeran módulos explícitamente |
| `src/lib/camaras/*.ts` (7 archivos listados en §8) | — | Archivos nuevos propuestos |
| `src/app/api/ops/camaras/route.ts` | — | Nuevo: GET (lista por `installationId` o todas del tenant, con `accountId`), POST (crear) |
| `src/app/api/ops/camaras/[id]/route.ts` | — | Nuevo: PATCH, DELETE (baja lógica + `removeStream`) |
| `src/app/api/ops/camaras/[id]/test/route.ts` | — | Nuevo: POST prueba conexión → snapshot base64 + status |
| `src/app/api/ops/camaras/[id]/ptz/route.ts` | — | Nuevo: POST `{action: "move"|"stop", pan, tilt, zoom}` |
| `src/app/api/ops/camaras/relay-token/route.ts` | — | Nuevo: POST `{cameraIds[]}` → `{token, relayUrl, streams: {cameraId: streamName}}` |
| `src/app/api/ops/camaras/relay/verify/route.ts` | — | Nuevo: GET público (sin sesión), lee token de query o `X-Forwarded-Uri`, 200/401 |
| `src/app/api/ops/camaras/layouts/route.ts` + `[id]/route.ts` | — | Nuevo: CRUD layouts del usuario |
| `src/app/(app)/ops/camaras/page.tsx` | — | Nuevo: server page con auth + `canView(perms,"ops","camaras")` + `requireTenantModule` |
| `src/components/ops/camaras/CamarasWallClient.tsx` | — | Nuevo: contenedor wall (selector, grilla, páginas, ciclado) |
| `src/components/ops/camaras/CamaraTile.tsx` | — | Nuevo: tile con estado y fullscreen |
| `src/components/ops/camaras/CamaraPlayer.tsx` | — | Nuevo: player WebRTC/MSE (hook `useRelayStream`) |
| `src/components/ops/camaras/useRelayStream.ts` | — | Nuevo: WHEP POST → fallback `ws` MSE; reconexión; renueva token al expirar |
| `src/components/ops/camaras/CamaraPtzControls.tsx` | — | Nuevo |
| `src/components/ops/camaras/CamaraFormDialog.tsx` | — | Nuevo: asistente de alta/edición (5 pasos) |
| `src/components/ops/camaras/CamaraLayoutBar.tsx` | — | Nuevo: guardar/cargar páginas |
| `src/components/crm/InstalacionCamarasTab.tsx` | — | Nuevo: tab de instalación (usa `CamaraTile` + `CamaraFormDialog`) |
| `src/components/crm/CrmInstallationDetailClient.tsx` | Ficha instalación | Modificar: tab `{ id: "camaras", label: "Cámaras", icon: Video }` tras `rondas`; render condicionado a módulo `ops_camaras` |
| `.env.example` | Variables | Modificar: `CAMERA_CREDENTIALS_SECRET`, `MEDIA_RELAY_URL`, `MEDIA_RELAY_ADMIN_TOKEN`, `MEDIA_RELAY_JWT_SECRET`, `NEXT_PUBLIC_MEDIA_RELAY_URL` |
| `CLAUDE.md` | Reglas del repo | Modificar: sección breve "Cámaras / relay" |

## 10. Plan de implementación

Bloque 1 — Schema y catálogo (1 commit)
1. Agregar modelos (§12) y relación `opsCamaras OpsCamara[]` en `CrmInstallation`.
2. Migración aditiva SQL; `npx prisma generate`.
3. `ops_camaras` en `tenant-modules.ts`, `tenant-module-routes.ts`; submódulo/capability/mapeos en `permissions.ts`; nav item. Ajustar tests de catálogo si fallan.
4. Gate: `npx prisma generate && npx tsc --noEmit`.

Bloque 2 — Librería `src/lib/camaras` (1 commit)
5. `brand-profiles.ts` con rutas verificadas: Hikvision `/Streaming/Channels/{ch}01|02` (rtsp 554, onvif 80), Dahua `/cam/realmonitor?channel={ch}&subtype=0|1` (554, onvif 80), Uniview `/media/video1|2` (554, 80), TP-Link VIGI `/stream1|2` (554, 2020), Hanwha `/profile2|3/media.smp` (554, 80), Axis `/axis-media/media.amp` (554, 80), generic (usuario escribe path).
6. `credentials.ts`, `relay-client.ts`, `relay-token.ts` (HS256, exp 600 s, claims `tid`, `s: string[]`, `uid`), `stream-name.ts`, `access.ts`, `onvif-ptz.ts`.
7. Tests unitarios: `brand-profiles.test.ts` (URLs por marca), `relay-token.test.ts` (firma/verificación/expiración/stream no autorizado).
8. Gate.

Bloque 3 — API (1 commit)
9. Rutas de §9. Todas: `requireTenantModule("ops_camaras")` → `requireAuth` → `ensureCamarasView|Edit` → zod. Filtrar por `tenantId` en cada query; verificar que `installationId` pertenezca al tenant antes de crear.
10. POST crear: cifrar `password`, `upsertStream` en relay; si el relay falla, guardar igual con `status: "error"` y devolver warning (no bloquear alta).
11. `test`: `fetchSnapshot` → actualiza `status`/`lastSeenAt` → devuelve `dataUrl`.
12. `relay-token`: valida que todas las cámaras sean del tenant y activas; devuelve token.
13. `relay/verify`: sin auth de sesión; `verifyRelayToken`; comprobar `src` de `X-Forwarded-Uri` ∈ claims `s`; responder 200 vacío o 401. Rate limit simple por IP (memoria) opcional.
14. Gate.

Bloque 4 — UI instalación (1 commit)
15. `InstalacionCamarasTab` + `CamaraFormDialog` (pasos: tipo → marca → conexión → probar → confirmar). Estados: loading, vacío ("Sin cámaras. Agregar"), error, sin permiso edit (solo lectura), sin módulo (tab oculto).
16. Insertar tab en `CrmInstallationDetailClient.tsx`. Solo DS v3 tokens.
17. Gate + revisión visual.

Bloque 5 — Video wall (1 commit)
18. Página `/ops/camaras` + `CamarasWallClient`, `CamaraTile`, `CamaraPlayer`, `useRelayStream`, `CamaraLayoutBar`, `CamaraPtzControls`.
19. `useRelayStream`: intenta WHEP (`POST ${relay}/api/webrtc?src=&token=` con SDP offer, ICE servers: STUN público); si falla en 4 s, MSE por `ws`. Al recibir 401 o a los 9 min, pide token nuevo. Al desmontar cierra todo.
20. Máx. 16 streams simultáneos; los tiles fuera de viewport no conectan (IntersectionObserver).
21. Gate + revisión visual desktop y iPad.

Bloque 6 — Docs y cierre (1 commit)
22. `.env.example`, `CLAUDE.md`, habilitar `ops_camaras` para Gard vía UI/seed existente de módulos (no SQL manual).
23. Gate final; diff completo.

## 11. Requisitos de interfaz y responsive

- Wall: uso principal desktop/iPad; en móvil degradar a 1 columna, sin ciclado. Barra superior: selector cliente (combobox), chips de instalaciones, selector grilla, selector página, botón ciclado. Cuerpo: grilla `aspect-video`, tiles con nombre e instalación en overlay, badge `offline`.
- Visor grande: modal fullscreen con PTZ (si aplica), botón snapshot.
- Tab instalación: grilla de cards 2–3 columnas; en móvil 1 columna; botón "Agregar cámara" (primario) visible solo con edit.
- Touch targets ≥ 44 px en PTZ.
- Tokens DS v3 (`--ds-*`, `bg-status-*`), tipografías del sistema; sin hex.

## 12. Requisitos de datos

```prisma
model OpsCamara {
  id             String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId       String   @map("tenant_id")
  installationId String   @map("installation_id") @db.Uuid
  name           String
  sourceType     String   @default("nvr")        // "nvr" | "camera"
  brand          String   @default("generic")    // ver BRAND_PROFILES
  host           String                          // IP pública o DDNS
  rtspPort       Int      @default(554) @map("rtsp_port")
  onvifPort      Int?     @map("onvif_port")
  channel        Int      @default(1)
  streamQuality  String   @default("sub") @map("stream_quality") // "main" | "sub"
  customPath     String?  @map("custom_path")   // solo brand generic
  username       String
  passwordEnc    String   @map("password_enc")  // encryptText(CAMERA_CREDENTIALS_SECRET)
  ptzCapable     Boolean  @default(false) @map("ptz_capable")
  streamName     String   @unique @map("stream_name")
  status         String   @default("untested")  // "untested" | "online" | "offline" | "error"
  lastSeenAt     DateTime? @map("last_seen_at") @db.Timestamptz(6)
  lastError      String?  @map("last_error")
  isActive       Boolean  @default(true) @map("is_active")
  sortOrder      Int      @default(0) @map("sort_order")
  notes          String?
  createdBy      String?  @map("created_by")
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  installation   CrmInstallation @relation(fields: [installationId], references: [id], onDelete: Cascade)
  @@index([tenantId], map: "idx_ops_camara_tenant")
  @@index([installationId, isActive], map: "idx_ops_camara_inst_active")
  @@map("camaras")
  @@schema("ops")
}

model OpsCamaraLayout {
  id        String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId  String   @map("tenant_id")
  userId    String   @map("user_id")
  name      String
  gridSize  Int      @default(4) @map("grid_size")   // 1 | 4 | 9 | 16
  cameraIds Json     @default("[]") @map("camera_ids") @db.JsonB
  sortOrder Int      @default(0) @map("sort_order")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  @@index([tenantId, userId], map: "idx_ops_camara_layout_tenant_user")
  @@map("camaras_layouts")
  @@schema("ops")
}
```

- `passwordEnc` nunca se devuelve en GET; PATCH acepta `password` opcional (vacío = conservar).
- Baja: `isActive=false` + `removeStream`; no borrado físico.
- `cameraIds` de layouts se filtran al cargar contra cámaras activas del tenant (ids huérfanos se ignoran).

## 13. API e integraciones

- Relay go2rtc (infra externa, ya desplegada): admin `PUT /api/streams?name=&src=` y `DELETE /api/streams?name=` (protegidas por Caddy con header `X-Relay-Admin`), snapshot `GET /api/frame.jpeg?src=`, WHEP `POST /api/webrtc?src=`, MSE `GET /api/ws?src=`. Caddy hace `forward_auth` a `${APP_URL}/api/ops/camaras/relay/verify` para todo lo que no sea admin.
- Env: `MEDIA_RELAY_URL` (server), `NEXT_PUBLIC_MEDIA_RELAY_URL` (cliente), `MEDIA_RELAY_ADMIN_TOKEN`, `MEDIA_RELAY_JWT_SECRET`, `CAMERA_CREDENTIALS_SECRET`.
- Nueva dependencia: `onvif` (npm) solo si PTZ se implementa con la librería; alternativa SOAP manual sin dependencia. Decidir en Claude Code según tamaño; reportar.

## 14. Seguridad y segregación

- Todas las rutas: módulo + sesión + permiso + `tenantId` en `where`. `installationId` y `cameraIds` se validan contra el tenant antes de cualquier acción.
- Credenciales: cifradas en reposo; nunca en respuestas ni logs; `lastError` se sanitiza (sin URL RTSP completa).
- Tokens de relay: HS256, 10 min, scoped a streams concretos; `relay/verify` es el único endpoint sin sesión y solo responde 200/401.
- Admin del relay solo server-side; `MEDIA_RELAY_ADMIN_TOKEN` nunca llega al cliente.
- Nombres de stream no revelan tenant legible (hash corto de tenantId + id cámara).
- PTZ requiere permiso view; registrar en `createOpsAuditLog` (`src/lib/ops`) las acciones de alta/baja/cambio de credenciales.

## 15. Casos límite

- Relay caído: alta se guarda con `status: "error"`; wall muestra tiles "Relay no disponible"; test devuelve mensaje claro.
- Cámara con IP dinámica (DDNS) que cambia: el stream sigue apuntando al host; `test` refresca estado.
- Credencial con caracteres especiales: URL-encode usuario/clave al construir RTSP.
- Dos cámaras mismo host/canal en distinta instalación: permitido; `streamName` sigue siendo único por cámara.
- Token expira mientras se mira: renovación silenciosa sin cortar el video (renegociar solo si el socket cae).
- Layout con 16 tiles en red lenta: conexiones progresivas (máx 4 simultáneas iniciando).
- Usuario sin módulo `ops_camaras`: nav oculto, tab oculto, API 403.
- Tenant desactiva una cámara mientras otro operador la ve: siguiente renovación de token falla → tile pasa a "no disponible".

## 16. Validación

- `npx prisma generate && npx tsc --noEmit` tras cada bloque.
- `npm run lint` (o el script del repo) y `node check-design-system.mjs` sobre archivos nuevos.
- Tests unitarios nuevos (§10 paso 7) + suite existente de `tenant-modules` y `tenant-module-routes`.
- Prueba manual con `MEDIA_RELAY_URL` apuntando a `media.opai.cl` y la cámara de oficina: alta, test, tab, wall con 1 y 4 tiles, PTZ si aplica, expiración de token, baja.
- Revisión visual desktop e iPad; móvil solo degradación correcta.
- Revisión de permisos: usuario sin `ops.camaras` no ve nav/tab y recibe 403.

## 17. Criterios de aceptación

- [ ] Tenant con `ops_camaras` ve tab "Cámaras" en instalación y `/ops/camaras` en nav; sin el módulo, nada de eso existe ni por URL.
- [ ] Alta guiada por marca genera la URL RTSP correcta (verificada por test unitario para las 7 marcas).
- [ ] "Probar conexión" muestra snapshot real y actualiza estado.
- [ ] Wall reproduce en vivo hasta 16 cámaras, con fallback MSE si WebRTC falla, y guarda/carga páginas por usuario.
- [ ] Ningún endpoint devuelve la clave de la cámara; la BD la almacena cifrada.
- [ ] Token de relay rechazado si expira, si el stream no está en sus claims o si la cámara está inactiva.
- [ ] Queries filtran por `tenantId`; cámara de otro tenant → 404.
- [ ] Sin hex hardcodeados; archivos < 150 líneas; typecheck y tests en verde.

## 18. Riesgos y rollback

- Dependencia de infra externa (relay): el módulo degrada con mensajes claros; el resto de OPAI no se ve afectado. Rollback: deshabilitar `ops_camaras` en el tenant; las tablas nuevas son aditivas y pueden quedar.
- Exposición de puertos en redes de clientes: mitigado con usuario de solo visualización (guía en el asistente) y sin credenciales `admin` recomendadas; el asistente advierte si el usuario ingresa `admin`.

## 19. Instrucción final para Claude Code

Implementa este brief en el repositorio de OPAI.

Antes de editar:

1. Lee el `CLAUDE.md` del repositorio.
2. Verifica los archivos indicados.
3. Revisa dependencias directas.
4. Confirma los hechos técnicos del brief.

El repositorio es la fuente final de verdad. Si contradice un detalle del brief, conserva el objetivo funcional, adapta la implementación y reporta la diferencia.

Implementa la solución completa en los 6 bloques indicados, con `npx prisma generate && npx tsc --noEmit` antes de cada commit y un commit por bloque (autor `Claude <noreply@anthropic.com>`). No ejecutes `npm run build`, `npm ci` ni `prisma migrate deploy`. No hagas refactorizaciones no relacionadas. No ejecutes acciones destructivas ni cambios de producción sin instrucción explícita. Trabaja en rama `feat/ops-camaras-fase1`; no mergees a `main`.

Ejecuta las validaciones relevantes, corrige errores introducidos y revisa el diff final.

Al terminar informa:

- qué se implementó;
- qué archivos cambiaron;
- qué validaciones se ejecutaron;
- qué resultados se obtuvieron;
- qué riesgo o pendiente material permanece (incluida la decisión sobre la dependencia `onvif`).
