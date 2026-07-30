"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

/** Quita prefijos de respuesta/reenvío del asunto ("RE:", "FW:", "RV:"…). */
function cleanSubject(raw: string): string {
  let s = raw.trim();
  let prev: string;
  do {
    prev = s;
    s = s.replace(/^\s*(re|rv|fw|fwd)\s*:\s*/i, "").trim();
  } while (s !== prev);
  return s.slice(0, 200);
}

export type DealPrefill = {
  title?: string;
  amount?: number | null;
  stageId?: string | null;
  stageName?: string | null;
  /** Marca los campos como propuesta IA (chip + estilo). */
  fromAi?: boolean;
};

type Props = {
  accountId: string;
  defaultTitle: string;
  prefill?: DealPrefill | null;
  onCreated: (dealId: string) => void;
  onCancel: () => void;
};

/** Crea un negocio al vuelo (cuenta + título + monto/etapa opcionales). */
export function QuickDealCreate({
  accountId,
  defaultTitle,
  prefill,
  onCreated,
  onCancel,
}: Props) {
  const [title, setTitle] = useState(
    prefill?.title?.trim() || cleanSubject(defaultTitle) || "Nuevo negocio",
  );
  const [amount, setAmount] = useState(
    prefill?.amount != null && prefill.amount > 0 ? String(prefill.amount) : "",
  );
  const [saving, setSaving] = useState(false);
  const fromAi = Boolean(prefill?.fromAi);

  async function create() {
    const t = title.trim();
    if (!t || saving) return;
    setSaving(true);
    try {
      const parsedAmount = amount.trim() ? Number(amount.replace(",", ".")) : 0;
      const body: Record<string, unknown> = {
        accountId,
        title: t,
        amount: Number.isFinite(parsedAmount) && parsedAmount >= 0 ? parsedAmount : 0,
      };
      if (prefill?.stageId) body.stageId = prefill.stageId;
      else if (prefill?.stageName) body.stageName = prefill.stageName;

      const res = await fetch("/api/crm/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.data?.id) throw new Error(json?.error || "No se pudo crear el negocio");
      toast.success(`Negocio "${t}" creado`);
      onCreated(json.data.id as string);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el negocio");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="inline-flex items-center gap-1 text-[12px] text-ds-text-3">
        {fromAi ? (
          <>
            <Sparkles className="h-3.5 w-3.5 text-tint-violet-fg" />
            Nuevo negocio · propuesta IA
          </>
        ) : (
          "Nuevo negocio"
        )}
      </span>
      <div className="flex flex-col gap-2">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void create();
            if (e.key === "Escape") onCancel();
          }}
          placeholder="Título del negocio"
          className={`h-10 min-w-0 w-full rounded-xl border bg-ds-surface-1 px-3 text-ds-body text-ds-text-1 sm:h-9 ${
            fromAi ? "border-tint-violet/40" : "border-ds-border-default"
          }`}
        />
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={fromAi ? "Monto (sugerido)" : "Monto (opcional)"}
            className={`h-10 min-w-0 flex-1 rounded-xl border bg-ds-surface-1 px-3 text-ds-body text-ds-text-1 sm:h-9 ${
              fromAi && amount ? "border-tint-violet/40" : "border-ds-border-default"
            }`}
          />
          {fromAi && prefill?.stageName && (
            <span className="inline-flex h-10 shrink-0 items-center rounded-full border border-tint-violet/40 bg-tint-violet/10 px-2.5 text-[12px] text-tint-violet-fg sm:h-9">
              {prefill.stageName}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void create()}
            disabled={saving || !title.trim()}
            className="h-10 flex-1 rounded-xl bg-primary px-3 text-ds-body font-medium text-primary-foreground ds-tap disabled:opacity-50 sm:h-9"
          >
            {saving ? "Creando…" : "Confirmar y crear"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-10 shrink-0 rounded-xl border border-ds-border-default px-3 text-ds-body text-ds-text-2 ds-tap sm:h-9"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
