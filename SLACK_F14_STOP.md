# SLACK_F14_STOP — Tickets en Slack: aplazar operativo, comentarios reales, hilo = feed, recordatorios sin spam

Gate por bloque: `npx prisma generate && npx tsc --noEmit`. Un commit c/u. ≤150 líneas, cero deps.

## Decisiones de auditoría (pre-implementación, confirmadas con el usuario)

- **B1/B2 ya existían en el árbol** (diagnóstico parcialmente stale):
  - `tcard_aplazar` YA está mapeado (`ROW_BUILDERS.aplazar`, `blocks.ts` card button). El fallo real es
    **título de modal >24 chars → `views.open` responde `invalid_arguments`** (confirmado en Vercel logs:
    "Aplazar SLA <code>" y "Pendientes de mi aprobación" = 27 chars). `pt()` corta a 75, pero Slack cap = 24.
  - El comentario de Slack YA crea `OpsTicketComment` con `userId: linked.adminId` (mismo modelo/autor que la
    web). Solo faltan gaps menores: `source:"slack"` en metadata + nombre del autor en la confirmación.
- **Decisión B1**: utilidad COMPARTIDA `clampModalTitle` (≤24, corte con "…") en TODOS los builders +
  clamp en el choke-point `api.ts` (views.open/push/update) + **loguear el título ofensor** en
  `invalid_arguments` para que la clase de bug nunca sea muda.
- **Decisión B4**: reutilizar el modelo genérico `Setting` (key `sla.reminderPolicy`, JSON) — SIN migración.
  UI en Configuración → Notificaciones, sección "Recordatorios de SLA".

## Estado

- [x] B1 — clamp de títulos compartido + offender-logging (Aplazar SLA y Aprobaciones abren)
- [x] B2 — comentario Slack con autor en confirmación (provenance vía logAudit, sin columna)
- [x] B3 — hilo = feed (root en cualquier evento + comentarios al hilo web/Slack)
- [x] B4 — política de recordatorios configurable por tenant (Setting) + tope diario
- [x] B5 — QA (matriz estática) + docs (slack.md Fase 14 · tickets/sla.md)

Gate `npx prisma generate && npx tsc --noEmit --incremental false` → exit 0 en cada bloque.
Verificación end-to-end en Slack (clic de botones) NO ejecutable en esta sesión (Slack MCP
sin autorizar); la matriz queda como checklist manual.
