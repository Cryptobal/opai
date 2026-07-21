"use client";

import { useState } from "react";
import { FolderPlus } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type DealOpt = { id: string; title: string };

type Props = {
  threadId: string;
  messageId: string;
  attachmentId: string;
  dealId: string | null;
  dealTitle: string | null;
  accountId: string | null;
};

const BTN =
  "flex h-11 w-9 shrink-0 items-center justify-center text-ds-text-4 ds-tap hover:text-ds-text-2 disabled:opacity-40";

/**
 * Botón "Guardar" de un adjunto: al negocio del hilo (directo) o, si sólo hay
 * cuenta, popover para guardar en la cuenta o en uno de sus negocios. Sin
 * asociación queda deshabilitado. Los negocios se espejan a Drive.
 */
export function CorreoAttachmentSave({ threadId, messageId, attachmentId, dealId, dealTitle, accountId }: Props) {
  const [saving, setSaving] = useState(false);
  const [deals, setDeals] = useState<DealOpt[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function save(target: { dealId?: string; accountId?: string }, label: string, href?: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/crm/correos/${threadId}/attachments/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, attachmentId, ...target }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Error");
      if (body.already) toast.message("Ya estaba guardado");
      else if (href) toast.success(label, { action: { label: "Ver", onClick: () => { window.location.href = href; } } });
      else toast.success(label);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  if (!dealId && !accountId) {
    return (
      <button type="button" disabled className={BTN} title="Asocia el correo a una cuenta primero" aria-label="Guardar">
        <FolderPlus className="h-4 w-4" />
      </button>
    );
  }

  if (dealId) {
    return (
      <button
        type="button"
        disabled={saving}
        className={BTN}
        aria-label="Guardar en el negocio"
        title={`Guardar en ${dealTitle || "el negocio"}`}
        onClick={() =>
          void save({ dealId }, `Guardado en ${dealTitle || "el negocio"} · se sincroniza a Drive`, `/crm/deals/${dealId}`)
        }
      >
        <FolderPlus className="h-4 w-4" />
      </button>
    );
  }

  async function loadDeals() {
    if (loaded || !accountId) return;
    setLoaded(true);
    try {
      const r = await fetch(
        `/api/crm/correos/deals-for-account?accountId=${encodeURIComponent(accountId)}`,
      ).then((x) => x.json());
      setDeals(r.items ?? []);
    } catch {
      setDeals([]);
    }
  }

  return (
    <DropdownMenu onOpenChange={(o) => o && void loadDeals()}>
      <DropdownMenuTrigger asChild>
        <button type="button" disabled={saving} className={BTN} aria-label="Guardar" title="Guardar en documentos">
          <FolderPlus className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void save({ accountId: accountId ?? undefined }, "Guardado en la cuenta")}>
          Guardar en la cuenta
        </DropdownMenuItem>
        {deals.length > 0 && <DropdownMenuSeparator />}
        {deals.length > 0 && <DropdownMenuLabel>Guardar en un negocio</DropdownMenuLabel>}
        {deals.map((d) => (
          <DropdownMenuItem
            key={d.id}
            onSelect={() =>
              void save({ dealId: d.id }, `Guardado en ${d.title} · se sincroniza a Drive`, `/crm/deals/${d.id}`)
            }
          >
            {d.title}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
