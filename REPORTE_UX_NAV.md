# Reporte — Sprint Coherencia UX/Nav (P0 + P1 + P2 mecánico)

Base de auditoría: commit `9987999`. Rama de trabajo: `main` local (sin push
hasta el gate global del BLOQUE 10). Gate por bloque:
`npx prisma generate && npx tsc --noEmit` + `npx vitest run src/lib/nav` — todos
en verde antes de cada commit atómico.

> Nota de entorno: el contenedor llegó sin `node_modules`. Se corrió
> `npm install` (postinstall = `prisma generate`, **no** `prisma migrate deploy`)
> para poder ejecutar el gate `tsc`. **Nunca** se corrió `npm run build` ni
> `npm ci` (esos sí disparan `migrate deploy`). Cero cambios de schema Prisma,
> cero cambios de queries/lógica de negocio.

## Bloques completados (9/9 de implementación) + docs

| # | Commit | Descripción |
|---|--------|-------------|
| 1 | `c921816` | `activePaths` en registry + `pathMatchesNode` como matcher canónico |
| 2 | `403955d` | Banca con N3 (flujo-caja/conciliación/cuentas) + `activePaths` |
| 3 | `dc59404` | `isAdmin` real en ConfigShell y bottom nav (respeta simulación de rol) |
| 4 | `783779c` | Elimina link muerto email-templates, registra correos-automáticos, `description` en registry |
| 5 | `4e65737` | Home y búsqueda de Config consumen el registry (una sola taxonomía) + limpieza ConfigSubnav/ConfigBackLink |
| 6 | `074f1b3` | Back-link de Config solo en mobile (`lg:hidden`) |
| 7 | `1de7768` | Breadcrumb con nombre de entidad en páginas de detalle |
| 8 | `35b74c5` | `getActiveModule` deriva del registry (elimina prefijos duplicados) |
| 9 | `2c2e629` | EmptyState DS en portal supervisor + KpiCard 100% tokens |
| 10 | *(este commit)* | AGENTS.md (activePaths, Banca N3, config) + este reporte |

---

## BLOQUE 1 — Motor `activePaths` en el registry

**Archivos:** `src/lib/nav/registry.ts`, `src/components/opai-ds/AutoBreadcrumbs.tsx`,
`src/components/opai-ds/SwipeTabs.tsx`, `src/components/opai-ds/ModuleSubNav.tsx`,
`src/lib/module-nav.ts`, `src/components/opai/BottomNav.tsx`,
`src/components/opai/AppSidebar.tsx`, `src/components/opai/role-nav-builder.ts`,
`src/components/opai-ds/ConfigShell.tsx`, `src/lib/nav/__tests__/pathMatchesNode.test.ts`.

- `NavNode` gana `activePaths?: string[]`.
- Nuevo helper exportado `pathMatchesNode(pathname, node)` — matcher canónico
  (prefijo `+ "/"`, o `===` si `exactMatch`, más `activePaths`).
- `findActiveModule` y `findN3Parent` refactorizados para usarlo.
- Todos los consumidores (breadcrumbs, SwipeTabs/ModuleSubNav, BottomNav,
  AppSidebar/role-nav-builder, ConfigShell) propagan `activePaths` y usan el
  matcher único. `AppSidebar.isItemActive` ahora recibe el item (no el href).
- `pathMatchesNode.test.ts`: href exacto/prefijo, `exactMatch`, `activePaths`
  con y sin sub-rutas, y regresión explícita `"/finanzas/flujo"` **NO** matchea
  `"/finanzas/flujo-caja"` (el `+ "/"` lo evita). 11 tests verdes.

**Decisión:** la función interna `visit` de `findActiveModule` era código muerto
(nunca se invocaba; el loop sólo matcheaba top-level). El refactor preserva ese
comportamiento (retorna el módulo top-level) y suma `activePaths` gratis.

## BLOQUE 2 — Banca completa en el registry (bug #1)

**Archivos:** `src/lib/nav/registry.ts`, `src/app/(app)/finanzas/flujo-caja/layout.tsx`,
`src/app/(app)/finanzas/conciliacion/page.tsx`, `src/app/(app)/finanzas/bancos/page.tsx`,
`src/lib/nav/__tests__/registry.test.ts`.

- `finance-banca` pasa de hoja a N2 con N3: `banca-flujo-caja` (cap.
  `cashflow_view`), `banca-conciliacion` (`canView finance/contabilidad`),
  `banca-cuentas` (`banking_view`, `exactMatch`). `activePaths` para las
  hermanas planas flujo-caja/conciliación. Guards copiados de las pages reales.
- `rend-historial-pagos` gana `activePaths: ["/finanzas/pagos"]` (detalle vivo
  `/finanzas/pagos/[id]`).
- `getContextualBottomNavNodes`: caso especial Banca (patrón Inventario) antes
  del branch default.
- N3 strip: `<ModuleSubNav moduleKey="finance-banca" />` en flujo-caja/layout,
  conciliacion/page (tras PageHero) y bancos/page (tras PageHero).
- Tests: N3 de Banca, `findActiveModule("/finanzas/flujo-caja") === finance`,
  `pathMatchesNode("/finanzas/flujo-caja/cierre", banca) === true`, trail
  `/finanzas/conciliacion` = [Finanzas, Banca, Conciliación], bottom nav
  contextual, y `/finanzas/pagos/[id]` vía activePaths.

## BLOQUE 3 — `isAdmin` real (bug #2)

**Archivos:** `src/components/opai-ds/ConfigShell.tsx`, `src/lib/module-nav.ts`,
`src/components/opai/BottomNav.tsx`.

- `useConfigCategories` deriva `isAdmin` de `useRoleSimulation().effectiveRole`
  (`owner`/`admin`). Usar el rol **efectivo** oculta ítems admin al simular un
  rol no-admin.
- `getBottomNavItems` gana 4º parámetro `isAdmin = false`. `BottomNav` lo
  calcula del rol efectivo y lo pasa. Ambos componentes viven dentro de
  `RoleSimulationProvider` (verificado en `AppLayoutClient`).

## BLOQUE 4 — Registry de Configuración

**Archivos:** `src/lib/nav/registry.ts`.

- Eliminado nodo `config-email-templates` (la page es `redirect` → item del
  sidebar te devolvía al home). **La page redirect se dejó intacta.**
- Registrado `config-correos-automaticos` (adminOnly) tras `config-notificaciones`.
- `NavNode` gana `description?: string`; poblado en **todos** los hijos de
  `config` copiando los textos de `CONFIG_SECTIONS` (match por href). Todos
  tuvieron match — no hubo que inventar descripciones.

## BLOQUE 5 — Configuración con UNA fuente de verdad

**Archivos:** `src/components/opai-ds/ConfigShell.tsx`, `src/components/opai-ds/index.ts`,
`src/components/configuracion/ConfigHomeClient.tsx`, `src/components/configuracion/ConfigSearch.tsx`,
`src/lib/configuracion/search-index.ts`, `src/app/(app)/opai/configuracion/page.tsx`,
borrados `src/components/opai/ConfigSubnav.tsx` y `src/components/opai/ConfigBackLink.tsx`.

- `useConfigCategories` exportado (barrel `opai-ds`) + tipo `CategoryGroup`.
- `ConfigHomeClient` consume el hook; sin props `sections`/`isAdmin` ni
  `ICON_MAP` (los iconos vienen como componentes Lucide en cada nodo). `isAdmin`
  para el bloque "Portal del Guardia" se toma de `useRoleSimulation`. UI idéntica.
- `page.tsx` queda en auth + `hasModuleAccess("config")` + `<ConfigHomeClient />`;
  eliminados `CONFIG_SECTIONS`/`ConfigItem`/`ConfigSection`/filtrado.
- `ConfigSubnav`/`ConfigBackLink` (código muerto, sin consumidores) borrados +
  export en `opai/index.ts` removido.

**Decisión (divergencia con el prompt anotada):** `ConfigSearch` **no** recibía
un "shape viejo" por props; usaba su propio índice `search-index.ts` con
búsqueda profunda a nivel tab (ej. "Tolerancia de atraso", ~30 entradas que el
registry no tiene). Se adaptó a recibir `groups` del hook para las **secciones**
(una taxonomía) **conservando** las entradas tab-level desde el índice
(`searchConfigSettings`). Reducirlo a registry-only habría sido una regresión de
funcionalidad (viola regla #5). Efecto: home + sidebar + secciones de la
búsqueda comparten registry; la búsqueda profunda se mantiene.

## BLOQUE 6 — Back-link solo mobile

**Archivos:** `src/components/configuracion/ConfigPageLayout.tsx`.

- Al `<Link>` del back-link "‹ Configuración" se le agrega `lg:hidden`
  (`inline-flex lg:hidden ...`). En desktop ya hay breadcrumb + sub-sidebar.

## BLOQUE 7 — Breadcrumb trailing en páginas de detalle

**Archivos (client components donde delega cada page):**
`CpqQuoteDetail.tsx`, `OnboardingHub.tsx`, `FactoringOperationDetail.tsx`,
`DocDetailClient.tsx`, `DocTemplateEditorClient.tsx`, `TicketDetailClient.tsx`,
`AlertaDetalleClient.tsx`, `PayrollPeriodDetailClient.tsx`,
`TemplateEditorClient.tsx`, `DetalleClient.tsx` (Conocimiento).

- Se añadió `useSetBreadcrumbTrailing(<identificador humano>)` (1 línea + import)
  en el client component donde la entidad ya está disponible. Identificadores:
  código/folio de cotización, nombre de cuenta/instalación, código de factoring,
  título de documento/plantilla, título/código de ticket, nombre de
  instalación/comuna de alerta, `Mes Año` del período payroll, nombre de
  plantilla, nombre de instalación de conocimiento. IDs crudos → `#${id.slice(0,8)}`
  de fallback.

**Divergencias anotadas (13 → 10 aplicadas):**
- `cpq/[id]/page.tsx` y `cpq/quotes/[id]/page.tsx` son **stubs `redirect()`**
  (redirigen a `/crm/cotizaciones/[id]`, que sí recibió el trailing). No tienen
  JSX ni entidad → **omitidos** (el trailing lo pone el destino).
- `portales/[portalId]/page.tsx` **no existe** (sólo hay `[portalId]/ranking/`).
  Omitido por condición de stop (c). No se editó la page de ranking (otra ruta,
  no solicitada).

**Fuera de alcance (anotado, no hecho):** `/opai/vra/[id]` y
`/ops/control-nocturno/[id]` — sus rutas padre no están en el registry, el
trailing solo no renderiza; requiere decisión de IA de navegación aparte.

## BLOQUE 8 — `getActiveModule` del BottomNav → registry

**Archivos:** `src/components/opai/BottomNav.tsx`, `src/lib/nav/registry.ts`,
`src/lib/nav/__tests__/registry.test.ts`.

- `getActiveModule` reemplazado: `findActiveModule(pathname)` (matchea
  `NAV_MODULES` top-level con `pathMatchesNode`, longest-href-wins → `activePaths`
  gratis) + mapa `REGISTRY_TO_CONTEXT` (finance→finanzas, etc.). `hub`,
  `portales`, `compliance`, `chat` siguen devolviendo `null` (no están en el mapa).
- Se agregó `activePaths: ["/opai/documentos-operativos"]` al **módulo docs**:
  esa ruta es hermana plana de `/opai/documentos` (no sub-ruta con `/`), así que
  el prefijo NO la cubría. Test: `findActiveModule("/opai/documentos-operativos") === docs`.

## BLOQUE 9 — Higiene DS

**Archivos:** `SupervisorTickets.tsx`, `SupervisorRefuerzos.tsx`,
`SupervisorPautaGrid.tsx`, `SupervisorRendiciones.tsx`, `src/components/opai/KpiCard.tsx`.

- **EmptyState:** import cambiado de `@/components/opai/EmptyState` (legacy) a
  `@/components/opai-ds`. Las 4 llamadas ya pasaban `icon` (requerido en DS) y
  sólo usaban `compact`/`description`/`action` (todos válidos en la versión DS);
  ninguna usaba `inline`. Sin cambios de props.
- **KpiCard:** 4 mapas de variantes migrados a tokens DS v3: blue→`status-info`,
  emerald→`status-ok`, amber→`status-warn`, red→`status-danger`;
  purple/indigo→`tint-violet` y sky→`tint-sky` (guía "otra no listada → tint-*").
  `default`/`teal`/`neutral` ya eran token-based. 0 clases de paleta cruda
  restantes (verificado por grep).

**Nota (per prompt):** el archivo legacy `src/components/opai/EmptyState.tsx`
**NO** se borró: aún tiene 7 importadores externos (SupervisorTurnosExtra,
SupervisorChat, SupervisorInstalaciones, SupervisorVisitas,
SupervisorVisitasTecnicas, SupervisorInstalacionDetail, SupervisorMiEquipo).
Su limpieza es otro sprint (4E).

**Sobre `tint-*`:** los tokens `tint-{violet,sky,...}` sólo definen base + `-fg`
(no existe `tint-violet-soft` como sugería el prompt). Se usó el patrón ya
establecido en el codebase: `bg-tint-violet/10`, `border-tint-violet/25`,
`text-tint-violet-fg` (opacidad sobre la base, igual que `bg-tint-violet/30`
existente).

## BLOQUE 10 — Docs + gate global

**Archivos:** `AGENTS.md`, `REPORTE_UX_NAV.md`.

- AGENTS.md: corregido que el root de Config **sí** renderiza el sub-sidebar
  siempre; documentado `pathMatchesNode` + `activePaths` (con Banca y docs como
  ejemplos); árbol de Finanzas con Banca N3; nota de email-templates eliminado
  (plantillas en Gestión Documental → Templates) + una-sola-fuente para Config.

---

## Pendientes / fuera de alcance (para prompts siguientes)

- **Migración a `EntityDetailLayout`** de tickets/periodos/rendiciones (requiere
  mockup y aprobación de Carlos).
- **"Ola 4" de tokens** en `portal/supervisor/*` y `access-control/*`
  (~1.600 instancias de paleta cruda; DS-guard ya lo marca como warning en
  varios de los archivos tocados — sprint propio).
- **Registrar en el registry:** `/cpq`, `/fiscalizacion`, `/ops/control-nocturno`,
  `/opai/vra` (decisión de IA de navegación pendiente). De aquí salen también
  los detalles `/opai/vra/[id]` y `/ops/control-nocturno/[id]` del BLOQUE 7.
- **BottomNav usa permisos reales, no simulados** (inconsistencia conocida — el
  BLOQUE 3 sólo alineó `isAdmin`; `usePermissions` sigue devolviendo reales).
- **Detalle CPQ oculta BottomNav completo en mobile** — evaluar back-bar mínima.
- **Borrar `src/components/opai/EmptyState.tsx`** cuando migren los 7
  importadores restantes.
- **Command palette** aún tiene un comando `config-email-templates` apuntando a
  la page redirect (`src/components/opai/command-palette/commands.ts`) —
  independiente del registry, fuera del alcance de este sprint; inofensivo
  (cae en el redirect al home). Anotado para limpieza futura.
