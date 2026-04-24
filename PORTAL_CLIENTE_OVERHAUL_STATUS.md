# Portal Cliente · Fase 1 · Estado de implementación

Branch: `claude/customer-portal-overhaul-NdNv9`

## ✅ Completado

### Bloque A — Equipo de guardias accesible
- Nav: `Personal` → `Equipo`, movido al inicio del grupo Operaciones.
- Schema: `portalVisible` agregado a `ExamAssignment`, `PsychResult` y
  `OpsSupervisionGuardEvaluation` (default true).
- Migración: `20260620000000_add_portal_visible_to_guard_entities`.
- Helper compartido: `src/lib/portal-cliente-guardias.ts` con
  `loadGuardiasForInstallations` + `buildResumenGlobal`.
- API: `GET /api/portal/cliente/equipo` (directorio global agrupado por
  instalación, con demo mode).
- UI directorio: `src/components/portal/cliente/equipo/*` (5 archivos, cada
  uno ≤145 líneas). `PortalPersonal.tsx` es ahora un thin wrapper.
- API detalle: `GET /api/portal/cliente/guardias/[id]` con barrera estricta
  de privacidad (psych: SOLO band + scoredAt; nunca score ni dimensiones).
- UI detalle: `/portal/cliente/guardia/[id]` con 6 tabs
  (Info · Documentos · Exámenes · Psicológico · Supervisión · Desempeño).
- Backoffice PATCH endpoints para toggle portalVisible:
  - `/api/ops/guardias/:id/exam-assignments/:assignmentId/portal-visibility`
  - `/api/ops/guardias/:id/supervision-evals/:evalId/portal-visibility`
  - `/api/psych/assessments/:id/portal-visibility`
- `TODO_PORTAL_VISIBILITY_UI.md` documenta los toggles UI pendientes en
  backoffice (endpoints ya funcionales vía curl / Prisma Studio).

### Bloque B — Reportería on-demand (foundation)
- Schema extendido: `PortalClienteReporte` con `type`, `status`, `params`,
  `xlsxUrl`, `errorMessage`, `requestedById`, `requestedAt` (installationId
  ahora nullable). Migración:
  `20260620100000_extend_portal_cliente_reporte`.
- Catálogo: `src/lib/portal/reportes/catalog.ts` con los 10 tipos definidos.
- Helper XLSX: `src/lib/portal/reportes/xlsx.ts` con headers en teal, freeze
  panes y filas zebra.
- Registry de generadores: `src/lib/portal/reportes/generators/index.ts`.
- Generador implementado completo: `cumplimiento_documental` (XLSX con hoja
  de resumen + detalle por guardia).
- 9 tipos restantes: stub que devuelve XLSX "próximamente" — cada uno sólo
  necesita agregar su archivo y mapearlo en el registry.
- Endpoints:
  - `POST /api/portal/cliente/reportes/generar` (202, genera en background
    con `after()`, status queued → generating → ready/error).
  - `GET /api/portal/cliente/reportes/[id]` (polling).
  - `GET /api/portal/cliente/reportes/[id]/download-xlsx`.

**Pendiente Bloque B:** los 9 generadores restantes (rondas, asistencia,
marcaciones, incidentes, tickets, turnos_extra, desempeno, ejecutivo,
cumplimiento_mensual completo) y la UI del tab "Generar" en `PortalReportes`.

### Bloque C — Dashboard widgets + exports
- `EquipoGlobalCard` en dashboard: KPIs globales del equipo con CTA a
  `personal`. Scoped al tenant/account. Dark-theme consistente.
- `DocComplianceAlertCard`: sólo se muestra si hay OS-10 vencido/por vencer
  o documentos vencidos/pendientes. Tono amber/red según criticidad.
- Helpers de export client-side: `src/lib/portal/export.ts`
  (`exportToCsv`, `exportToXlsx`, `toFilenameSlug`).
- `<ExportButton>` reusable con menú CSV/Excel.
- Integrado en **4 tablas**: Marcaciones, Rondas, Tickets, Posta.
  Cada export respeta filtros activos (no re-fetcha).

### Bloque E — Bitácora ejecutiva consolidada
- API unificado: `GET /api/portal/cliente/bitacora`. Paraleliza queries a
  rondas, marcaciones, tickets, supervisión e incidentes; ordena
  descendente por fecha; filtra por tipo si se pasa.
- Nav: nueva sección `bitacora` (label "Bitácora ejecutiva", icon BookOpen,
  reutiliza flag `posta`).
- UI: `PortalBitacora` + `bitacora/BitacoraFiltros`, `BitacoraTimeline`,
  `BitacoraEvento`. Timeline agrupado por día (Hoy / Ayer / fecha).
- Export integrado.

### Bloque H — Search global (Cmd+K)
- API: `GET /api/portal/cliente/search?q=...` busca en secciones estáticas,
  instalaciones, guardias activos, tickets (últimos 90 días), reportes
  (últimos 12 meses). Todo scoped a tenant + account.
- Componente: `PortalCommandPalette` con `cmdk`, debounce 200ms, grupos.
- Atajos: Cmd/Ctrl+K global. Botón "Buscar ⌘K" desktop, icono lupa mobile.
- Navegación: secciones via `setActiveSection`, guardias via router push,
  instalaciones via `setInstallationId` + navegar a detalle.

## ⏭️ Diferido (no ejecutado en esta sesión)

### Bloque B — UI de reportes
`PortalReportes.tsx` requiere refactor a shell con tabs
"Archivo"/"Generar" + cards del catálogo + sheet de parámetros + polling
row. Los endpoints ya están listos.

### Bloque D — índices + feature flag
Los índices que el prompt pide (en `OpsRondaEjecucion`,
`OpsAsistenciaDiaria`, `OpsMarcacion`, `OpsTicket`) deben verificarse
contra el schema actual. El prompt indica "si falta agregarlo" — no
fueron verificados en esta sesión.

### Bloque F — Módulo Supervisión visible
Nav ya incluye el entry `supervision`. Faltan:
- `GET /api/portal/cliente/supervision` (list).
- `GET /api/portal/cliente/supervision/[id]` (detail).
- UI: `PortalSupervision` + 5 sub-componentes.
- Registrar case en `PortalClienteClient`.

### Bloque G — Encuestas post-servicio
Falta:
- Modelo `PortalClienteEncuesta` (schema crm).
- Cron `/api/cron/portal-encuestas-mensuales`.
- 3 APIs de encuestas-pendientes.
- Refactor de `PortalEncuestas` en 5 sub-componentes + banner en
  dashboard.

## 🧪 Validación

Typecheck baseline del repo (pre-cambios) = 42 errores pre-existentes
(tiptap, `src/lib/auth.ts`). **Los cambios de esta PR introducen 0
nuevos errores de typecheck.**

Migraciones generadas (pendientes de aplicar al DB de producción):
- `20260620000000_add_portal_visible_to_guard_entities`
- `20260620100000_extend_portal_cliente_reporte`

## 📝 Commits (por bloque)

```
Block A:
  c18446b feat(portal-cliente): expose equipo section in nav
  52c4fa7 feat(db): add portalVisible to exam, psych, supervision entities
  5ea1160 feat(portal-cliente): add /api/portal/cliente/equipo endpoint
  e0ac8c0 feat(portal-cliente): refactor PortalPersonal into equipo directory...
  bcdb507 feat(portal-cliente): add guardia detail endpoint with privacy...
  ff08e97 feat(portal-cliente): add guardia detail UI with 6 tabs
  73da8d0 feat(api): add portalVisible PATCH endpoints + TODO for backoffice UI

Block C:
  2c55c4e feat(portal-cliente): add global equipo card + doc compliance alert...
  d371ead feat(portal-cliente): add client-side CSV/XLSX export helpers...
  0dfead6 feat(portal-cliente): add export buttons to marcaciones, rondas...

Block B (foundation):
  d2cdddc feat(portal-cliente): add on-demand reporte generator foundation...

Block E:
  2b8262e feat(portal-cliente): add unified bitacora ejecutiva timeline...

Block H:
  8d5cd42 feat(portal-cliente): add global command palette (Cmd+K)...
```
