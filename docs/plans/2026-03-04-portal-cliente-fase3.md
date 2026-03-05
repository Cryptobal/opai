# Portal Cliente — Fase 3: Comercial

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Commercial flow — quotes visible in portal, demo data generation for prospects, contract data form, and electronic signature handoff.

**Architecture:** Cotizaciones are read from `CpqQuote` filtered by `accountId` from session cookie. Demo data uses the app's `AIService` (which abstracts Anthropic/OpenAI via the tenant's active provider). Contract form updates `CrmAccount` and creates `DocSignatureRequest` + `DocSignatureRecipient`. Signature UI links to the existing `/api/docs/sign/[token]` flow.

**Tech Stack:** Next.js 15 App Router, Prisma, `AIService` from `@/lib/ai-service`, Tailwind + shadcn/ui

---

## Task 1: Modify CPQ send-email to include portal magic link

**File:** `src/app/api/cpq/quotes/[id]/send-email/route.ts`

**Goal:** After sending the quote email, also generate a `portalMagicToken` for the contact and embed a portal setup/access link in the email.

**Context from reading the file:**
- The route already fetches the `contact` with only `{ firstName, lastName, email }` — needs to be expanded to also select `portalMagicToken` fields.
- The email is rendered via `CpqQuoteEmail` component using `@react-email/render`.
- `CpqQuoteEmail` does not currently accept a `portalUrl` prop — we need to add one.
- The `emailResult` send happens around line 170. The portal token logic should run **before** calling `resend.emails.send`, so the URL can be passed into the email template.

**Steps:**

1. Expand the contact query to include portal fields:
```ts
const contact = await prisma.crmContact.findUnique({
  where: { id: quote.contactId },
  select: {
    firstName: true,
    lastName: true,
    email: true,
    portalEnabled: true,
  },
});
```

2. After the contact validation, generate and persist the magic token:
```ts
import { randomUUID } from "crypto";

const magicToken = randomUUID();
const tokenExp = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h

await prisma.crmContact.update({
  where: { id: quote.contactId },
  data: {
    portalMagicToken: magicToken,
    portalMagicTokenExp: tokenExp,
    portalEnabled: true,
  },
});

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.opai.cl";
const portalUrl = `${baseUrl}/portal/cliente/setup?token=${magicToken}`;
```

3. Pass `portalUrl` into the `CpqQuoteEmail` render call:
```ts
const emailHtml = await render(
  <CpqQuoteEmail
    {...existingProps}
    portalUrl={portalUrl}
  />
);
```

4. In `src/emails/CpqQuoteEmail.tsx`, add `portalUrl?: string` to the props interface and render a button section when it is present:
```tsx
import { Button } from "@react-email/components";

// Inside the JSX, after the main content:
{portalUrl && (
  <Section style={{ textAlign: "center", marginTop: "24px" }}>
    <Text style={{ marginBottom: "12px", color: "#374151" }}>
      Accede a tu Portal de Cliente para revisar y aprobar esta cotización:
    </Text>
    <Button
      href={portalUrl}
      style={{
        backgroundColor: "#2563eb",
        color: "#ffffff",
        padding: "12px 24px",
        borderRadius: "6px",
        fontWeight: "600",
        textDecoration: "none",
      }}
    >
      Ver cotización en el portal
    </Button>
  </Section>
)}
```

5. Also log the `portalUrl` in the `crmHistoryLog.details` for traceability.

**Commit:**
```bash
git add src/app/api/cpq/quotes/\[id\]/send-email/route.ts src/emails/CpqQuoteEmail.tsx
git commit -m "feat(cpq): include portal magic link in quote send-email"
```

---

## Task 2: Cotizaciones API

**Goal:** Four REST endpoints that the portal frontend will call. All use `validateClienteSession` by reading the session cookie.

**Pattern for session validation** (from `src/app/api/portal/cliente/auth/route.ts`):
```ts
import { cookies } from "next/headers";
import { ClienteSession } from "@/lib/portal-cliente";

const cookieStore = await cookies();
const raw = cookieStore.get("portal_cliente_session")?.value;
if (!raw) return NextResponse.json({ error: "No session" }, { status: 401 });
const session: ClienteSession = JSON.parse(raw);
```

### File 1: `src/app/api/portal/cliente/cotizaciones/route.ts` (GET)

```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ClienteSession } from "@/lib/portal-cliente";

export async function GET() {
  const cookieStore = await cookies();
  const raw = cookieStore.get("portal_cliente_session")?.value;
  if (!raw) return NextResponse.json({ error: "No session" }, { status: 401 });
  const session: ClienteSession = JSON.parse(raw);

  const quotes = await prisma.cpqQuote.findMany({
    where: { accountId: session.accountId, tenantId: session.tenantId },
    include: {
      positions: { select: { id: true, numGuards: true } },
      deal: { include: { stage: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const data = quotes.map((q) => ({
    id: q.id,
    code: q.code,
    name: q.name,
    status: q.status,
    monthlyCost: q.monthlyCost?.toNumber() ?? 0,
    validUntil: q.validUntil,
    totalPositions: q.positions.length,
    totalGuards: q.positions.reduce((s, p) => s + (p.numGuards ?? 0), 0),
    dealStatus: q.deal?.status ?? null,
    dealStage: q.deal?.stage?.name ?? null,
  }));

  return NextResponse.json({ success: true, data });
}
```

### File 2: `src/app/api/portal/cliente/cotizaciones/[id]/route.ts` (GET)

Returns full quote with positions:
```ts
const quote = await prisma.cpqQuote.findFirst({
  where: { id, accountId: session.accountId, tenantId: session.tenantId },
  include: {
    positions: {
      select: {
        id: true,
        customName: true,
        numGuards: true,
        numPuestos: true,
        startTime: true,
        endTime: true,
        weekdays: true,
        monthlyPositionCost: true,
      },
    },
  },
});
if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });
```

### File 3: `src/app/api/portal/cliente/cotizaciones/[id]/approve/route.ts` (POST)

```ts
// Verify ownership
const quote = await prisma.cpqQuote.findFirst({
  where: { id, accountId: session.accountId, tenantId: session.tenantId },
  select: { id: true, dealId: true },
});
if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });

await prisma.cpqQuote.update({ where: { id }, data: { status: "approved" } });

// Find or create the "Aprobado por Cliente" pipeline stage
let stage = await prisma.crmPipelineStage.findFirst({
  where: { tenantId: session.tenantId, name: "Aprobado por Cliente" },
});
if (!stage) {
  stage = await prisma.crmPipelineStage.create({
    data: { tenantId: session.tenantId, name: "Aprobado por Cliente", isActive: true, order: 99 },
  });
}

if (quote.dealId) {
  await prisma.crmDeal.update({
    where: { id: quote.dealId },
    data: { stageId: stage.id },
  });
}

return NextResponse.json({ success: true });
```

### File 4: `src/app/api/portal/cliente/cotizaciones/[id]/reject/route.ts` (POST)

```ts
// Body: { reason?: string }
const { reason } = await request.json();

await prisma.cpqQuote.update({
  where: { id },
  data: { status: "rejected", notes: reason ?? undefined },
});

return NextResponse.json({ success: true });
```

**Commit:**
```bash
git add src/app/api/portal/cliente/cotizaciones/
git commit -m "feat(portal): add cotizaciones API endpoints (list, detail, approve, reject)"
```

---

## Task 3: Cotizaciones UI

**File:** `src/components/portal/cliente/PortalCotizaciones.tsx`

**Goal:** A component that lists the client's quotes, shows inline detail, and provides approve/reject actions for `sent` quotes. On approval, shows the `PortalContractForm`.

```tsx
"use client";

import { useState, useEffect } from "react";
import { CheckCircle, XCircle, ChevronDown, ChevronUp, FileText } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { PortalContractForm } from "./PortalContractForm";

type QuoteSummary = {
  id: string;
  code: string;
  name: string;
  status: string;
  monthlyCost: number;
  validUntil: string | null;
  totalPositions: number;
  totalGuards: number;
};

const STATUS_BADGE: Record<string, string> = {
  draft:    "bg-zinc-100 text-zinc-600",
  sent:     "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-600",
};

const STATUS_LABEL: Record<string, string> = {
  draft:    "Borrador",
  sent:     "Enviada",
  approved: "Aprobada",
  rejected: "Rechazada",
};
```

**Key behaviors:**

- `useEffect` on mount: `GET /api/portal/cliente/cotizaciones`
- Clicking a quote row: `GET /api/portal/cliente/cotizaciones/[id]` and expand inline detail showing positions table.
- For `status === 'sent'`: Show two buttons:
  - "Aprobar cotización" → `POST /api/portal/cliente/cotizaciones/[id]/approve` → on success, set local status to `'approved'` and show `<PortalContractForm quoteId={id} />`
  - "Rechazar" → prompt for optional reason, then `POST /api/portal/cliente/cotizaciones/[id]/reject`
- For `status === 'approved'`: Show badge "Contrato en proceso" and render `<PortalContractForm quoteId={id} />` inline.
- Positions table columns: Puesto, Guardias, Horario, Días, Costo mensual.

**Wire up in `PortalClienteClient.tsx`:**

```tsx
import { PortalCotizaciones } from "@/components/portal/cliente/PortalCotizaciones";

// In renderSection():
case "cotizaciones":
  return (
    <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-4 pb-24">
      <PortalCotizaciones session={session} />
    </div>
  );
```

**Commit:**
```bash
git add src/components/portal/cliente/PortalCotizaciones.tsx src/app/portal/cliente/PortalClienteClient.tsx
git commit -m "feat(portal): add cotizaciones UI with approve/reject flow"
```

---

## Task 4: Demo Data (Prospecto mode)

**Goal:** Prospects (`session.isProspect === true`) get AI-generated realistic demo data so they can explore the portal. Uses the app's `AIService`.

**Check how AIService is used:**
- `import { AIService } from "@/lib/ai-service";`
- `const ai = new AIService();`
- `const config = await ai.getActiveConfig();` — returns `{ providerType, modelId, apiKey, baseUrl }`
- For Anthropic: `import Anthropic from "@anthropic-ai/sdk"; const client = new Anthropic({ apiKey: config.apiKey });`
- For OpenAI-compatible: use `openai` package or fetch directly.

**Note:** Check `package.json` at runtime with `require` or check if `@anthropic-ai/sdk` is installed. Given the existing `ai-service.ts` abstracts this, use the OpenAI-compatible client path which works with both providers, OR call the AI service's chat completion helper if one exists.

**Simpler approach:** Use `AIService` if it exposes a `complete(prompt)` method. If not, check `src/lib/ai-service.ts` for the full implementation and call the underlying SDK directly based on `config.providerType`.

### File 1: `src/app/api/portal/cliente/demo/generate/route.ts` (POST)

```ts
export async function POST() {
  // Session validation
  const session = getSession(); // read from cookie
  if (!session.isProspect) {
    return NextResponse.json({ error: "Only for prospects" }, { status: 403 });
  }

  const ai = new AIService();
  const config = await ai.getActiveConfig();
  if (!config) {
    // Fallback: return static demo data without AI
    return NextResponse.json({ success: true, data: STATIC_DEMO_DATA });
  }

  const prompt = `Generate realistic security service monitoring data for a Chilean B2B client company.
Return ONLY valid JSON (no markdown) with this exact structure:
{
  "installations": [
    { "name": "Edificio Central", "address": "Av. Apoquindo 4500, Las Condes", "guardCount": 3 },
    { "name": "Bodega Norte", "address": "Ruta 5 Norte km 12, Quilicura", "guardCount": 2 }
  ],
  "kpis": {
    "compliance": 94.5,
    "trustScore": 87,
    "alerts": 2,
    "rounds": 48
  },
  "recentActivity": [
    { "type": "ronda", "description": "Ronda completada - Edificio Central", "time": "Hace 2 horas" },
    { "type": "incidente", "description": "Alerta resuelta - Acceso no autorizado", "time": "Hace 5 horas" }
  ]
}`;

  // Call AI (use fetch for provider-agnostic approach)
  let demoData: object;
  try {
    if (config.providerType === "anthropic") {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey: config.apiKey });
      const response = await client.messages.create({
        model: config.modelId,
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      });
      demoData = JSON.parse((response.content[0] as { text: string }).text);
    } else {
      // OpenAI-compatible
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({ model: config.modelId, messages: [{ role: "user", content: prompt }] }),
      });
      const json = await response.json();
      demoData = JSON.parse(json.choices[0].message.content);
    }
  } catch {
    demoData = STATIC_DEMO_DATA;
  }

  await prisma.portalClienteDemoData.upsert({
    where: { contactId: session.contactId },
    create: { tenantId: session.tenantId, contactId: session.contactId, demoData, generatedAt: new Date() },
    update: { demoData, generatedAt: new Date() },
  });

  return NextResponse.json({ success: true, data: demoData });
}

const STATIC_DEMO_DATA = {
  installations: [
    { name: "Edificio Corporativo", address: "Av. Providencia 1234, Santiago", guardCount: 3 },
    { name: "Planta de Operaciones", address: "Ruta 68 km 20, Pudahuel", guardCount: 2 },
  ],
  kpis: { compliance: 92.0, trustScore: 85, alerts: 1, rounds: 36 },
  recentActivity: [
    { type: "ronda", description: "Ronda completada - Edificio Corporativo", time: "Hace 1 hora" },
    { type: "posta", description: "Cambio de turno registrado", time: "Hace 3 horas" },
  ],
};
```

### File 2: `src/app/api/portal/cliente/demo/data/route.ts` (GET)

```ts
export async function GET() {
  const session = getSession();
  const existing = await prisma.portalClienteDemoData.findUnique({
    where: { contactId: session.contactId },
  });
  if (existing) return NextResponse.json({ success: true, data: existing.demoData });
  return NextResponse.json({ success: true, data: STATIC_DEMO_DATA });
}
```

**Commit:**
```bash
git add src/app/api/portal/cliente/demo/
git commit -m "feat(portal): add demo data generation API for prospect mode"
```

---

## Task 5: Demo Overlay Component

**File:** `src/components/portal/cliente/PortalDemoOverlay.tsx`

**Goal:** A persistent banner shown to prospects that makes it clear the data is for demo purposes and directs them toward approving a quote.

```tsx
"use client";

import { useState } from "react";
import { Sparkles, X } from "lucide-react";

interface Props {
  onCTA: () => void;
}

export function PortalDemoOverlay({ onCTA }: Props) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-400 text-amber-900 px-4 py-2 flex items-center gap-3 shadow-md">
      <Sparkles className="w-4 h-4 shrink-0" />
      <p className="text-sm font-medium flex-1">
        Datos de demostración — Aprueba tu cotización para ver datos reales de tu servicio.
      </p>
      <button
        onClick={onCTA}
        className="text-xs font-semibold bg-amber-900 text-amber-100 px-3 py-1 rounded-full hover:bg-amber-800 transition-colors"
      >
        Ver cotización
      </button>
      <button onClick={() => setDismissed(true)} className="hover:opacity-70 ml-1">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
```

**Wire up in `PortalClienteClient.tsx`:**

```tsx
import { PortalDemoOverlay } from "@/components/portal/cliente/PortalDemoOverlay";

// Inside the logged-in screen render, before <main>:
{session.isProspect && (
  <PortalDemoOverlay onCTA={() => setActiveSection("cotizaciones")} />
)}
// Also add top padding to <main> when overlay is shown:
<main className={cn("flex-1 flex flex-col overflow-y-auto", session?.isProspect && "pt-10")}>
```

**Commit:**
```bash
git add src/components/portal/cliente/PortalDemoOverlay.tsx src/app/portal/cliente/PortalClienteClient.tsx
git commit -m "feat(portal): add demo overlay banner for prospect mode"
```

---

## Task 6: Contract Data Form

**Goal:** After a quote is approved, the client fills in their company and billing data. This triggers document creation and signature request generation.

### File 1: `src/app/api/portal/cliente/contract-data/route.ts` (POST)

```ts
// Body type:
type ContractDataBody = {
  quoteId: string;
  companyRut: string;
  legalName: string;
  legalAddress: string;
  billingData: {
    email: string;
    contact: string;
    paymentMethod?: string;
  };
  operativeContacts: Array<{
    name: string;
    email: string;
    phone?: string;
    role?: string;
  }>;
};
```

**Logic:**

```ts
// 1. Verify quote ownership
const quote = await prisma.cpqQuote.findFirst({
  where: { id: body.quoteId, accountId: session.accountId, tenantId: session.tenantId },
  select: { id: true, name: true, code: true },
});
if (!quote) return 404;

// 2. Update CrmAccount with company data
// Store legalName and legalAddress in existing fields or JSON metadata
await prisma.crmAccount.update({
  where: { id: session.accountId },
  data: {
    // Use name if empty, otherwise keep existing
    // Store billing/operative data in portalConfig or a metadata JSON field
    // Check CrmAccount schema for available fields
    rut: body.companyRut,
  },
});

// 3. Find contract template
const template = await prisma.docTemplate.findFirst({
  where: {
    tenantId: session.tenantId,
    isActive: true,
    OR: [{ usageSlug: "contrato_cliente" }, { usageSlug: "contrato" }],
  },
});

if (!template) {
  // No template found — return success without document
  return NextResponse.json({ success: true, documentId: null, signatureToken: null });
}

// 4. Create Document from template
const document = await prisma.document.create({
  data: {
    tenantId: session.tenantId,
    uniqueId: `CONTRACT-${session.accountId.slice(-6).toUpperCase()}-${Date.now()}`,
    title: `Contrato de Servicio — ${session.accountName}`,
    content: template.content,
    status: "draft",
    portalVisible: true,
    signatureStatus: "pending",
  },
});

// 5. Create DocAssociation
await prisma.docAssociation.create({
  data: {
    documentId: document.id,
    entityType: "crm_account",
    entityId: session.accountId,
    role: "contract",
  },
});

// 6. Create DocSignatureRequest
const signatureRequest = await prisma.docSignatureRequest.create({
  data: {
    documentId: document.id,
    tenantId: session.tenantId,
    status: "pending",
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  },
});

// 7. Create DocSignatureRecipient for the session contact
const { randomUUID } = await import("crypto");
const recipientToken = randomUUID();
const recipient = await prisma.docSignatureRecipient.create({
  data: {
    requestId: signatureRequest.id,
    token: recipientToken,
    name: `${session.firstName} ${session.lastName}`,
    email: session.email ?? "",
    rut: body.companyRut,
    status: "pending",
    role: "signer",
    signingOrder: 1,
  },
});

return NextResponse.json({
  success: true,
  documentId: document.id,
  signatureToken: recipientToken,
});
```

### File 2: `src/components/portal/cliente/PortalContractForm.tsx`

Multi-step form using local state (no external form library needed):

```tsx
"use client";

import { useState } from "react";
import { Building2, Receipt, Users, CheckCircle } from "lucide-react";

interface Props {
  quoteId: string;
  accountRut?: string;
  accountName?: string;
  onComplete?: (signatureToken: string | null) => void;
}

type Step = "empresa" | "facturacion" | "contactos" | "done";

export function PortalContractForm({ quoteId, accountRut, accountName, onComplete }: Props) {
  const [step, setStep] = useState<Step>("empresa");
  const [submitting, setSubmitting] = useState(false);
  const [signatureToken, setSignatureToken] = useState<string | null>(null);

  const [empresa, setEmpresa] = useState({ rut: accountRut ?? "", legalName: accountName ?? "", address: "" });
  const [facturacion, setFacturacion] = useState({ email: "", contact: "", paymentMethod: "transferencia" });
  const [contactos, setContactos] = useState([{ name: "", email: "", phone: "", role: "Jefe de Operaciones" }]);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/portal/cliente/contract-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId,
          companyRut: empresa.rut,
          legalName: empresa.legalName,
          legalAddress: empresa.address,
          billingData: facturacion,
          operativeContacts: contactos.filter((c) => c.name && c.email),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSignatureToken(json.signatureToken);
        setStep("done");
        onComplete?.(json.signatureToken);
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Render step indicators + current step form
  // Step 1 "empresa": RUT, Razón Social, Dirección legal
  // Step 2 "facturacion": Email facturación, Nombre contacto, Método de pago
  // Step 3 "contactos": List of operative contacts (name, email, phone, role)
  // Step 4 "done": Show PortalSignContract if signatureToken, else "Te contactaremos pronto"
}
```

**Commit:**
```bash
git add src/app/api/portal/cliente/contract-data/route.ts src/components/portal/cliente/PortalContractForm.tsx
git commit -m "feat(portal): add contract data form and signature request creation"
```

---

## Task 7: Electronic Signature Integration

**Goal:** After the contract form is submitted, show the client a way to sign the document electronically. The signature flow at `/api/docs/sign/[token]` already exists and handles the full signature process — we just need to link to it or embed it.

**Note from reading `src/app/api/docs/sign/[token]/route.ts`:** The route handles GET (fetch document + status) and POST (register signature). There is likely a matching UI page at `src/app/docs/sign/[token]/page.tsx` or similar — check for it.

**File:** `src/components/portal/cliente/PortalSignContract.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import { FileSignature, ExternalLink, CheckCircle, Loader2 } from "lucide-react";

interface Props {
  signatureToken: string;
}

type SignStatus = {
  documentTitle?: string;
  pdfUrl?: string;
  status?: string;
  recipientStatus?: string;
};

export function PortalSignContract({ signatureToken }: Props) {
  const [info, setInfo] = useState<SignStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/docs/sign/${signatureToken}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setInfo({
            documentTitle: json.data?.document?.title,
            pdfUrl: json.data?.document?.pdfUrl,
            status: json.data?.request?.status,
            recipientStatus: json.data?.recipient?.status,
          });
        }
      })
      .finally(() => setLoading(false));
  }, [signatureToken]);

  if (loading) return <div className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="w-4 h-4 animate-spin" /> Cargando documento...</div>;

  if (info?.recipientStatus === "signed") {
    return (
      <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
        <CheckCircle className="w-5 h-5" />
        Contrato firmado exitosamente
      </div>
    );
  }

  const signUrl = `/docs/sign/${signatureToken}`;

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <FileSignature className="w-6 h-6 text-blue-700" />
        <div>
          <p className="font-semibold text-blue-900">{info?.documentTitle ?? "Contrato de Servicio"}</p>
          <p className="text-sm text-blue-700">Pendiente de tu firma electrónica</p>
        </div>
      </div>

      {info?.pdfUrl && (
        <a
          href={info.pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Ver documento PDF
        </a>
      )}

      <a
        href={signUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
      >
        Firmar contrato
      </a>
      <p className="text-xs text-blue-600">
        Se abrirá el proceso de firma en una nueva ventana. Puedes volver aquí al finalizar.
      </p>
    </div>
  );
}
```

**Wire up the sign component in `PortalContractForm.tsx`** — in the `done` step:

```tsx
import { PortalSignContract } from "./PortalSignContract";

// In the 'done' step render:
case "done":
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-green-700 font-medium">
        <CheckCircle className="w-5 h-5" />
        Datos de contrato recibidos
      </div>
      {signatureToken ? (
        <PortalSignContract signatureToken={signatureToken} />
      ) : (
        <p className="text-sm text-zinc-600">
          Un ejecutivo revisará tu información y te contactará pronto para continuar el proceso.
        </p>
      )}
    </div>
  );
```

**Also check** if there is a dedicated page for the signature UI (`src/app/docs/sign/[token]/page.tsx`). If it exists, the `signUrl` above will work. If the signing UI is purely API-driven (no page), consider building a minimal inline signing form inside `PortalSignContract` that calls the POST endpoint directly with the signer's name, RUT, and a checkbox confirmation.

**Inline signing fallback** (if no sign page exists):

```tsx
async function handleSign() {
  await fetch(`/api/docs/sign/${signatureToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: signerName,
      rut: signerRut,
      agreed: true,
      signatureMethod: "portal_click",
    }),
  });
  setSigned(true);
}
```

**Commit:**
```bash
git add src/components/portal/cliente/PortalSignContract.tsx src/components/portal/cliente/PortalContractForm.tsx
git commit -m "feat(portal): add electronic signature component and wire up in contract form"
```

---

## Summary

| Task | Files created/modified | Key dependency |
|------|----------------------|----------------|
| 1 | `send-email/route.ts`, `CpqQuoteEmail.tsx` | `prisma.crmContact.update`, `randomUUID` |
| 2 | 4 new API routes under `portal/cliente/cotizaciones/` | session cookie, Prisma |
| 3 | `PortalCotizaciones.tsx`, `PortalClienteClient.tsx` | Task 2 APIs |
| 4 | `demo/generate/route.ts`, `demo/data/route.ts` | `AIService`, `portalClienteDemoData` |
| 5 | `PortalDemoOverlay.tsx`, `PortalClienteClient.tsx` | `session.isProspect` |
| 6 | `contract-data/route.ts`, `PortalContractForm.tsx` | `DocTemplate`, `DocSignatureRequest` |
| 7 | `PortalSignContract.tsx`, update `PortalContractForm.tsx` | `/api/docs/sign/[token]` |

**Implementation order:** 1 → 2 → 3 → 4 → 5 → 6 → 7. Tasks 4 and 5 can be done in parallel with 2 and 3.
