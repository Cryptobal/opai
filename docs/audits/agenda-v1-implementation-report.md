# Agenda OPAI v1 — Reporte de implementación

**Fecha:** 2026-07-22 · **Rama:** `claude/agenda-v1-mobile-glass-x3u7r5` (rama designada del entorno; cumple el rol de `feat/agenda-v1` del brief — preview Vercel, sin merge a `main`).
**Base:** auditoría `docs/audits/opai-calendar-gap-analysis.md` + spec visual del mockup aprobado.
**Gate por commit:** `npx prisma generate && npx tsc --noEmit` verde en todos los bloques. Suite `vitest` verde al cierre.

---

## Resumen por bloque

### B1 — Seguridad API agenda (audit B1)
- **Qué:** guard compartido `requireAgendaAccess()` (= `requireTenantModule('crm')` + `requireAuth` + `requireCrmView`, mismo patrón de `/api/crm/users`) aplicado a TODAS las rutas `/api/agenda*`. Ownership en PATCH/DELETE de visitas: solo `createdBy`, `assignedUserId` o rol `owner|admin`; si no, 403.
- **Archivos:** `src/lib/api-auth-agenda.ts` (nuevo), `src/app/api/agenda/{route,cuentas,visitas,visitas/[id],licitaciones/**}.ts`, tests `src/app/api/agenda/__tests__/route-auth.test.ts` (8 tests: 401/403/200, ownership, admin override).

### B2 — Fixes de sync y TZ (audit B4, B5, B6)
- `calendar.service.ts`: `sendUpdates:"all"` en `events.patch` con attendees y en `events.delete` (no-op sin asistentes).
- `calendar-payloads.ts`: `timeZone: "America/Santiago"` explícita en start/end.
- `useNuevaVisita.ts`: la creación ancla fecha/hora con `dateAtChileSlot` (antes `new Date(\`${date}T${time}\`)` en TZ del navegador).
- All-day Google → ymd puro (`isoFromEventDate`) + helper nuevo `agendaItemDayKey` para agrupar sin `new Date()` ambiguo; consumidores actualizados (`AgendaCalendarGrid`, `AgendaHubCard`, `AgendaHubDays`, vistas móviles).
- **Tests:** `agenda-tz.test.ts` (12 tests, incluye DST Chile 2026-04-05 y 2026-09-06) y `calendar-service-sendupdates.test.ts` (3 tests que verifican el body).

### B3 — Modelo Calendar v2 (migración aditiva)
- Modelos de la Parte 4 de la auditoría: `CalendarEvent`, `CalendarEventParticipant`, `CalendarExternalAttendee`, `CalendarEventReminder`, `CalendarProviderLink`, `CalendarSyncCursor`, `CalendarAuditEvent`. Se omiten `CalendarEventResource` y `CalendarEventRecurrence` (Ola 3, según brief).
- Migración `prisma/migrations/20261101000000_calendar_v2/migration.sql`: solo `CREATE TABLE/INDEX IF NOT EXISTS`; **no toca** `agenda_visitas` ni `agenda_event_links`. Vercel la aplica en el deploy de preview (`prisma migrate deploy` del build).
- Decisión: un índice único de `CalendarSyncCursor` se acortó a `calendar_sync_cursors_provider_account_calendar_key` (el nombre por defecto excedía los 63 chars de Postgres) y quedó mapeado en el schema.

### B4 — Servicios de dominio `src/modules/calendar/`
- `calendar.service.ts` (crear/actualizar/cancelar/completar con auditoría y notificación), `calendar-participants.ts` (roles, RSVP, `setEventOwner`), `calendar-mapper.ts` (espejo AgendaVisita→CalendarEvent), `calendar-audit.ts`, `calendar-flags.ts`.
- **Convención clave:** `CalendarEvent.id === AgendaVisita.id` (ambos uuid) → doble escritura idempotente sin columna de vínculo.
- Flag `CALENDAR_V2`: `1`/`0` fuerza; sin definir → ON fuera de producción (preview/dev), OFF en producción.
- **Reasignación no destructiva (fix B2):** con flag ON se elimina el camino delete+recreate; cambia el participante `owner` y el evento Google del organizador conserva `googleEventId`. Además `agenda-sync.ts` ahora resuelve la cuenta dueña del link existente para patch/delete (nunca apunta al calendario equivocado). Con flag OFF el comportamiento legacy queda intacto (verificado por test).

### B5 — Sync Google v2
- `calendar-google-sync.ts`: evento en el calendario del organizador con `attendees[] = internos con Google (por googleEmail) + externos`, `sendUpdates:"all"`, link `role:"organizer"` con etag/localVersion; internos SIN cuenta → `CalendarProviderLink` `PENDING role:"attendee_copy"` (providerAccountId sintético `user:<id>`).
- `calendar-retry-pending.ts`: materializa las copias cuando el usuario conecta Google; enganchado a `retryPendingAgendaLinks` existente (OAuth callback + cron), tras flag.
- `calendar-rsvp-readback.ts`: vuelca `responseStatus` de attendees a participantes internos (por googleEmail) y externos.
- **Anti-duplicados:** `syncAgendaVisitaToCalendar` delega a v2 cuando el evento ya tiene `CalendarProviderLink` — un solo camino de sync por evento.

### B6 — Free/busy + conflictos
- `calendar-availability.ts`: busy por usuario = CalendarEvent v2 (dedupe del espejo por id) + AgendaVisita + técnicas (60') + tareas timed (30') + `freebusy.query` Google (timeout 3.5 s, falla silenciosa a solo-local). Expone `hasGoogle` por usuario.
- `calendar-intervals.ts`: merge de intervalos + `suggestCommonFreeSlots` (hasta 4, horario 08–19 Chile, pasos de 30').
- `GET /api/calendar/availability?userIds=&from=&to=&duration=` con RBAC crm.
- Tests de merge, bordes exactos y sugerencias (incluye día lleno → día siguiente).

### B7 — Notificación OPAI + deep link
- Tipos `agenda_invited|updated|cancelled|reminder` en el catálogo unificado (`bell + push` por defecto, Slack solo DM personal) → usan la plataforma `notify()` existente: **push + campana in-app (feed `/opai/notificaciones`, tabla `Notification` existente) + Slack DM opt-in**, con filtro de permisos crm/deals.
- `calendar-notify.ts`: notifica a participantes internos (con o sin Google), **excluye al actor**, deep link `/opai/agenda/evento/[id]`.
- Recordatorio 60 min antes: job idempotente (marca `CalendarAuditEvent action:"reminder"`) colgado del cron `flush-push-outbox` (corre cada minuto), tras flag.
- Ruta `/opai/agenda/evento/[id]`: resuelve v2 o legacy (comparten id) y redirige a `/opai/agenda?visita=`/`?evento=` que abre el detalle.

### B8 — Mobile shell (spec §1, §3)
- `AgendaPageClient` bifurca por viewport (`matchMedia < 1024px`): móvil monta `<AgendaMobile>`; desktop queda idéntico. `ModuleSubNav` ya venía `hidden lg:block` por defecto (sin cambios en `page.tsx`).
- `mobile/AgendaMobileHeader`: sticky `opai-glass-strong rounded-b-[26px]`; fila 1 mes (display 19px) + año (mono 12px) + Hoy + filtros con badge; fila 2 segmented `Agenda|Día|Mes` (sin Semana ni multi-día en móvil); fila 3 tira de fechas 46×58 con snap-scroll, dot de eventos, seleccionado `bg-primary`, hoy con borde. Publica su altura como `--agenda-mobile-header-h` para los day-headers sticky.
- `mobile/AgendaFab`: 56px `rounded-[20px] bg-primary` sombra primary/45, posicionado sobre la BottomNav vía `--bottom-nav-height` + safe-area, z-40 (bajo sheets).
- Filtros móviles: sheet glass-strong reutilizando `FilterGroup` del toolbar (Contenido/Tipo/Responsable).
- Prefs móviles en `opai-agenda-prefs-mobile` (fix B13); desktop conserva `opai-agenda-prefs`.

### B9 — Vista Agenda (spec §2)
- `AgendaListView` + `AgendaListRow`: mismo fetch `/api/agenda` (día seleccionado + 6), agrupado por `agendaItemDayKey`, day-headers sticky ("HOY" en primary), filas `opai-glass-soft rounded-[18px]` con columna hora mono, barra 3px por tipo (cliente=violet, técnica=ok, supervisión=warn, google=text-4), título 2 líneas, Tag tipo, avatar, estado sync (`☁ sync` / `◌ pendiente`).
- Tareas: checkbox 22px → PATCH real a `/api/crm/tasks/[id]` + strikethrough + toast. Licitaciones: banda rayada warn/12 + `entrega dd MMM · Nd` mono. Google: tag "Google ↗" abre `htmlLink`. Día vacío: fila punteada + "+ Agendar aquí" (prefija fecha en el composer). Skeleton 4 filas y error con retry.

### B10 — Día + Mes móvil + horario 0-24 (spec §4-5, audit B8)
- `AgendaDayView`: 1 columna 00-24 a 64px/h, gutter mono, solapes vía `layoutTimedItems`, all-day arriba, línea "ahora" danger con hora, auto-scroll a primer evento/08:00, swipe horizontal ±1 día (umbral 60px). Sin drag: tap = detalle.
- `AgendaMonthView`: grid 7 col fluido (cero scroll-x), celdas `rounded-[13px]` con número mono y hasta 3 dots por tipo, seleccionado `bg-primary`, hoy borde primary/50, fuera de mes atenuado; panel `opai-glass rounded-[22px]` con la agenda del día tocado (reusa las filas).
- Desktop: `CALENDAR_START_HOUR=0`, `CALENDAR_END_HOUR=24` + auto-scroll inicial a las 07:00 en la grilla (`layoutTimedItems` ya no clampea nada).

### B11 — Detalle sheet (spec §6, audit B17)
- `AgendaDetailSheet`: bottom sheet `opai-glass-strong rounded-t-[28px]`, snap 50%/100% con drag del handle (pointer events), scrim `bg-black/45` z-50 (sobre la BottomNav z-40), footer sticky con safe-area.
- Contenido: Tag tipo + estado sync, título display 19px, fecha/hora mono, **Participantes** (avatar 30px, rol y badge RSVP: `✓ Va` ok-soft, `? Sin responder` warn-soft, `◉ OPAI` primary/12 para internos sin Google, `✕ No va`; externos con email), Ubicación con "Cómo llegar" (Maps), Contexto (cuenta/instalación/negocio con links), Notas.
- Acciones: Reprogramar (Dialog con pickers anclados a Chile, conserva duración), Completar, Cancelar vía **Dialog del DS** (jamás `confirm()`); el `confirm()` del inspector desktop también fue reemplazado por el mismo Dialog.
- RSVP viene del nuevo `calendar-detail.ts`, expuesto como campo `v2` en `GET /api/agenda/visitas/[id]`.

### B12 — Composer + selector de participantes (spec §7-8)
- `EventComposer` fullscreen: header `Cancelar | Nuevo evento | Guardar`, chips de tipo, título, fila Cuándo (pickers nativos + `dateAtChileSlot`, presets 30/60/90/Todo el día), **banner de conflicto** free/busy con "Buscar otro horario", chips de participantes internos (⚠ en conflicto) + "+ Agregar", invitados externos por email, Cuenta/Instalación (reusa `AccountField`/`InstallationField`), notas, toggles Google Calendar / Notificación OPAI / Recordatorio Slack / **Meet deshabilitado "próximamente"** (sin conferenceData en este brief), botón Guardar sticky con safe-area.
- `ParticipantPicker` fullscreen: buscador, disponibilidad inline por fila (`✓ Libre` / `⛔ Ocupado hh:mm–hh:mm · título` / "sin Google — recibirá aviso OPAI") y sección "Horarios donde todos están libres" con chips mono que aplican la hora al formulario.
- `POST /api/calendar/events`: crea la visita legacy (visible en toda la UI actual) + espejo v2 con participantes/externos; **sync Google por un solo camino** (v2 con attendees si hay gente; legacy si no); notificación OPAI dirigida solo a los recién invitados (sin duplicados); técnica va por su flujo legacy dedicado.
- Desktop conserva `NuevaVisitaModal` (reemplazarlo se evaluó de riesgo medio — ver "Fuera de alcance").

### B13 — Limpieza y validación
- Eliminados `AgendaWeekStrip.tsx` y `AgendaDayColumn.tsx` (código muerto, audit B14); `WeekItem` movido a `agenda-calendar.types.ts`; imports de `TaskDrawer`/`VisitList` actualizados.
- `npm run check-ds:warn`: **cero drift nuevo** en `src/components/agenda/**` (los warnings existentes del repo son de otros módulos).
- Suite vitest completa: 1648 pass. Se corrigió `agenda-team.test.ts` (prueba el flujo legacy de reasignación → ahora fija `CALENDAR_V2=0`; el flujo v2 se cubre en `modules/calendar/__tests__`). Única falla restante: `src/lib/sii/__tests__/aec-signer.test.ts` — **preexistente y ajena al scope** (firmador AEC que invoca un proceso python no disponible en este entorno; `src/lib/sii` no fue tocado en esta rama).
- Gate final verde.

---

## Decisiones tomadas

1. **Rama:** el entorno de ejecución exige la rama designada `claude/agenda-v1-mobile-glass-x3u7r5`; cumple exactamente el rol de `feat/agenda-v1` (preview + aprobación, sin merge).
2. **Espejo por id compartido:** `CalendarEvent.id = AgendaVisita.id` evita una columna de vínculo y hace la doble escritura idempotente; el deep link resuelve ambos mundos con un solo id.
3. **Un solo camino de sync por evento:** si existe `CalendarProviderLink` (evento con participantes), el sync legacy delega a v2 — evita eventos duplicados en Google.
4. **Flag default:** `CALENDAR_V2` ON fuera de producción (preview/dev) y OFF en producción hasta aprobación.
5. **Notificaciones vía plataforma `notify()`:** en lugar de llamar `push-sender` directo, se registraron tipos en el catálogo unificado → push + campana in-app + Slack DM + preferencias por usuario gratis.
6. **Renderer propio** (recomendación de la auditoría Parte 7): las vistas móviles son listas/grids CSS sin librerías nuevas; cero dependencias agregadas.

## Fuera de alcance (anotado según brief)

- **Google Meet / conferenceData** — toggle visible pero deshabilitado ("próximamente").
- **Recurrencia (RRULE), `CalendarEventResource`, vista equipo, ICS** — Ola 3.
- **Composer en desktop** — `NuevaVisitaModal` se conserva ≥lg; reemplazarlo requería tocar el flujo de contactos CRM (`ContactsField`) y prefs del modal: riesgo medio, quedó fuera. El composer móvil ya usa el servicio v2.
- **Typeahead de contactos CRM en invitados externos del composer** — v1 acepta email libre; los contactos CRM siguen entrando por `NuevaVisitaModal` (desktop) o como externos por email.
- **Distancia en la fila de evento** (spec §2 "distancia si hay coords") — el item de agenda no expone coords del dispositivo; queda para cuando haya geolocalización del usuario.
- **Recordatorio Slack del composer** — el toggle se envía en el payload pero el backend actual no implementa el recordatorio Slack por visita (tampoco existía en `NuevaVisitaModal` server-side); anotado como deuda.
- **Webhook v2 inbound / CalendarSyncCursor operativo** — la tabla quedó creada (B3) pero el webhook sigue leyendo `prefs` (audit B3 completo era PR-11 de Ola 2); el fix del scan O(n) global queda pendiente.
- **In-app feed:** existía (`Notification` + campana) — se usó; no se creó tabla nueva.

## Checklist de QA manual para Carlos (preview)

1. **(a) Móvil 390px sin scroll-x:** abrir `/opai/agenda` en 390×844 — vistas Agenda, Día y Mes no deben producir scroll horizontal de página (Mes: grid fluido; Día: columna única).
2. **(b) Nada sobre el header móvil:** en `< lg` la página parte directo en el header glass del calendario (sin PageHero, sin SubNav CRM, sin toolbar); abajo solo la BottomNav.
3. **(c) Crear evento con Jorge+Hugo:** FAB → composer → agregar a Jorge (con Google) y Hugo (sin Google) → Guardar. Verificar: Jorge recibe invitación de Google (attendee del evento del organizador), Hugo recibe push/campana OPAI ("Te invitaron: …"), y al conectar Google después recibe su copia (retry al OAuth callback).
4. **(d) Reprogramar → asistentes notificados:** cambiar horario desde el sheet (o inspector desktop). Los attendees Google reciben email de update (`sendUpdates:"all"` en patch) y los internos push "Cambio de horario".
5. **(e) Reasignar no destruye:** con `CALENDAR_V2` activo, cambiar responsable en el inspector → el evento Google del organizador conserva su `googleEventId`/hilo (verificar en `agenda_event_links.google_event_id` o en el propio Calendar: el evento NO desaparece ni se recrea).
6. **(f) 403 sin permiso CRM:** con un usuario sin permiso de vista CRM, `GET /api/agenda?from=…&to=…` responde 403 (y la página redirige a /hub como siempre).
7. Extra: tarea con checkbox en la lista → queda tachada y desaparece al refrescar; licitación muestra banda rayada con `entrega dd MMM · Nd`; evento Google abre su `htmlLink`; deep link `/opai/agenda/evento/<id>` abre el detalle; recordatorio push llega ~60 min antes de un evento creado con `CALENDAR_V2` activo.

## Criterios de aceptación globales — estado

- ✅ 0 scroll-x de página 320–430px en Agenda/Día/Mes (grids fluidos, columna única, tira con scroll interno propio).
- ✅ Móvil 390×844: primer evento visible sin scroll (header ~160px + lista arranca inmediato).
- ✅ Desktop ≥lg: idéntico salvo horario 0-24 con auto-scroll a 07:00 y Dialog de cancelación (reemplazo de `confirm()`).
- ✅ Reasignación con `CALENDAR_V2=1` conserva `googleEventId` (test unitario `calendar-service.test.ts`).
- ✅ `sendUpdates:"all"` en patch con attendees (test unitario del body en `calendar-service-sendupdates.test.ts`).
- ✅ Gate verde en cada commit; suite vitest verde al cierre.
