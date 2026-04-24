# TODO · Toggles "Visible al cliente" en el backoffice

Contexto: el portal del cliente ya filtra por `portalVisible` en
`ExamAssignment`, `PsychResult` y `OpsSupervisionGuardEvaluation` (todos
`default true`). Los endpoints PATCH están listos y funcionales:

- `PATCH /api/ops/guardias/:id/exam-assignments/:assignmentId/portal-visibility`
- `PATCH /api/ops/guardias/:id/supervision-evals/:evalId/portal-visibility`
- `PATCH /api/psych/assessments/:id/portal-visibility`

Cada uno recibe `{ portalVisible: boolean }` y requiere auth admin del tenant.

## Pendientes UI (no incluidos en Fase 1)

### 1. ExamAssignment · Ficha de guardia → tab Exámenes

- Archivo candidato: buscar `ExamAssignment` / `exam_assignments` en
  `src/app/ops/guardias/[id]/**` o `src/components/ops/**`.
- Agregar un switch `Visible al cliente` en la tarjeta/fila de cada asignación.
- On change: `fetch('/api/ops/guardias/:id/exam-assignments/:assignmentId/portal-visibility', { method: 'PATCH', body: JSON.stringify({ portalVisible }) })`.

### 2. OpsSupervisionGuardEvaluation · Detalle de visita de supervisión

- Archivo candidato: buscar `supervision_guard_evaluation` en
  `src/app/ops/supervision/**` o similar.
- Mismo switch en la tarjeta de evaluación por guardia dentro de la visita.

### 3. PsychResult · Vista de revisión del resultado

- Archivo candidato: buscar `psych/assessments/[id]` o `PsychResult`.
- Switch `Visible al cliente (solo banda)` con leyenda:
  > Si activas esto, el cliente verá SOLO la banda (ALTO/MEDIO/BAJO ajuste) y
  > la fecha, nunca el score numérico ni las dimensiones.

## Notas de seguridad

- Default `true` significa que toda asignación/evaluación/resultado nuevo
  aparecerá en el portal del cliente mientras no se oculte explícitamente.
- Para ocultar por ahora, Gard puede llamar manualmente al endpoint con `curl`
  o usar Prisma Studio en el schema correspondiente (`crm.exam_assignments`,
  `ops.supervision_guard_evaluations`, `psych.results`).
