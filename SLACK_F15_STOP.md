# SLACK_F15_STOP — Cockpit Comercial en Slack: del lead a la cotización en minutos

Gate por bloque: `NODE_OPTIONS="--max-old-space-size=8192" npx prisma generate && npx tsc --noEmit --incremental false`.
Un commit c/u. Títulos de modal ≤24 (`modalTitle`/`clampModalTitle`, F14). action_id únicos por bloque `actions`.

> El gate `tsc` normal se queda sin heap en este entorno (iCloud offload) → usar `--max-old-space-size=8192`.
> Verificación end-to-end en Slack (clic real) NO ejecutable en esta sesión (MCP Slack sin autorizar);
> la QA de B7 queda como matriz/checklist manual, igual que F13/F14.

## Paso manual PREVIO (Carlos)
Manifest: scope `channels:join` + bot_event `channel_created`. Guardar y **Re-autorizar** (scope nuevo). Necesario para B8.

## Decisiones de auditoría (pre-implementación)

Arquitectura Slack = **registro declarativo**. Se agrega feature agregando una entrada a un registro
(`SUBCOMMANDS`, `MODALS`, `ACTIONS`) + (para UI nueva) una rama por-prefijo en `interactivity.ts`.

1. **Dispatch genérico, sin card-builders por tipo salvo tickets.** Para poner botones-cockpit en las
   tarjetas `new_lead` y `quote_viewed` se agrega una rama por-key en `dispatch.ts` (espejo de `ticket_*`).
   `toContextFields` descarta claves `*Id`/`url`/`token`/`phone` → los ids no se ven como campo; `phone`
   se renderiza como línea `📞 Llamar`.

2. **`quote_viewed` NO tiene emisor** (existe en catálogo, nadie lo emite; el portal trackea vistas en DB
   pero no notifica). B3 lo cablea: tracking de vista + `notify({type:"quote_viewed"})` enriquecido.

3. **`quote_sent` no se emite por `notify()`** (solo `crmHistoryLog action:"quote_sent_portal"` dentro de
   `sendQuoteToPortal`). B2 agrega un `notify({type:"quote_sent"})` único en `sendQuoteToPortal` (así el
   catálogo se activa y B7 valida "Enviar dispara quote_sent"). Enviar = `sendQuoteToPortal` (canónico, 1×).

4. **"Tomar" un lead** = estampar `firstContactAt` (corta el escalamiento — el cron `lead-escalation`
   filtra `firstContactAt: null`) + `firstContactBy` = quien presiona. "Sin tomar" = `firstContactAt: null`
   (reusa el índice `idx_crm_leads_escalation_scan`). Owner-proxy de un lead = `firstContactBy`. **Cero campos nuevos.**

5. **WhatsApp = botón URL `wa.me`** (apertura directa, un toque, funciona en iPhone). Los botones URL de
   Slack NO llaman de vuelta al server → no se puede loguear el clic exacto. La provenance queda en la
   acción trackeada acompañante (Tomar estampa `firstContactBy`). Mensaje resuelto por `getWaTemplate` +
   `EntityData` (mensaje real, no tokens crudos). Limitación documentada.

6. **`deal_won` no existe** → B4 lo agrega al catálogo y lo emite desde la rama "won" del cambio de etapa.

7. **Cambio de etapa**: no hay función de librería, solo `POST /api/crm/deals/[id]/stage`. B4 extrae el
   núcleo a un servicio compartido (`src/lib/crm/change-deal-stage.ts`) usado por Slack (y el route si es barato).

8. **`CrmTask` está modelado pero sin uso** (ningún `.create` en el árbol). B1 lo estrena para "Recordar en 2h".
   **`CrmNote.entityType` no admite `"lead"`** (validador del route) → actividad de lead vía `CrmHistoryLog`;
   notas de deal vía `CrmNote` (entityType `"deal"`).

9. **Follow-up engine (CrmFollowUpConfig + process-followup-log) está ACTIVO** (cron `followup-emails`
   cada 15 min, emails Resend). B5 le agrega una salida Slack + un sweep liviano de 48h (regla nueva,
   complementaria a los días configurados).

## Estado

- [x] B1 — Tarjeta-cockpit del lead + bandeja `/opai leads` — `6ba43522f`
- [x] B2 — Cotización en un clic desde el lead — **rama `feat/extract-lead-quote-engine` · PR #568** (NO en main; gate de paridad pendiente de Carlos)
- [x] B3 — quote_viewed accionable (momento caliente)
- [x] B4 — `/opai pipeline` + acciones de deal + `/opai cotizaciones` — `c0316fc98` (main; `changeDealStage` extraído del route en main con delegación + evento `deal_won`)
- [ ] B5 — Loop anti-olvido (seguimiento 48h)
- [ ] B6 — Digest comercial + Home comercial
- [ ] B7 — QA (matriz) + docs
- [ ] B8 — Presencia total en canales públicos + tool `slack_channel_context`
