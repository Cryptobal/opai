# Sprint 2 v2 — Cotizaciones que Convierten — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the 3 existing cotización components into a single, premium system that works for both prospects and active clients.

**Architecture:** Create a `cotizaciones/` subfolder with 6 new focused components (CotizacionCard, GardServiceIncludes, CotizacionRejectDialog, CotizacionApproveDialog, DashboardCotizacionesPendientes, WhatsAppButton). Refactor PortalCotizaciones as the unified admin view. Replace ProspectCotizacionCarousel in dashboard. Route both "propuesta" and "cotizaciones" sections to the same unified component with `isProspect` flag.

**Tech Stack:** Next.js 14, React, Tailwind CSS, shadcn/ui (dialog, badge, card, chip-tabs), Lucide icons

---

## Key Decisions (from audit)

1. **reject endpoint already accepts `{ reason?: string }`** stored in `notes` — NO API change needed
2. **`/approve` vs `/accept-proposal` are fundamentally different** — `/approve` is lightweight (just status + deal stage), `/accept-proposal` activates account, creates channels, sends email. CotizacionCard must call the right one based on `context` prop.
3. **No "pending" status in DB** — only `draft | sent | approved | rejected`. Treat `sent` as the actionable status.
4. **"Expired" is computed client-side:** `validUntil < today && !['approved','rejected'].includes(status)`
5. **PortalContractForm** must be preserved — shown after client approval (not prospect).
6. **Deal grouping** from PortalPropuesta must be preserved in the unified view.

## File Structure

```
src/components/portal/cliente/cotizaciones/
├── types.ts                          # Shared types + helpers
├── WhatsAppButton.tsx                # Reusable WhatsApp CTA
├── GardServiceIncludes.tsx           # "Qué incluye con Gard" section
├── CotizacionRejectDialog.tsx        # Reject modal with reason chips
├── CotizacionApproveDialog.tsx       # Approve confirmation modal
├── CotizacionCard.tsx                # Unified card (dashboard + full variants)
└── DashboardCotizacionesPendientes.tsx # Dashboard widget

Modified files:
├── src/components/portal/cliente/PortalCotizaciones.tsx  # Refactored as unified admin view
├── src/components/portal/cliente/PortalDashboard.tsx     # Replace carousel with new widget
├── src/app/portal/cliente/PortalClienteClient.tsx        # Route propuesta → unified component
└── src/components/portal/cliente/PortalClienteNav.tsx    # Badge on "Más" for pending

Deleted files:
├── src/components/portal/cliente/ProspectCotizacionCarousel.tsx  # Replaced
└── src/components/portal/cliente/PortalPropuesta.tsx              # Replaced
```

---

## Chunk 1: Foundation Components (types, WhatsApp, GardServiceIncludes)

### Task 1: Create shared types and helpers

**Files:**
- Create: `src/components/portal/cliente/cotizaciones/types.ts`

- [ ] **Step 1: Create types file with shared interfaces and helpers**

```typescript
// All type definitions needed across cotizaciones components
// Extracted from PortalCotizaciones.tsx + PortalPropuesta.tsx + new fields

export type CotizacionStatus = "draft" | "sent" | "approved" | "rejected";

export interface QuoteSummary {
  id: string;
  code: string;
  name: string | null;
  status: string;
  monthlyCost: number;
  validUntil: string | null;
  totalPositions: number;
  totalGuards: number;
  currency: string;
  createdAt: string;
  dealId: string | null;
  dealTitle: string | null;
  proposalLink: string | null;
}

export interface Position {
  id: string;
  customName: string | null;
  numGuards: number | null;
  numPuestos: number | null;
  startTime: string | null;
  endTime: string | null;
  weekdays: string | null;
  monthlyPositionCost: number;
}

export interface AdditionalLine {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  orden: number;
}

export interface QuoteDetail extends QuoteSummary {
  positions: Position[];
  additionalLines?: AdditionalLine[];
  notes: string | null;
  aiDescription: string | null;
  serviceDetail: string | null;
}

export interface DealGroup {
  dealId: string;
  dealTitle: string;
  quotes: QuoteSummary[];
}

// Status display config
export const STATUS_BADGE: Record<string, string> = {
  draft:    "bg-zinc-800 text-zinc-400",
  sent:     "bg-blue-900/60 text-blue-300",
  approved: "bg-emerald-900/60 text-emerald-300",
  rejected: "bg-red-900/60 text-red-400",
  expired:  "bg-zinc-700 text-zinc-400",
};

export const STATUS_LABEL: Record<string, string> = {
  draft:    "Borrador",
  sent:     "Enviada",
  approved: "Aprobada",
  rejected: "Rechazada",
  expired:  "Expirada",
};

// Helpers
export function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-CL", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

export function formatHorario(start: string | null, end: string | null): string {
  if (!start && !end) return "—";
  return `${start ?? ""}–${end ?? ""}`;
}

const FULL_WEEK = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const WEEKDAYS_ONLY = ["Lun", "Mar", "Mié", "Jue", "Vie"];
const WEEKEND_ONLY = ["Sáb", "Dom"];

export function formatWeekdays(days: string[] | string | null): string {
  if (!days) return "—";
  const arr = Array.isArray(days) ? days : [days];
  if (arr.length === 0) return "—";
  if (arr.length === 7 || FULL_WEEK.every((d) => arr.includes(d))) return "Lun-Dom";
  if (arr.length === 5 && WEEKDAYS_ONLY.every((d) => arr.includes(d))) return "Lun-Vie";
  if (arr.length === 2 && WEEKEND_ONLY.every((d) => arr.includes(d))) return "Sáb-Dom";
  if (arr.length === 6 && WEEKDAYS_ONLY.every((d) => arr.includes(d)) && arr.includes("Sáb")) return "Lun-Sáb";
  return arr.join(", ");
}

export function seemsCurrencyWrong(amount: number, currency: string): boolean {
  return (currency === "UF" && amount > 5000) || (currency === "CLP" && amount > 0 && amount < 1000);
}

export function isExpired(quote: QuoteSummary): boolean {
  if (["approved", "rejected"].includes(quote.status)) return false;
  if (!quote.validUntil) return false;
  return new Date(quote.validUntil) < new Date();
}

export function getDisplayStatus(quote: QuoteSummary): string {
  if (isExpired(quote)) return "expired";
  return quote.status;
}

export function groupByDeal(quotes: QuoteSummary[]): DealGroup[] {
  const map = new Map<string, DealGroup>();
  for (const q of quotes) {
    const key = q.dealId ?? `no-deal-${q.id}`;
    const existing = map.get(key);
    if (existing) {
      existing.quotes.push(q);
    } else {
      map.set(key, {
        dealId: key,
        dealTitle: q.dealTitle ?? q.name ?? q.code,
        quotes: [q],
      });
    }
  }
  for (const group of map.values()) {
    group.quotes.sort((a, b) => {
      const aActive = a.status === "sent" ? 0 : 1;
      const bActive = b.status === "sent" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }
  return Array.from(map.values());
}
```

- [ ] **Step 2: Verify file created**

Run: `ls -la src/components/portal/cliente/cotizaciones/types.ts`

---

### Task 2: WhatsAppButton component

**Files:**
- Create: `src/components/portal/cliente/cotizaciones/WhatsAppButton.tsx`

- [ ] **Step 1: Create WhatsAppButton**

```tsx
"use client";

import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface WhatsAppButtonProps {
  variant?: "default" | "compact" | "inline";
  context?: "prospect" | "client";
  cotizacionCode?: string;
  className?: string;
}

export function WhatsAppButton({
  variant = "default",
  context = "client",
  cotizacionCode,
  className,
}: WhatsAppButtonProps) {
  const message = cotizacionCode
    ? context === "prospect"
      ? `Hola, tengo una consulta sobre la propuesta ${cotizacionCode}`
      : `Hola, tengo una consulta sobre la cotización ${cotizacionCode}`
    : "Hola, tengo una consulta sobre mi servicio de seguridad";

  const url = `https://wa.me/56982307771?text=${encodeURIComponent(message)}`;

  if (variant === "inline") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn("text-xs text-emerald-400 hover:text-emerald-300 underline underline-offset-2", className)}
      >
        WhatsApp +56 9 8230 7771
      </a>
    );
  }

  if (variant === "compact") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "flex items-center gap-2 px-3 h-8 rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-xs transition-colors",
          className,
        )}
      >
        <MessageCircle className="w-3.5 h-3.5" />
        WhatsApp
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex items-center justify-center gap-2 w-full h-10 rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-sm font-medium transition-colors",
        className,
      )}
    >
      <MessageCircle className="w-4 h-4" />
      WhatsApp +56 9 8230 7771
    </a>
  );
}
```

---

### Task 3: GardServiceIncludes component

**Files:**
- Create: `src/components/portal/cliente/cotizaciones/GardServiceIncludes.tsx`

- [ ] **Step 1: Create GardServiceIncludes**

```tsx
"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface GardServiceIncludesProps {
  variant?: "full" | "compact";
  className?: string;
}

const ALWAYS_ITEMS = [
  "Rondas GPS en tiempo real",
  "Trust Score de guardias",
  "Portal de cliente 24/7",
  "Chat directo con equipo Gard",
  "Documentación digital completa",
  "Cumplimiento normativo automático (Ley 21.659)",
  "Programa de capacitación certificado",
  "Control anti-doble turno",
];

const COMPACT_ITEMS = ALWAYS_ITEMS.slice(0, 5);

export function GardServiceIncludes({ variant = "full", className }: GardServiceIncludesProps) {
  const items = variant === "compact" ? COMPACT_ITEMS : ALWAYS_ITEMS;

  return (
    <div className={cn("rounded-xl border border-white/[0.06] bg-white/[0.02] p-4", className)}>
      <div className="flex items-center gap-2 mb-3">
        <h4 className="text-sm font-semibold text-zinc-200">Qué incluye con Gard</h4>
        <span className="text-[10px] uppercase tracking-wider bg-teal-500/10 text-teal-400/70 rounded-full px-2 py-0.5 font-medium">
          Tecnología OPAI
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {items.map((item) => (
          <div key={item} className="flex items-start gap-2">
            <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
            <span className="text-xs text-zinc-300">{item}</span>
          </div>
        ))}
      </div>
      {variant === "compact" && ALWAYS_ITEMS.length > COMPACT_ITEMS.length && (
        <p className="text-[10px] text-zinc-500 mt-2">
          +{ALWAYS_ITEMS.length - COMPACT_ITEMS.length} servicios incluidos más
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit foundation components**

```bash
git add src/components/portal/cliente/cotizaciones/types.ts \
        src/components/portal/cliente/cotizaciones/WhatsAppButton.tsx \
        src/components/portal/cliente/cotizaciones/GardServiceIncludes.tsx
git commit -m "feat(cotizaciones): add foundation — types, WhatsAppButton, GardServiceIncludes"
```

---

## Chunk 2: Dialog Components (Reject + Approve)

### Task 4: CotizacionRejectDialog

**Files:**
- Create: `src/components/portal/cliente/cotizaciones/CotizacionRejectDialog.tsx`

- [ ] **Step 1: Create reject dialog with reason chips**

Uses `Dialog` from `@/components/ui/dialog`. Predefined reasons as selectable chips, optional textarea. Sends combined string to callback.

```tsx
"use client";

import { useState } from "react";
import { XCircle, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const REJECTION_REASONS = [
  "Precio fuera de presupuesto",
  "El alcance no se ajusta a lo que necesito",
  "No es el momento adecuado",
  "Elegí otro proveedor",
  "Otro motivo",
];

interface CotizacionRejectDialogProps {
  quoteName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason?: string) => Promise<void>;
}

export function CotizacionRejectDialog({
  quoteName, open, onOpenChange, onConfirm,
}: CotizacionRejectDialogProps) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      let reason: string | undefined;
      if (selectedReason && comment) {
        reason = `${selectedReason} — ${comment}`;
      } else if (selectedReason) {
        reason = selectedReason;
      } else if (comment) {
        reason = comment;
      }
      await onConfirm(reason);
      setSelectedReason(null);
      setComment("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Rechazar propuesta</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-zinc-400">
          Estás rechazando: <span className="text-zinc-200 font-medium">"{quoteName}"</span>
        </p>

        <div className="space-y-3">
          <p className="text-xs text-zinc-500">¿Nos ayudas a mejorar? (opcional)</p>
          <div className="flex flex-wrap gap-2">
            {REJECTION_REASONS.map((reason) => (
              <button
                key={reason}
                onClick={() => setSelectedReason(selectedReason === reason ? null : reason)}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-full border transition-colors",
                  selectedReason === reason
                    ? "border-red-500/50 bg-red-500/10 text-red-300"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-500",
                )}
              >
                {reason}
              </button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Comentario adicional..."
            rows={2}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-red-600 resize-none"
          />
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex items-center justify-center gap-2 h-10 rounded-lg bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
            Confirmar rechazo
          </button>
          <button
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="h-10 rounded-lg border border-zinc-700 text-zinc-400 text-sm hover:text-zinc-200 transition-colors"
          >
            Volver
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

---

### Task 5: CotizacionApproveDialog

**Files:**
- Create: `src/components/portal/cliente/cotizaciones/CotizacionApproveDialog.tsx`

- [ ] **Step 1: Create approve dialog**

```tsx
"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";

interface CotizacionApproveDialogProps {
  quoteName: string;
  monthlyCost: number;
  currency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  isProspect?: boolean;
}

export function CotizacionApproveDialog({
  quoteName, monthlyCost, currency, open, onOpenChange, onConfirm, isProspect,
}: CotizacionApproveDialogProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm();
      setSuccess(true);
      setTimeout(() => {
        onOpenChange(false);
        setSuccess(false);
      }, 2000);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!loading) { onOpenChange(v); setSuccess(false); } }}>
      <DialogContent className="sm:max-w-md">
        {success ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="w-14 h-14 rounded-full bg-emerald-900/40 flex items-center justify-center">
              <Check className="w-7 h-7 text-emerald-400" />
            </div>
            <p className="text-sm font-medium text-emerald-300">
              {isProspect ? "¡Propuesta aceptada!" : "¡Cotización aprobada!"}
            </p>
            <p className="text-xs text-zinc-400 text-center">
              Tu ejecutivo te contactará en las próximas 24 horas.
            </p>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <Check className="w-5 h-5 text-emerald-400" />
                {isProspect ? "Aceptar propuesta" : "Confirmar aprobación"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              <p className="text-sm text-zinc-400">
                Estás {isProspect ? "aceptando la propuesta" : "aprobando la cotización"}:
              </p>
              <p className="text-sm text-zinc-200 font-medium">"{quoteName}"</p>
              <p className="text-sm text-zinc-400">
                Valor mensual:{" "}
                <span className="text-teal-400 font-semibold">
                  {formatCurrency(monthlyCost, currency === "UF" ? "UF" : "CLP")}
                </span>
              </p>
              <p className="text-xs text-zinc-500">
                Al confirmar, nuestro equipo iniciará el proceso de implementación de tu servicio.
                Un ejecutivo te contactará en las próximas 24 horas.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-colors"
                style={{ background: "linear-gradient(135deg, #0d9488, #14b8a6)" }}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {isProspect ? "Confirmar aceptación" : "Confirmar aprobación"}
              </button>
              <button
                onClick={() => onOpenChange(false)}
                disabled={loading}
                className="h-10 rounded-lg border border-zinc-700 text-zinc-400 text-sm hover:text-zinc-200 transition-colors"
              >
                Volver
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit dialogs**

```bash
git add src/components/portal/cliente/cotizaciones/CotizacionRejectDialog.tsx \
        src/components/portal/cliente/cotizaciones/CotizacionApproveDialog.tsx
git commit -m "feat(cotizaciones): add CotizacionApproveDialog and CotizacionRejectDialog"
```

---

## Chunk 3: CotizacionCard — The Core Component

### Task 6: CotizacionCard

**Files:**
- Create: `src/components/portal/cliente/cotizaciones/CotizacionCard.tsx`

- [ ] **Step 1: Create CotizacionCard**

This is the largest component. Supports `variant: "dashboard" | "full"` and `context: "prospect" | "client"`.

**Dashboard variant:** Compact card — badge, name, cost, positions, validity, "Ver detalle" link.

**Full variant:** Complete detail view with:
- Header + status badge
- Financial summary
- GardServiceIncludes
- Positions table (expandable)
- Additional lines (if any)
- AI description with "Análisis OPAI AI" badge
- Action buttons (approve/reject/consult/PDF/WhatsApp) based on status
- Brand footer: "Propuesta generada en plataforma OPAI · lx3.ai"

**Key logic:**
- Actions only for `sent` status (and not expired)
- Approve calls `/accept-proposal` for prospects, `/approve` for clients
- After client approval, parent shows PortalContractForm
- PDF download via blob
- `getDisplayStatus()` to show "expired" when validUntil has passed

```tsx
// Full implementation — see code in execution step
// Props:
interface CotizacionCardProps {
  cotizacion: QuoteSummary;
  detail?: QuoteDetail | null;
  detailLoading?: boolean;
  variant: "dashboard" | "full";
  context: "prospect" | "client";
  onToggleExpand?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onConsult?: () => void;
  onViewProposal?: () => void;
  className?: string;
}
```

**Status → action mapping:**
- `sent` (not expired): approve, reject, consult, PDF, WhatsApp
- `approved`: consult, PDF, WhatsApp
- `rejected`: consult, PDF, WhatsApp
- `expired` (computed): consult, PDF, WhatsApp

- [ ] **Step 2: Commit**

```bash
git add src/components/portal/cliente/cotizaciones/CotizacionCard.tsx
git commit -m "feat(cotizaciones): add CotizacionCard — unified card component"
```

---

## Chunk 4: Dashboard Widget

### Task 7: DashboardCotizacionesPendientes

**Files:**
- Create: `src/components/portal/cliente/cotizaciones/DashboardCotizacionesPendientes.tsx`

- [ ] **Step 1: Create dashboard widget**

Fetches cotizaciones, filters to actionable ones (`sent` status, not expired). Two layouts:

**Prospect (hero):**
- Marketing headline: "Tu propuesta de seguridad está lista"
- Marketing copy about Gard
- CotizacionCard(s) in dashboard variant
- Horizontal scroll on mobile for 3+
- "Propuesta exclusiva · Plataforma OPAI" footer

**Client (banner):**
- "Tienes X cotizaciones por revisar" with pulsing dot
- Compact inline cards
- "Ver todas las cotizaciones →" link

Returns `null` if no pending cotizaciones.

```tsx
// Props:
interface DashboardCotizacionesPendientesProps {
  isProspect: boolean;
  onNavigateToDetail: (section: string) => void;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/portal/cliente/cotizaciones/DashboardCotizacionesPendientes.tsx
git commit -m "feat(cotizaciones): add DashboardCotizacionesPendientes widget"
```

---

## Chunk 5: Refactor Existing Components

### Task 8: Refactor PortalCotizaciones as unified admin view

**Files:**
- Modify: `src/components/portal/cliente/PortalCotizaciones.tsx`

- [ ] **Step 1: Rewrite PortalCotizaciones**

Changes:
1. Add `isProspect?: boolean` and `onNavigate?: (section: string) => void` props
2. Add filter tabs: Todas | Pendientes | Aprobadas | Rechazadas (use chip-tabs or simple buttons)
3. Use `CotizacionCard` for each quote instead of inline rendering
4. Accordion expand for detail (keep existing expand/collapse pattern)
5. Show `CotizacionApproveDialog` and `CotizacionRejectDialog` instead of inline forms
6. Preserve PortalContractForm integration for clients after approval
7. For prospects: group by deal with version history (from PortalPropuesta logic)
8. For prospects: use accept-proposal endpoint; for clients: use approve endpoint
9. PDF download support for both
10. Differentiated empty states by isProspect
11. Import types from `./cotizaciones/types`
12. Brand footer on expanded detail

- [ ] **Step 2: Commit**

```bash
git add src/components/portal/cliente/PortalCotizaciones.tsx
git commit -m "refactor(cotizaciones): unify PortalCotizaciones for prospect + client"
```

---

### Task 9: Update PortalDashboard

**Files:**
- Modify: `src/components/portal/cliente/PortalDashboard.tsx`

- [ ] **Step 1: Replace ProspectCotizacionCarousel**

1. Remove import of `ProspectCotizacionCarousel`
2. Import `DashboardCotizacionesPendientes` from `./cotizaciones/DashboardCotizacionesPendientes`
3. Replace the `{isProspect && (<ProspectCotizacionCarousel ... />)}` block (lines 189-194) with:
   ```tsx
   <DashboardCotizacionesPendientes
     isProspect={!!isProspect}
     onNavigateToDetail={(section) => onNavigate?.(section)}
   />
   ```
4. Render it for BOTH prospect AND client (not just prospect) — above the KPIs

- [ ] **Step 2: Commit**

```bash
git add src/components/portal/cliente/PortalDashboard.tsx
git commit -m "refactor(dashboard): replace carousel with DashboardCotizacionesPendientes"
```

---

### Task 10: Update PortalClienteClient routing

**Files:**
- Modify: `src/app/portal/cliente/PortalClienteClient.tsx`

- [ ] **Step 1: Route propuesta to unified component**

1. Remove import of `PortalPropuesta`
2. Update `case "cotizaciones"` (line 175-180):
   ```tsx
   case "cotizaciones":
     return (
       <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-4 pb-24">
         <PortalCotizaciones
           session={session}
           isProspect={false}
           onNavigate={(s) => setActiveSection(s as PortalSection)}
         />
       </div>
     );
   ```
3. Update `case "propuesta"` (line 191-197):
   ```tsx
   case "propuesta":
     return (
       <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-4 pb-24">
         <PortalCotizaciones
           session={session}
           isProspect={true}
           onNavigate={(s) => setActiveSection(s as PortalSection)}
         />
       </div>
     );
   ```

- [ ] **Step 2: Commit**

```bash
git add src/app/portal/cliente/PortalClienteClient.tsx
git commit -m "refactor(routing): route propuesta + cotizaciones to unified component"
```

---

### Task 11: Delete old components

**Files:**
- Delete: `src/components/portal/cliente/ProspectCotizacionCarousel.tsx`
- Delete: `src/components/portal/cliente/PortalPropuesta.tsx`

- [ ] **Step 1: Delete files and clean imports**

1. Delete `ProspectCotizacionCarousel.tsx`
2. Delete `PortalPropuesta.tsx`
3. Verify no remaining imports reference these files:
   ```bash
   grep -rn "ProspectCotizacionCarousel\|PortalPropuesta" src/ --include="*.tsx" --include="*.ts"
   ```
4. Fix any remaining references

- [ ] **Step 2: Commit**

```bash
git add -u
git commit -m "chore: remove PortalPropuesta and ProspectCotizacionCarousel (replaced by unified system)"
```

---

## Chunk 6: Build Verification

### Task 12: Build and verify

- [ ] **Step 1: Run build**

```bash
npm run build 2>&1 | head -80
```

Expected: Build succeeds without errors.

- [ ] **Step 2: Verify new components exist**

```bash
ls -la src/components/portal/cliente/cotizaciones/
```

Expected: types.ts, WhatsAppButton.tsx, GardServiceIncludes.tsx, CotizacionRejectDialog.tsx, CotizacionApproveDialog.tsx, CotizacionCard.tsx, DashboardCotizacionesPendientes.tsx

- [ ] **Step 3: Verify old components removed**

```bash
ls src/components/portal/cliente/ProspectCotizacionCarousel.tsx 2>/dev/null && echo "FAIL: still exists" || echo "OK: removed"
ls src/components/portal/cliente/PortalPropuesta.tsx 2>/dev/null && echo "FAIL: still exists" || echo "OK: removed"
```

- [ ] **Step 4: Verify no broken imports**

```bash
grep -rn "ProspectCotizacionCarousel\|from.*PortalPropuesta" src/ --include="*.tsx" --include="*.ts"
```

Expected: No results.

- [ ] **Step 5: Verify WhatsApp number and lx3.ai link**

```bash
grep -rn "56982307771" src/components/portal/cliente/cotizaciones/ --include="*.tsx"
grep -rn "lx3.ai" src/components/portal/cliente/cotizaciones/ --include="*.tsx"
```

Expected: Both found.

- [ ] **Step 6: Final commit if any fixes needed**

```bash
git add -A && git status
# Only commit if there are changes
```
