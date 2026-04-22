# Auditoría Read-Only del Sistema de Permisos de Configuración

## 1. Metadata

| Campo | Valor |
|---|---|
| Fecha y hora | 2026-04-22 (local) |
| Git commit | `00ae2cb0b8a21edbf4e0e2887c83ab7e6e482474` |
| Branch | `main` |
| Node | v22.22.0 |
| pnpm | 10.7.0 |
| Path del repo | `/Users/caco/Desktop/Cursor/opai` |
| Scripts generados | `scripts/audit-db-read.ts`, `scripts/audit-matrix.ts`, `scripts/audit-ui-vs-defaults.ts` |
| Sub-reportes | `audit-reports/matrix.md`, `audit-reports/ui-vs-defaults.md`, `audit-reports/db-inventory.md`, `audit-reports/raw-config-guards.txt` |

> **Nota sobre BD**: los bloques 2, 3 y 6b requieren conexión a la base de datos de producción/staging. La ejecución local contra `$DATABASE_URL` del entorno actual produjo `relation "RoleTemplate" does not exist` (schema local obsoleto o apunta a BD vacía). El script `scripts/audit-db-read.ts` quedó listo para ejecutarse con credenciales válidas.

---

## 2. Role Templates en Base de Datos

**BLOQUE 2 NO EJECUTADO** — razón: `Raw query failed. Code: "42P01". Message: relation "RoleTemplate" does not exist`. La BD apuntada por `DATABASE_URL` en el entorno local no contiene el schema de `RoleTemplate` (posible BD de test vacía o desfasada).

Ver `audit-reports/db-inventory.md` para el output completo del intento.

**Qué se puede asumir por código** (`src/lib/permissions.ts:714-773`):
- Los templates se siembran vía `ROLE_TEMPLATE_SEEDS`, que usa 1:1 `DEFAULT_ROLE_PERMISSIONS` como fuente.
- Slugs esperados: `owner` (isSystem), `admin` (isSystem), `editor`, `jefe_operaciones`, `central_monitoreo`, `supervisor`, `viewer`, `inspector_dt` (isSystem).
- El script `scripts/migrate-role-templates.ts:29-37` confirma que los templates en BD se ACTUALIZAN copiando `DEFAULT_ROLE_PERMISSIONS[slug]`. Por lo tanto en producción, salvo edición manual desde `/opai/configuracion/roles`, el template en BD será idéntico a los defaults del código.

**Acción pendiente**: re-ejecutar `npx tsx scripts/audit-db-read.ts` contra la BD real (Neon/Postgres de Vercel) antes de tomar decisiones.

---

## 3. Distribución de roles por tenant

**BLOQUE 3 NO EJECUTADO** — razón: `Raw query failed. Code: "42703". Message: column a.roleTemplateId does not exist`.

**Queries listas en el script** `scripts/audit-db-read.ts:102-150`:
- Totales por rol con/sin template y set de tenants.
- Detalle tenant × rol × template_slug.

---

## 4. Middleware global

**🚨 HALLAZGO CRÍTICO — NO EXISTE `middleware.ts` EN LA RAMA `main`.**

Búsqueda:
```bash
find . -maxdepth 4 -name "middleware.ts" -not -path "*/node_modules/*" \
  -not -path "*/worktrees/*" -not -path "*/.claude/*" -not -path "*/.worktrees/*"
→ (sin resultados)
```

`middleware.ts` sólo aparece en worktrees de feature branches (p.ej. `.worktrees/portal-supervisor/src/middleware.ts`, `.claude/worktrees/etapa-5-audit-pautas-subnav/src/middleware.ts`). **En `main` no hay middleware de autenticación/autorización a nivel de ruta.**

### Implicancias

1. **Toda la autorización de páginas vive en los propios `page.tsx`** (server components). No hay una primera línea de defensa a nivel de Next.js middleware.
2. **Toda la autorización de API vive en cada `route.ts`** (vía `requireAuth()` de `src/lib/api-auth.ts` o similares). No hay un punto único que bloquee `/api/admin/*` o `/api/config/*` antes de que llegue al handler.
3. La función `pathToPermission` (`src/lib/permissions.ts:781-861`) **NO está siendo invocada desde ningún lugar en `src/`**:
   ```
   grep -rn "pathToPermission\|apiPathToModule" src/ → solo definiciones, 0 usos
   ```
   Es código muerto por ahora, pero útil como catálogo de referencia.

### Cómo se mitiga actualmente

- [src/app/(app)/layout.tsx](src/app/(app)/layout.tsx#L38-L42) hace `auth()` + `redirect('/opai/login')` para cualquier ruta bajo `(app)`. Esto garantiza que el usuario esté logueado, pero **no verifica permisos**.
- Cada `page.tsx` debe replicar el patrón: `auth()` → `resolvePagePerms()` → `canView()/hasModuleAccess()` → `redirect()`. Ver Bloque 5.

---

## 5. Guards por página de configuración (tabla completa)

Inspección directa de [src/app/(app)/opai/configuracion/*/page.tsx](src/app/(app)/opai/configuracion/) (ver `audit-reports/raw-config-guards.txt` para el snippet crudo).

| Subpágina | Tipo | Sistema guard | Expresión | Redirect si falla | Módulo/submódulo chequeado |
|---|---|---|---|---|---|
| `/configuracion` (home) | server | nuevo | `hasModuleAccess(perms, "config")` | `/hub` | `config` (cualquier sub) |
| `/configuracion/empresa` | **client `"use client"`** | **NINGUNO** | — | — | — |
| `/configuracion/usuarios` | server | nuevo | `canView(perms,"config","usuarios") \|\| !hasCapability(perms,"manage_users")` (AND negado) | `/opai/inicio` | `config.usuarios` **+** capability `manage_users` |
| `/configuracion/roles` | server | role literal | `role !== "owner" && role !== "admin"` | `/opai/configuracion` | — |
| `/configuracion/grupos` | server | **LEGACY rbac** | `hasPermission(role, PERMISSIONS.MANAGE_SETTINGS)` | `/opai/configuracion` | — |
| `/configuracion/integraciones` | server | nuevo | `canView(perms,"config","integraciones")` | `/opai/configuracion` | `config.integraciones` |
| `/configuracion/notificaciones` | server | **LEGACY rbac** | `hasPermission(role, PERMISSIONS.MANAGE_SETTINGS)` | `/opai/configuracion` | — |
| `/configuracion/asistente-ia` | server | **LEGACY rbac** | `hasPermission(role, PERMISSIONS.MANAGE_SETTINGS)` | `/opai/configuracion` | — |
| `/configuracion/auditoria` | server | role literal | `!(role === "owner" \|\| role === "admin")` | `/opai/configuracion` | — |
| `/configuracion/documentos-operacionales` | server | role literal | `role !== "admin" && role !== "owner"` | `/opai/configuracion` | — |
| `/configuracion/mi-plan` | **client `'use client'`** | **NINGUNO** | — | — | — |
| `/configuracion/firmas` | server | nuevo | `canView(perms,"config","firmas")` | `/opai/configuracion` | `config.firmas` |
| `/configuracion/categorias-plantillas` | server | nuevo | `canView(perms,"config","categorias")` | `/opai/configuracion` | `config.categorias` |
| `/configuracion/cumplimiento` | server | role literal | `!["owner","admin"].includes(role)` | `/opai/configuracion` | — |
| `/configuracion/crm` | server | nuevo | `canView(perms,"config","crm")` | `/opai/configuracion` | `config.crm` |
| `/configuracion/cpq` | server | nuevo | `canView(perms,"config","cpq")` | `/opai/configuracion` | `config.cpq` |
| `/configuracion/payroll` | server | nuevo | `canView(perms,"config","payroll")` | `/opai/configuracion` | `config.payroll` |
| `/configuracion/ops` | server | **LEGACY rbac** | `hasPermission(role, PERMISSIONS.MANAGE_SETTINGS)` | `/opai/configuracion` | — |
| `/configuracion/tipos-ticket` | server | **LEGACY rbac** | `hasPermission(role, PERMISSIONS.MANAGE_SETTINGS)` | `/opai/configuracion` | — |
| `/configuracion/finanzas` | server | nuevo | `hasModuleAccess(perms,"config") && hasCapability(perms,"rendicion_configure")` | `/hub` o `/opai/configuracion` | `config` módulo + capability |
| `/configuracion/gamificacion` | server | nuevo | `canView(perms,"ops","gamificacion")` | `/opai/configuracion` | **`ops.gamificacion`** (no config) |
| `/configuracion/alertas-cobertura` | server | nuevo | `canView(perms,"config","alertas_cobertura")` | `/opai/configuracion` | `config.alertas_cobertura` |
| `/configuracion/ats` | server | nuevo | `canView(perms,"ops","ats")` | **`/hub`** | **`ops.ats`** (no config) |
| `/configuracion/inteligencia-artificial` | server | **NINGUNO (sólo auth)** | — | — | — |
| `/configuracion/email-templates` | server | redirect-only | — | `/opai/configuracion` siempre | — |

### Observaciones

- **3 sistemas de guard coexisten**: nuevo (`canView/hasModuleAccess`), legacy (`hasPermission(role, PERMISSIONS.MANAGE_SETTINGS)`), literal (`role === "owner"/"admin"`).
- **5 páginas usan el sistema LEGACY** (`rbac.ts`): grupos, notificaciones, asistente-ia, ops, tipos-ticket.
- **3 páginas carecen de cualquier guard de permiso** (solo chequean sesión): **empresa**, **mi-plan**, **inteligencia-artificial**.
- **2 páginas chequean submódulo del módulo `ops`, no `config`**: gamificacion (`ops.gamificacion`) y ats (`ops.ats`). Esto significa que su visibilidad está desacoplada del filtro UI, que usa `config.<submodule>`.
- **Inconsistencia de redirect**: la mayoría redirige a `/opai/configuracion`; `ats` redirige a `/hub`; `finanzas` puede redirigir a cualquiera de los dos.

---

## 6. Matriz rol × submódulo (defaults en código)

Script: `scripts/audit-matrix.ts` — output completo en `audit-reports/matrix.md` (1.113 líneas, matriz 16 roles × 10 módulos × todos los submódulos).

### 6.1 Resumen crítico — nivel efectivo en `config.*` por rol

| rol | modulo:config | usuarios | grupos | integraciones | firmas | categorias | crm | cpq | payroll | notificaciones | ops | tipos_ticket | finanzas | alertas_cobertura | ats |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| owner | full | full | full | full | full | full | full | full | full | full | full | full | full | full | full |
| admin | edit | edit | edit | edit | edit | edit | edit | edit | edit | edit | edit | edit | edit | edit | edit |
| editor | **none** | **none** | **none** | **none** | **none** | **none** | **none** | **none** | **none** | **none** | **none** | **none** | **none** | **none** | **none** |
| jefe_operaciones | none | none | none | none | none | none | none | none | none | none | none | none | none | none | none |
| central_monitoreo | none | none | none | none | none | none | none | none | none | none | none | none | none | none | none |
| supervisor | none | none | none | none | none | none | none | none | none | none | none | none | none | none | none |
| viewer | none | none | none | none | none | none | none | none | none | none | none | none | none | none | none |
| rrhh | none | none | none | none | none | none | none | none | none | none | none | none | none | none | none |
| operaciones | none | none | none | none | none | none | none | none | none | none | none | none | none | none | none |
| finanzas | none | none | none | none | none | none | none | none | none | none | none | none | none | none | none |
| reclutamiento | none | none | none | none | none | none | none | none | none | none | none | none | none | none | none |
| solo_ops | none | none | none | none | none | none | none | none | none | none | none | none | none | none | none |
| solo_crm | none | none | none | none | none | none | none | none | none | none | none | none | none | none | none |
| solo_documentos | none | none | none | none | none | none | none | none | none | none | none | none | none | none | none |
| solo_payroll | none | none | none | none | none | none | none | none | none | none | none | none | none | none | none |
| inspector_dt | none | none | none | none | none | none | none | none | none | none | none | none | none | none | none |

**Conclusión**: sólo `owner` y `admin` tienen algún nivel > `none` en `config.*`. **Todos los demás 14 roles tienen `none` en todos los submódulos de config**. Fuente: [src/lib/permissions.ts:407-597](src/lib/permissions.ts#L407-L597).

### 6b. Matriz desde BD real

**BLOQUE 6b NO EJECUTADO** — razón: misma que 2 y 3 (no hay acceso a BD con schema actual). Query lista en `scripts/audit-db-read.ts:155-185`.

---

## 7. Contradicciones UI ↔ Defaults

Script: `scripts/audit-ui-vs-defaults.ts` — output completo en `audit-reports/ui-vs-defaults.md`. Replica `CONFIG_SECTIONS` tal como está en [src/app/(app)/opai/configuracion/page.tsx](src/app/(app)/opai/configuracion/page.tsx#L22-L69).

### 7.1 Ítems en UI cuyo `submodule` NO existe en `SUBMODULE_KEYS.config`

| title | href | submodule declarado en UI |
|---|---|---|
| Gamificación | `/opai/configuracion/gamificacion` | **`gamificacion`** ❌ no está en `SUBMODULE_KEYS.config` (existe en `SUBMODULE_KEYS.ops`) |

**Consecuencia directa**: `canView(perms, "config", "gamificacion")` **hace cascada al módulo padre** porque la key no está registrada. El padre `config` es `none` para todos menos owner/admin, así que el ítem se esconde para todos excepto admins. Además, si un admin (isAdmin=true) bypassa el `canView` por estar dentro del `adminOnly`, el ítem se muestra. Para no-admins la cascada coincide accidentalmente con el comportamiento deseado, pero es frágil.

**Observación adicional** (no capturada automáticamente): `SUBMODULE_META` en [src/lib/permissions.ts:279](src/lib/permissions.ts#L279) contiene `{ key: "config.inteligencia_artificial", ... }` pero `SUBMODULE_KEYS.config` NO incluye `"inteligencia_artificial"`. El metadata apunta a una key que el catálogo canónico no conoce.

### 7.2 Ítems `adminOnly` que no-admins verían por defaults

| result |
|---|
| (ninguno) — como todos los no-admins tienen `config: none`, el filtro `canView` los bloquea igual que `adminOnly`. No hay contradicción tipo "UI oculta lo que el permiso permitía". |

### 7.3 Ítems NO `adminOnly` pero que no-admin NO puede ver por defaults

Esto es el **bug reportado por el usuario**.

14/14 roles no-admin están bloqueados de **TODOS** los items sin `adminOnly`:

| Ítem (no-adminOnly) | submodule | roles bloqueados |
|---|---|---|
| Usuarios | usuarios | 14/14 |
| Grupos | grupos | 14/14 |
| Integraciones | integraciones | 14/14 |
| Notificaciones | notificaciones | 14/14 |
| Firmas | firmas | 14/14 |
| Categorías de plantillas | categorias | 14/14 |
| CRM | crm | 14/14 |
| Cotizaciones (CPQ) | cpq | 14/14 |
| Payroll | payroll | 14/14 |
| Operaciones | ops | 14/14 |
| Tipos de Ticket | tipos_ticket | 14/14 |
| Finanzas | finanzas | 14/14 |
| Alertas de Cobertura | alertas_cobertura | 14/14 |
| ATS — Reclutamiento | ats | 14/14 |

### 7.4 Items visibles en Configuración por rol (solo defaults)

| rol | modulo `config` | items visibles UI |
|---|---|---:|
| owner | full | 22/22 |
| admin | edit | 22/22 |
| editor | none | **0/22** |
| jefe_operaciones | none | 0/22 |
| central_monitoreo | none | 0/22 |
| supervisor | none | 0/22 |
| viewer | none | 0/22 |
| (todos los legacy) | none | 0/22 |

**Root cause del bug**: [src/lib/permissions.ts:426](src/lib/permissions.ts#L426) — `editor.modules.config = "none"` y no hay overrides de submódulo. Por cascada (`getEffectiveLevel` en `permissions.ts:607-621`), `canView(perms, "config", *)` retorna `false` para cualquier submódulo, y la home de configuración hace `hasModuleAccess(perms, "config") → false → redirect("/hub")`.

El mismo patrón aplica a todos los roles no-admin. El diseño actual asume que **solo owner/admin tocan configuración**; eso contradice la UI, que expone ítems no-adminOnly implicando que deberían ser visibles a un subset más amplio.

---

## 8. Endpoints de permisos existentes

Búsqueda:
```
grep -rn "resolvePermissions\|resolvePagePerms\|resolvePermissionsById" src/app/api/ → 0 resultados
```

**No existe un endpoint público** del estilo `/api/me/permissions` o `/api/permissions/me` que devuelva el shape `RolePermissions` para el usuario logueado.

### Cómo acceden los client components a sus permisos

Ya existe un mecanismo: [src/lib/permissions-context.tsx](src/lib/permissions-context.tsx) envuelve toda la app (inicializado en [src/app/(app)/layout.tsx:65](src/app/(app)/layout.tsx#L65)). Hooks expuestos:

- `usePermissions(): RolePermissions`
- `useCanView(module, submodule?)`, `useCanEdit(...)`, `useCanDelete(...)`
- `useHasCapability(cap)`, `useHasModuleAccess(module)`
- `useVisibleSubmodules(module)`, `useEffectiveLevel(module, submodule?)`

**Evaluación**: para UI dentro de rutas `(app)/*` no hace falta un endpoint REST. El contexto ya resuelve los permisos en el server y los hidrata al cliente. Un endpoint adicional sería útil solo para:
- Apps/capas que viven fuera de `(app)` (ej. portal cliente, admin plataforma) y necesiten los permisos del usuario.
- Clients que polleen cambios de permisos tras editar un template (hoy la UI debe recargar para refrescar).

### Endpoints admin de RoleTemplate

| Path | Métodos | Auth |
|---|---|---|
| `/api/admin/role-templates` | GET, POST | `requireAuth()` + role==owner/admin |
| `/api/admin/role-templates/[id]` | GET, PUT, DELETE | `requireAuth()` + role==owner/admin |

Comportamiento de escritura ([route.ts:74-79](src/app/api/admin/role-templates/[id]/route.ts#L74-L79), [route.ts:114-122](src/app/api/admin/role-templates/[id]/route.ts#L114-L122)):
- `PUT` sobre template `isSystem && slug=="owner"` → rechazado.
- `PUT` sobre template `isSystem && slug=="admin"` → sólo owner.
- `PUT/DELETE` llaman a `invalidateTemplateCache(id)` — OK.

---

## 9. Rutas sin mapeo a permiso

`pathToPermission` ([src/lib/permissions.ts:781-861](src/lib/permissions.ts#L781-L861)) NO se invoca desde ningún lado del código (ver BLOQUE 4). La tabla abajo es informativa: si se activa un middleware que lo use, estas rutas pasarían sin chequeo.

### 9.1 Páginas `(app)/*` sin match en `pathToPermission`

```
/chat
/opai
/opai/actividad
/opai/compliance/arco
/opai/perfil
/opai/perfil/notificaciones
/opai/usuarios
/personas
/personas/comunicaciones
/personas/comunicaciones/plantillas/[id]
/personas/gamificacion
/personas/onboarding
/portales
/portales/[portalId]/ranking
/reportes/dt                      # ojo: el módulo "reportes_dt" existe en MODULE_KEYS pero ningún if lo mapea
/reportes/dt/asistencia-diaria
/reportes/dt/domingos-festivos
/reportes/dt/jornada-diaria
/reportes/dt/modificaciones-turnos
```

### 9.2 APIs notables sin mapeo en `apiPathToModule`/`apiPathToSubmodule`

`apiPathToModule` ([src/lib/permissions.ts:864-879](src/lib/permissions.ts#L864-L879)) sólo cubre prefijos `/api/ops`, `/api/te`, `/api/personas`, `/api/crm`, `/api/docs`, `/api/payroll`, `/api/cpq`, `/api/finance`, `/api/admin/dt`, `/api/fiscalizacion`. Grandes áreas sin mapeo (muestra, de las 885 rutas totales):

```
/api/access-control/*             # control de acceso
/api/admin/arco                   # compliance
/api/admin/role-templates         # gestión de permisos
/api/ai/*
/api/branding
/api/chat/*
/api/config/*                     # ai-models, ai-providers, global-documents
/api/configuracion/*              # empresa, branding/upload
/api/notifications/*
/api/presentations, /api/templates  # mapean a "docs" por excepción
/api/portales/*
/api/me/*                         # si existen
```

**Cada endpoint individual sigue aplicando `requireAuth()` o `auth()`** internamente (verificado en asserts puntuales, ej. `role-templates/[id]/route.ts:20`), así que la ausencia en `apiPathToModule` no es una fuga inmediata — pero impide que un middleware global centralice la verificación.

---

## 10. Archivos que aún dependen del sistema legacy (`rbac.ts` / `role-policy.ts`)

Búsqueda: `grep -rln 'from "@/lib/rbac"|from "@/lib/role-policy"' src/` — **17 archivos**.

| Archivo | Función legacy usada | Permiso chequeado |
|---|---|---|
| [src/app/(app)/opai/configuracion/asistente-ia/page.tsx](src/app/(app)/opai/configuracion/asistente-ia/page.tsx#L45) | `hasPermission` | `MANAGE_SETTINGS` |
| [src/app/(app)/opai/configuracion/grupos/page.tsx](src/app/(app)/opai/configuracion/grupos/page.tsx#L13) | `hasPermission` | `MANAGE_SETTINGS` |
| [src/app/(app)/opai/configuracion/notificaciones/page.tsx](src/app/(app)/opai/configuracion/notificaciones/page.tsx#L13) | `hasPermission` | `MANAGE_SETTINGS` |
| [src/app/(app)/opai/configuracion/ops/page.tsx](src/app/(app)/opai/configuracion/ops/page.tsx#L13) | `hasPermission` | `MANAGE_SETTINGS` |
| [src/app/(app)/opai/configuracion/tipos-ticket/page.tsx](src/app/(app)/opai/configuracion/tipos-ticket/page.tsx#L13) | `hasPermission` | `MANAGE_SETTINGS` |
| [src/app/(app)/opai/actions/users.ts](src/app/(app)/opai/actions/users.ts) | `hasPermission` (x7) | `INVITE_USERS`, `MANAGE_USERS` |
| [src/app/api/notifications/config/route.ts](src/app/api/notifications/config/route.ts#L67) | `hasPermission` | `MANAGE_SETTINGS` |
| [src/app/api/ops/postulacion-documentos/route.ts](src/app/api/ops/postulacion-documentos/route.ts) | `hasPermission` (x2) | `MANAGE_SETTINGS` |
| [src/app/api/ops/marcacion/config/route.ts](src/app/api/ops/marcacion/config/route.ts#L48) | `hasPermission` | `MANAGE_SETTINGS` |
| [src/app/api/ai/help-chat/config/route.ts](src/app/api/ai/help-chat/config/route.ts) | — (importa) | — |
| [src/app/api/docs/documents/[id]/send-review/route.ts](src/app/api/docs/documents/[id]/send-review/route.ts#L49) | `hasRoleOrHigher` | `admin` |
| [src/app/api/docs/documents/[id]/suggested-signers/route.ts](src/app/api/docs/documents/[id]/suggested-signers/route.ts#L33) | `hasRoleOrHigher` | `admin` |
| [src/app/api/docs/documents/[id]/signature-request/route.ts](src/app/api/docs/documents/[id]/signature-request/route.ts#L20) | `hasRoleOrHigher` | `admin` |
| [src/app/api/docs/documents/[id]/signature-request/resend/[recipientId]/route.ts](src/app/api/docs/documents/[id]/signature-request/resend/[recipientId]/route.ts#L17) | `hasRoleOrHigher` | `admin` |
| [src/app/api/docs/documents/[id]/signature-request/cancel/route.ts](src/app/api/docs/documents/[id]/signature-request/cancel/route.ts#L17) | `hasRoleOrHigher` | `admin` |
| [src/components/usuarios/RolesHelpCard.tsx](src/components/usuarios/RolesHelpCard.tsx) | `hasPermission` (x9) | varios (tabla help) |
| [src/components/opai/AiHelpChatConfigClient.tsx](src/components/opai/AiHelpChatConfigClient.tsx) | — | — |

**Doble fuente de verdad**: `PERMISSIONS.MANAGE_SETTINGS` (legacy) y `canView(perms,"config",...)` (nuevo) se usan en paralelo para cosas que deberían ser la misma cosa. En el sistema legacy, `MANAGE_SETTINGS` lo tienen owner y admin (ver `role-policy.ts:152,166`), así que las páginas legacy bloquean a editor igual que las nuevas, pero **por una ruta de código distinta**.

---

## 11. Cache de permisos

Definición: [src/lib/permissions-server.ts:25-50](src/lib/permissions-server.ts#L25-L50).

- Estructura: `Map<templateId, { permissions, expiresAt }>` en memoria del proceso.
- TTL: `5 * 60 * 1000 ms` (5 min).
- Invalidación:
  - `invalidateTemplateCache(id)` — borra una entrada.
  - `invalidateAllCache()` — limpia todo.

### Puntos de invalidación

| Archivo:línea | Acción |
|---|---|
| [src/app/api/admin/role-templates/[id]/route.ts:139](src/app/api/admin/role-templates/[id]/route.ts#L139) | `invalidateTemplateCache(id)` tras `PUT /role-templates/[id]` |
| [src/app/api/admin/role-templates/[id]/route.ts:187](src/app/api/admin/role-templates/[id]/route.ts#L187) | `invalidateTemplateCache(id)` tras `DELETE /role-templates/[id]` |
| (ninguno) | `invalidateAllCache()` nunca se llama desde código de aplicación |

### Riesgos

1. **Cache en memoria del proceso**: en Vercel Functions con Fluid Compute puede haber múltiples instancias vivas. Invalidar desde el handler PUT sólo limpia la instancia que atendió el request; otras instancias seguirán sirviendo datos viejos por hasta 5 min. No hay pub/sub ni invalidación cross-instance.
2. **Race condition**: si un admin edita un template y justo después inspecciona un usuario afectado desde otro device, puede ver permisos viejos durante la ventana TTL en otra instancia.
3. **No se invalida cuando cambia `admin.roleTemplateId`**: reasignar a un usuario otro roleTemplate no dispara `invalidateTemplateCache` porque la key del cache es el templateId (permisos del *template*, no del usuario). Esto probablemente está OK porque el cambio de `roleTemplateId` lo lee `resolvePermissions` directamente del row `Admin`, no del cache.

---

## Hallazgos críticos (bloquean producción)

- **ID**: H-001
- **Severidad**: Crítica
- **Archivo(s)**: [src/app/(app)/opai/configuracion/empresa/page.tsx](src/app/(app)/opai/configuracion/empresa/page.tsx), [src/app/(app)/opai/configuracion/mi-plan/page.tsx](src/app/(app)/opai/configuracion/mi-plan/page.tsx)
- **Descripción**: Ambas páginas son `"use client"`/`'use client'` sin ningún guard server-side de permisos. Cualquier usuario autenticado del tenant puede acceder escribiendo la URL, obviando el filtro `adminOnly` del home de configuración. `empresa` expone RUT/datos legales de la empresa; `mi-plan` expone información de facturación y plan (aunque la data sensible la fetchea vía `/api/...` que sí tenga auth).
- **Evidencia**:
  ```tsx
  // empresa/page.tsx:411-427 — NO hay auth() ni resolvePerms
  "use client";
  export default function EmpresaConfigPage() {
    return <ConfigPageLayout ... ><EmpresaConfigTabs /></ConfigPageLayout>;
  }
  ```
  Lo mismo aplica en `mi-plan/page.tsx`. El layout padre [(app)/layout.tsx](src/app/(app)/layout.tsx#L39-L42) garantiza `session.user`, pero **no chequea role ni permisos**.

---

- **ID**: H-002
- **Severidad**: Alta
- **Archivo(s)**: [src/app/(app)/opai/configuracion/inteligencia-artificial/page.tsx](src/app/(app)/opai/configuracion/inteligencia-artificial/page.tsx#L646-L670)
- **Descripción**: Página server-component que valida sesión pero NO valida permisos. En su estado actual sólo muestra un texto estático ("Gestión centralizada, contacta al admin"), por lo que no hay fuga real de datos — pero la ausencia de guard es una regresión silenciosa: si mañana se agrega contenido sensible (claves AI, prompts de sistema), queda expuesto.
- **Evidencia**:
  ```tsx
  // inteligencia-artificial/page.tsx:647-651
  const session = await auth();
  if (!session?.user) { redirect(...); }
  // ← sin role/perms check
  return <ConfigPageLayout ...>...</ConfigPageLayout>;
  ```

---

- **ID**: H-003
- **Severidad**: Alta
- **Archivo(s)**: repo root (falta `middleware.ts`)
- **Descripción**: No existe `middleware.ts` en la rama `main`. Toda la autorización depende de que cada `page.tsx` y cada `route.ts` implemente sus propios checks. Dado el volumen (155 páginas, 885 rutas API), la probabilidad de omisión es alta — H-001 y H-002 son evidencia de que ya ocurrió. Además, `pathToPermission`/`apiPathToModule` son código muerto: existe la infra para centralizar, pero no se usa.
- **Evidencia**:
  ```
  find . -maxdepth 4 -name "middleware.ts" ... → 0 archivos en main
  grep -rn "pathToPermission\|apiPathToModule" src/ → 0 usos
  ```
  En varias ramas de feature (`.worktrees/*`) sí existe middleware — parece que se han intentado agregar y no llegaron a main.

---

## Hallazgos de UX (bug reportado — editor no accede a configs)

- **ID**: H-010
- **Severidad**: Alta (UX)
- **Archivo(s)**: [src/lib/permissions.ts:425-444](src/lib/permissions.ts#L425-L444) (defaults `editor`), [src/app/(app)/opai/configuracion/page.tsx:77-87](src/app/(app)/opai/configuracion/page.tsx#L77-L87)
- **Descripción**: El rol `editor` tiene `modules.config = "none"` en `DEFAULT_ROLE_PERMISSIONS` y cero overrides de submódulo. La home de Configuración hace `hasModuleAccess(perms, "config") → false → redirect("/hub")`. Consecuencia: editor (y los otros 13 roles no-admin) no ven NINGÚN ítem de Configuración. No es un bug en el guard — es un diseño que no coincide con la expectativa de negocio expresada en la UI (items sin `adminOnly` sugieren accesibilidad amplia).
- **Evidencia**: ver §7.3 y §7.4 arriba. Extracto:
  ```ts
  editor: {
    modules: { ..., config: "none" },  // ← bloquea toda Configuración
    submodules: {},                     // ← sin excepciones
    capabilities: { ... },
  },
  ```
- **Fix típico** (fuera de alcance — audit read-only): definir una política explícita de qué submódulos de `config` debe ver cada rol. Probablemente `editor` debería tener `config: "view"` (o `edit` en submódulos específicos como `firmas`, `categorias`, `crm`, `cpq`). Esto debe discutirse con producto antes de tocar código.

---

- **ID**: H-011
- **Severidad**: Media (UX)
- **Archivo(s)**: [src/app/(app)/opai/configuracion/page.tsx:64](src/app/(app)/opai/configuracion/page.tsx#L64), [src/lib/permissions.ts:88-103](src/lib/permissions.ts#L88-L103)
- **Descripción**: El ítem "Gamificación" del home usa `submodule: "gamificacion"` que no existe en `SUBMODULE_KEYS.config`. El filtro UI `canView(perms, "config", "gamificacion")` hace cascada al módulo padre `config` y devuelve `none` para todos menos owner/admin (que igual pasan el `adminOnly`). Funciona "de chiripa" — si mañana alguien pone `config: "view"` para editor (p.ej. fix de H-010), Gamificación aparecería automáticamente porque la cascada daría "view", lo que puede no ser lo esperado.
- **Evidencia**:
  ```ts
  // configuracion/page.tsx:64
  { submodule: "gamificacion", href: "/opai/configuracion/gamificacion", ..., adminOnly: true },
  // permissions.ts:88-103 — SUBMODULE_KEYS.config
  config: ["usuarios","grupos","integraciones","firmas","categorias","crm","cpq","payroll",
           "notificaciones","ops","tipos_ticket","finanzas","alertas_cobertura","ats"]
  //   ↑ NO incluye "gamificacion"
  ```

---

- **ID**: H-012
- **Severidad**: Baja
- **Archivo(s)**: [src/app/(app)/opai/configuracion/page.tsx:33](src/app/(app)/opai/configuracion/page.tsx#L33)
- **Descripción**: El ítem "Asistente IA" tiene `submodule: "notificaciones"`. No existe una key propia para asistente IA; se reusa la de notificaciones. Esto acopla dos permisos lógicamente distintos: dar acceso a Notificaciones implica dar acceso a Asistente IA. Hoy queda neutralizado por `adminOnly: true`, pero si se remueve el flag, la acoplación emerge.

---

- **ID**: H-013
- **Severidad**: Baja
- **Archivo(s)**: [src/app/(app)/opai/configuracion/page.tsx](src/app/(app)/opai/configuracion/page.tsx) (columna `submodule`)
- **Descripción**: Varios ítems del grupo "General" (Empresa, Usuarios, Roles, Auditoría, Documentos Operacionales, Mi Plan, Cumplimiento) declaran `submodule: "usuarios"`. El filtro `canView(perms, "config", "usuarios")` agrupa 7 ítems distintos bajo una misma key, imposibilitando afinar el permiso granularmente (ej. "editor ve Usuarios pero no Auditoría"). Hoy lo neutraliza `adminOnly` en la mayoría, pero es deuda de diseño del modelo.

---

## Hallazgos de deuda técnica

- **ID**: H-020
- **Severidad**: Media
- **Archivo(s)**: las 5 páginas listadas en §5 con guard legacy + los componentes y APIs en §10.
- **Descripción**: Coexisten dos sistemas de permisos sobre los mismos roles. `rbac.ts` (legacy, flat permissions) se solapa con `permissions.ts` (nuevo, granular). Las 5 páginas de config que usan `hasPermission(role, PERMISSIONS.MANAGE_SETTINGS)` son incompatibles con un sistema donde el admin puede editar un `RoleTemplate` para dar a "editor" acceso a esas pantallas — el check legacy no mira roleTemplateId y seguirá rechazando al editor.
- **Evidencia**: 5 archivos en §5 + 17 archivos totales en §10.

---

- **ID**: H-021
- **Severidad**: Media
- **Archivo(s)**: [src/lib/permissions.ts:781-933](src/lib/permissions.ts#L781-L933)
- **Descripción**: `pathToPermission`, `apiPathToModule`, `apiPathToSubmodule` están definidas pero **nunca se invocan**. Código muerto. Si se planea centralizar la autorización en un middleware, estas funciones son el catálogo — pero hoy son sólo un tercero de verdad que se desvincula de los guards reales en cada page.
- **Evidencia**: `grep -rn "pathToPermission\|apiPathToModule\|apiPathToSubmodule" src/ → solo definiciones`.

---

- **ID**: H-022
- **Severidad**: Media
- **Archivo(s)**: [src/lib/permissions.ts:53-124](src/lib/permissions.ts#L53-L124) vs [src/lib/permissions.ts:223-289](src/lib/permissions.ts#L223-L289)
- **Descripción**: `SUBMODULE_META` incluye `{ key: "config.inteligencia_artificial", ... }` pero `SUBMODULE_KEYS.config` no lista `"inteligencia_artificial"`. `validatePermissions` ([permissions.ts:940-1018](src/lib/permissions.ts#L940-L1018)) rechazará cualquier `RoleTemplate` con `config.inteligencia_artificial` como submódulo desconocido. Es una inconsistencia interna del catálogo.
- **Evidencia**:
  ```ts
  // permissions.ts:279
  { key: "config.inteligencia_artificial", module: "config", submodule: "inteligencia_artificial", ... }
  // permissions.ts:88-103 — SUBMODULE_KEYS.config NO incluye "inteligencia_artificial"
  ```

---

- **ID**: H-023
- **Severidad**: Baja
- **Archivo(s)**: [src/lib/permissions-server.ts:25-50](src/lib/permissions-server.ts#L25-L50)
- **Descripción**: Cache en memoria `Map<templateId, ...>` no sobrevive a reinicios ni se comparte entre instancias en Fluid Compute / Serverless. En un entorno multi-región o con warm instances, la invalidación explícita sólo impacta a la instancia que atendió el PUT. Para la mayoría de casos (latencia < 5min) no es crítico, pero un usuario que cambie de template puede ver permisos inconsistentes en otra región durante la ventana TTL.
- **Evidencia**: `permissions-server.ts:26` — `const cache = new Map<string, CacheEntry>();` (proceso-local).

---

- **ID**: H-024
- **Severidad**: Baja
- **Archivo(s)**: [src/app/(app)/opai/configuracion/usuarios/page.tsx:913](src/app/(app)/opai/configuracion/usuarios/page.tsx#L913)
- **Descripción**: La condición del guard es `if (!canView(perms, "config", "usuarios") || !hasCapability(perms, "manage_users"))` — exige AMBAS. En los defaults, sólo `owner` y `admin` tienen `manage_users: true` (implícito por full caps en owner, y caps loop en admin). Esto significa que incluso si un admin edita el template `editor` dándole `config.usuarios: "view"`, el editor seguirá bloqueado porque le falta la capability. La capability no se expone en la UI de edición de templates de forma obvia — revisar.
- **Evidencia**: `permissions.ts:414-423` (admin setea todas las caps a true, manage_settings=false pero manage_users=true implícito).

---

- **ID**: H-025
- **Severidad**: Baja
- **Archivo(s)**: [src/app/api/admin/role-templates/route.ts](src/app/api/admin/role-templates/route.ts)
- **Descripción**: No se pudo auditar a fondo sin ejecutar el script de BD. El flujo `POST /role-templates` (crear) no invoca `invalidateTemplateCache` — lo cual es correcto (template nuevo, nada en cache), pero se recomienda confirmar que el endpoint valida permisos via `validatePermissions(permissions)` antes de persistir. Acción: re-ejecutar `audit-db-read.ts` con credenciales de BD y revisar manualmente este archivo.

---

## RESUMEN EJECUTIVO

| ID | Sev | Tipo | Breve |
|---|---|---|---|
| H-001 | Crítica | Seguridad | `empresa` y `mi-plan` páginas sin guard de permisos (solo sesión) |
| H-002 | Alta | Seguridad | `inteligencia-artificial` sin guard de permisos |
| H-003 | Alta | Arquitectura | No hay `middleware.ts` en main; autorización depende de cada page/route |
| H-010 | Alta | UX | `editor.modules.config="none"` bloquea a 14/14 roles no-admin de toda Configuración |
| H-011 | Media | UX | `submodule:"gamificacion"` en UI pero no existe en `SUBMODULE_KEYS.config` |
| H-012 | Baja | UX | Asistente IA comparte key `notificaciones` con Notificaciones |
| H-013 | Baja | Modelo | 7 ítems distintos comparten `submodule:"usuarios"` |
| H-020 | Media | Deuda | 17 archivos usan `rbac.ts` legacy en paralelo al sistema nuevo |
| H-021 | Media | Deuda | `pathToPermission`/`apiPathToModule` definidas pero nunca invocadas |
| H-022 | Media | Deuda | `config.inteligencia_artificial` en META pero no en KEYS |
| H-023 | Baja | Deuda | Cache de permisos en memoria per-instance, sin invalidación cross-region |
| H-024 | Baja | Deuda | Usuarios requiere `canView+manage_users`: capability no expuesta en UI de templates |
| H-025 | Baja | Pendiente | POST `/role-templates` requiere validación con BD real (BLOQUE 2/3 no ejecutados) |

### Totales
- **Hallazgos críticos (bloquean producción)**: 1 (H-001)
- **Hallazgos altos (UX / arquitectura / seguridad grave)**: 3 (H-002, H-003, H-010)
- **Hallazgos medios / bajos**: 9 (H-011 a H-025)

### Bloques no ejecutados por falta de acceso a BD
- **BLOQUE 2** (inventario RoleTemplates en BD)
- **BLOQUE 3** (distribución Admins/Users)
- **BLOQUE 6b** (matriz desde BD real)

Acción sugerida para completarlos: `DATABASE_URL=<staging o prod RO> npx tsx scripts/audit-db-read.ts > audit-reports/db-inventory.md`.

---
