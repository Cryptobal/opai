# SLACK_F13_STOP — Rendiciones y Turnos Extra en Slack + Bandeja de Aprobaciones Unificada

Gate por bloque: `npx prisma generate && npx tsc --noEmit`. Un commit c/u.

## Decisiones de auditoría (pre-implementación)

- **Rendiciones** (`FinanceRendicion`, schema 5948): status real `DRAFT|SUBMITTED|APPROVED|REJECTED|PAID`
  (`IN_APPROVAL` modelado pero nunca escrito). Solo `SUBMITTED` es accionable. Lógica de aprobar/rechazar
  vivía **inline** en `api/finance/rendiciones/[id]/{approve,reject}/route.ts` → **extraída** a
  `src/lib/rendiciones-approvals.ts`. Aprobadores por rendición = filas `FinanceApproval` (approverId, decision null),
  creadas al submit desde `FinanceRendicionConfig.defaultApprover1Id/2Id`. Capability: `rendicion_approve`.
  Trail: `FinanceRendicionHistory` (action/fromStatus/toStatus/userId/comment).
- **Turnos extra** (`OpsTurnoExtra`, schema 4390): status `pending|approved|rejected|paid`. Aprobar/rechazar
  inline en `api/te/[id]/{aprobar,rechazar}/route.ts` → **extraída** a `src/lib/te-approvals.ts`. NO hay
  asignación de aprobador (solo `createdBy`); "pendiente para mí" = todos los `pending` del tenant SI tengo
  capability `te_approve` (las rutas web hoy solo exigen `ensureOpsAccess` — el nuevo lib SÍ exige `te_approve`
  en los callers Slack; la web conserva su gate actual para no romper). Audit: acción `te.approved`/`te.rejected`.
- **Categorías**: se reutilizan las existentes `Finanzas - Rendiciones` y `Operaciones - Turnos` (el ruteo por
  categoría del F7.1 agrupa gratis; crear categorías nuevas fragmentaría el ruteo).
- **Control de acceso**: los libs asumen caller autorizado (patrón `rendiciones-create.ts`); cada caller
  (route web, handler Slack de bandeja, handler Slack de tarjeta) exige la capability real ANTES de llamar.

## Estado — **COMPLETO**

Gate `npx prisma generate && npx tsc --noEmit --incremental false` verde sobre el árbol final.
Nota: usar SIEMPRE `--incremental false` y leer el log real — el `... || echo TSC_FAIL` enmascara
el exit de tsc (un run temprano marcó falso-verde por eso; dos errores de tipo reales se corrigieron:
narrowing `"code" in r` en `reason-modal.ts` y cast `Prisma.InputJsonValue` en `te-approvals.ts`).

- [x] B1 — servicios reutilizables — `refactor(approvals): servicios reutilizables…`
- [x] B2 — catálogo + emisores — `feat(notifications): eventos de rendiciones y turnos extra`
- [x] B3 — bandeja unificada — `feat(slack): bandeja unificada de aprobaciones…`
- [x] B4 — mis rendiciones — `feat(slack): mis rendiciones…`
- [x] B5 — tarjetas accionables — `feat(slack): aprobar rendiciones y TEs desde la tarjeta…`
- [x] B6 — QA + docs — este commit

## Arquitectura entregada

- **Servicios** `src/lib/rendiciones-approvals.ts` + `src/lib/te-approvals.ts` (list/count/approve/reject),
  anti-carrera, historial/audit, emisores; consumidos por routes web y por Slack (cero duplicación).
- **Bandeja** `src/lib/integrations/slack/approvals/{inbox,inbox-actions,reason-modal,cards}.ts`:
  modal multi-dominio, rechazo con motivo compartido (inbox + tarjeta), paginación por sección.
- **Home** contador agregado (`countInbox`) de los tres dominios.
- **Mis rendiciones** `src/lib/integrations/slack/modals/mis-rendiciones.ts` (`/opai rendiciones`, hub, Home).
- **Tarjetas** `dispatch.ts` adjunta Aprobar/Rechazar a `rendicion_submitted`/`te_created`
  (SlackPendingAction `RENDICION_APPROVAL`/`TE_APPROVAL`), `chat.update` al decidir.

## QA (matriz en docs/integrations/slack.md §Fase 13 y docs/finance/rendiciones.md)

Verificación estática (tipos + lógica): capability por dominio exigida en CADA handler (bandeja
`inbox-actions`, tarjeta `cards`, modal de motivo `reason-modal`) — la UI oculta, el servicio manda.
Anti-carrera doble: `updateMany` con guard de estado en los servicios + `claimPending` atómico en la
tarjeta. Contador Home = suma real por capability. Prueba end-to-end en Slack requiere workspace vivo
(no ejecutable en este entorno) — matriz manual documentada.
