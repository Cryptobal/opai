"use client";

import { useEffect, useState } from "react";
import { ChevronDown, PenLine } from "lucide-react";
import { renderSignatureHtml } from "@/modules/crm/email/signature-render";
import { isStructuredSignature } from "@/modules/crm/email/signature-data";

type Props = {
  onOpenFirma?: () => void;
};

/**
 * Chip colapsado en el pie del composer: "Firma: <nombre>" / "Sin firma".
 */
export function SignatureChip({ onOpenFirma }: Props) {
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

  const label = name ? `Firma: ${name}` : "Sin firma";

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
        <div className="mt-2 max-w-md rounded-xl border border-ds-border-subtle bg-white p-3 text-black shadow-sm">
          {html ? (
            <div dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <p className="text-[12px] text-[#5c6b82]">
              No hay firma predeterminada. Configúrala en Preferencias → Firma.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
