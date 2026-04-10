# Tickets Module v2 — Cambios y Setup

## Resumen de cambios

### Bloque 1: SLA — Pausar, Aplazar, Escalar, Agrupar

**Schema** (`OpsTicket`):
- `slaPausedAt` — Timestamp de cuando se pausó el SLA
- `slaPausedReason` — Motivo de la pausa
- `slaPausedTotalMs` — Tiempo total acumulado en pausa (BigInt, default 0)
- `slaExtensions` — JSON array de `[{at, by, fromDueAt, toDueAt, reason}]`
- `snoozedUntil` — Silenciar notificaciones hasta esta fecha
- `lastSlaNotifiedAt` — Última vez que se notificó por SLA vencido

**PATCH `/api/ops/tickets/[id]`** — Nuevos campos aceptados:
- `slaDueAt` + `slaExtensionReason`: Aplazar SLA. Requiere motivo (>=10 chars para no-admins). Audita en `slaExtensions`.
- `slaPaused` (bool) + `slaPausedReason`: Pausar/reanudar. Al reanudar, extiende `slaDueAt` automáticamente por el tiempo pausado.
- `snoozedUntil` (ISO | null): Silenciar avisos sin afectar el SLA.

Todos los cambios crean un `OpsTicketComment` con `isInternal=true`.

**Cron SLA** (`/api/cron/sla-monitor`):
- Solo `open`/`in_progress` generan breach. Estados `waiting`, `pending_approval`, `waiting_client` excluidos.
- Tickets con `slaPausedAt` no se marcan como breached.
- Tickets con `snoozedUntil > now` no reciben notificaciones (pero sí se marcan breached).
- Re-notificación escalonada: P1 cada 2h, P2 cada 6h, P3 cada 24h, P4 cada 72h.
- Agrupamiento: si >5 tickets vencidos del mismo equipo, envía 1 notificación batch.

**Nuevos tipos de notificación:**
- `ticket_sla_breached_batch` — Lote de SLA vencidos
- `ticket_sla_paused` — SLA pausado
- `ticket_sla_extended` — SLA extendido
- `ticket_from_client_portal` — Ticket/comentario desde portal
- `ticket_new_email_reply` — Respuesta por email entrante

**UI** (TicketDetailClient):
- Card "Controles SLA" con botones: Aplazar, Pausar/Reanudar, Silenciar avisos
- Badges en header: "SLA pausado", "Silenciado hasta XX:XX"
- Historial de extensiones desplegable

---

### Bloque 2: Portal Cliente — Cerrar el flujo

**GET `/api/portal/cliente/ticket-types`** — Lista tipos de ticket con `origin="client"`, filtrados por tenant.

**POST `/api/portal/cliente/tickets`** — Mejoras:
- Valida `ticketTypeId`: debe ser `origin="client"`, activo, mismo tenant.
- Resuelve `assignedTeam` y `defaultPriority` del tipo seleccionado.
- Calcula `slaDueAt` si el tipo tiene `slaHours`.
- Envía email de confirmación al contacto con [TKT-XXXX], link al portal, y Reply-To con alias de threading.
- Notifica al equipo interno con `ticket_from_client_portal`.

**POST `/api/portal/cliente/tickets/[id]/comments`** — Mejoras:
- Notifica al equipo con `ticket_from_client_portal`.
- Notifica al `assignedTo` directamente si existe.

**PortalCreateTicket** — Ahora consume `/ticket-types` y muestra selector de tipo.

---

### Bloque 3: Conversación por Email Bidireccional

**Schema** (`OpsTicketComment`) — Campos nuevos:
- `bodyHtml`, `direction` (internal | email_out | email_in)
- `fromEmail`, `fromName`, `toEmails[]`, `ccEmails[]`, `bccEmails[]`
- `subject`, `messageId` (unique), `inReplyToMessageId`, `threadMessageIds[]`
- `attachments` (JSONB: [{fileName, r2Key, size, contentType, url}])
- `sentAt`, `deliveryStatus`, `deliveryError`, `resendId`
- `updatedAt`

**`src/lib/tickets-email.ts`** — Helper:
- `sendTicketEmail()`: Envía email con plus-addressing Reply-To, custom headers (X-Opai-*), threading (In-Reply-To/References), adjuntos desde R2. Crea comment con `direction="email_out"`. Nunca lanza excepción — en fallo, crea comment con `deliveryStatus="failed"`.
- `parseTicketIdFromEmail()`: Resuelve ticket desde plus-addressing, subject regex `[TKT-XXX]`, o In-Reply-To/References.

**POST `/api/ops/tickets/[id]/reply`** — Enviar email desde ticket:
- Body: `{ to, cc, bcc, subject, bodyText, bodyHtml, attachmentKeys, inReplyToCommentId }`
- Resuelve threading desde `inReplyToCommentId`.
- Valida emails y ticket ownership.

**POST `/api/ops/tickets/[id]/attachments`** — Upload de adjuntos:
- Multipart upload a R2 (`tickets/{tenantId}/{ticketId}/outbound/...`).
- Límite: 25MB por archivo, 10 archivos por mensaje.

**POST `/api/webhooks/email/inbound`** — Webhook de email entrante:
- Multi-provider: Resend, Mailgun, Postmark (configurable via `INBOUND_PROVIDER`).
- Resolución del ticket: plus-addressing > subject regex > In-Reply-To > References > ticket huérfano.
- Idempotencia: `messageId` único.
- Loop prevention: auto-submitted header, noreply sender.
- Auto-reopen: tickets `resolved`/`closed` vuelven a `in_progress`.
- Adjuntos subidos a R2 (`tickets/{tenantId}/{ticketId}/inbound/...`).
- Notifica al `assignedTo` o equipo.

**UI** (TicketDetailClient):
- `EmailTimelineEvent`: Renderizado por `direction`:
  - `internal`: Fondo amber, icono nota
  - `email_out`: Fondo azul, icono avión, muestra To/Cc, badge delivery status
  - `email_in`: Fondo gris, muestra From/To/Cc, toggle HTML original
- Lista de adjuntos descargables.
- `EmailComposer`: Campos To/Cc/Subject, pre-fill inteligente, upload de adjuntos, envío via `/reply`.
- Toggle compositor: "Nota interna" vs "Responder por email".

---

## Endpoints Nuevos

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/portal/cliente/ticket-types` | Tipos de ticket disponibles para el portal |
| POST | `/api/ops/tickets/[id]/reply` | Enviar email desde un ticket |
| POST | `/api/ops/tickets/[id]/attachments` | Upload de adjuntos para email |
| POST | `/api/webhooks/email/inbound` | Webhook de email entrante |

## Endpoints Modificados

| Método | Ruta | Cambios |
|--------|------|---------|
| PATCH | `/api/ops/tickets/[id]` | Acepta slaDueAt, slaPaused, snoozedUntil |
| GET | `/api/cron/sla-monitor` | Reescrito con pausa, escalamiento, batching |
| POST | `/api/portal/cliente/tickets` | Validación tipo, notificación, email |
| POST | `/api/portal/cliente/tickets/[id]/comments` | Notificación interna |
| GET | `/api/ops/tickets/[id]/comments` | Retorna campos de email |

---

## Setup: Inbound Email

### 1. Configurar dominio de respuesta

Configurar MX records para `reply.opai.cl` (o el dominio en `TICKETS_INBOUND_DOMAIN`) apuntando al provider de inbound:

**Resend:**
```
MX  reply.opai.cl  → inbound-smtp.resend.com  (priority 10)
```

**Mailgun:**
```
MX  reply.opai.cl  → mxa.mailgun.org  (priority 10)
MX  reply.opai.cl  → mxb.mailgun.org  (priority 10)
```

### 2. Configurar ruta del provider

**Resend:** Configurar inbound webhook en el dashboard apuntando a:
```
POST https://your-domain.com/api/webhooks/email/inbound
```

**Mailgun:** Crear Route en el dashboard:
```
Match: catch_all()
Forward: https://your-domain.com/api/webhooks/email/inbound
```

### 3. Variables de entorno

```env
TICKETS_INBOUND_DOMAIN=reply.opai.cl
RESEND_INBOUND_WEBHOOK_SECRET=<secret-del-webhook>
INBOUND_PROVIDER=resend  # resend | mailgun | postmark
```

### 4. Verificar SPF/DKIM/DMARC del dominio de envío

Asegurar que el dominio de envío (configurado en `getTenantEmailConfig()`) tenga:
- SPF: incluir `include:amazonses.com` (o el provider de envío de Resend)
- DKIM: configurado via Resend dashboard
- DMARC: `v=DMARC1; p=quarantine; rua=mailto:dmarc@opai.cl`

### 5. Testing

1. Enviar un email de prueba a `tickets+{ticket-uuid}@reply.opai.cl`
2. Verificar que aparezca como comment con `direction="email_in"` en el ticket
3. Responder desde el ticket y verificar que el email llega con headers correctos
4. Verificar que la respuesta del destinatario aterriza en el thread correcto

---

## Migraciones

```
prisma/migrations/20260410000000_tickets_sla_pause_extend/migration.sql
prisma/migrations/20260410010000_ticket_comments_email_fields/migration.sql
```

Ambas migraciones son aditivas (columnas nullable o con default). No rompen datos existentes.

---

## TODOs para revisión humana

1. **Firma de email**: El composer no pre-carga firma HTML del tenant (`tenantConfig.emailSignature`). Crear este campo en settings si se quiere firma automática.
2. **Sanitización HTML**: El inbound email HTML se muestra con `dangerouslySetInnerHTML`. Se recomienda agregar `DOMPurify` para sanitizar HTML externo antes de renderizar.
3. **Rich text editor**: El composer usa textarea plano. Se puede integrar Tiptap (ya existente en el proyecto) para composición HTML.
4. **Webhook firma Resend**: Verificar que Resend soporte firma criptográfica de webhooks inbound. El endpoint actual acepta bearer token o x-webhook-secret.
5. **origin="client"**: No existen ticket types con `origin="client"` en los seeds actuales (`TICKET_TYPE_SEEDS`). Crear tipos de ticket para portal cliente via seed o UI de configuración.
6. **Email del contacto reportedBy**: En el composer, la pre-fill del "To" solo busca el último `email_in`. Para tickets `source="portal_cliente"`, resolver el email del `reportedBy` contacto.
