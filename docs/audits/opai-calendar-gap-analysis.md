# Auditoría integral — Calendario / Agenda OPAI

**Fecha:** 2026-07-22 · **Rama base:** `main` @ `52d0335` ("fix(hub): selector de visión en mobile y permisos al simular rol")
**Alcance:** producto, arquitectura, UX responsive, modelo de datos, sync Google, seguridad, performance y roadmap del módulo Agenda (`/opai/agenda`).
**Método:** inspección directa del código (referencias `archivo:línea` verificadas sobre el working tree). Sin cambios de producción; este documento es el único artefacto del diff.

**Convención de evidencia:** `[HECHO]` = verificado en código · `[INFERENCIA]` = deducción razonable de la evidencia · `[RECOMENDACIÓN]` = propuesta.

---

## Discrepancias con el brief inicial

El brief de auditoría contenía rutas que no existen tal cual. Estado real:

| Brief | Realidad en repo |
|---|---|
| `CLAUDE.md` | No existe en la raíz. La ley operativa es `AGENTS.md` (646 líneas: Cluster Nav v4, DS v3, Liquid Glass v1). |
| `src/app/api/webhook/google/**` | Es `src/app/api/webhook/google-calendar/route.ts` (104 líneas). |
| `src/app/api/cron/google-calendar-renew/**` | Es `src/app/api/cron/calendar-channel-renew/route.ts` (renueva canales Calendar + watches Gmail). |
| `AgendaDayColumn` / `AgendaWeekStrip` como piezas de la vista | Son **código muerto de la UI actual**: `<AgendaWeekStrip>` no se renderiza en ningún sitio (solo se importa el *type* `WeekItem` desde `TaskDrawer.tsx:8` y `VisitList.tsx:3`); `AgendaDayColumn` solo lo importa `AgendaWeekStrip.tsx:4`. La grilla vigente es `AgendaCalendarGrid.tsx`. |
| "El inspector móvil de hasta 88vh" | Confirmado: `AgendaPageClient.tsx:377` (`max-h-[88vh]`, overlay `fixed inset-0 z-50`). |
| `mockup-google-drive-calendar-visitas.html` (citado en `docs/google-workspace-agenda-audit.md:6`) | No existe en el repo. |

Todo lo demás del brief coincide con el código (detallado abajo).

---

# Parte 1 — Mapa actual

## 1.1 Arquitectura de componentes

```
/opai/agenda (page.tsx, RSC)
 ├─ gate: canView("crm","deals") → redirect /hub        page.tsx:14-16
 ├─ <ModuleSubNav moduleKey="crm">                       page.tsx:22
 └─ <AgendaPageClient> (client, 432 líneas)
     ├─ <PageHero> grande (violet)                       AgendaPageClient.tsx:264-270
     ├─ <AgendaToolbar> (nav, vistas, búsqueda, filtros, equipo, Crear)
     ├─ banners googleStatus (missing_scope / error)     :293-311
     ├─ grid xl: [calendario | inspector 320px fijo]     :312
     │   ├─ <AgendaCalendarGrid> (día/multi/semana/mes, dnd-kit)
     │   │   ├─ <AgendaTimedEvent> / <AgendaCompactEvent> (AgendaEventCard.tsx)
     │   │   ├─ AllDayColumn / DayTimeColumn / MonthDayCell
     │   │   └─ DragOverlay + resize handle
     │   └─ <AgendaInspector> (desktop panel / mobile bottom-sheet :369-392)
     ├─ listas secundarias: <VisitList> + <LicitacionesList>  :394-414
     └─ modales/drawers: NuevaVisitaModal, VisitDrawer, LicitacionDrawer, TaskDrawer
```

Hub reutiliza `AgendaHubCard` → `AgendaHubDays` (widget de 3 días en `/hub`), independiente de la grilla.

## 1.2 APIs involucradas

| Ruta | Métodos | Qué hace | Autorización real |
|---|---|---|---|
| `/api/agenda` (`route.ts`) | GET | `listAgenda` + `listGoogleCalendarEvents` fusionados y ordenados (`route.ts:26-31`) | Solo sesión+tenant (`:8-10`). **Sin** check `canView(crm)` |
| `/api/agenda/visitas` | GET/POST | Lista (sin licitaciones) / crea visita o técnica | Solo sesión+tenant |
| `/api/agenda/visitas/[id]` | GET/PATCH/DELETE | Detalle, reprogramar/reasignar, completar, cancelar | Solo sesión+tenant; **cualquier usuario del tenant puede modificar visitas de terceros** |
| `/api/agenda/licitaciones` (+`[dealId]/resumen`, `/comunicaciones`) | GET | Licitaciones en carpeta + drawer | Sesión+tenant |
| `/api/agenda/cuentas` | GET | Typeahead de cuentas del modal | Sesión+tenant |
| `/api/crm/users` | GET | Miembros para el filtro Equipo — este SÍ exige `requireCrmView` + `requireTenantModule('crm')` (`crm/users/route.ts:12-19`) | RBAC completo |
| `/api/integrations/google-calendar/{oauth/start,oauth/callback,status,disconnect}` | GET/PATCH | OAuth aislado (scopes `calendar.events` + `calendar.readonly`, `scopes.ts:17-24`), estado propio + del equipo (admins), prefs | Sesión; team solo owner/admin (`status/route.ts:13,20`) |
| `/api/webhook/google-calendar` | POST | Push Google → sync inverso (solo `agenda_visita`) | HMAC channel token (`route.ts:8-18`) |
| `/api/cron/calendar-channel-renew` | GET | Renueva canales push (cap 40 cuentas) + watches Gmail | `CRON_SECRET` |

## 1.3 Tablas y relaciones (Prisma)

- **`AgendaVisita`** (`schema.prisma:11867-11898`): un solo `assignedUserId: String` (:11875), sin relación FK a Admin; `contactIds Json?` (:11882) — array plano de ids CRM sin integridad referencial; `status` string libre `programada|completada|cancelada|reprogramada` (:11883); sin recurrencia, sin zona horaria, sin visibilidad, sin RSVP.
- **`AgendaEventLink`** (`:11901-11925`): 1:1 con la fuente vía `@@unique([sourceType, sourceId])` (:11920); `sourceType ∈ agenda_visita|visita_tecnica|licitacion`; `syncStatus PENDING|SYNCED|ERROR|CANCELLED`; `rangeStartYmd` solo para la banda all-day de licitaciones.
- **`GoogleCalendarAccount`** (`:11844-11864`): 1 por (tenant,user) (:11860); tokens cifrados; `prefs Json` sobrecargado — guarda a la vez preferencias de producto (`inviteContacts`, `slackReminderPrevDay`) **y** estado de infraestructura push (`channelId`, `resourceId`, `expiration`, `syncToken`) (`webhook/google-calendar/route.ts:40-44`, `cron/calendar-channel-renew/route.ts:41-46`). `[HECHO]` mezcla de dominios en un JSON sin schema.
- Fuentes adicionales de items: `OpsVisitaTecnica`, `CrmDeal` (isLicitacion), `CrmTask` (`agenda-list.ts:19-66`, `agenda-tasks.ts:14-33`).

## 1.4 Flujo de creación

`NuevaVisitaModal` (Dialog centrado `sm:max-w-lg`, scroll interno `max-h-[min(70vh,640px)]` — `NuevaVisitaModal.tsx:33,39`) → `useNuevaVisita.submit` → `POST /api/agenda/visitas` → `createAgendaVisita` (`agenda.service.ts:4-52`) → `syncAgendaVisitaToCalendar` salvo `syncCalendar:false` (→ `SKIPPED`, `:45-50`).

**Bug de zona horaria en creación** `[HECHO]`: `useNuevaVisita.ts:96` construye `new Date(\`${form.date}T${form.time}\`)` — se interpreta en la zona del **navegador**, no en `America/Santiago`. Un usuario con laptop en otra zona (viaje, TZ mal configurada) crea la visita corrida. El Inspector, en cambio, sí usa `dateAtChileSlot` (`AgendaInspector.tsx` vía `agenda-calendar-utils.ts:110-125`), que ancla a Chile con `fromZonedTime`. Comportamiento inconsistente entre crear y editar.

## 1.5 Flujo de edición y reasignación

- Mover/resize en grilla → `persistSchedule` → `PATCH /visitas/[id]` o `PATCH /crm/tasks/[id]` (`AgendaPageClient.tsx:213-259`).
- **Reasignación = delete + recreate** `[HECHO]`: `reprogramAgendaVisita` (`agenda.service.ts:54-96`): si cambia `assignedUserId`, (1) borra el evento Google del responsable anterior (`:72`), (2) limpia el link a `PENDING` (`:73-81`), (3) re-sincroniza creando un evento **nuevo** en el calendario del nuevo responsable (`:95`). Consecuencias: se pierden `googleEventId`, RSVP de invitados y el hilo del evento; los contactos externos reciben una cancelación + una invitación nueva; si el nuevo responsable no tiene Calendar conectado, el evento simplemente desaparece de Google (link queda `PENDING`).
- Toda reprogramación fuerza `status: "reprogramada"` (`:92`), incluso si solo cambió el responsable u ocurrió un drag de 15 min.

## 1.6 Flujo de sincronización OPAI → Google

`syncEventLink` (`calendar.service.ts:17-123`): upsert del link → cliente OAuth del `assignedUserId` → `events.patch` si hay `googleEventId`, si no `events.insert`. Puntos clave:
- **`sendUpdates` solo en insert** `[HECHO]` (`:89`): `events.patch` (`:79-84`) NO pasa `sendUpdates` → cuando una visita con contactos invitados se reprograma, **Google no notifica a los asistentes** (ítem 10 del brief: confirmado como defecto).
- Sin cuenta conectada → `PENDING` silencioso (`:34-40`); reintento best-effort cap 20 vía `retryPendingAgendaLinks` (`agenda-retry-pending.ts:12-47`), disparado desde OAuth callback/cron — no hay backoff ni DLQ.
- `payload.start/end` con `dateTime` ISO UTC sin `timeZone` explícito (`calendar-payloads.ts:66-67`) — funciona, pero Google mostrará el evento en la TZ del calendario del usuario; correcto de facto para Chile, frágil para equipos multi-TZ.

## 1.7 Flujo de recepción de eventos externos (Google → OPAI)

Dos mecanismos:
1. **Lectura pull en cada GET /api/agenda** (`google-events.ts:106-158`): hasta 6 calendarios visibles y 60 eventos (`:11-12`), dedupe contra `AgendaEventLink.googleEventId`, caché in-memory 5 min por instancia (`:13-14` — `[INFERENCIA]` en Vercel serverless este Map se fragmenta por lambda: hit-rate bajo y memoria por instancia). Fallback a `primary` cuando el token no tiene `calendar.readonly` (`:38-47`). Los items Google se marcan `assignedUserId: userId` **del espectador** (`:82`) → el filtro "Equipo" atribuye eventos Google a quien mira, no al dueño real.
2. **Webhook push** (`webhook/google-calendar/route.ts`): verifica HMAC del channel token (`:8-18`), pero para resolver la cuenta **escanea TODAS las `GoogleCalendarAccount` ACTIVE de TODOS los tenants** y filtra en memoria por `prefs.channelId` (`:27-34`) — O(n) global sin índice. Solo sincroniza `agenda_visita` (`:59`); nunca crea eventos nuevos en OPAI; el sync inverso escribe `startAt/endAt/status:"reprogramada"` (`:78-84`). El catch global silencia errores, incluido el `410 GONE` de syncToken expirado (`:100-102`) → `[INFERENCIA]` un syncToken inválido deja el canal muerto hasta que el cron lo renueve, sin full-resync compensatorio.

## 1.8 Permisos y tenant scoping

- Tenant scoping: correcto y consistente — todas las queries llevan `tenantId` (`agenda-list.ts:21,33,45`, `agenda.service.ts`, webhook `:57,63`).
- RBAC: **asimétrico** `[HECHO]`. La *página* exige `canView(crm,deals)` (`page.tsx:14-16`) pero las APIs `/api/agenda*` solo exigen sesión: un usuario del tenant sin permiso CRM no ve la página pero puede leer/crear/reprogramar/cancelar visitas de cualquiera vía API. No hay noción de "solo puedo editar mis visitas" ni de privacidad de eventos.
- Visibilidad: todo usuario ve TODAS las visitas y TODAS las tareas del tenant (`listAgenda` no filtra por usuario; `listAgendaTasks` trae hasta 500 tareas del equipo, `agenda-tasks.ts:31`). Los eventos Google, en cambio, son solo los del espectador. Modelo mixto sin regla declarada.

## 1.9 Notificaciones existentes

- Al crear visita: opción `slackReminder` (recordatorio Slack día previo) y `inviteContacts` (invitación Google a contactos CRM) — `useNuevaVisita.ts:20-22,75-78`.
- Push web: infraestructura completa existe (`src/lib/notifications/push-sender.ts`, `src/lib/pwa/push-service.ts`, `public/sw.js:197-206`, outbox cron `flush-push-outbox`), **pero la agenda no la usa**: `grep 'agenda'` en push-sender/push-service = 0 resultados `[HECHO]`. No hay push por evento próximo, cambio, cancelación ni invitación.
- Email de asistentes: solo el que envíe Google en insert (ver 1.6); en updates, nada.

## 1.10 Funciones realmente presentes

**Desktop:** vistas día / N-días (2-6) / semana / mes; drag & drop con snap 15 min (dnd-kit, Pointer+Touch+Keyboard sensors, `AgendaCalendarGrid.tsx:74-78`); resize solo visitas timed (`agenda-calendar-utils.ts:297-299`); inspector lateral permanente 320px; búsqueda local; filtros contenido/tipo/responsable; indicador "ahora"; sync icons (Cloud/CloudOff); listas Próximas visitas + Licitaciones; prefs `view/multiDays` en localStorage (clave `opai-agenda-prefs`).

**Móvil:** exactamente la misma grilla (default `multi` 3 días, `AgendaPageClient.tsx:43-59`) con scroll horizontal interno; inspector como bottom-sheet 88vh; toolbar apilada; touch drag con delay 220ms.

**Editable vs solo lectura** (ítem 11 del brief) `[HECHO]` — `agenda-calendar-utils.ts:293-299`:

| Fuente | Mover | Resize | Editar en inspector | Completar/Cancelar |
|---|---|---|---|---|
| `agenda_visita` | ✅ | ✅ (timed) | ✅ fecha/hora/responsable | ✅ cancelar |
| `tarea` | ✅ | ❌ | ✅ + completar/eliminar | ✅ |
| `visita_tecnica` | ❌ | ❌ | ❌ (solo abrir origen) | ❌ desde agenda |
| `licitacion` | ❌ | ❌ | drawer informativo | ❌ |
| `google` | ❌ | ❌ | solo link `htmlLink` | ❌ |

## 1.11 Deuda técnica, bugs y riesgos (top hallazgos con severidad)

| # | Sev | Hallazgo | Evidencia |
|---|---|---|---|
| B1 | 🔴 | APIs de agenda sin RBAC ni ownership (cualquier usuario del tenant edita/cancela visitas ajenas y ve todas las tareas) | `api/agenda/visitas/[id]/route.ts:39-46`, `api/agenda/route.ts:7-10` |
| B2 | 🔴 | Reasignar = delete+recreate del evento Google: rompe RSVP, spamea invitados, evento se esfuma si el nuevo dueño no conectó Calendar | `agenda.service.ts:65-79` |
| B3 | 🔴 | Webhook Calendar: scan global cross-tenant de cuentas por `prefs.channelId` en memoria; catch silencioso sin manejo de syncToken 410 | `webhook/google-calendar/route.ts:27-34,100-102` |
| B4 | 🟠 | `sendUpdates` ausente en `events.patch`: reprogramar no notifica a asistentes | `calendar.service.ts:78-89` |
| B5 | 🟠 | Creación de visita parsea fecha/hora en TZ del navegador (drift fuera de Chile); edición sí ancla a Chile | `useNuevaVisita.ts:96` vs `agenda-calendar-utils.ts:110-125` |
| B6 | 🟠 | Eventos Google all-day: `isoFromEventDate` produce `"YYYY-MM-DDT00:00:00"` sin zona (`google-events-helpers.ts:1-5`); cualquier `new Date()` server-side (UTC) lo corre a las 21:00 del día anterior en Chile. Hoy el agrupado por día ocurre en el browser (`AgendaCalendarGrid.tsx:86-99`) así que en Chile se ve bien, pero es una bomba latente para cualquier consumo server-side | idem |
| B7 | 🟠 | `assignedUserId` de eventos Google = espectador → filtro Equipo atribuye mal | `google-events.ts:82` |
| B8 | 🟠 | Grilla oculta todo lo anterior a 07:00 y posterior a 21:00 (eventos tempranos/nocturnos se clampan o desaparecen del layout) | `agenda-calendar-utils.ts:14-15,192-218` |
| B9 | 🟡 | `listAgenda` carga TODOS los `AgendaEventLink` y TODOS los `Admin` del tenant por request; `google-events` carga todos los links con `googleEventId` | `agenda-list.ts:58-66`, `google-events.ts:127-131` |
| B10 | 🟡 | Cap duro 60 eventos / 6 calendarios Google sin aviso al usuario (semana densa = eventos faltantes silenciosos) | `google-events.ts:11-12,140` |
| B11 | 🟡 | Caché Google in-memory por instancia serverless (5 min TTL) — ineficaz en Vercel y sin invalidación al crear/editar | `google-events.ts:13-14,124-126` |
| B12 | 🟡 | Duración de eventos clampada a [30min, 12h] en render (`eventDurationMinutes`, `agenda-calendar-utils.ts:20-21,130-138`): un evento Google de 15 min se dibuja de 30; uno de 14h se corta | idem |
| B13 | 🟡 | Prefs desktop y móvil comparten una sola clave localStorage (`opai-agenda-prefs`): elegir "6 días" en desktop condena al móvil | `AgendaPageClient.tsx:35,127` |
| B14 | 🟡 | Código muerto: `AgendaWeekStrip`/`AgendaDayColumn` (ver Discrepancias) | — |
| B15 | 🟡 | `visita_tecnica` con duración hardcodeada 60 min en dos sitios (list + sync) | `agenda-list.ts:99`, `agenda-sync.ts:114` |
| B16 | 🟡 | Tests: solo 2 archivos (`agenda-calendar-utils.test.ts`, `agenda-team.test.ts`). Cero cobertura de sync Google, webhook, TZ/DST, RBAC | `src/components/agenda/__tests__/`, `src/modules/agenda/__tests__/` |
| B17 | 🟡 | `confirm()` nativo del browser para cancelar visita (rompe DS y UX móvil) | `AgendaInspector.tsx:317` |

---

# Parte 2 — Auditoría visual y responsive

## 2.1 Móvil (320 / 360 / 375 / 390 / 430 px)

| Problema | Sev | Evidencia | Impacto | Corrección propuesta |
|---|---|---|---|---|
| **Vista predeterminada = grilla multi-3-días de escritorio.** 56px gutter + 3×140px = 476px mínimo → scroll horizontal interno garantizado en TODOS los anchos ≤430px; en 320px ni siquiera caben 2 columnas | 🔴 | `AgendaPageClient.tsx:43-59`; `AgendaCalendarGrid.tsx:201,236,259` (`minmax(140px,1fr)`) | Columnas cortadas, "zonas vacías" (los otros días quedan fuera del viewport), la queja exacta del owner | Default móvil = vista **Agenda** (lista cronológica); Día = 1 columna full-width; multi/semana solo ≥lg |
| **Doble scroll anidado**: página scrollea Y, y dentro `max-h-[70vh] overflow-auto` scrollea X e Y | 🔴 | `AgendaCalendarGrid.tsx:196` | Gestos ambiguos, imposible llegar al footer sin "escapar" del contenedor; 70vh + hero + toolbar deja ~40% de viewport útil para la grilla en un 390×844 | Eliminar contenedor con scroll propio en móvil; una sola dirección de scroll por vista |
| **Mes con `min-w-[760px]`** → en 390px se ve <52% del mes | 🔴 | `AgendaCalendarGrid.tsx:143,153` | Vista mes inutilizable en móvil | Mes táctil: grid 7×6 fluido con dots/counts, tap→día |
| **Altura muerta antes del primer evento**: PageHero (título+subtítulo+descripción) + ModuleSubNav CRM + toolbar 3 filas apiladas ≈ 260-320px antes de ver contenido | 🟠 | `page.tsx:22`, `AgendaPageClient.tsx:264-270`, `AgendaToolbar.tsx:101-106` (flex-col en <xl) | "Primera agenda" queda bajo el fold | Header compacto sticky (mes + hoy + crear); hero grande fuera de la experiencia diaria |
| **Inspector móvil = overlay translúcido `bg-black/40` con card 88vh**, sin drag-handle, sin snap, cierre solo por tap en backdrop; se superpone al bottom nav (overlay `z-50` vs nav `z-40`, `BottomNav.tsx:217`) — el nav queda oscurecido pero visible debajo, el look "superpuesto" que reporta el owner | 🟠 | `AgendaPageClient.tsx:369-392`, `BottomNav.tsx:217-221` | Sensación de capa rota; en dark+glass el sheet no respeta material Liquid Glass (`opai-ios-surface-*` no se usa aquí) | Bottom-sheet real (snap points, handle, safe-area) o detalle fullscreen; usar superficies glass del DS |
| **Sin safe-area en el sheet**: el contenido llega hasta `bottom:0` sin `env(safe-area-inset-bottom)` | 🟠 | `AgendaPageClient.tsx:376-378` | Botones bajo el home indicator en iOS | padding-bottom con safe-area |
| **Drag táctil activo en la grilla** (TouchSensor delay 220ms) compite con el scroll del contenedor | 🟠 | `AgendaCalendarGrid.tsx:76` | Scrolls que "agarran" eventos; frustración táctil | En móvil: sin drag; reprogramar por sheet (acciones explícitas) |
| **Resize handle** de 44px de alto se superpone al evento siguiente y solo aparece con selección | 🟡 | `AgendaEventCard.tsx:137-151` | Toques fantasma en eventos contiguos | Quitar resize en móvil |
| **Teclado virtual**: NuevaVisitaModal es Dialog centrado con scroll interno 70vh; con teclado abierto en 390×844 el área útil cae a ~250px y el submit queda oculto | 🟠 | `NuevaVisitaModal.tsx:33,39` | Crear visita en móvil = pelea | Composer fullscreen con acciones sticky |
| **Pickers**: `<input type=date>` + `<input type=time>` nativos sin defaults inteligentes (hora vacía = all-day implícito solo en inspector) | 🟡 | `AgendaInspector.tsx:205-221` | Fricción; semántica all-day confusa | Pickers móviles con presets (30/60/90min, "próxima hora en punto") |
| **Truncamiento**: título 1 línea + hora; en columnas de ~120px reales los títulos `[Cliente] Cuenta — Instalación` (formato de `calendar-payloads.ts:38-39`) se cortan a 6-8 caracteres | 🟡 | `AgendaEventCard.tsx:113-115` | Eventos ilegibles | Vista Agenda con 2 líneas + metadata |
| **Offline/reconexión**: fetch sin manejo de error visible (`load()` solo `finally setLoading(false)`, sin estado error), sin retry, sin stale-while-revalidate | 🟠 | `AgendaPageClient.tsx:146-164` | Pantalla vacía silenciosa sin red | Estados offline/error/pending sync explícitos |
| **Light/Dark**: tokens DS correctos en toda la agenda (sin hex hardcoded) ✅ | ✔️ | grep de clases en componentes agenda | — | Mantener |
| **Accesibilidad**: eventos son `<button>` con `aria-label` (título+hora) ✅, pero: sin roving-tabindex ni navegación por flechas en la grilla, dropdowns `<details>` sin gestión de foco/Escape (`AgendaToolbar.tsx:141-176`), backdrop del sheet sin `role="dialog"`/focus-trap, `confirm()` nativo | 🟠 | citas indicadas | Lectores de pantalla navegan la grilla como sopa de botones | Patrón grid ARIA + Dialog real |
| **PWA**: sin pull-to-refresh, sin deep-link a evento (solo query params `?visita=`), sin badge de agenda | 🟡 | `AgendaPageClient.tsx:166-171` | — | Ola push/deep-links |
| **Touch targets**: controles 44px (h-11) ✅ consistente con AGENTS.md §4 | ✔️ | `AgendaToolbar.tsx:44-46` | — | Mantener |

**Veredicto móvil:** la experiencia móvil no existe como tal; es la grilla desktop con scroll horizontal. Coincide 1:1 con el diagnóstico del owner.

## 2.2 Tablet (768–1024 px)

Hoy: mismo layout de 1 columna (el inspector permanente solo aparece en `xl:` ≥1280, `AgendaPageClient.tsx:312,341`); sidebar no se renderiza <1024 (AGENTS.md "Sidebar default behavior") → tablet usa bottom nav + grilla con scroll interno. No hay breakpoint intermedio pensado.

`[RECOMENDACIÓN]` reglas tablet:
- **768-1023 portrait:** vista Día (1 col, hora completa) o Agenda; mes fluido; detalle como sheet lateral (no bottom).
- **768-1023 landscape / ≥1024:** semana 7 días cabe (7×~120px + gutter) → habilitar semana; inspector como panel colapsable, no permanente.
- Dos paneles (lista+detalle) solo ≥1024.

## 2.3 Desktop (1280–1920 px)

| Aspecto | Estado | Evidencia | Problema / Corrección |
|---|---|---|---|
| Densidad hero | PageHero grande + SubNav CRM ≈ 200px verticales antes de la toolbar | `page.tsx:22`, `AgendaPageClient.tsx:264-270` | En un calendario, cada px vertical cuenta. Comprimir a header 1 línea (título + período + acciones) |
| Toolbar | Buena: segmented views, menú N-días, filtros con badge, búsqueda expandible | `AgendaToolbar.tsx` | Falta: atajos teclado (T/D/W/M, ←/→), sin tooltips |
| Mini calendario | ❌ ausente | — | Añadir (salto de fecha en 1 click es estándar de la categoría) |
| Panel de calendarios | ❌ ausente: no se puede togglear qué calendarios Google/fuentes ver (los 6 se fusionan sin control) | `google-events.ts:19-49` | Panel "Mis calendarios" con checkboxes + color |
| Inspector | Permanente 320px, incluso vacío ("Selecciona una visita…") | `AgendaPageClient.tsx:341-361` | Colapsable; abrir on-select |
| Ancho útil | `70vh` también limita desktop: en 1440×900 la grilla ve ~630px de alto (≈7.5h de las 14 renderizadas) | `AgendaCalendarGrid.tsx:196` | Altura natural con sticky header propio de la página |
| Drag/resize | ✅ sólido (snap 15', preview, overlay) | `AgendaCalendarGrid.tsx:104-134` | Falta drag entre columnas con cambio de hora simultáneo fino (hoy delta.y global, OK) y drag para *crear* (click-drag en slot vacío) ❌ |
| Keyboard nav | KeyboardSensor de dnd-kit registrado pero sin flujo real (no hay foco inicial en eventos ni instrucciones) | `AgendaCalendarGrid.tsx:77` | Roving focus + Enter=abrir, flechas=mover |
| Vistas equipo/recursos | ❌ no existen (solo filtro por 1 responsable) | `AgendaToolbar.tsx:203-270` | Ola 2: columnas por persona |
| Eventos simultáneos | ✅ algoritmo de columnas por cluster correcto | `agenda-calendar-utils.ts:192-245` | OK; falta indicador "+N" cuando columnCount alto en columnas angostas |
| All-day | Fila dedicada ✅; licitaciones multi-día se expanden a chips por día (no banda continua) | `AgendaCalendarGrid.tsx:233-256`, `agenda-list-licitacion.ts` | Banda continua tipo GCal |
| Títulos largos | truncate 1 línea | `AgendaEventCard.tsx:113` | Tooltip on hover |
| Horario 07-21 | Eventos fuera de rango invisibles/clampados también en desktop | `agenda-calendar-utils.ts:14-15` | Rango 0-24 con auto-scroll a 07:00 |

---

# Parte 3 — Catálogo funcional objetivo

Estados: **C**ompleto · **P**arcial · **A**usente · **D**efectuoso · **NV** No verificable. Prioridad P0-P3 · Complejidad S/M/L/XL. Columnas Desktop/Móvil = dónde debe existir.

### 3.1 Modelo de evento

| ID | Funcionalidad | Referente | Estado | Evidencia | Gap | Prio | Cx | Dep | D | M |
|---|---|---|---|---|---|---|---|---|---|---|
| E01 | Evento interno OPAI como fuente de verdad | Notion Cal | **P** | Visitas/tareas sí; eventos "google" son solo espejo read-only sin entidad local (`google-events.ts:70-93`) | Un evento genérico OPAI no existe: solo "visita" | P0 | L | M01 | ✅ | ✅ |
| E02 | Organizador vs responsable | Outlook | **A** | Solo `createdBy` + `assignedUserId` (`schema.prisma:11875,11885`) sin semántica de organizador | Sin roles | P0 | M | M01 | ✅ | ✅ |
| E03 | Participantes internos múltiples | GCal/Teams | **A** | Un único `assignedUserId`; "asignar" ≠ "invitar" (requisito prioritario del owner) | Núcleo del gap | **P0** | L | M01 | ✅ | ✅ |
| E04 | Invitados externos (email) | GCal | **P** | Solo contactos CRM como attendees Google (`calendar-payloads.ts:52-57`); sin email libre, sin RSVP leído de vuelta | Sin estado de respuesta en OPAI | P1 | M | M01,S02 | ✅ | ✅ |
| E05 | Opcionales / seguidores | Outlook | **A** | — | — | P2 | S | E03 | ✅ | ✅ |
| E06 | RSVP interno (aceptar/rechazar/tentativo) | GCal | **A** | — | — | P1 | M | E03,N01 | ✅ | ✅ |
| E07 | Permisos de invitados (modificar/invitar/ver lista) | GCal | **A** | — | — | P3 | S | E03 | ✅ | — |
| E08 | Visibilidad (público/privado tenant) | GCal | **A** | Todo visible a todo el tenant (§1.8) | — | P1 | S | M01 | ✅ | ✅ |
| E09 | Busy/free/tentative | Outlook | **A** | — | Bloquea Scheduling Assistant | P1 | S | M01 | ✅ | ✅ |
| E10 | Zona horaria por evento | GCal | **P** | Todo hardcodeado `America/Santiago` (`dates-cl`); payload Google sin `timeZone` (`calendar-payloads.ts:66-67`) | Aceptable v1 Chile; declarar TZ explícita | P2 | S | — | ✅ | ✅ |
| E11 | Recurrencia RRULE + excepciones | GCal | **A** | Cero soporte; Google recurrentes llegan expandidos vía `singleEvents:true` (`google-events.ts:63`) pero no se pueden crear/editar | — | P1 | XL | M01,S03 | ✅ | ✅ |
| E12 | Recordatorios múltiples configurables | Fantastical | **P** | Hardcoded popup 60' + email 1440' (`calendar-payloads.ts:69-75`) | No editable | P2 | S | M01 | ✅ | ✅ |
| E13 | Adjuntos | Teams | **A** | — | — | P3 | M | R2 | ✅ | ✅ |
| E14 | Ubicación física + coords | OPAI | **C** | `customAddress/lat/lng` + dirección instalación (`schema.prisma:11879-11881`, `agenda-sync.ts:60-62`) | — | — | — | — | ✅ | ✅ |
| E15 | Videoconferencia (Meet) | GCal | **A** | Sin `conferenceData` en payload | — | P1 | S | S02 | ✅ | ✅ |
| E16 | Colores / calendarios propios | Notion Cal | **P** | Tono por fuente (`AgendaEventCard.tsx eventTone`), no configurable ni multi-calendario OPAI | — | P2 | M | M01 | ✅ | ✅ |
| E17 | Duplicar / plantillas | Fantastical | **A** | — | — | P2 | S | E01 | ✅ | ✅ |

### 3.2 Colaboración

| ID | Funcionalidad | Referente | Estado | Evidencia | Prio | Cx | Dep | D | M |
|---|---|---|---|---|---|---|---|---|---|
| C01 | Typeahead usuarios OPAI tenant-scoped | Teams | **P** | Select plano de todos los admins (`AgendaInspector.tsx:226-239`); `/api/crm/users` sí es tenant-scoped | P0 | S | E03 | ✅ | ✅ |
| C02 | Typeahead contactos CRM | OPAI | **C** | `ContactsField` en nueva-visita, filtrado por cuenta | — | — | — | ✅ | ✅ |
| C03 | Avatares + estado de respuesta | GCal | **P** | Avatares sí (`AgendaEventCard.tsx:126-131`); estado RSVP no | P1 | S | E06 | ✅ | ✅ |
| C04 | Free/busy individual y grupal | Outlook SA | **A** | — | **P0** (habilita todo lo demás) | M | S02(freebusy API) | ✅ | ✅ |
| C05 | Detección de conflictos al crear | Motion | **A** | Nada valida solapes | P0 | S | C04 | ✅ | ✅ |
| C06 | Sugerencia de horarios | Outlook SA | **A** | — | P1 | M | C04 | ✅ | ✅ |
| C07 | Reprogramar con notificación | GCal | **D** | `sendUpdates` solo en insert (B4) | P0 | S | S02 | ✅ | ✅ |
| C08 | Delegación / crear en nombre de | Outlook | **A** | — | P3 | M | E02 | ✅ | — |
| C09 | Calendarios compartidos internos | Teams | **A** | — | P2 | L | M01 | ✅ | ✅ |
| C10 | Equipos guardados (grupos de invitación) | Cal.com | **A** | — | P2 | S | E03 | ✅ | ✅ |
| C11 | Comentarios / actividad en evento | Notion | **A** | Solo `resultNote` al completar | P2 | M | M01 | ✅ | ✅ |
| C12 | Auditoría de cambios | Enterprise | **P** | Solo `crm-history` al completar con deal (`visitas/[id]/route.ts:52-66`); reasignaciones/moves sin rastro | P1 | S | M09 | ✅ | — |

### 3.3 Operación OPAI

| ID | Funcionalidad | Estado | Evidencia | Prio | Cx | D | M |
|---|---|---|---|---|---|---|---|
| O01 | Vincular Cuenta / Contacto / Negocio / Instalación | **C** | `AgendaVisita` FKs + `contactIds` (`schema.prisma:11872-11882`) | — | — | ✅ | ✅ |
| O02 | Licitaciones como banda en calendario | **P** | Chips por día expandidos, no banda; solo lectura (`agenda-list-licitacion.ts`) | P2 | S | ✅ | ✅ |
| O03 | Visita técnica integrada | **P** | Se crea desde modal y se lista, pero read-only en grilla (B: no move/resize, `agenda-calendar-utils.ts:293-299`) y duración fija 60' (B15) | P1 | S | ✅ | ✅ |
| O04 | Tareas calendarizadas | **C** | `listAgendaTasks` + move + complete | — | — | ✅ | ✅ |
| O05 | Guardias/supervisores como participantes | **A** | Solo `Admin`; guardias (OpsGuardia) no agendables | P2 | M | ✅ | ✅ |
| O06 | Vehículos/salas/recursos | **A** | — | P3 | L | ✅ | — |
| O07 | Dirección + ruta + tiempo de traslado | **P** | Dirección y coords sí; ruta/ETA no | P2 | M | ✅ | ✅ |
| O08 | Check-in/out + evidencia de visita | **A** | En agenda no; existe en supervisión ops (módulo aparte) | P1 | M | — | ✅ |
| O09 | Resultado → tareas posteriores | **P** | `resultNote` sí; generación de tareas no | P2 | S | ✅ | ✅ |
| O10 | Reasignación por ausencia | **D** | Existe pero con delete+recreate (B2) | P0 | M | ✅ | ✅ |
| O11 | Carga y cobertura del equipo | **A** | — | P2 | M | ✅ | — |

### 3.4 Productividad

| ID | Funcionalidad | Estado | Evidencia | Prio | Cx | D | M |
|---|---|---|---|---|---|---|---|
| P01 | Vistas agenda/día/semana/mes | **P** | día/multi/semana/mes sí; **Agenda (lista) no existe** — el gap móvil nº1 | **P0** | M | ✅ | ✅ |
| P02 | Vista equipo (columnas por persona) | **A** | — | P1 | L | ✅ | — |
| P03 | Vista recursos | **A** | — | P3 | L | ✅ | — |
| P04 | Búsqueda global (fuera del rango visible) | **P** | Solo filtra items ya cargados (`AgendaPageClient.tsx:186-211`) | P2 | M | ✅ | ✅ |
| P05 | Filtros guardados | **A** | — | P3 | S | ✅ | ✅ |
| P06 | Quick create (click en slot / NL) | **A** | Solo botón Crear→modal | P1 | M | ✅ | ✅ |
| P07 | Lenguaje natural español ("visita a Codelco mañana 10am") | **A** | OPAI Intelligence existe pero sin tool de agenda `[NV: no se auditó el chatbot en esta sesión]` | P2 | M | ✅ | ✅ |
| P08 | Atajos de teclado | **A** | — | P2 | S | ✅ | — |
| P09 | Focus time / buffers | **A** | — | P3 | M | ✅ | ✅ |
| P10 | Scheduling links / round-robin | **A** | — | P2 | XL | ✅ | ✅ |
| P11 | Reprogramación inteligente | **A** | — | P3 | XL | ✅ | ✅ |

### 3.5 Integraciones

| ID | Funcionalidad | Estado | Evidencia | Prio | Cx | D | M |
|---|---|---|---|---|---|---|---|
| I01 | Google Calendar bidireccional | **P** | Salida ✅ (visitas/licitaciones); entrada: pull read-only + webhook solo reprograma visitas (§1.7). No hay creación inversa ni sync de asistentes | P0 | L | ✅ | ✅ |
| I02 | Microsoft Graph / Outlook | **A** | — | P2 | XL | ✅ | ✅ |
| I03 | Google Meet | **A** | Sin conferenceData | P1 | S | ✅ | ✅ |
| I04 | Teams/Zoom | **A** | — | P3 | M | ✅ | ✅ |
| I05 | ICS import/export/subscribe | **A** | — | P2 | M | ✅ | ✅ |
| I06 | Webhooks Calendar + renovación | **P** | Existe con HMAC + cron; defectos B3 | P0 | M | — | — |
| I07 | Push web por evento | **A** | Infra push existe, agenda no la usa (§1.9) | P1 | M | ✅ | ✅ |
| I08 | Email transaccional de agenda | **P** | Solo lo que mande Google; Slack recordatorio día previo sí | P2 | S | ✅ | ✅ |
| I09 | Deep links `?visita=/licitacion=` | **P** | Query params sí (`AgendaPageClient.tsx:166-171`); ruta canónica `/agenda/evento/[id]` no | P1 | S | ✅ | ✅ |
| I10 | PWA badge | **A** | sw.js soporta badge, agenda no lo alimenta | P2 | S | — | ✅ |

---

# Parte 4 — Modelo de datos propuesto

Diseño **aditivo** y tenant-scoped. `AgendaVisita`/`AgendaEventLink` no se tocan en la fase de introducción; conviven hasta la migración final.

```prisma
/// Evento canónico OPAI. Fuente de verdad para todo lo creado en OPAI.
model CalendarEvent {
  id             String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId       String   @map("tenant_id")
  calendarId     String?  @db.Uuid            // futuro: calendarios OPAI compartidos
  kind           String   @default("event")   // event|visita_cliente|visita_tecnica|supervision|licitacion|tarea_bloqueada
  title          String
  description    String?  @db.Text
  location       String?  @db.Text
  lat            Float?
  lng            Float?
  startAt        DateTime @db.Timestamptz(6)
  endAt          DateTime @db.Timestamptz(6)
  allDay         Boolean  @default(false)
  timezone       String   @default("America/Santiago")
  status         String   @default("confirmed") // confirmed|tentative|cancelled|completed
  transparency   String   @default("busy")      // busy|free|tentative  (E09)
  visibility     String   @default("tenant")    // tenant|participants|private (E08)
  // Contexto operacional OPAI (O01)
  accountId       String? @db.Uuid
  installationId  String? @db.Uuid
  dealId          String? @db.Uuid
  createdBy      String   @map("created_by")
  version        Int      @default(1)          // optimistic concurrency + sync ordering
  createdAt      DateTime @default(now()) @db.Timestamptz(6)
  updatedAt      DateTime @updatedAt @db.Timestamptz(6)
  deletedAt      DateTime? @db.Timestamptz(6)  // soft delete: los sync necesitan ver tumbas

  participants  CalendarEventParticipant[]
  externals     CalendarExternalAttendee[]
  resources     CalendarEventResource[]
  reminders     CalendarEventReminder[]
  recurrence    CalendarEventRecurrence?
  providerLinks CalendarProviderLink[]

  @@index([tenantId, startAt])
  @@index([tenantId, deletedAt, startAt])
  @@map("calendar_events")
  @@schema("public")
}

/// Usuarios internos OPAI en el evento. Separa "responsable" de "invitado" (requisito owner).
model CalendarEventParticipant {
  id             String    @id @default(cuid())
  tenantId       String
  eventId        String    @db.Uuid
  userId         String                       // Admin.id
  role           String    // organizer | owner | required | optional | watcher
  responseStatus String    @default("needs_action") // needs_action|accepted|declined|tentative
  invitedAt      DateTime  @default(now())
  respondedAt    DateTime?

  event CalendarEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)

  @@unique([eventId, userId])
  @@index([tenantId, userId, responseStatus])   // "mi agenda" + badge de invitaciones
  @@map("calendar_event_participants")
  @@schema("public")
}

/// Externos por email (contactos CRM u otros).
model CalendarExternalAttendee {
  id             String  @id @default(cuid())
  tenantId       String
  eventId        String  @db.Uuid
  email          String
  name           String?
  crmContactId   String? @db.Uuid    // opcional: vínculo a CrmContact
  optional       Boolean @default(false)
  responseStatus String  @default("needs_action")  // leído de Google en sync
  event CalendarEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)
  @@unique([eventId, email])
  @@map("calendar_external_attendees")
  @@schema("public")
}

model CalendarEventResource {   // salas/vehículos (O06, fase tardía; tabla desde el día 1 para no migrar después)
  id       String @id @default(cuid())
  tenantId String
  eventId  String @db.Uuid
  resourceType String   // vehicle|room|equipment
  resourceId   String
  event CalendarEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)
  @@unique([eventId, resourceType, resourceId])
  @@map("calendar_event_resources")
  @@schema("public")
}

model CalendarEventReminder {
  id       String @id @default(cuid())
  tenantId String
  eventId  String @db.Uuid
  method   String // push|email|slack|popup
  minutesBefore Int
  event CalendarEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)
  @@map("calendar_event_reminders")
  @@schema("public")
}

/// RRULE + excepciones. El master guarda la regla; instancias materializadas solo cuando difieren.
model CalendarEventRecurrence {
  id        String  @id @default(cuid())
  tenantId  String
  eventId   String  @unique @db.Uuid       // master
  rrule     String                          // RFC 5545
  exdates   Json    @default("[]")          // ISO dates canceladas
  until     DateTime?
  event CalendarEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)
  @@map("calendar_event_recurrences")
  @@schema("public")
}

/// Vínculo evento OPAI ↔ evento en un proveedor, POR PARTICIPANTE.
/// Reemplaza el modelo "1 evento = 1 calendario del assignedUser": cada participante
/// interno con cuenta conectada obtiene SU copia (o invitación) sin delete+recreate.
model CalendarProviderLink {
  id                String   @id @default(cuid())
  tenantId          String
  eventId           String   @db.Uuid
  provider          String   @default("google")   // google|microsoft (I02 futuro)
  providerAccountId String                        // GoogleCalendarAccount.id
  providerCalendarId String
  providerEventId   String?
  htmlLink          String?  @db.Text
  role              String   @default("organizer") // organizer (dueño de la copia) | attendee (invitado vía attendees[])
  syncStatus        String   @default("PENDING")   // PENDING|SYNCED|ERROR|CANCELLED
  lastError         String?  @db.Text
  etag              String?                        // ETag Google → updates condicionales
  localVersion      Int      @default(0)           // CalendarEvent.version reflejada
  lastSyncAt        DateTime?
  event CalendarEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)
  @@unique([eventId, provider, providerAccountId])
  @@index([tenantId, provider, providerEventId])   // resolución O(1) en webhook (arregla B3)
  @@index([tenantId, syncStatus])
  @@map("calendar_provider_links")
  @@schema("public")
}

/// Estado de sincronización incremental por cuenta+calendario (saca syncToken/channel de prefs Json — arregla el schema-less actual).
model CalendarSyncCursor {
  id                String   @id @default(cuid())
  tenantId          String
  provider          String   @default("google")
  providerAccountId String
  providerCalendarId String  @default("primary")
  syncToken         String?  @db.Text
  channelId         String?
  resourceId        String?
  channelExpiresAt  DateTime?
  lastFullSyncAt    DateTime?
  updatedAt         DateTime @updatedAt
  @@unique([provider, providerAccountId, providerCalendarId])
  @@index([channelId])                              // lookup directo del webhook
  @@map("calendar_sync_cursors")
  @@schema("public")
}

/// Auditoría (C12): quién cambió qué.
model CalendarAuditEvent {
  id        String   @id @default(cuid())
  tenantId  String
  eventId   String   @db.Uuid
  actorId   String?                    // null = sistema/sync
  action    String                     // created|updated|rescheduled|reassigned|cancelled|completed|rsvp|synced_in
  payload   Json     @default("{}")    // diff mínimo
  createdAt DateTime @default(now())
  @@index([tenantId, eventId, createdAt])
  @@map("calendar_audit_events")
  @@schema("public")
}
```

**Decisiones de diseño (respuestas explícitas del brief):**

- **Fuente de verdad:** `CalendarEvent` para todo lo nacido en OPAI. Eventos nacidos en Google del calendario personal siguen siendo del proveedor (se muestran vía sync de lectura, opcionalmente materializables como `CalendarEvent.kind="external_mirror"` en fase 2 — v1 mantiene el pull actual).
- **Ownership:** `role="organizer"` en participants define quién "posee"; el evento existe y es visible en OPAI **aunque ningún participante tenga Google conectado** (los ProviderLink simplemente quedan sin crear — nunca condicionar la existencia del evento a Google, a diferencia de hoy donde reasignar a alguien sin cuenta lo hace desaparecer de Calendar, B2).
- **Invitación de internos sin delete+recreate:** al reasignar/invitar, se crea/patch el link del nuevo participante y se cancela (status) el link del saliente si corresponde — el evento Google del organizador conserva `providerEventId`, RSVP e hilo. Alternativa aún mejor cuando todos usan Google: 1 solo evento del organizador con internos como `attendees[]` (role=attendee en links) — elegir por participante según tenga o no cuenta conectada.
- **Idempotencia:** clave natural `@@unique([eventId, provider, providerAccountId])`; escrituras a Google con `If-Match: etag`; reintentos seguros porque upsert por clave; el webhook procesa por `providerEventId` indexado.
- **Versionado:** `CalendarEvent.version` monotónico; `ProviderLink.localVersion` marca qué versión está reflejada → un worker puede saber qué links están desactualizados sin comparar payloads.
- **Estrategia de sync:** outbox (links con `localVersion < event.version` o `PENDING`) drenado por cron/QStash con backoff; inbound por webhook → `CalendarSyncCursor.syncToken`; **manejo explícito de 410 GONE** → borrar token + full resync ventana ±90 días.
- **Conflictos:** last-writer-wins con `updatedAt` del proveedor vs `CalendarEvent.updatedAt`; si el evento cambió en ambos lados desde el último sync, gana OPAI para campos operacionales (status, vínculos CRM) y gana el proveedor para horario, registrando `CalendarAuditEvent(action:"conflict_resolved")`.
- **Eliminados:** soft-delete (`deletedAt`) + links → `CANCELLED`; Google `status:cancelled` entrante → `status:"cancelled"` local (nunca hard delete, coherente con el webhook actual "nunca borra").
- **Recurrencia:** master + RRULE; instancias modificadas se materializan como `CalendarEvent` hijos con `recurringEventId` (columna a añadir al materializar; Google ya entrega `singleEvents:true`).
- **Migración desde `assignedUserId` (backward-compatible, 3 pasos):**
  1. Backfill: por cada `AgendaVisita` → `CalendarEvent(kind según type)` + participant `{userId: assignedUserId, role:"owner"}` + participant `{createdBy, role:"organizer"}` si difiere + `CalendarProviderLink` copiado de `AgendaEventLink`.
  2. Doble escritura: servicios escriben ambos modelos tras feature flag `calendar_v2`.
  3. Lectura desde v2; `AgendaVisita` queda como vista legacy hasta retiro (PR aparte con aprobación explícita — regla de migraciones irreversibles del repo).
- **No se genera la migración en esta auditoría** (instrucción explícita).

---

# Parte 5 — UX móvil objetivo

Principios: 1 dirección de scroll por pantalla; Agenda como default; cero grillas comprimidas; acciones explícitas en vez de drag; Liquid Glass (`opai-glass-strong` solo en barras/sheets, `glass-soft` en filas — AGENTS.md); WCAG 2.2 AA; targets ≥44px; safe-areas siempre.

**Estructura de vistas móvil:** `Agenda (default) · Día · Mes` — Semana solo landscape/tablet u opt-in. Prefs móviles con clave propia (`opai-agenda-prefs-mobile`, corrige B13).

### 5.1 Wireframe — Agenda móvil (default)

```
┌──────────────────────────────────────┐
│ ‹ Julio 2026 ›   [Hoy] [☰filtros] [+]│ ← header compacto sticky (glass-strong, 48px)
│ L22 M23 M24 J25 V26 S27 D28          │ ← tira de fechas horizontal, snap, hoy resaltado
├──────────────────────────────────────┤
│ HOY · Miércoles 22                   │ ← sticky day header
│ ● 09:00–10:00  [Cliente]             │
│   Codelco — Planta Norte             │ ← fila glass-soft, 2 líneas, chips avatar
│   👤 Lizeth  ☁ sync  📍 2.3 km       │
│ ● 12:30  ☐ Tarea: enviar propuesta   │ ← tarea con checkbox inline (completar 1 tap)
│ ▓▓ LICITACIÓN · Entel · entrega 25/7 │ ← banda all-day
│ ─ sin más eventos ─                  │
│ JUEVES 23                            │
│ ∅ Día libre        [+ Agendar aquí]  │
│ …scroll vertical infinito ±rango…    │
├──────────────────────────────────────┤
│ [Inicio][Comercial][Ops][Personas][+]│ ← bottom nav intacto (z bajo el de sheets)
└──────────────────────────────────────┘
      (＋) FAB crear, bottom: nav + safe-area + 12px, lado derecho
```

### 5.2 Día móvil

```
│ ‹ Mié 22 jul ›  [Hoy]  [Agenda|Día|Mes]│ sticky
│ 07 ─────────────────────────────      │ 1 columna full-width, horas 00-24
│ 08 ─────────────────────────────      │ auto-scroll inicial a primer evento/08:00
│ 09 ┃[Cliente] Codelco — P. Norte┃     │ tap = detalle; long-press = menú
│ 10 ─────────────────────────────      │   (Reprogramar / Duplicar / Cancelar)
│ ══ 10:42 ahora ═════════════════      │ swipe ←/→ = día anterior/siguiente
```

### 5.3 Mes móvil (táctil, sin min-width)

```
│  ‹ Julio 2026 ›                       │
│ L  M  M  J  V  S  D                   │ celdas = (100vw-32)/7, sin overflow
│ …  1• 2  3•• 4  5  6                  │ dots por densidad (máx 3 + halo)
│ 22◉ …                                 │ tap día → panel inferior con la
│ ───────────────────────────────       │ agenda de ese día (mitad inferior)
│ Mié 22 · 3 eventos                    │
│ 09:00 Codelco · 12:30 Tarea · LIC     │
```

### 5.4 Crear evento (fullscreen composer)

```
│ ✕  Nuevo evento                Guardar│ ← sticky top+bottom; Guardar deshabilitado→activo
│ [Visita cliente|Técnica|Supervisión|  │ chips tipo
│  Reunión|Otra]                        │
│ Título ______________________________ │
│ 🕐 Mié 22 jul · 15:00 → 16:00         │ → abre pickers nativos; presets 30/60/90
│ ⚠ Conflicto: Lizeth tiene "Kickoff"   │ ← chequeo free/busy inline ANTES de guardar
│ 👥 Participantes:  (Lizeth ✓)(Jorge +)│ chips avatar internos  ← E03
│ ✉ Invitados: contacto@cliente.cl (+)  │ externos/CRM
│ 🏢 Cuenta ▸  📍 Instalación ▸         │
│ 📝 Notas…                             │
│ ⚙ Google Calendar ✓ · Slack ✓ · Meet ✓│
│ [────────── Guardar ──────────] 44px  │ sticky, sobre safe-area, sobrevive teclado
```

### 5.5 Selector de participantes

```
│ ✕ Participantes                 Listo │
│ 🔍 Buscar en el equipo…               │ typeahead tenant-scoped
│ SELECCIONADOS                         │
│ (👤 Lizeth · Organiza)(👤 Jorge ✕)     │
│ EQUIPO                                │
│ 👤 Hugo      Libre 15-16h        (+)  │ ← disponibilidad inline (C04)
│ 👤 Camila    ⛔ Ocupada 15-17h    (+)  │
│ ▸ Requerido / Opcional (toggle chip)  │
```

### 5.6 Scheduling Assistant móvil

```
│ ✕ Buscar horario        Mié 22 jul ›  │
│ 60 min · 3 personas                   │
│ 09 ▓Lz ░Jo ░Hu                        │ mini-timeline por persona (columnas finas)
│ 15 ░  ░  ░   ✅ Todos libres          │
│ SUGERIDOS: [15:00] [16:30] [Jue 09:00]│ tap = aplicar al composer
```

### 5.7 Detalle del evento (sheet opaco con snap / fullscreen)

```
│ ── handle ──                          │ snaps 50% / 100%; swipe-down cierra
│ [Cliente]  ☁ Sincronizado             │
│ Codelco — Planta Norte                │
│ Mié 22 jul · 09:00–10:00              │
│ 👥 Lizeth ✓ · Jorge ? · +1 externo    │ estados RSVP
│ 📍 Av. Apoquindo 4501  [Cómo llegar]  │ deep-link Maps
│ 🔗 Negocio: Renovación 2026 ▸         │
│ 📝 Notas…                             │
│ ┌──────────┬──────────┬─────────┐    │ acciones sticky, safe-area
│ │Reprogramar│ Completar│ Cancelar │    │ (Dialog DS, no confirm())
└──────────────────────────────────────┘
```

**Requisitos transversales confirmados en el diseño:** pull-to-refresh (compatible PWA: solo cuando `scrollTop===0`), estados loading (skeleton filas), empty ("Día libre + CTA"), offline (banner + última data cacheada + cola de cambios `pending`), error (retry), push por próximo/cambio/cancelación/invitación con deep link `/opai/agenda/evento/[id]`, light+dark, VoiceOver: cada fila `role="button"` con label "Evento, título, hora, con N participantes".

---

# Parte 6 — UX desktop objetivo

- **Header 1 línea:** `Agenda · ‹ 21–27 jul › · [Hoy]` + vistas + búsqueda + Crear (retirar PageHero grande de la experiencia; mantenerlo solo si se desea en un dashboard de agenda separado).
- **Rail izquierdo colapsable (240px):** mini-calendario (salto de fecha), "Mis calendarios" (fuentes OPAI: visitas/técnicas/tareas/licitaciones + calendarios Google con toggle y color — resuelve E16/panel ausente), equipos guardados.
- **Inspector colapsable** on-select (no permanente vacío); ancho 360px; edición inline completa (participantes, RSVP, notas).
- **Vistas:** agenda / día / semana / mes / **equipo** (columnas por persona con free/busy overlay) / recursos (fase tardía).
- **Overlay de disponibilidad:** sombreado busy de participantes seleccionados sobre la grilla al crear.
- **Combinar/separar calendarios:** toggle "superpuesto" vs "lado a lado" en vista equipo.
- **Drag/resize:** conservar lo actual (funciona bien) + **click-drag en slot vacío = quick create** con popover (título+hora+participantes, Enter guarda).
- **Atajos:** `T` hoy, `D/W/M/A` vistas, `←/→` navegar, `C` crear, `E` editar selección, `⌫` cancelar (con Dialog), `/` buscar, `Esc` cerrar.
- **Multi-select + acciones masivas:** shift-click → reasignar/mover día (solo fuentes movibles).
- **Densidad adaptable:** compacta (48px/h) / normal (84px/h actual) / cómoda; persistida.
- **Persistencia separada:** `opai-agenda-prefs-desktop` vs `-mobile` (corrige B13); horario visible configurable (default 07-21, rango completo disponible — corrige B8).

---

# Parte 7 — Decisión de motor visual

| Criterio | FullCalendar | React Big Calendar | Schedule-X | Mobiscroll | Renderer propio (actual) |
|---|---|---|---|---|---|
| Licencia/costo | Core MIT; **Premium (resources/timeline) US$480+/año** | MIT | Core MIT; premium de pago | **Comercial** (US$~600+/dev/año) | US$0 |
| Next.js 15/React 19 | Buena (wrapper oficial React) | Buena, proyecto de mantenimiento lento | Buena, moderno | Buena | Nativa |
| Mobile | Regular (grilla desktop-céntrica; vista list sí existe) | Débil | **Buena** (pensado responsive) | **Excelente** | Hoy mala; a construir |
| A11y | Media | Baja | Media | Alta | Bajo control propio (hoy media) |
| Drag/resize | ✅ | ✅ básico | ✅ | ✅ | ✅ ya implementado con dnd-kit |
| Recurrencia render | ✅ (rrule plugin) | Manual | Parcial | ✅ | Manual |
| Recursos/equipo | ✅ **solo premium** | Manual | Premium | ✅ | Manual |
| Time zones | ✅ | Regular | Regular | ✅ | Ya resuelto con date-fns-tz Chile |
| Virtualización | Parcial | ❌ | Parcial | ✅ | Manual (hoy innecesaria: ≤~200 items/rango) |
| Personalización DS v3/Liquid Glass | Media (CSS override pesado; clases propias chocan con guard DS → requeriría `@ds-allow-legacy`) | Media | Media-alta | Baja (theming propio) | **Total** |
| Mantenimiento | Externo activo | Externo lento | Externo joven | Vendor | Interno (~1.2k líneas actuales, legibles) |
| Riesgo migración | Alto: rehacer eventos custom (avatars, sync icons, tonos), pelear con guard DS, bundle +~90-150KB | Alto y con techo bajo | Medio | Medio + costo | Cero |

**Recomendación argumentada `[RECOMENDACIÓN]`:** **mantener renderer propio, con arquitectura de dos renderers sobre un mismo dominio**:

1. **Móvil:** renderer OPAI nuevo para Agenda/Día/Mes táctil (Parte 5). Son listas y grids CSS simples — una librería no aporta nada aquí y todas las evaluadas son peores en móvil que un diseño ad-hoc; además el guard DS y Liquid Glass hacen caro "vestir" una librería externa.
2. **Desktop:** conservar y evolucionar `AgendaCalendarGrid` (el motor timed/columnas/dnd ya está bien resuelto — `agenda-calendar-utils.ts:192-245` es correcto). Adoptar FullCalendar Premium **solo si** la vista recursos/timeline multi-recurso se vuelve requisito duro (Ola 3+); es el único punto donde el build interno se encarece de verdad.
3. **Compartido:** `calendar-domain` (rangos, layout, TZ, RRULE via `rrule` lib) + servicios (Parte 4) alimentan a ambos. Ningún renderer habla con Prisma ni con Google.

Costo evitado hoy: US$0 licencias, sin nueva dependencia pesada, sin pelea con el design system. Puerta abierta documentada para FullCalendar en recursos.

---

# Parte 8 — Seguridad, calidad y performance

| Área | Estado | Evidencia | Acción |
|---|---|---|---|
| Tenant isolation | ✅ consistente | §1.8 | Mantener; test de regresión cross-tenant |
| RBAC | 🔴 asimétrico página vs API; sin ownership | B1 | Middleware `requireCrmView` en `/api/agenda*`; regla "editar: organizador, owner o admin" |
| Privacidad de eventos | 🔴 inexistente (todo el tenant ve todo) | §1.8 | `visibility` en modelo v2; Google items solo del espectador (ya es así) |
| Acceso a calendarios de terceros | ✅ nunca se leen calendarios de otros usuarios (solo el propio) | `google-events.ts:113-118` | Mantener; vista equipo usará freebusy, no lectura de eventos |
| Tokens OAuth | ✅ cifrados (`accessTokenEnc/refreshTokenEnc`) | `schema.prisma:11849-11850` | OK |
| Scopes | ✅ mínimos (`calendar.events` + `calendar.readonly`), consentimiento aislado sin fusión de grants | `scopes.ts:17-24`, `oauth/start/route.ts:37-42` | OK |
| Webhook authenticity | 🟡 HMAC del token ✅, pero sin validar `x-goog-resource-id` contra el cursor, y resolución O(n) global | B3 | `CalendarSyncCursor` indexado por `channelId` + verificación resourceId |
| Auditoría | 🟡 solo completar-con-deal | C12 | `CalendarAuditEvent` |
| Info sensible en notificaciones | 🟡 payload de evento incluye contactos con teléfono/email en la descripción Google | `calendar-payloads.ts:41-49` | Aceptable (calendario del responsable); no incluir en push públicos |
| Rate limits | ❌ ninguno propio; Google 429 no manejado distinto de error genérico | `calendar.service.ts:110-121` | Backoff exponencial + respetar `Retry-After` |
| Retry/DLQ | 🟡 retry cap 20 best-effort, sin backoff/DLQ | `agenda-retry-pending.ts` | Outbox por versión (Parte 4) |
| Duplicados | 🟡 dedupe lectura OK; escritura idempotente solo por link 1:1; sin ETag | §1.6 | ETag/If-Match en v2 |
| Idempotencia | 🟡 parcial | idem | Clave natural por (event,provider,account) |
| TZ y DST | 🟠 B5 (creación browser-TZ), B6 (all-day sin zona); Chile cambia DST abril/septiembre — `fromZonedTime` lo maneja, pero los tests no cubren fechas de cambio | utils + tests actuales | Test suite DST (5-6 abril / 6-7 sept 2026) + fix B5/B6 |
| Recurrencia | ❌ | E11 | v2 |
| N+1 / queries | 🟡 sin N+1 clásico, pero 3 full-scans por request (B9); 5 queries paralelas OK | `agenda-list.ts:19-66` | Scoping por rango/fuente; select mínimo |
| Límites arbitrarios | 🟠 60 eventos / 6 calendarios silencioso (B10); 500 tareas; horario 07-21 (B8) | citadas | Avisar truncamiento; paginar; rango 0-24 |
| Caché | 🟡 Map in-memory 5' (B11) | `google-events.ts:13-14` | Cache por request + `revalidate`/KV si hace falta; invalidar al escribir |
| Virtualización | No necesaria hoy (≤~200 items) | — | Revisitar en vista mes densa/equipo |
| Métricas y Sentry | 🟡 Sentry global existe (AGENTS.md); agenda solo `console.warn/error` sin contexto | `google-events.ts:151`, `calendar.service.ts:120` | `Sentry.captureException` con tags `{tenantId, sourceType}` + métrica de sync lag |

**Presupuestos de performance (objetivo, medibles):**
- Primera agenda móvil utilizable **<2s** en 4G (hoy: payload agenda+licitaciones+users en paralelo, sin streaming — factible con vista Agenda ligera y `Suspense`).
- Cambio de día percibido **<150ms** con caché de rango prefetcheado (prefetch día±1).
- Drag/scroll **60fps** desktop (dnd-kit ya usa transform; mantener; evitar re-layout por minuto — hoy `nowMinute` re-renderiza cada 60s toda la grilla: memoizar columnas).
- **CLS ≈ 0** (skeletons con altura fija).
- **0 scroll horizontal accidental** 320-430px (criterio de aceptación automatizable con Playwright viewport).
- Touch targets **≥44px** (ya cumplido; mantener guard).

---

# Parte 9 — Roadmap por PR

> Todos: rama feature, gate `npx prisma generate && npx tsc --noEmit` por bloque, preview Vercel, sin merge sin aprobación de Carlos. Migraciones solo aditivas; flags por tenant/usuario.

### Ola 1 — Móvil usable + seguridad (valor visible sin tocar el modelo)

| ID | Objetivo | Archivos probables | Migr. | Flag | Dep | Riesgos | Aceptación | Pruebas | Rollback |
|---|---|---|---|---|---|---|---|---|---|
| **PR-01** Seguridad API agenda | RBAC `canView(crm)` en `/api/agenda*` + ownership en PATCH/DELETE (organizador/admin) | `api/agenda/**/route.ts`, `lib/api-auth-crm` | No | No | — | Romper flujos de otro rol que hoy dependan del hueco | Usuario sin CRM: 403; usuario normal no cancela visita ajena | Vitest de rutas con sesiones mockeadas | Revert PR |
| **PR-02** Mobile shell + vista Agenda | Header compacto sticky, tira de fechas, lista cronológica default en `<lg`, FAB safe-area; grilla actual queda solo ≥lg | `AgendaPageClient.tsx`, nuevo `AgendaListView.tsx`, `AgendaMobileHeader.tsx`; borrar `AgendaWeekStrip/DayColumn` muertos | No | `agenda_mobile_v2` (localStorage/env) | PR-01 | Regresión desktop (aislar por breakpoint) | 0 scroll-x en 320-430; primer evento visible sin scroll en 390×844 | Playwright viewports + unit de agrupado por día | Flag off |
| **PR-03** Día móvil 1 columna + Mes táctil | Día full-width swipeable; mes fluido sin `min-w`; horario 0-24 con auto-scroll | `AgendaCalendarGrid.tsx` (split `MobileDayView`, `MobileMonthView`) | No | idem | PR-02 | Gestos swipe vs scroll | Semana/multi ocultas <lg; mes sin overflow | Playwright | Flag off |
| **PR-04** Detalle móvil sheet real | Bottom-sheet snap 50/100, handle, safe-area, Dialog DS para cancelar (fuera `confirm()`), foco/Escape | `AgendaInspector.tsx`, nuevo `AgendaDetailSheet.tsx` | No | idem | PR-02 | z-index con BottomNav | Sheet sobre nav sin solaparse visualmente; VoiceOver navega | axe + Playwright | Flag off |
| **PR-05** Fixes TZ + notificación asistentes | `dateAtChileSlot` en creación (B5); `timeZone` explícita en payload; `sendUpdates:"all"` también en patch (B4); all-day helper con zona (B6) | `useNuevaVisita.ts`, `calendar-payloads.ts`, `calendar.service.ts`, `google-events-helpers.ts` | No | No | — | Emails de update a asistentes existentes (deseado) | Test DST abril/sept; visita creada desde browser UTC cae a la hora Chile correcta | Vitest TZ | Revert |
| **PR-06** Prefs separadas + horario visible | Claves desktop/móvil; rango horario configurable | `AgendaPageClient.tsx`, `agenda-calendar-utils.ts` | No | No | PR-02 | — | 6-días en desktop no afecta móvil | Unit prefs | Revert |

### Ola 2 — Modelo v2 + participantes internos (el requisito prioritario)

| ID | Objetivo | Archivos | Migr. | Flag | Dep |
|---|---|---|---|---|---|
| **PR-07** Modelo `CalendarEvent` + participantes + links + cursors + audit | Migración **aditiva** (Parte 4), servicios `calendar-domain`, backfill script idempotente (sin retirar legacy) | `prisma/schema.prisma`, `src/modules/calendar/**` | ✅ aditiva | `calendar_v2` | PR-01 |
| **PR-08** Composer general de eventos | Fullscreen móvil / dialog desktop; tipos evento+visita; escribe v2 (+legacy doble escritura) | `components/calendar/EventComposer*` | No | idem | PR-07 |
| **PR-09** Invitación de usuarios OPAI | Typeahead tenant-scoped, roles required/optional, RSVP interno + badge "invitaciones pendientes"; sync: link por participante, **reasignación sin delete+recreate (fix B2)** | `calendar-sync.service.ts`, participant UI | No | idem | PR-07,08 |
| **PR-10** Free/busy + conflictos | `freebusy.query` Google + eventos OPAI; aviso inline en composer; Scheduling Assistant básico | `calendar-availability.ts`, composer | No | idem | PR-09 |
| **PR-11** Sync bidireccional v2 | Webhook → cursors indexados (fix B3), 410 GONE → full resync, ETag, outbox con backoff, lectura RSVP externos | webhook, cron, sync service | No (usa PR-07) | idem | PR-07 |
| **PR-12** Push + deep links | Ruta `/opai/agenda/evento/[id]`; push (próximo/cambio/cancelación/invitación) sobre `push-sender` existente; badge PWA | `app/(app)/opai/agenda/evento/[id]`, `lib/notifications` | No | `agenda_push` | PR-09, infra push |

### Ola 3 — Profundidad

| ID | Objetivo | Dep |
|---|---|---|
| **PR-13** Recurrencia RRULE (crear/editar/excepciones, sync Google recurrence) | PR-07/11 |
| **PR-14** Desktop density: header 1 línea, rail mini-calendario + toggles de calendarios, inspector colapsable, quick-create drag, atajos | PR-02 |
| **PR-15** Vista equipo (columnas por persona + overlay disponibilidad) | PR-10 |
| **PR-16** Meet/conferenceData + ICS export/subscribe | PR-11 |
| **PR-17** Scheduling links + round-robin (Cal.com-like, público) | PR-10; XL, evaluar antes valor comercial |
| **PR-18** IA: creación NL en español vía OPAI Intelligence tool + reprogramación sugerida | PR-08/10; regla "Verdad Verificada" |
| **PR-19** Retiro legacy `AgendaVisita`→vista, `AgendaEventLink` frozen | Todo v2 estable; **PR aislado irreversible con aprobación explícita** |

---

# Parte 10 — Resultado ejecutivo

### 10.1 Diagnóstico (10 puntos)

1. En móvil no existe una experiencia móvil: es la grilla desktop de 3 columnas (476px mínimos) dentro de un contenedor con doble scroll de 70vh — la causa exacta de columnas cortadas, "zonas vacías" y superposiciones que reporta el owner.
2. El modelo de datos es "una visita con un responsable"; no existe el concepto de evento con múltiples participantes internos — el requisito prioritario (agendar usuarios OPAI, separar responsable de invitados) es hoy imposible sin cambio de modelo.
3. Reasignar responsable destruye y recrea el evento Google (pierde RSVP, spamea invitados y puede hacer desaparecer el evento).
4. Reprogramar no notifica a los asistentes (falta `sendUpdates` en patch).
5. Las APIs de agenda no aplican RBAC ni ownership: cualquier usuario del tenant edita/cancela lo de cualquiera.
6. La entrada desde Google es frágil: cap 60 eventos silencioso, webhook con scan global cross-tenant, syncToken sin manejo de expiración, estado de sync guardado en un JSON sin schema.
7. Hay dos bugs de zona horaria latentes (creación en TZ del navegador; all-day sin zona) que hoy no explotan solo porque todos operan desde Chile.
8. La grilla oculta todo lo que ocurra antes de las 07:00 o después de las 21:00.
9. Cero notificaciones push/badge/deep-link de agenda pese a que la infraestructura PWA completa ya existe en el repo.
10. Lo bueno: tenant isolation impecable, OAuth con scopes mínimos y tokens cifrados, DS v3 sin drift, motor drag/resize desktop sólido, y una capa de utilidades TZ-Chile correcta — hay base real sobre la cual construir.

### 10.2 Qué debe mantenerse
Modelo `AgendaEventLink` como patrón (evoluciona a ProviderLink), utilidades `dates-cl`/`agenda-calendar-utils` (layout de columnas y anclaje Chile), motor dnd-kit desktop, OAuth aislado + scopes, toolbar y sistema de filtros, integración licitaciones/tareas como fuentes, tokens DS.

### 10.3 Qué debe reemplazarse
La experiencia móvil completa (grilla→Agenda/Día/Mes nativos), el modelo `assignedUserId` único (→participantes), el flujo de reasignación delete+recreate, el estado de sync en `prefs Json` (→`CalendarSyncCursor`), el inspector-overlay móvil (→sheet real), `confirm()` nativo, la clave única de prefs, el default `multi/3`.

### 10.4 Diez gaps más críticos
1. Vista Agenda móvil (P01) · 2. Participantes internos múltiples (E03) · 3. RBAC/ownership API (B1) · 4. Reasignación no destructiva (B2/O10) · 5. Free/busy + conflictos (C04/C05) · 6. Notificación en updates (B4/C07) · 7. Sync inbound robusto (B3/I06) · 8. Push + deep links (I07/I09) · 9. RSVP interno (E06) · 10. Recurrencia (E11).

### 10.5 Quick wins (≤1 día c/u)
`sendUpdates` en patch · RBAC en rutas agenda · fix TZ creación · prefs separadas + default móvil "day" mientras llega Agenda-list · rango horario 0-24 · borrar código muerto WeekStrip/DayColumn · reemplazar `confirm()` por Dialog DS · aviso de truncamiento "+N eventos Google no mostrados" · Sentry con contexto en sync.

### 10.6 Arquitectura objetivo (resumen)
`CalendarEvent` canónico + participantes con rol/RSVP + `CalendarProviderLink` por participante + `CalendarSyncCursor` indexado + outbox versionado; dominio compartido `calendar-domain`; dos renderers (móvil OPAI nativo, desktop grilla propia evolucionada); Google como espejo por participante, nunca como condición de existencia del evento; Microsoft y recursos como extensiones del mismo contrato.

### 10.7 Roadmap recomendado
Ola 1 (PR-01…06): seguridad + móvil usable + fixes de sync — 100% valor visible, sin migraciones. Ola 2 (PR-07…12): modelo v2, participantes, disponibilidad, sync robusto, push. Ola 3: recurrencia, vista equipo, densidad desktop, scheduling links, IA.

### 10.8 Riesgos
(1) Migración legacy→v2 con doble escritura: riesgo de divergencia — mitigar con backfill idempotente + comparador nightly. (2) Cambios de notificación (PR-05) enviarán emails a asistentes existentes al primer patch — comunicar. (3) Google API quotas al pasar a link-por-participante — outbox con backoff obligatorio. (4) Flag `calendar_v2` mal scoping podría mezclar lecturas — flags por tenant, Gard primero. (5) DST Chile (abril/sept) — suite de tests dedicada antes de Ola 2.

### 10.9 Decisiones que necesita tomar el owner
1. ¿Invitar internos como *attendees* del evento del organizador (1 evento Google, RSVP nativo) o *copia por participante*? — recomendación: attendees cuando todos tienen Google, copia como fallback.
2. ¿Privacidad por defecto de eventos nuevos: `tenant` (como hoy) o `participants`?
3. ¿Semana en móvil: eliminarla o dejarla opt-in landscape?
4. ¿FullCalendar Premium para vista recursos (US$480+/año) o build interno cuando llegue Ola 3?
5. ¿Scheduling links públicos (PR-17) entra al roadmap comercial de Opai o se pospone?
6. Presupuesto de notificaciones: ¿push + email + Slack o solo push+Slack v1?

### 10.10 Scorecard (0–10)

| Dimensión | Actual | Objetivo | Justificación actual |
|---|---|---|---|
| Móvil | **2** | 9 | Grilla desktop comprimida; sin vista lista; doble scroll |
| Desktop | **6** | 9 | Grilla y dnd sólidos; sin mini-cal, equipo, atajos, quick-create |
| Colaboración | **2** | 8 | 1 responsable, sin RSVP/free-busy; contactos como attendees es lo único |
| Integraciones | **4** | 8 | Google out sólido; in frágil; sin Meet/ICS/MS |
| Operación OPAI | **6** | 9 | Vínculos CRM/instalación/licitación buenos; sin check-in/carga equipo |
| Seguridad | **4** | 9 | Tenant/OAuth ✅; RBAC API y privacidad ✗ |
| Accesibilidad | **4** | 8 | Labels y targets ✅; grid nav, foco, dialogs ✗ |
| Performance | **5** | 8 | Payloads con full-scans y caps silenciosos; render OK |

---

## Validación final de la auditoría

**Inspeccionado directamente:** los 20 componentes de `src/components/agenda/` (incl. subcarpeta `nueva-visita/` y tests), los 12 módulos de `src/modules/agenda/`, `calendar.service.ts`, `calendar-payloads.ts`, `scopes.ts`, `clients` (vía usos), las 8 rutas `api/agenda*`, `api/integrations/google-calendar/{start,callback,status}`, `api/webhook/google-calendar`, `api/cron/calendar-channel-renew`, `api/crm/users`, modelos Prisma `GoogleCalendarAccount`/`AgendaVisita`/`AgendaEventLink` (schema.prisma:11844-11925), `page.tsx` de agenda, `BottomNav.tsx` (z-index/safe-area), infraestructura push (`sw.js`, `push-sender`, `flush-push-outbox`), `AGENTS.md` completo y `docs/google-workspace-agenda-audit.md` (validado: sus afirmaciones sobre CrmDeal.ownerId→account.ownerId coinciden con `agenda-list.ts:122-126`).

**No verificado en esta sesión:** comportamiento runtime real (no se levantó dev server ni DB), tool de agenda en OPAI Intelligence (P07 marcado NV), migraciones SQL individuales de agenda (se leyó el schema consolidado), renderizado Liquid Glass en dispositivo físico, y cuotas reales de Google API del proyecto. Ninguna conclusión estructural depende de estos puntos.

**Hechos vs inferencias:** todos los ítems `[HECHO]` tienen cita archivo:línea del árbol en `main@52d0335`; las inferencias (caché serverless, hit-rate, riesgo DST) están marcadas y razonadas; las recomendaciones son opinión de arquitectura, no estado del repo.
