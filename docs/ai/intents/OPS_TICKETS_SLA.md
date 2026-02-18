# Intent: Tickets y SLA

> **Creado:** 2026-02-18

## Intencion del usuario

Preguntas como:
- "Como creo un ticket?"
- "Donde veo tickets pendientes?"
- "Que es el SLA?"
- "Un guardia puede crear tickets?"
- "Donde apruebo un ticket?"

## Respuesta esperada

### Crear un ticket
1. Ir a **Ops > Tickets**.
2. Presionar **+ Nuevo ticket**.
3. Seleccionar tipo de ticket (configura SLA y equipo automaticamente).
4. Completar descripcion, prioridad y datos requeridos.
5. Guardar. Si el tipo requiere aprobacion, el ticket queda en "Pendiente de aprobacion".

### SLA
- Cada tipo de ticket tiene un tiempo maximo de resolucion (**SLA en horas**).
- Al crear el ticket, `slaDueAt = createdAt + slaHours`.
- Un cron cada 15 minutos revisa SLA:
  - Si falta menos de 1 hora: notificacion "SLA approaching".
  - Si venció: marca `slaBreached = true` y notifica.

### Aprobaciones
- Algunos tipos requieren aprobacion multi-paso.
- Cada paso define un aprobador (grupo o usuario).
- Flujo: `pending_approval` → paso 1 → paso 2 → ... → `approved` → `open`.
- Rechazo en cualquier paso → `rejected`.

### Portal de guardia
- Los guardias pueden crear tickets desde su portal (`/portal/guardia/tickets`).
- Solo ven tickets con origen "guard" o "both".

## URLs canonicas

- Bandeja de tickets: `/ops/tickets`
- Detalle: `/ops/tickets/[id]`
- Tipos de ticket: via API `/api/ops/ticket-types`
- Portal guardia: `/portal/guardia/tickets`

## Formato recomendado

- Resumen: "Tienes X tickets abiertos, Y en SLA breached."
- Listado con: codigo, tipo, prioridad, estado, SLA restante.
- Accion: `Ingresa aca: [Tickets](https://opai.gard.cl/ops/tickets)`
