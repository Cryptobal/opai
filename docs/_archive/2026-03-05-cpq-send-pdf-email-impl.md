# CPQ "Enviar PDF" Email Compose Modal — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Enviar PDF" button that opens an email compose modal with AI-generated body and real PDF attachment.

**Architecture:** New modal component (`SendPdfEmailModal`) with two new API routes: one for AI email body generation, one for sending the email with PDF. Follows existing patterns from `quote-description/route.ts` and `send-email/route.ts`.

**Tech Stack:** Next.js API routes, Resend email, `aiService.generateText()`, `buildQuotationProps` + `renderQuotationToBuffer` for PDF.

---

### Task 1: Create AI email body generation API route

**Files:**
- Create: `src/app/api/ai/quote-email-body/route.ts`

**Step 1: Create the route file**

```typescript
/**
 * API Route: /api/ai/quote-email-body
 * POST - Generate AI email body for sending a CPQ quote PDF
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { aiService } from "@/lib/ai-service";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { getTenantCompanyConfig } from "@/lib/tenant-config";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { quoteId, customInstruction } = await request.json();
    if (!quoteId) {
      return NextResponse.json(
        { success: false, error: "quoteId es requerido" },
        { status: 400 }
      );
    }

    const quote = await prisma.cpqQuote.findFirst({
      where: { id: quoteId, tenantId: ctx.tenantId },
      include: {
        positions: { include: { puestoTrabajo: true } },
        installation: true,
      },
    });

    if (!quote) {
      return NextResponse.json(
        { success: false, error: "Cotizacion no encontrada" },
        { status: 404 }
      );
    }

    // Contact name
    let contactName = quote.clientName || "Cliente";
    if (quote.contactId) {
      const contact = await prisma.crmContact.findUnique({
        where: { id: quote.contactId },
        select: { firstName: true, lastName: true },
      });
      if (contact) contactName = `${contact.firstName} ${contact.lastName}`.trim();
    }

    // Company config
    const companyConfig = await getTenantCompanyConfig(ctx.tenantId);

    // Positions summary
    const totalGuards = quote.positions.reduce(
      (sum, p) => sum + (p.numGuards || 1) * (p.numPuestos || 1),
      0
    );
    const positionsList = quote.positions
      .map((p) => p.customName || p.puestoTrabajo?.name || "Puesto")
      .join(", ");

    const prompt = `Eres un ejecutivo comercial de ${companyConfig.commercialName || "Gard Security"}, empresa de seguridad privada en Chile.

Escribe un email profesional y breve (3-4 parrafos cortos) para enviar una propuesta economica adjunta en PDF.

DATOS:
- Destinatario: ${contactName}
- Codigo cotizacion: ${quote.code}
- Guardias: ${totalGuards}
- Puestos: ${positionsList || "No definidos aun"}
- Instalacion: ${quote.installation?.name || "No especificada"}
- Vigencia: ${quote.validUntil ? new Date(quote.validUntil).toLocaleDateString("es-CL") : "No definida"}
- Empresa: ${companyConfig.commercialName || "Gard Security"}
- Telefono: ${companyConfig.phone}
- Email contacto empresa: ${companyConfig.email}

INSTRUCCIONES:
1. Saludo cordial usando el nombre del destinatario
2. Referencia al codigo de cotizacion y breve mencion de lo que incluye
3. Indicar que el detalle completo esta en el PDF adjunto
4. Cierre profesional con datos de contacto de la empresa
5. NO incluir precios en el email (estan en el PDF)
6. Maximo 800 caracteres
7. Tono profesional pero cercano
8. Idioma: espanol Chile${
      customInstruction?.trim()
        ? `\n\nINSTRUCCION ADICIONAL DEL USUARIO: ${customInstruction.trim()}`
        : ""
    }`;

    const body = (
      await aiService.generateText(prompt, { maxTokens: 400, temperature: 0.7 })
    ).trim();

    return NextResponse.json({ success: true, data: { body } });
  } catch (error) {
    console.error("Error generating email body:", error);
    const message = error instanceof Error ? error.message : "Error generando email";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
```

**Step 2: Verify file compiles (no syntax errors)**

Run: `npx tsc --noEmit src/app/api/ai/quote-email-body/route.ts` (or rely on the full build later)

---

### Task 2: Create send-pdf-email API route

**Files:**
- Create: `src/app/api/cpq/quotes/[id]/send-pdf-email/route.ts`

**Step 1: Create the route file**

```typescript
/**
 * API Route: /api/cpq/quotes/[id]/send-pdf-email
 * POST - Send quote PDF via email with custom compose body
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resend } from "@/lib/resend";
import { getTenantEmailConfig } from "@/lib/resend";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { buildQuotationProps } from "@/lib/pdf/templates/quotation/build-quotation-props";
import { renderQuotationToBuffer } from "@/lib/pdf/templates/quotation/render-quotation";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;
    const { to, cc, bcc, subject, htmlBody } = await request.json();

    if (!to || !subject || !htmlBody) {
      return NextResponse.json(
        { success: false, error: "to, subject y htmlBody son requeridos" },
        { status: 400 }
      );
    }

    // Verify quote exists
    const quote = await prisma.cpqQuote.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, code: true },
    });

    if (!quote) {
      return NextResponse.json(
        { success: false, error: "Cotizacion no encontrada" },
        { status: 404 }
      );
    }

    // Generate PDF
    const { fileName, ...pdfProps } = await buildQuotationProps(id, ctx.tenantId);
    const pdfBuffer = await renderQuotationToBuffer(pdfProps);

    // Wrap body in minimal HTML email structure
    const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;font-size:14px;color:#333;line-height:1.6;max-width:600px;margin:0 auto;padding:20px">
${htmlBody.replace(/\n/g, "<br>")}
</body></html>`;

    // Get tenant email config
    const emailConfig = await getTenantEmailConfig(ctx.tenantId);

    // Parse CC/BCC (comma-separated strings to arrays)
    const parseEmails = (str?: string): string[] =>
      str
        ? str.split(",").map((e) => e.trim()).filter((e) => e.includes("@"))
        : [];

    const emailResult = await resend.emails.send({
      from: emailConfig.from,
      to,
      cc: parseEmails(cc) || undefined,
      bcc: parseEmails(bcc) || undefined,
      replyTo: emailConfig.replyTo,
      subject,
      html: fullHtml,
      attachments: [
        {
          filename: fileName,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
      tags: [
        { name: "type", value: "cpq-quote-pdf" },
        { name: "quote", value: quote.code },
      ],
    });

    // Log in CRM history
    await prisma.crmHistoryLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "quote",
        entityId: id,
        action: "quote_pdf_sent",
        details: {
          to,
          cc: cc || null,
          bcc: bcc || null,
          subject,
          quoteCode: quote.code,
          emailId: emailResult?.data?.id || null,
        },
        createdBy: ctx.userId,
      },
    });

    return NextResponse.json({
      success: true,
      data: { emailId: emailResult?.data?.id },
    });
  } catch (error) {
    console.error("Error sending PDF email:", error);
    return NextResponse.json(
      { success: false, error: "Error al enviar email" },
      { status: 500 }
    );
  }
}
```

---

### Task 3: Create SendPdfEmailModal component

**Files:**
- Create: `src/components/cpq/SendPdfEmailModal.tsx`

**Step 1: Create the modal component**

The modal has:
- To (read-only, from contact), CC, BCC (text inputs)
- Subject (editable, pre-filled)
- PDF attachment badge (non-removable)
- Email body textarea (editable, AI-generated on open)
- AI prompt input + regenerate button
- Send button

```typescript
// Full component — see implementation below
// Key behaviors:
// - On open: call /api/ai/quote-email-body to generate initial body
// - Regenerate: call same endpoint with customInstruction
// - Send: call /api/cpq/quotes/[id]/send-pdf-email with { to, cc, bcc, subject, htmlBody }
// - Success: toast + keep modal open (user closes manually)
```

Props interface:
```typescript
interface SendPdfEmailModalProps {
  quoteId: string;
  quoteCode: string;
  contactEmail?: string;
  contactName?: string;
  companyName?: string;
  disabled?: boolean;
}
```

State:
- `to`: string (pre-filled from contactEmail)
- `cc`: string (empty)
- `bcc`: string (empty)
- `subject`: string (pre-filled "Propuesta economica {code} - {companyName}")
- `emailBody`: string (AI-generated)
- `aiPrompt`: string (custom instruction)
- `generatingBody`: boolean
- `sending`: boolean

---

### Task 4: Add "Enviar PDF" button to FinancialPanel

**Files:**
- Modify: `src/components/cpq/FinancialPanel.tsx`

**Step 1: Import SendPdfEmailModal**

Add import at top of file alongside existing SendCpqQuoteModal import.

**Step 2: Add button in PreviewTab action buttons area**

In the `{/* Action buttons (sticky at bottom) */}` section (around line 957), add `<SendPdfEmailModal>` after the existing "Enviar por Portal" button.

**Step 3: Pass required props**

The button only needs `contactEmail` to be enabled (not positions, account, or deal).

```tsx
<SendPdfEmailModal
  quoteId={quoteId}
  quoteCode={quoteCode}
  contactEmail={contactEmail}
  contactName={contactName}
  companyName={quote.clientName || undefined}
  disabled={!contactEmail}
/>
```

---

### Task 5: Build, test, and commit

**Step 1: Build the project**

```bash
rm -rf .next && NODE_OPTIONS="--max-old-space-size=8192" npx next build
```

Expected: Build succeeds without errors.

**Step 2: Start server and test manually**

1. Open a quote with a contact that has email
2. See "Enviar PDF" button in the sidebar
3. Click it — modal opens, AI generates email body
4. Edit body / add CC / regenerate with prompt
5. Send — email arrives with PDF attachment

**Step 3: Commit**

```bash
git add src/components/cpq/SendPdfEmailModal.tsx \
        src/app/api/ai/quote-email-body/route.ts \
        src/app/api/cpq/quotes/\[id\]/send-pdf-email/route.ts \
        src/components/cpq/FinancialPanel.tsx
git commit -m "feat(cpq): add 'Enviar PDF' email compose modal with AI body generation"
```
