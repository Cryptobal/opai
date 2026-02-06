# OPAI Suite — Documento Maestro Global

**Resumen:** Visión estratégica completa de OPAI Suite, la plataforma SaaS unificada para empresas de seguridad con arquitectura single-domain y módulos por ruta.

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
- `/docs`    → Propuestas/Presentaciones + tracking (IMPLEMENTADO)
- `/hub`     → Dashboard central + app switcher + (futuro) tenant switcher/billing (PLACEHOLDER)
- `/crm`     → Pipeline comercial, contactos, actividades, emails, IA (PLACEHOLDER)
- `/ops`     → Operación: turnos, incidentes, rondas, cumplimiento (NO IMPLEMENTADO)
- `/portal`  → Guardias/clientes: tickets, documentos, solicitudes, SLA (NO IMPLEMENTADO)
- `/admin`   → Configuración tenant, usuarios/roles/scopes, integraciones, billing (NO IMPLEMENTADO)

## 4. Multi-tenancy
- Un usuario puede pertenecer a varios tenants vía memberships.
- Regla de negocio típica: salvo guardias (y casos especiales), usuarios operan con 1 tenant activo.
- Cada request opera en un “tenant activo” (tenant context).
- En V1, la selección de tenant se hace por UI (tenant switcher), no por subdominio por tenant.

## 5. Autorización (RBAC + Scopes)
Roles base: owner, admin, sales, ops_manager, supervisor, guard, client.
Scopes: installation_id, client_id, guard_id (self), region_id (si aplica).
Policies por acción: ops.incident.create, docs.proposal.send, portal.ticket.read, etc.

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
Fase 0: estabilizar docs/proposals y tracking + base multi-tenant.
Fase 1: Hub (launcher) + CRM mínimo.
Fase 2: Ops (incidentes + pauta/turnos base).
Fase 3: Portal guardias (tickets + docs + SLA).
Fase 4: Admin SaaS (tenants, billing, roles/scopes UI, integraciones).

## 9. Convenciones
- Naming: {domain}.{entity} en DB. Ej: ops.incidents, crm.deals.
- IDs: UUID/CUID (definir estándar único).
- APIs: `/{module}/api/{resource}` (ej: `/docs/api/presentations`)
- Events: {domain}.{entity}.{verb}

## 10. Arquitectura Actual: MONOREPO Single-Domain
**Estado:** ✅ Implementado (Fase 1 completada)
- **Dominio principal:** `opai.gard.cl`
- **Dominio legacy:** `docs.gard.cl` (alias para compatibilidad)
- **Estructura:** `src/app/{module}/` donde cada módulo tiene su propio layout, páginas y API routes
- **Módulo activo:** `/docs` (Proposals/Presentaciones) - completamente funcional
- **Módulos futuros:** `/hub`, `/crm`, `/ops`, `/portal`, `/admin` (placeholders/no implementados)
- **Rutas públicas:** URLs como `opai.gard.cl/docs/p/{uniqueId}` para presentaciones de clientes

### Convenciones de Desarrollo
- Un único repositorio para todos los módulos
- Código compartido en `src/lib/` y `src/components/`
- Auth unificado con Auth.js v5
- Multi-tenancy con `tenantId` en todas las tablas de negocio
- Ver guía completa en: [010-repo-playbook.md](./010-repo-playbook.md)

---