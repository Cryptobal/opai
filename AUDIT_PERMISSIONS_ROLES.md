# Auditoría de Permisos, Roles y Multi-Tenancy — OPAI

**Fecha:** 2026-03-18
**Alcance:** Codebase completo — 725 API routes, 249 modelos Prisma, 15 roles
**Stack:** Next.js 15, Prisma ORM, PostgreSQL (Neon), Auth.js v5 (JWT)

---

## Resumen Ejecutivo

| Métrica | Valor |
|---------|-------|
| Total API routes | 725 |
| Modelos Prisma | 249 |
| Roles definidos | 15 |
| Módulos de permisos | 10 |
| Vulnerabilidades Críticas | 9 |
| Vulnerabilidades Altas | 12 |
| Vulnerabilidades Medias | 20+ |
| Vulnerabilidades Bajas | 5 |

---

## FASE 1: Mapeo del Sistema Actual

### 1.1 Esquema de Datos

#### Modelos de Auth y Roles

| Modelo | Campos clave | Descripción |
|--------|-------------|-------------|
| `Tenant` | id, name, slug, plan | Organización/empresa. Raíz del multi-tenancy |
| `Admin` | id, email, password, role, roleTemplateId, tenantId, status | Usuarios del sistema (no "User") |
| `RoleTemplate` | id, tenantId, slug, name, permissions (JSON) | Templates de roles custom con permisos granulares |
| `AdminGroup` | id, tenantId, slug, name, isSystem | Grupos de usuarios |
| `AdminGroupMembership` | adminId, groupId | Join table (SIN tenantId) |
| `UserInvitation` | id, tenantId, email, role, invitedById | Invitaciones pendientes |
| `PasswordResetToken` | id, email, token, expiresAt | Tokens de reset (global, sin tenantId) |
| `AuditLog` | id, tenantId?, action, entity, entityId, adminId? | Log de auditoría |
| `Setting` | id, tenantId?, key, value | Configuración del sistema |

#### Sistema de Sesiones (JWT)

```
Auth.js v5 → JWT Strategy
├── maxAge: 90 días (⚠️ excesivo)
├── updateAge: 24 horas
├── Token contiene: id, role, roleTemplateId, tenantId, portal
├── Role refresh: cada 60s desde BD (solo en Node, no Edge)
└── Portales: opai, supervisor, cliente, guardia, rondas
```

#### Roles Definidos (15)

| Rol | Rank | Acceso Apps | Notas |
|-----|------|-------------|-------|
| `owner` | 4 | ALL | Acceso total, no restringible por template |
| `admin` | 3 | ALL | Casi equivalente a owner |
| `editor` | 2 | hub,docs,crm,cpq,payroll,ops,finance | Sin config |
| `rrhh` | 2 | hub,ops | RRHH específico |
| `operaciones` | 2 | hub,ops | Operaciones campo |
| `jefe_operaciones` | 2 | hub,ops,crm,finance | Jefe de operaciones |
| `finanzas` | 2 | hub,finance | Solo finanzas |
| `reclutamiento` | 2 | hub,ops | Solo reclutamiento |
| `supervisor` | 2 | hub,ops,finance,crm | Con capacidades forzadas |
| `solo_ops` | 1 | hub,ops | Operaciones limitado |
| `solo_crm` | 1 | hub,crm | CRM limitado |
| `solo_documentos` | 1 | hub,docs | Solo documentos |
| `solo_payroll` | 1 | hub,payroll | Solo nómina |
| `viewer` | 1 | hub,docs | Solo lectura |
| `inspector_dt` | 0 | ninguna | Acceso temporal DT |

#### Sistema de Permisos Granulares (v2)

```
4 niveles: none | view | edit | full
Cascada: submódulo hereda del módulo padre si no tiene override

Módulos:    hub, ops, crm, docs, payroll, cpq, config, finance, reportes_dt, fiscalizacion
Submódulos: ops.puestos, ops.pauta_mensual, crm.leads, crm.deals, etc. (30+)
Capabilities: rendicion_submit, supervision_checkin, guardias_manage, etc. (20+)
```

**Flujo de resolución:**
1. Si `roleTemplateId` → buscar permisos custom en BD (cache 5min)
2. Si no → usar `DEFAULT_ROLE_PERMISSIONS[role]`
3. Merge: template overrides defaults del rol base
4. Supervisor: forzar acceso mínimo a supervisión/rendiciones

#### Modelos con tenantId (207+)

La gran mayoría de modelos tienen `tenantId` con índices apropiados. Ver sección de vulnerabilidades para los que faltan.

#### Modelos SIN tenantId que DEBERÍAN tenerlo

| Modelo | Línea schema | Riesgo | Justificación |
|--------|-------------|--------|---------------|
| `ProtocolSection` | 2176 | 🔴 CRÍTICO | Entidad de negocio sin aislamiento |
| `ProtocolItem` | 2194 | 🔴 CRÍTICO | Hijo de ProtocolSection, ambos sin tenant |
| `ProtocolVersion` | 2232 | 🔴 CRÍTICO | Solo tiene installationId, sin tenant directo |

#### Modelos globales (aceptable sin tenantId)

- `FxUfRate`, `FxUtmRate` — Datos económicos compartidos (UF, UTM)
- `CrmIndustry` — Catálogo de industrias
- `PayrollParameterVersion`, `PayrollAssumption`, `PayrollSalaryComponent` — Config global nómina
- `AiDocChunk` — Base de conocimiento IA del sistema
- `PasswordResetToken` — Tokens de reset (global)

#### Modelos hijos sin tenantId (aceptable - aislamiento indirecto)

40+ modelos como `CpqQuoteUniformItem`, `OpsTicketComment`, `DocTemplateVersion`, `ChatChannelParticipant`, etc. heredan aislamiento de su padre. **Riesgo bajo**, pero queries directas sin join al padre son vulnerables a IDOR.

---

### 1.2 Middleware y Guards

#### No existe middleware.ts de Next.js

El proyecto **NO tiene** un archivo `middleware.ts` en la raíz ni en `src/`. Esto significa que **no hay protección centralizada a nivel de routing** — cada endpoint debe protegerse individualmente.

#### Helper centralizado: `requireAuth()` (`src/lib/api-auth.ts`)

```typescript
// Patrón estándar en API routes:
const ctx = await requireAuth();
if (!ctx) return unauthorized();
// ctx = { userId, tenantId, userEmail, userRole, roleTemplateId }
```

**Helpers adicionales en `api-auth.ts`:**
- `unauthorized()` → 401 response
- `parseBody(request, zodSchema)` → Validación con Zod
- `resolveApiPerms(ctx)` → Resuelve permisos granulares
- `ensureModuleAccess(ctx, module)` → Verifica acceso a módulo
- `ensureCanCreateQuote(ctx)` → Permiso específico cotizaciones
- `ensureCanDelete(ctx, module, sub)` → Permiso de eliminación

#### RBAC helpers (`src/lib/rbac.ts`)

- `hasPermission(role, permission)` — Check legacy por rol
- `hasRoleOrHigher(userRole, requiredRole)` — Jerarquía de roles
- `isValidRole(role)` — Validación

#### Permissions v2 (`src/lib/permissions.ts` + `permissions-server.ts`)

- `canView(perms, module, sub)` — Nivel view+
- `canEdit(perms, module, sub)` — Nivel edit+
- `canDelete(perms, module, sub)` — Nivel full
- `hasModuleAccess(perms, module)` — Cualquier acceso
- `hasCapability(perms, capability)` — Capacidad específica
- `resolvePermissions({ role, roleTemplateId })` — Con cache 5min
- `resolvePagePerms(user)` — Para Server Components

#### Portales alternativos (sin requireAuth)

Los portales de cliente, guardia y rondas usan autenticación propia:
- **Portal Cliente:** Cookie `portal_cliente_session` con email+PIN
- **Portal Guardia:** Session cookie con RUT+PIN
- **Portal Rondas:** Token-based auth
- **Dispositivos:** Device tokens / pairing codes

---

### 1.3 Inventario de Endpoints

#### Distribución por tipo de autenticación

| Tipo | Cantidad | Descripción |
|------|----------|-------------|
| `requireAuth()` | ~543 | API routes principales con auth JWT |
| Portal Cliente | ~75 | Auth por cookie portal_cliente_session |
| Portal Guardia | ~50 | Auth por cookie portal_guardia |
| Portal Rondas | ~13 | Auth por token |
| Cron jobs | ~18 | Auth por CRON_SECRET header |
| Dispositivos | ~9 | Auth por device token |
| Webhooks | ~4 | Auth por HMAC/secret (variable) |
| Doc signing | ~7 | Auth por token en URL |
| **Sin auth** | **~6** | **Ver vulnerabilidades** |

---

## FASE 2: Detección de Vulnerabilidades

### 🔴 VULNERABILIDADES CRÍTICAS

---

#### CRIT-01: UPDATE/DELETE sin tenantId en WHERE clause (Patrón sistémico)

**Severidad:** 🔴 CRÍTICO
**Impacto:** Cross-tenant data manipulation — un usuario puede modificar/eliminar recursos de otro tenant
**Patrón:** Se verifica tenant en `findFirst`, pero el `update`/`delete` posterior usa solo `{ where: { id } }`

**Archivos afectados:**

| Archivo | Línea | Operación | Modelo |
|---------|-------|-----------|--------|
| `src/app/api/ops/tickets/[id]/route.ts` | 202 | UPDATE | OpsTicket |
| `src/app/api/ops/rondas/templates/[id]/route.ts` | 117 | DELETE | OpsRondaTemplate |
| `src/app/api/ops/rondas/checkpoints/[id]/route.ts` | 72 | DELETE | OpsCheckpoint |
| `src/app/api/ops/rondas/dispositivos/[id]/route.ts` | 23, 53 | UPDATE, DELETE | OpsDispositivoInstalacion |
| `src/app/api/crm/custom-fields/[id]/route.ts` | 43, 73 | UPDATE, DELETE | CrmCustomField |
| `src/app/api/crm/contacts/[id]/route.ts` | 69, 120 | UPDATE, DELETE | CrmContact |
| `src/app/api/crm/accounts/[id]/route.ts` | 240 | DELETE | CrmAccount |
| `src/app/api/crm/deals/[id]/route.ts` | 185 | DELETE | CrmDeal |
| `src/app/api/crm/leads/[id]/route.ts` | 131 | DELETE | CrmLead |
| `src/app/api/crm/installations/[id]/route.ts` | 305 | DELETE | CrmInstallation |
| `src/app/api/docs/documents/[id]/route.ts` | 197 | DELETE | Document |
| `src/app/api/te/[id]/aprobar/route.ts` | 62 | UPDATE | OpsTurnoExtra |
| `src/app/api/ops/groups/[id]/route.ts` | 154 | UPDATE/DELETE | AdminGroup |
| `src/app/api/payroll/periodos/[id]/route.ts` | 140, 192 | UPDATE, deleteMany | PayrollPeriod |

**Ejemplo del problema (`ops/tickets/[id]/route.ts:202`):**
```typescript
// ✅ Verifica tenant correctamente
const existing = await prisma.opsTicket.findFirst({
  where: { id, tenantId: ctx.tenantId },
});
if (!existing) return 404;

// ❌ UPDATE sin tenantId — Race condition window
await prisma.opsTicket.update({
  where: { id },      // ← FALTA tenantId
  data: updateData,
});
```

**Fix sugerido:**
```typescript
await prisma.opsTicket.update({
  where: { id, tenantId: ctx.tenantId },  // ← Agregar tenantId
  data: updateData,
});
```

**Nota:** Aunque hay un `findFirst` previo que verifica el tenant, existe una ventana de race condition (TOCTOU) donde el ID podría ser reasignado. La defensa en profundidad exige siempre incluir `tenantId` en la operación final.

---

#### CRIT-02: Account Merge sin validación completa de tenant

**Severidad:** 🔴 CRÍTICO
**Archivo:** `src/app/api/crm/accounts/merge/route.ts`
**Líneas:** 105, 164-172

**Problemas:**
1. **Línea 105:** `crmAccount.update({ where: { id: masterId } })` — UPDATE del master sin tenantId
2. **Líneas 164-172:** `opsEncuestaCliente.updateMany` y `opsVisitaTecnica.updateMany` sin filtro de tenantId

```typescript
// Línea 164-167: SIN tenantId
await tx.opsEncuestaCliente.updateMany({
  where: { accountId: duplicateId },  // ← FALTA tenantId
  data: { accountId: masterId },
});

// Línea 170-173: SIN tenantId
await tx.opsVisitaTecnica.updateMany({
  where: { accountId: duplicateId },  // ← FALTA tenantId
  data: { accountId: masterId },
});
```

**Impacto:** Si un atacante proporciona un `duplicateId` que pertenece a otro tenant, podría mover encuestas y visitas técnicas al master de su tenant.

---

#### CRIT-03: Webhook Resend sin verificación de firma

**Severidad:** 🔴 CRÍTICO
**Archivo:** `src/app/api/webhook/resend/route.ts`
**Línea:** 24

```typescript
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { type, data } = body;  // ← Confía ciegamente en el payload
  // Modifica Presentation, CrmEmailMessage, OpsEmailLog, AuditLog, OpsOnboardingStatus
}
```

**Impacto:** Sin verificación HMAC, cualquiera puede:
- Marcar emails como entregados/abiertos (falsificar métricas)
- Cambiar status de onboarding
- Crear logs de auditoría falsos
- Marcar presentaciones como expiradas (bounced)

**Fix:** Implementar verificación con Svix (ya está en package.json):
```typescript
import { Webhook } from 'svix';

export async function POST(req: NextRequest) {
  const payload = await req.text();
  const headers = {
    'svix-id': req.headers.get('svix-id') ?? '',
    'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
    'svix-signature': req.headers.get('svix-signature') ?? '',
  };

  const wh = new Webhook(process.env.RESEND_WEBHOOK_SECRET!);
  const body = wh.verify(payload, headers);
  // ... procesar body verificado
}
```

**Nota:** El webhook de Zoho SÍ tiene verificación HMAC correcta (`src/app/api/webhook/zoho/route.ts`).

---

#### CRIT-04: Webhook inbound-email sin verificación de firma

**Severidad:** 🔴 CRÍTICO
**Archivo:** `src/app/api/webhook/inbound-email/route.ts`
**Línea:** ~27+

Similar a CRIT-03 — procesa emails entrantes y crea Leads CRM sin verificar que el webhook venga de Resend.

**Impacto:** Un atacante podría crear leads falsos inyectando datos arbitrarios.

---

#### CRIT-05: Endpoints de Access Control sin autenticación

**Severidad:** 🔴 CRÍTICO
**Archivos:**
- `src/app/api/access-control/lists/item/[id]/route.ts` — PUT/DELETE sin auth
- `src/app/api/access-control/preregistrations/item/[id]/route.ts` — PUT/DELETE sin auth

**Impacto:** Cualquier persona con acceso a la URL puede:
- Modificar/eliminar entradas de listas de acceso
- Modificar/eliminar preregistros de visitantes

Estos endpoints operan por ID sin verificar ninguna autenticación ni pertenencia a tenant.

---

#### CRIT-06: Push notification subscribe acepta tenantId del client

**Severidad:** 🔴 CRÍTICO
**Archivo:** `src/app/api/notifications/push/subscribe/route.ts`
**Línea:** 18

```typescript
const { subscription, portalType, userType, userId, tenantId } = await req.json();
// ← tenantId viene del body, no de la sesión
```

**Impacto:** Un atacante puede registrar suscripciones push con un `tenantId` y `userId` arbitrarios, potencialmente recibiendo notificaciones de otro tenant.

---

#### CRIT-07: Portal Cliente acepta tenantId desde query params (Cross-Tenant Data Leak)

**Severidad:** 🔴 CRÍTICO
**Archivos:**
- `src/app/api/portal/cliente/activity/route.ts`
- `src/app/api/portal/cliente/compliance/route.ts`
- `src/app/api/portal/cliente/guards/route.ts`
- `src/app/api/portal/cliente/contracts/route.ts`
- `src/app/api/portal/cliente/gamification/comparativa/route.ts`

**Patrón vulnerable (activity/route.ts:5-15):**
```typescript
export async function GET(request: NextRequest) {
  const installationId = request.nextUrl.searchParams.get("installationId");
  const tenantId = request.nextUrl.searchParams.get("tenantId"); // ← DEL CLIENTE
  if (!installationId || !tenantId) {
    return NextResponse.json({ error: "Parámetros requeridos" }, { status: 400 });
  }
  // Usa tenantId del query param directamente en Prisma queries
  const rondas = await prisma.opsRondaEjecucion.findMany({
    where: { tenantId, installationId, ... }, // ← CROSS-TENANT
  });
}
```

**Impacto:** Cualquier persona puede acceder a datos de CUALQUIER tenant simplemente cambiando `?tenantId=xxx` en la URL. Expone:
- Actividad de rondas y alertas
- Datos de compliance
- Información de guardias/personal
- Contratos
- Métricas de gamificación

**Sin autenticación de ningún tipo.** Estos endpoints confían ciegamente en parámetros de URL.

**Fix:** Derivar tenantId de la sesión autenticada del portal, NUNCA del query param:
```typescript
const session = await getPortalSession(request);
if (!session) return unauthorized();
const tenantId = session.tenantId; // ← De la sesión verificada
```

---

#### CRIT-08: PDF generation endpoints sin autenticación

**Severidad:** 🔴 CRÍTICO
**Archivos:**
- `src/app/api/pdf/generate-pricing/route.ts`
- `src/app/api/pdf/generate-presentation/route.ts`
- `src/app/api/pdf/generate-pricing-v2/route.ts`

Estos endpoints aceptan datos en el body y generan PDFs. Aunque no acceden directamente a la BD en la generación, son un vector de abuse (DoS, resource exhaustion) al no tener rate limiting ni auth.

---

#### CRIT-09: Payroll deleteMany sin tenantId

**Severidad:** 🔴 CRÍTICO
**Archivo:** `src/app/api/payroll/periodos/[id]/route.ts`
**Líneas:** 192-195

```typescript
// DELETE cascade sin tenantId en las sub-queries
await prisma.payrollLiquidacion.deleteMany({ where: { periodId: id } });
await prisma.payrollAttendanceRecord.deleteMany({ where: { periodId: id } });
```

**Impacto:** Si dos tenants tienen períodos con el mismo ID (UUID, improbable pero posible en migraciones), podría eliminar liquidaciones de otro tenant.

---

### 🟡 VULNERABILIDADES ALTAS

---

#### HIGH-01: Sesión JWT de 90 días

**Severidad:** 🟡 ALTO
**Archivo:** `src/lib/auth.ts:188`

```typescript
session: {
  strategy: 'jwt',
  maxAge: 90 * 24 * 60 * 60, // 90 días
  updateAge: 24 * 60 * 60,
}
```

**Impacto:** Un token comprometido es válido por 3 meses. Combinado con la falta de invalidación de sesiones, esto amplifica el impacto de cualquier robo de token.

**Recomendación:** Reducir a 7-14 días para aplicaciones web, o implementar refresh token rotation.

---

#### HIGH-02: Race condition en role refresh

**Severidad:** 🟡 ALTO
**Archivo:** `src/lib/auth.ts:145-168`

```typescript
if (!token.roleRefreshedAt || now - token.roleRefreshedAt > ROLE_REFRESH_INTERVAL) {
  try {
    const admin = await prisma.admin.findUnique({ where: { id: token.id } });
    if (admin && admin.status === 'active') {
      token.role = admin.role;
    }
  } catch {
    // Si falla BD, MANTIENE rol anterior ← ⚠️
  }
  token.roleRefreshedAt = now; // ← Resetea timer incluso si falló
}
```

**Problemas:**
1. Si la BD falla, el usuario conserva su rol anterior por 60s+ más
2. Si el admin fue desactivado (`status !== 'active'`), el token NO se invalida — simplemente no actualiza el rol
3. El usuario desactivado puede seguir operando hasta que expire el JWT
4. En Edge runtime, NUNCA se refresca el rol (Prisma no disponible)

---

#### HIGH-03: IDOR en findUnique por ID sin tenant

**Severidad:** 🟡 ALTO

Múltiples endpoints usan `findUnique({ where: { id } })` sin filtro de tenant para lookup inicial:

| Archivo | Línea | Modelo |
|---------|-------|--------|
| `src/app/api/crm/files/upload/route.ts` | ~101 | DocumentFolder (folderId del body) |
| `src/app/api/cpq/quotes/[id]/send-portal/route.ts` | ~245 | CrmDeal (dealId del body) |
| `src/app/api/installations/[id]/exams/[examId]/route.ts` | 108, 167 | Exam (DELETE sin tenant) |

**Impacto:** Leak de información cross-tenant. Un atacante puede enumerar IDs y verificar existencia de recursos de otros tenants.

---

#### HIGH-04: Modelo ProtocolSection/Item/Version sin tenantId

**Severidad:** 🟡 ALTO
**Archivo:** `prisma/schema.prisma:2176-2252`

Estos tres modelos no tienen campo `tenantId`, lo que significa que las queries no pueden filtrar por tenant. Cualquier usuario autenticado podría potencialmente acceder a protocolos de seguridad de otras organizaciones.

---

#### HIGH-05: Ausencia de Next.js Middleware

**Severidad:** 🟡 ALTO

No existe `middleware.ts` para:
- Proteger rutas del dashboard antes de que lleguen al Server Component
- Forzar redirección a login para rutas protegidas
- Verificar portal context (evitar cross-portal session leaks)
- Rate limiting centralizado

La protección depende 100% de que cada endpoint/página llame a `requireAuth()` individualmente.

---

#### HIGH-06: No se invalida el JWT al desactivar usuario

**Severidad:** 🟡 ALTO
**Archivo:** `src/lib/auth.ts:159`

```typescript
if (admin && admin.status === 'active') {
  token.role = admin.role; // Solo actualiza si activo
}
// Si NO es activo... simplemente no actualiza. NO invalida la sesión.
```

El usuario desactivado mantiene su sesión válida con su último rol conocido hasta que:
1. El JWT expire (90 días)
2. El JWT se refresque Y la BD responda correctamente

---

#### HIGH-07: TE (Turno Extra) aprobación sin validación de monto

**Severidad:** 🟡 ALTO
**Archivo:** `src/app/api/te/[id]/aprobar/route.ts:58-60`

```typescript
if (body.amountClp !== undefined) {
  updateData.amountClp = body.amountClp; // ← Sin validación de rango
}
```

**Impacto:** Un usuario con permiso de aprobación puede establecer montos arbitrarios (negativos, extremadamente altos, etc.).

---

#### HIGH-08: Access Control config PUT sin autenticación

**Severidad:** 🟡 ALTO
**Archivo:** `src/app/api/access-control/config/[installationId]/route.ts`

El endpoint PUT para modificar la configuración de access control de una instalación no requiere autenticación.

---

#### HIGH-09: Portal notifications trust client-side headers

**Severidad:** 🟡 ALTO

Las rutas del portal de guardia y cliente confían en headers como `x-guardia-id`, `x-tenant-id`, `x-contact-id` enviados desde el frontend. Estos pueden ser manipulados.

---

#### HIGH-10: Email preview sin autenticación

**Severidad:** 🟡 ALTO
**Archivos:**
- `src/app/api/email-preview/route.ts`
- `src/app/api/email-preview/[sessionId]/route.ts`

Endpoints de preview de email accesibles sin autenticación.

---

#### HIGH-11: AuditLog sin tenantId obligatorio

**Severidad:** 🟡 ALTO
**Archivo:** `prisma/schema.prisma:311`

El campo `tenantId` es opcional en AuditLog, lo que permite crear logs de auditoría sin contexto de tenant (como se ve en el webhook de Resend).

---

#### HIGH-12: Cron endpoints validación de secret inconsistente

**Severidad:** 🟡 ALTO

Los 18 cron endpoints usan `CRON_SECRET` pero la validación debe verificarse que sea timing-safe comparison para evitar timing attacks.

---

### 🟢 VULNERABILIDADES MEDIAS Y BAJAS

---

#### MED-01: `$queryRawUnsafe` en help-chat-retrieval

**Archivo:** `src/lib/ai/help-chat-retrieval.ts:218`

Usa `$queryRawUnsafe` con parámetros posicionales ($1, $2). El `vectorLiteral` se construye como string, pero los valores del embedding son numéricos provenientes de la API de OpenAI, mitigando el riesgo de inyección.

**Riesgo:** MEDIO — Patrón frágil, pero no explotable directamente.

---

#### MED-02: Cache de permisos de 5 minutos

**Archivo:** `src/lib/permissions-server.ts:25`

Cambios en permisos de RoleTemplate tardan hasta 5 minutos en propagarse.

---

#### MED-03: Guard events deprecated pero accesibles

**Archivos:** `src/app/api/ops/guard-events/[id]/{approve,reject,cancel}/route.ts`

Devuelven 410 Gone, sin auth. Bajo riesgo ya que no ejecutan lógica, pero deberían eliminarse.

---

#### MED-04: Falta rate limiting generalizado

No se encontró implementación de rate limiting en endpoints públicos ni en endpoints de autenticación.

---

#### LOW-01: PIN hash sanitizado correctamente

**Archivo:** `src/app/api/personas/guardias/[id]/route.ts:78-82`

El PIN hash se sanitiza antes de enviar al cliente. ✅ Correcto.

---

## FASE 3: Análisis de Consistencia

### 3.1 Tipo de sistema: Híbrido RBAC + ABAC

El sistema utiliza:
- **RBAC puro (legacy):** 15 roles estáticos con permisos predefinidos en `role-policy.ts`
- **ABAC (v2):** Permisos granulares por módulo/submódulo (4 niveles) almacenados en `RoleTemplate`
- **Capabilities:** Capacidades binarias (true/false) para operaciones específicas
- **Resolución híbrida:** Template overrides + defaults por rol + reglas forzadas (supervisor)

**Consistencia:** ✅ BUENA — El sistema de permisos v2 es coherente y bien estructurado.

### 3.2 Naming Conventions

| Patrón | Ejemplo | Consistencia |
|--------|---------|-------------|
| Módulos | `ops`, `crm`, `finance` | ✅ Consistente |
| Submódulos | `ops.puestos`, `crm.leads` | ✅ Consistente |
| Capabilities | `rendicion_submit`, `supervision_checkin` | ✅ snake_case |
| Roles | `jefe_operaciones`, `solo_crm` | ✅ snake_case |
| Permissions legacy | `manage_users`, `view_templates` | ✅ snake_case |

### 3.3 DRY Principle

| Aspecto | Estado | Notas |
|---------|--------|-------|
| Auth helper centralizado | ✅ | `requireAuth()` en `api-auth.ts` |
| Permission resolution | ✅ | `resolveApiPerms()` centralizado |
| Module access check | ✅ | `ensureModuleAccess()` |
| Tenant filtering | ❌ | **NO centralizado** — cada endpoint filtra manualmente |
| Input validation | ✅ | `parseBody()` con Zod |
| Error responses | ✅ | `unauthorized()` helper |

**Problema principal:** La falta de un Prisma middleware/extension para auto-inyectar `tenantId` es la causa raíz de CRIT-01.

### 3.4 UI vs Backend

El sistema de permisos granulares se usa tanto en frontend (sidebar, botones) como en backend (API guards). Sin embargo:

- ❌ Algunos endpoints solo verifican auth pero no permisos granulares
- ❌ Features ocultas en UI podrían ser accesibles vía API directa
- ❌ Los portales de cliente/guardia tienen un modelo de auth separado menos robusto

---

## FASE 4: Dashboard de Cobertura y Plan de Acción

### 4.1 Dashboard de Cobertura por Módulo

| Módulo API | Routes | Auth ✅ | Tenant ✅ | Perms ✅ | Issues |
|------------|--------|---------|-----------|---------|--------|
| `/api/crm/*` | ~80 | ✅ | ⚠️ | ✅ | CRIT-01 en DELETE/UPDATE |
| `/api/ops/*` | ~120 | ✅ | ⚠️ | ✅ | CRIT-01 en tickets, rondas |
| `/api/cpq/*` | ~40 | ✅ | ✅ | ✅ | HIGH-03 en send-portal |
| `/api/finance/*` | ~50 | ✅ | ✅ | ✅ | — |
| `/api/payroll/*` | ~30 | ✅ | ⚠️ | ✅ | CRIT-08 deleteMany |
| `/api/docs/*` | ~20 | ✅ | ⚠️ | ✅ | MED pattern issue |
| `/api/chat/*` | ~25 | ✅ | ✅ | ✅ | — |
| `/api/config/*` | ~15 | ✅ | ✅ | ✅ | — |
| `/api/admin/*` | ~10 | ✅ | ✅ | ✅ | — |
| `/api/ai/*` | ~10 | ✅ | ✅ | ✅ | MED-01 queryRawUnsafe |
| `/api/access-control/*` | ~25 | ❌ | ❌ | ❌ | CRIT-05 |
| `/api/webhook/*` | ~4 | ⚠️ | N/A | N/A | CRIT-03, CRIT-04 |
| `/api/portal/cliente/*` | ~75 | ❌ | ❌ | N/A | CRIT-07, HIGH-09 |
| `/api/portal/guardia/*` | ~50 | ⚠️ | ⚠️ | N/A | HIGH-09 |
| `/api/cron/*` | ~18 | ✅ | N/A | N/A | Via CRON_SECRET |
| `/api/pdf/*` | ~3 | ❌ | N/A | N/A | CRIT-07 |
| `/api/notifications/*` | ~5 | ⚠️ | ❌ | N/A | CRIT-06 |

### 4.2 Lista de Bugs por Severidad

#### 🔴 Críticos (Arreglar INMEDIATAMENTE)

| # | Bug | Archivo | Fix |
|---|-----|---------|-----|
| 1 | UPDATE/DELETE sin tenantId en WHERE | 14+ archivos (ver CRIT-01) | Agregar `tenantId: ctx.tenantId` a todos los `where` |
| 2 | Merge accounts: updateMany sin tenant | `crm/accounts/merge/route.ts:164-172` | Agregar `tenantId: ctx.tenantId` |
| 3 | Webhook Resend sin verificación HMAC | `webhook/resend/route.ts` | Implementar Svix verification |
| 4 | Webhook inbound-email sin verificación | `webhook/inbound-email/route.ts` | Implementar Svix verification |
| 5 | Access Control items sin auth | `access-control/lists/item/[id]/route.ts` | Agregar auth (device token o requireAuth) |
| 6 | Access Control preregistrations sin auth | `access-control/preregistrations/item/[id]/route.ts` | Agregar auth |
| 7 | Push subscribe acepta tenantId del body | `notifications/push/subscribe/route.ts:18` | Derivar tenantId de sesión autenticada |
| 8 | Portal Cliente acepta tenantId de query params | 5+ archivos en `portal/cliente/*` (ver CRIT-07) | Derivar de sesión portal, nunca de query |
| 9 | Payroll deleteMany sin tenantId | `payroll/periodos/[id]/route.ts:192` | Agregar `tenantId` a deleteMany |

#### 🟡 Altos (Arreglar esta semana)

| # | Bug | Archivo | Fix |
|---|-----|---------|-----|
| 9 | JWT maxAge 90 días | `lib/auth.ts:188` | Reducir a 7-14 días |
| 10 | No invalidar sesión al desactivar usuario | `lib/auth.ts:159` | Throw/return null si status !== active |
| 11 | Role refresh race condition | `lib/auth.ts:145-168` | No resetear timer si falla BD |
| 12 | IDOR en findUnique sin tenant | 3+ archivos (ver HIGH-03) | Usar findFirst + tenantId |
| 13 | ProtocolSection/Item/Version sin tenantId | `prisma/schema.prisma:2176+` | Agregar campo + migración |
| 14 | Sin middleware.ts | Raíz del proyecto | Crear middleware de auth/redirect |
| 15 | TE aprobación sin validar monto | `te/[id]/aprobar/route.ts:58` | Agregar validación Zod con min/max |
| 16 | Access Control config PUT sin auth | `access-control/config/[...]/route.ts` | Agregar auth |
| 17 | Portal headers trust client-side | Portal routes | Implementar session tokens server-side |
| 18 | Email preview sin auth | `email-preview/route.ts` | Agregar requireAuth |
| 19 | AuditLog tenantId opcional | `prisma/schema.prisma:311` | Hacer requerido |
| 20 | PDF generation sin auth | `pdf/generate-*/route.ts` | Agregar requireAuth o rate limit |

### 4.3 Optimizaciones Recomendadas

#### 1. Prisma Extension para auto-inyectar tenantId

```typescript
// src/lib/prisma-tenant.ts
import { Prisma } from '@prisma/client';
import { prisma as basePrisma } from './prisma';

export function getTenantPrisma(tenantId: string) {
  return basePrisma.$extends({
    query: {
      $allModels: {
        async findMany({ args, query }) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async update({ args, query }) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async delete({ args, query }) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async updateMany({ args, query }) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async deleteMany({ args, query }) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async create({ args, query }) {
          args.data = { ...args.data, tenantId };
          return query(args);
        },
      },
    },
  });
}
```

**Uso en API routes:**
```typescript
const ctx = await requireAuth();
if (!ctx) return unauthorized();
const db = getTenantPrisma(ctx.tenantId);

// Ahora TODAS las queries auto-filtran por tenant
const tickets = await db.opsTicket.findMany({ where: { status: 'open' } });
// → WHERE status = 'open' AND tenantId = 'xxx' (automático)
```

#### 2. Next.js Middleware propuesto

```typescript
// middleware.ts
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

const PUBLIC_PATHS = [
  '/opai/login',
  '/api/auth',
  '/api/webhook',
  '/api/public',
  '/api/cron',
  '/api/devices',
  '/portal',
];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Skip public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Require auth for /opai/* and /api/*
  if ((pathname.startsWith('/opai') || pathname.startsWith('/api')) && !req.auth) {
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/opai/login', req.url));
  }

  // Verify portal context
  if (req.auth?.portal === 'supervisor' && !pathname.startsWith('/supervisor')) {
    return NextResponse.redirect(new URL('/supervisor', req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/opai/:path*', '/api/:path*', '/supervisor/:path*'],
};
```

#### 3. Helper para operaciones seguras por tenant

```typescript
// src/lib/tenant-safe.ts
import { AuthContext } from './api-auth';
import { prisma } from './prisma';

/**
 * Verifica que un recurso existe y pertenece al tenant antes de operar.
 * Retorna el recurso o null.
 */
export async function findOwnedResource<T>(
  ctx: AuthContext,
  model: any, // Prisma model delegate
  id: string,
  select?: Record<string, boolean>,
): Promise<T | null> {
  return model.findFirst({
    where: { id, tenantId: ctx.tenantId },
    ...(select ? { select } : {}),
  });
}

/**
 * Update seguro: siempre incluye tenantId en WHERE.
 */
export async function updateOwned(
  ctx: AuthContext,
  model: any,
  id: string,
  data: Record<string, any>,
) {
  return model.update({
    where: { id, tenantId: ctx.tenantId },
    data,
  });
}

/**
 * Delete seguro: siempre incluye tenantId en WHERE.
 */
export async function deleteOwned(
  ctx: AuthContext,
  model: any,
  id: string,
) {
  return model.delete({
    where: { id, tenantId: ctx.tenantId },
  });
}
```

### 4.4 Checklist de Implementación (por prioridad)

#### P0 — Crítico (Sprint actual)

- [ ] **Agregar tenantId a TODOS los UPDATE/DELETE** en 14+ archivos identificados en CRIT-01
- [ ] **Fix account merge** — agregar tenantId a opsEncuestaCliente y opsVisitaTecnica queries
- [ ] **Implementar Svix verification** en webhooks Resend e inbound-email
- [ ] **Agregar auth** a access-control/lists/item y preregistrations/item endpoints
- [ ] **Fix push subscribe** — derivar tenantId de sesión, no del body
- [ ] **Fix Portal Cliente** — 5+ endpoints aceptan tenantId desde query params (CRIT-07). Migrar a sesión portal autenticada

#### P1 — Alto (Próximo sprint)

- [ ] **Crear middleware.ts** con protección centralizada de rutas
- [ ] **Implementar Prisma extension** para auto-inyectar tenantId
- [ ] **Reducir JWT maxAge** de 90 a 7-14 días
- [ ] **Invalidar sesión** cuando admin.status !== 'active' en jwt callback
- [ ] **Fix role refresh** — no resetear timer si BD falla
- [ ] **Agregar tenantId** a ProtocolSection, ProtocolItem, ProtocolVersion + migración
- [ ] **Agregar auth** a pdf/generate-* y email-preview endpoints
- [ ] **Agregar validación de monto** en TE aprobación

#### P2 — Medio (Backlog)

- [ ] **Implementar rate limiting** en endpoints públicos y de autenticación
- [ ] **Auditar portales** (cliente/guardia) — migrar de headers a session tokens server-side
- [ ] **Hacer AuditLog.tenantId obligatorio** + migración de datos existentes
- [ ] **Eliminar endpoints deprecated** (guard-events approve/reject/cancel)
- [ ] **Agregar tenantId directo** a modelos hijos con queries directas frecuentes
- [ ] **Implementar timing-safe comparison** para CRON_SECRET validation

#### P3 — Bajo (Nice to have)

- [ ] Migrar `$queryRawUnsafe` a `Prisma.sql` template literals
- [ ] Reducir cache de permisos de 5min a 1min o implementar invalidación activa
- [ ] Agregar tests automatizados de tenant isolation
- [ ] Implementar audit logging para cambios de roles y permisos
- [ ] Agregar CSP headers para prevenir XSS

---

## Apéndice: Patrón Recomendado para Nuevos Endpoints

```typescript
// src/app/api/module/resource/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms, parseBody, ensureModuleAccess } from "@/lib/api-auth";
import { canEdit, canDelete } from "@/lib/permissions";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).max(200),
  // ... campos validados
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Auth
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  // 2. Permisos granulares
  const forbidden = await ensureModuleAccess(ctx, "module");
  if (forbidden) return forbidden;
  const perms = await resolveApiPerms(ctx);
  if (!canEdit(perms, "module", "submodule")) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  // 3. Validar input
  const parsed = await parseBody(request, updateSchema);
  if (parsed.error) return parsed.error;

  // 4. Verificar propiedad del recurso
  const { id } = await params;
  const existing = await prisma.resource.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  // 5. Operar CON tenantId en WHERE
  const updated = await prisma.resource.update({
    where: { id, tenantId: ctx.tenantId }, // ← SIEMPRE incluir tenantId
    data: parsed.data,
  });

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!canDelete(perms, "module", "submodule")) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { id } = await params;
  // Verificar existencia Y propiedad en una sola query
  const existing = await prisma.resource.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  await prisma.resource.delete({
    where: { id, tenantId: ctx.tenantId }, // ← SIEMPRE incluir tenantId
  });

  return NextResponse.json({ success: true });
}
```

---

*Generado automáticamente por auditoría de seguridad — 2026-03-18*
