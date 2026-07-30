"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  File,
  FileText,
  FolderPlus,
  Image as ImageIcon,
  Paperclip,
  Square,
  Unlink,
} from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ui/confirm-service";
import type { CorreoAttachmentDTO } from "@/modules/crm/email/correos.types";
import { CorreoAttachmentSave, type SaveSheetItem } from "./CorreoAttachmentSave";
import { CorreoAttachmentViewer, type ViewerFile } from "./CorreoAttachmentViewer";

function fmtSize(bytes: number): string {
  if (bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function iconFor(mime: string) {
  if (mime.includes("pdf")) return FileText;
  if (mime.startsWith("image/")) return ImageIcon;
  return File;
}

const keyOf = (a: CorreoAttachmentDTO) => `${a.messageId}-${a.attachmentId}`;

/** URL del adjunto con hints fn/sz: permiten re-ubicarlo si el id de Gmail rotó. */
function attachmentUrl(threadId: string, a: CorreoAttachmentDTO): string {
  const qs = new URLSearchParams({ fn: a.filename, sz: String(a.size) });
  return `/api/crm/correos/${threadId}/attachments/${a.messageId}/${a.attachmentId}?${qs}`;
}

export function CorreoAttachments({
  items,
  threadId,
  dealId,
  dealTitle,
  accountId,
  accountName,
  mailboxEmail,
  degraded,
  onSaved,
  onRequestAssociate,
  defaultOpen = false,
  savePlacement = "portal",
  hideCollapseHeader = false,
}: {
  items: CorreoAttachmentDTO[];
  threadId: string;
  dealId: string | null;
  dealTitle: string | null;
  accountId: string | null;
  accountName?: string | null;
  /** Casilla Gmail conectada (para aclarar destino al guardar). */
  mailboxEmail?: string | null;
  /** Gmail caído: no se permite seleccionar/guardar metadata incompleta. */
  degraded?: boolean;
  onSaved?: () => void;
  onRequestAssociate?: () => void;
  /** Por defecto colapsado (estilo Gmail). */
  defaultOpen?: boolean;
  /** En Copiloto: formulario de guardado embebido (sin fullscreen). */
  savePlacement?: "portal" | "inline";
  /** Oculta el toggle "Adjuntos (N)" cuando el contenedor ya tiene título. */
  hideCollapseHeader?: boolean;
}) {
  const [viewer, setViewer] = useState<ViewerFile | null>(null);
  const [viewerKey, setViewerKey] = useState<string | null>(null);
  const [open, setOpen] = useState(defaultOpen || hideCollapseHeader);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [unsavingId, setUnsavingId] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  if (items.length === 0) return null;

  const keys = items.map(keyOf);
  const allSelected = selected.size > 0 && keys.every((k) => selected.has(k));
  const toggle = (k: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(keys));

  const selectedItems: SaveSheetItem[] = items
    .filter((a) => selected.has(keyOf(a)))
    .map((a) => ({
      messageId: a.messageId,
      attachmentId: a.attachmentId,
      filename: a.filename,
      size: a.size,
    }));

  const destHref = dealId
    ? `/crm/deals/${dealId}`
    : accountId
      ? `/crm/accounts/${accountId}`
      : null;
  const canSelect = !degraded;

  function openViewer(a: CorreoAttachmentDTO) {
    const k = keyOf(a);
    setViewerKey(k);
    setViewer({
      url: attachmentUrl(threadId, a),
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
    });
  }

  function closeViewer() {
    const k = viewerKey;
    setViewer(null);
    setOpen(true);
    if (k) {
      requestAnimationFrame(() => {
        rowRefs.current.get(k)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    }
  }

  async function unsave(a: CorreoAttachmentDTO) {
    if (!a.savedFileId) return;
    const ok = await confirmDialog({
      title: "Quitar adjunto de OPAI",
      description: `Se eliminará «${a.filename}» de Documentos CRM. El archivo del correo no se borra.`,
      confirmLabel: "Quitar de OPAI",
      cancelLabel: "Cancelar",
      variant: "destructive",
    });
    if (!ok) return;

    setUnsavingId(a.savedFileId);
    try {
      const res = await fetch(
        `/api/crm/correos/${threadId}/attachments/save?fileId=${encodeURIComponent(a.savedFileId)}`,
        { method: "DELETE" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          typeof body.error === "string" ? body.error : "No se pudo quitar el adjunto",
        );
        return;
      }
      toast.success("Adjunto desasociado de OPAI");
      onSaved?.();
    } finally {
      setUnsavingId(null);
    }
  }

  return (
    <div className="space-y-1.5">
      {!hideCollapseHeader && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex h-9 flex-1 items-center gap-1.5 rounded-lg text-left text-[12px] font-medium text-ds-text-3 ds-tap"
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <Paperclip className="h-3.5 w-3.5" />
            Adjuntos ({items.length})
          </button>
          {open && canSelect && items.length > 1 && (
            <button
              type="button"
              onClick={toggleAll}
              className="shrink-0 px-2 text-[12px] text-primary ds-tap"
            >
              {allSelected ? "Quitar selección" : "Seleccionar todos"}
            </button>
          )}
        </div>
      )}

      {hideCollapseHeader && canSelect && items.length > 1 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={toggleAll}
            className="px-2 text-[12px] text-primary ds-tap"
          >
            {allSelected ? "Quitar selección" : "Seleccionar todos"}
          </button>
        </div>
      )}

      {open && (
        <ul className="space-y-1">
          {items.map((a) => {
            const k = keyOf(a);
            const Icon = iconFor(a.mimeType);
            const url = attachmentUrl(threadId, a);
            const isSel = selected.has(k);
            return (
              <li
                key={k}
                ref={(el) => {
                  if (el) rowRefs.current.set(k, el);
                  else rowRefs.current.delete(k);
                }}
                className="flex items-center gap-1 rounded-lg border border-ds-border-subtle bg-ds-surface-1 px-1.5 text-[13px] text-ds-text-2"
              >
                {canSelect && (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isSel}
                    aria-label={isSel ? "Quitar de la selección" : "Seleccionar"}
                    onClick={() => toggle(k)}
                    className="flex h-11 w-9 shrink-0 items-center justify-center text-ds-text-4 ds-tap"
                  >
                    {isSel ? (
                      <Check className="h-4 w-4 text-primary" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openViewer(a)}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left ds-tap"
                  title={a.filename}
                >
                  <Icon className="h-4 w-4 shrink-0 text-ds-text-4" />
                  <span className="min-w-0 flex-1 truncate">{a.filename}</span>
                  <span className="shrink-0 text-[12px] text-ds-text-4">{fmtSize(a.size)}</span>
                </button>
                {a.savedFileId &&
                  (destHref ? (
                    <Link
                      href={destHref}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-status-ok-soft px-2 py-0.5 text-[12px] font-medium text-status-ok-fg ds-tap"
                    >
                      <Check className="h-3 w-3" /> Guardado
                    </Link>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-status-ok-soft px-2 py-0.5 text-[12px] font-medium text-status-ok-fg">
                      <Check className="h-3 w-3" /> Guardado
                    </span>
                  ))}
                {a.savedFileId && (
                  <button
                    type="button"
                    aria-label={`Quitar ${a.filename} de OPAI`}
                    title="Quitar de OPAI"
                    disabled={unsavingId === a.savedFileId}
                    onClick={() => void unsave(a)}
                    className="flex h-11 w-9 shrink-0 items-center justify-center text-ds-text-4 ds-tap hover:text-status-danger-fg disabled:opacity-50"
                  >
                    <Unlink className="h-4 w-4" />
                  </button>
                )}
                <a
                  href={url}
                  download={a.filename}
                  aria-label="Descargar"
                  title="Descargar"
                  className="flex h-11 w-9 shrink-0 items-center justify-center text-ds-text-4 ds-tap hover:text-ds-text-2"
                >
                  <Download className="h-4 w-4" />
                </a>
              </li>
            );
          })}
        </ul>
      )}

      {open && selected.size > 0 && !sheetOpen && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[14px] font-medium text-primary-fg ds-tap"
        >
          <FolderPlus className="h-4 w-4" /> Guardar ({selected.size})
        </button>
      )}

      <CorreoAttachmentSave
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        threadId={threadId}
        items={selectedItems}
        accountId={accountId}
        accountName={accountName ?? null}
        dealId={dealId}
        dealTitle={dealTitle}
        mailboxEmail={mailboxEmail}
        onRequestAssociate={onRequestAssociate}
        placement={savePlacement}
        onSaved={() => {
          setSelected(new Set());
          setSheetOpen(false);
          onSaved?.();
        }}
      />
      <CorreoAttachmentViewer file={viewer} onClose={closeViewer} />
    </div>
  );
}
