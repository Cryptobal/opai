# SLA de tickets — vencimientos y recordatorios

El monitor de SLA (`/api/cron/sla-monitor`, cada 15 min) detecta tickets vencidos
y recuerda a su **responsable** (`assignedTo`). El resumen diario por equipo va por
correo vía `/api/cron/sla-daily-digest` (10:00 Chile).

## Estados

- **Breachables** (`open`, `in_progress`): vencen al pasar su `slaDueAt`.
- **Pausables** (`waiting`, `pending_approval`, `waiting_client`): no breachean aunque
  pasen su `slaDueAt`. Tickets con `slaPausedAt` quedan fuera.

## Recordatorios: política configurable por tenant

Antes los intervalos estaban hardcodeados (metralleta fija). Ahora son **configurables
por tenant** en **Configuración → Notificaciones → Recordatorios de SLA**. Se guardan
en el `Setting` `notification_preferences:{tenantId}` (campo `slaReminderPolicy`, JSON;
sin migración). La lógica vive en `src/lib/tickets-sla-policy.ts`.

### Campos

| Campo | Descripción | Rango | Default |
|------|-------------|-------|---------|
| `intervals.p1` | Cada cuántas horas se recuerda un P1 vencido | 1–168 h | **2 h** |
| `intervals.p2` | Ídem P2 | 1–168 h | **6 h** |
| `intervals.p3` | Ídem P3 | 1–168 h | **24 h** |
| `intervals.p4` | Ídem P4 | 1–168 h | **72 h** |
| `dailyCap` | Tope de recordatorios por ticket por día | 1–50 | **3** |
| `digestOnly.pN` | "Solo resumen diario": sin campanas para esa prioridad | bool | **false** |

Los defaults reproducen el comportamiento histórico: quien no configure nada no ve
ningún cambio.

### Reglas que aplica el monitor

1. **Intervalo por prioridad**: re-notifica sólo si pasó `intervals[prioridad]` desde
   el último aviso (`lastSlaNotifiedAt`).
2. **Tope diario**: cuenta los recordatorios ya enviados hoy por ticket (notificaciones
   `ticket_sla_breached` con `dedupKey` `sla_reminder*`, individuales o consolidadas) y
   corta al llegar a `dailyCap`.
3. **Solo resumen diario**: si `digestOnly[prioridad]` está activo, esa prioridad no
   genera campanas (ni el aviso inicial ni recordatorios); el ticket sigue marcado
   `slaBreached` para que el resumen diario lo cubra. Candidatos naturales: P3/P4.
4. **Silenciar** (botón por ticket en Slack): fija `snoozedUntil`. El monitor no recuerda
   mientras `now < snoozedUntil`, en aviso inicial y en recordatorios.

## Silenciar un ticket

Desde la tarjeta o la bandeja de Slack, "🔕 Silenciar" (1 h / 4 h / 24 h / reactivar)
setea `OpsTicket.snoozedUntil`. Es por-ticket y respeta la política.
