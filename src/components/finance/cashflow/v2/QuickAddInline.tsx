"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toDate } from "./format";

interface Props {
  kind: "INCOME" | "EXPENSE";
  bucketStart: Date | string;
  onAdded?: () => void;
}

/** Mini-form inline para agregar una occurrence manual rápida (concepto +
 *  monto) en la fecha de inicio del bucket. Llama a upsert-and-act
 *  action=create. */
export function QuickAddInline({ kind, bucketStart, onAdded }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const n = name.trim();
    const a = parseInt(amount.replace(/[^\d]/g, ""), 10);
    if (!n || !Number.isFinite(a) || a <= 0) {
      toast.error("Indica un concepto y un monto válido");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/finance/cashflow/occurrences/upsert-and-act", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          kind,
          name: n,
          amountClp: a,
          scheduledDate: toDate(bucketStart).toISOString().slice(0, 10),
          source: "MANUAL",
        }),
      });
      const j = await res.json();
      if (j?.success) {
        setName("");
        setAmount("");
        setOpen(false);
        toast.success("Movimiento agregado");
        onAdded?.();
      } else {
        toast.error(j?.error ?? "No se pudo agregar");
      }
    } catch {
      toast.error("Error de red al agregar");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="inline-flex h-7 w-7 items-center justify-center rounded-ds-sm text-ds-text-3 hover:bg-ds-surface-3 hover:text-ds-text-1 active:scale-95"
        aria-label={`Agregar ${kind === "INCOME" ? "ingreso" : "egreso"} manual`}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <div
      className="my-1.5 rounded-ds-md border border-dashed border-ds-border-strong bg-ds-surface-2 px-2 pb-1 pt-2"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <Plus className="h-3 w-3 text-primary" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
          Nuevo {kind === "INCOME" ? "ingreso" : "egreso"} manual
        </span>
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Concepto"
        className="mb-1.5 w-full rounded-ds-md border border-ds-border-default bg-ds-surface-3 px-2 py-1.5 text-[12px] text-ds-text-1 placeholder:text-ds-text-3 focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <div className="flex gap-1.5">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Monto $"
          inputMode="numeric"
          className="flex-1 rounded-ds-md border border-ds-border-default bg-ds-surface-3 px-2 py-1.5 text-[12px] tabular-nums text-ds-text-1 placeholder:text-ds-text-3 focus:outline-none focus:ring-1 focus:ring-primary"
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
        />
        <Button size="sm" onClick={submit} disabled={submitting} className="h-8 text-[11px]">
          Agregar
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-ds-md text-ds-text-3",
            "hover:bg-ds-surface-3 hover:text-ds-text-1",
          )}
          aria-label="Cancelar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
