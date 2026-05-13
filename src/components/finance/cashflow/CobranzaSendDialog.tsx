"use client";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  dteId: string;
  crmAccountId: string | null;
  daysOverdue: number;
}

type CobranzaSlug = "cobranza_amable" | "cobranza_firme" | "cobranza_prejudicial";
type Channel = "whatsapp" | "email" | "both";

function suggestSlug(daysOverdue: number): CobranzaSlug {
  if (daysOverdue <= 7) return "cobranza_amable";
  if (daysOverdue <= 30) return "cobranza_firme";
  return "cobranza_prejudicial";
}

function slugLabel(s: CobranzaSlug): string {
  return s === "cobranza_amable"
    ? "Amable"
    : s === "cobranza_firme"
      ? "Firme"
      : "Pre-judicial";
}

export function CobranzaSendDialog({
  open,
  onClose,
  dteId,
  crmAccountId,
  daysOverdue,
}: Props) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [slug, setSlug] = useState<CobranzaSlug>(suggestSlug(daysOverdue));
  const [customMessage, setCustomMessage] = useState("");
  const [previewMessage, setPreviewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state cuando se abre el diálogo.
  useEffect(() => {
    if (open) {
      setSlug(suggestSlug(daysOverdue));
      setChannel("whatsapp");
      setCustomMessage("");
      setSelected(new Set());
      setError(null);
    }
  }, [open, daysOverdue]);

  // Cargar contactos del cliente CRM.
  useEffect(() => {
    if (!open || !crmAccountId) return;
    fetch(`/api/crm/contacts?accountId=${crmAccountId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j?.success && Array.isArray(j.data)) {
          setContacts(
            j.data.map(
              (c: {
                id: string;
                firstName: string;
                lastName: string;
                email: string | null;
                phone: string | null;
              }) => ({
                id: c.id,
                firstName: c.firstName,
                lastName: c.lastName,
                email: c.email ?? null,
                phone: c.phone ?? null,
              }),
            ),
          );
        }
      })
      .catch(() => {
        // Sin contactos disponibles — el diálogo se mantiene utilizable con
        // el preview, pero el botón Enviar queda deshabilitado.
      });
  }, [open, crmAccountId]);

  // Resolver preview del template cada vez que cambia el slug.
  useEffect(() => {
    if (!open) return;
    fetch("/api/whatsapp/resolve-template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, entityType: "dte", entityId: dteId }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (j?.success && j.data) {
          setPreviewMessage(j.data.message ?? "");
          // Si el usuario aún no editó, reseteamos el customMessage para que
          // refleje el cambio de tono al elegir otro slug.
          setCustomMessage("");
        }
      })
      .catch(() => {
        setPreviewMessage("");
      });
  }, [open, slug, dteId]);

  async function handleSend() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/finance/cashflow/cobranza/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dteId,
          channel,
          contactIds: Array.from(selected),
          slug,
          customMessage:
            customMessage && customMessage.trim().length > 0
              ? customMessage
              : undefined,
        }),
      });
      const j = await res.json();
      if (!j.success) {
        setError(j.error ?? "No se pudo enviar la cobranza");
        return;
      }
      const waUrls: string[] = (j.data?.results ?? [])
        .filter((r: { waUrl?: string }) => r.waUrl)
        .map((r: { waUrl: string }) => r.waUrl);
      waUrls.forEach((url: string) => window.open(url, "_blank"));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setSending(false);
    }
  }

  const messageValue = customMessage || previewMessage;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar cobranza</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Tono del mensaje */}
          <label className="text-xs text-muted-foreground">Tono del mensaje</label>
          <div className="flex gap-1">
            {(
              [
                "cobranza_amable",
                "cobranza_firme",
                "cobranza_prejudicial",
              ] as const
            ).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSlug(s)}
                className={`flex-1 text-xs px-2 py-1.5 rounded-full border ${
                  slug === s
                    ? "bg-primary/15 border-primary/30 text-primary"
                    : "border-border text-muted-foreground"
                }`}
              >
                {slugLabel(s)}
              </button>
            ))}
          </div>
          {daysOverdue > 0 && (
            <p className="text-[10px] text-muted-foreground">
              Sugerido: {slugLabel(suggestSlug(daysOverdue)).toLowerCase()} (
              {daysOverdue}d de mora)
            </p>
          )}

          {/* Canal */}
          <label className="text-xs text-muted-foreground">Canal</label>
          <div className="flex gap-1">
            {(["whatsapp", "email", "both"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChannel(c)}
                className={`flex-1 text-xs px-2 py-1.5 rounded-full border ${
                  channel === c
                    ? "bg-primary/15 border-primary/30 text-primary"
                    : "border-border text-muted-foreground"
                }`}
              >
                {c === "whatsapp" ? "WhatsApp" : c === "email" ? "Email" : "Ambos"}
              </button>
            ))}
          </div>

          {/* Destinatarios */}
          <label className="text-xs text-muted-foreground">Destinatarios</label>
          <div className="max-h-40 overflow-y-auto space-y-1 border rounded-md p-2">
            {contacts.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Sin contactos en el cliente CRM.
              </p>
            )}
            {contacts.map((c) => {
              const hasPhone = !!c.phone;
              const hasEmail = !!c.email;
              const disabled =
                (channel === "whatsapp" && !hasPhone) ||
                (channel === "email" && !hasEmail);
              return (
                <label
                  key={c.id}
                  className={`flex items-center gap-2 text-sm py-1 ${
                    disabled ? "opacity-50" : ""
                  }`}
                >
                  <Checkbox
                    checked={selected.has(c.id)}
                    disabled={disabled}
                    onCheckedChange={(v) => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (v) next.add(c.id);
                        else next.delete(c.id);
                        return next;
                      });
                    }}
                  />
                  <span className="flex-1 truncate">
                    {c.firstName} {c.lastName}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {channel !== "email" && hasPhone
                      ? "WA"
                      : channel !== "whatsapp" && hasEmail
                        ? "Mail"
                        : "·"}
                  </span>
                </label>
              );
            })}
          </div>

          {/* Mensaje editable */}
          <label className="text-xs text-muted-foreground">
            Mensaje (editable)
          </label>
          <Textarea
            value={messageValue}
            onChange={(e) => setCustomMessage(e.target.value)}
            rows={6}
            className="text-sm"
          />

          {error && (
            <div className="text-xs text-status-error-fg bg-status-error-soft border border-status-error-fg/20 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSend}
            disabled={selected.size === 0 || sending}
          >
            {sending ? "Enviando..." : `Enviar a ${selected.size}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
