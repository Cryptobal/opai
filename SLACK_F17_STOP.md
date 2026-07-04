# SLACK F17 — Pulido del cockpit comercial

Pulido sobre F15 (cockpit) y F16 (deal rooms), ambos en producción. Efímeros de
progreso sin huérfanos, filas de negocio completas en el drill del pipeline, y
puente directo a las salas.

## Progreso por bloque

- [x] **B1** — Efímeros de progreso mutan o desaparecen (cero huérfanos).
      `slackRespondUrl` acepta `delete_original`. `openModalByCallback` devuelve
      `boolean` (¿abrió el modal?). El slash `/opai` en camino de MODAL elimina el
      `⏳ Procesando…` del route vía `delete_original` (el modal ES el feedback);
      antes quedaba huérfano bajo un `📂 Abriendo…`. Camino de TEXTO ya mutaba
      (`replace_original`). Los avisos de `block_actions` son efímeros terminales
      (resultado) sobre tarjetas compartidas → NO se les aplica `replace_original`.
      COMMIT `fix(slack): efímeros de progreso mutan o desaparecen, cero huérfanos`
      ✅ gate OK (0 errores TS)

- [x] **B2** — Fila de negocio completa: `*Cuenta* · negocio · monto`. Botón URL
      `🔗 Abrir en OPAI` → `/crm/deals/{id}` (`getCanonicalSiteUrl`). Días-en-etapa
      con fallback a `createdAt` (nunca "—", caso Zelestra).
      COMMIT `feat(slack): filas del pipeline con cuenta, link a OPAI y días siempre calculados`
      ✅ gate OK

- [x] **B3** — Semáforo de frío (orden por días DESC + ⏱ 🟢<7 · 🟠 7-14 · 🔴>14),
      badge 🏠 + botón `🏠 Ir a la sala` (deep-link app.slack.com) / `🏠 Abrir sala`
      (reusa `openDealRoom`), overflow ≤5 (`📞 Llamar` tel + Avanzar/Nota/Ganado/
      Perdido), navegación `← Pipeline` (views.update). Límite WhatsApp/Llamar URL
      documentado (Slack no notifica clics de botón URL).
      COMMIT `feat(slack): drill del pipeline con semáforo de frío, salas y navegación`
      ✅ gate OK

- [x] **B4** — Matriz QA (Fase 17) + `docs/integrations/slack.md` actualizado.
      COMMIT `docs(slack): fase 17 pulido comercial`

**FASE 17 COMPLETA** — 4/4 bloques, gates verdes (`tsc --noEmit` 0 errores).
Falta correr la matriz QA en un workspace real (MCP Slack sin autorizar en la
sesión de Claude).

## Hallazgos de auditoría (para no re-auditar)

- El route de `/opai` (`commands/route.ts`) SIEMPRE ACK-ea con `⏳ Procesando tu
  consulta…`; `handleSlashCommand` corre en `after()`. Por eso el camino de modal
  necesita `delete_original` (no basta con "no enviar" un efímero: el del route ya
  salió).
- La ruta de interactividad (`interactivity/route.ts`) ACK-ea `{ok:true}` para
  `block_actions` — NO emite efímero de progreso; sus avisos son terminales.
- Slack limita el **overflow a 5 opciones** → los links de navegación (Abrir en
  OPAI, Ir a la sala, WhatsApp) van como botones, no en el overflow.
- Botones URL (`pipe_deal_open`, `pipe_deal_roomlink`, `pipe_deal_wa`) igual llegan
  al dispatch como `pipe_*`; `handlePipelineAction` los deja pasar (no-op) porque
  Slack ya abrió la URL en el cliente.
- `CrmDeal` usa `title` (no `name`); la cuenta es `account.name`. `enteredAt` sale
  de `CrmDealStageHistory` (último `toStageId == stageId`) con fallback `createdAt`.
