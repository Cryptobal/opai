# AUDIT_TICKETS.md — Fase 0

Auditoría previa al desarrollo de "Tickets por Instalación" en `/ops/tickets`.

---

## 0.1 Schema

### Modelos relevantes (Prisma → `prisma/schema.prisma`)

| Concepto del plan | Modelo real | Tabla/schema | Clave |
|---|---|---|---|
| Ticket | `OpsTicket` | `ops.ops_tickets` | linea 4807 |
| Installation | `CrmInstallation` | `crm.installations` | linea 1887 |
| Client | `CrmAccount` | `crm.accounts` | linea 1796 |
| Guard | `OpsGuardia` | `ops.ops_guardias` | linea 2881 |
| Tenant | `Tenant` | `public.Tenant` | linea 12 (campo `slug` disponible) |

### Relaciones clave

- `OpsTicket.installationId: String? @db.Uuid` — **link directo**, pero **sin relación Prisma formal** a `CrmInstallation`. Join manual vía `id`.
- `OpsTicket.guardiaId: String? @db.Uuid` — relación Prisma a `OpsGuardia` (con `persona`).
- `OpsGuardia.currentInstallationId: String? @db.Uuid` — instalación actual del guardia (por si un ticket de guardia no tiene `installationId` directo, se puede resolver vía el guardia).
- `CrmInstallation.accountId: String? @db.Uuid` → `CrmAccount` (con relación Prisma `installation.account`).

### Campos críticos de `OpsTicket`

| Campo | Tipo | Observación |
|---|---|---|
| `status` | `String` default `"open"` | Valores en UI: `open`, `in_progress`, `waiting`, `pending_approval`, `resolved`, `closed`, `cancelled` |
| `priority` | `String` default `"p3"` | Lowercase: `p1 / p2 / p3 / p4` |
| `slaBreached` | `Boolean` default `false` | **Persistido** — no se calcula en runtime |
| `slaDueAt` | `DateTime?` | Timestamp objetivo del SLA |
| `slaPausedAt`, `slaPausedTotalMs`, `slaPausedReason` | — | SLA puede pausarse |
| `installationId` | `String?` | Nullable — hay tickets sin instalación |
| `guardiaId` | `String?` | Nullable |
| `updatedAt` | `DateTime @updatedAt` | Fuente de `lastActivityAt` para sort |

### Campos críticos de `CrmInstallation`

| Campo | Tipo | Observación |
|---|---|---|
| `name` | `String` | Nombre a mostrar en card |
| `accountId` | `String?` | FK a `CrmAccount` (cliente) |
| `lat`, `lng` | `Float?` | **Ambas nullable** — instalaciones sin coordenadas deben filtrarse del mapa |
| `isActive` | `Boolean` | Filtrar solo activas en la vista por instalación |
| `status` | enum `CrmInstallationStatus` | default `prospect` |
| `address`, `commune`, `city` | `String?` | Para tooltips/hover del mapa |

### Estado real en Neon (tenant `gard`, 2026-04-24)

- **384 tickets hallazgo** (118 activos / 247 closed / 19 resolved).
- **29 instalaciones activas**, **27 con coordenadas** (2 sin lat/lng).

---

## 0.2 Rutas y componentes actuales

### Paths reales (difiere del plan: el repo NO usa prefijo `/api/v1`)

- **Página:** `src/app/(app)/ops/tickets/page.tsx`
- **Componente principal:** `src/components/ops/tickets/TicketsClient.tsx` (~1000 líneas — candidato a split)
- **Sub-componentes actuales:** `TicketsDashboard.tsx`, `TicketsKanban.tsx`, `TicketDetailClient.tsx`
- **API listado:** `src/app/api/ops/tickets/route.ts` (no existe `/api/v1/...`)
- **API dashboard:** `src/app/api/ops/tickets/dashboard/route.ts` (ya hace aggregates con `prisma.opsTicket.count` por status/priority)

### Toggle `Lista | Cards | Kanban`

Definido inline en `TicketsClient.tsx`, líneas **287–310**. Estado `listMode` (local, NO persistido en URL). Para el toggle de 4 opciones y persistencia en URL (`?view=by-installation`) hay que sincronizar con `useSearchParams`.

### Filtros actuales

| Filtro | Estado (local) | Dónde filtra |
|---|---|---|
| `originTab` (`all/internal/guard/client`) | `useState` | Client-side en `filteredTickets` useMemo |
| `filterStatus` | `useState` default `"active"` | Client-side |
| `filterPriorities` (Set) | `useState` | Client-side |
| `filterTypeId` | `useState` default `"all"` | Client-side |
| `searchQuery` | `useState` | Client-side (title/code/description/guardia) |

### Hallazgo crítico sobre la API actual

`TicketsClient.tsx` línea 98: `const res = await fetch("/api/ops/tickets");` — **sin query params y sin paginación en el cliente**. La API default es `limit=50`, así que el usuario solo ve los primeros 50 tickets de 384. Este es un bug pre-existente; para la vista "Por instalación" debemos agregar tanto el filtro `installationId` como quitar el límite en el drill-down (o elevar a `limit=500`).

### Auth / multi-tenant

- Se usa `requireAuth()` + `ensureOpsAccess(ctx)` de `src/lib/ops.ts`. No existe `isTenantModuleEnabled` en el repo — el patrón equivalente es `ensureOpsAccess(ctx)` que ya valida `hasModuleAccess(perms, "ops")`. **Usaremos ese helper** (no lo mencionado en el plan).
- `ctx.tenantId` se resuelve automático vía sesión NextAuth.

---

## 0.3 Decisiones

| Pregunta | Respuesta |
|---|---|
| ¿`Installation` tiene coordenadas geográficas? | **Sí** (`lat: Float?`, `lng: Float?`) — 27/29 activas en `gard` con datos. **Fase 3 se ejecuta**, filtrando instalaciones sin coordenadas del mapa pero mostrándolas en el grid. |
| ¿Filtro por `installationId` ya existe en la API de listado? | **No.** Hay que agregar 1 línea en `src/app/api/ops/tickets/route.ts` (`if (installationId) where.installationId = installationId`). Drill-down reutiliza esa API. |
| ¿SLA vencido es persistido o runtime? | **Persistido** (`slaBreached: Boolean`). Sort por vencidos es trivial — `orderBy` directo. |
| ¿Prefijo `/api/v1/`? | **No existe en el repo.** Ajustamos a `/api/ops/tickets/counts` y `/api/ops/tickets/by-installation`. |
| ¿`isTenantModuleEnabled` disponible? | **No existe con ese nombre.** Usamos `ensureOpsAccess(ctx)` (patrón actual del módulo). |
| ¿Tickets de guardias sin `installationId` directo? | Posible. Fallback: si un ticket no tiene `installationId` pero sí `guardiaId`, resolver vía `OpsGuardia.currentInstallationId`. Lo documentamos como **"Sin instalación asignada"** en una tarjeta al final del grid (no se pierde). |
| Status considerados "activos" | `["open", "in_progress", "waiting", "pending_approval"]` — igual que en `dashboard/route.ts`. |
| Valores de priority | Lowercase: `"p1" | "p2" | "p3" | "p4"`. La UI los muestra uppercase pero el almacenamiento es lowercase. |
| Cache de counts | `revalidate = 30` en route handler (Next.js) — acorde al plan. |

---

## Desviaciones del plan original

1. **Prefijo de APIs:** `/api/ops/tickets/...` en lugar de `/api/v1/ops/tickets/...` (no existe v1 en el repo).
2. **Helper de permisos:** `ensureOpsAccess(ctx)` en vez de `isTenantModuleEnabled(tenantId, "ops")` (función no existe, pero equivalente ya cubre module-gate).
3. **TicketsClient.tsx es grande (~1000 líneas).** No lo refactorizo, pero extraigo la nueva vista "Por instalación" como componente separado conforme al plan.
4. **Bug pre-existente (no fixing):** fetch sin paginación muestra solo 50 tickets. No está en scope arreglar esto fuera del drill-down. Lo documento aquí.
5. **Fase 3 mapa:** Leaflet vía `react-leaflet`. Los 2 fittings sin lat/lng se muestran en el grid pero no en el mapa (con indicador "Sin ubicación").

---

## Stop point — esperando OK antes de Fase 1
