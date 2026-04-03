# OPAI Multi-Tenant Security Audit Report

**Fecha**: 2026-04-03
**Auditor**: Claude Code (automated)
**Alcance**: Codebase completo — src/, prisma/, scripts/, config

---

## Resumen Ejecutivo

- **Total issues encontrados**: 52
- **Criticos**: 22 | **Altos**: 14 | **Medios**: 12 | **Bajos**: 4
- **Estado general**: **REQUIERE TRABAJO SIGNIFICATIVO**

El sistema tiene una base sólida de multi-tenancy (la mayoría de reads filtran por `tenantId`), pero presenta vulnerabilidades críticas en operaciones de escritura (UPDATE/DELETE sin `tenantId`), rutas públicas de portales sin validación de tenant, storage sin aislamiento por tenant, y múltiples referencias hardcodeadas al tenant "gard" en código de producción.

---

## 1. Issues Criticos (Data Leaks / Seguridad)

### 1.1 Queries Prisma sin filtro de tenantId en UPDATE/DELETE

Estas operaciones permiten que un usuario modifique o elimine datos de otro tenant manipulando el ID en la request.

| # | Archivo | Linea | Query | Problema | Fix |
|---|---------|-------|-------|----------|-----|
| 1 | `src/app/api/operacional/documentos-globales/[id]/route.ts` | ~38 | `prisma.docOperacional.update({ where: { id } })` | UPDATE sin tenantId | Agregar `tenantId: ctx.tenantId` al where |
| 2 | `src/app/api/operacional/documentos-globales/[id]/route.ts` | ~91 | `prisma.docOperacional.delete({ where: { id } })` | DELETE sin tenantId | Agregar `tenantId: ctx.tenantId` al where |
| 3 | `src/app/api/operacional/tipos/[id]/route.ts` | ~33 | `prisma.tipoDocOperacional.update({ where: { id } })` | UPDATE sin tenantId | Agregar `tenantId: ctx.tenantId` al where |
| 4 | `src/app/api/operacional/tipos/[id]/route.ts` | ~71 | `prisma.tipoDocOperacional.delete({ where: { id } })` | DELETE sin tenantId | Agregar `tenantId: ctx.tenantId` al where |
| 5 | `src/app/api/admin/role-templates/[id]/route.ts` | ~133 | `prisma.roleTemplate.update({ where: { id } })` | UPDATE sin tenantId | Agregar `tenantId: authCtx.tenantId` al where |
| 6 | `src/app/api/admin/role-templates/[id]/route.ts` | ~186 | `prisma.roleTemplate.delete({ where: { id } })` | DELETE sin tenantId | Agregar `tenantId: authCtx.tenantId` al where |
| 7 | `src/app/api/ops/groups/[id]/route.ts` | ~174 | `prisma.adminGroup.delete({ where: { id } })` | DELETE sin tenantId | Agregar `tenantId: ctx.tenantId` al where |
| 8 | `src/app/api/crm/contacts/[id]/route.ts` | ~136 | `prisma.crmContact.delete({ where: { id } })` | DELETE sin tenantId | Agregar `tenantId: ctx.tenantId` al where |
| 9 | `src/app/api/crm/accounts/[id]/route.ts` | ~166 | `tx.crmAccount.update({ where: { id } })` | UPDATE sin tenantId (transaccion) | Agregar `tenantId: ctx.tenantId` al where |
| 10 | `src/app/api/crm/accounts/[id]/route.ts` | ~247 | `prisma.crmAccount.delete({ where: { id } })` | DELETE sin tenantId | Agregar `tenantId: ctx.tenantId` al where |
| 11 | `src/app/api/crm/deals/[id]/route.ts` | ~199 | `prisma.crmDeal.delete({ where: { id } })` | DELETE sin tenantId | Agregar `tenantId: ctx.tenantId` al where |
| 12 | `src/app/api/presentations/route.ts` | ~126 | `prisma.template.update({ where: { id: templateId } })` | UPDATE sin tenantId | Agregar `tenantId` al where |
| 13 | `src/modules/cpq/send/send-quote-to-portal.ts` | ~112 | `prisma.crmAccount.findUnique({ where: { id: quote.accountId } })` | READ sin tenantId | Agregar validacion de tenantId |
| 14 | `src/modules/cpq/send/send-quote-to-portal.ts` | ~119 | `prisma.admin.findUnique({ where: { id: userId } })` | READ sin tenantId | Agregar validacion de tenantId |

### 1.2 Webhook queries sin tenant context

| # | Archivo | Linea | Query | Problema | Fix |
|---|---------|-------|-------|----------|-----|
| 15 | `src/app/api/webhook/resend/route.ts` | ~66 | `prisma.presentation.findFirst({ where: { emailMessageId } })` | Sin tenantId | Agregar tenantId al webhook payload o validar post-query |
| 16 | `src/app/api/webhook/resend/route.ts` | ~93 | `prisma.crmEmailMessage.findFirst({ where: { resendId } })` | Sin tenantId | Idem |
| 17 | `src/app/api/webhook/resend/route.ts` | ~120 | `prisma.opsEmailLog.findFirst({ where: { resendId } })` | Sin tenantId | Idem |

### 1.3 Portal Rondas — Sin aislamiento de tenant (CRITICO)

Las rutas del portal de rondas son **completamente publicas** (bypass de NextAuth) y no validan tenant en ninguna query.

| # | Archivo | Problema |
|---|---------|----------|
| 18 | `src/app/api/portal/rondas/completar/route.ts` | Query `opsRondaEjecucion.findFirst({ where: { id: ejecucionId } })` sin tenantId. Cualquier persona con un `ejecucionId` valido puede completar ejecuciones de otro tenant |
| 19 | `src/app/api/portal/rondas/walk-route-flush/route.ts` | UPDATE sin tenantId. `guardiaId` y `ejecucionId` vienen del body sin validacion de sesion |
| 20 | `src/app/api/portal/rondas/marcar/route.ts` | `marcarCheckpoint()` sin validacion de tenant en route handler |

### 1.4 Storage sin aislamiento por tenant

| # | Archivo | Problema | Fix |
|---|---------|----------|-----|
| 21 | `src/lib/storage.ts` (~linea 47-60) | `buildStorageKey()` genera paths como `prefix/YYYY/MM/uuid.ext` SIN tenant prefix. Todas las keys son globalmente adivinables | Cambiar formato a `{tenantId}/{prefix}/YYYY/MM/{filename}` |
| 22 | `src/app/api/public/postulacion/upload/route.ts` | Upload publico sin aislamiento de tenant | Agregar tenant context al storage path |

---

## 2. Issues Altos (Funcionalidad Multi-Tenant)

### 2.1 Fallback `getDefaultTenantId()` hardcodeado a "gard"

La funcion `getDefaultTenantId()` en `src/lib/tenant.ts` busca `slug: 'gard'` como fallback. Esto se usa en **18+ rutas de produccion**, significando que cualquier ruta sin sesion activa opera sobre datos de Gard.

| # | Archivo | Linea | Uso |
|---|---------|-------|-----|
| 1 | `src/lib/tenant.ts` | 9 | `const DEFAULT_TENANT_SLUG = 'gard'` — Definicion |
| 2 | `src/lib/api-auth.ts` | 38 | Fallback en `requireAuth()` |
| 3 | `src/app/api/branding/route.ts` | 12 | Branding publico |
| 4 | `src/app/api/public/leads/route.ts` | 90 | Leads publicos |
| 5 | `src/app/api/webhook/inbound-email/route.ts` | 19 | Webhook email entrante |
| 6 | `src/app/api/webhook/zoho/route.ts` | — | Webhook Zoho |
| 7 | `src/app/api/public/registro-demo/route.ts` | — | Registro demo publico |
| 8 | `src/app/api/public/ingreso-te/route.ts` | — | Ingreso TE publico |
| 9 | `src/app/api/public/postulacion/route.ts` | — | Postulacion publica |
| 10 | `src/app/api/templates/route.ts` | — | Templates |
| 11 | `src/app/api/cpq/catalog/route.ts` | — | Catalogo CPQ |
| 12 | `src/app/api/presentations/send-email/route.ts` | — | Envio email presentaciones |

### 2.2 Portal Guardia — Subqueries sin validacion de tenant

| # | Archivo | Problema |
|---|---------|----------|
| 13 | `src/app/api/portal/guardia/attendance/route.ts` | Toma `guardiaId` como query param, no valida tenant. Escalacion horizontal de privilegios |
| 14 | `src/app/api/portal/guardia/badges/route.ts` (y otros subroutes) | Mismo patron — queries por `guardiaId` sin tenant |

### 2.3 Configuracion de branding con fallback Gard

| # | Archivo | Linea | Problema |
|---|---------|-------|----------|
| 15 | `src/lib/tenant-config.ts` | 67-105 | Defaults hardcodeados: `companyName: "Gard SpA"`, `email: "comercial@gard.cl"`, `rut: "77.840.623-3"` |
| 16 | `src/app/api/branding/route.ts` | 36-52 | Error handler retorna branding de Gard como fallback para TODOS los tenants |
| 17 | `src/lib/resend.ts` | 18-20 | `EMAIL_CONFIG.from` fallback a `'OPAI <opai@gard.cl>'`, `companyName: 'Gard Security'` |
| 18 | `src/lib/finance-notifications.ts` | 20 | FROM fallback a `"OPAI <opai@gard.cl>"` |

### 2.4 Session cookie del portal cliente sin firma

| # | Archivo | Problema |
|---|---------|----------|
| 19 | `src/app/api/portal/cliente/auth/route.ts` | Session cookie `portal_cliente_session` usa base64url JSON sin HMAC. Podria ser forjada por un atacante |

---

## 3. Issues Medios (Calidad / Mantenibilidad)

### 3.1 Cron jobs con aislamiento debil

| # | Archivo | Problema |
|---|---------|----------|
| 1 | `src/app/api/cron/consolidar-marcaciones/route.ts` (~linea 22) | `updateMany` sin filtro de tenantId — consolida marcaciones de TODOS los tenants sin distincion |
| 2 | `src/app/api/cron/onboarding-reminder/route.ts` (~linea 31) | Filtrado debil de tenant — procesa globalmente |

### 3.2 Feature flags / Planes — NO EXISTEN

| # | Componente | Estado |
|---|-----------|--------|
| 3 | Tabla `TenantModule` para activar/desactivar modulos | **NO EXISTE** |
| 4 | Tabla `TenantPlan` / `Subscription` para billing | **NO EXISTE** |
| 5 | Limites por tenant (max guardias, max storage, etc.) | **NO EXISTE** (solo `defaultMaxRondaDurationMinutes`) |
| 6 | Feature flag library (Unleash, LaunchDarkly, etc.) | **NO EXISTE** |

### 3.3 Onboarding de nuevo tenant — NO EXISTE

| # | Componente | Estado |
|---|-----------|--------|
| 7 | Script/API de provisioning de nuevo tenant | **NO EXISTE** |
| 8 | `prisma/seed.ts` hardcodeado a "gard" | Solo crea tenant "gard" con admin `carlos.irigoyen@gard.cl` |
| 9 | Tabla `Setting` con `tenantId` opcional | Settings globales pueden pisar settings de tenant |

### 3.4 Scripts hardcodeados a "gard"

| # | Archivo | Referencia |
|---|---------|------------|
| 10 | `scripts/fix-tenant-id-soho.ts` | `where: { slug: 'gard' }` |
| 11 | `scripts/migrate-ops-data.ts` | `where: { slug: "gard" }` |
| 12 | `scripts/migrate-role-templates.ts` | `where: { slug: "gard" }` |
| + | 7 scripts mas en `scripts/` | Todos buscan tenant "gard" directamente |

---

## 4. Issues Bajos (Nice to Have)

| # | Archivo | Problema |
|---|---------|----------|
| 1 | `public/logo-gard.svg`, `public/logo-gard-blanco.svg` | Assets estaticos especificos de Gard en `/public` |
| 2 | `.env.example` lineas 57, 85, 139, 181, 191 | Valores ejemplo con `gard.cl`, `gard-files`, `gard-guardias` |
| 3 | `src/lib/mock-data.ts` | Emails `comercial@gard.cl` y logo `Logo%20Gard%20Blanco.png` en mock data |
| 4 | `scripts/generate-gard-icons.mjs` | Script de generacion de iconos PWA especifico de Gard |

---

## 5. Rutas Publicas — Analisis de Resolucion de Tenant

| Grupo de Rutas | Metodo de Auth | Resolucion de Tenant | Estado |
|----------------|---------------|---------------------|--------|
| `/api/marcacion/oposicion/[token]` | Token en URL | DB lookup del token → tenantId | **OK** (token expira en 48h, valida RUT) |
| `/api/portal/guardia/auth` | RUT + PIN | DB lookup de RUT → tenantId | **OK** en auth |
| `/api/portal/guardia/*` (subroutes) | Ninguno post-auth | `guardiaId` del query param, sin tenant | **VULNERABLE** |
| `/api/portal/cliente/auth` | Email + PIN | Session cookie con tenantId | **OK** |
| `/api/portal/cliente/*` (subroutes) | Session cookie | `requirePortalClienteAuth()` valida tenant | **OK** (pero cookie sin firma) |
| `/api/portal/rondas/auth` | RUT + PIN | DB lookup → tenantId | **OK** en auth |
| `/api/portal/rondas/*` (subroutes) | Ninguno post-auth | IDs del request body, sin tenant | **CRITICO** |
| `/api/devices/*` | Bearer token | DB lookup del deviceToken → tenantId | **OK** |
| `/api/access-control/*` | Session OR device token | Dual auth, valida installationId | **OK** |
| `/api/public/*` | Ninguno | `getDefaultTenantId()` (= "gard") | **VULNERABLE** |

---

## 6. Checklist de Implementacion

### Seguridad Critica (Sprint 1)

- [ ] Agregar `tenantId` al `where` de TODOS los UPDATE/DELETE listados en seccion 1.1 (14 queries)
- [ ] Agregar validacion de tenant a rutas del portal de rondas (`completar`, `walk-route-flush`, `marcar`)
- [ ] Agregar validacion de tenant a subroutes del portal guardia (`attendance`, `badges`, etc.)
- [ ] Agregar tenant prefix a `buildStorageKey()` en `src/lib/storage.ts`
- [ ] Firmar session cookie de portal cliente con HMAC

### Multi-Tenancy Core (Sprint 2)

- [ ] Eliminar/reemplazar `getDefaultTenantId()` — las rutas publicas deben resolver tenant via subdomain, header, o token
- [ ] Eliminar hardcoded branding "Gard" en `src/lib/tenant-config.ts` — usar valores genericos como fallback
- [ ] Eliminar fallback branding "Gard" en `src/app/api/branding/route.ts` error handler
- [ ] Eliminar fallback emails `@gard.cl` en `src/lib/resend.ts` y `src/lib/finance-notifications.ts`
- [ ] Arreglar webhook Resend para validar tenant post-query
- [ ] Agregar tenant filter al cron `consolidar-marcaciones`

### Infraestructura SaaS (Sprint 3)

- [ ] Crear tabla `TenantPlan` para planes/suscripciones
- [ ] Crear tabla `TenantModule` para feature flags por tenant
- [ ] Crear tabla `TenantLimit` para limites (max guardias, max storage, etc.)
- [ ] Crear API/script de provisioning de nuevo tenant
- [ ] Crear onboarding flow que ejecute seeds per-tenant
- [ ] Migrar scripts en `scripts/` para aceptar `TENANT_SLUG` como env var

### Cleanup (Sprint 4)

- [ ] Mover logos Gard de `/public` a storage per-tenant
- [ ] Actualizar `.env.example` con valores genericos
- [ ] Limpiar mock-data.ts de referencias a Gard
- [ ] Agregar linting rule para detectar queries sin tenantId en modelos multi-tenant
- [ ] Agregar tests de integracion de aislamiento cross-tenant
- [ ] Implementar rate limiting por tenant en uploads
- [ ] Agregar audit logging a todas las rutas de portales

---

## 7. Queries Sin Tenant Filter (Lista Completa)

| Archivo | Linea | Modelo | Operacion | Fix |
|---------|-------|--------|-----------|-----|
| `src/app/api/operacional/documentos-globales/[id]/route.ts` | ~38 | docOperacional | update | `where: { id, tenantId }` |
| `src/app/api/operacional/documentos-globales/[id]/route.ts` | ~91 | docOperacional | delete | `where: { id, tenantId }` |
| `src/app/api/operacional/tipos/[id]/route.ts` | ~33 | tipoDocOperacional | update | `where: { id, tenantId }` |
| `src/app/api/operacional/tipos/[id]/route.ts` | ~71 | tipoDocOperacional | delete | `where: { id, tenantId }` |
| `src/app/api/admin/role-templates/[id]/route.ts` | ~133 | roleTemplate | update | `where: { id, tenantId }` |
| `src/app/api/admin/role-templates/[id]/route.ts` | ~186 | roleTemplate | delete | `where: { id, tenantId }` |
| `src/app/api/ops/groups/[id]/route.ts` | ~174 | adminGroup | delete | `where: { id, tenantId }` |
| `src/app/api/crm/contacts/[id]/route.ts` | ~136 | crmContact | delete | `where: { id, tenantId }` |
| `src/app/api/crm/accounts/[id]/route.ts` | ~166 | crmAccount | update | `where: { id, tenantId }` |
| `src/app/api/crm/accounts/[id]/route.ts` | ~247 | crmAccount | delete | `where: { id, tenantId }` |
| `src/app/api/crm/deals/[id]/route.ts` | ~199 | crmDeal | delete | `where: { id, tenantId }` |
| `src/app/api/presentations/route.ts` | ~126 | template | update | `where: { id, tenantId }` |
| `src/modules/cpq/send/send-quote-to-portal.ts` | ~112 | crmAccount | findUnique | Validar `tenantId` post-query |
| `src/modules/cpq/send/send-quote-to-portal.ts` | ~119 | admin | findUnique | Validar `tenantId` post-query |
| `src/app/api/webhook/resend/route.ts` | ~66 | presentation | findFirst | Agregar tenant al webhook |
| `src/app/api/webhook/resend/route.ts` | ~93 | crmEmailMessage | findFirst | Agregar tenant al webhook |
| `src/app/api/webhook/resend/route.ts` | ~120 | opsEmailLog | findFirst | Agregar tenant al webhook |
| `src/app/api/portal/rondas/completar/route.ts` | ~25 | opsRondaEjecucion | findFirst | `where: { id, tenantId }` |
| `src/app/api/portal/rondas/walk-route-flush/route.ts` | ~50 | opsRondaEjecucion | update | `where: { id, tenantId }` |
| `src/app/api/portal/rondas/marcar/route.ts` | ~53 | (via service) | update | Agregar tenantId al service |
| `src/app/api/portal/guardia/attendance/route.ts` | ~35 | (varies) | findMany | `where: { guardiaId, tenantId }` |
| `src/app/api/cron/consolidar-marcaciones/route.ts` | ~22 | opsMarcacion | updateMany | Agregar filtro por tenant |

---

## 8. Resumen de Arquitectura Actual vs. Requerida

| Aspecto | Estado Actual | Requerido para SaaS |
|---------|--------------|-------------------|
| Tenant model en DB | Existe (`Tenant` table) | OK |
| tenantId en modelos | ~95% de modelos lo tienen | Verificar 100% |
| Filtro tenantId en reads | ~95% correcto | Debe ser 100% |
| Filtro tenantId en writes | ~85% correcto | Debe ser 100% |
| Resolucion de tenant | `getDefaultTenantId()` = "gard" | Subdomain/header/token |
| Storage isolation | Sin tenant prefix | Tenant prefix obligatorio |
| Feature flags por tenant | No existe | Crear TenantModule |
| Planes/billing | No existe | Crear TenantPlan |
| Provisioning | No existe | API + seed automatizado |
| Branding multi-tenant | Hardcoded a Gard | Config en DB por tenant |
| Session security (portales) | Cookies sin firma | HMAC en cookies |
| Cron multi-tenant | Mayoria OK, 2 debiles | 100% tenant-aware |
