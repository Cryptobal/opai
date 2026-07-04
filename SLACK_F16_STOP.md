# SLACK F16 — Deal Rooms (la sala de guerra de cada negocio)

Sala de Slack por `CrmDeal` importante: ficha viva fijada, todos los eventos del
negocio caen a la sala, notas guardables desde cualquier mensaje, bot con doble
contexto (canal + CRM), y handoff a operaciones al ganar.

## Paso manual PREVIO (Carlos)
Manifest → scopes `channels:manage`, `groups:write`, `pins:write` (+ `files:read`
ya presente). Message shortcut "Guardar en OPAI" (callback_id `opai_guardar`).
Guardar → **Re-autorizar**.

## Progreso por bloque

- [x] **B1** — Modelo `CrmDealSlackRoom` + migración; servicio `openDealRoom`;
      botón manual (pipeline Slack + detalle web); umbral en `Setting` (default OFF).
      COMMIT `feat(slack): deal rooms con ficha viva` ✅ gate OK (0 errores TS)
- [x] **B2** — Ruteo del deal a su sala (cotizaciones + `deal_stage_changed`);
      `chat.update` de la ficha en cada cambio.
      COMMIT `feat(slack): todo el negocio fluye a su sala` ✅ gate OK
- [x] **B3** — `NotesSection` en detalle de negocio + cuenta + lead (allow-lists
      extendidas para "lead"); shortcut `opai_guardar` + modal (sala→directo /
      buscador external_select) + `CrmNote` con autor+permalink + archivos a R2
      (ingestSlackFiles) + espejo de notas a la sala. COMMIT `feat(crm+slack):
      notas visibles en negocios y guardado desde cualquier mensaje` ✅ gate OK
- [x] **B4** — Channel Expert: contexto dual (canal B8 + ficha del deal) en el
      runner (mención/DM + `/opai`); respeta exclusiones. COMMIT `feat(slack): el
      bot responde con contexto del canal y del negocio` ✅ gate OK
- [x] **B5** — Ciclo de vida won (🎉 + resumen + Archivar/Handoff) / lost
      (post-mortem del bot + Archivar); archive = conversations.archive + ARCHIVED;
      handoff = rename op-{slug} + link a la operación. COMMIT `feat(slack): cierre
      de sala con handoff a operaciones` ✅ gate OK
- [x] **B6** — Gobernanza: exclusión de canales (Setting + panel Slack + API);
      enforcement en B8 (`readChannelContextForTool`) y Channel Expert; matriz QA
      + `docs/integrations/slack.md` + `docs/crm/deal-rooms.md`. COMMIT `docs(slack):
      fase 16 deal rooms` ✅ gate OK

**FASE 16 COMPLETA** — 6/6 bloques, gates verdes. Falta solo el paso manual de
Carlos en el Slack dashboard (scopes + shortcut + re-autorizar) y correr la matriz
QA en un workspace real.

## Hallazgos de auditoría (para no re-auditar)
- `CrmDeal` usa `title` (no `name`), **sin `ownerId` ni `createdBy`**. Owner del
  deal ⇒ `account.ownerId` (fallback). Creador ⇒ el actor que abre la sala.
- `CpqQuote.dealId` directo. Eventos `quote_viewed/accepted/rejected` YA traen
  `dealId` en `data`. `quote_sent` NO se emite vía notify (solo history log).
- `changeDealStage` (`src/lib/crm/change-deal-stage.ts`) emite `deal_won` (con
  dealId) tras el commit. NO existe `deal_stage_changed` ni `deal_lost` como
  evento de notify → se agregan al catálogo y se emiten ahí.
- R2: reusar `ingestSlackFiles` (bridge-inbound-files) → `attachments[].fileUrl`
  permanente. `CrmNote` no tiene relación de archivos → link va en `content`.
  (Opcional: `CrmFile`+`CrmFileLink` entityType="deal" para el panel FileAttachments.)
- Runner `runHelpChatTurn` acepta `contextHint?: string` (system msg) → punto de
  inyección del doble contexto (B4).
- Config por tenant vía `Setting` (patrón `knowledge/config.ts`).

## Reglas
Gates `npx prisma generate && npx tsc --noEmit` por bloque · un commit c/u ·
títulos de modal ≤24 · action_id únicos · migraciones aditivas a mano.
