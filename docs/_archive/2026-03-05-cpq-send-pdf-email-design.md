# Design: CPQ "Enviar PDF" — Email Compose Modal with AI

## Summary

Add a new "Enviar PDF" button to the CPQ quote detail sidebar that opens an email compose modal. The modal pre-fills the recipient from the quote's contact, allows CC/BCC, generates an AI email body based on the quote data, and attaches the real PDF. The user can edit the email or regenerate it with a custom prompt before sending.

## Requirements

- New button "Enviar PDF" in the PreviewTab action buttons area (alongside existing "Enviar cotizacion" and "Enviar por Portal")
- Only requires a contact with email to be enabled (no need for positions, account, or deal)
- Does NOT change quote status to "sent" (that's the job of the other buttons)
- Does NOT generate portal tokens or update deal stages

## Modal UI

Single-screen compose modal (no wizard steps):

```
┌─────────────────────────────────────────┐
│  Enviar PDF por email                    │
│─────────────────────────────────────────│
│  Para: [contacto@empresa.com]           │
│  CC:   [email1, email2...]              │
│  BCC:  [email1, email2...]              │
│  Asunto: [Propuesta economica COT-XXX]  │
│─────────────────────────────────────────│
│  📎 COT-XXX-propuesta.pdf              │
│─────────────────────────────────────────│
│  [Email body textarea - editable]       │
│                                         │
│                                         │
│─────────────────────────────────────────│
│  Prompt AI: [instrucciones...]  [🔄]    │
│─────────────────────────────────────────│
│          [Cancelar]  [Enviar PDF]        │
└─────────────────────────────────────────┘
```

### Fields

- **Para (To)**: Read-only, pre-filled from contact email. Shows name + email.
- **CC**: Text input, comma-separated emails. Initially empty.
- **BCC**: Text input, comma-separated emails. Initially empty.
- **Asunto**: Editable, pre-filled with "Propuesta economica {code} - {companyName}"
- **Adjunto badge**: Shows PDF filename as a non-removable chip (always attached)
- **Cuerpo**: Textarea with the AI-generated email. Fully editable by the user.
- **Prompt AI**: Small input + regenerate button. User writes instructions (e.g. "tono formal", "menciona urgencia") and clicks regenerate. The AI rewrites the email body based on the prompt + quote context.

### Behavior

1. When modal opens, it calls `POST /api/ai/quote-email-body` to generate an initial email body using quote context (client name, quote code, positions summary, total, company name).
2. User can edit the generated body directly in the textarea.
3. User can write a prompt in the AI input and click regenerate to get a new body.
4. On "Enviar PDF" click, calls `POST /api/cpq/quotes/[id]/send-pdf-email` with `{ to, cc, bcc, subject, body }`.
5. Backend generates the PDF, sends via Resend with the custom HTML body + PDF attachment.
6. Shows success toast. Does NOT close modal automatically (user closes it).

## API Endpoints

### `POST /api/ai/quote-email-body`

Generates email body text using AI.

**Request**: `{ quoteId, customInstruction? }`
**Response**: `{ success: true, body: string }`

System prompt context: quote code, client name, positions count, total amount, company name, valid until date.

### `POST /api/cpq/quotes/[id]/send-pdf-email`

New route. Sends the quote PDF via email with user-composed body.

**Request**: `{ to, cc?, bcc?, subject, htmlBody }`
**Response**: `{ success: true, emailId }`

- Generates PDF using `buildQuotationProps` + `renderQuotationToBuffer`
- Sends via Resend with the provided htmlBody wrapped in a minimal email template
- Logs in CRM history (action: "quote_pdf_sent")
- Does NOT update quote status or deal stage

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/components/cpq/SendPdfEmailModal.tsx` | Create — modal component |
| `src/app/api/ai/quote-email-body/route.ts` | Create — AI email generation |
| `src/app/api/cpq/quotes/[id]/send-pdf-email/route.ts` | Create — send email with PDF |
| `src/components/cpq/FinancialPanel.tsx` | Modify — add button |

## AI Email Generation

Default email (no custom instruction):
- Professional, brief (3-4 paragraphs)
- Spanish (Chile)
- Mentions: greeting with contact name, reference to quote code, brief description of what's included, mention of attached PDF, closing with company contact info
- No prices in the email body (those are in the PDF)

With custom instruction:
- Same context, but the user's instruction guides tone/content
- E.g. "tono urgente, mencionar que la propuesta vence pronto"
