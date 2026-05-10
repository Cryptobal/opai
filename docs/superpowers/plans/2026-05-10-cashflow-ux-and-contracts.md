# Cashflow UX Polish + Contract↔Installation Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Iteración 2 del módulo Flujo de Caja: hacer que cada contrato de venta (`CpqQuote`) se proyecte por instalación con un modo de día de pago configurable, agregar UX de adelantar/atrasar/editar movimientos en la matriz semanal, mejorar el editor de mappings categoría↔cuenta (chip con nombre, buscador, atajo crear cuenta), explicar tolerancias claramente y mostrar la lista de items proyectados al expandir cualquier categoría en configuración.

**Architecture:** Tres fases acumulativas, cada una despliegable y testeable por separado:

- **Fase A (UX puro):** Helper texts, chip mejorado con nombre de cuenta + buscador, atajo para crear cuenta contable, popover de mover/editar monto sobre la celda en la matriz semanal.
- **Fase B (modelo de datos):** `CpqQuote` gana `paymentDayMode` (ENUM: `SPECIFIC_DAY` | `FIRST_BUSINESS_DAY` | `FIRST_MONDAY` | `LAST_BUSINESS_DAY`); migrar generator `sales-from-contracts` para respetarlo. UI nueva "Contratos activos (cashflow)" en la ficha de cuenta que lista los `CpqQuote` con `accountId` y permite editar `installationId` + `paymentDayMode` + `paymentDay` desde un modal.
- **Fase C (categorías expandibles):** Cada categoría en configuración es un acordeón que al abrirse muestra (a) los items manuales (`FinanceCashflowItem`) y (b) las fuentes auto-generadas (CpqQuote para ING_VENTA_CONTRATO, dotación para EGR_SUELDO, lotes TE para EGR_TURNO_EXTRA, F29 para EGR_IVA_F29). Las 4 categorías sistema con generator linkean al recurso fuente (CpqQuote → modal de edición B). Las otras 12 listan sus `FinanceCashflowItem` con CRUD inline.

**Tech Stack:** Next.js 16 App Router, Prisma 6, PostgreSQL (Neon), TypeScript estricto, React. Migraciones Prisma. Vitest para lógica pura (mock prisma). DnD ya está instalado de la fase anterior.

**Out of scope:** Refactor de la sección "Contratos" actual (PDFs subidos) — esa queda intacta; agregamos una sección separada para cotizaciones activas. Permission model unchanged. Generators que no son de ventas (`payroll-from-dotacion`, `iva-from-dte`, `recurring-dte`, `turnos-extra-from-history`) no se tocan en este plan.

---

## File Structure

### Phase A — UX polish

**New:**
- `src/lib/business-days.ts` — helpers puros para "first business day of month", "first Monday of month", "last business day of month", con feriados CL hardcodeados o desde tabla `OpsHoliday` si existe (chequear).
- `src/components/finance/cashflow/CellActionPopover.tsx` — popover que abre sobre una celda con acciones: `← 1 sem`, `→ 1 sem`, `← 2 sem`, `→ 2 sem`, `Editar monto`.
- `src/app/api/finance/cashflow/occurrences/[id]/amount/route.ts` — endpoint POST para override de `amountOverride` en una ocurrencia materializada.

**Modified:**
- `src/components/finance/cashflow/CategoryAccountsEditor.tsx` — chip muestra `code · name`; selector tiene buscador (Combobox style); footer "+ Crear cuenta contable" navega a `/opai/configuracion/finanzas/contabilidad/cuentas/nueva` (verificar ruta exacta antes).
- `src/components/finance/cashflow/CashflowConfigClient.tsx` — copy de tolerancias actualizado al texto canon de la sección "Tolerancia match — copy canon" más abajo.
- `src/components/finance/cashflow/MatrixHelpers.tsx` — `MatrixRow` envuelve cada celda con click handler que abre `CellActionPopover` con la primera ocurrencia materializable de esa celda.
- `src/modules/finance/cashflow/occurrence.service.ts` — agrega `setOccurrenceAmountOverride(tenantId, id, amountClp)` que persiste `amountOverride` y opcionalmente recalcula `amountClp` para UF.

### Phase B — CpqQuote ↔ Installation + Payment day mode

**New:**
- `prisma/migrations/20260511000000_cpq_quote_payment_day_mode/migration.sql` — agrega columna `payment_day_mode` con default `SPECIFIC_DAY`.
- `src/components/crm/AccountCashflowQuotesSection.tsx` — sección bajo "Contratos" en `CrmAccountDetailClient` que lista `CpqQuote` con `accountId === currentAccount` y abre un modal de edición.
- `src/app/api/crm/accounts/[id]/cashflow-quotes/route.ts` — GET lista, PATCH `[quoteId]/cashflow-config` actualiza `installationId`, `paymentDayMode`, `paymentDays`.
- `src/app/api/crm/accounts/[id]/cashflow-quotes/[quoteId]/route.ts` — PATCH endpoint específico.
- `src/lib/validations/cashflow-quote-config.ts` — Zod schema.

**Modified:**
- `prisma/schema.prisma` — `CpqQuote.paymentDayMode String @default("SPECIFIC_DAY") @map("payment_day_mode")` (no enum DB para evitar migración doble; valores validados en Zod).
- `src/modules/finance/cashflow/generators/sales-from-contracts.ts` — leer `paymentDayMode` y `installationId`; calcular `scheduledDate` según modo usando helpers de `business-days.ts`. Devolver `installationId` real en la VirtualOccurrence.
- `src/components/crm/CrmAccountDetailClient.tsx` — montar `AccountCashflowQuotesSection`.

### Phase C — Categorías expandibles en config

**New:**
- `src/components/finance/cashflow/CategoryRowExpandable.tsx` — wrapper de fila + panel expandido por categoría.
- `src/components/finance/cashflow/CategoryItemsList.tsx` — lista los `FinanceCashflowItem` de una categoría con CRUD inline (reutiliza `ItemFormDialog` existente).
- `src/components/finance/cashflow/CategoryAutoSourcesList.tsx` — para categorías con generator: lista las fuentes (quotes/lotes/dotación) con link al recurso editable.
- `src/app/api/finance/cashflow/categorias/[id]/items/route.ts` — GET lista de items por categoría.
- `src/app/api/finance/cashflow/categorias/[id]/auto-sources/route.ts` — GET lista las fuentes auto-generadas de la categoría.

**Modified:**
- `src/components/finance/cashflow/CashflowConfigClient.tsx` — la tabla de categorías pasa de filas planas a `CategoryRowExpandable`.

---

## Tolerancia match — copy canon

Reemplazar los helper texts actuales con esto literal:

> **Tolerancia de monto al conciliar (CLP)**
> Cuando el banco cobra un movimiento, el monto puede no coincidir exacto con tu proyección (impuestos extra, comisiones, redondeo). Este número es la **diferencia máxima en pesos** que el sistema acepta para considerar que el cobro corresponde a esa proyección. Recomendado: **5.000** para gastos fijos, **15.000** si tu banco aplica comisiones variables.

> **Tolerancia de fecha al conciliar (días)**
> Un movimiento puede no caer exactamente el día proyectado. Ej: pagaste Movistar el día 7 pero lo proyectaste para el 5 → diferencia de 2 días. Este número es el **máximo de días de diferencia** aceptado. Recomendado: **3 días** para gastos fijos, **5 días** si tu banco demora en procesar.

---

# PHASE A — UX Polish

**Outcome de la fase:** Usuario entiende qué hacen las tolerancias, edita mappings categoría↔cuenta más cómodo (chip con nombre, buscador, crear cuenta), y puede mover/editar movimientos directamente desde una celda de la matriz semanal sin necesidad de drag.

---

### Task A1: Helper text canon de tolerancias

**Files:**
- Modify: `src/components/finance/cashflow/CashflowConfigClient.tsx`

- [ ] **Step 1: Encontrar los helper texts actuales**

Run: `grep -n "Tolerancia" src/components/finance/cashflow/CashflowConfigClient.tsx`
Expected: dos `<Label>Tolerancia ...</Label>` y dos `<p>` adyacentes.

- [ ] **Step 2: Reemplazar el texto del helper de monto**

Localizar el `<p>` debajo del Input de `matchAmountToleranceClp` y reemplazar SU CONTENIDO por:
```tsx
Cuando el banco cobra un movimiento, el monto puede no coincidir exacto con tu proyección (impuestos extra, comisiones, redondeo). Este número es la <strong>diferencia máxima en pesos</strong> que el sistema acepta para considerar que el cobro corresponde a esa proyección. Recomendado: <strong>5.000</strong> para gastos fijos, <strong>15.000</strong> si tu banco aplica comisiones variables.
```

- [ ] **Step 3: Reemplazar el texto del helper de fecha**

Localizar el `<p>` debajo del Input de `matchDaysTolerance` y reemplazar SU CONTENIDO por:
```tsx
Un movimiento puede no caer exactamente el día proyectado. Ej: pagaste Movistar el día 7 pero lo proyectaste para el 5 → diferencia de 2 días. Este número es el <strong>máximo de días de diferencia</strong> aceptado. Recomendado: <strong>3 días</strong> para gastos fijos, <strong>5 días</strong> si tu banco demora en procesar.
```

- [ ] **Step 4: Verificar que sigue compilando**

Run: `grep -c "Tolerancia" src/components/finance/cashflow/CashflowConfigClient.tsx`
Expected: 2.

- [ ] **Step 5: Commit**

```bash
git add src/components/finance/cashflow/CashflowConfigClient.tsx
git commit -m "fix(finanzas/flujo-caja): copy canon de tolerancias en config"
```

---

### Task A2: Chip de cuenta con código + nombre y buscador

**Files:**
- Modify: `src/components/finance/cashflow/CategoryAccountsEditor.tsx`

- [ ] **Step 1: Mostrar `code · name` en el chip**

Buscar en `CategoryAccountsEditor.tsx` la línea con `<span className="font-mono">{m.accountPlan.code}</span>` y reemplazar el chip completo por:

```tsx
<span
  key={m.id}
  className={`inline-flex items-center gap-1.5 rounded-ds-sm px-2 py-1 text-[12px] ${
    m.isPrimary
      ? "bg-status-info-soft text-status-info-fg"
      : "bg-muted/40 text-ds-text-2"
  }`}
  title={`${m.accountPlan.code} — ${m.accountPlan.name}`}
>
  <span className="font-mono">{m.accountPlan.code}</span>
  <span className="text-ds-text-3">·</span>
  <span className="truncate max-w-[180px]">{m.accountPlan.name}</span>
  {canEdit && (
    <button
      type="button"
      aria-label={`Quitar cuenta ${m.accountPlan.code}`}
      onClick={() => removeAccount(m.accountPlanId)}
      disabled={saving}
      className="hover:text-status-warn-fg disabled:opacity-50"
    >
      <X className="h-3 w-3" />
    </button>
  )}
</span>
```

- [ ] **Step 2: Reemplazar el Select por un Combobox con búsqueda**

Buscar la sección que tiene `<Select value={picker} onValueChange={setPicker}>` y reemplazarla por un componente local. Agregar al inicio del archivo:

```tsx
import { Search } from "lucide-react";
```

Dentro del componente, agregar un `useState` para el query:

```tsx
const [query, setQuery] = useState("");
```

Reemplazar el `<Select>...` block por:

```tsx
{canEdit && available.length > 0 && (
  <div className="relative">
    <div className="flex items-center gap-1.5 h-7 w-[260px] rounded-ds-sm border border-border bg-background px-2">
      <Search className="h-3.5 w-3.5 text-ds-text-3 shrink-0" />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por código o nombre..."
        className="flex-1 bg-transparent border-0 outline-none text-[12px]"
      />
    </div>
    {query.trim().length > 0 && (
      <ul className="absolute top-full left-0 mt-1 w-[260px] max-h-[240px] overflow-y-auto rounded-ds-sm border border-border bg-popover shadow-lg z-10">
        {available
          .filter((a) => {
            const q = query.trim().toLowerCase();
            return (
              a.code.toLowerCase().includes(q) ||
              a.name.toLowerCase().includes(q)
            );
          })
          .slice(0, 50)
          .map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => {
                  save([...mappings.map((m) => m.accountPlanId), a.id]);
                  setQuery("");
                }}
                className="w-full text-left px-2 py-1.5 text-[12px] hover:bg-muted/40 flex items-center gap-2"
              >
                <span className="font-mono text-ds-text-3">{a.code}</span>
                <span className="truncate">{a.name}</span>
              </button>
            </li>
          ))}
        {available.filter((a) => {
          const q = query.trim().toLowerCase();
          return (
            a.code.toLowerCase().includes(q) ||
            a.name.toLowerCase().includes(q)
          );
        }).length === 0 && (
          <li className="px-2 py-2 text-[12px] text-ds-text-3">
            Sin resultados.{" "}
            <a
              href="/opai/configuracion/finanzas/contabilidad"
              target="_blank"
              rel="noopener noreferrer"
              className="text-status-info-fg underline"
            >
              Crear cuenta contable
            </a>
          </li>
        )}
      </ul>
    )}
  </div>
)}
```

- [ ] **Step 3: Verificar la ruta del plan de cuentas**

Run: `ls src/app/\(app\)/opai/configuracion/finanzas/contabilidad/ 2>/dev/null`
Si la ruta no es esa, ajustar el `href` arriba a la ruta correcta. Si no hay UI de plan de cuentas, dejar el link a `/opai/configuracion/finanzas` como fallback.

- [ ] **Step 4: Smoke manual**

Run: `pnpm dev`
Open `/opai/configuracion/finanzas/flujo-caja`
- Cada chip debe mostrar `código · nombre`.
- Tipear en el buscador filtra cuentas.
- Si la query no matchea nada, aparece "Sin resultados · Crear cuenta contable".

- [ ] **Step 5: Commit**

```bash
git add src/components/finance/cashflow/CategoryAccountsEditor.tsx
git commit -m "feat(finanzas/flujo-caja): chip con nombre + buscador + atajo crear cuenta"
```

---

### Task A3: Endpoint para override de monto en una ocurrencia

**Files:**
- Modify: `src/modules/finance/cashflow/occurrence.service.ts` (append)
- Create: `src/app/api/finance/cashflow/occurrences/[id]/amount/route.ts`

- [ ] **Step 1: Leer la signature actual del service**

Run: `grep -n "export async function" src/modules/finance/cashflow/occurrence.service.ts`
Confirmar que existen `upsertOccurrence`, `moveOccurrence`. Estamos agregando una tercera.

- [ ] **Step 2: Agregar `setOccurrenceAmountOverride` al service**

Append a `src/modules/finance/cashflow/occurrence.service.ts`:

```typescript
/**
 * Override manual del monto de una ocurrencia materializada.
 * Persiste `amountOverride` (el monto que el usuario quiere ver) y
 * actualiza `amountClp` también si la moneda del item es CLP. Para items
 * en UF, el caller debe recomputar amountClp con el factor de UF guardado.
 */
export async function setOccurrenceAmountOverride(
  tenantId: string,
  id: string,
  newAmountClp: number,
): Promise<void> {
  if (!Number.isFinite(newAmountClp) || newAmountClp <= 0) {
    throw new Error("El monto debe ser mayor a 0");
  }
  const existing = await prisma.financeCashflowOccurrence.findFirst({
    where: { id, tenantId },
    select: { id: true, status: true, ufValueUsed: true },
  });
  if (!existing) throw new Error("Ocurrencia no encontrada");
  if (existing.status === "PAID") {
    throw new Error("No se puede editar el monto de una ocurrencia ya conciliada");
  }
  await prisma.financeCashflowOccurrence.update({
    where: { id },
    data: {
      amountOverride: newAmountClp,
      amountClp: newAmountClp,
    },
  });
}
```

- [ ] **Step 3: Crear el endpoint POST**

Create `src/app/api/finance/cashflow/occurrences/[id]/amount/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { setOccurrenceAmountOverride } from "@/modules/finance/cashflow/occurrence.service";

const amountSchema = z.object({
  amountClp: z.number().positive(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_manage")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await context.params;
    const parsed = await parseBody(request, amountSchema);
    if (parsed.error) return parsed.error;
    await setOccurrenceAmountOverride(ctx.tenantId, id, parsed.data.amountClp);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
```

- [ ] **Step 4: Smoke**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "occurrence\\.service|occurrences/\\[id\\]/amount" | head`
Expected: empty.

- [ ] **Step 5: Commit**

```bash
git add src/modules/finance/cashflow/occurrence.service.ts 'src/app/api/finance/cashflow/occurrences/[id]/amount/'
git commit -m "feat(finanzas/flujo-caja): endpoint para override manual de monto en ocurrencia"
```

---

### Task A4: `CellActionPopover` (mover ± 1-2 sem + editar monto)

**Files:**
- Create: `src/components/finance/cashflow/CellActionPopover.tsx`

- [ ] **Step 1: Crear el componente**

Create `src/components/finance/cashflow/CellActionPopover.tsx`:

```tsx
"use client";
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, Pencil, Loader2 } from "lucide-react";

const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

interface CellOccurrenceTarget {
  id: string;
  amountClp: number;
}

interface Props {
  /** Children es el contenido de la celda (el monto formateado, etc). */
  children: React.ReactNode;
  /** La ocurrencia materializable que se va a actuar (null = nada que hacer). */
  target: CellOccurrenceTarget | null;
  /** Granularidad para calcular el desplazamiento en días al "+1 sem" / "+2 sem". */
  granularity: "weekly" | "monthly";
  /** Llamado tras una acción exitosa para que el padre haga refresh. */
  onActionDone: () => void;
}

export function CellActionPopover({
  children,
  target,
  granularity,
  onActionDone,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<null | "shift" | "amount">(null);
  const [editing, setEditing] = useState(false);
  const [draftAmount, setDraftAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!target) {
    return <>{children}</>;
  }

  const stepDays = granularity === "weekly" ? 7 : 30;

  async function shift(direction: "back" | "forward", multiplier: 1 | 2) {
    if (!target) return;
    setBusy("shift");
    setError(null);
    try {
      const days = stepDays * multiplier * (direction === "back" ? -1 : 1);
      const r = await fetch(
        `/api/finance/cashflow/occurrences/${target.id}/move`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ daysFromCurrent: days }),
        },
      );
      const j = await r.json();
      if (j?.success) {
        setOpen(false);
        onActionDone();
      } else {
        setError(j?.error ?? "No se pudo mover");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setBusy(null);
    }
  }

  async function saveAmount() {
    if (!target) return;
    const cleaned = draftAmount.replace(/\./g, "").replace(",", ".");
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n <= 0) {
      setError("Monto inválido");
      return;
    }
    setBusy("amount");
    setError(null);
    try {
      const r = await fetch(
        `/api/finance/cashflow/occurrences/${target.id}/amount`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amountClp: n }),
        },
      );
      const j = await r.json();
      if (j?.success) {
        setOpen(false);
        setEditing(false);
        setDraftAmount("");
        onActionDone();
      } else {
        setError(j?.error ?? "No se pudo guardar");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setEditing(false);
          setError(null);
          setDraftAmount("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="block w-full text-right hover:bg-muted/30 rounded-ds-sm px-1 py-0.5 cursor-pointer"
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-2">
        {!editing ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => shift("back", 2)}
                disabled={busy !== null}
                className="h-8 text-[12px]"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <ChevronLeft className="h-3.5 w-3.5 -ml-2" />
                2 sem
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => shift("forward", 2)}
                disabled={busy !== null}
                className="h-8 text-[12px]"
              >
                2 sem
                <ChevronRight className="h-3.5 w-3.5" />
                <ChevronRight className="h-3.5 w-3.5 -ml-2" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => shift("back", 1)}
                disabled={busy !== null}
                className="h-8 text-[12px]"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> 1 sem
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => shift("forward", 1)}
                disabled={busy !== null}
                className="h-8 text-[12px]"
              >
                1 sem <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDraftAmount(fmt.format(target.amountClp));
                setEditing(true);
              }}
              disabled={busy !== null}
              className="w-full h-8 text-[12px]"
            >
              <Pencil className="h-3.5 w-3.5 mr-1" /> Editar monto
            </Button>
            {busy === "shift" && (
              <div className="flex items-center justify-center gap-1 text-[12px] text-ds-text-3">
                <Loader2 className="h-3 w-3 animate-spin" /> Moviendo...
              </div>
            )}
            {error && (
              <p className="text-[12px] text-status-warn-fg">{error}</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-[12px] text-ds-text-2">Nuevo monto (CLP)</label>
            <Input
              autoFocus
              inputMode="decimal"
              value={draftAmount}
              onChange={(e) => {
                const cleaned = e.target.value
                  .replace(/[^\d,.-]/g, "")
                  .replace(/\./g, "")
                  .replace(",", ".");
                const n = Number(cleaned);
                setDraftAmount(
                  Number.isFinite(n) ? fmt.format(n) : e.target.value,
                );
              }}
              className="h-8 font-mono text-right text-[12px]"
            />
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(false)}
                disabled={busy !== null}
                className="flex-1 h-8 text-[12px]"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={saveAmount}
                disabled={busy !== null}
                className="flex-1 h-8 text-[12px]"
              >
                {busy === "amount" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  "Guardar"
                )}
              </Button>
            </div>
            {error && (
              <p className="text-[12px] text-status-warn-fg">{error}</p>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Confirmar que existe `@/components/ui/popover`**

Run: `ls src/components/ui/popover.tsx`
Expected: file existe (es un wrapper estándar de shadcn).

- [ ] **Step 3: Commit**

```bash
git add src/components/finance/cashflow/CellActionPopover.tsx
git commit -m "feat(finanzas/flujo-caja): popover con acciones de mover y editar monto en celda"
```

---

### Task A5: Endpoint move con `daysFromCurrent` (refactor)

El popover llama a `/move` con `daysFromCurrent` en vez de `newDate`. Para no romper el caller existente (DnD provider), el endpoint acepta ambas formas.

**Files:**
- Modify: `src/app/api/finance/cashflow/occurrences/[id]/move/route.ts`
- Modify: `src/modules/finance/cashflow/occurrence.service.ts:moveOccurrence`

- [ ] **Step 1: Extender el schema de input**

En `src/app/api/finance/cashflow/occurrences/[id]/move/route.ts`, reemplazar `moveSchema` por:

```typescript
const moveSchema = z
  .object({
    newDate: z.coerce.date().optional(),
    daysFromCurrent: z.number().int().optional(),
  })
  .refine(
    (v) => v.newDate !== undefined || v.daysFromCurrent !== undefined,
    "Falta newDate o daysFromCurrent",
  );
```

- [ ] **Step 2: Pasar el delta al service**

En el handler, cambiar la llamada:

```typescript
await moveOccurrence(ctx.tenantId, id, {
  newDate: parsed.data.newDate ?? null,
  daysFromCurrent: parsed.data.daysFromCurrent ?? null,
});
```

- [ ] **Step 3: Refactor de `moveOccurrence`**

En `src/modules/finance/cashflow/occurrence.service.ts`, reemplazar la función `moveOccurrence` actual por:

```typescript
export async function moveOccurrence(
  tenantId: string,
  id: string,
  arg: { newDate: Date | null; daysFromCurrent: number | null },
): Promise<void> {
  const existing = await prisma.financeCashflowOccurrence.findFirst({
    where: { id, tenantId },
    select: { id: true, itemId: true, scheduledDate: true, status: true },
  });
  if (!existing) throw new Error("Ocurrencia no encontrada");
  if (existing.status === "PAID") {
    throw new Error("No se puede mover una ocurrencia ya pagada/conciliada");
  }

  let target: Date;
  if (arg.newDate) {
    target = arg.newDate;
  } else if (arg.daysFromCurrent !== null) {
    target = new Date(existing.scheduledDate);
    target.setDate(target.getDate() + arg.daysFromCurrent);
  } else {
    throw new Error("Se requiere newDate o daysFromCurrent");
  }

  const collision = await prisma.financeCashflowOccurrence.findFirst({
    where: { tenantId, itemId: existing.itemId, scheduledDate: target },
    select: { id: true },
  });
  if (collision && collision.id !== id) {
    throw new Error("Ya existe una ocurrencia de este ítem en esa fecha");
  }
  await prisma.financeCashflowOccurrence.update({
    where: { id },
    data: { scheduledDate: target, effectiveDate: target },
  });
}
```

- [ ] **Step 4: Actualizar el caller del DnD**

En `src/components/finance/cashflow/CashflowTabs.tsx`, el `handleMove` actual hace `JSON.stringify({ newDate: target.toISOString().slice(0, 10) })`. Sigue funcionando — el schema acepta `newDate` opcional. **No tocar el DnD caller.**

- [ ] **Step 5: Verificar typecheck**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "occurrence\\.service|occurrences/\\[id\\]/move" | head`
Expected: empty.

- [ ] **Step 6: Commit**

```bash
git add src/modules/finance/cashflow/occurrence.service.ts 'src/app/api/finance/cashflow/occurrences/[id]/move/route.ts'
git commit -m "feat(finanzas/flujo-caja): /move acepta daysFromCurrent además de newDate"
```

---

### Task A6: Wirear `CellActionPopover` en la matriz semanal

**Files:**
- Modify: `src/components/finance/cashflow/MatrixHelpers.tsx`

- [ ] **Step 1: Importar el popover**

En `src/components/finance/cashflow/MatrixHelpers.tsx` (top de archivo, con otros imports):

```tsx
import { CellActionPopover } from "./CellActionPopover";
```

- [ ] **Step 2: Helper para encontrar la primera ocurrencia editable de una celda**

Justo después de los imports, agregar:

```tsx
function findFirstEditableOccurrence(
  bucketKey: string,
  categoryId: string | null,
  buckets: Array<{ key: string; occurrences: Array<{ id: string | null; categoryId: string | null; status: string; amountClp: number }> }>,
): { id: string; amountClp: number } | null {
  const b = buckets.find((bk) => bk.key === bucketKey);
  if (!b) return null;
  const occ = b.occurrences.find(
    (o) =>
      o.categoryId === categoryId && o.status === "PROJECTED" && o.id !== null,
  );
  if (!occ || !occ.id) return null;
  return { id: occ.id, amountClp: occ.amountClp };
}
```

- [ ] **Step 3: Encontrar el render de la celda**

Buscar dónde `MatrixRow` renderiza cada `<td>` con su `CellAmount`. Pasar `buckets` y `granularity` como props.

Modificar `MatrixRow` props para aceptar:
```tsx
interface MatrixRowProps {
  // ...props existentes...
  buckets: Array<{ key: string; occurrences: any[] }>;
  granularity: "weekly" | "monthly";
  onActionDone: () => void;
}
```

(Si `MatrixRow` ya acepta `buckets` para `actualByCellKey`, reusar esa prop.)

- [ ] **Step 4: Envolver `CellAmount` con el popover**

Reemplazar el bloque que renderiza `<CellAmount ... />` dentro del `<td>` por:

```tsx
<CellActionPopover
  target={findFirstEditableOccurrence(v.bucketKey, row.categoryId, buckets)}
  granularity={granularity}
  onActionDone={onActionDone}
>
  <CellAmount
    projected={v.amount}
    actual={...}
    variance={...}
    kind={row.kind}
  />
</CellActionPopover>
```

- [ ] **Step 5: Pasar `granularity` y `onActionDone` desde el caller**

En `WeeklyMatrix.tsx` y `MonthlyMatrix.tsx`, donde se invoca `<MatrixRow>`, pasar:
```tsx
buckets={projection.buckets}
granularity={"weekly" | "monthly"}
onActionDone={() => router.refresh()}
```

(`useRouter` ya está importado.)

- [ ] **Step 6: Smoke manual**

Run: `pnpm dev`
Open `/finanzas/flujo-caja`
- Click en una celda con monto → aparece popover con 4 botones de mover y "Editar monto".
- Click en "+1 sem" → la ocurrencia se mueve a la semana siguiente, matriz se actualiza.
- Click en "Editar monto" → input formateado con separador, guardar refresca.
- Celdas vacías o con ocurrencias auto-generadas (sin id) no abren popover.

- [ ] **Step 7: Commit**

```bash
git add src/components/finance/cashflow/MatrixHelpers.tsx src/components/finance/cashflow/WeeklyMatrix.tsx src/components/finance/cashflow/MonthlyMatrix.tsx
git commit -m "feat(finanzas/flujo-caja): popover de mover/editar monto al click en celda"
```

---

### Task A7: Verificación + push de Fase A

- [ ] **Step 1: Tests + typecheck**

Run: `npx vitest run src/modules/finance/cashflow/__tests__/`
Expected: green (o skipped donde corresponda).

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "cashflow|occurrence" | head`
Expected: empty.

- [ ] **Step 2: Smoke en dev**

1. `pnpm dev`
2. Verificar que la copy de tolerancias se ve actualizada en `/opai/configuracion/finanzas/flujo-caja`.
3. Buscar una cuenta en el editor de mappings — debe filtrar.
4. Click en una celda de matriz semanal — popover aparece. Mover y editar funcionan.

- [ ] **Step 3: Push**

```bash
git push origin main
```

**Phase A done.**

---

# PHASE B — CpqQuote ↔ Installation + Payment day mode

**Pre-req:** Phase A completed and pushed.

**Outcome:** Cada cotización ganada (`CpqQuote`) tiene un campo nuevo `paymentDayMode` que el generator de ventas respeta. Hay una sección nueva en la ficha de cuenta CRM que lista las cotizaciones activas y permite editar `installationId`, `paymentDayMode`, `paymentDay` desde un modal. La proyección refleja exactamente lo configurado.

---

### Task B1: Migración + schema para `paymentDayMode`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260511000000_cpq_quote_payment_day_mode/migration.sql`

- [ ] **Step 1: Agregar campo al schema**

En `prisma/schema.prisma` localizar `model CpqQuote` y agregar después de `paymentDays`:

```prisma
  paymentDayMode        String    @default("SPECIFIC_DAY") @map("payment_day_mode")
  /// SPECIFIC_DAY (usa paymentDays) | FIRST_BUSINESS_DAY | FIRST_MONDAY | LAST_BUSINESS_DAY
```

- [ ] **Step 2: Crear migración SQL**

Create `prisma/migrations/20260511000000_cpq_quote_payment_day_mode/migration.sql`:

```sql
ALTER TABLE "cpq"."quotes"
  ADD COLUMN IF NOT EXISTS "payment_day_mode" TEXT NOT NULL DEFAULT 'SPECIFIC_DAY';
```

- [ ] **Step 3: Aplicar localmente**

Run: `npx prisma migrate deploy`
Expected: aplica `20260511000000_cpq_quote_payment_day_mode` sin error.

Run: `npx prisma generate`
Expected: cliente regenerado.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260511000000_cpq_quote_payment_day_mode/
git commit -m "feat(cpq/quote): paymentDayMode (SPECIFIC_DAY | FIRST_BUSINESS_DAY | FIRST_MONDAY | LAST_BUSINESS_DAY)"
```

---

### Task B2: Helpers de `business-days.ts` con tests

**Files:**
- Create: `src/lib/business-days.ts`
- Create: `src/lib/__tests__/business-days.test.ts`

- [ ] **Step 1: Failing test**

Create `src/lib/__tests__/business-days.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  firstBusinessDayOfMonth,
  lastBusinessDayOfMonth,
  firstMondayOfMonth,
} from "../business-days";

describe("first/lastBusinessDayOfMonth (CL — sin feriados, solo sábado/domingo)", () => {
  it("Mayo 2026: día 1 = viernes, primer hábil = 1", () => {
    const d = firstBusinessDayOfMonth(2026, 5);
    expect(d.getDate()).toBe(1);
  });

  it("Marzo 2026: día 1 = domingo, primer hábil = lunes 2", () => {
    const d = firstBusinessDayOfMonth(2026, 3);
    expect(d.getDate()).toBe(2);
  });

  it("Agosto 2026: día 1 = sábado, primer hábil = lunes 3", () => {
    const d = firstBusinessDayOfMonth(2026, 8);
    expect(d.getDate()).toBe(3);
  });

  it("Mayo 2026: último hábil = viernes 29 (30 sáb, 31 dom)", () => {
    const d = lastBusinessDayOfMonth(2026, 5);
    expect(d.getDate()).toBe(29);
  });

  it("Mayo 2026: primer lunes = 4", () => {
    const d = firstMondayOfMonth(2026, 5);
    expect(d.getDate()).toBe(4);
  });

  it("Marzo 2026: día 1 = domingo, primer lunes = 2", () => {
    const d = firstMondayOfMonth(2026, 3);
    expect(d.getDate()).toBe(2);
  });
});
```

- [ ] **Step 2: Run failing**

Run: `npx vitest run src/lib/__tests__/business-days.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implementar**

Create `src/lib/business-days.ts`:

```typescript
/**
 * Helpers de días hábiles para Chile. Solo considera sábados y domingos
 * como no hábiles. Feriados oficiales NO están incluidos en esta versión —
 * si se necesita, agregar tabla `OpsHoliday` lookup acá.
 *
 * Mes pasa como 1-12 (no 0-11).
 */

function isWeekend(d: Date): boolean {
  const dow = d.getDay();
  return dow === 0 || dow === 6; // 0=Dom, 6=Sáb
}

export function firstBusinessDayOfMonth(year: number, month: number): Date {
  const d = new Date(year, month - 1, 1);
  while (isWeekend(d)) d.setDate(d.getDate() + 1);
  return d;
}

export function lastBusinessDayOfMonth(year: number, month: number): Date {
  // Último día del mes = día 0 del mes siguiente
  const d = new Date(year, month, 0);
  while (isWeekend(d)) d.setDate(d.getDate() - 1);
  return d;
}

export function firstMondayOfMonth(year: number, month: number): Date {
  const d = new Date(year, month - 1, 1);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return d;
}
```

- [ ] **Step 4: Run passing**

Run: `npx vitest run src/lib/__tests__/business-days.test.ts`
Expected: 6/6 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/business-days.ts src/lib/__tests__/business-days.test.ts
git commit -m "feat(business-days): helpers para primer/último hábil y primer lunes del mes"
```

---

### Task B3: Migrar generator `sales-from-contracts` para respetar `paymentDayMode`

**Files:**
- Modify: `src/modules/finance/cashflow/generators/sales-from-contracts.ts`

- [ ] **Step 1: Importar los helpers**

Top del archivo, agregar:

```typescript
import {
  firstBusinessDayOfMonth,
  lastBusinessDayOfMonth,
  firstMondayOfMonth,
} from "@/lib/business-days";
```

- [ ] **Step 2: Leer `paymentDayMode` desde el select**

En el `prisma.cpqQuote.findMany`, agregar al `select`:

```typescript
paymentDayMode: true,
```

- [ ] **Step 3: Calcular `scheduledDate` según el modo**

Reemplazar el bloque que computa `scheduledDate`:

```typescript
const scheduledDate = new Date(
  billingMonth.getFullYear(),
  billingMonth.getMonth(),
  Math.min(payDay, 28),
);
```

por:

```typescript
const mode = q.paymentDayMode ?? "SPECIFIC_DAY";
const y = billingMonth.getFullYear();
const mo = billingMonth.getMonth() + 1; // 1-12 para los helpers
let scheduledDate: Date;
switch (mode) {
  case "FIRST_BUSINESS_DAY":
    scheduledDate = firstBusinessDayOfMonth(y, mo);
    break;
  case "LAST_BUSINESS_DAY":
    scheduledDate = lastBusinessDayOfMonth(y, mo);
    break;
  case "FIRST_MONDAY":
    scheduledDate = firstMondayOfMonth(y, mo);
    break;
  case "SPECIFIC_DAY":
  default:
    scheduledDate = new Date(y, mo - 1, Math.min(payDay, 28));
    break;
}
```

- [ ] **Step 4: Verificar typecheck**

Run: `npx tsc --noEmit -p . 2>&1 | grep "sales-from-contracts" | head`
Expected: empty.

- [ ] **Step 5: Commit**

```bash
git add src/modules/finance/cashflow/generators/sales-from-contracts.ts
git commit -m "feat(finanzas/flujo-caja): generator de ventas respeta paymentDayMode"
```

---

### Task B4: Endpoint GET/PATCH para cashflow-quotes de una cuenta

**Files:**
- Create: `src/lib/validations/cashflow-quote-config.ts`
- Create: `src/app/api/crm/accounts/[id]/cashflow-quotes/route.ts`
- Create: `src/app/api/crm/accounts/[id]/cashflow-quotes/[quoteId]/route.ts`

- [ ] **Step 1: Schema de validación**

Create `src/lib/validations/cashflow-quote-config.ts`:

```typescript
import { z } from "zod";

export const cashflowQuoteConfigSchema = z.object({
  installationId: z.string().uuid().nullable().optional(),
  paymentDayMode: z
    .enum(["SPECIFIC_DAY", "FIRST_BUSINESS_DAY", "FIRST_MONDAY", "LAST_BUSINESS_DAY"])
    .optional(),
  paymentDays: z.number().int().min(1).max(28).optional(),
});
```

- [ ] **Step 2: GET list endpoint**

Create `src/app/api/crm/accounts/[id]/cashflow-quotes/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const ACTIVE_QUOTE_STATUSES = ["accepted", "active", "in_progress", "approved"];

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_view")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await context.params;
    const quotes = await prisma.cpqQuote.findMany({
      where: {
        tenantId: ctx.tenantId,
        accountId: id,
        status: { in: ACTIVE_QUOTE_STATUSES },
        contractStartDate: { not: null },
      },
      select: {
        id: true,
        code: true,
        name: true,
        clientName: true,
        monthlyCost: true,
        currency: true,
        contractStartDate: true,
        contractDuration: true,
        paymentDays: true,
        paymentDayMode: true,
        paymentTerms: true,
        installationId: true,
        installation: { select: { id: true, name: true } },
      },
      orderBy: { contractStartDate: "asc" },
    });

    // Lista de instalaciones de la cuenta para el selector del modal
    const installations = await prisma.crmInstallation.findMany({
      where: { tenantId: ctx.tenantId, accountId: id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: { quotes, installations } });
  } catch (error) {
    console.error("[CRM/Account] GET cashflow-quotes:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 3: PATCH endpoint individual**

Create `src/app/api/crm/accounts/[id]/cashflow-quotes/[quoteId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { cashflowQuoteConfigSchema } from "@/lib/validations/cashflow-quote-config";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; quoteId: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_manage")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id, quoteId } = await context.params;
    const parsed = await parseBody(request, cashflowQuoteConfigSchema);
    if (parsed.error) return parsed.error;

    const quote = await prisma.cpqQuote.findFirst({
      where: { id: quoteId, tenantId: ctx.tenantId, accountId: id },
      select: { id: true },
    });
    if (!quote) {
      return NextResponse.json(
        { success: false, error: "Cotización no encontrada en esta cuenta" },
        { status: 404 },
      );
    }

    if (parsed.data.installationId !== undefined && parsed.data.installationId !== null) {
      const inst = await prisma.crmInstallation.findFirst({
        where: { id: parsed.data.installationId, tenantId: ctx.tenantId, accountId: id },
        select: { id: true },
      });
      if (!inst) {
        return NextResponse.json(
          { success: false, error: "Instalación no pertenece a esta cuenta" },
          { status: 400 },
        );
      }
    }

    await prisma.cpqQuote.update({
      where: { id: quoteId },
      data: {
        ...(parsed.data.installationId !== undefined && {
          installationId: parsed.data.installationId,
        }),
        ...(parsed.data.paymentDayMode !== undefined && {
          paymentDayMode: parsed.data.paymentDayMode,
        }),
        ...(parsed.data.paymentDays !== undefined && {
          paymentDays: parsed.data.paymentDays,
        }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CRM/Account] PATCH cashflow-quote:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p . 2>&1 | grep "cashflow-quotes" | head`
Expected: empty.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/cashflow-quote-config.ts 'src/app/api/crm/accounts/[id]/cashflow-quotes/'
git commit -m "feat(crm/cashflow): endpoints para listar/editar config de cotización (instalación, día pago)"
```

---

### Task B5: UI `AccountCashflowQuotesSection` con modal de edición

**Files:**
- Create: `src/components/crm/AccountCashflowQuotesSection.tsx`
- Modify: `src/components/crm/CrmAccountDetailClient.tsx`

- [ ] **Step 1: Crear el componente**

Create `src/components/crm/AccountCashflowQuotesSection.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Pencil, Wallet } from "lucide-react";
import { toast } from "sonner";

interface CashflowQuote {
  id: string;
  code: string;
  name: string | null;
  clientName: string | null;
  monthlyCost: string | number;
  currency: string;
  contractStartDate: string | null;
  contractDuration: number;
  paymentDays: number;
  paymentDayMode: string;
  paymentTerms: string;
  installationId: string | null;
  installation: { id: string; name: string } | null;
}

interface InstallationLite {
  id: string;
  name: string;
}

const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

const PAYMENT_DAY_MODE_LABELS: Record<string, string> = {
  SPECIFIC_DAY: "Día específico del mes",
  FIRST_BUSINESS_DAY: "Primer día hábil del mes",
  LAST_BUSINESS_DAY: "Último día hábil del mes",
  FIRST_MONDAY: "Primer lunes del mes",
};

export function AccountCashflowQuotesSection({ accountId }: { accountId: string }) {
  const [quotes, setQuotes] = useState<CashflowQuote[]>([]);
  const [installations, setInstallations] = useState<InstallationLite[]>([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<CashflowQuote | null>(null);
  const [draftInstallationId, setDraftInstallationId] = useState<string>("");
  const [draftMode, setDraftMode] = useState<string>("SPECIFIC_DAY");
  const [draftDay, setDraftDay] = useState<string>("5");
  const [saving, setSaving] = useState(false);

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/crm/accounts/${accountId}/cashflow-quotes`);
      const j = await r.json();
      if (j?.success) {
        setQuotes(j.data.quotes);
        setInstallations(j.data.installations);
      }
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  function openEdit(q: CashflowQuote) {
    setEditing(q);
    setDraftInstallationId(q.installationId ?? "");
    setDraftMode(q.paymentDayMode);
    setDraftDay(String(q.paymentDays));
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        installationId: draftInstallationId || null,
        paymentDayMode: draftMode,
      };
      if (draftMode === "SPECIFIC_DAY") {
        const n = Number(draftDay);
        if (!Number.isFinite(n) || n < 1 || n > 28) {
          toast.error("Día debe ser entre 1 y 28");
          setSaving(false);
          return;
        }
        body.paymentDays = n;
      }
      const r = await fetch(
        `/api/crm/accounts/${accountId}/cashflow-quotes/${editing.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const j = await r.json();
      if (j?.success) {
        toast.success("Configuración guardada");
        setEditing(null);
        fetchQuotes();
      } else {
        toast.error(j?.error ?? "Error al guardar");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Cargando cotizaciones...
      </div>
    );
  }

  if (quotes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Wallet className="h-8 w-8 text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">
          No hay cotizaciones activas para flujo de caja
        </p>
        <p className="text-xs text-muted-foreground mt-1 max-w-md">
          Una cotización aparece acá cuando está aceptada y tiene fecha de inicio de contrato.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Contratos activos en flujo de caja</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Cada cotización aceptada se proyecta mensualmente. Configura instalación y día de pago para que la proyección sea exacta.
        </p>
      </div>

      <div className="space-y-2">
        {quotes.map((q) => {
          const monthly = fmt.format(Number(q.monthlyCost));
          return (
            <div
              key={q.id}
              className="flex items-start sm:items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 flex-col sm:flex-row"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">
                    {q.installation?.name ?? "Sin instalación"}
                  </span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {q.code}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">
                    {q.currency} {monthly} / mes
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>
                    Inicio:{" "}
                    {q.contractStartDate
                      ? new Date(q.contractStartDate).toLocaleDateString("es-CL")
                      : "—"}
                  </span>
                  <span>Duración: {q.contractDuration} meses</span>
                  <span>
                    Pago:{" "}
                    {PAYMENT_DAY_MODE_LABELS[q.paymentDayMode] ?? q.paymentDayMode}
                    {q.paymentDayMode === "SPECIFIC_DAY" && ` (día ${q.paymentDays})`}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => openEdit(q)}
              >
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Configurar
              </Button>
            </div>
          );
        })}
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing?.installation?.name ?? "Cotización"} ·{" "}
              <span className="font-mono text-xs text-muted-foreground">
                {editing?.code}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Instalación</Label>
              <Select value={draftInstallationId} onValueChange={setDraftInstallationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin instalación" />
                </SelectTrigger>
                <SelectContent>
                  {installations.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                La instalación que pagará por este contrato. Se usa para agrupar la proyección.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Día de pago</Label>
              <Select value={draftMode} onValueChange={setDraftMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SPECIFIC_DAY">Día específico del mes</SelectItem>
                  <SelectItem value="FIRST_BUSINESS_DAY">Primer día hábil del mes</SelectItem>
                  <SelectItem value="LAST_BUSINESS_DAY">Último día hábil del mes</SelectItem>
                  <SelectItem value="FIRST_MONDAY">Primer lunes del mes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {draftMode === "SPECIFIC_DAY" && (
              <div className="space-y-2">
                <Label>Día del mes (1-28)</Label>
                <Input
                  type="number"
                  min={1}
                  max={28}
                  value={draftDay}
                  onChange={(e) => setDraftDay(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Montar en `CrmAccountDetailClient.tsx`**

Buscar dónde se renderiza `<AccountContractsSection .../>` y agregar inmediatamente antes o después:

```tsx
import { AccountCashflowQuotesSection } from "./AccountCashflowQuotesSection";
```

```tsx
<AccountCashflowQuotesSection accountId={accountId} />
```

(Si tiene tabs, agregar como sub-sección dentro del tab "Contratos".)

- [ ] **Step 3: Smoke**

Run: `pnpm dev`
Open una ficha de cuenta CRM con cotizaciones activas → debe ver la sección con las cotizaciones, y editar funciona.

- [ ] **Step 4: Commit**

```bash
git add src/components/crm/AccountCashflowQuotesSection.tsx src/components/crm/CrmAccountDetailClient.tsx
git commit -m "feat(crm/cashflow): sección de contratos activos para configurar instalación y día pago"
```

---

### Task B6: Verificación + push de Fase B

- [ ] **Step 1: Tests + typecheck**

Run: `npx vitest run src/lib/__tests__/business-days.test.ts`
Expected: 6/6 green.

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "cashflow|cpq" | head`
Expected: empty.

- [ ] **Step 2: Smoke E2E**

1. En ficha de cuenta CRM con cotizaciones activas → ver sección.
2. Editar una cotización → setear instalación + modo "FIRST_MONDAY".
3. Ir a `/finanzas/flujo-caja` → la proyección de esa cotización debe caer en el primer lunes de cada mes.

- [ ] **Step 3: Push**

```bash
git push origin main
```

**Phase B done.**

---

# PHASE C — Categorías expandibles

**Pre-req:** Phase B completed.

**Outcome:** En `/opai/configuracion/finanzas/flujo-caja`, cada fila de la tabla de categorías es expandible. Al expandir muestra (a) los items manuales (`FinanceCashflowItem`) con CRUD inline y (b) si la categoría tiene generator automático, las fuentes auto-generadas (cotizaciones para ING_VENTA_CONTRATO, dotación operativa para EGR_SUELDO, lotes TE para EGR_TURNO_EXTRA, F29 mensual para EGR_IVA_F29). Las cotizaciones linkean al modal de edición de Fase B.

---

### Task C1: Endpoint GET items de una categoría

**Files:**
- Create: `src/app/api/finance/cashflow/categorias/[id]/items/route.ts`

- [ ] **Step 1: Crear el endpoint**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_view")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await context.params;
    const items = await prisma.financeCashflowItem.findMany({
      where: { tenantId: ctx.tenantId, categoryId: id },
      select: {
        id: true,
        name: true,
        description: true,
        amount: true,
        currency: true,
        recurrence: true,
        dayOfMonth: true,
        dayOfWeek: true,
        monthOfYear: true,
        startDate: true,
        endDate: true,
        isActive: true,
        source: true,
        kind: true,
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error("[Finance/Cashflow] GET category items:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add 'src/app/api/finance/cashflow/categorias/[id]/items/'
git commit -m "feat(finanzas/flujo-caja): endpoint GET items por categoría"
```

---

### Task C2: Endpoint GET auto-sources por categoría

**Files:**
- Create: `src/app/api/finance/cashflow/categorias/[id]/auto-sources/route.ts`

- [ ] **Step 1: Crear el endpoint**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const ACTIVE_QUOTE_STATUSES = ["accepted", "active", "in_progress", "approved"];

interface AutoSource {
  kind: "QUOTE" | "PAYROLL" | "TE_LOTE" | "DTE";
  id: string;
  label: string;
  description: string | null;
  monthlyAmount: number;
  link: string;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_view")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await context.params;
    const cat = await prisma.financeCashflowCategory.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, code: true },
    });
    if (!cat) {
      return NextResponse.json({ success: false, error: "Categoría no encontrada" }, { status: 404 });
    }

    const sources: AutoSource[] = [];

    if (cat.code === "ING_VENTA_CONTRATO") {
      const quotes = await prisma.cpqQuote.findMany({
        where: {
          tenantId: ctx.tenantId,
          status: { in: ACTIVE_QUOTE_STATUSES },
          contractStartDate: { not: null },
        },
        select: {
          id: true,
          code: true,
          name: true,
          clientName: true,
          monthlyCost: true,
          currency: true,
          accountId: true,
          installation: { select: { id: true, name: true } },
        },
      });
      for (const q of quotes) {
        sources.push({
          kind: "QUOTE",
          id: q.id,
          label: q.installation?.name ?? q.clientName ?? q.name ?? q.code,
          description: `${q.code} · ${q.currency} ${Number(q.monthlyCost).toLocaleString("es-CL")}/mes`,
          monthlyAmount: Number(q.monthlyCost),
          link: q.accountId
            ? `/crm/cuentas/${q.accountId}#cashflow-quote-${q.id}`
            : `/cpq/cotizaciones/${q.id}`,
        });
      }
    }

    // Para EGR_SUELDO, EGR_TURNO_EXTRA, EGR_IVA_F29 — placeholder por ahora
    // (la UI muestra "Esta categoría se proyecta automáticamente desde X" sin lista detallada).

    return NextResponse.json({ success: true, data: { categoryCode: cat.code, sources } });
  } catch (error) {
    console.error("[Finance/Cashflow] GET auto-sources:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add 'src/app/api/finance/cashflow/categorias/[id]/auto-sources/'
git commit -m "feat(finanzas/flujo-caja): endpoint GET auto-sources por categoría (cotizaciones)"
```

---

### Task C3: `CategoryItemsList` componente

**Files:**
- Create: `src/components/finance/cashflow/CategoryItemsList.tsx`

- [ ] **Step 1: Crear**

Create `src/components/finance/cashflow/CategoryItemsList.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { Loader2, Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ItemFormDialog } from "./ItemFormDialog";

interface ItemRow {
  id: string;
  name: string;
  description: string | null;
  amount: string | number;
  currency: string;
  recurrence: string;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  monthOfYear: number | null;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  source: string;
  kind: "INCOME" | "EXPENSE";
  category: { code: string; name: string; color: string | null };
}

const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

export function CategoryItemsList({
  categoryId,
  categoryCode,
  categoryName,
  categoryKind,
  canManage,
}: {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  categoryKind: "INCOME" | "EXPENSE";
  canManage: boolean;
}) {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ItemRow | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/finance/cashflow/categorias/${categoryId}/items`);
      const j = await r.json();
      if (j?.success) {
        setItems(
          j.data.map((it: ItemRow) => ({
            ...it,
            category: { code: categoryCode, name: categoryName, color: null },
          })),
        );
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-[12px] text-ds-text-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando ítems...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-ds-text-3">
          {items.length === 0
            ? "Sin ítems manuales en esta categoría."
            : `${items.length} ítem${items.length !== 1 ? "s" : ""} manual${items.length !== 1 ? "es" : ""}`}
        </p>
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)} className="h-7 text-[12px]">
            <Plus className="h-3.5 w-3.5 mr-1" /> Nuevo ítem
          </Button>
        )}
      </div>

      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((i) => (
            <li
              key={i.id}
              className="flex items-center justify-between gap-2 rounded-ds-sm border border-border bg-background px-2 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-medium truncate">{i.name}</div>
                <div className="text-[11px] text-ds-text-3 truncate">
                  {i.recurrence} · {i.currency} {fmt.format(Number(i.amount))}
                </div>
              </div>
              {canManage && (
                <button
                  onClick={() => setEditing(i)}
                  className="p-1 rounded hover:bg-muted/40"
                  aria-label="Editar"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <ItemFormDialog
        open={creating || editing !== null}
        item={editing}
        categories={[{ id: categoryId, code: categoryCode, name: categoryName, kind: categoryKind }]}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          load();
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/finance/cashflow/CategoryItemsList.tsx
git commit -m "feat(finanzas/flujo-caja): lista de items por categoría con CRUD inline"
```

---

### Task C4: `CategoryAutoSourcesList` componente

**Files:**
- Create: `src/components/finance/cashflow/CategoryAutoSourcesList.tsx`

- [ ] **Step 1: Crear**

Create `src/components/finance/cashflow/CategoryAutoSourcesList.tsx`:

```tsx
"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Sparkles } from "lucide-react";

interface AutoSource {
  kind: string;
  id: string;
  label: string;
  description: string | null;
  monthlyAmount: number;
  link: string;
}

const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

const HINT_BY_CODE: Record<string, string> = {
  ING_VENTA_CONTRATO: "Cada cotización aceptada con fecha de inicio se proyecta mensualmente.",
  EGR_SUELDO: "Sueldos se proyectan automáticamente desde la dotación operativa configurada.",
  EGR_TURNO_EXTRA: "Promedio rolling de los últimos 8 lotes de turnos extra por instalación.",
  EGR_IVA_F29: "F29 = IVA débito (DTEs emitidos) − IVA crédito (DTEs recibidos). Pago día 12 del mes siguiente.",
};

export function CategoryAutoSourcesList({ categoryId }: { categoryId: string }) {
  const [sources, setSources] = useState<AutoSource[]>([]);
  const [categoryCode, setCategoryCode] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const r = await fetch(
          `/api/finance/cashflow/categorias/${categoryId}/auto-sources`,
        );
        const j = await r.json();
        if (j?.success) {
          setCategoryCode(j.data.categoryCode);
          setSources(j.data.sources);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [categoryId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-[12px] text-ds-text-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando fuentes...
      </div>
    );
  }

  const hint = HINT_BY_CODE[categoryCode];
  if (!hint) return null;

  return (
    <div className="space-y-2 rounded-ds-sm bg-status-info-soft/40 px-3 py-2">
      <div className="flex items-start gap-2">
        <Sparkles className="h-3.5 w-3.5 mt-0.5 text-status-info-fg shrink-0" />
        <div className="space-y-1 min-w-0">
          <p className="text-[12px] text-ds-text-2">
            <strong>Generador automático:</strong> {hint}
          </p>
          {sources.length > 0 && (
            <ul className="space-y-1 mt-2">
              {sources.map((s) => (
                <li key={s.id} className="text-[12px] flex items-center gap-2">
                  <Link
                    href={s.link}
                    className="text-status-info-fg hover:underline truncate flex-1 inline-flex items-center gap-1"
                  >
                    {s.label}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </Link>
                  <span className="font-mono text-[11px] text-ds-text-3 shrink-0">
                    ${fmt.format(s.monthlyAmount)}/mes
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/finance/cashflow/CategoryAutoSourcesList.tsx
git commit -m "feat(finanzas/flujo-caja): panel de fuentes auto-generadas por categoría"
```

---

### Task C5: `CategoryRowExpandable` y wirearlo en `CashflowConfigClient`

**Files:**
- Create: `src/components/finance/cashflow/CategoryRowExpandable.tsx`
- Modify: `src/components/finance/cashflow/CashflowConfigClient.tsx`

- [ ] **Step 1: Crear el wrapper expandible**

Create `src/components/finance/cashflow/CategoryRowExpandable.tsx`:

```tsx
"use client";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { CategoryItemsList } from "./CategoryItemsList";
import { CategoryAutoSourcesList } from "./CategoryAutoSourcesList";

const CATEGORIES_WITH_GENERATOR = new Set([
  "ING_VENTA_CONTRATO",
  "EGR_SUELDO",
  "EGR_TURNO_EXTRA",
  "EGR_IVA_F29",
]);

interface Props {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  categoryKind: "INCOME" | "EXPENSE";
  canManage: boolean;
  /** Render del header (la fila plana actual de la tabla). */
  header: React.ReactNode;
  /** Número de columnas del header para spans correctos. */
  colSpan: number;
}

export function CategoryRowExpandable({
  categoryId,
  categoryCode,
  categoryName,
  categoryKind,
  canManage,
  header,
  colSpan,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const hasGenerator = CATEGORIES_WITH_GENERATOR.has(categoryCode);

  return (
    <>
      <tr className="border-b border-border hover:bg-muted/20">
        <td className="p-2 w-6">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-0.5 rounded hover:bg-muted/40"
            aria-label={expanded ? "Colapsar" : "Expandir"}
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        </td>
        {header}
      </tr>
      {expanded && (
        <tr className="border-b border-border bg-muted/10">
          <td colSpan={colSpan + 1} className="p-3">
            <div className="space-y-3">
              {hasGenerator && <CategoryAutoSourcesList categoryId={categoryId} />}
              <CategoryItemsList
                categoryId={categoryId}
                categoryCode={categoryCode}
                categoryName={categoryName}
                categoryKind={categoryKind}
                canManage={canManage}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
```

- [ ] **Step 2: Wirear en `CashflowConfigClient.tsx`**

Buscar la tabla de categorías (en el `<tbody>`):

```tsx
{categories.map((c) => (
  <tr key={c.id} className="border-b border-border hover:bg-muted/20">
    {/* ... columnas existentes ... */}
  </tr>
))}
```

Reemplazar por:

```tsx
{categories.map((c) => (
  <CategoryRowExpandable
    key={c.id}
    categoryId={c.id}
    categoryCode={c.code}
    categoryName={c.name}
    categoryKind={c.kind}
    canManage={true}
    colSpan={6}
    header={
      <>
        <td className="p-2 font-mono text-ds-text-3">{c.code}</td>
        <td className="p-2">{c.name}</td>
        <td className="p-2">{c.kind === "INCOME" ? "↑ Ingreso" : "↓ Egreso"}</td>
        <td className="p-2">
          <CategoryAccountsEditor
            categoryId={c.id}
            accountOptions={accountOptions}
            canEdit={true}
          />
        </td>
        <td className="p-2 text-center">
          {c.isSystem ? (
            <span className="text-[11px] px-1.5 py-0.5 rounded-ds-sm bg-status-info-soft text-status-info-fg font-mono uppercase tracking-[0.08em]">
              Sistema
            </span>
          ) : (
            "—"
          )}
        </td>
        <td className="p-2 text-center">
          <Switch checked={c.isActive} onCheckedChange={() => toggleCategoryActive(c)} />
        </td>
        <td className="p-2 text-center">
          {!c.isSystem && (
            <button
              onClick={() => deleteCategory(c)}
              className="p-1 hover:bg-status-warn-soft rounded text-status-warn-fg"
              aria-label="Eliminar"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </td>
      </>
    }
  />
))}
```

Agregar al `<thead>` una columna extra al inicio (para el chevron):
```tsx
<th className="w-6 p-2"></th>
```

Y el import:
```tsx
import { CategoryRowExpandable } from "./CategoryRowExpandable";
```

- [ ] **Step 3: Smoke**

Run: `pnpm dev`
Open `/opai/configuracion/finanzas/flujo-caja`
- Cada categoría tiene un chevron al inicio.
- Click expande y muestra (a) "Generador automático" si aplica, (b) lista de items manuales con botón "Nuevo ítem".
- Click en un quote (en ING_VENTA_CONTRATO expandido) abre la ficha de cuenta CRM con el quote a editar.

- [ ] **Step 4: Commit**

```bash
git add src/components/finance/cashflow/CategoryRowExpandable.tsx src/components/finance/cashflow/CashflowConfigClient.tsx
git commit -m "feat(finanzas/flujo-caja): categorías expandibles con items manuales y fuentes auto"
```

---

### Task C6: Verificación + push de Fase C

- [ ] **Step 1: Tests + typecheck**

Run: `npx vitest run src/modules/finance/cashflow/__tests__/ src/lib/__tests__/`
Expected: green.

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "cashflow|cpq" | head`
Expected: empty.

- [ ] **Step 2: Smoke E2E**

1. Configuración cashflow → expandir cada categoría sistema. Verifica que ING_VENTA_CONTRATO muestra cotizaciones reales del tenant. EGR_SUELDO/EGR_TURNO_EXTRA/EGR_IVA_F29 muestran solo el hint.
2. En ING_VENTA_CONTRATO, click en una cotización → abre ficha de cuenta con foco en esa quote.
3. En EGR_TELEFONIA (manual), agrega un nuevo ítem con el botón inline.

- [ ] **Step 3: Push**

```bash
git push origin main
```

**Phase C done.**

---

# Plan-level verification

- [ ] **Step 1: Test suite full**

Run: `npx vitest run`
Expected: green en todo lo que se agregó (puede haber failures pre-existentes en `recurrence-engine.test.ts` por TZ — no es regresión).

- [ ] **Step 2: Typecheck full**

Run: `npx tsc --noEmit -p . 2>&1 | head -30`
Verificar que no hay errores nuevos en archivos del plan.

- [ ] **Step 3: Producción smoke**

1. `opai.gard.cl/opai/configuracion/finanzas/flujo-caja` → tolerancias claras, chip con nombre+buscador, expandir categoría funciona.
2. `opai.gard.cl/crm/cuentas/<accountId>` → sección "Contratos activos en flujo de caja" con cotizaciones de la cuenta. Editar instalación + modo de pago.
3. `opai.gard.cl/finanzas/flujo-caja` → click en celda de matriz semanal abre popover. "+1 sem" mueve la ocurrencia.

- [ ] **Step 4: Memory update**

Si durante la ejecución descubres algo no obvio (ej: el tab de Contratos en CRM tiene una estructura distinta a la asumida acá), actualiza `cashflow_vision.md` en memoria.

---

## Notes for the executor

- **Cada task = 1 commit.** No batchear. Push al final de cada fase.
- **TDD obligatorio** para business-days y para el service layer.
- **Tests con DB skipped** — usar `describe.skip` si dependen de fixtures (ya hay precedente en Fase 1).
- **DS Guard:** mantener `text-[12px]` mínimo para texto cuerpo. `text-[11px]` solo con `font-mono uppercase tracking-[0.08em]`.
- **No tocar** `actuals-matcher.ts` ni los otros 4 generators que no son `sales-from-contracts`.
- **Permission model unchanged:** `cashflow_view` para reads, `cashflow_manage` para writes de items/ocurrencias, `cashflow_configure` para config y mappings de cuenta.
