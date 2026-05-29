"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { toDate } from "./format";

interface Props {
  kind: "INCOME" | "EXPENSE";
  bucketStart: Date | string;
  onAdded?: () => void;
}

/** Quick-add manual: en mobile vertical es un bottom-sheet con backdrop;
 *  en desktop/landscape es un pop-out inline al lado del "+". Tap fuera cierra.
 *  Acepta Concepto + Monto + Nota (opcional). Llama a upsert-and-act
 *  action=create. */
export function QuickAddInline({ kind, bucketStart, onAdded }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const popoutRef = useRef<HTMLDivElement>(null);

  // Tap fuera del pop-out (desktop / landscape) cierra. En mobile el cierre por
  // tap-fuera lo maneja el onClick del backdrop. Pequeño delay para no atrapar
  // el mismo click que abrió el panel.
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (popoutRef.current && !popoutRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    const t = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 50);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  function reset() {
    setName("");
    setAmount("");
    setNotes("");
  }

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
          notes: notes.trim() || null,
        }),
      });
      const j = await res.json();
      if (j?.success) {
        reset();
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

  const trigger = (
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

  if (!open) {
    return trigger;
  }

  // Form que va dentro del sheet/popout (mismo markup en ambos contextos).
  const formMarkup = (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
          <Plus className="h-3 w-3" />
          Nuevo {kind === "INCOME" ? "ingreso" : "egreso"} manual
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-ds-md p-1.5 text-ds-text-3 hover:bg-ds-surface-3 hover:text-ds-text-1"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Concepto"
          className="w-full rounded-ds-md border border-ds-border-default bg-ds-surface-3 px-2.5 py-2 text-[13px] text-ds-text-1 placeholder:text-ds-text-3 focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Monto $"
          type="text"
          inputMode="numeric"
          className="w-full rounded-ds-md border border-ds-border-default bg-ds-surface-3 px-2.5 py-2 text-[13px] tabular-nums text-ds-text-1 placeholder:text-ds-text-3 focus:outline-none focus:ring-1 focus:ring-primary"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) void submit();
          }}
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Nota (opcional)"
          rows={2}
          className="w-full resize-none rounded-ds-md border border-ds-border-default bg-ds-surface-3 px-2.5 py-2 text-[12px] text-ds-text-1 placeholder:text-ds-text-3 focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          onClick={submit}
          disabled={submitting || !name.trim() || !amount}
          className="flex-1"
        >
          Agregar
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
          Cancelar
        </Button>
      </div>
    </>
  );

  return (
    <span className="relative inline-flex">
      {trigger}

      {/* Mobile vertical (md-): bottom-sheet con backdrop. Tap en el backdrop cierra. */}
      <div
        className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 md:hidden"
        onClick={() => setOpen(false)}
      >
        <div
          className="max-h-[80vh] w-full overflow-y-auto rounded-t-2xl border-x border-t border-ds-border-strong bg-ds-surface-1 px-4 pb-5 pt-3"
          onClick={(e) => e.stopPropagation()}
        >
          {formMarkup}
        </div>
      </div>

      {/* Desktop / mobile landscape: pop-out inline al lado del "+". */}
      <div
        ref={popoutRef}
        className="absolute right-0 top-full z-30 mt-2 hidden w-[320px] rounded-ds-lg border border-ds-border-strong bg-ds-surface-2 p-3 text-left shadow-xl md:block"
        onClick={(e) => e.stopPropagation()}
      >
        {formMarkup}
      </div>
    </span>
  );
}
