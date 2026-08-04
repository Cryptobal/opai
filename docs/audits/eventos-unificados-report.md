# Eventos unificados — reporte de implementación

Fecha: 2026-08-04  
Rama: `cursor/eventos-unificados-4a6c`

## Qué cambió

Un solo motor de escritura de eventos (`createOpaiEvent` / `updateOpaiEvent` / `cancelOpaiEvent` en `src/modules/calendar/calendar-write.ts`) usado desde:

- Ficha del negocio (`NuevaVisitaModal` → `POST/PATCH /api/calendar/events`)
- Copiloto de correo (`PlanMilestonesForm` → `createDealMilestoneEvent`)
- Agenda móvil y quick-create desktop
- Edición desde inspector / detail sheet (`EditEventDialog`)

Calendar v2 queda **incondicional**: se eliminó `calendar-flags.ts` y todas las ramas `isCalendarV2Enabled()`.

Migración aditiva: `agenda_visitas.label` + `agenda_visitas.all_day` (backfill desde `agenda_event_links`).

`OpsVisitaTecnica` queda desacoplada de Google Calendar (sin sync, sin CTA template duplicador, limpieza de `AgendaEventLink` al DELETE).

## Decisiones

1. **`AgendaVisita` sigue siendo fuente del listado**; `CalendarEvent` es espejo con `id` compartido.
2. Eventos nuevos con etiqueta libre → `type = "otra"` + `label`; `CalendarEvent.kind` = slug de la etiqueta.
3. Validación de tenant obligatoria en servidor para `accountId` / `installationId` / `dealId` / `participantIds` / `contactIds`.
4. Fallo de push a Google **nunca** revierte la escritura local.
5. Script de limpieza de links históricos solo en dry-run (`scripts/list-visita-tecnica-google-links.mjs`); **0** links con `googleEventId` en producción al momento de la auditoría.

## Auditoría B0 (hechos)

| Hecho | Resultado |
|---|---|
| Flag OFF por default en prod | Confirmado en código (`VERCEL_ENV !== "production"`). CLI Vercel sin token en el entorno del agente — no se pudo listar env Production. |
| Participantes gated por `if (v2)` | Confirmado en `deal-milestones.ts` (pre-cambio). |
| Consumidores extra del flag | `agenda-retry-pending.ts`, `flush-push-outbox/route.ts` — también migrados. |
| Links `visita_tecnica` con Google en Neon OpaiDB | **0** |

## Checklist QA manual (preview)

- [ ] Negocio → Agendar con invitados + Maps → aparece en card, agenda OPAI y Google con attendees
- [ ] Copiloto sobre cotización normal → "Eventos en agenda" visible → crea evento
- [ ] Copiloto licitación → 3 hitos precargados + 4.º libre
- [ ] Editar desde ficha: hora/dirección/quitar invitado → mismo `providerEventId`
- [ ] Reasignar responsable sin delete+recreate
- [ ] Agenda móvil con `dealId` → aparece en ficha
- [ ] CPQ solicitar visita técnica → sin Google / sin CTA template
- [ ] DELETE visita técnica → sin `AgendaEventLink` huérfano
- [ ] Invitado sin Google → notificación OPAI
- [ ] Móvil 375px formulario usable
- [ ] Permisos: sin agenda → 403; no creador/responsable/admin/organizer → 403 en PATCH

## Validaciones ejecutadas

- `npx prisma generate` — OK
- `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` — OK
- Vitest (calendar + agenda focused): 18/18 pass (suite parcial); suite completa no re-ejecutada íntegra en esta sesión
- `npm run check-ds:warn` — sin drift nuevo atribuible a archivos de este brief (avisos preexistentes en finance)

## Riesgos abiertos

1. Eventos legacy sin espejo `CalendarEvent` aún usan el path `AgendaEventLink` en `syncAgendaVisitaToCalendar`.
2. Links históricos `visita_tecnica`→Google (si aparecen en otro entorno): dry-run only; borrado requiere aprobación de Carlos.
3. QA manual en preview pendiente.
4. Mitigación inmediata pre-deploy: si el merge se demora, setear `CALENDAR_V2=1` en Production ya no aplica tras este cambio (el flag desapareció).
