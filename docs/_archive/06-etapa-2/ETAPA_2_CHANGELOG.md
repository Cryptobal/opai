# ETAPA 2 — Changelog de Archivos e Intervenciones

> **Versión:** 1.1  
> **Fecha:** 2026-02-11  
> **Referencia:** `docs/ETAPA_2_IMPLEMENTACION.md`

---

## Resumen

Este documento lista todos los archivos que se planean **crear** o **modificar** durante la implementación de la Etapa 2 (Postventa + Tickets), organizados por PR con orden de intervención y dependencias.

---

## PR1: Base de datos — Migraciones + Modelos Prisma

**Dependencias:** Ninguna (primer PR)

### Archivos a modificar

| Archivo | Tipo de cambio | Detalle |
|---------|---------------|---------|
| `prisma/schema.prisma` | **Modificar** | Reutilizar schema `ops` existente y agregar modelos de postventa/tickets si faltan |

### Cambios específicos en `schema.prisma`

1. Verificar schema `ops` ya declarado en `datasource.db.schemas`
2. Verificar campos operativos existentes en `CrmInstallation` (`te_monto_clp` y relacionados)
3. Agregar relaciones desde `CrmInstallation` a modelos de postventa/tickets cuando corresponda
4. Crear modelo `OpsVisitCheckin` (~30 campos)
5. Crear modelo `OpsSiteLogEntry` (~15 campos)
6. Crear modelo `OpsTicketCategory` (~12 campos)
7. Crear modelo `OpsTicket` (~20 campos)
8. Crear modelo `OpsTicketComment` (~8 campos)
9. Crear modelo `OpsTicketAttachment` (~10 campos)

### Archivos generados automáticamente

| Archivo | Tipo | Detalle |
|---------|------|---------|
| `prisma/migrations/YYYYMMDDHHMMSS_etapa2_ops_schema/migration.sql` | **Auto-generado** | Migración Prisma |

### Seed (opcional)

| Archivo | Tipo | Detalle |
|---------|------|---------|
| `prisma/seed-ticket-categories.ts` | **Crear** | Seed de 10 categorías de tickets |

---

## PR2: RBAC + Validaciones + Utilidades

**Dependencias:** PR1 (modelos Prisma deben existir)

### Archivos a crear

| Archivo | Propósito |
|---------|-----------|
| `src/lib/validations/ops.ts` | Schemas Zod: checkin, checkout, ticket, comment, bitacora, escalate, kpi query |
| `src/lib/geo.ts` | Función `haversineDistance()` para cálculo de distancia geofence |

### Archivos a modificar

| Archivo | Tipo de cambio | Detalle |
|---------|---------------|---------|
| `src/lib/rbac.ts` | **Modificar** | Agregar permisos: `MANAGE_POSTVENTA`, `VIEW_POSTVENTA`, `MANAGE_TICKETS`, `VIEW_TICKETS`, `MANAGE_TICKET_CATEGORIES` |
| `src/lib/app-access.ts` | **Modificar** | Agregar acceso módulo `ops` para roles supervisor/editor/admin/owner. Agregar módulo `tickets` |
| `src/lib/module-access.ts` | **Modificar** | Agregar submodules: `postventa`, `tickets`, `ticket_config`, `postventa_kpis` |
| `src/components/opai/AppSidebar.tsx` | **Modificar** | Agregar items navegación: Postventa (con sub-items), Tickets |
| `src/components/opai/AppShell.tsx` | **Modificar** | Posible ajuste para nuevo módulo en sidebar (verificar) |

---

## PR3: Endpoints Core Postventa

**Dependencias:** PR1 + PR2

### Archivos a crear

| Archivo | Métodos HTTP | Propósito |
|---------|:------------:|-----------|
| `src/app/api/ops/postventa/checkin/route.ts` | POST | Registrar check-in georreferenciado |
| `src/app/api/ops/postventa/checkout/route.ts` | POST | Registrar check-out |
| `src/app/api/ops/postventa/visits/route.ts` | GET | Listar visitas con filtros |
| `src/app/api/ops/postventa/visits/[id]/route.ts` | GET | Detalle de visita |
| `src/app/api/ops/postventa/bitacora/route.ts` | GET, POST | Listar y crear entradas de bitácora |
| `src/app/api/ops/postventa/bitacora/[id]/route.ts` | GET, PATCH | Detalle y editar entrada |
| `src/app/api/ops/postventa/bitacora/[id]/escalate/route.ts` | POST | Escalar incidente a ticket |
| `src/app/api/ops/postventa/kpis/route.ts` | GET | KPIs de postventa |

**Total:** 8 archivos nuevos de API

---

## PR4: Endpoints Core Tickets

**Dependencias:** PR1 + PR2

### Archivos a crear

| Archivo | Métodos HTTP | Propósito |
|---------|:------------:|-----------|
| `src/app/api/ops/tickets/route.ts` | GET, POST | Listar y crear tickets |
| `src/app/api/ops/tickets/[id]/route.ts` | GET, PATCH | Detalle y actualizar ticket |
| `src/app/api/ops/tickets/[id]/comments/route.ts` | GET, POST | Comentarios de ticket |
| `src/app/api/ops/tickets/[id]/attachments/route.ts` | POST | Subir adjunto a ticket |
| `src/app/api/ops/tickets/categories/route.ts` | GET, POST | CRUD categorías |
| `src/app/api/ops/tickets/categories/[id]/route.ts` | PATCH, DELETE | Editar/eliminar categoría |

**Total:** 6 archivos nuevos de API

---

## PR5: UI Postventa (Mobile-first)

**Dependencias:** PR3 (endpoints postventa)

### Archivos a crear — Páginas

| Archivo | Ruta en app | Propósito |
|---------|-------------|-----------|
| `src/app/(app)/postventa/page.tsx` | `/postventa` | Dashboard postventa |
| `src/app/(app)/postventa/layout.tsx` | — | Layout con subnav |
| `src/app/(app)/postventa/checkin/page.tsx` | `/postventa/checkin` | Check-in/out mobile |
| `src/app/(app)/postventa/visitas/page.tsx` | `/postventa/visitas` | Historial visitas |
| `src/app/(app)/postventa/instalaciones/[id]/bitacora/page.tsx` | `/postventa/instalaciones/[id]/bitacora` | Bitácora instalación |
| `src/app/(app)/postventa/incidentes/page.tsx` | `/postventa/incidentes` | Lista incidentes |
| `src/app/(app)/postventa/kpis/page.tsx` | `/postventa/kpis` | Dashboard KPIs |

### Archivos a crear — Componentes

| Archivo | Propósito |
|---------|-----------|
| `src/components/postventa/PostventaSubnav.tsx` | Sub-navegación del módulo |
| `src/components/postventa/CheckinClient.tsx` | Lógica check-in/out con GPS |
| `src/components/postventa/VisitasClient.tsx` | Lista de visitas |
| `src/components/postventa/BitacoraClient.tsx` | Lista de bitácora + formulario inline |
| `src/components/postventa/IncidentesClient.tsx` | Lista de incidentes filtrable |
| `src/components/postventa/KpisClient.tsx` | Dashboard de métricas |
| `src/components/postventa/CheckinCard.tsx` | Card de visita (check-in/out) |
| `src/components/postventa/LogEntryCard.tsx` | Card de entrada de bitácora |
| `src/components/postventa/EscalateModal.tsx` | Modal para escalar incidente a ticket |
| `src/components/postventa/NewLogEntryModal.tsx` | Modal para crear entrada de bitácora |
| `src/components/postventa/index.ts` | Barrel exports |

### Archivos a modificar

| Archivo | Tipo de cambio | Detalle |
|---------|---------------|---------|
| `src/components/opai/BottomNav.tsx` | **Modificar** | Agregar item Postventa en navegación mobile |

**Total:** 7 páginas + 11 componentes + 1 modificación

---

## PR6: UI Tickets

**Dependencias:** PR4 (endpoints tickets)

### Archivos a crear — Páginas

| Archivo | Ruta en app | Propósito |
|---------|-------------|-----------|
| `src/app/(app)/tickets/page.tsx` | `/tickets` | Bandeja de tickets |
| `src/app/(app)/tickets/layout.tsx` | — | Layout tickets |
| `src/app/(app)/tickets/[id]/page.tsx` | `/tickets/[id]` | Detalle ticket |
| `src/app/(app)/opai/configuracion/tickets/page.tsx` | `/opai/configuracion/tickets` | Config categorías |

### Archivos a crear — Componentes

| Archivo | Propósito |
|---------|-----------|
| `src/components/tickets/TicketsClient.tsx` | Bandeja con filtros y paginación |
| `src/components/tickets/TicketDetailClient.tsx` | Detalle con thread de comentarios |
| `src/components/tickets/TicketCard.tsx` | Card de ticket en bandeja |
| `src/components/tickets/TicketCommentThread.tsx` | Thread cronológico de comentarios |
| `src/components/tickets/TicketStatusSelect.tsx` | Select de estado con transiciones válidas |
| `src/components/tickets/TicketPriorityBadge.tsx` | Badge de prioridad (P1-P4 coloreado) |
| `src/components/tickets/TicketFilters.tsx` | Panel de filtros (equipo, prioridad, instalación) |
| `src/components/tickets/CreateTicketModal.tsx` | Modal creación de ticket |
| `src/components/tickets/TicketCategoriesConfig.tsx` | CRUD de categorías (admin) |
| `src/components/tickets/SlaBadge.tsx` | Badge de SLA (tiempo restante, breach) |
| `src/components/tickets/index.ts` | Barrel exports |

### Archivos a modificar

| Archivo | Tipo de cambio | Detalle |
|---------|---------------|---------|
| `src/components/opai/ConfigSubnav.tsx` | **Modificar** | Agregar link "Categorías de Tickets" |
| `src/components/opai/BottomNav.tsx` | **Modificar** | Agregar item Tickets (si no se hizo en PR5) |

**Total:** 4 páginas + 11 componentes + 2 modificaciones

---

## PR7: Cron SLA + Notificaciones + Pulido

**Dependencias:** PR3 + PR4 + PR5 + PR6

### Archivos a crear

| Archivo | Propósito |
|---------|-----------|
| `src/app/api/cron/sla-monitor/route.ts` | Job cron para marcar tickets con SLA vencido |

### Archivos a modificar

| Archivo | Tipo de cambio | Detalle |
|---------|---------------|---------|
| `src/app/api/ops/postventa/checkin/route.ts` | **Modificar** | Agregar creación de notificación en override |
| `src/app/api/ops/postventa/bitacora/route.ts` | **Modificar** | Agregar notificación en incidente severity=critical |
| `src/app/api/ops/tickets/route.ts` | **Modificar** | Agregar notificación al crear ticket P1 |
| `src/components/opai/CommandPalette.tsx` | **Modificar** | Agregar búsqueda de tickets por código (opcional) |

**Total:** 1 archivo nuevo + 4 modificaciones

---

## Resumen de intervenciones totales

| Categoría | Crear | Modificar |
|-----------|:-----:|:---------:|
| Prisma schema | 0 | 1 |
| Migraciones SQL | 1 (auto) | 0 |
| Seed data | 1 | 0 |
| Utilidades (`lib/`) | 2 | 3 |
| Endpoints API | 14 | 4 |
| Páginas (`app/`) | 11 | 0 |
| Componentes | 22 | 4 |
| Cron jobs | 1 | 0 |
| **TOTAL** | **52** | **12** |

---

## Orden de intervención (secuencial)

```
PR1 ─── DB + Prisma ──────────────────────────┐
                                                │
PR2 ─── RBAC + Validaciones + Geo ─────────────┤
                                                │
     ┌──────────────────────────────────────────┤
     │                                          │
PR3 ─┤─ Endpoints Postventa ──┐                 │
     │                         │                 │
PR4 ─┤─ Endpoints Tickets ────┤─── (paralelo) ──┘
     │                         │
     └─────────────────────────┤
                               │
     ┌─────────────────────────┤
     │                         │
PR5 ─┤─ UI Postventa ─────────┤─── (paralelo posible)
     │                         │
PR6 ─┤─ UI Tickets ───────────┘
     │
     └─────────────────────────┐
                               │
PR7 ─── Cron + Notificaciones ─┘── (último)
```

**Nota:** PR3 y PR4 pueden desarrollarse en paralelo. PR5 y PR6 también pueden ser paralelos si los endpoints están listos. PR7 es el cierre e integración final.

---

## Archivos existentes que NO se tocan

Los siguientes módulos/archivos **no** se modifican en Etapa 2 (salvo los explícitamente listados arriba):

- `src/app/(app)/crm/**` — CRM completo (solo se lee CrmInstallation)
- `src/app/(app)/cpq/**` — CPQ completo
- `src/app/(app)/payroll/**` — Payroll completo
- `src/app/(app)/opai/documentos/**` — Documentos completo
- `src/components/crm/**` — Componentes CRM
- `src/components/cpq/**` — Componentes CPQ
- `src/components/docs/**` — Componentes Docs
- `src/components/presentation/**` — Presentaciones
- `src/modules/payroll/**` — Motor de payroll
- `src/modules/cpq/**` — Motor CPQ
- `src/emails/**` — Templates de email
- `src/app/(templates)/**` — Templates públicas

---

*Este changelog se actualizará conforme se implementen los PRs.*
