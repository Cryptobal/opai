# Agenda OPAI — Desktop v1 (layout Notion Calendar)

Rama: `claude/agenda-desktop-v1-layout-k3re5k` · 7 commits atómicos (D1–D7) + este reporte (D8).
Complementa al móvil v1 (`docs/audits/agenda-v1-implementation-report.md`), ya en main.
Alcance: solo UI/UX desktop (`≥lg`) + wiring a servicios existentes. Cero migraciones;
la única API nueva es `POST /api/crm/tasks` (aditiva, mismo permiso del checklist).

## Quejas de origen → resolución

| # | Queja | Resolución | Dónde |
|---|---|---|---|
| 1 | "3 días" apretado y no hacía nada | Segmented explícito Día \| 3 días \| Semana \| Mes; cambia la grilla al instante (estado local, sin fetch extra al alternar Día/3 días/Semana dentro del mismo rango); menú `<details>` de N días eliminado, `multiDays` fijo en 3 | `AgendaDesktopToolbar.tsx` |
| 2 | Popovers Equipo/Filtros por detrás | Radix `Popover` con portal (`z-[100]`), cierre con Esc y click-afuera; Equipo ahora multiselect con checkbox + hint "sin Google" | `AgendaTeamPopover.tsx`, `AgendaFilterPopover.tsx` |
| 3 | No se ven días del mes ni Nº de semana | Mini-calendario en rail con columna de semana ISO; toolbar muestra `Mes Año · Semana N` (ISO, omitido en vista Mes) | `AgendaMiniCalendar.tsx`, `AgendaDesktopToolbar.tsx`, `isoWeekChile` en `dates-cl.ts` |
| 4 | Modal "Nuevo" cambiaba de tamaño | Quick-create con cuerpo de altura FIJA (322px, scroll interno); cambiar Evento↔Tarea o el tipo no altera el panel (test automatizado) | `AgendaQuickCreate.tsx` + test |
| 5 | PageHero + bajada sobraban | Desktop sin hero ni descripción; shell mide su offset y ocupa `100dvh` restante; única barra de scroll vertical = la de horas (se quitó `max-h-[70vh]`) | `AgendaDesktop.tsx`, `AgendaCalendarGrid.tsx` |
| 6 | Crear lento y sin distinguir tarea/evento | Quick-create unificado con switch Evento \| Tarea (Tab alterna), tecla `C`, click en celda vacía abre anclado al punto con fecha/hora del slot, Enter guarda | `AgendaQuickCreate.tsx`, `useAgendaShortcuts.ts`, `AgendaCalendarGrid.tsx` |

## Qué se construyó (por bloque)

- **D1** — Shell de alto completo bajo el ModuleSubNav (medición de offset en runtime,
  robusta ante cambios del chrome) + toolbar de 1 línea (52px): ☰, título 18px
  `font-display` + semana ISO en mono, ‹ ›, Hoy, segmented de vistas, búsqueda con
  kbd `/`, Equipo, filtros, `+ Crear` con kbd `C`. Prefs desktop propias
  (`view`, `railCollapsed`, `hiddenSources`).
- **D2** — Migración definitiva de los `<details>` a Popover DS; retiro de
  `AgendaToolbar.tsx`, `VisitList.tsx` y `LicitacionesList.tsx` (huérfanos);
  `FilterGroup` compartido con el sheet móvil. Test de interacción (portal,
  multiselect, Esc).
- **D3** — Rail 232px colapsable persistido: mini-calendario (semana ISO, hoy en
  círculo, rango visible sombreado, click navega) + toggles "Calendarios OPAI"
  (cliente=violet, técnica=ok, tareas=primary, licitaciones=warn, con contador)
  y "Google" (email conectado o CTA de conexión).
- **D4** — Cabecera de días 1 línea `JUE 23`, gutter `GMT-4` dinámico (DST-aware),
  banda all-day sticky ≤74px con chips slim y `+N más` en popover, licitaciones
  warn rayado, línea "ahora" en danger con badge de hora, hover de celda
  `primary/4` + cursor cell, vista Mes de alto completo (3 chips + `+N`, click
  abre el Día). Drag & resize intactos.
- **D5** — Inspector como push-panel de 340px (transición de ancho, solo
  on-select, ✕/Esc) + participantes con badges RSVP `✓ Va / ✗ No va / ? / ◉ OPAI`
  condicionales al espejo v2 (`CalendarEventParticipant`).
- **D6** — Quick-create (ver tabla). Evento vía `POST /api/calendar/events`
  (servicio v2 con participantes/attendees, banner de conflicto de
  `/api/calendar/availability`, reuso de `useEventComposer` del móvil);
  Tarea vía `POST /api/crm/tasks` nuevo. `NuevaVisitaModal` queda como fallback
  de `?nueva=1` y del drawer de licitaciones.
- **D7** — `useAgendaShortcuts`: `C` crear · `/` buscar · `T` hoy · `D/3/W/M`
  vistas · `←/→` navegar · `Esc` cierra; ignorados con foco en inputs/diálogos.
  Tooltip de atajos en el botón Crear.

## Validación ejecutada

- `npx prisma generate && npx tsc --noEmit` — verde antes de cada commit (7/7).
- `npx vitest run` completo — **1858 passed**, 1 fallo pre-existente ajeno:
  `src/lib/sii/__tests__/aec-signer.test.ts` (falta `lxml` de Python en el
  entorno; no relacionado con la agenda).
- Tests nuevos: popovers (portal/multiselect/Esc) y quick-create (altura fija
  al cambiar modo/tipo, prefill del slot, Tab alterna, Enter crea la tarea,
  Esc cierra) — 7 tests verdes.
- `npm run check-ds:warn` — sin advertencias en los archivos tocados.
- `npm run lint` — el comando `next lint` está roto en el repo con Next 16
  ("Invalid project directory … /lint"), pre-existente; cubierto con tsc +
  guards + tests.
- Smoke visual en navegador: pendiente en el preview de Vercel (checklist
  abajo); este entorno no tiene BD ni sesión para levantar el ERP.

## Checklist QA para Carlos (preview de Vercel, ventana ≥1024px)

**Layout (quejas 5 y 1)**
- [ ] `/opai/agenda` abre sin título "Agenda" ni bajada; el calendario llega hasta abajo y la única barra de scroll vertical es la de horas (arranca mirando las 07:00).
- [ ] Día / 3 días / Semana / Mes cambian la grilla al instante; "3 días" muestra exactamente 3 columnas; la vista queda recordada al recargar.
- [ ] En vista Mes: celdas a pantalla completa, hoy con círculo, `+N` cuando hay >3 items, y click en un día te lleva a su vista Día.

**Toolbar y popovers (quejas 2 y 3)**
- [ ] El título muestra `Mes Año · Semana N` (sin semana en vista Mes) y coincide con la columna `#` del mini-calendario.
- [ ] Popover Equipo: legible, por ENCIMA de la grilla, multiselección con checkboxes (filtra por responsables), hint "sin Google" en usuarios sin Calendar (visible solo para admins), cierra con Esc y click-afuera.
- [ ] Popover Filtros ⚲: grupos Contenido y Tipo, badge con el count activo, siempre encima.
- [ ] ☰ colapsa/expande el rail y la preferencia sobrevive al reload.

**Rail (queja 3)**
- [ ] Mini-calendario: hoy en círculo primary, el rango visible sombreado, click en un día mueve la grilla, ‹ › cambian solo el mini.
- [ ] Toggles de calendarios: apagar "Tareas" (o cualquier fuente) filtra la grilla al instante y persiste; contadores por fuente correctos.
- [ ] Sección Google: muestra tu email conectado (o el CTA para conectar) y su toggle oculta los eventos de Google.

**Grilla (D4)**
- [ ] Cabecera `JUE 23` con hoy resaltado; gutter muestra `GMT-4` (o `GMT-3` en horario de verano).
- [ ] Banda all-day: máx ~74px, licitaciones con rayado warn, `+N más` abre popover; arrastrar una visita a la banda y de vuelta sigue funcionando.
- [ ] Línea "ahora" roja con badge de hora en el día de hoy.
- [ ] Regresión: mover una visita entre días/horas y redimensionarla sigue actualizando (toast + Google si aplica).

**Inspector (D5)**
- [ ] Nada seleccionado → no hay panel derecho ni placeholder; al clickear un evento el panel de 340px EMPUJA la grilla con animación; ✕ y Esc lo cierran.
- [ ] En una visita con invitados internos: lista de participantes con badges `✓ Va / ? / ◉ OPAI`.

**Quick-create (quejas 4 y 6)**
- [ ] `+ Crear`, tecla `C` y click en celda vacía abren el panel (el click lo abre junto al punto, con fecha/hora del slot).
- [ ] Cambiar Evento↔Tarea (click o Tab sobre el título) y cambiar el tipo de visita NO mueve ni redimensiona el panel.
- [ ] Evento con participante ocupado → banner warn de conflicto con "Buscar otro horario".
- [ ] Enter guarda; una Tarea creada aparece en la grilla sin recargar la página.
- [ ] Visita técnica sin cuenta/instalación → error claro (no guarda).

**Atajos (D7)**
- [ ] `C`, `/`, `T`, `D/3/W/M`, `←/→`, `Esc` funcionan y NO se disparan escribiendo en un input; el tooltip del botón Crear los documenta.

**Global**
- [ ] Light y dark impecables; móvil (<1024px) idéntico a antes (experiencia glass intacta).

## Riesgos y pendientes

- **Recordatorio de tarea**: `CrmTask` no tiene campo de recordatorio y el brief
  prohíbe migraciones; el quick-create cubre vencimiento con hora (sin hora =
  todo el día). Si se quiere recordatorio configurable, requiere modelo.
- **Vínculo a negocio en tareas**: el quick-create vincula cuenta (typeahead);
  `dealId` está soportado por la API pero sin picker en la UI (los flujos desde
  un negocio ya llegan con contexto por URL).
- **Nº de semana a 9px**: el mockup pedía mono 9px; el DS prohíbe <12px
  (`check-ds`), se usó `text-[12px]`.
- **Hint "sin Google" del Equipo**: depende de `/api/integrations/google-calendar/status`,
  que solo devuelve el detalle del equipo a admins; para otros roles el popover
  se muestra sin hints.
- `agenda-v1` (modelo v2) ya estaba en main: el quick-create de eventos usa el
  camino v2 con participantes; si `CALENDAR_V2=0` en prod, la creación degrada
  al sync legacy como el composer móvil (mismo endpoint).
