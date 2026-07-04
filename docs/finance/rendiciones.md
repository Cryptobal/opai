# Rendiciones — flujo de aprobación

Máquina de estados de una rendición de gasto (`FinanceRendicion.status`) y quién
puede moverla. Los montos son enteros CLP (`amount`); el `submitterId` y los
aprobadores son `Admin.id` (cuid).

## Estados

`DRAFT → SUBMITTED → APPROVED → PAID` (camino feliz) · `SUBMITTED → REJECTED`.

- **DRAFT** — recién creada (web o modal de Slack `opai_nueva_rendicion` vía `createRendicion`).
- **SUBMITTED** — enviada a aprobación. El submit lee `FinanceRendicionConfig`
  (`defaultApprover1Id`/`defaultApprover2Id`) y crea una fila `FinanceApproval` por aprobador
  (`decision = null`). Si no hay aprobadores y `autoApproveWhenNoApprovers = false`, el submit se
  **bloquea** (409 `NO_APPROVERS_CONFIGURED`) para evitar el salto silencioso a pago sin revisión.
- **APPROVED** / **REJECTED** — decisión. **Solo** desde `SUBMITTED`.
- **PAID** — pagada (flujo de pagos).

> `IN_APPROVAL` existe en el enum del schema pero **ningún** camino lo escribe hoy.

## Aprobar / Rechazar — servicio único

Toda la transición vive en `src/lib/rendiciones-approvals.ts` (extraído del inline de los routes en
Fase 13 para reutilizarlo desde Slack sin duplicar la máquina de estados). El control de acceso es del
**caller**; la capability es `rendicion_approve`.

- `approveRendicion({ tenantId, actorId, actorName, rendicionId, comment? })`
  - Guard: `status === "SUBMITTED"`; anti-carrera con `updateMany where status="SUBMITTED"` (si otro
    aprobó primero → `alreadyDecided`).
  - Marca todas las `FinanceApproval` pendientes como `APPROVED`, mueve la rendición a `APPROVED`,
    escribe `FinanceRendicionHistory` (`metadata.fullyApproved`), `logAudit` y notifica al solicitante
    (email dedicado + evento `rendicion_approved`).
- `rejectRendicion({ tenantId, actorId, actorName, rendicionId, reason })`
  - Motivo **obligatorio**. Marca la propia `FinanceApproval` como `REJECTED`, mueve a `REJECTED`
    con `rejectedAt`/`rejectionReason`/`rejectedById`, historial, `logAudit`, y notifica
    (`rendicion_rejected`, con el motivo).
- Lecturas para las bandejas: `listRendicionesPendingApproval` / `countRendicionesPendingApproval`
  (rendiciones `SUBMITTED` con una `FinanceApproval` asignada al admin y sin decisión).

Los routes web (`POST /api/finance/rendiciones/[id]/{approve,reject}`) y los handlers de Slack
(bandeja unificada + tarjetas accionables) llaman **exactamente** a estas funciones.

## Trail

Cada transición escribe una fila en `FinanceRendicionHistory`
(`action`/`fromStatus`/`toStatus`/`userId`/`userName`/`comment`/`metadata`). El historial es la
fuente de verdad de la auditoría del ciclo de vida; `logAudit` complementa con la traza de compliance.

## En Slack (Fase 13)

- Al enviar (`SUBMITTED`) se emite `rendicion_submitted` a los aprobadores → tarjeta con
  **Aprobar/Rechazar** en el canal ruteado + entrada en la bandeja `/opai aprobaciones`.
- El solicitante ve el estado en `/opai rendiciones` ("🧾 Mis rendiciones") y recibe la decisión.
- Detalle del transporte en `docs/integrations/slack.md` (Fase 13).
