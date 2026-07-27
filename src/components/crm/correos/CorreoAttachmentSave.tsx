"use client";

import { useEffect, useState } from "react";
import { Check, Download, FolderPlus, Link2, X } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/opai-ds";
import type { SaveAttachmentResult } from "@/modules/crm/email/save-attachments";
import { useCloseOnBack } from "./useCloseOnBack";

export type SaveSheetItem = { messageId: string; attachmentId: string; filename: string; size: number };
type DealOpt = { id: string; title: string };
type FolderOpt = { id: string; name: string };
type Dest = { type: "account" | "deal"; id: string };

type Props = {
  open: boolean;
  onClose: () => void;
  threadId: string;
  items: SaveSheetItem[];
  accountId: string | null;
  accountName: string | null;
  dealId: string | null;
  dealTitle: string | null;
  /** Casilla Gmail de la que salió el correo (solo informativo). */
  mailboxEmail?: string | null;
  onSaved: () => void;
  /** Abre el panel de asociación del hilo (cuando no hay cuenta CRM). */
  onRequestAssociate?: () => void;
};

/**
 * Hoja de destino para guardar N adjuntos a una ficha CRM: elige entidad
 * (cuenta o negocio), carpeta y visibilidad en portal. Sin cuenta CRM
 * asociada, explica la diferencia Gmail vs CRM y ofrece "Asociar y guardar".
 * También permite descargar al teléfono sin asociar.
 */
export function CorreoAttachmentSave({
  open,
  onClose,
  threadId,
  items,
  accountId,
  accountName,
  dealId,
  dealTitle,
  mailboxEmail,
  onSaved,
  onRequestAssociate,
}: Props) {
  const [deals, setDeals] = useState<DealOpt[]>([]);
  const [dest, setDest] = useState<Dest | null>(null);
  const [folders, setFolders] = useState<FolderOpt[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [portalVisible, setPortalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<SaveAttachmentResult[] | null>(null);
  useCloseOnBack(open, onClose);

  // Precargar destino con la asociación del hilo (negocio si lo hay, si no cuenta).
  useEffect(() => {
    if (!open) return;
    setResults(null);
    setDest(dealId ? { type: "deal", id: dealId } : accountId ? { type: "account", id: accountId } : null);
    if (!accountId) return;
    fetch(`/api/crm/correos/deals-for-account?accountId=${encodeURIComponent(accountId)}`)
      .then((r) => r.json())
      .then((d) => setDeals(Array.isArray(d.items) ? d.items : []))
      .catch(() => setDeals([]));
  }, [open, accountId, dealId]);

  // Carpetas de la entidad destino (se recargan al cambiar el destino).
  useEffect(() => {
    if (!open || !dest) return;
    setFolderId(null);
    fetch(`/api/crm/folders?entityType=${dest.type}&entityId=${encodeURIComponent(dest.id)}`)
      .then((r) => r.json())
      .then((d) => setFolders(d.success && Array.isArray(d.data) ? d.data.map((f: FolderOpt) => ({ id: f.id, name: f.name })) : []))
      .catch(() => setFolders([]));
  }, [open, dest]);

  if (!open) return null;

  async function save() {
    if (!dest || items.length === 0) return;
    setSaving(true);
    try {
      const target = dest.type === "deal" ? { dealId: dest.id, accountId: accountId ?? undefined } : { accountId: dest.id };
      const res = await fetch(`/api/crm/correos/${threadId}/attachments/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, ...target, folderId, portalVisible }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; results?: SaveAttachmentResult[] };
      if (!res.ok) throw new Error(body?.error || "No se pudo guardar");
      const list = body.results ?? [];
      setResults(list);
      const saved = list.filter((r) => r.status === "saved").length;
      const already = list.filter((r) => r.status === "already").length;
      const errored = list.filter((r) => r.status === "error").length;
      if (errored === 0) toast.success(saved > 0 ? `${saved} adjunto(s) guardado(s) en OPAI` : `${already} ya estaban guardados`);
      else toast.message(`${saved} guardado(s), ${errored} con error`);
      if (errored === 0) onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  const destLabel = (d: Dest) => (d.type === "account" ? accountName || "la cuenta" : deals.find((x) => x.id === d.id)?.title || dealTitle || "el negocio");

  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] overflow-auto rounded-t-2xl border-t border-ds-border-subtle bg-ds-surface-1 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
      >
        <div className="flex items-center gap-2 border-b border-ds-border-subtle px-4 py-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold text-ds-text-1">
              Guardar {items.length} adjunto{items.length !== 1 ? "s" : ""}
            </h3>
            {mailboxEmail && (
              <p className="truncate text-[12px] text-ds-text-3">
                Casilla Gmail · {mailboxEmail}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="flex h-9 w-9 items-center justify-center rounded-lg text-ds-text-3 ds-tap">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!accountId ? (
          <div className="space-y-3 p-4">
            <p className="text-[13px] text-ds-text-2">
              Este correo de Gmail{mailboxEmail ? ` (${mailboxEmail})` : ""} aún no está vinculado a un{" "}
              <span className="font-medium text-ds-text-1">cliente / cuenta CRM</span> en OPAI.
              Asociarlo permite guardar los adjuntos en Documentos de esa ficha.
            </p>
            <button
              type="button"
              onClick={() => { onRequestAssociate?.(); onClose(); }}
              className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-medium text-primary-fg ds-tap"
            >
              <Link2 className="h-4 w-4" /> Asociar a cuenta CRM y guardar
            </button>
            <p className="text-center text-[12px] text-ds-text-4">
              También podés descargar el archivo al teléfono con el ícono de descarga, sin asociar.
            </p>
          </div>
        ) : results ? (
          <div className="space-y-1.5 p-4">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-ds-border-subtle px-3 py-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate text-ds-text-1">{r.filename}</span>
                <span className={r.status === "error" ? "text-status-danger-fg" : "text-status-ok-fg"}>
                  {r.status === "saved" ? "Guardado" : r.status === "already" ? "Ya existía" : r.error || "Error"}
                </span>
              </div>
            ))}
            <button type="button" onClick={onClose} className="mt-2 h-11 w-full rounded-lg border border-ds-border-default text-[13px] ds-tap">
              Listo
            </button>
          </div>
        ) : (
          <div className="space-y-4 p-4">
            <div className="space-y-1.5">
              <p className="text-[12px] font-medium text-ds-text-3">Guardar en OPAI (Documentos CRM)</p>
              <div className="flex flex-wrap gap-1.5">
                <DestChip active={dest?.type === "account" && dest.id === accountId} onClick={() => setDest({ type: "account", id: accountId })} label={accountName || "Cuenta"} />
                {deals.map((d) => (
                  <DestChip key={d.id} active={dest?.type === "deal" && dest.id === d.id} onClick={() => setDest({ type: "deal", id: d.id })} label={d.title} />
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-[12px] font-medium text-ds-text-3">Carpeta</p>
              <select
                value={folderId ?? ""}
                onChange={(e) => setFolderId(e.target.value || null)}
                className="h-11 w-full rounded-lg border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] text-ds-text-1"
              >
                <option value="">Sin carpeta</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>

            <label className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-ds-text-1">Visible en portal cliente</span>
              <input type="checkbox" checked={portalVisible} onChange={(e) => setPortalVisible(e.target.checked)} className="h-5 w-5 accent-[color:var(--primary)]" />
            </label>

            <button
              type="button"
              disabled={saving || !dest}
              onClick={() => void save()}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[14px] font-medium text-primary-fg ds-tap disabled:opacity-50"
            >
              {saving ? <Spinner className="h-4 w-4" /> : <FolderPlus className="h-4 w-4" />}
              Guardar en {dest ? destLabel(dest) : "…"}
            </button>

            <p className="flex items-center justify-center gap-1.5 text-[12px] text-ds-text-4">
              <Download className="h-3.5 w-3.5" />
              Para el teléfono usá Descargar / Compartir en el archivo
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function DestChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-9 max-w-full items-center gap-1 rounded-full border px-3 text-[12px] ds-tap ${
        active ? "border-primary bg-primary/10 text-ds-text-1" : "border-ds-border-default text-ds-text-2"
      }`}
    >
      {active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
      <span className="truncate">{label}</span>
    </button>
  );
}
