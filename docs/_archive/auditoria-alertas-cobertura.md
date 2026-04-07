# Auditoría Completa del Codebase — Módulo de Alertas de Cobertura Nacional

> **Fecha:** 2026-03-29
> **Propósito:** Pre-implementación del módulo de Alertas de Cobertura Nacional
> **Codebase:** OPAI (OPeraciones AI) — Next.js 14+ / TypeScript / Prisma / PostgreSQL

---

## 1. ESTRUCTURA DEL PROYECTO

```
/Users/caco/Desktop/Cursor/opai/
├── src/                                    [2,129 archivos]
│   ├── app/
│   │   ├── (app)/                          [Rutas principales del ERP]
│   │   │   ├── chat/                       # Sistema de mensajería
│   │   │   ├── cpq/                        # Configure Price Quote
│   │   │   ├── crm/                        # CRM (accounts, contacts, deals, leads, installations, prospecting)
│   │   │   ├── finanzas/                   # Finanzas (aprobaciones, bancos, conciliación, contabilidad, facturación, pagos)
│   │   │   ├── fiscalizacion/              # Fiscalización / auditoría DT
│   │   │   ├── hub/                        # Dashboard principal (30+ componentes)
│   │   │   ├── opai/                       # Panel admin/config
│   │   │   │   ├── configuracion/          # 20+ sub-áreas de settings
│   │   │   │   ├── documentos/
│   │   │   │   ├── perfil/
│   │   │   │   └── usuarios/
│   │   │   ├── ops/                        # Operaciones
│   │   │   │   ├── inventario/
│   │   │   │   ├── marcaciones/
│   │   │   │   ├── pautas/
│   │   │   │   ├── pauta-mensual/
│   │   │   │   ├── pauta-diaria/
│   │   │   │   ├── rondas/
│   │   │   │   ├── supervision/
│   │   │   │   ├── tickets/
│   │   │   │   ├── turnos-extra/
│   │   │   │   └── audit-pautas/
│   │   │   ├── payroll/                    # Nómina / RRHH
│   │   │   ├── personas/                   # Gestión de personal/guardias
│   │   │   ├── portales/                   # Funcionalidad portal clientes
│   │   │   ├── reportes/                   # Reportes y analytics
│   │   │   └── te/                         # Trabajo temporal
│   │   │
│   │   ├── (templates)/                    [Páginas públicas de templates]
│   │   │
│   │   ├── api/                            [Endpoints REST]
│   │   │   ├── auth/
│   │   │   ├── chat/
│   │   │   ├── config/
│   │   │   ├── configuracion/
│   │   │   ├── crm/
│   │   │   ├── cpq/
│   │   │   ├── cron/                       # 18 cron jobs
│   │   │   ├── docs/
│   │   │   ├── finance/
│   │   │   ├── fx/
│   │   │   ├── gamification/
│   │   │   ├── notifications/
│   │   │   ├── operacional/
│   │   │   ├── ops/
│   │   │   ├── payroll/
│   │   │   ├── personas/
│   │   │   ├── portal/
│   │   │   │   ├── cliente/
│   │   │   │   ├── guardia/
│   │   │   │   ├── rondas/
│   │   │   │   └── supervisor/
│   │   │   ├── public/
│   │   │   ├── te/
│   │   │   └── webhook/
│   │   │
│   │   ├── auth/                           [Páginas de auth]
│   │   └── portal/                         [6 portales PWA]
│   │       ├── acceso/
│   │       ├── cliente/
│   │       ├── guardia/
│   │       ├── marcacion/
│   │       ├── rondas/
│   │       └── supervisor/
│   │
│   ├── components/
│   │   ├── chat/
│   │   ├── cpq/
│   │   ├── crm/
│   │   ├── finance/
│   │   ├── notifications/
│   │   ├── opai/
│   │   ├── ops/
│   │   ├── payroll/
│   │   ├── portal/
│   │   ├── pwa/
│   │   └── ui/
│   │
│   ├── contexts/
│   ├── emails/                             # 15+ templates React Email
│   ├── hooks/
│   └── lib/
│       ├── access-control/
│       ├── chat-types.ts
│       ├── chat.ts
│       ├── chat-system-message.ts
│       ├── api-auth.ts
│       ├── marcacion.ts
│       ├── notification-service.ts
│       ├── notification-types.ts
│       ├── notification-prefs.ts
│       ├── ops-rbac.ts
│       ├── permissions.ts
│       ├── permissions-server.ts
│       ├── role-policy.ts
│       ├── resend.ts
│       ├── tenant-config.ts
│       ├── whatsapp-templates.ts
│       ├── ops/
│       │   └── asignaciones-logic.ts
│       ├── pwa/
│       │   ├── push-service.ts
│       │   ├── push-client.ts
│       │   └── portal-notification-types.ts
│       ├── rondas/
│       │   ├── alert-engine.ts
│       │   ├── alert-notifications.ts
│       │   └── geo-utils.ts
│       └── validations/
│           └── ops.ts
│
├── prisma/                                 [186 archivos]
│   ├── schema.prisma                       # Schema principal (~7,343 líneas)
│   ├── schema 2.prisma                     # Copia/backup
│   ├── migrations/                         # 175+ migraciones (20260205 → 20260525)
│   ├── seeds/                              # 14 scripts de inicialización
│   └── scripts/                            # SQL utilities
│
├── public/
│   ├── sw.js                               # Service worker unificado
│   ├── manifest.json                       # PWA admin
│   ├── manifest-supervisor.json
│   ├── manifest-guardia.json
│   ├── manifest-cliente.json
│   ├── manifest-acceso.json
│   ├── portal-rondas-manifest.json
│   └── offline.html
│
├── vercel.json                             # Cron jobs (16 configurados)
├── next.config.js
├── tsconfig.json
└── package.json
```

**Estadísticas:**
- **2,129** archivos en src/ (1,003 TSX + 1,121 TS + 1 CSS)
- **186** archivos en prisma/ (155+ migraciones SQL, 14 seeds)
- **175+** migraciones de base de datos
- **Multi-schema PostgreSQL:** public, payroll, fx, cpq, crm, docs, ops, finance, inventory, notes, chat, access_control, dt

---

## 2. SCHEMA PRISMA COMPLETO

### Configuración de DB
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["public", "payroll", "fx", "cpq", "crm", "docs", "ops", "finance", "inventory", "notes", "chat", "access_control", "dt"]
}
```

### 2.1 Guardia / Personal (OpsGuardia + OpsPersona)

```prisma
model OpsPersona {
  // @@map("personas")
  id                String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId          String   @db.Uuid
  firstName         String
  lastName          String
  rut               String
  email             String?
  phone             String?
  address           String?
  // Documentos
  documentos_persona OpsDocumentoPersona[]
  // Bancos
  cuentas_bancarias  OpsCuentaBancaria[]
  // Tallas
  shoe              String?
  pants             String?
  tshirt            String?
  shirt             String?
  jacket            String?
  // Salud/previsión
  afp               String?
  isapre            String?
  healthSystem      String?
  regimenPrevisional String?
  tipoPension       String?
  jubilado          Boolean @default(false)
  personalEmail     String?  // Res. 38 compliance
}

model OpsGuardia {
  // @@map("guardias") — extiende OpsPersona
  id                      String   @id @db.Uuid
  tenantId                String   @db.Uuid

  // Lifecycle
  // Estados: postulante, active, terminated, blacklisted

  // Contrato
  contractType            String?
  contractStartDate       DateTime?
  contractPeriod1End      DateTime?
  contractPeriod2End      DateTime?
  contractPeriod3End      DateTime?
  contractBecameIndefinidoAt DateTime?

  // Biometría (Face ID)
  faceIdRegistered        Boolean @default(false)
  faceIdAwsId             String?
  faceIdConsentAt         DateTime?
  faceIdConsentRevoked    Boolean @default(false)

  // PIN de Marcación
  marcacionPin            String?
  marcacionPinVisible     Boolean @default(false)

  // Uniforme
  estadoUniforme          String?
  prendasFaltantes        String[]
  notaEvaluacion          Float?

  // Jornada
  maxHorasSemanales       Int?
  tipoJornada             String?   // "ordinaria" | "excepcional"
  dtResolucionJornada     String?

  // Ubicación actual
  currentInstallationId   String?   @db.Uuid
  intendedInstallationId  String?   @db.Uuid
  intendedContractDate    DateTime?
  intendedPlanUpdatedAt   DateTime?

  // TE
  recibeAnticipo          Boolean @default(false)
  montoAnticipo           Float?

  // Estructura salarial
  salaryStructureId       String?   @db.Uuid

  // Relaciones
  asignaciones            OpsAsignacionGuardia[]
  pautaMensual            OpsPautaMensual[]       @relation("planned")
  pautaReemplazo          OpsPautaMensual[]       @relation("replacement")
  asistenciaPlanned       OpsAsistenciaDiaria[]   @relation("planned")
  asistenciaActual        OpsAsistenciaDiaria[]   @relation("actual")
  asistenciaReplacement   OpsAsistenciaDiaria[]   @relation("replacement")
  turnosExtra             OpsTurnoExtra[]
  guardEvents             OpsGuardEvent[]
  seriesAsignacion        OpsSerieAsignacion[]
}
```

### 2.2 Instalación / Sucursal / Site (CrmInstallation)

```prisma
model CrmInstallation {
  // @@map("installations")
  id                        String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId                  String   @db.Uuid
  name                      String
  address                   String?
  city                      String?
  commune                   String?
  lat                       Float?              // ← Latitud
  lng                       Float?              // ← Longitud
  geoRadiusM                Int    @default(1000) // ← Radio geofence en metros

  status                    CrmInstallationStatus  // prospect, active, inactive, suspended
  marcacionCode             String?  @unique      // Código QR 8 chars
  pairingCode               String?               // Device pairing

  teMontoClp                Float?               // Tarifa turno extra en CLP
  maxRondaDurationMinutes   Int?
  nocturnoEnabled           Boolean @default(false)
  chatEnabled               Boolean @default(false)

  startDate                 DateTime?
  endDate                   DateTime?
  metadata                  Json?                // Config adicional

  // Relaciones
  puestos                   OpsPuestoOperativo[]
  asignacionesGuardia       OpsAsignacionGuardia[]
  asignacionesSupervisor    OpsAsignacionSupervisor[]
  pautaMensual              OpsPautaMensual[]
  asistenciaDiaria          OpsAsistenciaDiaria[]
  turnosExtra               OpsTurnoExtra[]
  rondaTemplates            OpsRondaTemplate[]
  checkpoints               OpsCheckpoint[]
  accessControlConfig       AccessControlConfig?
  chatChannel               ChatChannel?
}
```

### 2.3 Asignación / Turno / Pauta

```prisma
model OpsPautaMensual {
  // @@map("pauta_mensual")
  // @@unique([puestoId, slotNumber, date])
  id                    String   @id @db.Uuid
  tenantId              String   @db.Uuid
  installationId        String   @db.Uuid
  puestoId              String   @db.Uuid
  slotNumber            Int
  date                  DateTime @db.Date

  plannedGuardiaId      String?  @db.Uuid     // Guardia designado
  replacementGuardiaId  String?  @db.Uuid     // Reemplazo
  replacementReason     String?               // vacaciones, licencia_medica, permiso
  guardEventId          String?  @db.Uuid     // Evento de ausencia vinculado

  shiftCode             String?               // "T"=trabajo, "-"=descanso, "V"=vacaciones, "L"=licencia, "PCG", "PSG"
  status                String   @default("planificado")
}

model OpsAsignacionGuardia {
  // @@map("asignacion_guardias")
  id                String   @id @db.Uuid
  tenantId          String   @db.Uuid
  guardiaId         String   @db.Uuid
  puestoId          String   @db.Uuid
  slotNumber        Int
  installationId    String   @db.Uuid
  startDate         DateTime @db.Date
  endDate           DateTime? @db.Date
  isActive          Boolean  @default(true)
  reason            String?
}

model OpsSerieAsignacion {
  // @@map("serie_asignaciones")
  // @@unique([tenantId, puestoId, slotNumber]) — una serie activa por slot
  id                String   @id @db.Uuid
  tenantId          String   @db.Uuid
  puestoId          String   @db.Uuid
  slotNumber        Int
  guardiaId         String?  @db.Uuid

  patternCode       String               // "4x4", "5x2", "7x7"
  patternWork       Int                  // Días consecutivos de trabajo
  patternOff        Int                  // Días consecutivos de descanso
  startDate         DateTime @db.Date
  startPosition     Int                  // Posición en ciclo (1-based)
  endDate           DateTime? @db.Date
  isActive          Boolean  @default(true)

  // Turno rotativo (día/noche)
  isRotativo        Boolean  @default(false)
  rotatePuestoId    String?  @db.Uuid
  rotateSlotNumber  Int?
  startShift        String?              // "day" | "night"
  linkedSerieId     String?  @db.Uuid
}

model OpsAsistenciaDiaria {
  // @@map("asistencia_diaria")
  // @@unique([puestoId, slotNumber, date])
  id                    String   @id @db.Uuid
  tenantId              String   @db.Uuid
  installationId        String   @db.Uuid
  puestoId              String   @db.Uuid
  slotNumber            Int
  date                  DateTime @db.Date

  plannedGuardiaId      String?  @db.Uuid
  actualGuardiaId       String?  @db.Uuid
  replacementGuardiaId  String?  @db.Uuid

  attendanceStatus      String   @default("pendiente")
  // "pendiente", "asistio", "no_asistio", "reemplazo", "ppc"

  checkInAt             DateTime?
  checkOutAt            DateTime?
  checkInSource         String?           // none, facial_recognition, manual
  checkOutSource        String?

  plannedShiftStart     DateTime?
  plannedShiftEnd       DateTime?
  plannedMinutes        Int?
  workedMinutes         Int?
  overtimeMinutes       Int?
  lateMinutes           Int?
  hoursCalculatedAt     DateTime?

  teGenerated           Boolean  @default(false)
  lockedAt              DateTime?
  lockedBy              String?  @db.Uuid

  // Auditoría (Res. N°38)
  deletedAt             DateTime?
  deletedBy             String?  @db.Uuid
  modifiedAt            DateTime?
  modifiedBy            String?  @db.Uuid
  isModified            Boolean  @default(false)
  modificationReason    String?

  turnosExtra           OpsTurnoExtra[]
}

model OpsTurnoExtra {
  // @@map("turnos_extra")
  id                    String   @id @db.Uuid
  tenantId              String   @db.Uuid
  asistenciaId          String?  @unique @db.Uuid   // Link a asistencia
  installationId        String   @db.Uuid
  puestoId              String?  @db.Uuid
  guardiaId             String   @db.Uuid
  date                  DateTime @db.Date

  tipo                  String                       // "turno_extra" | "hora_extra"
  horasExtra            Float?                       // Si tipo="hora_extra"
  amountClp             Float?                       // Monto en CLP
  amountJustification   String?

  status                String   @default("pending") // "pending" → "approved" → "paid"
  isManual              Boolean  @default(false)

  approvedBy            String?  @db.Uuid
  approvedAt            DateTime?
  rejectedBy            String?  @db.Uuid
  rejectedAt            DateTime?
  rejectionReason       String?
  paidAt                DateTime?
  createdBy             String?  @db.Uuid
}

model OpsPuestoOperativo {
  // @@map("puestos_operativos")
  id                String   @id @db.Uuid
  tenantId          String   @db.Uuid
  installationId    String   @db.Uuid
  name              String
  shiftStart        String?
  shiftEnd          String?
  weekdays          Int[]                // Días de la semana
  requiredGuards    Int      @default(1)
  baseSalary        Float?
  teMontoClp        Float?
  activeFrom        DateTime? @db.Date
  activeUntil       DateTime? @db.Date
}

model OpsAsignacionSupervisor {
  // @@map("asignacion_supervisores")
  // @@unique([supervisorId, installationId])
  id                String   @id @db.Uuid
  tenantId          String   @db.Uuid
  supervisorId      String   @db.Uuid    // Admin ID
  installationId    String   @db.Uuid
  isActive          Boolean  @default(true)
  startDate         DateTime? @db.Date
  endDate           DateTime? @db.Date
  notes             String?
}
```

### 2.4 Usuario / Roles / Permisos

```prisma
model Admin {
  id                String   @id @db.Uuid
  tenantId          String   @db.Uuid
  email             String   @unique
  password          String?
  name              String
  cargo             String?              // Título del cargo
  role              String   @default("admin")
  roleTemplateId    String?  @db.Uuid    // Custom role override
  status            String   @default("active")  // active, inactive, invited
  invitedBy         String?  @db.Uuid
  invitedAt         DateTime?
  activatedAt       DateTime?
  lastLoginAt       DateTime?
}

model RoleTemplate {
  // @@unique([tenantId, slug])
  id                String   @id @db.Uuid
  tenantId          String   @db.Uuid
  name              String
  slug              String
  description       String?
  isSystem          Boolean  @default(false)
  permissions       Json                 // Permisos granulares en JSON
}

model AdminGroup {
  // @@unique([tenantId, slug])
  id                String   @id @db.Uuid
  tenantId          String   @db.Uuid
  slug              String
  name              String
  description       String?
  color             String?
  isSystem          Boolean  @default(false)
  isActive          Boolean  @default(true)
  memberships       AdminGroupMembership[]
}

model AdminGroupMembership {
  id        String   @id @db.Uuid
  groupId   String   @db.Uuid
  adminId   String   @db.Uuid
  role      String   @default("member")  // member, admin
  joinedAt  DateTime @default(now())
}
```

### 2.5 Configuración / Settings del Tenant

```prisma
model Setting {
  id        String   @id @db.Uuid
  key       String   @unique
  value     String
  tenantId  String?  @db.Uuid    // NULL = global; con tenantId = per-tenant
}

model ConfigEmpresa {
  // Datos legales de la empresa
  rut               String
  razonSocial       String
  direccionPrincipal String
  representanteLegal String
  giroComercial      String
}

model ConfigJornada {
  // Ley 42 Horas
  maxHorasSemanales  Int    @default(42)
  maxHorasDiarias    Int    @default(12)
  maxHorasExtras     Int    @default(2)
  vigenciaDesde      DateTime
  vigenciaHasta      DateTime?
}
```

### 2.6 Notificaciones

```prisma
model Notification {
  id        String   @id @db.Uuid
  tenantId  String   @db.Uuid
  type      String                       // new_lead, lead_approved, quote_sent, etc.
  title     String
  message   String?
  link      String?
  data      Json?
  read      Boolean  @default(false)
  createdAt DateTime @default(now())
}

model NotificationReadState {
  userId         String   @db.Uuid
  notificationId String   @db.Uuid
  readAt         DateTime
}

model UserNotificationPreference {
  // @@unique([userId, tenantId])
  userId      String   @db.Uuid
  tenantId    String   @db.Uuid
  preferences Json                       // Mapa tipo → {bell, email}
}

model PortalNotificationPreference {
  userType    String
  userId      String
  portalType  String
  tenantId    String
  preferences Json
  enabled     Boolean @default(true)
  emailEnabled Boolean @default(false)
  smsEnabled  Boolean @default(false)
}

model ChatPushSubscription {
  id              String   @id @db.Uuid
  tenantId        String   @db.Uuid
  subscriberType  String                 // ADMIN, GUARD, CLIENT
  subscriberId    String
  endpoint        String
  p256dh          String
  auth            String
  portalType      String                 // app, cliente, guardia, rondas, supervisor, marcacion, acceso
  isActive        Boolean  @default(true)
  userAgent       String?
}

model ChatNotificationPreference {
  channelId   String
  userType    String
  userId      String
  preference  String                     // ALL, MENTIONS_ONLY, MUTED
}
```

### 2.7 Modelos adicionales relevantes para Alertas

```prisma
model OpsGuardEvent {
  // Eventos de ausencia
  id              String   @id @db.Uuid
  guardiaId       String   @db.Uuid
  category        String
  subtype         String                 // vacaciones, licencia_medica, permiso, etc.
  status          String                 // approved, pending, rejected
  startDate       DateTime @db.Date
  endDate         DateTime @db.Date
  reason          String?
}

model OpsRefuerzoSolicitud {
  // @@map("refuerzo_solicitudes") — Solicitudes de refuerzo
  id              String   @id @db.Uuid
  tenantId        String   @db.Uuid
  installationId  String   @db.Uuid
  accountId       String?  @db.Uuid
  puestoId        String?  @db.Uuid
  guardiaId       String?  @db.Uuid
  startAt         DateTime
  endAt           DateTime
  guardsCount     Int
  shiftType       String?
  rateMode        String?               // "turno" | "hora"
  rateClp         Float?
  estimatedTotalClp Float?
  status          String   @default("solicitado") // solicitado, aprobado, rechazado, facturado
  invoiceNumber   String?
  invoicedAt      DateTime?
  ticketId        String?  @db.Uuid
}

model OpsAlertaRonda {
  // Alertas de ronda (ya implementado)
  id                String   @id @db.Uuid
  rondaEjecucionId  String?  @db.Uuid
  guardiaId         String?  @db.Uuid
  type              String               // guardia_estatico, velocidad_anomala, ronda_no_iniciada
  severity          String?
  description       String?
}

model OpsAlertaLog {
  // Historial de alertas
  tipo              String
  status            String
  affectedEntity    String?
  createdAt         DateTime
}

model OpsCheckpoint {
  id              String   @id @db.Uuid
  installationId  String   @db.Uuid
  name            String
  lat             Float?
  lng             Float?
  geoRadiusM      Int    @default(30)
  verificationType String @default("GEOFENCE")
}

model AuditLog {
  id          String   @id @db.Uuid
  tenantId    String   @db.Uuid
  userId      String?
  action      String
  entityType  String
  entityId    String?
  changes     Json?
  timestamp   DateTime @default(now())
  ipAddress   String?
}
```

---

## 3. SISTEMA DE NOTIFICACIONES

### 3.1 Push Notifications (Web Push / VAPID)

**Archivos principales:**

| Archivo | Propósito |
|---------|-----------|
| `/src/lib/pwa/push-service.ts` | Servidor: envío push con web-push + VAPID |
| `/src/lib/pwa/push-client.ts` | Cliente: subscribe/unsubscribe del navegador |
| `/src/lib/pwa/portal-notification-types.ts` | Tipos de notificación por portal |
| `/public/sw.js` | Service Worker unificado (push, cache, offline) |
| `/src/app/api/notifications/push/subscribe/route.ts` | API: subscribe/unsubscribe dispositivo |
| `/src/components/pwa/PushPermissionPrompt.tsx` | UI: prompt permiso push |

**VAPID Config:**
```
VAPID_PUBLIC_KEY=<base64>
VAPID_PRIVATE_KEY=<base64>
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<base64>
Email: mailto:soporte@gardsecurity.cl
```

**Funciones clave en `push-service.ts`:**
```typescript
sendPushToPortalUser()           // Envío a usuario individual (respeta preferencias)
sendPushToAdmins()               // Broadcast a todos los admins
sendPushToSpecificAdmins()       // Envío a admins específicos
sendChatPushNotifications()      // Push de mensajes chat (respeta preferencias de canal)
syncBadgeAcrossDevices()         // Sincronizar badge count cross-device
calculateBadgeCount()            // Calcular badge count
batchCalculateBadgeCounts()      // Badge count en lote
```

**Subscripción se almacena en tabla `chatPushSubscription`:**
- endpoint, p256dh, auth keys
- subscriberType: ADMIN / GUARD / CLIENT
- portalType: app, cliente, guardia, rondas, supervisor, marcacion, acceso

**Service Worker (`sw.js`) features:**
- Push event listener con payload enriquecido
- Agrupación de notificaciones por tag (`chat-{channelId}`)
- Badge sync silencioso (`type: 'badge_sync'`)
- Detección de alerta de pánico con vibración agresiva `[500, 200, 500, 200, 500, 200, 500]`
- `navigator.setAppBadge()` para badge de app
- Click handler: marca como leída vía `PATCH /api/notifications`, navega a URL
- Re-suscripción automática cuando expira suscripción
- Cache strategy: network-first (API), cache-first (static), network-first con offline fallback (navigation)
- Precache: todos los 6 portales + login + offline.html

### 3.2 Pusher (Real-time In-App)

**Archivos:**

| Archivo | Propósito |
|---------|-----------|
| `/src/lib/chat.ts` | Singleton Pusher server, channel naming |
| `/src/components/chat/lib/chat-pusher.ts` | Singleton Pusher client |
| `/src/components/notifications/InAppNotificationProvider.tsx` | Provider de notificaciones in-app |
| `/src/app/api/chat/pusher/auth/route.ts` | Auth de canales privados |

**Canales Pusher:**
- `presence-chat-{channelId}` — Mensajes y presencia de chat
- `private-user-{tenantId}-{userType}-{userId}` — Notificaciones per-user (ADMIN/GUARD/CLIENT)
- `monitoreo-{tenantId}` — Alertas de ronda al dashboard de monitoreo

**InAppNotificationProvider:**
- Suscribe a canal privado del usuario
- Escucha evento `in-app-notification`
- Muestra toast via `sonner`
- Buffer de 1.5s para mensajes rápidos
- Reproduce sonido de notificación (`playNotificationSound("chat")`)
- Preview truncado a 200 chars

### 3.3 Email (Resend)

**Archivos:**

| Archivo | Propósito |
|---------|-----------|
| `/src/lib/resend.ts` | Config Resend + envío con config per-tenant |
| `/src/emails/NotificationEmail.tsx` | Template genérico de notificación |
| `/src/emails/PortalClienteInviteEmail.tsx` | Invitación portal cliente |
| `/src/emails/PortalProspectoInviteEmail.tsx` | Invitación prospecto |
| `/src/emails/UserInvitation.tsx` | Creación de cuenta |
| `/src/emails/SignatureRequestEmail.tsx` | Solicitud de firma |
| `/src/emails/SignatureCompletedNotifyEmail.tsx` | Firma completada |
| `/src/emails/SignatureAllCompletedEmail.tsx` | Todas las firmas completadas |
| `/src/emails/SignatureReminderEmail.tsx` | Recordatorio firma pendiente |
| `/src/emails/DocumentExpiringEmail.tsx` | Alerta vencimiento documento |
| `/src/emails/DocumentExpiredEmail.tsx` | Documento vencido |
| `/src/emails/PresentationEmail.tsx` | Presentación CPQ |
| `/src/emails/CompanyPresentationEmail.tsx` | Presentación empresa |
| `/src/emails/CpqQuoteEmail.tsx` | Cotización email |
| `/src/emails/CpqPdfEmail.tsx` | Cotización con PDF adjunto |
| `/src/emails/RegistroDemoEmail.tsx` | Confirmación registro demo |
| `/src/emails/VisitaTecnicaSupervisorEmail.tsx` | Visita técnica |
| `/src/app/api/webhook/resend/route.ts` | Webhook Resend (delivery, bounce, open, click) |
| `/src/app/api/webhook/inbound-email/route.ts` | Email inbound → chat |

**Config default:** `OPAI <opai@gard.cl>`, reply-to: `comercial@gard.cl`
**Override per-tenant** desde tabla `Setting` (cache 5 min)

### 3.4 WhatsApp

**Archivo:** `/src/lib/whatsapp-templates.ts`

- Resuelve templates desde 2 fuentes:
  1. `DocTemplate` (module=whatsapp) con contenido Tiptap y resolución de entidades
  2. Legacy `CrmWhatsAppTemplate` con placeholders `{token}`
- `getWaTemplate()` — obtener template por slug
- `resolveWaTokens()` — reemplazar tokens
- Botón de WhatsApp quick-action en NotificationBell

**No hay integración directa de envío automático** — es link a WhatsApp Web/app con template pre-llenado.

### 3.5 Notification Service (Bell + Email unificado)

**Archivos:**
- `/src/lib/notification-service.ts` — Servicio unificado
- `/src/lib/notification-types.ts` — Definición de todos los tipos
- `/src/lib/notification-prefs.ts` — Preferencias de usuario

**Funciones principales:**
```typescript
sendNotification(params)         // Envía a todos los usuarios del tenant (respeta permisos + prefs)
sendNotificationToUser(params)   // Envía a usuario específico (mentions siempre email)
sendNotificationToUsers(params)  // Envía a lista de usuarios
getEmailRecipientsForType(type)  // Obtiene lista de email por tipo de notif
```

**Tipos de notificación definidos:**

| Categoría | Tipos |
|-----------|-------|
| CRM - Leads | new_lead, lead_approved, prospect |
| CRM - General | mention, mention_direct, mention_group, note_thread_reply |
| CRM - Email | email_opened, email_clicked, email_bounced, followup_sent/scheduled/failed |
| CPQ | quote_sent, quote_viewed, quote_approved_portal, quote_rejected_portal |
| Documentos | contract_required, contract_expiring, contract_expired, document_signed_completed |
| Ops - Guardias | guardia_doc_expiring, guardia_doc_expired, new_postulacion |
| Ops - Tickets | ticket_created/approved/rejected, ticket_sla_breached/approaching, ticket_mention |
| Ops - Inventario | inventory_delivery |

**Cada tipo tiene:** key, label, module/submodule, category, defaultBell, defaultEmail

### 3.6 Alertas de Ronda (sistema existente de alertas)

**Archivos:**
- `/src/lib/rondas/alert-engine.ts` — Motor de alertas
- `/src/lib/rondas/alert-notifications.ts` — Envío de notificaciones de alertas

**Tipos de alerta:**
- `guardia_estatico` → "Guardia estático"
- `velocidad_anomala` → "Velocidad anómala"
- `ronda_no_iniciada` → "Ronda no iniciada"
- `panico` → "PÁNICO" (bypass cooldown)

**Features:**
- Push a admins via `sendPushToAdmins()`
- Mensaje al canal de Ops chat via `sendSystemChatMessage()`
- Cooldown en DB: push 2 min, chat 5 min
- Alertas de pánico bypass cooldown
- Solo pánico + cobertura van a chat

### 3.7 Tipos de Notificación por Portal

| Portal | Notificaciones |
|--------|---------------|
| **Shared** | chat_message, emergency_alert |
| **App OPAI (admin)** | ticket_needs_approval, document_expiring, lead_new, quote_accepted, ronda_alert_admin, guard_no_checkin, supervision_visit_due, expense_report_submitted, payroll_processed |
| **Portal Cliente** | ticket_created/updated, ronda_completed/alert, document_available, invoice_due |
| **Portal Guardia** | shift_reminder, schedule_change, ticket_assigned_guard, document_to_sign, inventory_delivery |
| **Portal Rondas** | ronda_assigned, ronda_overdue, checkpoint_missed, ronda_cancelled |

### 3.8 UI de Notificaciones

| Componente | Archivo |
|------------|---------|
| NotificationBell | `/src/components/opai/NotificationBell.tsx` |
| NotificationListClient | `/src/components/opai/NotificationListClient.tsx` |
| InAppNotificationProvider | `/src/components/notifications/InAppNotificationProvider.tsx` |
| PushPermissionPrompt | `/src/components/pwa/PushPermissionPrompt.tsx` |
| Config admin | `/src/app/(app)/opai/configuracion/notificaciones/page.tsx` |
| Prefs usuario | `/src/app/(app)/opai/perfil/notificaciones/page.tsx` |

---

## 4. MÓDULO DE PAUTA / TURNOS

### 4.1 Flujo completo de creación de turnos

```
1. CREAR ASIGNACIÓN (OpsAsignacionGuardia)
   └─ POST /api/ops/asignaciones?action=asignar
   └─ Valida: guardia en estado "seleccionado"/"contratado", slot disponible
   └─ Cierra asignación previa si existe
   └─ Crea audit log

2. PINTAR SERIE (OpsSerieAsignacion)
   └─ POST /api/ops/pauta-mensual/pintar-serie
   └─ Define patrón trabajo/descanso (4x4, 5x2, 7x7, etc.)
   └─ Genera entries con generateSerieForMonth()
   └─ Para ROTATIVO: almacena rotatePuestoId, startShift, linked series
   └─ Desactiva serie anterior del mismo slot
   └─ Upsert pauta entries con shiftCode pattern

3. PAUTA GRID AUTO-SYNC
   └─ GET /api/ops/pauta-mensual?installationId=X&month=Y&year=Z
   └─ Auto-crea filas faltantes para puestos activos
   └─ Auto-proyecta series activas en celdas sin pintar
   └─ Retorna grid completo

4. MANEJAR AUSENCIAS
   └─ OpsGuardEvent creado (vacación, licencia, permiso)
   └─ POST /api/ops/pauta-mensual/assign-replacement
   └─ Actualiza replacementGuardiaId + replacementReason en celdas afectadas
   └─ plannedGuardiaId permanece intacto (para registros)

5. EJECUCIÓN DIARIA
   └─ GET /api/ops/asistencia?installationId=X&date=YYYY-MM-DD
   └─ Auto-crea OpsAsistenciaDiaria desde pauta (solo códigos T + ausencia)
   └─ Guardia marca entrada → actualGuardiaId, checkInAt
   └─ Guardia marca salida → checkOutAt, cálculo de horas
   └─ Estado: "asistio", "no_asistio", "reemplazo", "ppc"

6. TURNOS EXTRA
   └─ Auto-generado: cuando actual != planned y horas > contratadas
   └─ Creación manual: POST /api/te
   └─ Workflow: pending → approved → paid
   └─ Linked a payment batch: OpsPagoTeItem + OpsPagoTeLote
```

### 4.2 Concepto de "Turno Extra"

**Modelo:** `OpsTurnoExtra`

**Dos tipos:**
- `turno_extra`: Turno completo trabajado fuera de asignación
- `hora_extra`: Horas específicas de sobretiempo (`horasExtra` field)

**Status lifecycle:** `pending` → `approved` (monto se bloquea) → `paid` (vía lote de pago)

**Monto default cascada:**
1. `CrmInstallation.teMontoClp` (default por instalación)
2. `OpsPuestoOperativo.teMontoClp` (override por puesto)
3. Override manual con `amountJustification`

### 4.3 Vinculación con Payroll

```
OpsAsistenciaDiaria (ejecución diaria)
  ↓ (horas > planificadas)
OpsTurnoExtra (pending)
  ↓ (aprobación)
OpsTurnoExtra (approved, monto bloqueado)
  ↓ (agrupación)
OpsPagoTeLote + OpsPagoTeItem (lote de pago)
  ↓ (marcar pagado)
OpsTurnoExtra.status = "paid", paidAt set
  ↓ (integración)
PayrollAttendanceRecord (para cálculo de nómina)
```

### 4.4 API Routes de Pauta/Turnos

**Pauta Mensual:**
- `GET/POST /api/ops/pauta-mensual` — Grid principal
- `POST /api/ops/pauta-mensual/generar` — Generar grid mensual
- `POST /api/ops/pauta-mensual/guardar` — Guardar cambios bulk
- `POST /api/ops/pauta-mensual/pintar-serie` — Pintar patrón de serie
- `POST /api/ops/pauta-mensual/assign-replacement` — Asignar reemplazo
- `DELETE /api/ops/pauta-mensual/eliminar-serie` — Eliminar serie activa
- `GET /api/ops/pauta-mensual/resumen` — Estadísticas (cobertura, PPC)
- `GET /api/ops/pauta-mensual/activity` — Log de cambios
- `GET /api/ops/pauta-mensual/export-excel` — Exportar Excel
- `GET /api/ops/pauta-mensual/export-pdf` — Exportar PDF

**Asignaciones:**
- `GET/POST /api/ops/asignaciones` — Con acciones: "asignar", "desasignar", "check"
- `GET /api/crm/installations/[id]/asignaciones`

**Asistencia:**
- `GET/POST /api/ops/asistencia` — Auto-crea desde pauta
- `GET /api/ops/asistencia/[id]`
- `GET /api/ops/asistencia/export-horas-extra`

**Turnos Extra:**
- `GET/POST /api/te`
- `PATCH /api/te/[id]/aprobar`
- `PATCH /api/te/[id]/rechazar`
- `GET /api/te/stats`, `/api/te/stats/by-installation`, `/api/te/stats/evolution`
- `GET /api/te/export`
- `GET/POST /api/te/lotes`
- `POST /api/te/lotes/[id]/marcar-pagado`
- `GET /api/te/lotes/[id]/export-santander`

**Portal Guardia:**
- `GET /api/portal/guardia/extra-shifts`

**Portal Supervisor:**
- `GET/POST /api/portal/supervisor/turnos-extra`

### 4.5 Services relacionados

- `/src/lib/ops/asignaciones-logic.ts` — `executeAsignar()`, `executeDesasignar()`, `executeCheck()`, `cleanPautaFromDate()`
- `/src/lib/validations/ops.ts` — Schemas Zod: `upsertPautaItemSchema`, `pintarSerieSchema`, `createTeManualSchema`

---

## 5. GEORREFERENCIACIÓN

### 5.1 Guardias: coordenadas/dirección

**Los guardias NO almacenan coordenadas directamente.** Se vinculan vía:
- `OpsGuardia.currentInstallationId` → `CrmInstallation.lat/lng`
- Ubicación real-time se captura durante marcación/ronda vía GPS del dispositivo

### 5.2 Instalaciones: lat/lng

**Modelo:** `CrmInstallation`
```prisma
lat        Float?
lng        Float?
geoRadiusM Int    @default(1000)  // Radio geofence en metros
```

### 5.3 Checkpoints: lat/lng

**Modelo:** `OpsCheckpoint`
```prisma
lat        Float?
lng        Float?
geoRadiusM Int    @default(30)    // Radio checkpoint en metros
```

### 5.4 Captura de ubicación en tiempo real

**Modelo:** `OpsCheckpointTaskResponse`
```prisma
lat   Float?    // Capturado al momento de responder task
lng   Float?
```

### 5.5 Cálculos de distancia implementados

**Archivo:** `/src/lib/marcacion.ts`

```typescript
// Haversine distance (metros)
export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Radio terrestre en metros
  // ... implementación completa
}
```

**Archivo:** `/src/lib/rondas/geo-utils.ts`

```typescript
// Wrapper functions
distanceMeters(fromLat, fromLng, toLat, toLng): number | null
isWithinGeoRadius(fromLat, fromLng, toLat, toLng, radiusM): { valid: boolean; distanceM: number | null }
validateGeofenceWithAccuracy(fromLat, fromLng, toLat, toLng, radiusM, geoAccuracy): GeofenceResult

// Confiabilidad GPS
const MAX_RELIABLE_ACCURACY_M = 30;
const MIN_RELIABLE_DISTANCE_M = 150;
isSpeedReliable(distanceM, gpsAccuracy): boolean
```

### 5.6 Mapas en Frontend

**Google Maps API** (NO Leaflet/Mapbox como primario)

**Archivo principal:** `/src/components/ops/rondas/monitoreo-map.tsx`

- `@googlemaps/markerclusterer` para clustering
- Muestra: ubicaciones de instalaciones, posiciones de guardias, checkpoints con círculos geofence
- Visualización de estado: activo/completado/pendiente
- API Key: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`

**Dependencias de geo en package.json:**
```json
{
  "@capacitor/geolocation": "^8.1.0",      // GPS en dispositivos móviles
  "@googlemaps/markerclusterer": "^2.6.2",  // Clustering de markers
  "leaflet": "^1.9.4",                      // Mapas (alternativo)
  "react-leaflet": "^5.0.0"                 // React wrapper Leaflet
}
```

### 5.7 Uso de geolocalización en API routes

| Ruta | Uso |
|------|-----|
| `/api/portal/guardia/marcar/route.ts` | Verificación geofence en marcación |
| `/api/public/marcacion/registrar/route.ts` | Marcación pública con validación GPS |
| `/api/portal/guardia/marcar-foto/route.ts` | Marcación con foto + geo |
| `/api/ops/supervision/route.ts` | Check-in supervisión con geolocalización |
| `/api/ops/supervision/[id]/checkout/route.ts` | Checkout supervisión |
| Componente `RondaActiva.tsx` | Hook de geolocalización client-side |

---

## 6. SISTEMA DE PERMISOS Y ROLES

### 6.1 Roles activos (7)

| Rol | Rank | Acceso |
|-----|------|--------|
| **owner** | 4 | Acceso total, todos los módulos y capabilities |
| **admin** | 3 | Acceso total excepto `manage_settings` |
| **editor** | 2 | hub, docs, crm, cpq, ops, finance, payroll — puede editar templates, crear presentaciones |
| **jefe_operaciones** | 2 | hub, ops, crm, finance — gestión guardias, config rondas, aprobar rendiciones |
| **central_monitoreo** | 1 | hub, ops (limitado) — resolver alertas ronda, cerrar turnos monitoreo |
| **supervisor** | 1 | hub, ops, crm, finance (limitado) — supervisión completa, checkin/checkout geo, aprobar tickets |
| **viewer** | 0 | hub, ops, crm, docs (solo lectura) |

**Roles legacy (backward compat):** rrhh, operaciones, finanzas, reclutamiento, solo_ops, solo_crm, solo_documentos, solo_payroll, inspector_dt

**Definidos en:** `/src/lib/role-policy.ts` (constante `ROLE_POLICIES`)

### 6.2 Niveles de permiso (cascade)

```typescript
type PermissionLevel = "none" | "view" | "edit" | "full";
// none=0, view=1, edit=2, full=3
```

### 6.3 Módulos

```typescript
const MODULE_KEYS = [
  "hub", "ops", "crm", "docs", "payroll", "cpq",
  "config", "finance", "reportes_dt", "fiscalizacion"
];
```

### 6.4 Submódulos por módulo

**Ops:** puestos, pauta_mensual, pauta_diaria, turnos_extra, marcaciones, ppc, guardias, rondas, control_nocturno, tickets, supervision, inventario, eventos_laborales, gamificacion, installations

**CRM:** leads, accounts, installations, dotacion, contacts, deals, quotes

**Finance:** rendiciones, aprobaciones, pagos, reportes, configuracion, contabilidad, facturacion, proveedores

**Config:** usuarios, grupos, integraciones, firmas, categorias, crm, cpq, payroll, notificaciones, ops, tipos_ticket, finanzas

### 6.5 Capabilities (acciones no-CRUD)

```typescript
const CAPABILITY_KEYS = [
  "invite_users", "manage_users", "te_approve", "te_pay",
  "manage_settings", "rondas_configure", "rondas_resolve_alerts",
  "monitoreo_cerrar_turno", "control_nocturno_approve", "control_nocturno_delete",
  "rendicion_submit", "rendicion_approve", "rendicion_pay",
  "rendicion_configure", "rendicion_view_all", "rendicion_export",
  "contabilidad_manage", "facturacion_manage",
  "ticket_approve", "ticket_manage_types",
  "supervision_checkin", "supervision_view_own", "supervision_view_all",
  "supervision_dashboard", "gamificacion_bonos_aprobar",
  "dt_manage_sessions", "dt_view_incidents"
];
```

### 6.6 Verificación de permisos en API Routes

**Archivo:** `/src/lib/api-auth.ts`

**Patrón estándar:**
```typescript
export async function GET(request: NextRequest) {
  // 1. Autenticación
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  // 2. Resolver permisos
  const perms = await resolveApiPerms(ctx);

  // 3. Verificar acceso al módulo
  const forbidden = await ensureModuleAccess(ctx, "ops");
  if (forbidden) return forbidden;

  // 4. Verificar capability específica
  if (!hasCapability(perms, "rondas_configure")) {
    return NextResponse.json({ error: "No permisos" }, { status: 403 });
  }

  // Business logic...
}
```

**Helpers disponibles:**
```typescript
requireAuth(): Promise<AuthContext | null>
resolveApiPerms(ctx): Promise<RolePermissions>
ensureModuleAccess(ctx, module): Promise<NextResponse | null>
ensureCanDelete(ctx, module, submodule?): Promise<NextResponse | null>
canView(perms, module, submodule?): boolean
canEdit(perms, module, submodule?): boolean
canDelete(perms, module, submodule?): boolean
hasCapability(perms, cap): boolean
hasModuleAccess(perms, module): boolean
```

### 6.7 Resolución de permisos (2 niveles)

**Archivo:** `/src/lib/permissions-server.ts`

```typescript
async function resolvePermissions(user) {
  // 1. Permisos default por rol legacy
  const defaultPerms = getDefaultPermissions(normalizeRole(user.role));

  // 2. Si tiene RoleTemplate custom → merge overrides desde DB
  if (user.roleTemplateId) {
    const template = await prisma.roleTemplate.findUnique({ where: { id: user.roleTemplateId } });
    if (template?.permissions) {
      const merged = mergeRolePermissions(defaultPerms, template.permissions);
      return ensureSupervisorSupervisionAccess(effectiveRole, merged);
    }
  }

  return defaultPerms;
}
```

**Cache:** 5 min TTL in-memory para templates custom.

**NO hay middleware root-level** — autorización es per-route via helpers en `/src/lib/api-auth.ts`.

**Auth dual:** `/src/lib/access-control/auth.ts` soporta admin session (NextAuth) + device bearer token.

---

## 7. CHAT INTERNO

### 7.1 Arquitectura

| Componente | Tecnología | Archivo |
|------------|-----------|---------|
| Server push | Pusher (server-side) | `/src/lib/chat.ts` |
| Client subscribe | Pusher.js (client-side) | `/src/components/chat/lib/chat-pusher.ts` |
| Tipos | TypeScript | `/src/lib/chat-types.ts` |
| Sistema messages | Server functions | `/src/lib/chat-system-message.ts` |
| Auth canales | API route | `/src/app/api/chat/pusher/auth/route.ts` |

### 7.2 Modelos de datos (schema `chat`)

```prisma
enum ChatSenderType { ADMIN, GUARD, CLIENT, SYSTEM }
enum ChatChannelType { INSTALLATION, GROUP, DIRECT, EXTERNAL }
enum ChatParticipantType { ADMIN, CONTACT }
```

| Modelo | Propósito |
|--------|-----------|
| `ChatChannel` | Canales (instalación, grupo, DM, externo) |
| `ChatMessage` | Mensajes con sender type, thread, reply-to, system events |
| `ChatMessageReaction` | Reacciones emoji |
| `ChatReadCursor` | Posición de lectura per-user per-channel |
| `ChatMention` | @menciones (USER o ALL) |
| `ChatNotificationPreference` | Preferencias de notif per-canal (ALL/MENTIONS_ONLY/MUTED) |
| `ChatPushSubscription` | Suscripciones push |
| `ChatDmParticipant` | Participantes DM |
| `ChatChannelParticipant` | Participantes canal externo (ADMIN + CONTACT) |
| `ChatChannelArchive` | Archivado per-user |

### 7.3 Mensajes del sistema/bot

**SI, completamente soportados.**

```typescript
// /src/lib/chat-system-message.ts
interface SystemMessageParams {
  tenantId: string;
  channelId: string;
  content: string;
  systemEventType: string;
  systemEventData?: Record<string, unknown>;
}

export async function sendSystemChatMessage(params: SystemMessageParams): Promise<void>
```

**System event types con iconos:**
| Tipo | Icono | Color |
|------|-------|-------|
| `member_joined` | LogIn | — |
| `member_left` | LogOut | — |
| `channel_created` | Users | — |
| `role_changed` | Shield | — |
| `settings_changed` | Settings | — |
| `notification` | Bell | — |
| `guard_no_viene` | AlertTriangle | Rojo |
| `cobertura_snapshot` | BarChart3 | Azul |

Los tipos de monitoreo (`guard_no_viene`, `cobertura_snapshot`) linkan a `/ops/rondas/monitoreo`.

### 7.4 Mensajes interactivos

**NO hay mensajes interactivos (botones/acciones) implementados.**

Soportado:
- ✅ Texto con markdown/HTML
- ✅ Archivos adjuntos (campo `attachments` JSON)
- ✅ Reacciones emoji
- ✅ Thread replies y quote replies
- ✅ Menciones (@user, @todos)
- ❌ Botones con callbacks
- ❌ Select dropdowns en mensajes
- ❌ Componentes interactivos

El campo `systemEventData` JSON podría llevar metadata de botones/acciones, pero no existe UI ni handlers para renderizarlos.

### 7.5 API Routes de Chat

- `GET/POST/DELETE /api/chat/channels/[id]/messages` — CRUD mensajes con paginación cursor
- `GET/PATCH/DELETE /api/chat/channels/[id]/messages/[messageId]` — Operaciones individuales
- `POST /api/chat/channels/[id]/messages/[messageId]/reactions` — Toggle reacciones
- `POST /api/chat/pusher/auth` — Auth de canales

---

## 8. CONFIGURACIONES DEL TENANT

### 8.1 Módulo de configuración general

**SI existe.** Archivo principal: `/src/lib/tenant-config.ts`

La configuración del tenant incluye:
- **Datos generales:** razón social, RUT, dirección
- **Branding:** logo, colores primario/secundario/acento, nombre app
- **Contacto:** email from, reply-to
- **Configuración por dominio:** AI, gamificación, CRM, marcación, rondas, finanzas, notificaciones

### 8.2 Almacenamiento de settings

**Tabla `Setting`** con key-value per-tenant:

```
Formato nuevo: empresa:{tenantId}:empresa.xxx
Formato legacy: empresa.xxx
Fallback a defaults si no hay settings
```

**Cache:** 5 min TTL, invalidado en updates.

### 8.3 API Endpoints de configuración

| Endpoint | Propósito |
|----------|-----------|
| `GET/PATCH /api/configuracion/empresa` | Config empresa (30+ keys) |
| `GET/POST /api/config/ai-providers` | AI providers/models |
| `GET/POST /api/config/global-documents` | Documentos globales |
| `GET/POST /api/gamification/config` | Config gamificación |
| `GET/POST /api/crm/followup-config` | Config follow-ups CRM |
| `GET/POST /api/ops/marcacion/config` | Config marcación |
| `GET/POST /api/ops/rondas/ia/config` | Config IA rondas |
| `GET/POST /api/finance/config` | Config finanzas |
| `GET/POST /api/notifications/config` | Config notificaciones |
| `GET /api/access-control/config/[installationId]` | Config per-instalación |
| `GET /api/public/config` | Config pública (sin auth, CORS, cache 5min) |

### 8.4 Feature flags / Config dinámica

**No hay tabla explícita de feature flags.** En su lugar:
- Settings con valores boolean/enum controlan comportamiento
- Lógica condicional en API routes y componentes lee config on-demand o vía cache
- **AccessControlConfig** per-instalación actúa como feature flags:
  ```
  useWhitelist, requirePhoto, enabledFeatures, allowUnregisteredVisitors
  ```
- `CrmInstallation.nocturnoEnabled`, `chatEnabled` — flags per-instalación
- Notificaciones: `pushGlobalConfig` en Setting actúa como feature flag per-tipo

---

## 9. CRON JOBS / SCHEDULED TASKS

### 9.1 Definición en `vercel.json`

```json
{
  "crons": [
    { "path": "/api/fx/sync",                          "schedule": "0 12 * * *" },
    { "path": "/api/fx/sync",                          "schedule": "0 18 * * *" },
    { "path": "/api/cron/followup-emails",              "schedule": "*/15 * * * *" },
    { "path": "/api/cron/document-alerts",              "schedule": "0 8 * * *" },
    { "path": "/api/cron/marcacion-emails",             "schedule": "*/5 * * * *" },
    { "path": "/api/cron/rondas/generar",               "schedule": "*/10 * * * *" },
    { "path": "/api/cron/finance-alerts",               "schedule": "0 8 * * *" },
    { "path": "/api/cron/sla-monitor",                  "schedule": "*/15 * * * *" },
    { "path": "/api/cron/guardia-doc-notifications",    "schedule": "0 6 * * *" },
    { "path": "/api/cron/rondas/cerrar-libres",         "schedule": "*/15 * * * *" },
    { "path": "/api/cron/rondas/cerrar-atrasadas",      "schedule": "*/15 * * * *" },
    { "path": "/api/cron/rondas/cerrar-en-curso",       "schedule": "*/15 * * * *" },
    { "path": "/api/cron/consolidar-marcaciones",       "schedule": "0 * * * *" },
    { "path": "/api/cron/biometric-cleanup",            "schedule": "0 3 * * *" },
    { "path": "/api/cron/jornada-alerts",               "schedule": "0 * * * *" },
    { "path": "/api/cron/onboarding-reminder",          "schedule": "0 */6 * * *" }
  ]
}
```

### 9.2 Detalle de cada cron

| Frecuencia | Cron | Descripción | Archivo |
|------------|------|-------------|---------|
| Cada 5 min | `marcacion-emails` | Emails de comprobante marcación | `/src/app/api/cron/marcacion-emails/route.ts` |
| Cada 10 min | `rondas/generar` | Generar slots de ronda (max 1200/run) | `/src/app/api/cron/rondas/generar/route.ts` |
| Cada 15 min | `followup-emails` | Procesar follow-ups CRM (batch 50) | `/src/app/api/cron/followup-emails/route.ts` |
| Cada 15 min | `sla-monitor` | Monitor SLA tickets | `/src/app/api/cron/sla-monitor/route.ts` |
| Cada 15 min | `rondas/cerrar-libres` | Cerrar rondas no asignadas | `/src/app/api/cron/rondas/cerrar-libres/route.ts` |
| Cada 15 min | `rondas/cerrar-atrasadas` | Cerrar rondas vencidas | `/src/app/api/cron/rondas/cerrar-atrasadas/route.ts` |
| Cada 15 min | `rondas/cerrar-en-curso` | Cerrar rondas en progreso | `/src/app/api/cron/rondas/cerrar-en-curso/route.ts` |
| Cada hora | `consolidar-marcaciones` | Consolidar asistencia (Res. N°38) | `/src/app/api/cron/consolidar-marcaciones/route.ts` |
| Cada hora | `jornada-alerts` | Alertas de jornada laboral | `/src/app/api/cron/jornada-alerts/route.ts` |
| Cada 6 hrs | `onboarding-reminder` | Recordatorio onboarding empleados | `/src/app/api/cron/onboarding-reminder/route.ts` |
| Diario 03:00 | `biometric-cleanup` | Limpiar datos biométricos antiguos | `/src/app/api/cron/biometric-cleanup/route.ts` |
| Diario 06:00 | `guardia-doc-notifications` | Alertas docs guardia | `/src/app/api/cron/guardia-doc-notifications/route.ts` |
| Diario 08:00 | `document-alerts` | Alertas vencimiento documentos | `/src/app/api/cron/document-alerts/route.ts` |
| Diario 08:00 | `finance-alerts` | Alertas financieras | `/src/app/api/cron/finance-alerts/route.ts` |
| Diario 12:00+18:00 | `fx/sync` | Sync UF/UTM desde CMF | `/src/app/api/fx/sync/route.ts` |

### 9.3 Patrón de seguridad (todos los crons)

```typescript
const authHeader = request.headers.get("authorization");
const cronSecret = process.env.CRON_SECRET;
if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

### 9.4 Crons adicionales (no en vercel.json pero existen como routes)

- `/api/cron/contract-alerts` — Alertas vencimiento contrato
- `/api/cron/docs-operacionales-status` — Status documentos operacionales
- `/api/cron/gamification-calculate` — Cálculo scores gamificación
- `/api/cron/portal-reportes` — Generación reportes portal
- `/api/cron/signature-reminders` — Recordatorios firma digital

---

## 10. PORTALES PWA

### 10.1 Lista de portales

| Portal | Path | Manifest | Descripción |
|--------|------|----------|-------------|
| **Admin Hub** | `/hub` | `manifest.json` | ERP principal — dashboard, CRM, finanzas, ops, config |
| **Supervisor** | `/portal/supervisor` | `manifest-supervisor.json` | Dashboard monitoreo, aprobación TE, analytics |
| **Guardia** | `/portal/guardia` | `manifest-guardia.json` | Pauta, chat, solicitudes, salario |
| **Cliente** | `/portal/cliente` | `manifest-cliente.json` | Dashboard instalaciones, rondas, documentos |
| **Acceso** | `/portal/acceso` | `manifest-acceso.json` | Registro de acceso visitantes |
| **Marcación** | `/portal/marcacion` | — | Marcación de asistencia |
| **Rondas** | `/portal/rondas` | `portal-rondas-manifest.json` | Ejecución de rondas/patrullaje |

### 10.2 Portal para crear alertas (supervisor)

**El Supervisor usaría `/portal/supervisor`** para:
- Ver dashboard de instalaciones supervisadas
- Crear alertas de cobertura
- Aprobar/rechazar turnos extra
- Ver estado de guardias en tiempo real

### 10.3 Portal para recibir/aceptar alertas (guardia)

**El Guardia usaría `/portal/guardia`** para:
- Recibir notificaciones push de alertas
- Ver alertas pendientes
- Aceptar/rechazar coberturas ofrecidas
- Ver impacto en su pauta

### 10.4 Portal público

**`/portal/acceso`** funciona como portal público/sin login para registro de visitantes en instalaciones.

**`/api/public/config`** — API pública sin auth, con CORS, cache 5min. Retorna industries, service types, weekdays, job positions.

---

## 11. API ROUTES RELEVANTES

### 11.1 Guardias

| Endpoint | Método | Propósito |
|----------|--------|-----------|
| `/api/personas/guardias/route` | GET | Listar todos los guardias |
| `/api/personas/guardias/grid-data` | GET | Datos para grid |
| `/api/personas/guardias/[id]` | GET/PATCH | Perfil guardia |
| `/api/personas/guardias/[id]/bank-accounts` | POST | Cuentas bancarias |
| `/api/personas/guardias/[id]/contract` | GET/POST | Contrato |
| `/api/personas/guardias/[id]/dias-trabajados` | GET | Días trabajados |
| `/api/personas/guardias/[id]/documents` | GET/POST | Documentos |
| `/api/personas/guardias/[id]/salary-structure` | GET/POST | Estructura salarial |
| `/api/personas/guardias/[id]/status` | PATCH | Cambiar estado lifecycle |
| `/api/personas/guardias/export-excel` | POST | Exportar Excel |
| `/api/ops/guardias/[id]/marcaciones` | GET | Marcaciones del guardia |

### 11.2 Instalaciones

| Endpoint | Método | Propósito |
|----------|--------|-----------|
| `/api/ops/instalaciones` | GET | Listar instalaciones |
| `/api/ops/instalaciones/[id]` | GET/PATCH | Detalle instalación |
| `/api/crm/installations/[id]/asignaciones` | GET | Asignaciones de la instalación |
| `/api/operacional/instalaciones/[installationId]` | GET/POST | Datos operacionales |
| `/api/portal/cliente/instalaciones/[id]/documentos` | GET | Docs de instalación |
| `/api/portal/cliente/instalaciones/[id]/equipamiento` | GET | Equipamiento |
| `/api/portal/cliente/instalaciones/[id]/marcaciones` | GET | Marcaciones por instalación |

### 11.3 Turnos / Pauta

(Ver sección 4.4 completa arriba)

### 11.4 Notificaciones

| Endpoint | Método | Propósito |
|----------|--------|-----------|
| `/api/notifications` | GET/PATCH/DELETE | CRUD notificaciones bell |
| `/api/notifications/config` | GET/POST | Config global notificaciones |
| `/api/notifications/push/subscribe` | POST/DELETE | Subscribe/unsubscribe push |
| `/api/notifications/test` | POST | Test notification delivery |

### 11.5 Config

| Endpoint | Método | Propósito |
|----------|--------|-----------|
| `/api/configuracion/empresa` | GET/PATCH | Config empresa tenant |
| `/api/config/ai-providers` | GET | AI providers |
| `/api/config/global-documents` | GET/POST | Documentos globales |
| `/api/gamification/config` | GET/POST | Config gamificación |
| `/api/ops/marcacion/config` | GET/POST | Config marcación |
| `/api/ops/rondas/ia/config` | GET/POST | Config IA rondas |
| `/api/finance/config` | GET/POST | Config finanzas |
| `/api/public/config` | GET | Config pública (sin auth) |

---

## 12. DEPENDENCIAS RELEVANTES

### Del `package.json`:

#### Mapas / Geolocalización
```json
{
  "@capacitor/geolocation": "^8.1.0",
  "@googlemaps/markerclusterer": "^2.6.2",
  "leaflet": "^1.9.4",
  "react-leaflet": "^5.0.0"
}
```

#### Real-time
```json
{
  "pusher": "^5.3.2",
  "pusher-js": "^8.4.0"
}
```

#### Notificaciones
```json
{
  "@capacitor/push-notifications": "^8.0.2",
  "web-push": "^3.6.7",
  "sonner": "^2.0.7"
}
```

#### Email
```json
{
  "@react-email/components": "^1.0.7",
  "@react-email/render": "^2.0.4",
  "react-email": "^5.2.6",
  "resend": "^6.9.1"
}
```

#### Base de datos / ORM
```json
{
  "@prisma/client": "^6.19.2",
  "prisma": "^6.19.2"
}
```

#### Mobile / Hybrid
```json
{
  "@capacitor/core": "^8.2.0",
  "@capacitor/camera": "^8.0.2",
  "@capacitor/haptics": "^8.0.1",
  "@capacitor/preferences": "^8.0.1",
  "@capacitor/status-bar": "^8.0.1",
  "@capawesome/capacitor-badge": "^8.0.1",
  "capacitor-native-biometric": "^4.2.2"
}
```

#### Auth
```json
{
  "next-auth": "^5.0.0-beta.30",
  "bcryptjs": "^3.0.3",
  "jose": "6.0.6"
}
```

#### Validación
```json
{
  "zod": "^4.3.6"
}
```

#### Fechas / Timezone
```json
{
  "date-fns": "^4.1.0",
  "date-fns-tz": "^3.2.0"
}
```

#### Exportación
```json
{
  "@react-pdf/renderer": "^4.3.2",
  "exceljs": "^4.4.0",
  "xlsx": "^0.18.5"
}
```

#### QR Codes
```json
{
  "html5-qrcode": "^2.3.8",
  "qrcode": "^1.5.4"
}
```

#### Visualización
```json
{
  "recharts": "^3.7.0",
  "framer-motion": "^12.31.0"
}
```

#### State management
```json
{
  "react-redux": "^9.2.0",
  "redux": "^5.0.1",
  "reselect": "^5.1.1"
}
```

#### AI
```json
{
  "openai": "^6.18.0"
}
```

#### Webhooks
```json
{
  "svix": "^1.88.0"
}
```

#### IDs
```json
{
  "nanoid": "^5.1.6"
}
```

---

## 13. PATRONES DE CÓDIGO

### 13.1 Service Layer

**Los services viven en `/src/lib/`** organizados por dominio:

| Service | Archivo | Propósito |
|---------|---------|-----------|
| Notification Service | `notification-service.ts` | Bell + email unificado |
| Push Service | `pwa/push-service.ts` | Web push VAPID |
| Marcación Email | `marcacion-email.ts` | Comprobantes marcación |
| Marcación Config | `ops-marcacion-config.ts` | Parse/resolve geo-radius |
| Attendance | `ops-attendance.ts` | Métricas asistencia |
| OPS RBAC | `ops-rbac.ts` | RBAC operaciones |
| Auth | `api-auth.ts` | Validación sesión + permisos |
| Chat | `chat.ts` | Pusher singleton + triggers |
| Chat System | `chat-system-message.ts` | Mensajes de sistema |
| Tenant Config | `tenant-config.ts` | Config empresa per-tenant |
| Asignaciones Logic | `ops/asignaciones-logic.ts` | Lógica de asignación guardias |
| Alert Engine | `rondas/alert-engine.ts` | Motor alertas ronda |
| Alert Notifications | `rondas/alert-notifications.ts` | Envío notifs alertas |
| Geo Utils | `rondas/geo-utils.ts` | Cálculos geofence |
| Resend | `resend.ts` | Config email Resend |
| Permissions | `permissions.ts` (client) + `permissions-server.ts` (server) | Sistema permisos completo |
| Role Policy | `role-policy.ts` | Definiciones de roles |
| WhatsApp | `whatsapp-templates.ts` | Templates WhatsApp |

**Patrón:** funciones puras que aceptan context/config, usan Prisma para acceso a datos, error handling con try-catch, console logging para debug.

### 13.2 State Machine

**No hay implementación formal de state machine** (no se usa xstate ni similar).

Sin embargo, hay **flujos con estados implícitos**:

| Entidad | Estados | Transiciones |
|---------|---------|-------------|
| OpsTurnoExtra | pending → approved → paid / rejected | Via API routes dedicadas |
| OpsGuardia lifecycle | postulante → seleccionado → contratado → inactivo / blacklisted | Via PATCH status |
| OpsRefuerzoSolicitud | solicitado → aprobado → rechazado → facturado | Via API |
| CrmDeal | prospección → calificación → propuesta → negociación → cerrado | Via CRM pipeline |
| OpsRondaEjecucion | pendiente → en_curso → completada → cerrada | Via marcación checkpoints |
| DocSignatureRequest | draft → sent → signed → completed | Via firma digital |

### 13.3 Transacciones Prisma ($transaction)

**SI, ampliamente usadas.** Ejemplo completo de `/src/app/api/portal/guardia/marcar/route.ts`:

```typescript
const result = await prisma.$transaction(async (tx) => {
  // 1. Crear registro de marcación
  const marcacion = await tx.opsMarcacion.create({
    data: {
      tenantId,
      guardiaId: guardia.id,
      installationId: installation.id,
      puestoId: asignacion.puestoId,
      slotNumber: asignacion.slotNumber,
      tipo,                    // "entrada" | "salida"
      timestamp: serverTimestamp,
      lat, lng,
      geoValidada,
      geoDistanciaM,
      metodoId: "rut_pin",
      ipAddress,
      userAgent,
      hashIntegridad,          // SHA-256
      atrasoMinutos,
      employerRut,             // Resolución Exenta N°38
    },
  });

  // 2. Upsert asistencia diaria
  const asistencia = await tx.opsAsistenciaDiaria.upsert({
    where: {
      installationId_puestoId_slotNumber_date: {
        installationId: installation.id,
        puestoId: asignacion.puestoId,
        slotNumber: asignacion.slotNumber,
        date: today,
      },
    },
    create: { /* datos completos */ },
    update: { /* actualizar según tipo entrada/salida */ },
  });

  // 3. Enviar comprobante email
  await sendMarcacionComprobante({ guardia, marcacion });

  return { marcacion, asistencia };
});
```

**Otros archivos con $transaction:**
- `/src/app/personas/_actions/comunicaciones.ts`
- `/src/app/api/portal/guardia/tickets/route.ts`
- `/src/app/api/portal/guardia/marcar-foto/route.ts`
- `/src/app/api/portal/rondas/panico/route.ts`

### 13.4 Error Handling en API Routes

**Patrón estándar:**
```typescript
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    // Business logic
    const data = await prisma.model.findMany({ ... });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Module] Error description:", error);
    return NextResponse.json(
      { success: false, error: "Error al procesar solicitud" },
      { status: 500 }
    );
  }
}
```

**Formato de respuesta estándar:**
```typescript
{
  success: boolean,
  data?: T,
  error?: string,
  details?: Record<string, unknown>
}
```

**HTTP Status Codes:**
- 200: Success
- 400: Error de validación (Zod parse errors → 400 con issue details)
- 401: `unauthorized()` — sesión inválida
- 403: `forbiddenOps()` — sin permisos
- 404: Not found
- 409: Conflict (duplicado/error de estado)
- 500: Error interno

**Validación con Zod:**
```typescript
const parsed = await parseBody(request, upsertPautaItemSchema);
if (parsed.error) return parsed.error;  // Auto 400 con detalles
const body = parsed.data;
```

### 13.5 Patrón de Fechas/Timezone

```typescript
import { toZonedTime } from "date-fns-tz";
const TZ = "America/Santiago";
const now = toZonedTime(new Date(), TZ);
```

### 13.6 Multi-Tenancy

Todos los queries incluyen `tenantId`:
```typescript
const data = await prisma.model.findMany({
  where: { tenantId: ctx.tenantId, ... },
});
```

---

## RESUMEN EJECUTIVO PARA MÓDULO DE ALERTAS

### Infraestructura existente aprovechable

| Capacidad | Estado | Cómo reusar |
|-----------|--------|-------------|
| **Push notifications** | ✅ Completo | `sendPushToPortalUser()`, `sendPushToAdmins()` |
| **Pusher real-time** | ✅ Completo | Crear canal `alertas-cobertura-{tenantId}` |
| **Chat sistema** | ✅ Completo | `sendSystemChatMessage()` con nuevo event type |
| **Email** | ✅ Completo | Nuevo template React Email + `sendNotification()` |
| **Geolocalización** | ✅ Completo | `haversineDistance()`, `isWithinGeoRadius()` |
| **Google Maps** | ✅ Completo | Reusar `monitoreo-map.tsx` pattern |
| **Permisos** | ✅ Completo | Nuevo capability + submódulo ops |
| **Cron jobs** | ✅ 16 existentes | Nuevo cron para evaluar cobertura |
| **Portal Supervisor** | ✅ Existe | Agregar UI de alertas |
| **Portal Guardia** | ✅ Existe | Agregar UI aceptar/rechazar |
| **Service Worker** | ✅ Completo | Ya soporta `emergency_alert`, vibración pánico |
| **Asignaciones** | ✅ Completo | `OpsAsignacionGuardia` + `OpsPautaMensual` |
| **Turnos extra** | ✅ Completo | Vincular con turno extra auto-generado |

### Gaps para implementar

| Necesidad | Estado | Acción requerida |
|-----------|--------|------------------|
| **Modelo de Alerta de Cobertura** | ❌ No existe | Crear modelo Prisma |
| **State machine de alerta** | ❌ No existe | Implementar flujo estados |
| **Mensajes interactivos chat** | ❌ No existe | Agregar botones aceptar/rechazar en chat |
| **Cálculo de guardias cercanos** | ⚠️ Parcial | Hay haversine, falta query por cercanía |
| **Notificación por prioridad/distancia** | ❌ No existe | Nuevo algoritmo |
| **Dashboard cobertura nacional** | ❌ No existe | Nuevo componente |
| **Auto-asignación temporal** | ❌ No existe | Lógica nueva sobre pauta existente |
