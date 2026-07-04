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
- [ ] **B3** — `NotesSection` en detalle de negocio (+ lead/cuenta donde falte);
      shortcut `opai_guardar` + modal + `CrmNote` + archivos a R2.
      COMMIT `feat(crm+slack): notas visibles en negocios y guardado desde cualquier mensaje`
- [ ] **B4** — Channel Expert: contexto dual (canal B8 + ficha del deal) en el runner.
      COMMIT `feat(slack): el bot responde con contexto del canal y del negocio`
- [ ] **B5** — Ciclo de vida won/lost → celebración/post-mortem + archivo/handoff.
      COMMIT `feat(slack): cierre de sala con handoff a operaciones`
- [ ] **B6** — Gobernanza (exclusión de canales) + QA matriz + docs.
      COMMIT `docs(slack): fase 16 deal rooms`

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
