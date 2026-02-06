# OPAI Suite — Documento Maestro Global

**Resumen:** Plataforma SaaS unificada multi-tenant para empresas de seguridad con arquitectura single-domain (opai.gard.cl) y UX single-tenant en Phase 1.

**Estado:** Vigente

**Scope:** OPAI Suite

---

> **Nota:** Este repositorio implementa el módulo Docs/Proposals dentro de la arquitectura MONOREPO de OPAI. Este documento es la referencia estratégica global. El master operativo específico del módulo Docs está en: [001-docs-master.md](./001-docs-master.md)

## 1. Propósito
OPAI es una suite SaaS para empresas de seguridad que unifica:
- Propuestas comerciales (Docs/Proposals)
- CRM y seguimiento
- Operaciones (turnos, incidentes, supervisión)
- Portal de guardias (tickets, documentos, solicitudes)
- Portal de clientes (visibilidad controlada)
- Integraciones (correo, asistencia FaceID externa, payroll externo; Zoho solo legacy si aplica)

## 2. Principios de arquitectura
- Multi-tenant desde el día 1 (tenant = empresa).
- SSO único para toda la suite.
- **Arquitectura MONOREPO single-domain** con rutas por módulo bajo `opai.gard.cl`.
- `docs.gard.cl` funciona como alias/legacy para compatibilidad temporal.
- DB Postgres única inicialmente (Neon) con `tenant_id` en todas las tablas + schemas por dominio.
- Autorización central: RBAC + Scopes (ABAC) + Policies.
- Integración interna por eventos (Outbox) para desacoplar módulos.
- Hardening por etapas: RLS en Postgres (fase 2).

## 3. Módulos (rutas bajo opai.gard.cl)
- `/hub`     → Centro de control ejecutivo + app switcher + KPIs globales (IMPLEMENTADO - Phase 1)
- `/opai/inicio` → Propuestas/Presentaciones + tracking (IMPLEMENTADO - legacy /docs)
- `/crm`     → Pipeline comercial, contactos, actividades, emails, IA (PLACEHOLDER)
- `/cpq`     → Configure, Price, Quote - Configurador de productos (PLACEHOLDER)
- `/ops`     → Operación: turnos, incidentes, rondas, cumplimiento (NO IMPLEMENTADO)
- `/portal`  → Guardias/clientes: tickets, documentos, solicitudes, SLA (NO IMPLEMENTADO)
- `/opai/usuarios` → Gestión de usuarios y permisos RBAC (IMPLEMENTADO)

## 4. Multi-tenancy (Phase 1: Estructural, UX Single-Tenant)
- **Arquitectura:** Multi-tenant desde día 1 (tenant_id en todas las tablas).
- **UX Phase 1:** Single-tenant aparente (sin selector de tenant en UI).
- **Resolución de tenant:** Automática desde la sesión del usuario autenticado.
- **Escalabilidad:** Preparado para Phase 2 (tenant switcher UI cuando se necesite).
- **Regla actual:** Cada usuario pertenece a un único tenant vía Admin.tenantId.
- **Futuro:** Memberships multi-tenant cuando se requiera (guardias, multi-empresa).

## 5. Autorización (RBAC + App Access)

### 5.1 Roles RBAC
Roles implementados: owner, admin, editor, viewer (ver `src/lib/rbac.ts`).
Roles futuros: sales, ops_manager, supervisor, guard, client.

### 5.2 App Access (Phase 1 - Hardcodeado)
**Estado:** ✅ Implementado (Febrero 2026)

Control de acceso a módulos por rol, hardcodeado en código (sin DB).

**Matriz de acceso actual:**
- `owner` / `admin` → Acceso total a todos los módulos
- `editor` → hub, docs, crm, cpq
- `viewer` → hub, docs (solo lectura)

**Implementación:**
- Archivo central: `src/lib/app-access.ts`
- Función principal: `hasAppAccess(role, appKey)`
- Integrado en: Sidebar (UI) + Route protection (Server)
- NO requiere cambios en DB ni migraciones

**Evolución a Phase 2:**
- Mismo modelo, pero fuente de verdad desde DB (tabla `app_permissions`)
- Permitirá configuración por tenant y roles customizados
- La interfaz de código permanece igual (solo cambia la fuente)

### 5.3 Permisos granulares (Futuro)
Scopes: installation_id, client_id, guard_id (self), region_id.
Policies por acción: docs.proposal.send, crm.deal.update, ops.incident.create, etc.

## 6. Datos
- `tenant_id` en todas las tablas.
- schemas por dominio: auth, core, docs, crm, ops, portal, integrations, audit.
- auditoría mínima: created_at, updated_at, created_by_membership_id.

## 7. Integraciones
- Eventos internos vía outbox:
  - docs.proposal.sent
  - docs.email.opened
  - crm.deal.updated
  - ops.incident.created
  - portal.ticket.created
- Externos (según estrategia):
  - Email provider → tracking opens/clicks
  - Asistencia FaceID → webhooks → ops.attendance_*
  - Payroll externo → export/import mensual
  - Zoho CRM → solo legacy durante transición (después CRM OPAI será fuente principal)

## 8. Roadmap (alto nivel)
✅ Fase 0: Docs/proposals + tracking + base multi-tenant estructural.
✅ Fase 1: Hub ejecutivo (KPIs, quick actions, apps launcher) + UX single-tenant.
🔜 Fase 2: CRM básico (contactos, pipeline, oportunidades).
🔜 Fase 3: CPQ (catálogo, pricing, configurador).
🔜 Fase 4: Ops (incidentes, turnos, supervisión).
🔜 Fase 5: Portal guardias/clientes + tenant switcher UI (Phase 2 multi-tenant UX).

## 9. Convenciones
- Naming: {domain}.{entity} en DB. Ej: ops.incidents, crm.deals.
- IDs: UUID/CUID (definir estándar único).
- APIs: `/{module}/api/{resource}` (ej: `/docs/api/presentations`)
- Events: {domain}.{entity}.{verb}

## 10. Arquitectura Actual: MONOREPO Single-Domain
**Estado:** ✅ Implementado (Phase 1 completada - Hub ejecutivo activo)
- **Dominio único:** `opai.gard.cl`
- **Dominio legacy:** `docs.gard.cl` (alias temporal para /opai/*)
- **Estructura:** `src/app/(app)/{module}/` con layout compartido
- **Módulos operativos:**
  - `/hub` - Centro de control ejecutivo (owner/admin only)
  - `/opai/inicio` - Dashboard de propuestas (Docs)
  - `/opai/usuarios` - Gestión de usuarios RBAC
  - `/p/[id]` - Vista pública de presentaciones (sin auth)
- **Módulos placeholder:** `/crm`, `/cpq` (navegación lista, funcionalidad pendiente)
- **Multi-tenancy:** Estructural completo, UX single-tenant (Phase 1)

### Convenciones de Desarrollo
- Un único repositorio para todos los módulos
- Código compartido en `src/lib/` y `src/components/`
- Auth unificado con Auth.js v5
- Multi-tenancy con `tenantId` en todas las tablas de negocio
- Ver guía completa en: [010-repo-playbook.md](./010-repo-playbook.md)

---
