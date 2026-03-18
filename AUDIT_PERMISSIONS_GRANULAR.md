# Auditoría de Autorización Granular — OPAI Suite

**Fecha:** 2026-03-18  
**Scope:** Autorización granular (no autenticación ni tenant isolation, que ya fueron auditados)  
**Objetivo:** Verificar que cada endpoint exige el permiso correcto para la operación que realiza

---

## Arquitectura del sistema de permisos

```
JWT (NextAuth) → AuthContext (requireAuth)
      ↓
resolvePermissions(role, roleTemplateId)
      ↓
  ¿roleTemplateId?
  ├── Sí → RoleTemplate en BD (cache 5 min) + merge con defaults del rol base
  └── No → DEFAULT_ROLE_PERMISSIONS[role] (hardcoded en permissions.ts)
      ↓
RolePermissions { modules, submodules, capabilities }
      ↓
canView / canEdit / canDelete / hasCapability / hasModuleAccess
```

**4 niveles de permiso:** `none < view < edit < full`

**Niveles de protección en este reporte:**
- **Nivel 0** — Sin ninguna autenticación
- **Nivel 1** — Solo `requireAuth()`: identidad verificada, sin control de qué puede hacer
- **Nivel 1+** — `requireAuth()` + check manual de rol como string (`ctx.userRole === "owner"`) — bypasea sistema v2
- **Nivel 2** — `requireAuth()` + `ensureModuleAccess()`: verifica acceso al módulo pero sin granularidad de operación
- **Nivel 3** — `requireAuth()` + `resolveApiPerms()` + `canView/canEdit/canDelete/hasCapability`: protección granular completa ✅

---

## FASE 1 — Inventario por nivel de protección

### Nivel 0 — Sin autenticación ⛔

| Archivo | Métodos | Riesgo | Nota |
|---------|---------|--------|------|
| `access-control/config/[installationId]/route.ts` | GET, PUT | CRÍTICO | Expone y permite modificar configuración de control de acceso físico |
| `access-control/devices/[installationId]/route.ts` | GET | CRÍTICO | Lista dispositivos biométricos de instalaciones de clientes |
| `access-control/records/[installationId]/route.ts` | GET | CRÍTICO | Historial de entradas/salidas de personas (datos personales) |

> **Nota:** El resto de `src/app/api/public/*`, `cron/*`, `webhook/*` y portales (`portal/cliente`, `portal/guardia`, `portal/supervisor`) son intencionalmente sin auth de sesión de admin — usan su propio sistema (PIN de guardia, cookie de portal, CRON_SECRET, firma de webhook).

---

### Nivel 1 — Solo `requireAuth()` sin permisos granulares 🔴

#### Módulo CRM

| Archivo | GET | POST | PUT/PATCH | DELETE | Permisos que faltan |
|---------|-----|------|-----------|--------|---------------------|
| `crm/accounts/route.ts` | ❌ | ❌ | — | — | GET→`canView(perms,"crm")` · POST→`canEdit(perms,"crm")` |
| `crm/accounts/[id]/route.ts` | ❌ | — | ❌ | ❌ | GET→`canView` · PATCH→`canEdit` · DELETE→`canDelete(perms,"crm")` |
| `crm/accounts/[id]/contracts/route.ts` | ❌ | ❌ | — | ❌ | GET→`canView` · POST→`canEdit` · DELETE→`canDelete` |
| `crm/contacts/route.ts` | ❌ | ❌ | ❌ | — | GET→`canView` · POST/PATCH→`canEdit` |
| `crm/contacts/[id]/route.ts` | ❌ | — | ❌ | ❌ | GET→`canView` · PATCH→`canEdit` · DELETE→`canDelete` |
| `crm/deals/route.ts` | ❌ | ❌ | — | — | GET→`canView(perms,"crm")` · POST→`canEdit` |
| `crm/deals/[id]/route.ts` | ❌ | — | ❌ | ❌ | GET→`canView` · PATCH→`canEdit` · DELETE→`canDelete` |
| `crm/deals/[id]/stage/route.ts` | — | ❌ | — | — | POST→`canEdit(perms,"crm")` |
| `crm/leads/route.ts` | ❌ | ❌ | — | — | GET→`canView(perms,"crm","leads")` · POST→`canEdit` |
| `crm/leads/[id]/route.ts` | ❌ | — | ❌ | ❌ | GET→`canView` · PATCH→`canEdit` · DELETE→`canDelete` *(ver Nivel 1+)* |
| `crm/leads/[id]/approve/route.ts` | — | ❌ | — | — | POST→`canEdit(perms,"crm","leads")` — **acción crítica**: crea account+contact+deal+quote |
| `crm/leads/[id]/reject/route.ts` | — | ❌ | — | — | POST→`canEdit(perms,"crm","leads")` |
| `crm/pipeline/route.ts` | ❌ | ❌ | — | — | GET→`canView` · POST→`canEdit` (crear etapas = configuración sensible) |
| `crm/notes/route.ts` | ❌ | ❌ | — | — | GET→`canView` · POST→`canEdit` |
| `crm/files/route.ts` | ❌ | — | — | — | GET→`canView` |
| `crm/files/upload/route.ts` | — | ❌ | — | — | POST→`canEdit` |
| `crm/files/[id]/route.ts` | — | — | — | ❌ | DELETE→`canDelete(perms,"crm")` |
| `crm/folders/[id]/route.ts` | — | — | — | ❌ | DELETE→`canDelete(perms,"crm")` |
| `crm/custom-fields/route.ts` | ❌ | ❌ | — | — | GET→`canView` · POST→`canEdit` (admin config) |
| `crm/search/route.ts` | ❌ | — | — | — | GET→`canView(perms,"crm")` |
| `crm/users/route.ts` | ❌ | — | — | — | GET→`canView(perms,"crm")` |
| `crm/installations/route.ts` | ❌ | ❌ | — | — | GET→`canView(perms,"crm","installations")` · POST→`canEdit` |
| `crm/installations/[id]/route.ts` | ❌ | — | ❌ | ❌ | GET→`canView` · PATCH→`canEdit` · DELETE→`canDelete` |
| `crm/email-templates/route.ts` | ❌ | ❌ | — | — | GET→`canView` · POST→`canEdit` |
| `crm/email-templates/[id]/route.ts` | ❌ | — | ❌ | ❌ | GET→`canView` · PATCH→`canEdit` · DELETE→`canDelete` |
| `crm/signatures/route.ts` | ❌ | ❌ | — | — | GET→`canView` · POST→`canEdit` |

#### Módulo Docs (operaciones de lectura y escritura)

| Archivo | GET | POST | PUT/PATCH | DELETE | Permisos que faltan |
|---------|-----|------|-----------|--------|---------------------|
| `docs/documents/route.ts` | ❌ | ❌ | — | — | GET→`canView(perms,"docs")` · POST→`canEdit` |
| `docs/documents/[id]/route.ts` | ❌ | — | ❌ | ✅ | GET→`canView` · PATCH→`canEdit` · DELETE ya protegido con `ensureCanDelete` |
| `docs/templates/route.ts` | ❌ | ❌ | — | — | GET→`canView` · POST→`canEdit` |
| `docs/templates/[id]/route.ts` | ❌ | — | ❌ | ✅ | GET→`canView` · PATCH→`canEdit` · DELETE ya protegido |
| `docs/categories/route.ts` | ❌ | ❌ | — | — | GET→`canView` · POST→`canEdit` |

#### Módulo AI

| Archivo | Método | Nivel | Permisos que faltan |
|---------|--------|-------|---------------------|
| `ai/lead-cost-inference/route.ts` | POST | 1 | `canEdit(perms,"crm")` — accede a leads y llama OpenAI |
| `ai/quote-description/route.ts` | POST | 1 | `canEdit(perms,"crm")` — guarda `aiDescription` en cotización |
| `ai/help-chat/route.ts` | POST | 1+ | Usa `canUseAiHelpChat()` propia, no integrada al sistema v2 |

#### Módulo Chat

| Archivo | Método | Nivel | Permisos que faltan |
|---------|--------|-------|---------------------|
| `chat/channels/route.ts` | GET | 1 | `ensureModuleAccess(ctx,"hub")` mínimo |
| `chat/channels/[id]/route.ts` | GET, DELETE | 1+ | GET→`ensureModuleAccess` · DELETE→`canDelete` (hoy: string literal `owner\|admin`) |
| `chat/channels/[id]/messages/route.ts` | GET, POST, DELETE | 1+ | Ídem — DELETE usa string literal |

---

### Nivel 1+ — String literals en lugar del sistema v2 🟠

Estos endpoints verifican `ctx.userRole === "owner" || ctx.userRole === "admin"` directamente, lo que **bypasea el sistema de RoleTemplates**: un usuario con template personalizado que tenga `crm.leads: "full"` seguirá siendo bloqueado, y un admin con template restrictivo tendrá acceso que no debería.

| Archivo | Línea aprox. | Operación | Problema |
|---------|-------------|-----------|---------|
| `crm/leads/[id]/route.ts` | ~53 | DELETE | String literal `owner\|admin` — ignora permisos v2 |
| `configuracion/empresa/route.ts` | PATCH | PATCH | String literal `owner\|admin` — debería ser `canEdit(perms,"config")` |
| `configuracion/branding/upload/route.ts` | POST | POST | String literal `owner\|admin` — debería ser `canEdit(perms,"config")` |
| `notes/[id]/route.ts` | ~116 | DELETE de notas ajenas | String literal `owner\|admin` |
| `notes/route.ts` | ~65, ~276 | Flags `isFullAdmin` | String literal — mezcla con `hasCapability` en mismo handler |
| `notes/activity/route.ts` | ~156 | GET con filtro por admin | String literal `owner\|admin` |
| `chat/channels/[id]/route.ts` | DELETE | DELETE | `isPrivileged` calculado con string literal |
| `chat/channels/[id]/messages/[messageId]/route.ts` | ~256 | DELETE | `isPrivileged` con string literal |
| `ops/rondas/monitoreo/turno/[id]/close/route.ts` | ~30 | POST | `isAdminRole` con string literal |
| `ops/asistencia/[id]/route.ts` | ~221 | GET/PUT | `isAdminRole` con string literal |

---

### Nivel 2 — `ensureModuleAccess` sin granularidad de operación 🟡

Estos endpoints verifican que el usuario tiene acceso al módulo, pero no distinguen entre `view`, `edit` y `full`, ni entre submódulos.

| Módulo | Endpoints con nivel 2 | Qué falta |
|--------|----------------------|-----------|
| `cpq` | TODAS las rutas de `/api/cpq/` (quotes, puestos, roles, cargos, catalog, settings, positions, includes) | Distinguir GET→`canView` vs POST→`canEdit` vs DELETE→`canDelete` por submódulo |
| `payroll` | `/api/payroll/periodos`, `/api/payroll/parameters`, `/api/payroll/simulator`, `/api/payroll/costing` | Ídem |
| `docs` | `docs/presentations` (algunas rutas) | Ídem |

**Impacto real del nivel 2 en CPQ:** Un usuario con `cpq: "view"` puede acceder al endpoint `POST /api/cpq/quotes` sin error — `ensureModuleAccess` solo verifica que `cpq != "none"`, no que sea `>= "edit"`.

---

### Nivel 3 — Correctamente protegidos ✅

#### Módulo Finance (bien auditado)
- `GET /api/finance/rendiciones` → `canView(perms,"finance","rendiciones")` + `hasCapability("rendicion_view_all")`
- `POST /api/finance/rendiciones` → `canEdit(perms,"finance","rendiciones")`
- `DELETE /api/finance/rendiciones/[id]` → `canDelete(perms,"finance","rendiciones")`
- `POST /api/finance/rendiciones/[id]/approve` → `hasCapability("rendicion_approve")`
- `POST /api/finance/rendiciones/[id]/submit` → `hasCapability("rendicion_submit")`
- `GET/POST /api/finance/payments` → `canView/canEdit(perms,"finance","pagos")`
- `POST /api/finance/payments` con `rendicion_pay` capability
- `GET /api/finance/reports/summary` → `canView(perms,"finance","reportes")`
- `GET /api/finance/reports/export` → `hasCapability("rendicion_export")`
- `GET/POST /api/finance/accounting/accounts` → `hasCapability("contabilidad_manage")`
- `POST /api/finance/billing/credit-note` → `hasCapability("facturacion_manage")`

#### Módulo Ops — Rondas (bien auditado)
- `GET /api/ops/rondas` → `canView(perms,"ops","rondas")`
- `GET /api/ops/rondas/checkpoints` → `canView(perms,"ops","rondas")`
- `POST /api/ops/rondas/checkpoints` → `canEdit + hasCapability("rondas_configure")`
- `POST /api/ops/rondas/alertas/[id]/resolve` → `hasCapability("rondas_resolve_alerts")`
- `POST /api/ops/rondas/monitoreo/turno/start` → `hasCapability("monitoreo_cerrar_turno")`
- `POST /api/ops/rondas/programacion` → `hasCapability("rondas_configure")`

#### Módulo Ops — Supervisión (bien auditado)
- `GET /api/ops/supervision` → `hasCapability("supervision_view_all")` OR `hasCapability("supervision_view_own")`
- `GET /api/ops/supervision/dashboard` → `hasCapability("supervision_dashboard")`
- `DELETE /api/ops/supervision/[id]` → `canDelete(perms,"ops","supervision")`

#### Módulo Ops — Turnos Extra
- `POST /api/te/[id]/aprobar` → `hasCapability("te_approve")`
- `POST /api/te/lotes/[id]/marcar-pagado` → `hasCapability("te_pay")`

#### Config (AI providers/models)
- `GET /api/config/ai-providers` → `canView(perms,"config")`
- `PUT /api/config/ai-providers/[id]` → `canEdit(perms,"config")`
- `POST /api/config/ai-models` → `canEdit(perms,"config")`

#### Otros
- `DELETE /api/docs/documents/[id]` → `ensureCanDelete(ctx,"docs","gestion")`
- `DELETE /api/docs/templates/[id]` → `ensureCanDelete(ctx,"docs","gestion")`
- `DELETE /api/presentations/[id]` → `ensureCanDelete(ctx,"docs","presentaciones")`
- `DELETE /api/ops/guard-events/[id]` → `ensureCanDelete(ctx,"ops","eventos_laborales")`
- `DELETE /api/personas/guardias/[id]` → `ensureOpsCapability("guardias_manage")`

---

## FASE 2 — Gaps de autorización por módulo

### CRM — Brecha sistémica (todo el módulo)

**Alcance:** ~42 archivos route. Ninguno usa `resolveApiPerms` + `canView/canEdit/canDelete`.

**Gap específico de mayor impacto:**

| Endpoint | Riesgo | Explicación |
|----------|--------|-------------|
| `DELETE /api/crm/accounts/[id]` | CRÍTICO | `viewer`, `solo_documentos`, `solo_payroll`, `inspector_dt` pueden borrar cuentas |
| `DELETE /api/crm/deals/[id]` | CRÍTICO | Ídem para negocios |
| `DELETE /api/crm/contacts/[id]` | CRÍTICO | Ídem para contactos |
| `DELETE /api/crm/installations/[id]` | CRÍTICO | Ídem para instalaciones |
| `POST /api/crm/leads/[id]/approve` | ALTO | Dispara creación en cascada: account + contact + deal + quote |
| `POST /api/crm/accounts/merge` | ALTO | Fusión destructiva de cuentas sin verificar `canEdit` |
| `POST /api/crm/custom-fields` | MEDIO | Modificar esquema de campos sin `canEdit(perms,"config")` |

**Roles que no deberían poder operar en CRM pero pueden:**
- `viewer` (rank 1): crm=`none` por defecto — pero puede hacer DELETE a cuentas/deals/contacts
- `solo_documentos`: crm=`none` — ídem
- `solo_payroll`: crm=`none` — ídem
- `rrhh`: crm=`none` — ídem
- `finanzas`: crm=`none` — ídem
- `solo_ops`: crm=`none` — ídem

### Docs — Brecha parcial (GETs y PATCHes)

| Endpoint | Problema |
|----------|---------|
| `GET /api/docs/documents` | Sin `canView(perms,"docs")` |
| `POST /api/docs/documents` | Sin `canEdit(perms,"docs")` |
| `PATCH /api/docs/documents/[id]` | Sin `canEdit` — `viewer` puede editar documentos |
| `GET /api/docs/templates` | Sin `canView` |
| `POST /api/docs/templates` | Sin `canEdit` |
| `PATCH /api/docs/templates/[id]` | Sin `canEdit` |

Los DELETEs de docs ya están protegidos (`ensureCanDelete`). El problema es que la protección es inconsistente dentro del mismo recurso.

### CPQ — Brecha de nivel (2 en lugar de 3)

`ensureModuleAccess(ctx, "cpq")` verifica que `cpq !== "none"`. Un usuario con `cpq: "view"` puede:
- Crear cotizaciones (`POST /api/cpq/quotes`) — debería requerir `canEdit`
- Crear posiciones y items — ídem
- Borrar cotizaciones (`DELETE /api/cpq/quotes/[id]`) — debería requerir `canDelete`

**Roles afectados:** cualquier rol con `cpq: "view"` (posible vía RoleTemplate personalizado).

### Access Control — Sin autenticación (3 rutas)

Estas rutas bajo `/api/access-control/` no llaman a `requireAuth()` en ningún momento:
- `config/[installationId]` — GET y PUT
- `devices/[installationId]` — GET
- `records/[installationId]` — GET

Exponen datos de control de acceso físico (quién entra/sale, dispositivos biométricos, listas de permitidos) sin ninguna autenticación.

> **Hipótesis:** estas rutas pueden estar diseñadas para ser consumidas desde dispositivos de acceso físico con algún token de dispositivo en el header que no fue detectado en la auditoría. **Verificar antes de agregar auth de sesión de admin** — podría romper la integración con hardware.

### Config/Configuración — Nivel 1+ (string literals)

`configuracion/empresa` y `configuracion/branding/upload` usan:
```typescript
if (ctx.userRole !== "owner" && ctx.userRole !== "admin") return forbidden()
```

Problema: un usuario con RoleTemplate que tenga `config: "edit"` no puede modificar la empresa aunque sus permisos lo permitan. Un admin con template restrictivo (`config: "none"`) SÍ puede modificarla.

---

## FASE 3 — Validación de roles vs acceso real

### Tabla: módulos accesibles según defaults vs. lo que los endpoints permiten

| Rol | Módulos según permisos | Módulos accesibles realmente vía API |
|-----|----------------------|-------------------------------------|
| `viewer` (rank 1) | hub: view, docs: view, el resto: none | + crm completo vía DELETE/POST (brecha) |
| `solo_documentos` | hub: view, docs: view | + crm completo vía DELETE/POST (brecha) |
| `solo_payroll` | hub: view, payroll: edit | + crm completo vía DELETE/POST (brecha) |
| `solo_crm` | hub: view, crm: edit | correcto — pero sin restricción de submódulo |
| `solo_ops` | hub: view, ops: edit | + crm completo vía DELETE/POST (brecha) |
| `rrhh` | hub: view, ops: edit, crm: none | + crm completo (brecha), + crm.installations: view (intencional por defaults) |
| `finanzas` | hub: view, finance: full | + crm completo vía DELETE/POST (brecha) |
| `supervisor` | hub: view, ops: edit, crm: view, finance: rendiciones edit | + crm accounts/contacts/deals DELETE (brecha) — solo debería tener crm.installations y crm.dotacion |
| `inspector_dt` | reportes_dt: view, fiscalizacion: view, resto: none | + crm completo vía DELETE/POST (brecha) |

### Roles con acceso excesivo específico

#### `viewer` — Mayor discrepancia
- **Debería:** solo ver Hub y Docs
- **Puede realmente:** DELETE de cualquier cuenta CRM, deal, contacto, instalación; crear leads, aprobar leads, modificar pipeline

#### `inspector_dt` — Acceso a datos de operaciones
- **Debería:** solo acceder a `reportes_dt` y `fiscalizacion`
- **Puede realmente:** ídem que viewer en CRM. Adicionalmente, si sus endpoints de `fiscalizacion` y `reportes_dt` usan `auth()` directo con check de rol `["owner","admin","inspector_dt"]`, y esos checks son correctos — pero en el resto de la API no hay protección que lo excluya explícitamente

#### `supervisor` — Acceso CRM excesivo
- **Debería:** crm.installations (view), crm.dotacion (view), crm.accounts (view), crm.contacts (view)
- **Puede realmente:** DELETE en accounts, deals, contacts, installations — las operaciones destructivas que deberían estar bloqueadas por su nivel `crm: "view"`
- **Nota:** `ensureSupervisorSupervisionAccess()` garantiza sus restricciones en `crm.leads`, `crm.deals`, `crm.quotes` al nivel de permisos, pero eso no sirve si los endpoints no llaman a `canDelete`

### Capabilities: verificación vs. roles que las tienen

| Capability | Endpoints que la verifican | Roles con la capability (defaults) |
|-----------|---------------------------|-------------------------------------|
| `te_approve` | `te/[id]/aprobar`, `te/[id]/rechazar` | owner, admin, editor, operaciones, jefe_operaciones |
| `te_pay` | `te/lotes/[id]/marcar-pagado`, `te/lotes` (POST) | owner, admin, finanzas |
| `rendicion_submit` | `rendiciones/[id]/submit` (y guard UI) | owner, admin, editor, operaciones, jefe_operaciones, finanzas, supervisor |
| `rendicion_approve` | `rendiciones/[id]/approve`, `rendiciones/[id]/reject` | owner, admin, operaciones, finanzas |
| `rendicion_pay` | `payments` (POST), `payments/[id]/export-santander` | owner, admin, finanzas |
| `rendicion_configure` | `cost-centers` (POST), `config` finance (PATCH) | owner, admin, finanzas |
| `rendicion_view_all` | `rendiciones` (GET), `rendiciones/[id]` (GET) — restringe a propias si false | owner, admin, editor, operaciones, rrhh, finanzas |
| `rendicion_export` | `reports/export` (GET) | owner, admin, finanzas |
| `rondas_configure` | `checkpoints` (POST), `ia/config` (POST), `programacion` (POST) | owner, admin, operaciones, jefe_operaciones |
| `rondas_resolve_alerts` | `alertas/[id]/resolve` (POST) | owner, admin, editor, operaciones |
| `monitoreo_cerrar_turno` | `monitoreo/turno/[id]/close` (POST) | owner, admin, operaciones |
| `supervision_view_all` | `supervision` (GET) filter | owner, admin, jefe_operaciones |
| `supervision_view_own` | `supervision` (GET) filter | owner, admin, jefe_operaciones, supervisor (forzado) |
| `supervision_dashboard` | `supervision/dashboard` (GET) | owner, admin, jefe_operaciones, supervisor (forzado) |
| `supervision_checkin` | guard UI, no verificado en API | owner, admin, jefe_operaciones, supervisor (forzado) |
| `control_nocturno_approve` | — *(no encontrado en API routes)* | owner, admin, operaciones, jefe_operaciones |
| `control_nocturno_delete` | `control-nocturno/[id]` (DELETE) | owner, admin |
| `contabilidad_manage` | `accounting/accounts` (GET/POST/PUT) | owner, admin, finanzas |
| `facturacion_manage` | `billing/credit-note`, `billing/debit-note` | owner, admin, finanzas |
| `ticket_approve` | `tickets/[id]/approvals` (POST) | owner, admin, editor, operaciones, jefe_operaciones, rrhh, supervisor |
| `ticket_manage_types` | — *(no encontrado en API routes)* | owner, admin |
| `invite_users` | `configuracion/usuarios` (UI guard, no API) | owner, admin |
| `manage_users` | `configuracion/usuarios` (UI guard, no API) | owner, admin |
| `manage_settings` | — *(no encontrado en API routes)* | owner, admin |
| `gamificacion_bonos_aprobar` | — *(no encontrado en API routes)* | owner, admin, operaciones, rrhh |
| `dt_manage_sessions` | `admin/dt/crear-acceso-inspector`, `admin/dt/sessions` | owner, admin |
| `dt_view_incidents` | `admin/dt/incidents` (UI guard, no API check explícito) | owner, admin |

---

## FASE 4 — Capabilities sin verificación en API

Las siguientes capabilities están definidas en `CAPABILITY_KEYS` pero no tienen verificación explícita en ningún route API:

| Capability | Estado |
|-----------|--------|
| `control_nocturno_approve` | Definida, no verificada en API (solo mencionada en permisos de rol) |
| `ticket_manage_types` | Definida, no verificada en API |
| `invite_users` | Solo guard de UI en page.tsx |
| `manage_users` | Solo guard de UI en page.tsx |
| `manage_settings` | Definida, no verificada en ningún lado |
| `gamificacion_bonos_aprobar` | Definida, no verificada en API |
| `dt_view_incidents` | Solo check de rol string en admin/dt/incidents, no usa `hasCapability` |
| `supervision_checkin` | Definida pero el check está en el portal del supervisor, no en la API de admin |

---

## Checklist de fixes ordenado por prioridad

### PRIORIDAD 1 — Sin autenticación (Nivel 0 → Nivel 3)

> Verificar primero si estas rutas usan autenticación por token de dispositivo en header antes de agregar auth de sesión admin.

- [ ] `src/app/api/access-control/config/[installationId]/route.ts` — Agregar `requireAuth()` + `canView/canEdit(perms, "ops")` o crear módulo `access_control`
- [ ] `src/app/api/access-control/devices/[installationId]/route.ts` — Ídem
- [ ] `src/app/api/access-control/records/[installationId]/route.ts` — Ídem

### PRIORIDAD 2 — DELETEs sin ningún check de permisos (escalada de privilegios confirmada)

Cualquier usuario autenticado del tenant puede ejecutar estos DELETEs independientemente de su rol:

- [ ] `src/app/api/crm/accounts/[id]/route.ts` DELETE → agregar `canDelete(perms, "crm")`
- [ ] `src/app/api/crm/deals/[id]/route.ts` DELETE → agregar `canDelete(perms, "crm")`
- [ ] `src/app/api/crm/contacts/[id]/route.ts` DELETE → agregar `canDelete(perms, "crm")`
- [ ] `src/app/api/crm/installations/[id]/route.ts` DELETE → agregar `canDelete(perms, "crm", "installations")`
- [ ] `src/app/api/crm/files/[id]/route.ts` DELETE → agregar `canDelete(perms, "crm")`
- [ ] `src/app/api/crm/folders/[id]/route.ts` DELETE → agregar `canDelete(perms, "crm")`
- [ ] `src/app/api/crm/accounts/[id]/contracts/[contractId]/route.ts` DELETE → agregar `canDelete(perms, "crm")`

Patrón de fix:
```typescript
const ctx = await requireAuth();
if (!ctx) return unauthorized();
const perms = await resolveApiPerms(ctx);
if (!canDelete(perms, "crm")) {
  return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
}
```

### PRIORIDAD 3 — Acciones críticas sin check (Nivel 1 en operaciones de alto impacto)

- [ ] `src/app/api/crm/leads/[id]/approve/route.ts` POST → `canEdit(perms, "crm", "leads")` — dispara creación en cascada
- [ ] `src/app/api/crm/leads/[id]/reject/route.ts` POST → `canEdit(perms, "crm", "leads")`
- [ ] `src/app/api/crm/accounts/merge/route.ts` POST → `canEdit(perms, "crm")` — fusión destructiva
- [ ] `src/app/api/crm/custom-fields/route.ts` POST → `canEdit(perms, "config")` o `canEdit(perms, "crm")`

### PRIORIDAD 4 — String literals que bypasean el sistema v2

Reemplazar comparaciones directas de rol con permisos del sistema v2:

- [ ] `src/app/api/crm/leads/[id]/route.ts` DELETE — reemplazar `ctx.userRole !== "owner" && ctx.userRole !== "admin"` por `!canDelete(perms, "crm", "leads")`
- [ ] `src/app/api/configuracion/empresa/route.ts` PATCH — reemplazar por `canEdit(perms, "config")`
- [ ] `src/app/api/configuracion/branding/upload/route.ts` POST — reemplazar por `canEdit(perms, "config")`
- [ ] `src/app/api/notes/[id]/route.ts` DELETE — reemplazar `isFullAdmin` por `canDelete(perms, "hub")` o capability específica
- [ ] `src/app/api/ops/rondas/monitoreo/turno/[id]/close/route.ts` — reemplazar `isAdminRole` por `hasCapability(perms, "monitoreo_cerrar_turno")`
- [ ] `src/app/api/ops/asistencia/[id]/route.ts` — reemplazar `isAdminRole` por permisos v2 correspondientes

### PRIORIDAD 5 — CRM restante (escrituras sin check de edit)

Agregar `canEdit(perms, "crm")` en todos los POSTs y PATCHes del módulo CRM que solo tienen `requireAuth()`:

- [ ] `crm/accounts/route.ts` POST
- [ ] `crm/accounts/[id]/route.ts` PATCH
- [ ] `crm/contacts/route.ts` POST, PATCH
- [ ] `crm/contacts/[id]/route.ts` PATCH
- [ ] `crm/deals/route.ts` POST
- [ ] `crm/deals/[id]/route.ts` PATCH
- [ ] `crm/deals/[id]/stage/route.ts` POST
- [ ] `crm/leads/route.ts` POST
- [ ] `crm/pipeline/route.ts` POST
- [ ] `crm/notes/route.ts` POST
- [ ] `crm/email-templates/route.ts` POST
- [ ] `crm/email-templates/[id]/route.ts` PATCH, DELETE

### PRIORIDAD 6 — CRM lectura (GETs sin check de view)

Agregar `canView(perms, "crm")` en todos los GETs del módulo CRM:

- [ ] `crm/accounts/route.ts` GET
- [ ] `crm/accounts/[id]/route.ts` GET
- [ ] `crm/contacts/route.ts` GET
- [ ] `crm/contacts/[id]/route.ts` GET
- [ ] `crm/deals/route.ts` GET
- [ ] `crm/deals/[id]/route.ts` GET
- [ ] `crm/leads/route.ts` GET
- [ ] `crm/leads/[id]/route.ts` GET
- [ ] `crm/pipeline/route.ts` GET
- [ ] `crm/files/route.ts` GET
- [ ] `crm/search/route.ts` GET

### PRIORIDAD 7 — Docs (GETs y PATCHes sin check)

- [ ] `docs/documents/route.ts` GET → `canView(perms, "docs")`
- [ ] `docs/documents/route.ts` POST → `canEdit(perms, "docs")`
- [ ] `docs/documents/[id]/route.ts` GET → `canView(perms, "docs")`
- [ ] `docs/documents/[id]/route.ts` PATCH → `canEdit(perms, "docs")`
- [ ] `docs/templates/route.ts` GET → `canView(perms, "docs")`
- [ ] `docs/templates/route.ts` POST → `canEdit(perms, "docs")`
- [ ] `docs/templates/[id]/route.ts` GET → `canView(perms, "docs")`
- [ ] `docs/templates/[id]/route.ts` PATCH → `canEdit(perms, "docs")`
- [ ] `docs/categories/route.ts` GET/POST → `canView/canEdit(perms, "docs")`

### PRIORIDAD 8 — CPQ (subir de nivel 2 a nivel 3)

Reemplazar `ensureModuleAccess(ctx, "cpq")` por checks granulares:
- [ ] `cpq/quotes/route.ts` GET → `canView(perms, "cpq")` · POST → `canEdit(perms, "cpq")`
- [ ] `cpq/quotes/[id]/route.ts` GET → `canView` · PUT → `canEdit` · DELETE → `canDelete`
- [ ] `cpq/puestos/route.ts` POST → `canEdit(perms, "cpq")`
- [ ] `cpq/catalog/route.ts` POST → `canEdit(perms, "cpq")`
- [ ] `cpq/settings/route.ts` PUT → `canEdit(perms, "cpq")`

### PRIORIDAD 9 — Capabilities sin implementar en API

- [ ] `control_nocturno_approve` — definir qué endpoint debería verificarla y agregar el check
- [ ] `gamificacion_bonos_aprobar` — verificar si `gamification/fondos/[id]/sugerencias/[id]` PUT debería requerirla
- [ ] `ticket_manage_types` — agregar a `ops/ticket-types/route.ts` POST/PUT/DELETE
- [ ] `manage_settings` — clarificar su uso o eliminarla de `CAPABILITY_KEYS`

---

## Notas arquitecturales

### Por qué el módulo CRM tiene esta brecha sistémica

El sistema de permisos v2 (`permissions.ts`) parece haber sido implementado primero en Finance y Ops (los módulos más sensibles económicamente), y se está extendiendo gradualmente al resto. El CRM usa un patrón anterior donde la seguridad se delegaba al filtro `tenantId` en las queries Prisma (correcto para isolation, pero insuficiente para autorización intra-tenant).

### Riesgo real en producción

En un tenant con múltiples usuarios (ejemplo: 1 owner, 2 admins, 5 editors, 3 viewers, 2 solo_crm):
- Los `viewer` actualmente pueden borrar cuentas CRM, deals y contactos
- Un `solo_payroll` puede ejecutar `POST /api/crm/leads/[id]/approve` y crear una cuenta de cliente completa
- Un `inspector_dt` con acceso temporal puede borrar datos de CRM durante su sesión activa

### Sobre el patrón `updateMany` en Prisma

Relacionado con el contexto previo del hilo: para operaciones de update/delete donde no existe un unique constraint en `(id, tenantId)`, el patrón correcto es:

```typescript
// ✅ Patrón seguro con verificación de count
const result = await prisma.crmAccount.updateMany({
  where: { id, tenantId: ctx.tenantId },
  data: { ... }
});
if (result.count === 0) return notFound();
```

O alternativamente usar el Prisma Row-Level Security Extension como safety net, pero **después** de agregar los checks de permisos faltantes — la RLS es defensa en profundidad, no sustituto de autorización.

---

*Generado por auditoría automatizada. Última actualización: 2026-03-18*
