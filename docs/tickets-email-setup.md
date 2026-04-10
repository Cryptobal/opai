# Tickets Email Setup — Inbound Configuration Guide

## Overview

The ticket email system enables bidirectional email conversations:
- **Outbound**: Operators send emails from tickets via the UI composer
- **Inbound**: Replies from clients/guards land back in the correct ticket thread

## Architecture

```
[Operator UI] → POST /api/ops/tickets/[id]/reply → Resend API → [Recipient]
                                                                      │
[Recipient] → Reply email → MX records → Resend Inbound → POST /api/webhooks/email/inbound
                                                                      │
                                                           [OpsTicketComment created]
```

### Reply-To Plus-Addressing

Every outbound email includes:
```
Reply-To: tickets+{ticket-uuid}@reply.opai.cl
```

When the recipient replies, this address routes back through the inbound webhook, which parses the UUID to find the correct ticket.

### Fallback Resolution

If plus-addressing fails (e.g., email client strips it), the system tries:
1. Subject line regex: `[TKT-XXXX]`
2. `In-Reply-To` header → match against stored `messageId`
3. `References` header → same mechanism
4. If nothing matches → create orphan ticket

## DNS Setup

### MX Records

Add MX record for your inbound domain:

```
reply.opai.cl.  IN  MX  10  inbound-smtp.resend.com.
```

For Mailgun:
```
reply.opai.cl.  IN  MX  10  mxa.mailgun.org.
reply.opai.cl.  IN  MX  20  mxb.mailgun.org.
```

### SPF/DKIM/DMARC (for outbound domain)

Ensure your sending domain has proper email authentication:

```
; SPF
opai.cl.  IN  TXT  "v=spf1 include:amazonses.com ~all"

; DMARC
_dmarc.opai.cl.  IN  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@opai.cl"
```

DKIM is configured through your email provider's dashboard (Resend).

## Provider Configuration

### Resend

1. Go to Resend Dashboard → Domains → Add Domain for `reply.opai.cl`
2. Add MX records as indicated
3. Configure inbound webhook:
   - URL: `https://your-app.vercel.app/api/webhooks/email/inbound`
   - Events: `email.received`
4. Copy the webhook secret to `RESEND_INBOUND_WEBHOOK_SECRET`

### Mailgun

1. Add domain `reply.opai.cl` in Mailgun
2. Configure MX records
3. Create a Route:
   - Expression: `catch_all()`
   - Action: Forward to `https://your-app.vercel.app/api/webhooks/email/inbound`
4. Set `INBOUND_PROVIDER=mailgun`
5. Set `MAILGUN_WEBHOOK_SIGNING_KEY` from Mailgun dashboard

### Postmark

1. Configure inbound domain in Postmark
2. Set inbound webhook URL
3. Set `INBOUND_PROVIDER=postmark`

## Environment Variables

```env
# Required
TICKETS_INBOUND_DOMAIN=reply.opai.cl
RESEND_INBOUND_WEBHOOK_SECRET=whsec_xxx

# Provider selection (default: resend)
INBOUND_PROVIDER=resend

# Mailgun-specific
MAILGUN_WEBHOOK_SIGNING_KEY=key-xxx
```

## Testing

### Send a test email

```bash
# Via curl (simulates webhook)
curl -X POST https://your-app.vercel.app/api/webhooks/email/inbound \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_WEBHOOK_SECRET" \
  -d '{
    "data": {
      "from": {"email": "test@example.com", "name": "Test User"},
      "to": ["tickets+YOUR-TICKET-UUID@reply.opai.cl"],
      "subject": "Test reply",
      "text": "This is a test reply",
      "message_id": "test-123@example.com"
    }
  }'
```

### Verify

1. Check the ticket in the UI — the reply should appear as an `email_in` comment
2. Check that the ticket was reopened if it was resolved/closed
3. Check notifications were sent to the assignee

### End-to-end test

1. Create a ticket and send an email from the UI composer
2. Reply to that email from your regular email client
3. Verify the reply appears in the ticket thread
4. Send another reply from the ticket UI
5. Verify the threading works (In-Reply-To headers chain correctly)
