# Deal Rooms — la sala de guerra de cada negocio (Fase 16)

Los negocios que importan ganan su propio canal de Slack ligado al `CrmDeal`:
ficha viva fijada, todos sus eventos cayendo a la sala, notas guardables desde
cualquier mensaje, y el bot respondiendo con contexto de conversación + CRM. Al
ganar, la sala hace el handoff a operaciones.

## Modelo

`CrmDealSlackRoom` (schema `public`, tabla `crm_deal_slack_rooms`):

| campo | nota |
|---|---|
| `dealId` | **único** — una sala por negocio |
| `slackChannelId` / `slackChannelName` | canal privado `neg-{slug-cliente}` |
| `fichaTs` | ts del mensaje-ficha fijado (`pins.add`), re-editado con `chat.update` |
| `status` | `OPEN` \| `ARCHIVED` (al archivar se conserva el registro para historia) |
| `createdBy` | admin (cuid) que abrió la sala |

## Activación (nunca masiva)

1. **Manual** — botón "Abrir sala del negocio":
   - Web: header del detalle del negocio → `POST /api/integrations/slack/deal-room`.
   - Slack: `/opai pipeline` → drill → menú del deal → "🏠 Abrir sala del negocio".
2. **Automática por umbral** — `maybeAutoOpenDealRoom`, gatillada desde
   `changeDealStage` en movimientos vivos. Config por tenant en `Setting`
   (category `slack_deal_rooms`): `{ enabled, minAmountClp, minStageOrder }`.
   **Default APAGADO** (Carlos calibra a mano primero). Umbrales configurados
   actúan como AND; los que quedan en 0 no bloquean.
3. **Nunca** por lead ni por cotización individual.

`openDealRoom(tenantId, dealId, actorAdminId)`: crea el canal privado, invita al
actor + al owner del negocio (owner ⇒ `account.ownerId`, los que estén vinculados
a Slack), publica la **ficha viva** y la fija, guarda el map y audita. Idempotente
por `dealId` (unique + captura P2002).

## Ficha viva

Primer mensaje de la sala, fijado: `cliente · monto · etapa · cotización activa ·
próxima tarea · owner`, con botones **Avanzar etapa · WhatsApp · Nota · Abrir en
OPAI**. Se re-edita con `chat.update` (`refreshDealRoomFicha`) tras **cada** evento
del negocio que cae en la sala.

## Ruteo del negocio a su sala

`dispatch.ts`: si el evento trae `dealId` con sala **OPEN**, el destino es LA SALA
**en vez** del canal de categoría (para no duplicar). Eventos que fluyen: cotización
(`quote_viewed/accepted/rejected`, ya traen `dealId`), `deal_stage_changed`,
`deal_won`, `deal_lost`. Las notas del negocio también se espejan
(`mirrorDealNoteToRoom`, desde la web y desde "Guardar en OPAI").

`deal_stage_changed` y `deal_lost` se agregaron al catálogo y se emiten desde
`changeDealStage` (el servicio real de transición). `deal_won` ya existía.

## Guardar en OPAI

Shortcut de mensaje `opai_guardar`:
- Si el canal **es** una sala → nota directa al deal (1 clic + texto opcional);
  confirmación en el hilo del mensaje.
- Si no → buscador `external_select` (cuenta / negocio / lead) vía `block_suggestion`.

Escribe `CrmNote` polimórfica con el **autor real** y un **link permanente** al
mensaje de Slack (`chat.getPermalink`). Los archivos adjuntos se suben a R2
(`ingestSlackFiles`) y se linkean en el contenido. Si el deal tiene sala, la nota
se espeja.

Las notas ahora se ven en la web: `NotesSection` montada (pestaña "Notas") en el
detalle de **Negocio**, **Cuenta** y **Lead** (`entityType="lead"` agregado a los
allow-lists de la API, el componente y el deep-link).

## Channel Expert

Cuando el bot es invocado en una sala (mención, DM o `/opai`), el runner recibe un
`contextHint` con **doble contexto**: conversación reciente de la sala (B8, sin
persistir) + ficha del deal (datos CRM en vivo). "¿En qué quedamos con Etex?" se
responde mezclando ambos. Respeta SIEMPRE la lista de canales excluidos.

## Ciclo de vida

- **won** → la tarjeta de cierre en la sala (🎉 + resumen del bot desde la
  conversación) con botones **Convertir en canal de operación** / **Archivar**.
- **lost** → mini **post-mortem** redactado desde la conversación + **Archivar**.
- **Archivar** = `conversations.archive` + `status=ARCHIVED` (map conservado).
- **Handoff** = renombra a `op-{slug}` y ofrece el link a la operación
  (`ClientOnboarding`) creada al ganar — el traspaso comercial→ops.

## Gobernanza

Lista de canales excluidos de lectura del bot (`Setting`, category
`slack_governance`, key `slack_governance.excluded_channels`), editable en el panel
Slack de OPAI. El B8 (`readChannelContextForTool`) y el Channel Expert la respetan
SIEMPRE: un canal excluido → el bot **declina** leerlo.

## Paso manual (Slack dashboard)

Scopes del bot: `channels:manage`, `groups:write` (crear salas privadas),
`pins:write` (fijar la ficha), `files:read` (ya presente, adjuntos). Message
shortcut: **"Guardar en OPAI"** (`callback_id` `opai_guardar`). Guardar →
**Re-autorizar** (el token guardado se refresca con los scopes nuevos).
