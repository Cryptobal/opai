# Propuesta: reenvío automático de exámenes de conocimiento por instalación

## Estado actual (ya existe)
- Modelo `Exam` ya soporta `scheduleType` (`manual | on_assignment | recurring`) y `recurringMonths`.
- Existe cron `POST /api/cron/exam-recurring` que crea asignaciones para guardias activos cuando vence el período recurrente.
- El portal guardia ya lista pendientes/completados desde `ExamAssignment`.
- Ya existe notificación por email (`notifyGuardOfExam`) para envíos manuales, por asignación y recurrentes.

## Brechas para tu caso
1. **Configuración global por instalación/módulo conocimiento**:
   - Hoy la recurrencia está por examen (`recurringMonths`) y no como parámetro central del módulo.
2. **Trazabilidad completa de entrega/correo**:
   - Falta persistencia explícita del resultado del envío (enviado, omitido, error, providerId).
3. **Idempotencia/operación masiva robusta**:
   - El cron actual evita duplicados funcionalmente, pero puede fortalecerse con llaves e índices para alta concurrencia.

## Diseño recomendado

### 1) Configuración central en Conocimiento
Agregar tabla de configuración por tenant/instalación:
- `knowledge_exam_policies`
  - `tenant_id`
  - `installation_id` (nullable para default tenant)
  - `enabled` (bool)
  - `recurrence_days` (int, default 90)
  - `grace_days` (int, default 0)
  - `notify_email` (bool, default true)
  - `notify_portal` (bool, default true)
  - `created_at`, `updated_at`

Regla de resolución:
1. policy instalación activa
2. policy tenant default
3. fallback sistema (90 días)

### 2) Motor de campañas recurrentes (separar “campaña” de “asignación”)
Agregar:
- `exam_recurrent_campaigns`
  - `id`, `tenant_id`, `installation_id`, `exam_id`
  - `window_start`, `window_end` (periodo cubierto)
  - `status` (`planned|processing|completed|partial|failed`)
  - `created_by` = `system-cron`
- `exam_assignment_events`
  - `assignment_id`, `event_type` (`created|email_sent|email_failed|opened|completed|expired`)
  - `event_at`, `payload_json`

Beneficio: auditoría tipo “qué se intentó enviar en esta corrida y qué pasó por guardia”.

### 3) Pipeline del cron (diario)
Para cada instalación con policy activa:
1. Resolver `recurrence_days`.
2. Seleccionar exámenes activos (puede mantenerse `scheduleType=recurring` o activar por policy).
3. Determinar guardias activos (`ops_asignacion_guardia.is_active=true`).
4. Para cada guardia, crear nueva `exam_assignment` solo si:
   - no hay pendiente (`sent|opened`), y
   - última referencia (`completed_at` o `sent_at`) <= `now - recurrence_days`.
5. Encolar notificación email (job async) y registrar evento.
6. Escribir resumen campaña (`processed/created/skipped/errors`).

### 4) Tracking de email de punta a punta
Extender `notifyGuardOfExam` para devolver resultado estructurado y guardar:
- `delivery_status`: `queued|sent|provider_error|skipped_no_email|skipped_no_provider`
- `provider_message_id` (Resend id)
- `attempt_count`
- `last_error`

Guardar en `exam_assignment_events` + opcional columna snapshot en `exam_assignments`.

### 5) UX/Operación
- En Configuración > Conocimiento:
  - “Frecuencia de recertificación (días)” (default 90).
  - “Aplicar a nuevas asignaciones activas”.
  - “Enviar correo automáticamente”.
- En la vista de exámenes por instalación:
  - Última campaña, próxima ejecución estimada, enviados/omitidos/error.
- En ficha guardia:
  - Línea de tiempo de eventos del examen (enviado correo, abierto, completado).

## Cambios mínimos (MVP)
1. Reusar `Exam.recurringMonths` pero agregar soporte en UI/API para `recurringDays` (o convertir 90 días a 3 meses operativamente).
2. Añadir `exam_assignment_events` para auditoría.
3. Hacer que `notifyGuardOfExam` persista resultado de envío.
4. Cron diario + idempotencia con índice único sugerido:
   - `UNIQUE (exam_id, guard_id, attempt_number)`.

## Escalabilidad y seguridad
- Procesamiento por lotes (batch 200-500 guardias).
- Cola (p. ej. trigger.dev / queue interna) para email, no bloquear cron.
- Reintentos exponenciales en envío de email.
- Logs con `tenant_id`, `installation_id`, `exam_id`, `guard_id`, `campaign_id`.
- Métricas: tasa de entrega, apertura, aprobación, atraso > X días.

## Plan de implementación recomendado
1. **Fase 1 (1-2 días):** eventos de asignación + persistencia de resultado email.
2. **Fase 2 (2-3 días):** policy configurable por instalación (recurrence_days).
3. **Fase 3 (2 días):** campañas recurrentes + panel de trazabilidad.
4. **Fase 4 (1-2 días):** alertas operativas (fallas de envío, guardias atrasados).

## Riesgos a cuidar
- Zonas horarias: calcular vencimiento en UTC, visualizar en `es-CL`.
- Guardias sin email: no bloquear; dejar pendiente visible en portal.
- Cambios de instalación/rotación de guardias: el criterio debe usar asignación activa actual.
- Duplicados por corridas concurrentes: lock lógico por examen/instalación + constraints.
