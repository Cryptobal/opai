# Tipos de Ticket — cadena, responsable por defecto y acciones masivas (Fase 11)

Configuración en **`/opai/configuracion/tipos-ticket`**. La entidad es `OpsTicketType`; la
cadena de aprobación vive en `OpsTicketTypeApprovalStep` (`stepOrder` ordena los pasos).

## Responsable por defecto (`defaultAssignedToUserId`)

El campo existía en el schema pero `createOpsTicket` lo **ignoraba**, así que los tickets
nacían huérfanos (≈145 sin responsable). Fix raíz (Fase 11):

- `createOpsTicket` ahora, si el input **no** trae `assignedTo`, hereda
  `ticketType.defaultAssignedToUserId`, **validando** que ese admin siga **activo** en el
  tenant. Si no está activo → `null` + `console.warn` (no rompe la creación).
- Aplica automáticamente a **todos los orígenes** (web, portal cliente, email inbound, Slack,
  IA, hallazgos de supervisión) porque todos pasan por el mismo servicio.

### Edición

- **Formulario completo** (crear / editar tipo): selector "Responsable por defecto (opcional)".
- **Inline en la tabla** (Fase 11): columna **"Responsable"** con un popover de búsqueda de
  admins activos del tenant. Guarda al elegir contra `PATCH /api/ops/ticket-types/[id]`.

## Cadena de aprobación (inline)

La celda **"Cadena"** de la tabla abre un popover para editar los pasos sin entrar al
formulario completo:

- Agregar / quitar / **reordenar** (subir/bajar) pasos.
- Cada paso es **grupo** (`AdminGroup`) o **usuario** (`Admin`).
- Guarda al confirmar contra `PATCH /api/ops/ticket-types/[id]` con `approvalSteps`
  (el endpoint **borra y recrea** los pasos) + `requiresApproval` derivado (hay pasos → true).
- Estado tri-estado (spinner) mientras guarda.

## Acciones masivas (batch)

Checkbox por fila + "seleccionar todos" por sección → barra flotante **"Aplicar a N tipos"**:

- **Fijar cadena** (misma cadena a los N).
- **Fijar responsable por defecto**.
- **Fijar prioridad**.

Un solo `PATCH /api/ops/ticket-types/batch` (tenant-scoped, reusa la validación del `[id]`:
ids del tenant, admin activo, prioridad válida, cada paso con su referencia). La cadena se
aplica en transacción (deleteMany + createMany por cada id).

## Backfill de históricos (pendiente de decisión humana)

El fix raíz cubre los tickets **nuevos**. Para los históricos huérfanos existe
`scripts/backfill-ticket-assignees.ts`:

```
npx tsx scripts/backfill-ticket-assignees.ts                      # dry-run (no escribe, no notifica)
npx tsx scripts/backfill-ticket-assignees.ts --commit             # asigna, SIN notificar
npx tsx scripts/backfill-ticket-assignees.ts --commit --notify    # asigna Y notifica a cada responsable
npx tsx scripts/backfill-ticket-assignees.ts --commit --tenant <tenantId>
```

Asigna el `defaultAssignedToUserId` del tipo a los tickets **abiertos/activos** sin
responsable cuyo tipo tenga un default **activo**. Anti-carrera (updateMany where
`assignedTo:null`) e idempotente.

> ⚠️ **NO se ejecuta automáticamente.** Queda para decisión de Carlos: asignar en masa
> dispara **una notificación por ticket** (≈145). Por eso el default es dry-run y las
> notificaciones vienen **apagadas** salvo `--notify` explícito.

## Referencias

- Servicio de creación: `src/lib/tickets-create.ts`
- API tipos: `src/app/api/ops/ticket-types/route.ts`, `[id]/route.ts`, `batch/route.ts`
- UI: `src/components/config/TicketTypesConfigClient.tsx` + `TicketTypeInlineEditors.tsx`
