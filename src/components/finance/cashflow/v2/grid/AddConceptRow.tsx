"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ProjectionBucket } from "@/modules/finance/cashflow/types";
import { formatThousands, parseAmount } from "../amount-format";
import { createManualEntryViaApi } from "./cashflow-create";
import { ConceptTypeahead } from "./ConceptTypeahead";
import type { ConceptOption } from "./concept-options";
import { ymd } from "./cell-occurrences";
import type { BucketMeta } from "./grid-helpers";
import { rangeFromBucketKeys } from "./return-range-client";
import type { ProjectionMatrix } from "@/modules/finance/cashflow/types";

type Phase =
  | { step: "idle" }
  | { step: "pick"; query: string }
  | { step: "amount"; concept: ConceptOption; bucketIdx: number };

/**
 * Fila fantasma "+ Agregar…" : type-ahead → monto en semana abierta → Enter
 * crea MANUAL; Tab crea y salta a la siguiente semana abierta (mismo concepto).
 */
export function AddConceptRow({
  kind,
  buckets,
  currentIdx,
  bucketMeta,
  options,
  onCreated,
}: {
  kind: "INCOME" | "EXPENSE";
  buckets: ProjectionBucket[];
  currentIdx: number;
  bucketMeta?: Map<string, BucketMeta>;
  options: ConceptOption[];
  onCreated: (patch: {
    itemId: string;
    bucketKey: string;
    amount: number;
    projection?: ProjectionMatrix;
  }) => void;
}) {
  const [phase, setPhase] = useState<Phase>({ step: "idle" });
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const hint =
    kind === "INCOME" ? "+ Agregar ingreso…" : "+ Agregar egreso…";

  function openWeekIdx(from: number): number {
    for (let i = Math.max(0, from); i < buckets.length; i++) {
      if (!bucketMeta?.get(buckets[i].key)?.closed) return i;
    }
    return -1;
  }

  function chooseConcept(c: ConceptOption) {
    const idx = openWeekIdx(currentIdx >= 0 ? currentIdx : 0);
    if (idx < 0) {
      toast.error("No hay semana abierta para agregar");
      setPhase({ step: "idle" });
      return;
    }
    setPhase({ step: "amount", concept: c, bucketIdx: idx });
    setRaw("");
    requestAnimationFrame(() => amountRef.current?.focus());
  }

  async function commitAmount(thenTab: boolean) {
    if (phase.step !== "amount" || busy) return;
    const amount = parseAmount(raw);
    if (!amount || amount <= 0) {
      toast.error("Indica un monto válido");
      return;
    }
    const b = buckets[phase.bucketIdx];
    if (!b || bucketMeta?.get(b.key)?.closed) {
      toast.error("Semana cerrada");
      return;
    }
    setBusy(true);
    const res = await createManualEntryViaApi({
      kind,
      name: phase.concept.name,
      amountClp: amount,
      scheduledDate: ymd(b.start),
      categoryId: phase.concept.categoryId,
      returnRange: rangeFromBucketKeys([b.key]),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo crear");
      return;
    }
    onCreated({
      itemId: res.id ?? `tmp-${Date.now()}`,
      bucketKey: b.key,
      amount,
      projection: res.projection,
    });
    toast.success(`«${phase.concept.name}» agregado`);
    if (thenTab) {
      const next = openWeekIdx(phase.bucketIdx + 1);
      if (next >= 0) {
        setPhase({ step: "amount", concept: phase.concept, bucketIdx: next });
        setRaw("");
        requestAnimationFrame(() => amountRef.current?.focus());
        return;
      }
    }
    setPhase({ step: "idle" });
    setRaw("");
  }

  return (
    <tr className="border-b border-ds-border-subtle">
      <td className="sticky left-0 z-10 max-md:max-w-[128px] border-r border-ds-border-default bg-ds-surface-1 p-1.5">
        {phase.step === "idle" && (
          <button
            type="button"
            onClick={() => setPhase({ step: "pick", query: "" })}
            className="flex h-10 w-full items-center rounded-ds-sm px-1.5 text-left text-ds-body text-ds-text-4 hover:bg-ds-surface-2 hover:text-ds-text-2 sm:h-9"
          >
            {hint}
          </button>
        )}
        {phase.step === "pick" && (
          <ConceptTypeahead
            query={phase.query}
            onQuery={(q) => setPhase({ step: "pick", query: q })}
            options={options}
            onChoose={chooseConcept}
            onCancel={() => setPhase({ step: "idle" })}
          />
        )}
        {phase.step === "amount" && (
          <div className="px-1.5 text-[12px] text-ds-text-3">
            <span className="font-medium text-ds-text-2">{phase.concept.name}</span>
            <button
              type="button"
              className="ml-2 text-ds-text-4 underline"
              onClick={() => setPhase({ step: "idle" })}
            >
              cancelar
            </button>
          </div>
        )}
      </td>
      {buckets.map((b, i) => (
        <td
          key={b.key}
          className={cn(
            "border-l border-ds-border-subtle px-1 py-1 align-middle",
            i === currentIdx && "bg-primary/[0.04]",
          )}
        >
          {phase.step === "amount" && phase.bucketIdx === i ? (
            <input
              ref={amountRef}
              value={raw}
              disabled={busy}
              onChange={(e) => setRaw(formatThousands(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setPhase({ step: "idle" });
                  setRaw("");
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  void commitAmount(false);
                }
                if (e.key === "Tab") {
                  e.preventDefault();
                  void commitAmount(true);
                }
              }}
              placeholder="$"
              className="mx-auto block h-10 w-full max-w-[5.5rem] rounded-ds-sm border border-ds-border-default bg-ds-surface-1 px-1.5 text-center font-mono text-ds-body tabular-nums sm:h-9"
            />
          ) : null}
        </td>
      ))}
    </tr>
  );
}
