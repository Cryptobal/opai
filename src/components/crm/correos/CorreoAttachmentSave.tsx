"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Briefcase, Building2, Check, Download, FolderPlus, Link2, MapPin, X } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/opai-ds";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SaveAttachmentResult } from "@/modules/crm/email/save-attachments";
import { useCloseOnBack } from "./useCloseOnBack";
import { useCorreoReaderOverlayHost } from "./CorreoReaderOverlayContext";

export type SaveSheetItem = { messageId: string; attachmentId: string; filename: string; size: number };
type DealOpt = { id: string; title: string };
type FolderOpt = { id: string; name: string };
type Dest = { type: "account" | "deal" | "installation"; id: string };
type InstallationOpt = { id: string; label: string };

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
  /**
   * `inline` — formulario embebido (Copiloto): sin portal ni fullscreen.
   * `portal` — hoja sobre el lector / body (comportamiento histórico).
   */
  placement?: "portal" | "inline";
};

/**
 * Destino para guardar N adjuntos a una ficha CRM.
 * - portal: overlay en el host del lector (o body).
 * - inline: card dentro del flujo del Copiloto (sin tapar toda la pantalla).
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
  placement = "portal",
}: Props) {
  const overlayHost = useCorreoReaderOverlayHost();
  const [deals, setDeals] = useState<DealOpt[]>([]);
  const [installations, setInstallations] = useState<InstallationOpt[]>([]);
  const [dest, setDest] = useState<Dest | null>(null);
  const [folders, setFolders] = useState<FolderOpt[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [portalVisible, setPortalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<SaveAttachmentResult[] | null>(null);
  useCloseOnBack(open && placement === "portal", onClose);

  // Precargar destino con la asociación del hilo (negocio si lo hay, si no cuenta).
  useEffect(() => {
    if (!open) return;
    setResults(null);
    setDest(dealId ? { type: "deal", id: dealId } : accountId ? { type: "account", id: accountId } : null);
    if (!accountId) {
      setDeals([]);
      setInstallations([]);
      return;
    }
    fetch(`/api/crm/correos/deals-for-account?accountId=${encodeURIComponent(accountId)}`)
      .then((r) => r.json())
      .then((d) => setDeals(Array.isArray(d.items) ? d.items : []))
      .catch(() => setDeals([]));
    // Instalaciones vinculadas al hilo (API de links).
    fetch(`/api/crm/correos/${threadId}/links`)
      .then((r) => r.json())
      .then((d) => {
        const links = Array.isArray(d.links) ? d.links : [];
        setInstallations(
          links
            .filter(
              (l: { entityType?: string; orphan?: boolean; entityId?: string; label?: string }) =>
                l.entityType === "installation" && !l.orphan && l.entityId,
            )
            .map((l: { entityId: string; label: string }) => ({
              id: l.entityId,
              label: l.label || "Instalación",
            })),
        );
      })
      .catch(() => setInstallations([]));
  }, [open, accountId, dealId, threadId]);

  // Carpetas de la entidad destino (se recargan al cambiar el destino).
  useEffect(() => {
    if (!open || !dest) return;
    setFolderId(null);
    const entityType = dest.type === "installation" ? "installation" : dest.type;
    fetch(`/api/crm/folders?entityType=${entityType}&entityId=${encodeURIComponent(dest.id)}`)
      .then((r) => r.json())
      .then((d) => setFolders(d.success && Array.isArray(d.data) ? d.data.map((f: FolderOpt) => ({ id: f.id, name: f.name })) : []))
      .catch(() => setFolders([]));
  }, [open, dest]);

  if (!open) return null;

  async function save() {
    if (!dest || items.length === 0) return;
    setSaving(true);
    try {
      const target =
        dest.type === "deal"
          ? { dealId: dest.id, accountId: accountId ?? undefined }
          : dest.type === "installation"
            ? { installationId: dest.id, accountId: accountId ?? undefined }
            : { accountId: dest.id };
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

  const destLabel = (d: Dest) =>
    d.type === "account"
      ? accountName || "la cuenta"
      : d.type === "installation"
        ? installations.find((x) => x.id === d.id)?.label || "la instalación"
        : deals.find((x) => x.id === d.id)?.title || dealTitle || "el negocio";

  const destKindLabel =
    dest?.type === "deal" ? "negocio" : dest?.type === "installation" ? "instalación" : "cuenta";

  const formBody = !accountId ? (
    <div className="space-y-3 p-4">
      <p className="text-[13px] text-ds-text-2">
        Este correo de Gmail{mailboxEmail ? ` (${mailboxEmail})` : ""} aún no está vinculado a un{" "}
        <span className="font-medium text-ds-text-1">cliente / cuenta CRM</span> en OPAI.
        Asociarlo permite guardar los adjuntos en Documentos de esa ficha.
      </p>
      <button
        type="button"
        onClick={() => {
          onRequestAssociate?.();
          onClose();
        }}
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
        <div
          key={i}
          className="flex items-center gap-2 rounded-lg border border-ds-border-subtle px-3 py-2 text-[13px]"
        >
          <span className="min-w-0 flex-1 truncate text-ds-text-1">{r.filename}</span>
          <span className={r.status === "error" ? "text-status-danger-fg" : "text-status-ok-fg"}>
            {r.status === "saved" ? "Guardado" : r.status === "already" ? "Ya existía" : r.error || "Error"}
          </span>
        </div>
      ))}
      <button
        type="button"
        onClick={onClose}
        className="mt-2 h-11 w-full rounded-lg border border-ds-border-default text-[13px] ds-tap"
      >
        Listo
      </button>
    </div>
  ) : (
    <div className="space-y-4 p-4">
      <div className="space-y-2">
        <p className="text-[12px] font-medium text-ds-text-3">Guardar en OPAI (Documentos CRM)</p>
        <p className="text-[12px] text-ds-text-4">
          Para IA y seguimiento comercial, preferí el{" "}
          <span className="font-medium text-ds-text-2">negocio</span>.
          La cuenta es para documentos transversales del cliente.
        </p>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[12px] text-ds-text-4">
              <Building2 className="h-3.5 w-3.5" /> Cuenta
            </span>
            <DestChip
              active={dest?.type === "account" && dest.id === accountId}
              onClick={() => setDest({ type: "account", id: accountId })}
              label={accountName || "Cuenta"}
            />
          </div>
          {deals.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[12px] text-ds-text-4">
                <Briefcase className="h-3.5 w-3.5" /> Negocio
              </span>
              {deals.map((d) => (
                <DestChip
                  key={d.id}
                  active={dest?.type === "deal" && dest.id === d.id}
                  onClick={() => setDest({ type: "deal", id: d.id })}
                  label={d.title}
                />
              ))}
            </div>
          )}
          {installations.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[12px] text-ds-text-4">
                <MapPin className="h-3.5 w-3.5" /> Instalación
              </span>
              {installations.map((i) => (
                <DestChip
                  key={i.id}
                  active={dest?.type === "installation" && dest.id === i.id}
                  onClick={() => setDest({ type: "installation", id: i.id })}
                  label={i.label}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-[12px] font-medium text-ds-text-3">Carpeta</p>
        <Select
          value={folderId ?? "__none__"}
          onValueChange={(v) => setFolderId(v === "__none__" ? null : v)}
        >
          <SelectTrigger className="h-11 w-full rounded-lg border-ds-border-default bg-ds-surface-2 text-[13px] text-ds-text-1 sm:h-11">
            <SelectValue placeholder="Sin carpeta" />
          </SelectTrigger>
          <SelectContent className="z-[100] border-ds-border-default bg-ds-surface-1 text-ds-text-1">
            <SelectItem value="__none__">Sin carpeta</SelectItem>
            {folders.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-ds-border-subtle bg-ds-surface-2 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ds-text-1">Visible en portal cliente</p>
          <p className="text-[12px] text-ds-text-4">
            El cliente podrá ver este archivo en su portal.
          </p>
        </div>
        <Switch
          checked={portalVisible}
          onCheckedChange={setPortalVisible}
          aria-label="Visible en portal cliente"
        />
      </div>

      <button
        type="button"
        disabled={saving || !dest}
        onClick={() => void save()}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[14px] font-medium text-primary-fg ds-tap disabled:opacity-50"
      >
        {saving ? <Spinner className="h-4 w-4" /> : <FolderPlus className="h-4 w-4" />}
        Guardar en {dest ? `${destKindLabel} · ${destLabel(dest)}` : "…"}
      </button>

      <p className="flex items-center justify-center gap-1.5 text-[12px] text-ds-text-4">
        <Download className="h-3.5 w-3.5" />
        Para el teléfono usá Descargar / Compartir en el archivo
      </p>
    </div>
  );

  const header = (
    <div className="flex shrink-0 items-center gap-2 border-b border-ds-border-subtle px-4 py-3">
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
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-ds-text-3 ds-tap"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  if (placement === "inline") {
    return (
      <div
        role="region"
        aria-label="Guardar adjuntos"
        className="overflow-hidden rounded-xl border border-ds-border-subtle bg-ds-surface-1"
      >
        {header}
        <div className="max-h-[60vh] overflow-y-auto">{formBody}</div>
      </div>
    );
  }

  const sheet = (
    <div
      className="pointer-events-auto absolute inset-0 z-50 flex flex-col justify-end bg-black/50"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85%] flex-col overflow-hidden rounded-t-2xl border-t border-ds-border-subtle bg-ds-surface-1 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-ds-lg"
      >
        {header}
        <div className="min-h-0 flex-1 overflow-y-auto">{formBody}</div>
      </div>
    </div>
  );

  // Preferir el host del lector (ancho del visor). Fallback: body.
  if (overlayHost) return createPortal(sheet, overlayHost);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="pointer-events-auto fixed inset-0 z-[70]">{sheet}</div>,
    document.body,
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
