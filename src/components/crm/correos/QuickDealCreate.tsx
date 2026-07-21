"use client";

import { useState } from "react";
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

type Props = {
  accountId: string;
  defaultTitle: string;
  onCreated: (dealId: string) => void;
  onCancel: () => void;
};

/** Crea un negocio al vuelo (cuenta + título + stage inicial por defecto). */
export function QuickDealCreate({ accountId, defaultTitle, onCreated, onCancel }: Props) {
  const [title, setTitle] = useState(cleanSubject(defaultTitle) || "Nuevo negocio");
  const [saving, setSaving] = useState(false);

  async function create() {
    const t = title.trim();
    if (!t || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/crm/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, title: t }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.data?.id) throw new Error(body?.error || "No se pudo crear el negocio");
      toast.success(`Negocio "${t}" creado`);
      onCreated(body.data.id as string);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el negocio");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] text-ds-text-3">Nuevo negocio</span>
      <div className="flex gap-2">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void create();
            if (e.key === "Escape") onCancel();
          }}
          placeholder="Título del negocio"
          className="h-10 min-w-0 flex-1 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] text-ds-text-1 sm:h-9"
        />
        <button
          type="button"
          onClick={() => void create()}
          disabled={saving || !title.trim()}
          className="h-10 shrink-0 rounded-xl bg-primary px-3 text-[13px] font-medium text-primary-foreground ds-tap disabled:opacity-50 sm:h-9"
        >
          {saving ? "Creando…" : "Crear"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-10 shrink-0 rounded-xl border border-ds-border-default px-3 text-[13px] text-ds-text-2 ds-tap sm:h-9"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
