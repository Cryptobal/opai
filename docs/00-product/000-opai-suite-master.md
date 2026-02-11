# OPAI Suite — Documento Maestro Global

**Resumen:** Plataforma SaaS unificada multi-tenant para empresas de seguridad con arquitectura single-domain (opai.gard.cl).

**Estado:** Vigente — Actualizado 2026-02-11

**Scope:** OPAI Suite (módulos comerciales + operacionales)

---

> **Visión completa (todas las fases OPI):** Ver [MASTER_SPEC_OPI.md](./MASTER_SPEC_OPI.md)  
> **Estado detallado del proyecto:** Ver [ESTADO_GENERAL.md](../02-implementation/ESTADO_GENERAL.md)  
> **Módulo Docs específico:** Ver [001-docs-master.md](./001-docs-master.md)  
> **Plan detallado OPI Fase 1:** Ver [ETAPA_1_IMPLEMENTACION.md](../05-etapa-1/ETAPA_1_IMPLEMENTACION.md)

## 1. Propósito
OPAI es una suite SaaS para empresas de seguridad que unifica:
- Propuestas comerciales (Docs/Proposals) ✅ IMPLEMENTADO
- CRM y seguimiento comercial ✅ IMPLEMENTADO
- CPQ — Configure, Price, Quote ✅ IMPLEMENTADO
- Documentos legales (contratos, templates) ✅ IMPLEMENTADO
- Payroll (simulador de liquidaciones Chile) ⚠️ PARCIAL
- Operaciones (turnos, incidentes, supervisión) — Fase 1 OPI
- Postventa (check-in georreferenciado, tickets) — Fase 2 OPI
- Portal de guardias (comunicados, solicitudes) — Fase 3 OPI
- Inventario (stock, kits, asignaciones) — Fase 4 OPI
- Asistencia externa (FaceID/API) — Fase 5 OPI

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
- `/hub`     → Centro de control ejecutivo + app switcher + KPIs globales ✅ IMPLEMENTADO
- `/opai/inicio` → Propuestas/Presentaciones + tracking ✅ IMPLEMENTADO
- `/crm`     → Pipeline comercial, cuentas, contactos, deals, installations, email, follow-ups ✅ IMPLEMENTADO
- `/cpq`     → Configure, Price, Quote — cotizador con cálculo employer cost ✅ IMPLEMENTADO
- `/opai/documentos` → Documentos legales, templates con tokens, versionado ✅ IMPLEMENTADO
- `/payroll` → Simulador de liquidaciones Chile, parámetros legales ⚠️ PARCIAL (60%)
- `/opai/configuracion` → Usuarios, integraciones, firmas, categorías ✅ IMPLEMENTADO
- `/opai/usuarios` → Gestión de usuarios y permisos RBAC ✅ IMPLEMENTADO
- `/ops`     → Operación: puestos, pauta, asistencia, TE ❌ FASE 1 OPI
- `/postventa` → Check-in/out georreferenciado, bitácora, incidentes ❌ FASE 2 OPI
- `/tickets` → Sistema de tickets con SLA y categorías ❌ FASE 2 OPI
- `/portal`  → Portal guardias: comunicados, solicitudes, tickets ❌ FASE 3 OPI
- `/inventario` → Stock, kits, asignaciones ❌ FASE 4 OPI

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

### Completado (OPAI Suite)
- ✅ Fase 0: Docs/proposals + tracking + base multi-tenant estructural
- ✅ Fase 1: Hub ejecutivo (KPIs, quick actions, apps launcher)
- ✅ Fase 2: CRM completo (leads, accounts, contacts, deals, installations, pipeline, email, follow-ups)
- ✅ Fase 3: CPQ completo (cotizaciones, posiciones, catálogo, cálculo employer cost)
- ✅ Fase 4: Documentos legales (templates Tiptap, tokens, versionado, categorías)
- ⚠️ Fase 5: Payroll parcial (simulador, parámetros legales Chile)
- ✅ Fase 6: Auth + RBAC + Gestión de usuarios + Configuración

### Pendiente (OPI — Expansión operacional)
- ✅ OPI Fase 1: Ops (puestos, pauta mensual/diaria, asistencia, TE, personas/guardias) — MVP v1
- ❌ OPI Fase 2: Postventa (check-in/out geofence, bitácora, incidentes) + Tickets (SLA, categorías)
- ❌ OPI Fase 3: Portal guardias (OTP, comunicados, solicitudes RRHH, tickets)
- ❌ OPI Fase 4: Inventario (catálogo, stock, kits, asignaciones)
- ❌ OPI Fase 5: Asistencia externa (FaceID/API, reconciliación automática)

**Detalle completo de fases OPI:** Ver [MASTER_SPEC_OPI.md](./MASTER_SPEC_OPI.md)  
**Ejecución recomendada de Fase 1:** Ver [ETAPA_1_IMPLEMENTACION.md](../05-etapa-1/ETAPA_1_IMPLEMENTACION.md)

## 9. Convenciones
- Naming: {domain}.{entity} en DB. Ej: ops.incidents, crm.deals.
- IDs: UUID/CUID (definir estándar único).
- APIs: `/{module}/api/{resource}` (ej: `/docs/api/presentations`)
- Events: {domain}.{entity}.{verb}

## 10. Arquitectura Actual: MONOREPO Single-Domain
**Estado:** ✅ Implementado — 9 módulos en producción
- **Dominio único:** `opai.gard.cl`
- **Estructura:** `src/app/(app)/{module}/` con layout compartido
- **Módulos en producción:**
  - `/hub` — Centro de control ejecutivo
  - `/crm/*` — CRM completo (12 páginas, 33 APIs)
  - `/cpq/*` — CPQ completo (5 páginas, 22 APIs)
  - `/opai/documentos/*` — Documentos legales (6 páginas, 8 APIs)
  - `/opai/inicio` — Dashboard de presentaciones
  - `/payroll/*` — Simulador de liquidaciones (3 páginas, 3 APIs)
  - `/opai/configuracion/*` — Configuración (9 páginas)
  - `/opai/usuarios` — Gestión de usuarios RBAC
  - `/p/[id]` — Vista pública de presentaciones (sin auth)
- **Base de datos:** 56 modelos en 6 schemas (public, crm, cpq, docs, payroll, fx)
- **Multi-tenancy:** Completo, UX single-tenant

### Convenciones de Desarrollo
- Un único repositorio para todos los módulos
- Código compartido en `src/lib/` y `src/components/`
- Auth unificado con Auth.js v5
- Multi-tenancy con `tenantId` en todas las tablas de negocio
- Validaciones con Zod en `src/lib/validations/`

---
