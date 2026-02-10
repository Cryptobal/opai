# ETAPA 2 — Plan Maestro de Implementación

## Postventa + Tickets Core

> **Versión:** 1.0  
> **Fecha:** 2026-02-10  
> **Fuente de verdad:** `Desarrollo Opai/fase-2.md` (MASTER_SPEC vFinal)  
> **Estado:** Pendiente de validación por stakeholder  

---

## Índice

- [A) Resumen Ejecutivo](#a-resumen-ejecutivo)
- [B) Estado Actual (Baseline)](#b-estado-actual-baseline)
- [C) Gap Analysis](#c-gap-analysis)
- [D) Diseño Final de Etapa 2](#d-diseño-final-de-etapa-2)
- [E) Plan de Implementación por PRs](#e-plan-de-implementación-por-prs)
- [F) Criterios de Aceptación](#f-criterios-de-aceptación)
- [G) Riesgos y Mitigaciones](#g-riesgos-y-mitigaciones)
- [H) Supuestos y Preguntas Abiertas](#h-supuestos-y-preguntas-abiertas)

---

## A) Resumen Ejecutivo

### Qué agrega Etapa 2 al negocio

La Etapa 2 incorpora dos capacidades operacionales críticas para Gard:

1. **Postventa** — Supervisores realizan visitas georreferenciadas (check-in/out) a instalaciones, registran novedades en bitácora e incidentes con severidad. Validación por geofence con mecanismo de override justificado. Esto permite medir cumplimiento de supervisión y detectar problemas en terreno en tiempo real.

2. **Tickets** — Sistema transversal de seguimiento con categorías predefinidas, prioridades y SLA básico. Los incidentes postventa pueden escalar a tickets. Bandeja única para gestionar solicitudes de múltiples orígenes (operaciones, RRHH, inventario, postventa, guardias).

### Módulos que toca

| Módulo | Acción |
|--------|--------|
| **Postventa** (NUEVO) | Crear completo: check-in/out, bitácora, incidentes, KPIs |
| **Tickets** (NUEVO) | Crear completo: tickets, comentarios, adjuntos, categorías, SLA |
| **CRM / Instalaciones** (EXISTENTE) | Extender: agregar `geo_radius_m` para validación geofence |
| **Auth / RBAC** (EXISTENTE) | Extender: agregar rol `supervisor` y permisos de postventa/tickets |
| **Auditoría** (EXISTENTE) | Reutilizar: `AuditLog` para trazabilidad de acciones |

### Qué NO incluye (fuera de alcance)

- **Ops core** (puestos operativos, pauta mensual, asistencia diaria, PPC) — Fase 1 pendiente
- **Turnos Extra y pagos** — Fase 1 pendiente
- **Personas / Guardias** (modelo completo con documentos, OS10, cuenta bancaria) — Fase 1 pendiente
- **Portal de Guardias** — Fase 3
- **Comunicados** — Fase 3
- **Solicitudes RRHH completas** — Fase 3
- **Inventario** — Fase 4
- **Asistencia externa (FaceID/API)** — Fase 5
- **Portal de cliente** — Fuera de todas las fases actuales
- **Integración con sistemas de asistencia externos** — Fase 5

> **Nota crítica:** La Fase 1 (Ops + TE + Personas MVP) NO está implementada en el repositorio actual. El repositorio tiene CRM, CPQ, Documentos y Payroll. Para Etapa 2, se diseña con la mínima dependencia posible de Fase 1, usando el modelo `Admin` existente como actor de supervisión y `CrmInstallation` como eje de postventa. Ver sección [H) Supuestos](#h-supuestos-y-preguntas-abiertas).

---

## B) Estado Actual (Baseline)

### Módulos existentes

| Módulo | Estado | Ruta base | Descripción |
|--------|--------|-----------|-------------|
| **Hub** | ✅ Producción | `/hub` | Dashboard ejecutivo, centro de control |
| **CRM** | ✅ Producción | `/crm/*` | Leads, Accounts, Contacts, Deals, Installations, Pipeline, Email, Follow-ups |
| **CPQ** | ✅ Producción | `/cpq/*` | Cotizaciones, posiciones, catálogo, cálculo de costos employer |
| **Documentos** | ✅ Producción | `/opai/documentos/*` | Templates con tokens, generación de documentos, versionado, categorías |
| **Payroll** | ✅ Producción | `/payroll/*` | Simulador de liquidaciones, parámetros legales Chile |
| **Presentaciones** | ✅ Producción | `/p/[uniqueId]` | Propuestas comerciales con tracking |
| **Configuración** | ✅ Producción | `/opai/configuracion/*` | Usuarios, integraciones, firmas, templates email |
| **FX** | ✅ Producción | `/api/fx/*` | Indicadores financieros (UF, UTM) |
| **Postventa** | ❌ No existe | — | — |
| **Tickets** | ❌ No existe | — | — |
| **Ops** | ❌ No existe | — | Definido en `app-access.ts` como futuro |
| **Portal** | ❌ No existe | — | Definido en `app-access.ts` como futuro |

### Stack tecnológico

| Componente | Tecnología |
|------------|-----------|
| Framework | Next.js 15 (App Router) |
| Base de datos | PostgreSQL (Neon) |
| ORM | Prisma (multi-schema: public, payroll, fx, cpq, crm, docs) |
| Auth | Auth.js v5 (NextAuth) con Credentials |
| UI | Tailwind CSS + Radix UI + shadcn/ui |
| Email | Resend |
| Validación | Zod |
| Estado | React hooks (sin estado global externo) |
| Deploy | Vercel |

### Tablas existentes relevantes para Etapa 2

#### Schema `public`

| Tabla | Propósito | Campos relevantes para Etapa 2 |
|-------|-----------|-------------------------------|
| `Tenant` | Tenant SaaS | `id`, `slug`, `name` |
| `Admin` | Usuarios del sistema | `id`, `email`, `name`, `role`, `tenantId` |
| `AuditLog` | Auditoría general | `userId`, `action`, `entity`, `entityId`, `details` |
| `Setting` | Configuración global | `key`, `value`, `type`, `tenantId` |

#### Schema `crm`

| Tabla | Propósito | Campos relevantes para Etapa 2 |
|-------|-----------|-------------------------------|
| `CrmInstallation` | Instalaciones/sitios | `id`, `name`, `lat`, `lng`, `accountId`, `tenantId` |
| `CrmAccount` | Cuentas/clientes | `id`, `name`, `tenantId` |
| `CrmFile` | Archivos adjuntos | `id`, `fileName`, `storageKey`, `tenantId` |
| `CrmFileLink` | Asociación archivo-entidad | `fileId`, `entityType`, `entityId` |
| `Notification` | Notificaciones | `type`, `title`, `message`, `data`, `read` |

### Endpoints existentes relevantes

| Endpoint | Método | Propósito |
|----------|--------|-----------|
| `/api/crm/installations` | GET, POST | CRUD instalaciones |
| `/api/crm/installations/[id]` | GET, PATCH, DELETE | Detalle/editar instalación |
| `/api/notifications` | GET, PATCH | Notificaciones (leer/marcar leída) |
| `/api/auth/[...nextauth]` | GET, POST | Autenticación |

### Sistema de auth/roles actual

**Roles actuales:** `owner`, `admin`, `editor`, `viewer`

**Módulos con acceso definido** (en `app-access.ts`):
- `ops` y `portal` ya están declarados como módulos futuros con acceso para `owner` y `admin`

**Permisos actuales** (en `rbac.ts`):
- `MANAGE_USERS`, `INVITE_USERS`, `MANAGE_TEMPLATES`, `EDIT_TEMPLATES`, `VIEW_TEMPLATES`, `SEND_PRESENTATIONS`, `CREATE_PRESENTATIONS`, `VIEW_PRESENTATIONS`, `VIEW_ANALYTICS`, `MANAGE_SETTINGS`

> No existen permisos específicos para postventa, tickets, ni rol de supervisor.

### Componentes UI reutilizables

| Componente | Ruta | Reutilizable para Etapa 2 |
|------------|------|--------------------------|
| `AppShell` | `components/opai/AppShell.tsx` | ✅ Layout principal (sidebar + content) |
| `PageHeader` | `components/opai/PageHeader.tsx` | ✅ Headers de páginas |
| `EmptyState` | `components/opai/EmptyState.tsx` | ✅ Estados vacíos |
| `LoadingState` | `components/opai/LoadingState.tsx` | ✅ Estados de carga |
| `StatusBadge` | `components/opai/StatusBadge.tsx` | ✅ Badges de estado |
| `KpiCard` | `components/opai/KpiCard.tsx` | ✅ Tarjetas KPI |
| `SubNav` | `components/opai/SubNav.tsx` | ✅ Sub-navegación módulo |
| `Breadcrumb` | `components/opai/Breadcrumb.tsx` | ✅ Breadcrumbs |
| `NotificationBell` | `components/opai/NotificationBell.tsx` | ✅ Notificaciones |
| `CommandPalette` | `components/opai/CommandPalette.tsx` | ✅ Búsqueda global |
| `ConfirmDialog` | `components/ui/confirm-dialog.tsx` | ✅ Confirmaciones |
| `Dialog` | `components/ui/dialog.tsx` | ✅ Modales (mobile bottom-sheet) |
| `Card` | `components/ui/card.tsx` | ✅ Tarjetas |
| `Button` | `components/ui/button.tsx` | ✅ Botones con variantes |
| `Badge` | `components/ui/badge.tsx` | ✅ Badges |
| `Input` | `components/ui/input.tsx` | ✅ Inputs |
| `Select` | `components/ui/select.tsx` | ✅ Select dropdowns |
| `DropdownMenu` | `components/ui/dropdown-menu.tsx` | ✅ Menús contextuales |

---

## C) Gap Analysis

### Tabla de brechas: fase-2.md vs repositorio actual

| # | Requerimiento (fase-2.md) | ¿Existe hoy? | Dónde está en el repo | Qué falta | Riesgo si se implementa mal | Decisión técnica propuesta |
|---|--------------------------|---------------|----------------------|-----------|---------------------------|---------------------------|
| 1 | **Check-in georreferenciado** con validación por radio | ❌ No | — | Tabla `visit_checkin`, API POST, UI mobile, lógica geofence | Datos GPS imprecisos en interiores; falsos negativos | Crear tabla en schema `ops`. Usar Haversine para distancia. Permitir override con evidencia |
| 2 | **Check-out georreferenciado** con duración | ❌ No | — | Lógica de cierre de visita, cálculo de duración, validación de secuencia | Check-out sin check-in previo, doble check-out | Validar que exista check-in abierto. Calcular duración automáticamente |
| 3 | **Override de geofence** (fuera de radio) con motivo + justificación + foto | ❌ No | — | Campos `result`, `override_reason`, `override_justification`, upload de foto, auditoría | Supervisores abusan del override; falta de evidencia | `result` enum (ok/override). Override requiere 3 campos obligatorios. Auditoría completa |
| 4 | **Geofence por instalación** (`geo_radius_m`) | 🟡 Parcial | `prisma/schema.prisma` → `CrmInstallation` tiene `lat`, `lng` | Falta campo `geo_radius_m` (radio en metros) | Sin radio no se puede validar geofence | Agregar `geo_radius_m Int? @default(100)` a `CrmInstallation` |
| 5 | **Bitácora de instalación** (novedades, observaciones) | ❌ No | — | Tabla `site_log_entry`, API CRUD, UI lista + formulario | Entradas sin clasificar; difícil filtrar por severidad | Crear con `type` enum (novedad/incidente/observación) y `severity` |
| 6 | **Incidentes con severidad** | ❌ No | — | Severidad en `site_log_entry`, campo `ticket_id` opcional para escalamiento | Incidentes graves no escalan; pérdida de trazabilidad | Incidente con severity=critical/high auto-sugiere crear ticket |
| 7 | **Incidente puede crear ticket** | ❌ No | — | Flujo UI + API para crear ticket desde incidente, FK bidireccional | Tickets duplicados; pérdida de contexto del incidente | `site_log_entry.ticket_id` + `ticket.source_log_id` para trazabilidad |
| 8 | **Sistema de tickets** completo | ❌ No | — | Tabla `ticket`, API CRUD, UI bandeja, detalle, filtros | Tickets sin SLA; sin asignación automática por equipo | Crear con `status`, `priority`, `assigned_team`, `assigned_to`, `sla_due_at` |
| 9 | **Comentarios en tickets** | ❌ No | — | Tabla `ticket_comment`, API POST, UI thread de comentarios | Conversaciones sin orden; archivos mezclados con texto | Timeline cronológica. Soporte markdown básico |
| 10 | **Adjuntos en tickets** | ❌ No | — | Tabla `ticket_attachment` o reutilizar `CrmFile`/`CrmFileLink` | Archivos sin límite de tamaño; tipos no validados | Reutilizar patrón `CrmFile` + `CrmFileLink` con `entityType = 'ticket'` |
| 11 | **Categorías de tickets** con SLA | ❌ No | — | Tabla `ticket_category` con 10 categorías seed, SLA hours, prioridad default | Categorías mal mapeadas a equipos; SLA no se respeta | Seed con las 10 categorías del MASTER_SPEC. SLA calculado al crear ticket |
| 12 | **Bandeja única de tickets** con filtros | ❌ No | — | Página `/tickets`, filtros por status/team/prioridad/instalación | UX confusa con muchos filtros; performance con muchos tickets | Filtros en sidebar. Paginación server-side. Contador por estado |
| 13 | **KPI Postventa** | ❌ No | — | Página `/postventa/kpis`, API de métricas, cálculos agregados | Métricas lentas en grandes volúmenes; datos inconsistentes | Queries con índices apropiados. Rangos de fecha obligatorios |
| 14 | **Rol Supervisor** en RBAC | ❌ No | `src/lib/rbac.ts`, `src/lib/app-access.ts` | Rol con permisos de postventa + tickets (sin aprobación) | Supervisor con más permisos de los necesarios | Agregar rol `supervisor` con permisos acotados |
| 15 | **Monto TE por instalación** (`te_monto_clp`) | ❌ No | `CrmInstallation` en schema | Campo `te_monto_clp` en instalación | Dato necesario para Fase 1 (TE) | Agregar campo ahora; se usa en Fase 1. No bloquea Etapa 2 |
| 16 | **Auditoría de acciones postventa/tickets** | 🟡 Parcial | `AuditLog` en schema `public` | Reutilizar `AuditLog`. Asegurar que se registra cada acción | Acciones sin auditar; imposible reconstruir historial | Usar `AuditLog` existente con `entity = 'visit_checkin' / 'ticket'` |

### Dependencias con Fase 1 (no implementada)

| Dependencia | Impacto en Etapa 2 | Decisión |
|-------------|--------------------|---------| 
| Tabla `persona` / `guardia` | Check-in podría asociarse a guardia en sitio | **Diferir:** El actor del check-in es el `Admin` (supervisor). Cuando exista `guardia`, se agrega FK opcional |
| Tabla `puesto_operativo` | Bitácora podría asociarse a puesto | **Diferir:** Bitácora se asocia a `instalacion`. Puesto es granularidad de Fase 1 |
| Tabla `asistencia_diaria` | Tickets de inasistencia referencian asistencia | **Diferir:** El ticket puede referenciar `instalacion_id` sin FK a asistencia |
| Tabla `turno_extra` | Categoría ticket `pago_turno_extra` | **Diferir:** El ticket existe pero el flujo de pago TE no. Solo metadata por ahora |

---

## D) Diseño Final de Etapa 2

### D.1) Módulos y Límites

```
┌─────────────────────────────────────────────────┐
│                    OPAI Suite                    │
├──────────┬──────────┬──────────┬────────────────┤
│   CRM    │   CPQ    │  Docs    │   Payroll      │
│ (existe) │ (existe) │ (existe) │   (existe)     │
├──────────┴──────────┴──────────┴────────────────┤
│              ETAPA 2 (NUEVO)                     │
├─────────────────────┬───────────────────────────┤
│     Postventa       │        Tickets            │
│  ┌───────────────┐  │  ┌─────────────────────┐  │
│  │ visit_checkin  │  │  │ ticket              │  │
│  │ site_log_entry │──┼──│ ticket_comment      │  │
│  │ (incidente     │  │  │ ticket_attachment   │  │
│  │  crea ticket)  │  │  │ ticket_category     │  │
│  └───────────────┘  │  └─────────────────────┘  │
├─────────────────────┴───────────────────────────┤
│            Integración con existente             │
│  CrmInstallation ← (geo_radius_m) geofence      │
│  Admin ← (rol supervisor) actor check-in         │
│  AuditLog ← trazabilidad                         │
│  Notification ← alertas                          │
│  CrmFile/CrmFileLink ← adjuntos                  │
└─────────────────────────────────────────────────┘
```

**Regla de integración:** Postventa y Tickets son módulos nuevos bajo schema `ops`. Se integran con CRM solo por FK a `CrmInstallation` y con `public` por FK a `Admin` y `AuditLog`. No se modifican tablas de CRM/CPQ/Docs/Payroll salvo agregar `geo_radius_m` a `CrmInstallation`.

### D.2) Modelo de Datos

#### Nuevo schema Prisma: `ops`

Se agrega `"ops"` al array de schemas en `datasource.db.schemas`.

#### Tabla: `OpsVisitCheckin`

Registro de check-in y check-out georreferenciado de supervisores en instalaciones.

```
Tabla: visit_checkins (schema: ops)
───────────────────────────────────────────────────────────
Campo                    Tipo              Restricciones
───────────────────────────────────────────────────────────
id                       UUID              PK, default uuid_generate_v4()
tenant_id                String            NOT NULL, INDEX
installation_id          UUID              NOT NULL, FK → crm.installations(id)
user_id                  String            NOT NULL (Admin.id del supervisor)
type                     String            NOT NULL, enum: "checkin" | "checkout"
lat                      Float             NOT NULL
lng                      Float             NOT NULL
accuracy_m               Float?            Precisión GPS del dispositivo
geo_result               String            NOT NULL, enum: "ok" | "override"
override_reason          String?           Requerido si geo_result = "override"
                                           enum: "gps_impreciso" | "punto_acceso_lejano"
                                           | "emergencia" | "otro"
override_justification   String?           Requerido si geo_result = "override"
override_photo_url       String?           Requerido si geo_result = "override"
distance_m               Float?            Distancia calculada al centro de instalación
paired_checkin_id        UUID?             FK → self (solo para checkout, ref al checkin)
duration_minutes         Int?              Solo checkout: minutos entre checkin y checkout
notes                    String?           Observaciones opcionales
created_at               Timestamptz       NOT NULL, default now()
───────────────────────────────────────────────────────────
Índices:
  - idx_visit_checkins_tenant (tenant_id)
  - idx_visit_checkins_installation (installation_id)
  - idx_visit_checkins_user (user_id)
  - idx_visit_checkins_created (created_at DESC)
  - idx_visit_checkins_tenant_date (tenant_id, created_at)
  - idx_visit_checkins_paired (paired_checkin_id)

Constraints:
  - Si type = "checkout", paired_checkin_id es NOT NULL (app-level)
  - Si geo_result = "override", override_reason + override_justification + 
    override_photo_url son NOT NULL (app-level)
```

#### Tabla: `OpsSiteLogEntry`

Entrada de bitácora: novedad, incidente u observación durante visita.

```
Tabla: site_log_entries (schema: ops)
───────────────────────────────────────────────────────────
Campo                    Tipo              Restricciones
───────────────────────────────────────────────────────────
id                       UUID              PK, default uuid_generate_v4()
tenant_id                String            NOT NULL, INDEX
installation_id          UUID              NOT NULL, FK → crm.installations(id)
user_id                  String            NOT NULL (Admin.id del supervisor)
visit_checkin_id         UUID?             FK → ops.visit_checkins(id), opcional
type                     String            NOT NULL, enum: "novedad" | "incidente" | "observacion"
severity                 String            NOT NULL, default "low"
                                           enum: "critical" | "high" | "medium" | "low" | "info"
title                    String            NOT NULL
description              String?           Detalle extendido
photo_urls               String[]          Array de URLs de fotos
ticket_id                UUID?             FK → ops.tickets(id), si escala a ticket
created_at               Timestamptz       NOT NULL, default now()
updated_at               Timestamptz       NOT NULL, @updatedAt
───────────────────────────────────────────────────────────
Índices:
  - idx_site_logs_tenant (tenant_id)
  - idx_site_logs_installation (installation_id)
  - idx_site_logs_type (type)
  - idx_site_logs_severity (severity)
  - idx_site_logs_created (created_at DESC)
  - idx_site_logs_ticket (ticket_id)
  - idx_site_logs_checkin (visit_checkin_id)
```

#### Tabla: `OpsTicketCategory`

Categorías predefinidas para tickets con SLA y equipo asignado.

```
Tabla: ticket_categories (schema: ops)
───────────────────────────────────────────────────────────
Campo                    Tipo              Restricciones
───────────────────────────────────────────────────────────
id                       UUID              PK, default uuid_generate_v4()
tenant_id                String            NOT NULL
slug                     String            NOT NULL
name                     String            NOT NULL
description              String?
assigned_team            String            NOT NULL, enum: "postventa" | "ops" | "rrhh" 
                                           | "inventario" | "finanzas" | "it_admin"
default_priority         String            NOT NULL, enum: "p1" | "p2" | "p3" | "p4"
sla_hours                Int               NOT NULL
icon                     String?           Emoji o nombre de icono
is_active                Boolean           NOT NULL, default true
sort_order               Int               NOT NULL, default 0
created_at               Timestamptz       NOT NULL, default now()
updated_at               Timestamptz       NOT NULL, @updatedAt
───────────────────────────────────────────────────────────
Índices:
  - idx_ticket_cats_tenant (tenant_id)
  - uq_ticket_cat_tenant_slug UNIQUE(tenant_id, slug)
  - idx_ticket_cats_active (is_active)

Seed data (10 categorías):
  1. incidente_operacional      → postventa,    p2, 24h
  2. novedad_instalacion        → postventa,    p3, 72h
  3. ausencia_reemplazo_urgente → ops,          p1, 2h
  4. solicitud_rrhh             → rrhh,         p3, 72h
  5. permiso_vacaciones_licencia→ rrhh,         p2, 48h
  6. uniforme_implementos       → inventario,   p3, 72h
  7. activo_danado_perdido      → inventario,   p2, 48h
  8. pago_turno_extra           → finanzas,     p2, 48h
  9. conducta_disciplina        → rrhh,         p2, 48h
  10. soporte_plataforma        → it_admin,     p3, 72h
```

#### Tabla: `OpsTicket`

Ticket de seguimiento transversal.

```
Tabla: tickets (schema: ops)
───────────────────────────────────────────────────────────
Campo                    Tipo              Restricciones
───────────────────────────────────────────────────────────
id                       UUID              PK, default uuid_generate_v4()
tenant_id                String            NOT NULL, INDEX
code                     String            NOT NULL, UNIQUE
                                           Formato: "TK-YYYYMM-NNNN"
category_id              UUID              NOT NULL, FK → ops.ticket_categories(id)
status                   String            NOT NULL, default "open"
                                           enum: "open" | "in_progress" | "waiting"
                                           | "resolved" | "closed" | "cancelled"
priority                 String            NOT NULL
                                           enum: "p1" | "p2" | "p3" | "p4"
title                    String            NOT NULL
description              String?
assigned_team            String            NOT NULL
assigned_to              String?           Admin.id (usuario asignado)
installation_id          UUID?             FK → crm.installations(id)
source                   String            NOT NULL, default "manual"
                                           enum: "manual" | "incident" | "portal" | "system"
source_log_id            UUID?             FK → ops.site_log_entries(id), si viene de incidente
reported_by              String            NOT NULL (Admin.id o guardia_id en futuro)
sla_due_at               Timestamptz?      Calculado: created_at + category.sla_hours
sla_breached             Boolean           NOT NULL, default false
resolved_at              Timestamptz?
closed_at                Timestamptz?
resolution_notes         String?
tags                     String[]          Tags libres para filtrado
created_at               Timestamptz       NOT NULL, default now()
updated_at               Timestamptz       NOT NULL, @updatedAt
───────────────────────────────────────────────────────────
Índices:
  - idx_tickets_tenant (tenant_id)
  - idx_tickets_code UNIQUE(code)
  - idx_tickets_status (status)
  - idx_tickets_priority (priority)
  - idx_tickets_category (category_id)
  - idx_tickets_assigned_team (assigned_team)
  - idx_tickets_assigned_to (assigned_to)
  - idx_tickets_installation (installation_id)
  - idx_tickets_sla_due (sla_due_at)
  - idx_tickets_created (created_at DESC)
  - idx_tickets_source_log (source_log_id)
  - idx_tickets_tenant_status (tenant_id, status)
```

#### Tabla: `OpsTicketComment`

Comentarios / thread de un ticket.

```
Tabla: ticket_comments (schema: ops)
───────────────────────────────────────────────────────────
Campo                    Tipo              Restricciones
───────────────────────────────────────────────────────────
id                       UUID              PK, default uuid_generate_v4()
tenant_id                String            NOT NULL
ticket_id                UUID              NOT NULL, FK → ops.tickets(id) ON DELETE CASCADE
user_id                  String            NOT NULL (Admin.id)
body                     String            NOT NULL
is_internal              Boolean           NOT NULL, default false
                                           (true = nota interna, no visible en portal futuro)
created_at               Timestamptz       NOT NULL, default now()
updated_at               Timestamptz       NOT NULL, @updatedAt
───────────────────────────────────────────────────────────
Índices:
  - idx_ticket_comments_ticket (ticket_id)
  - idx_ticket_comments_created (created_at)
  - idx_ticket_comments_tenant (tenant_id)
```

#### Tabla: `OpsTicketAttachment`

Archivos adjuntos a tickets (reutiliza patrón de `CrmFile`).

```
Tabla: ticket_attachments (schema: ops)
───────────────────────────────────────────────────────────
Campo                    Tipo              Restricciones
───────────────────────────────────────────────────────────
id                       UUID              PK, default uuid_generate_v4()
tenant_id                String            NOT NULL
ticket_id                UUID              NOT NULL, FK → ops.tickets(id) ON DELETE CASCADE
comment_id               UUID?             FK → ops.ticket_comments(id), opcional
file_name                String            NOT NULL
mime_type                String            NOT NULL
size                     Int               NOT NULL (bytes)
storage_provider         String            NOT NULL (ej: "vercel-blob")
storage_key              String            NOT NULL (URL o key)
uploaded_by              String            NOT NULL (Admin.id)
created_at               Timestamptz       NOT NULL, default now()
───────────────────────────────────────────────────────────
Índices:
  - idx_ticket_attachments_ticket (ticket_id)
  - idx_ticket_attachments_comment (comment_id)
  - idx_ticket_attachments_tenant (tenant_id)
```

#### Modificación: `CrmInstallation`

```
Campos a agregar:
  - geo_radius_m    Int?    @default(100)   Radio geofence en metros
  - te_monto_clp    Int?                    Monto fijo TE por instalación (para Fase 1)
```

#### Enums (app-level, no Prisma enum — se validan con Zod)

```typescript
// Geofence
const GeoResult = z.enum(["ok", "override"]);
const OverrideReason = z.enum(["gps_impreciso", "punto_acceso_lejano", "emergencia", "otro"]);
const CheckinType = z.enum(["checkin", "checkout"]);

// Site Log
const SiteLogType = z.enum(["novedad", "incidente", "observacion"]);
const Severity = z.enum(["critical", "high", "medium", "low", "info"]);

// Tickets
const TicketStatus = z.enum(["open", "in_progress", "waiting", "resolved", "closed", "cancelled"]);
const TicketPriority = z.enum(["p1", "p2", "p3", "p4"]);
const TicketSource = z.enum(["manual", "incident", "portal", "system"]);
const AssignedTeam = z.enum(["postventa", "ops", "rrhh", "inventario", "finanzas", "it_admin"]);
```

### D.3) APIs

#### Postventa

| # | Método | Ruta | Descripción | Auth |
|---|--------|------|-------------|------|
| 1 | `POST` | `/api/ops/postventa/checkin` | Registrar check-in georreferenciado | supervisor+ |
| 2 | `POST` | `/api/ops/postventa/checkout` | Registrar check-out (cierre de visita) | supervisor+ |
| 3 | `GET` | `/api/ops/postventa/visits` | Listar visitas (check-ins) con filtros | editor+ |
| 4 | `GET` | `/api/ops/postventa/visits/[id]` | Detalle de una visita | editor+ |
| 5 | `GET` | `/api/ops/postventa/bitacora` | Listar entradas de bitácora | editor+ |
| 6 | `POST` | `/api/ops/postventa/bitacora` | Crear entrada de bitácora | supervisor+ |
| 7 | `GET` | `/api/ops/postventa/bitacora/[id]` | Detalle entrada bitácora | editor+ |
| 8 | `PATCH` | `/api/ops/postventa/bitacora/[id]` | Editar entrada bitácora | supervisor+ |
| 9 | `POST` | `/api/ops/postventa/bitacora/[id]/escalate` | Escalar incidente a ticket | supervisor+ |
| 10 | `GET` | `/api/ops/postventa/kpis` | KPIs de postventa | editor+ |

#### Tickets

| # | Método | Ruta | Descripción | Auth |
|---|--------|------|-------------|------|
| 11 | `GET` | `/api/ops/tickets` | Listar tickets con filtros | editor+ |
| 12 | `POST` | `/api/ops/tickets` | Crear ticket | supervisor+ |
| 13 | `GET` | `/api/ops/tickets/[id]` | Detalle de ticket | editor+ |
| 14 | `PATCH` | `/api/ops/tickets/[id]` | Actualizar ticket (status, asignación, etc.) | editor+ |
| 15 | `POST` | `/api/ops/tickets/[id]/comments` | Agregar comentario | supervisor+ |
| 16 | `POST` | `/api/ops/tickets/[id]/attachments` | Subir adjunto | supervisor+ |
| 17 | `GET` | `/api/ops/tickets/categories` | Listar categorías de tickets | editor+ |
| 18 | `POST` | `/api/ops/tickets/categories` | Crear categoría (admin+) | admin+ |
| 19 | `PATCH` | `/api/ops/tickets/categories/[id]` | Editar categoría | admin+ |

#### Payloads principales

**POST `/api/ops/postventa/checkin`**

```json
// Request
{
  "installationId": "uuid",
  "lat": -33.4489,
  "lng": -70.6693,
  "accuracyM": 15.5,
  "overrideReason": "gps_impreciso",        // solo si override
  "overrideJustification": "Punto de acceso en subterráneo", // solo si override
  "overridePhotoUrl": "https://...",         // solo si override
  "notes": "Visita rutinaria"
}

// Response 201
{
  "id": "uuid",
  "type": "checkin",
  "geoResult": "ok",          // "ok" | "override"
  "distanceM": 45.2,
  "installationName": "Edificio Central",
  "createdAt": "2026-02-10T14:30:00Z"
}

// Error 422
{
  "error": "OVERRIDE_REQUIRED",
  "message": "Estás a 250m de la instalación (radio: 100m). Debes justificar.",
  "distanceM": 250,
  "radiusM": 100
}
```

**POST `/api/ops/postventa/checkout`**

```json
// Request
{
  "checkinId": "uuid",
  "lat": -33.4489,
  "lng": -70.6693,
  "accuracyM": 10.0,
  "overrideReason": null,
  "notes": "Sin novedades"
}

// Response 200
{
  "id": "uuid",
  "type": "checkout",
  "geoResult": "ok",
  "durationMinutes": 45,
  "checkinId": "uuid"
}
```

**POST `/api/ops/tickets`**

```json
// Request
{
  "categoryId": "uuid",
  "title": "Guardia no se presentó turno nocturno",
  "description": "El guardia asignado al turno 22:00-06:00 no se presentó...",
  "installationId": "uuid",
  "priority": "p1",             // opcional, default viene de categoría
  "tags": ["urgente", "turno_nocturno"]
}

// Response 201
{
  "id": "uuid",
  "code": "TK-202602-0001",
  "status": "open",
  "priority": "p1",
  "assignedTeam": "ops",
  "slaDueAt": "2026-02-10T16:30:00Z",
  "createdAt": "2026-02-10T14:30:00Z"
}
```

**POST `/api/ops/postventa/bitacora/[id]/escalate`**

```json
// Request
{
  "categoryId": "uuid",
  "additionalNotes": "Requiere atención inmediata"
}

// Response 201
{
  "ticket": {
    "id": "uuid",
    "code": "TK-202602-0002",
    "source": "incident",
    "sourceLogId": "uuid-del-incidente"
  },
  "logEntry": {
    "id": "uuid-del-incidente",
    "ticketId": "uuid"
  }
}
```

**GET `/api/ops/postventa/kpis`**

```json
// Query params: ?desde=2026-02-01&hasta=2026-02-10&installationId=uuid (opcional)

// Response 200
{
  "period": { "from": "2026-02-01", "to": "2026-02-10" },
  "totalVisits": 45,
  "uniqueInstallations": 12,
  "avgDurationMinutes": 38,
  "overrideRate": 0.08,         // 8% de check-ins fueron override
  "totalLogEntries": 67,
  "incidentCount": 5,
  "incidentsBySevertiy": { "critical": 1, "high": 2, "medium": 2 },
  "ticketsCreated": 3,
  "ticketsResolved": 1,
  "slaComplianceRate": 0.85     // 85% resueltos dentro de SLA
}
```

#### Validaciones y errores esperados

| Endpoint | Validación | Error |
|----------|-----------|-------|
| POST checkin | Instalación no tiene lat/lng/radius | 422: `INSTALLATION_NO_GEOFENCE` |
| POST checkin | Ya existe check-in abierto (sin checkout) para este usuario en esta instalación | 409: `CHECKIN_ALREADY_OPEN` |
| POST checkin | Override sin los 3 campos obligatorios | 422: `OVERRIDE_INCOMPLETE` |
| POST checkout | No existe check-in abierto con ese ID | 404: `CHECKIN_NOT_FOUND` |
| POST checkout | Check-in ya cerrado | 409: `CHECKIN_ALREADY_CLOSED` |
| POST ticket | Categoría inactiva | 422: `CATEGORY_INACTIVE` |
| POST escalate | Log entry ya tiene ticket asociado | 409: `ALREADY_ESCALATED` |
| PATCH ticket | Transición de status inválida (ej: closed → open) | 422: `INVALID_STATUS_TRANSITION` |

### D.4) UI / Páginas

#### Lista de páginas nuevas

| # | Ruta | Título | Tipo | Mobile-first |
|---|------|--------|------|:------------:|
| 1 | `/postventa` | Dashboard Postventa | Dashboard | ✅ |
| 2 | `/postventa/checkin` | Check-in / Check-out | Acción | ✅ Primario |
| 3 | `/postventa/visitas` | Historial de Visitas | Lista | ✅ |
| 4 | `/postventa/instalaciones/[id]/bitacora` | Bitácora Instalación | Lista + Form | ✅ |
| 5 | `/postventa/incidentes` | Incidentes | Lista filtrable | ✅ |
| 6 | `/postventa/kpis` | KPIs Postventa | Dashboard | ✅ |
| 7 | `/tickets` | Bandeja de Tickets | Lista filtrable | ✅ |
| 8 | `/tickets/[id]` | Detalle Ticket | Detalle + Thread | ✅ |
| 9 | `/opai/configuracion/tickets` | Configurar Categorías | Admin config | ❌ Desktop |

#### Wireframes textuales

**Página: `/postventa/checkin` (Mobile-first — acción principal del supervisor)**

```
┌──────────────────────────────────────┐
│ ← Postventa           [Avatar] [🔔] │ ← AppTopbar
├──────────────────────────────────────┤
│                                      │
│  📍 Check-in de Visita               │ ← Título
│                                      │
│  ┌────────────────────────────────┐  │
│  │ 🔍 Buscar instalación...      │  │ ← Select/search instalación
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ 🏢 Edificio Central            │  │ ← Instalación seleccionada
│  │ Av. Providencia 1234           │  │
│  │ Radio: 100m                    │  │
│  │ 📍 -33.4489, -70.6693         │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ Tu ubicación actual:           │  │ ← GPS del dispositivo
│  │ 📍 -33.4491, -70.6690         │  │
│  │ Precisión: ±15m                │  │
│  │ Distancia: 35m ✅ DENTRO       │  │ ← o ⚠️ FUERA (250m)
│  └────────────────────────────────┘  │
│                                      │
│  [Si está FUERA del radio:]          │
│  ┌────────────────────────────────┐  │
│  │ ⚠️ Estás fuera del radio      │  │
│  │                                │  │
│  │ Motivo: [Select]               │  │
│  │ Justificación: [Textarea]      │  │
│  │ Foto: [📷 Tomar foto]         │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ Notas (opcional): [Textarea]   │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │    📍 REGISTRAR CHECK-IN       │  │ ← Botón principal
│  └────────────────────────────────┘  │
│                                      │
│  [Si hay check-in abierto:]          │
│  ┌────────────────────────────────┐  │
│  │ ✅ Check-in activo             │  │
│  │ Edificio Central               │  │
│  │ Desde: 14:30 (hace 25 min)    │  │
│  │                                │  │
│  │ [📝 REGISTRAR CHECK-OUT]      │  │
│  └────────────────────────────────┘  │
│                                      │
├──────────────────────────────────────┤
│ 🏠  📍  📋  🎫  👤                  │ ← BottomNav (5 items)
│ Hub  PV  Bitác Tick Perfil           │
└──────────────────────────────────────┘
```

**Página: `/postventa/instalaciones/[id]/bitacora` (Bitácora de instalación)**

```
┌──────────────────────────────────────┐
│ ← Bitácora            [Avatar] [🔔] │
├──────────────────────────────────────┤
│ 🏢 Edificio Central                  │ ← Nombre instalación
│ Av. Providencia 1234                  │
├──────────────────────────────────────┤
│ Filtros: [Tipo ▼] [Severidad ▼]      │
│          [Desde] [Hasta]              │
├──────────────────────────────────────┤
│ + Nueva entrada                       │ ← FAB o botón
├──────────────────────────────────────┤
│                                      │
│  ┌────────────────────────────────┐  │
│  │ 🔴 INCIDENTE  |  Alta  |  Hoy │  │ ← Card con badge tipo + severidad
│  │ Puerta de emergencia trabada   │  │
│  │ Se detectó que la puerta...    │  │
│  │ 📷 2 fotos  🎫 → TK-202602   │  │ ← Indicador ticket asociado
│  │ Por: Juan Pérez                │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ 🟡 NOVEDAD   |  Media  | Ayer │  │
│  │ Cámara sector B sin imagen    │  │
│  │ La cámara del sector B no...  │  │
│  │ 📷 1 foto                     │  │
│  │ Por: Juan Pérez                │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ 🟢 OBSERVACIÓN | Info | 08/02 │  │
│  │ Iluminación correcta          │  │
│  │ Todo en orden en el sector... │  │
│  │ Por: María López              │  │
│  └────────────────────────────────┘  │
│                                      │
│  [Cargar más...]                     │
│                                      │
├──────────────────────────────────────┤
│ 🏠  📍  📋  🎫  👤                  │
└──────────────────────────────────────┘
```

**Página: `/tickets` (Bandeja de tickets)**

```
┌──────────────────────────────────────┐
│ Tickets                [Avatar] [🔔] │
├──────────────────────────────────────┤
│ [Abiertos: 12] [En prog: 5] [Todos] │ ← Tabs de estado con contadores
├──────────────────────────────────────┤
│ Filtros: [Equipo ▼] [Prioridad ▼]   │
│          [Instalación ▼] [Mi asig.]  │
├──────────────────────────────────────┤
│ + Nuevo ticket                        │
├──────────────────────────────────────┤
│                                      │
│  ┌────────────────────────────────┐  │
│  │ 🔴 P1 | TK-202602-0001        │  │ ← Prioridad + código
│  │ Guardia no se presentó turno   │  │ ← Título
│  │ 🏢 Edificio Central            │  │ ← Instalación
│  │ 👥 Ops  →  Juan Pérez         │  │ ← Equipo + asignado
│  │ ⏱️ SLA: 1h 30m restante       │  │ ← Tiempo SLA (rojo si próximo a vencer)
│  │ 💬 3 comentarios               │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ 🟡 P2 | TK-202602-0002        │  │
│  │ Puerta emergencia trabada     │  │
│  │ 🏢 Edificio Central            │  │
│  │ 👥 Postventa  →  Sin asignar  │  │
│  │ ⏱️ SLA: 20h restante          │  │
│  │ 📎 1 adjunto  💬 1            │  │
│  └────────────────────────────────┘  │
│                                      │
│  [Cargar más...]                     │
│                                      │
├──────────────────────────────────────┤
│ 🏠  📍  📋  🎫  👤                  │
└──────────────────────────────────────┘
```

**Página: `/tickets/[id]` (Detalle de ticket)**

```
┌──────────────────────────────────────┐
│ ← Tickets             [Avatar] [🔔] │
├──────────────────────────────────────┤
│ TK-202602-0001                        │ ← Código
│ Guardia no se presentó turno nocturno │ ← Título
├──────────────────────────────────────┤
│ Estado: [🟢 Abierto ▼]  Prioridad: [🔴 P1 ▼] │ ← Editables
│ Equipo: Ops            Asignado: [Juan ▼]      │
│ SLA: ⏱️ Vence en 1h 30m                        │
│ Instalación: Edificio Central                    │
│ Creado: 10 feb 2026, 14:30 por María López      │
├──────────────────────────────────────┤
│ 📎 Adjuntos (1)                      │
│  ├ foto-puerta.jpg (1.2 MB) [⬇️]    │
├──────────────────────────────────────┤
│ Origen: 🔗 Incidente #1234           │ ← Si viene de incidente
├──────────────────────────────────────┤
│ 💬 Conversación                       │ ← Thread
│                                      │
│  ┌────────────────────────────────┐  │
│  │ María López · 14:30            │  │
│  │ El guardia del turno 22-06 no │  │
│  │ se presentó. Se necesita       │  │
│  │ reemplazo urgente.             │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ Juan Pérez · 14:45             │  │
│  │ Contactando guardia de         │  │
│  │ reemplazo. ETA 30 minutos.     │  │
│  │ 🔒 Nota interna                │  │ ← Badge si is_internal
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ [Escribe un comentario...]     │  │
│  │ ☐ Nota interna  [📎] [Enviar] │  │
│  └────────────────────────────────┘  │
│                                      │
├──────────────────────────────────────┤
│ 🏠  📍  📋  🎫  👤                  │
└──────────────────────────────────────┘
```

### D.5) Jobs / Automatismos

#### Job 1: SLA Monitor (`ops_sla_monitor`)

- **Frecuencia:** Cada 15 minutos (cron) o event-driven al crear/actualizar ticket
- **Lógica:**
  1. Buscar tickets con `status IN ('open', 'in_progress', 'waiting')` y `sla_due_at <= NOW()`
  2. Marcar `sla_breached = true`
  3. Crear notificación para `assigned_to` y equipo
  4. Registrar en `AuditLog`
- **Idempotencia:** Solo actualiza si `sla_breached = false` (no re-notifica)
- **Endpoint:** `GET /api/cron/sla-monitor` (protegido por CRON_SECRET)

#### Job 2: Ticket Code Generator (en tiempo real, no job)

- **Lógica:** Al crear ticket, generar código `TK-YYYYMM-NNNN` secuencial por tenant y mes
- **Implementación:** Query `MAX(code)` filtrado por tenant + mes actual, incrementar
- **Concurrencia:** Usar transaction con `SELECT FOR UPDATE` o retry en caso de conflicto unique

#### Automatismo: Notificaciones

| Evento | Notificación | Destinatario |
|--------|-------------|-------------|
| Check-in con override | "Check-in override en {instalación}" | Admin/Owner |
| Incidente severity=critical | "Incidente crítico en {instalación}" | Admin/Owner + Equipo postventa |
| Ticket creado P1 | "Ticket P1 creado: {título}" | assigned_team |
| Ticket SLA próximo a vencer (< 1h) | "SLA próximo a vencer: {código}" | assigned_to |
| Ticket SLA vencido | "SLA vencido: {código}" | assigned_to + Admin |

---

## E) Plan de Implementación por PRs

### PR1: Base de datos — Migraciones + Modelos Prisma

**Objetivo:** Crear todas las tablas nuevas y modificar `CrmInstallation`.

**Archivos a crear:**
- `prisma/migrations/XXXXXX_etapa2_ops_schema/migration.sql`

**Archivos a modificar:**
- `prisma/schema.prisma` — Agregar schema `ops`, 6 modelos nuevos, 2 campos en `CrmInstallation`

**Detalle de cambios en `schema.prisma`:**

1. Agregar `"ops"` a `datasource.db.schemas`
2. Agregar `geo_radius_m` y `te_monto_clp` a `CrmInstallation`
3. Crear modelo `OpsVisitCheckin`
4. Crear modelo `OpsSiteLogEntry`
5. Crear modelo `OpsTicketCategory`
6. Crear modelo `OpsTicket`
7. Crear modelo `OpsTicketComment`
8. Crear modelo `OpsTicketAttachment`

**Checklist:**
- [ ] Schema compila sin errores (`npx prisma validate`)
- [ ] Migración genera SQL correcto (`npx prisma migrate dev`)
- [ ] Seed de 10 categorías de tickets funciona
- [ ] Índices verificados en DB
- [ ] `CrmInstallation` acepta `geo_radius_m` sin romper existente

**Criterios de aceptación:**
- `npx prisma migrate deploy` exitoso en ambiente de staging
- Tablas creadas con campos, FK e índices correctos
- Seed de categorías insertado

**Rollback:** `npx prisma migrate resolve` + SQL de rollback para DROP tables

---

### PR2: RBAC + Validaciones + Utilidades

**Objetivo:** Extender sistema de roles/permisos y crear schemas de validación Zod.

**Archivos a crear:**
- `src/lib/validations/ops.ts` — Schemas Zod para postventa y tickets
- `src/lib/geo.ts` — Utilidad de cálculo Haversine para geofence

**Archivos a modificar:**
- `src/lib/rbac.ts` — Agregar permisos: `MANAGE_POSTVENTA`, `VIEW_POSTVENTA`, `MANAGE_TICKETS`, `VIEW_TICKETS`, `MANAGE_TICKET_CATEGORIES`
- `src/lib/app-access.ts` — Agregar acceso a módulo `ops` para `supervisor`, `editor+`
- `src/lib/module-access.ts` — Agregar submodules de ops (postventa, tickets, kpis, ticket_config)
- `src/components/opai/AppSidebar.tsx` — Agregar items de navegación: Postventa, Tickets

**Checklist:**
- [ ] `hasPermission('supervisor', 'MANAGE_POSTVENTA')` retorna `true`
- [ ] `hasPermission('viewer', 'MANAGE_POSTVENTA')` retorna `false`
- [ ] `haversineDistance(lat1, lng1, lat2, lng2)` calcula correctamente
- [ ] Schemas Zod validan payloads de checkin, checkout, ticket, comment
- [ ] Sidebar muestra items de Postventa y Tickets para roles con acceso
- [ ] Editor y superior ven Tickets; Supervisor+ ve Postventa

**Criterios de aceptación:**
- Tests unitarios para `haversineDistance` con casos conocidos
- Todos los schemas Zod rechazan payloads inválidos
- Navegación condicionada por rol

**Rollback:** Revertir cambios en RBAC (sin impacto en DB)

---

### PR3: Endpoints Core Postventa

**Objetivo:** APIs de check-in/out y bitácora.

**Archivos a crear:**
- `src/app/api/ops/postventa/checkin/route.ts`
- `src/app/api/ops/postventa/checkout/route.ts`
- `src/app/api/ops/postventa/visits/route.ts`
- `src/app/api/ops/postventa/visits/[id]/route.ts`
- `src/app/api/ops/postventa/bitacora/route.ts`
- `src/app/api/ops/postventa/bitacora/[id]/route.ts`
- `src/app/api/ops/postventa/bitacora/[id]/escalate/route.ts`
- `src/app/api/ops/postventa/kpis/route.ts`

**Checklist:**
- [ ] POST checkin valida geofence y crea registro
- [ ] POST checkin detecta override y requiere 3 campos
- [ ] POST checkout valida check-in abierto y calcula duración
- [ ] POST bitacora crea entrada con tipo y severidad
- [ ] POST escalate crea ticket desde incidente con FK bidireccional
- [ ] GET kpis retorna métricas agregadas con filtros de fecha
- [ ] Todos los endpoints validan tenant, auth y rol
- [ ] Todos los endpoints registran AuditLog
- [ ] Errores retornan códigos y mensajes según tabla de errores

**Criterios de aceptación:**
- Check-in dentro de radio → `geo_result: "ok"`
- Check-in fuera de radio sin override → Error 422
- Check-in fuera de radio con override completo → `geo_result: "override"`
- Checkout calcula duración correctamente
- Escalate crea ticket con `source: "incident"` y referencia cruzada

**Rollback:** Eliminar archivos de API (sin impacto en DB ni en rutas existentes)

---

### PR4: Endpoints Core Tickets

**Objetivo:** APIs de tickets, comentarios, adjuntos y categorías.

**Archivos a crear:**
- `src/app/api/ops/tickets/route.ts`
- `src/app/api/ops/tickets/[id]/route.ts`
- `src/app/api/ops/tickets/[id]/comments/route.ts`
- `src/app/api/ops/tickets/[id]/attachments/route.ts`
- `src/app/api/ops/tickets/categories/route.ts`
- `src/app/api/ops/tickets/categories/[id]/route.ts`

**Checklist:**
- [ ] POST tickets genera código secuencial `TK-YYYYMM-NNNN`
- [ ] POST tickets calcula `sla_due_at` desde categoría
- [ ] PATCH tickets valida transiciones de estado
- [ ] POST comments soporta `is_internal` flag
- [ ] POST attachments sube archivo y crea registro
- [ ] GET tickets soporta filtros: status, priority, team, installation, assigned_to
- [ ] GET tickets incluye paginación server-side
- [ ] Categorías CRUD protegido por rol admin+

**Criterios de aceptación:**
- Crear ticket → código generado, SLA calculado, notificación enviada
- Cambiar estado `open → in_progress` → OK
- Cambiar estado `closed → open` → Error 422
- Comentario con `is_internal: true` → marcado correctamente
- Adjunto subido → almacenado y referenciado

**Rollback:** Eliminar archivos de API

---

### PR5: UI Postventa (Mobile-first)

**Objetivo:** Páginas de check-in/out, bitácora, incidentes y KPIs.

**Archivos a crear:**
- `src/app/(app)/postventa/page.tsx` — Dashboard postventa
- `src/app/(app)/postventa/layout.tsx` — Layout con subnav
- `src/app/(app)/postventa/checkin/page.tsx` — Check-in/out mobile
- `src/app/(app)/postventa/visitas/page.tsx` — Historial visitas
- `src/app/(app)/postventa/instalaciones/[id]/bitacora/page.tsx` — Bitácora
- `src/app/(app)/postventa/incidentes/page.tsx` — Lista incidentes
- `src/app/(app)/postventa/kpis/page.tsx` — KPIs
- `src/components/postventa/PostventaSubnav.tsx`
- `src/components/postventa/CheckinClient.tsx`
- `src/components/postventa/VisitasClient.tsx`
- `src/components/postventa/BitacoraClient.tsx`
- `src/components/postventa/IncidentesClient.tsx`
- `src/components/postventa/KpisClient.tsx`
- `src/components/postventa/CheckinCard.tsx`
- `src/components/postventa/LogEntryCard.tsx`
- `src/components/postventa/EscalateModal.tsx`
- `src/components/postventa/NewLogEntryModal.tsx`

**Archivos a modificar:**
- `src/components/opai/BottomNav.tsx` — Agregar item Postventa
- `src/app/(app)/crm/installations/[id]/page.tsx` — Agregar link a bitácora (opcional)

**Checklist:**
- [ ] Check-in solicita permiso GPS al usuario
- [ ] Check-in muestra distancia en tiempo real
- [ ] Override muestra campos adicionales solo cuando está fuera de radio
- [ ] Bitácora muestra cards con tipo + severidad coloreada
- [ ] Incidente con botón "Escalar a ticket"
- [ ] KPIs muestra métricas con KpiCard reutilizado
- [ ] Todas las páginas responsivas (mobile → desktop)
- [ ] Empty states para listas vacías
- [ ] Loading states durante fetch

**Criterios de aceptación:**
- Supervisor puede hacer check-in desde móvil
- Supervisor puede crear entrada de bitácora con fotos
- Supervisor puede escalar incidente a ticket
- KPIs muestran datos correctos del período seleccionado

**Rollback:** Eliminar archivos de páginas y componentes

---

### PR6: UI Tickets

**Objetivo:** Bandeja de tickets, detalle con thread, configuración de categorías.

**Archivos a crear:**
- `src/app/(app)/tickets/page.tsx` — Bandeja
- `src/app/(app)/tickets/layout.tsx` — Layout
- `src/app/(app)/tickets/[id]/page.tsx` — Detalle
- `src/app/(app)/opai/configuracion/tickets/page.tsx` — Config categorías
- `src/components/tickets/TicketsClient.tsx`
- `src/components/tickets/TicketDetailClient.tsx`
- `src/components/tickets/TicketCard.tsx`
- `src/components/tickets/TicketCommentThread.tsx`
- `src/components/tickets/TicketStatusSelect.tsx`
- `src/components/tickets/TicketPriorityBadge.tsx`
- `src/components/tickets/TicketFilters.tsx`
- `src/components/tickets/CreateTicketModal.tsx`
- `src/components/tickets/TicketCategoriesConfig.tsx`
- `src/components/tickets/SlaBadge.tsx`

**Archivos a modificar:**
- `src/components/opai/AppSidebar.tsx` — Item Tickets ya agregado en PR2
- `src/components/opai/ConfigSubnav.tsx` — Agregar "Categorías de tickets"

**Checklist:**
- [ ] Bandeja muestra tickets con cards que incluyen código, prioridad, SLA
- [ ] Tabs de estado con contadores
- [ ] Filtros por equipo, prioridad, instalación, "mis asignados"
- [ ] Detalle muestra thread de comentarios cronológico
- [ ] Notas internas diferenciadas visualmente
- [ ] Adjuntos con preview/descarga
- [ ] Estado y prioridad editables inline
- [ ] Config de categorías: CRUD con SLA y equipo
- [ ] Todas las páginas responsivas

**Criterios de aceptación:**
- Usuario puede crear ticket desde bandeja
- Usuario puede filtrar por múltiples criterios
- Usuario puede agregar comentarios y adjuntos
- Admin puede configurar categorías de tickets

**Rollback:** Eliminar archivos de páginas y componentes

---

### PR7: Cron SLA + Notificaciones + Pulido final

**Objetivo:** Job de SLA, notificaciones automáticas, integración final.

**Archivos a crear:**
- `src/app/api/cron/sla-monitor/route.ts`

**Archivos a modificar:**
- `src/app/api/ops/postventa/checkin/route.ts` — Agregar notificación en override
- `src/app/api/ops/postventa/bitacora/route.ts` — Agregar notificación en incidente crítico
- `src/app/api/ops/tickets/route.ts` — Agregar notificación al crear ticket P1
- `src/components/opai/CommandPalette.tsx` — Agregar búsqueda de tickets (opcional)

**Checklist:**
- [ ] Cron SLA marca tickets vencidos
- [ ] Notificación enviada a asignado cuando SLA vence
- [ ] Override check-in genera notificación admin
- [ ] Incidente crítico genera notificación
- [ ] Ticket P1 genera notificación a equipo
- [ ] Todas las notificaciones aparecen en NotificationBell

**Criterios de aceptación:**
- Ticket con SLA de 2h creado → después de 2h → `sla_breached = true` + notificación
- Override check-in → admin recibe notificación
- Incidente crítico → equipo recibe notificación

**Rollback:** Eliminar cron endpoint, revertir cambios en endpoints existentes

---

## F) Criterios de Aceptación (Given/When/Then)

### Feature: Check-in georreferenciado

```gherkin
Scenario: Check-in exitoso dentro del radio
  Given un supervisor autenticado
  And una instalación "Edificio Central" con lat=-33.4489, lng=-70.6693, radio=100m
  And el supervisor está a 35m de la instalación
  When el supervisor registra check-in con su posición GPS
  Then se crea un registro visit_checkin con type="checkin", geo_result="ok"
  And se muestra confirmación con distancia=35m
  And se registra en AuditLog

Scenario: Check-in fuera del radio sin override
  Given un supervisor autenticado
  And una instalación con radio=100m
  And el supervisor está a 250m de la instalación
  When el supervisor intenta registrar check-in sin datos de override
  Then se retorna error 422 con código OVERRIDE_REQUIRED
  And se muestra la distancia y el radio al supervisor

Scenario: Check-in fuera del radio con override completo
  Given un supervisor autenticado
  And el supervisor está a 250m de la instalación
  When el supervisor registra check-in con motivo="gps_impreciso", 
       justificación="Subterráneo sin señal", y foto adjunta
  Then se crea registro con geo_result="override"
  And se genera notificación para admin
  And se registra en AuditLog con detalle del override

Scenario: Check-in duplicado (ya tiene check-in abierto)
  Given un supervisor con check-in abierto en "Edificio Central"
  When intenta hacer otro check-in en la misma instalación
  Then se retorna error 409 CHECKIN_ALREADY_OPEN
```

### Feature: Check-out

```gherkin
Scenario: Check-out exitoso
  Given un supervisor con check-in abierto hace 45 minutos
  When el supervisor registra check-out
  Then se crea registro type="checkout" con duration_minutes=45
  And se vincula al check-in original via paired_checkin_id

Scenario: Check-out sin check-in previo
  Given un supervisor sin check-in abierto
  When intenta registrar check-out con un checkin_id inválido
  Then se retorna error 404 CHECKIN_NOT_FOUND
```

### Feature: Bitácora

```gherkin
Scenario: Crear entrada de bitácora tipo novedad
  Given un supervisor autenticado con check-in activo en "Edificio Central"
  When crea entrada con type="novedad", severity="medium", 
       título="Cámara sector B sin imagen"
  Then se crea registro site_log_entry asociado a la instalación
  And aparece en la lista de bitácora de la instalación

Scenario: Crear incidente crítico
  Given un supervisor autenticado
  When crea entrada con type="incidente", severity="critical"
  Then se crea registro site_log_entry
  And se genera notificación para equipo postventa y admin
```

### Feature: Escalar incidente a ticket

```gherkin
Scenario: Escalar incidente a ticket
  Given un incidente registrado sin ticket asociado
  When el supervisor escala el incidente seleccionando categoría "incidente_operacional"
  Then se crea ticket con source="incident", source_log_id apuntando al incidente
  And el incidente se actualiza con ticket_id
  And el ticket hereda instalación y descripción del incidente

Scenario: Intentar escalar incidente ya escalado
  Given un incidente que ya tiene ticket asociado
  When se intenta escalar nuevamente
  Then se retorna error 409 ALREADY_ESCALATED
```

### Feature: Tickets CRUD

```gherkin
Scenario: Crear ticket manual
  Given un usuario con rol supervisor+
  When crea ticket con categoría "ausencia_reemplazo_urgente" en "Edificio Central"
  Then se genera código TK-202602-0001
  And prioridad = P1 (de la categoría)
  And assigned_team = "ops" (de la categoría)
  And sla_due_at = created_at + 2h (de la categoría)
  And se genera notificación para equipo ops

Scenario: Cambiar estado de ticket
  Given un ticket en estado "open"
  When un usuario cambia estado a "in_progress"
  Then el estado se actualiza
  And se registra en AuditLog

Scenario: Transición de estado inválida
  Given un ticket en estado "closed"
  When un usuario intenta cambiar estado a "open"
  Then se retorna error 422 INVALID_STATUS_TRANSITION

Scenario: Agregar comentario a ticket
  Given un ticket existente
  When un usuario agrega comentario con is_internal=true
  Then el comentario se crea marcado como nota interna
  And aparece en el thread con badge visual diferenciado
```

### Feature: SLA Monitor

```gherkin
Scenario: Ticket supera SLA
  Given un ticket P1 con sla_due_at = hace 10 minutos
  And sla_breached = false
  When se ejecuta el job sla-monitor
  Then sla_breached se marca como true
  And se genera notificación para el asignado y admin

Scenario: Ticket ya marcado como breach (idempotencia)
  Given un ticket con sla_breached = true
  When se ejecuta el job sla-monitor
  Then no se genera nueva notificación
  And no se modifica el registro
```

### Pruebas manuales mínimas

| # | Prueba | Pasos | Resultado esperado |
|---|--------|-------|-------------------|
| 1 | Check-in mobile | Abrir `/postventa/checkin` en móvil, seleccionar instalación, aceptar GPS, enviar | Check-in creado, confirmación visual |
| 2 | Override check-in | Estar lejos de instalación, completar motivo+justificación+foto | Override registrado, notificación admin |
| 3 | Check-out | Con check-in abierto, registrar checkout | Duración calculada correctamente |
| 4 | Bitácora | Crear novedad con foto en bitácora de instalación | Entrada visible en lista |
| 5 | Escalar incidente | Crear incidente → escalar a ticket | Ticket creado con referencia cruzada |
| 6 | Crear ticket manual | Desde bandeja, crear ticket seleccionando categoría | Código generado, SLA calculado |
| 7 | Comentar ticket | Abrir ticket, escribir comentario, enviar | Comentario visible en thread |
| 8 | Filtrar tickets | Aplicar filtro por equipo + prioridad | Lista filtrada correctamente |
| 9 | SLA vencido | Crear ticket P1 (SLA 2h), esperar/simular → ejecutar cron | `sla_breached = true` |
| 10 | Config categorías | Admin → Config → Tickets → editar SLA de categoría | SLA actualizado |

---

## G) Riesgos y Mitigaciones

### Performance

| Riesgo | Impacto | Probabilidad | Mitigación |
|--------|---------|:------------:|-----------|
| Queries de KPI lentas con muchos registros | UX degradada en dashboard | Media | Índices compuestos `(tenant_id, created_at)`. Rangos de fecha obligatorios (max 90 días). Cache en futuro |
| Listado de tickets sin paginación | Timeout en tenants con muchos tickets | Alta | Paginación server-side obligatoria (limit/offset). Default 20 items |
| GPS impreciso en interiores | Falsos override constantes | Alta | Tolerancia configurable por instalación (`geo_radius_m`). Default 100m generoso. UX clara sobre precisión |

### Consistencia de datos

| Riesgo | Impacto | Probabilidad | Mitigación |
|--------|---------|:------------:|-----------|
| Código de ticket duplicado (concurrencia) | Error al crear ticket | Baja | Constraint UNIQUE en DB + retry en caso de conflicto |
| Check-in sin checkout (usuario olvida) | Visitas abiertas indefinidamente | Alta | Job futuro para auto-cerrar check-ins > 8h. Warning en UI |
| SLA calculado incorrectamente (timezone) | Breach prematuro o tardío | Media | Usar UTC para todo cálculo. Mostrar hora local solo en UI |
| Incidente escalado a ticket, luego se edita incidente | Datos inconsistentes entre log y ticket | Baja | El ticket mantiene snapshot del incidente. Edición del log no afecta ticket |

### Edge cases

| Case | Impacto | Mitigación |
|------|---------|-----------|
| Instalación sin coordenadas GPS | No se puede validar geofence | Bloquear check-in con error `INSTALLATION_NO_GEOFENCE`. UI muestra warning |
| Supervisor hace check-in en 2 instalaciones simultáneamente | Datos de visita ambiguos | Permitido: un supervisor puede visitar múltiples sitios. No bloquear |
| Ticket asignado a usuario que ya no existe | Ticket huérfano | FK a Admin. Si se desactiva admin, reasignar tickets pendientes |
| Upload de foto muy grande en override | Timeout en mobile con red lenta | Limite 5MB por foto. Compresión client-side antes de upload |
| Muchos tickets P1 simultáneos | Saturación de notificaciones | Rate limiting en notificaciones: max 1 por tipo cada 5 min por usuario |

### Seguridad y roles

| Riesgo | Impacto | Mitigación |
|--------|---------|-----------|
| Supervisor accede a datos de otro tenant | Data leak | Filtro `tenantId` obligatorio en TODAS las queries (patrón existente) |
| Editor crea tickets en nombre de otro usuario | Suplantación | `reported_by` siempre es el usuario de sesión. No aceptar input |
| Viewer intenta crear check-in | Acceso no autorizado | Validación de rol en cada endpoint. Middleware de permisos |
| Override sin foto real (foto genérica) | Evasión de control | Auditoría. Revisión manual de overrides en dashboard KPI |

---

## H) Supuestos y Preguntas Abiertas

### Supuestos asumidos

| # | Supuesto | Justificación | Impacto si es incorrecto |
|---|----------|---------------|--------------------------|
| S1 | El actor del check-in es un `Admin` con rol `supervisor` (no un `guardia`) | La tabla `persona`/`guardia` no existe aún (Fase 1 pendiente). El MASTER_SPEC dice que supervisores hacen check-in/out postventa | Si se quiere que guardias hagan check-in, se necesita crear la tabla `guardia` primero o agregar FK opcional |
| S2 | Las fotos de override y bitácora se suben a Vercel Blob (mismo provider que `CrmFile`) | El repo ya usa un storage provider para archivos CRM | Si se usa otro provider, ajustar lógica de upload |
| S3 | Los tickets no tienen workflow de aprobación (solo cambios de estado lineales) | El MASTER_SPEC define tickets como seguimiento, no como aprobación formal | Si se necesita aprobación, agregar estado `pending_approval` |
| S4 | El SLA se calcula en horas calendario (no horas hábiles) | El MASTER_SPEC dice `sla_hours` sin especificar hábil/calendario | Si se necesita horas hábiles, la lógica de cálculo se complejiza significativamente |
| S5 | No se implementa upload de fotos en real-time (check-in). Se usa URL de foto ya subida | Simplifica la implementación. El flujo es: subir foto → obtener URL → enviar check-in | Si se quiere captura y upload en un solo paso, se necesita un endpoint de upload separado |
| S6 | Las transiciones de estado de ticket válidas son: `open → in_progress → waiting/resolved → closed` y `* → cancelled` | Patrón estándar de gestión de tickets | Si se necesitan transiciones más complejas, definir máquina de estados |
| S7 | Los KPIs de postventa se calculan en tiempo real (queries) y no se materializan | Volumen esperado bajo-medio en fase inicial | Si el volumen crece, considerar materialización o cache |
| S8 | El rol `supervisor` no existe actualmente en RBAC y se debe crear | `rbac.ts` tiene: owner, admin, editor, viewer. No tiene supervisor | Se agrega como nuevo rol entre editor y viewer en la jerarquía |

### Preguntas abiertas (requieren decisión)

| # | Pregunta | Opciones | Recomendación |
|---|----------|----------|---------------|
| Q1 | ¿Se implementa Fase 1 (Ops + TE + Personas) antes que Fase 2? | A) Sí, en orden. B) No, Fase 2 es independiente | **B)** Fase 2 puede funcionar con Admin como actor y CrmInstallation como eje. Cuando se implemente Fase 1, se agregan FKs opcionales |
| Q2 | ¿El check-in requiere check-in abierto para poder crear entradas de bitácora? | A) Sí, obligatorio. B) No, bitácora independiente | **B)** La bitácora puede existir sin visita. El `visit_checkin_id` es opcional |
| Q3 | ¿Los archivos adjuntos de tickets usan el mismo storage que CRM (`CrmFile`) o sistema propio? | A) Reutilizar CrmFile. B) Tabla propia `OpsTicketAttachment` | **B)** Tabla propia para desacoplar módulos. Mismo provider de storage |
| Q4 | ¿Se necesita un endpoint de upload de fotos separado del check-in? | A) Sí, upload separado + URL. B) No, multipart en check-in | **A)** Upload separado → obtener URL → enviar en JSON. Más robusto en redes lentas |
| Q5 | ¿Los tickets de categoría `pago_turno_extra` (Fase 1) y `uniforme_implementos` (Fase 4) se crean como categorías seed o se omiten? | A) Crear todas las 10. B) Solo las relevantes ahora | **A)** Crear las 10 como seed. Las categorías existen pero los flujos asociados no. El ticket se crea igual, solo que el resolution flow es manual |
| Q6 | ¿Se crea el endpoint `/api/ops/postventa/upload` para fotos, o se reutiliza algún mecanismo existente? | A) Nuevo endpoint. B) Reutilizar el existente de CRM si lo hay | **A)** Nuevo endpoint en `/api/ops/uploads` para mantener separación. Misma lógica de upload |
| Q7 | ¿Cuántos niveles de prioridad? El MASTER_SPEC define P1-P4 pero no P5. | A) P1-P4. B) P1-P5 | **A)** P1-P4 como el MASTER_SPEC. P1=Urgente, P2=Alta, P3=Media, P4=Baja |
| Q8 | ¿Se agregan las rutas de Postventa y Tickets al `BottomNav` mobile, y cuáles se quitan/reordenan? | A) Reemplazar items actuales. B) Agregar como sub-menú | Depende del diseño actual de BottomNav. Propuesta: Hub, Postventa, Tickets, CRM, Perfil |

---

## Apéndice: Transiciones de estado válidas para Tickets

```
                    ┌──────────────┐
                    │    open      │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
               ┌────│ in_progress  │────┐
               │    └──────┬───────┘    │
               │           │            │
        ┌──────▼───────┐   │    ┌───────▼──────┐
        │   waiting     │   │    │  cancelled   │
        └──────┬───────┘   │    └──────────────┘
               │           │            ▲
               └─────┬─────┘            │
                     │                  │
              ┌──────▼───────┐          │
              │   resolved   │──────────┘ (cualquier estado → cancelled)
              └──────┬───────┘
                     │
              ┌──────▼───────┐
              │    closed    │
              └──────────────┘

Transiciones válidas:
  open         → in_progress, cancelled
  in_progress  → waiting, resolved, cancelled
  waiting      → in_progress, resolved, cancelled
  resolved     → closed, cancelled
  closed       → (terminal, no transiciones)
  cancelled    → (terminal, no transiciones)
```

---

## Apéndice: Fórmula Haversine para validación geofence

```typescript
/**
 * Calcula la distancia en metros entre dos puntos GPS usando la fórmula de Haversine.
 * Se usa para validar si un check-in está dentro del radio de la instalación.
 */
function haversineDistance(
  lat1: number, lng1: number,  // Posición del supervisor
  lat2: number, lng2: number   // Centro de la instalación
): number {
  const R = 6_371_000; // Radio de la Tierra en metros
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c; // Distancia en metros
}
```

---

*Documento generado como parte del proceso de planificación de Etapa 2. No se ha implementado código. Este documento debe ser validado antes de proceder con los PRs.*
