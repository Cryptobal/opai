"use client";

import { useEffect, useState } from "react";
import { ChevronDown, PenLine } from "lucide-react";
import { renderSignatureHtml } from "@/modules/crm/email/signature-render";
import { isStructuredSignature } from "@/modules/crm/email/signature-data";

type Props = {
  onOpenFirma?: () => void;
  /** Si false, el envío no anexa firma. Default true. */
  includeSignature?: boolean;
  onIncludeSignatureChange?: (include: boolean) => void;
};

/**
 * Chip colapsado en el pie del composer: "Firma: <nombre>" / "Sin firma".
 * Permite activar/desactivar la firma para este correo.
 */
export function SignatureChip({
  onOpenFirma,
  includeSignature = true,
  onIncludeSignatureChange,
}: Props) {
  const [name, setName] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        type Row = {
          name: string;
          isDefault: boolean;
          htmlContent?: string | null;
          content?: unknown;
          userId?: string | null;
        };
        // Personal (mine) → empresa (userId null). Nunca la firma de otro usuario.
        const [mineR, allR] = await Promise.all([
          fetch("/api/crm/signatures?mine=true"),
          fetch("/api/crm/signatures"),
        ]);
        if (!mineR.ok) return;
        const mine = ((await mineR.json()).data ?? []) as Row[];
        const personal = mine.find((x) => x.isDefault) ?? null;
        let company: Row | null = null;
        if (!personal && allR.ok) {
          const all = ((await allR.json()).data ?? []) as Row[];
          company = all.find((x) => x.isDefault && x.userId == null) ?? null;
        }
        const pick = personal ?? company;
        if (!alive) return;
        if (!pick) {
          setName(null);
          setHtml(null);
          return;
        }
        setName(pick.name);
        if (isStructuredSignature(pick.content)) {
          setHtml(renderSignatureHtml(pick.content));
        } else {
          setHtml(pick.htmlContent ?? null);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const hasSignature = Boolean(name && html);
  const active = includeSignature && hasSignature;
  const label = !hasSignature
    ? "Sin firma"
    : active
      ? `Firma: ${name}`
      : "Firma: desactivada";

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-9 max-w-full items-center gap-1 rounded-lg border border-ds-border-subtle bg-ds-surface-2 px-2 text-[12px] text-ds-text-2 ds-tap"
        >
          <PenLine className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{label}</span>
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition ${open ? "rotate-180" : ""}`} />
        </button>
        {onOpenFirma && (
          <button
            type="button"
            onClick={onOpenFirma}
            className="h-9 rounded-lg px-2 text-[12px] text-primary ds-tap"
          >
            Editar
          </button>
        )}
      </div>
      {open && (
        <div className="mt-2 max-w-md space-y-2 rounded-xl border border-ds-border-subtle bg-ds-surface-1 p-3 shadow-sm">
          {hasSignature && onIncludeSignatureChange && (
            <label className="flex min-h-11 items-center justify-between gap-3 text-[13px] text-ds-text-2">
              <span>Incluir firma en este correo</span>
              <input
                type="checkbox"
                checked={includeSignature}
                onChange={(e) => onIncludeSignatureChange(e.target.checked)}
                className="h-5 w-5 accent-primary"
              />
            </label>
          )}
          {hasSignature && includeSignature ? (
            <div className="rounded-lg bg-white p-3 text-black">
              <div dangerouslySetInnerHTML={{ __html: html! }} />
            </div>
          ) : hasSignature ? (
            <p className="text-[12px] text-ds-text-3">
              Este correo se enviará sin firma. Podés volver a activarla acá.
            </p>
          ) : (
            <p className="text-[12px] text-ds-text-3">
              No hay firma predeterminada. Configúrala en Preferencias → Firma.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
