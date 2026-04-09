# Rediseño UX Rendiciones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar Rendiciones y Pagos en una página única con tabs, filtros avanzados (solicitante + fechas), interacción de click mejorada, barra sticky, y upload de comprobante con drag/drop/paste.

**Architecture:** Refactor de `RendicionesClient.tsx` como componente principal con 2 tabs internos. La lógica de `PagosClient.tsx` se integra como tab. Se crea un componente `FileDropZone` reutilizable para upload. Se crea `Calendar` + `DateRangePicker` con `react-day-picker`. El server component combina los datos de ambas páginas.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui (Popover, Tabs, Dialog, Badge, Select), react-day-picker, date-fns, Sonner (toasts)

**Spec:** `docs/superpowers/specs/2026-04-09-rendiciones-ux-redesign-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/ui/calendar.tsx` | Create | shadcn Calendar component wrapping react-day-picker |
| `src/components/ui/date-range-picker.tsx` | Create | DateRangePicker with presets + popover calendar |
| `src/components/shared/FileDropZone.tsx` | Create | Upload zone: drag & drop + click + paste (Ctrl+V) |
| `src/components/finance/RendicionesClient.tsx` | Rewrite | Unified page: tabs (Rendiciones/Pagos), filtros, selección, barra sticky |
| `src/components/finance/PagosTab.tsx` | Create | Tab de pagos extraído de PagosClient (KPIs, pendientes, historial, upload) |
| `src/app/(app)/finanzas/rendiciones/page.tsx` | Modify | Combinar datos de rendiciones + pagos en un solo server component |
| `src/app/(app)/finanzas/pagos/page.tsx` | Modify | Redirect a `/finanzas/rendiciones?tab=pagos` |

---

## Task 1: Install react-day-picker

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install dependency**

```bash
npm install react-day-picker@^9
```

- [ ] **Step 2: Verify installation**

```bash
node -e "require('react-day-picker')" && echo "OK"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install react-day-picker for date range filter"
```

---

## Task 2: Create Calendar component (shadcn pattern)

**Files:**
- Create: `src/components/ui/calendar.tsx`

- [ ] **Step 1: Create Calendar component**

Follow the shadcn pattern. This wraps `react-day-picker` with project styling. Before writing, check the latest `react-day-picker` v9 docs to get the correct imports and props — use the `context7` MCP tool to fetch current docs for `react-day-picker`. The v9 API changed significantly from v8 (no more `classNames` prop on `DayPicker`, different component structure).

```tsx
"use client";

import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

// NOTE: Verify react-day-picker v9 API before implementing.
// Use context7 MCP tool: resolve-library-id("react-day-picker") then query-docs
// Key things to verify:
// - How to pass classNames in v9 (it changed from v8)
// - How to customize nav buttons
// - How to set locale (es from date-fns)

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, ...props }: CalendarProps) {
  return (
    <DayPicker
      className={cn("p-3", className)}
      // Apply Tailwind classes matching the dark theme
      // Verify exact v9 API for className customization
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit src/components/ui/calendar.tsx 2>&1 | head -20
```

Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/calendar.tsx
git commit -m "feat: add Calendar UI component (react-day-picker v9)"
```

---

## Task 3: Create DateRangePicker component

**Files:**
- Create: `src/components/ui/date-range-picker.tsx`

- [ ] **Step 1: Create DateRangePicker**

Uses `Popover` (already exists at `src/components/ui/popover.tsx`) + `Calendar` + presets. Before implementing, verify the `react-day-picker` v9 API for range selection mode using the `context7` MCP tool.

```tsx
"use client";

import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

// NOTE: Verify react-day-picker v9 range mode API before implementing.
// v9 uses mode="range" on DayPicker, returns DateRange = { from?: Date; to?: Date }

export interface DateRange {
  from?: Date;
  to?: Date;
}

interface DateRangePickerProps {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  className?: string;
  placeholder?: string;
  presets?: { label: string; range: DateRange }[];
}

const DEFAULT_PRESETS: { label: string; range: DateRange }[] = [
  {
    label: "Este mes",
    range: {
      from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      to: new Date(),
    },
  },
  {
    label: "Mes pasado",
    range: {
      from: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1),
      to: new Date(new Date().getFullYear(), new Date().getMonth(), 0),
    },
  },
  {
    label: "Últimos 3 meses",
    range: {
      from: new Date(new Date().getFullYear(), new Date().getMonth() - 3, 1),
      to: new Date(),
    },
  },
];

export function DateRangePicker({
  value,
  onChange,
  className,
  placeholder = "Rango de fechas",
  presets = DEFAULT_PRESETS,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);

  const label = value?.from
    ? value.to
      ? `${format(value.from, "dd MMM", { locale: es })} – ${format(value.to, "dd MMM yyyy", { locale: es })}`
      : format(value.from, "dd MMM yyyy", { locale: es })
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-9 justify-start text-left text-xs font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        {/* Presets */}
        <div className="flex flex-col gap-1 border-b border-border p-2">
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                onChange(preset.range);
                setOpen(false);
              }}
              className="rounded-md px-3 py-1.5 text-xs text-left hover:bg-accent transition-colors"
            >
              {preset.label}
            </button>
          ))}
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
              className="rounded-md px-3 py-1.5 text-xs text-left text-muted-foreground hover:bg-accent transition-colors"
            >
              Limpiar
            </button>
          )}
        </div>
        {/* Calendar — verify v9 range mode API */}
        <Calendar
          mode="range"
          selected={value}
          onSelect={(range) => onChange(range ?? undefined)}
          locale={es}
          numberOfMonths={2}
        />
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit src/components/ui/date-range-picker.tsx 2>&1 | head -20
```

Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/date-range-picker.tsx
git commit -m "feat: add DateRangePicker with presets and calendar popover"
```

---

## Task 4: Create FileDropZone component

**Files:**
- Create: `src/components/shared/FileDropZone.tsx`

- [ ] **Step 1: Create FileDropZone**

Reusable upload zone with drag & drop, click to browse, and clipboard paste (Ctrl+V).

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, X, FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileDropZoneProps {
  onFile: (file: File) => void;
  accept?: string;
  uploading?: boolean;
  preview?: {
    name: string;
    size?: number;
    url?: string;
    type?: string;
  } | null;
  onRemove?: () => void;
  className?: string;
  compact?: boolean;
}

export function FileDropZone({
  onFile,
  accept = "image/jpeg,image/png,image/webp,application/pdf",
  uploading = false,
  preview,
  onRemove,
  className,
  compact = false,
}: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // Drag & drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  // File input change
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFile(file);
      e.target.value = "";
    },
    [onFile]
  );

  // Paste (Ctrl+V) listener
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            onFile(file);
          }
          break;
        }
      }
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [onFile]);

  const acceptTypes = accept
    .split(",")
    .map((t) => t.trim().split("/")[1]?.toUpperCase())
    .filter(Boolean);

  if (uploading) {
    return (
      <div className={cn("flex items-center justify-center rounded-lg border-2 border-dashed border-primary/30 bg-primary/5", compact ? "p-4" : "p-6", className)}>
        <Loader2 className="h-5 w-5 animate-spin text-primary mr-2" />
        <span className="text-sm text-muted-foreground">Subiendo...</span>
      </div>
    );
  }

  if (preview) {
    const isImage = preview.type?.startsWith("image/") || preview.name.match(/\.(jpg|jpeg|png|webp)$/i);
    return (
      <div className={cn("flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3", className)}>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background shrink-0">
          {isImage ? <ImageIcon className="h-5 w-5 text-emerald-400" /> : <FileText className="h-5 w-5 text-emerald-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-emerald-400 truncate">{preview.name}</p>
          {preview.size && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {(preview.size / 1024).toFixed(0)} KB
            </p>
          )}
        </div>
        {preview.url && (
          <a href={preview.url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground underline shrink-0">
            Ver
          </a>
        )}
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      ref={dropRef}
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "cursor-pointer rounded-lg border-2 border-dashed text-center transition-colors",
        isDragging
          ? "border-primary bg-primary/5"
          : "border-border hover:border-muted-foreground/50",
        compact ? "p-4" : "p-6",
        className
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleFileChange}
      />
      <Upload className={cn("mx-auto text-muted-foreground", compact ? "h-5 w-5 mb-1" : "h-7 w-7 mb-2")} />
      <p className={cn("text-muted-foreground", compact ? "text-xs" : "text-sm")}>
        Arrastra el comprobante aquí
      </p>
      <p className="text-xs text-muted-foreground/60 mt-1">
        o <span className="text-primary underline">busca en tu PC</span>{" "}
        · <kbd className="text-primary font-semibold">Ctrl+V</kbd> para pegar
      </p>
      {acceptTypes.length > 0 && (
        <div className="flex gap-1.5 justify-center mt-2">
          {acceptTypes.map((type) => (
            <span key={type} className="text-[10px] text-muted-foreground/50 bg-muted/50 px-1.5 py-0.5 rounded">
              {type}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit src/components/shared/FileDropZone.tsx 2>&1 | head -20
```

Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/FileDropZone.tsx
git commit -m "feat: add FileDropZone component (drag/drop + browse + Ctrl+V paste)"
```

---

## Task 5: Create PagosTab component

**Files:**
- Create: `src/components/finance/PagosTab.tsx`
- Reference: `src/components/finance/PagosClient.tsx` (extract logic from here)

- [ ] **Step 1: Create PagosTab**

Extract the pagos logic from `PagosClient.tsx` into a tab-ready component. Integrate `FileDropZone` for comprobante upload. The key differences from `PagosClient`:
- No `PageHeader` (it's a tab, not a page)
- Uses `FileDropZone` instead of plain `<input type="file">`
- Same data types and API calls

Read the full `PagosClient.tsx` file before implementing to ensure all functionality is preserved. The component should accept the same props as `PagosClient` (`payments`, `pendingRendiciones`) and replicate all its behavior:

- KPI cards (pendientes, monto pendiente, pagos realizados)
- Tabs: Pendientes | Historial
- Pending list with selection + create payment
- Payment history with expandable cards
- Santander export download
- Receipt upload (now via `FileDropZone`)

Key changes to make:
1. Replace the hidden `<input ref={receiptInputRef}>` + `triggerReceiptUpload()` + `onReceiptFileChange()` pattern with `FileDropZone` component
2. The `FileDropZone` handles drag/drop + click/browse + paste in one component
3. Show `FileDropZone` in each expanded payment card (where the receipt section is)
4. When a receipt already exists, show `FileDropZone` in preview mode with the receipt info
5. Keep all API calls, payment creation, and Santander export logic identical

```tsx
// Structure (do NOT use this skeleton as-is — read PagosClient.tsx and adapt):
"use client";

import { FileDropZone } from "@/components/shared/FileDropZone";
// ... import everything PagosClient uses except PageHeader

// Same types as PagosClient
interface PagosTabProps {
  payments: Payment[];
  pendingRendiciones: PendingRendicion[];
}

export function PagosTab({ payments, pendingRendiciones }: PagosTabProps) {
  // Port all state and handlers from PagosClient
  // Replace receipt upload logic with FileDropZone
  // Keep KPIs, selection, payment creation, Santander export
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit src/components/finance/PagosTab.tsx 2>&1 | head -20
```

Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/components/finance/PagosTab.tsx
git commit -m "feat: add PagosTab component with FileDropZone upload"
```

---

## Task 6: Rewrite RendicionesClient with unified layout

**Files:**
- Rewrite: `src/components/finance/RendicionesClient.tsx`

This is the main task. Read the current `RendicionesClient.tsx` fully before starting. The new component must:

- [ ] **Step 1: Read current implementation**

Read the full `RendicionesClient.tsx` to understand all existing functionality that must be preserved.

- [ ] **Step 2: Implement the new RendicionesClient**

The new component structure:

```
RendicionesClient
├── Header (title + nueva rendición button)
├── Tabs: Rendiciones | Pagos
├── Tab: Rendiciones
│   ├── Filters row (search + solicitante dropdown + date range picker)
│   ├── Status pills
│   ├── "Pagar aprobadas" button
│   ├── Count text
│   ├── Desktop table (DataTable with new click logic)
│   ├── Mobile cards (with new click logic)
│   └── Sticky bottom action bar (when selected)
├── Tab: Pagos
│   └── PagosTab component
├── Approve dialog (keep as-is)
├── Reject dialog (keep as-is)
└── Pay dialog (keep as-is)
```

**New props (expanded to include pagos data):**

```typescript
interface RendicionesClientProps {
  rendiciones: RendicionRow[];
  items: ItemOption[];
  canSubmit: boolean;
  canApprove: boolean;
  canPay: boolean;
  currentUserId: string;
  // New: pagos data
  payments: Payment[];
  pendingRendiciones: PendingRendicion[];
}
```

**New state:**

```typescript
const [activeTab, setActiveTab] = useState<"rendiciones" | "pagos">("rendiciones");
const [submitterFilter, setSubmitterFilter] = useState<string>("ALL");
const [dateRange, setDateRange] = useState<DateRange | undefined>();
```

**Updated filtering logic (add solicitante + date range):**

```typescript
const filtered = useMemo(() => {
  let list = rendiciones;
  if (statusFilter !== "ALL") {
    list = list.filter((r) => r.status === statusFilter);
  }
  if (submitterFilter !== "ALL") {
    list = list.filter((r) => r.submitterId === submitterFilter);
  }
  if (dateRange?.from) {
    list = list.filter((r) => new Date(r.date) >= dateRange.from!);
  }
  if (dateRange?.to) {
    list = list.filter((r) => new Date(r.date) <= dateRange.to!);
  }
  if (search.trim()) {
    const q = search.toLowerCase();
    list = list.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q) ||
        r.submitterName.toLowerCase().includes(q) ||
        r.itemName?.toLowerCase().includes(q) ||
        r.beneficiaryName?.toLowerCase().includes(q)
    );
  }
  return list;
}, [rendiciones, statusFilter, submitterFilter, dateRange, search]);
```

**Submitter options (derived from data):**

```typescript
const submitters = useMemo(() => {
  const map = new Map<string, string>();
  for (const r of rendiciones) {
    map.set(r.submitterId, r.submitterName);
  }
  return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
}, [rendiciones]);
```

**Click logic changes:**

Desktop table `onRowClick`:
```typescript
onRowClick={(row) => toggleSelect(row.id)}
```

The code column render must use `e.stopPropagation()` and navigate:
```typescript
{
  key: "code",
  label: "Código",
  render: (value: string, row: RendicionRow) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        router.push(`/finanzas/rendiciones/${row.id}`);
      }}
      className="font-mono text-xs text-primary underline hover:text-primary/80"
    >
      {value}
    </button>
  ),
}
```

**Selection rules — checkbox column:**

Only show checkbox for selectable statuses:
```typescript
const isSelectable = (status: string) =>
  ["SUBMITTED", "IN_APPROVAL", "APPROVED"].includes(status);
```

In the checkbox column render:
```typescript
render: (_: unknown, row: RendicionRow) => {
  if (!isSelectable(row.status)) return <div className="w-4" />;
  // ... render checkbox
}
```

**"Pagar aprobadas" button handler:**
```typescript
const handlePayApproved = useCallback(() => {
  setStatusFilter("APPROVED");
  // Select all approved rendiciones
  const approvedIds = rendiciones
    .filter((r) => r.status === "APPROVED")
    .map((r) => r.id);
  setSelectedIds(new Set(approvedIds));
}, [rendiciones]);
```

**Sticky bottom bar:**

```tsx
{selectedIds.size > 0 && (
  <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-sm px-4 py-3 md:left-[var(--sidebar-width,0px)]">
    <div className="mx-auto max-w-screen-xl flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3 text-sm">
        <button type="button" onClick={toggleSelectAll} className="text-xs text-primary underline">
          {filtered.filter(r => isSelectable(r.status)).every((r) => selectedIds.has(r.id))
            ? "Deseleccionar todo"
            : "Seleccionar todo"}
        </button>
        <span className="text-muted-foreground">
          {selectedIds.size} seleccionada(s) ={" "}
          <span className="font-medium text-foreground">{fmtCLP.format(selectedAmount)}</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        {/* Aprobar/Rechazar/Pagar buttons — same logic as current */}
      </div>
    </div>
  </div>
)}
```

**URL tab support via searchParams:**

Read `?tab=pagos` from URL to set initial tab (for redirect from pagos page):
```typescript
// In server component, pass initialTab prop
// Or use useSearchParams() in client
const searchParams = useSearchParams();
const initialTab = searchParams.get("tab") === "pagos" ? "pagos" : "rendiciones";
const [activeTab, setActiveTab] = useState<"rendiciones" | "pagos">(initialTab);
```

**Remove the typeFilter dropdown** — type can be searched via the text search.

**Remove the view mode toggle (list/cards)** — always use list view (table on desktop, cards on mobile). The cards view added complexity without value for the admin workflow.

**Status tabs — remove DRAFT** from the admin view since drafts are the submitter's responsibility.

**Mobile cards — updated click behavior:**

```tsx
{filtered.map((r) => {
  const selectable = isSelectable(r.status);
  return (
    <div
      key={r.id}
      className={cn("rounded-lg border p-3 transition-colors", ...)}
      onClick={() => selectable && toggleSelect(r.id)}
    >
      {/* Checkbox area */}
      {selectable && (
        <div className={cn("h-4 w-4 rounded border ...", ...)}>
          {/* checkbox */}
        </div>
      )}
      {/* Code as link */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          router.push(`/finanzas/rendiciones/${r.id}`);
        }}
        className="font-mono text-xs text-primary underline"
      >
        {r.code}
      </button>
      {/* ... rest of card content */}
    </div>
  );
})}
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit src/components/finance/RendicionesClient.tsx 2>&1 | head -20
```

Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/components/finance/RendicionesClient.tsx
git commit -m "feat: rewrite RendicionesClient with unified tabs, filters, and sticky bar"
```

---

## Task 7: Update server component to combine rendiciones + pagos data

**Files:**
- Modify: `src/app/(app)/finanzas/rendiciones/page.tsx`

- [ ] **Step 1: Read current page.tsx**

Read the current server component fully.

- [ ] **Step 2: Add pagos data fetching**

Merge the data fetching from `pagos/page.tsx` into the rendiciones `page.tsx`. The payments query and pending rendiciones query should run in parallel with the existing queries.

```typescript
// Add to the Promise.all:
const [rendiciones, items, payments, approvedRendiciones] = await Promise.all([
  // existing rendiciones query...
  // existing items query...
  // payments query (from pagos/page.tsx):
  prisma.financePayment.findMany({
    where: { tenantId },
    include: {
      rendiciones: {
        select: { id: true, code: true, amount: true, submitterId: true },
      },
    },
    orderBy: { paidAt: "desc" },
    take: 100,
  }),
  // pending rendiciones for payment (from pagos/page.tsx):
  prisma.financeRendicion.findMany({
    where: { tenantId, status: "APPROVED", paymentId: null },
    include: {
      item: { select: { name: true } },
      costCenter: { select: { name: true } },
      beneficiaryGuardia: {
        select: {
          id: true,
          persona: { select: { firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  }),
]);
```

Also merge the admin name resolution to include payment paidBy IDs:
```typescript
const paymentUserIds = payments.map((p) => p.paidById);
const allAdminIds = [...new Set([...submitterIds, ...beneficiaryAdminIds, ...paymentUserIds])];
```

Map payments data (copy the mapping logic from `pagos/page.tsx`) and pass to `RendicionesClient`:

```tsx
<RendicionesClient
  rendiciones={data}
  items={items}
  canSubmit={canSubmit}
  canApprove={canApprove}
  canPay={canPay}
  currentUserId={session.user.id}
  payments={paymentsData}
  pendingRendiciones={pendingData}
/>
```

Only fetch payments data if user `canPay`. Otherwise pass empty arrays:

```typescript
const [payments, approvedRendiciones] = canPay
  ? await Promise.all([paymentsQuery, approvedQuery])
  : [[], []];
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit src/app/\(app\)/finanzas/rendiciones/page.tsx 2>&1 | head -20
```

Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/finanzas/rendiciones/page.tsx"
git commit -m "feat: combine rendiciones + pagos data in server component"
```

---

## Task 8: Redirect pagos page to rendiciones

**Files:**
- Modify: `src/app/(app)/finanzas/pagos/page.tsx`

- [ ] **Step 1: Replace with redirect**

```typescript
import { redirect } from "next/navigation";

export default function PagosPage() {
  redirect("/finanzas/rendiciones?tab=pagos");
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(app)/finanzas/pagos/page.tsx"
git commit -m "feat: redirect pagos page to unified rendiciones view"
```

---

## Task 9: Verify full flow end-to-end

**Files:** None (testing)

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test rendiciones tab**

Navigate to `/finanzas/rendiciones`. Verify:
- [ ] Tabs "Rendiciones | Pagos" are visible
- [ ] Search input works
- [ ] Solicitante dropdown shows unique submitters
- [ ] Date range picker opens with presets
- [ ] Status pills filter correctly with counts
- [ ] "Pagar aprobadas" button filters to APPROVED and selects all
- [ ] Click on code navigates to detail
- [ ] Click on rest of row selects/deselects
- [ ] Checkboxes only show for SUBMITTED/IN_APPROVAL/APPROVED
- [ ] No checkbox on PAID/REJECTED rows
- [ ] Sticky bar appears at bottom when items selected
- [ ] Approve/Reject/Pay buttons show correct counts

- [ ] **Step 3: Test pagos tab**

Click "Pagos" tab. Verify:
- [ ] KPI cards show correct numbers
- [ ] Pending rendiciones list with selection
- [ ] Create payment flow works
- [ ] Payment history cards expand
- [ ] FileDropZone shows in expanded payment
- [ ] Drag & drop upload works
- [ ] Click/browse upload works
- [ ] Ctrl+V paste of screenshot works
- [ ] Receipt preview shows after upload

- [ ] **Step 4: Test mobile**

Open Chrome DevTools → mobile view (iPhone 14 or similar). Verify:
- [ ] Tabs work on mobile
- [ ] Filter chips are horizontally scrollable
- [ ] Cards render properly
- [ ] Click on code navigates
- [ ] Click on card body selects
- [ ] Sticky bar works on mobile
- [ ] FileDropZone works on mobile (click to browse)

- [ ] **Step 5: Test redirect**

Navigate to `/finanzas/pagos`. Verify it redirects to `/finanzas/rendiciones?tab=pagos`.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: polish rendiciones UX after e2e testing"
```

---

## Task 10: Clean up old PagosClient

**Files:**
- Modify: `src/components/finance/PagosClient.tsx`

- [ ] **Step 1: Verify PagosClient is no longer imported anywhere**

```bash
grep -r "PagosClient" src/ --include="*.tsx" --include="*.ts" -l
```

Expected: Only `PagosClient.tsx` itself (no imports from other files since pagos page now redirects).

- [ ] **Step 2: Delete or deprecate PagosClient**

If no imports found, delete the file:
```bash
rm src/components/finance/PagosClient.tsx
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove PagosClient (replaced by PagosTab in unified view)"
```
