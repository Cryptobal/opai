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
import {
  describeCobranzaSource,
  pickCobranzaRecipients,
  type CobranzaContactInput,
} from "@/modules/finance/billing/cobranza-recipients";
import {
  cobranzaSlugLabel,
  suggestCobranzaSlug,
  type CobranzaChannel,
  type CobranzaSlug,
} from "@/modules/finance/billing/cobranza-shared";

interface Contact extends CobranzaContactInput {
  firstName: string;
  lastName: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  dteId: string;
  crmAccountId: string | null;
  daysOverdue: number;
  /** Canal preseleccionado (ej. desde CarteraPendienteSheet). */
  initialChannel?: CobranzaChannel;
}

export function CobranzaSendDialog({
  open,
  onClose,
  dteId,
  crmAccountId,
  daysOverdue,
  initialChannel,
}: Props) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactoCobranzaId, setContactoCobranzaId] = useState<string | null>(null);
  const [recipientSource, setRecipientSource] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [channel, setChannel] = useState<CobranzaChannel>("whatsapp");
  const [slug, setSlug] = useState<CobranzaSlug>(suggestCobranzaSlug(daysOverdue));
  const [customMessage, setCustomMessage] = useState("");
  const [previewMessage, setPreviewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSlug(suggestCobranzaSlug(daysOverdue));
      setChannel(initialChannel ?? "whatsapp");
      setCustomMessage("");
      setSelected(new Set());
      setError(null);
    }
  }, [open, daysOverdue, initialChannel]);

  useEffect(() => {
    if (!open || !crmAccountId) {
      setContacts([]);
      return;
    }
    fetch(`/api/crm/accounts/${crmAccountId}`)
      .then((r) => r.json())
      .then(async (accountJson) => {
        const contactoId =
          accountJson?.data?.contactoCobranzaId ??
          accountJson?.data?.contacto_cobranza_id ??
          null;
        setContactoCobranzaId(contactoId);

        const contactsRes = await fetch(`/api/crm/contacts?accountId=${crmAccountId}`);
        const contactsJson = await contactsRes.json();
        if (!contactsJson?.success || !Array.isArray(contactsJson.data)) {
          setContacts([]);
          return;
        }

        const mapped: Contact[] = contactsJson.data.map(
          (c: {
            id: string;
            firstName: string;
            lastName: string;
            email: string | null;
            phone: string | null;
            recibeCobranza?: boolean;
            isPrimary?: boolean;
          }) => ({
            id: c.id,
            firstName: c.firstName,
            lastName: c.lastName,
            email: c.email ?? null,
            phone: c.phone ?? null,
            recibeCobranza: c.recibeCobranza === true,
            isPrimary: c.isPrimary === true,
          }),
        );

        const sorted = mapped.sort((a, b) => {
          if (a.recibeCobranza !== b.recibeCobranza) return a.recibeCobranza ? -1 : 1;
          if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
          return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
        });
        setContacts(sorted);

        const picked = pickCobranzaRecipients({
          contactoCobranzaId: contactoId,
          contacts: sorted,
        });
        setRecipientSource(describeCobranzaSource(picked.source));

        const ch = initialChannel ?? "whatsapp";
        const defaultIds = picked.contacts
          .filter((c) => {
            if (ch === "email") return !!c.email;
            if (ch === "whatsapp") return !!c.phone;
            return !!c.email || !!c.phone;
          })
          .map((c) => c.id);
        setSelected(new Set(defaultIds));
      })
      .catch(() => {
        setContacts([]);
      });
  }, [open, crmAccountId, initialChannel]);

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
          setCustomMessage("");
        }
      })
      .catch(() => setPreviewMessage(""));
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
            customMessage.trim().length > 0 ? customMessage : undefined,
        }),
      });
      const j = await res.json();
      if (!j.success) {
        setError(j.error ?? "No se pudo enviar la cobranza");
        return;
      }
      const waUrls: string[] = (j.data?.results ?? [])
        .filter((r: { waUrl?: string; ok?: boolean }) => r.ok && r.waUrl)
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
                className={`flex-1 rounded-full border px-2 py-1.5 text-xs ${
                  slug === s
                    ? "border-primary/30 bg-primary/15 text-primary"
                    : "border-border text-muted-foreground"
                }`}
              >
                {cobranzaSlugLabel(s)}
              </button>
            ))}
          </div>
          {daysOverdue > 0 && (
            <p className="text-[10px] text-muted-foreground">
              Sugerido: {cobranzaSlugLabel(suggestCobranzaSlug(daysOverdue)).toLowerCase()} (
              {daysOverdue}d de mora)
            </p>
          )}

          <label className="text-xs text-muted-foreground">Canal</label>
          <div className="flex gap-1">
            {(["whatsapp", "email", "both"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChannel(c)}
                className={`flex-1 rounded-full border px-2 py-1.5 text-xs ${
                  channel === c
                    ? "border-primary/30 bg-primary/15 text-primary"
                    : "border-border text-muted-foreground"
                }`}
              >
                {c === "whatsapp" ? "WhatsApp" : c === "email" ? "Email" : "Ambos"}
              </button>
            ))}
          </div>

          <label className="text-xs text-muted-foreground">Destinatarios</label>
          {recipientSource && (
            <p className="text-[10px] text-muted-foreground">{recipientSource}</p>
          )}
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
            {!crmAccountId && (
              <p className="text-xs text-muted-foreground">
                Sin cuenta CRM vinculada — no hay contactos para cobranza.
              </p>
            )}
            {crmAccountId && contacts.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Sin contactos en el cliente CRM.
              </p>
            )}
            {contacts.map((c) => {
              const hasPhone = !!c.phone;
              const hasEmail = !!c.email;
              const disabled =
                (channel === "whatsapp" && !hasPhone) ||
                (channel === "email" && !hasEmail) ||
                (channel === "both" && !hasPhone && !hasEmail);
              const isExplicit = contactoCobranzaId === c.id;
              return (
                <label
                  key={c.id}
                  className={`flex items-center gap-2 py-1 text-sm ${disabled ? "opacity-50" : ""}`}
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
                  <span className="flex flex-1 items-center gap-1.5 truncate">
                    <span className="truncate">
                      {c.firstName} {c.lastName}
                    </span>
                    {isExplicit && (
                      <span className="shrink-0 rounded-full border border-primary/30 bg-primary/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-primary">
                        Cobranza
                      </span>
                    )}
                    {c.recibeCobranza && !isExplicit && (
                      <span className="shrink-0 rounded-full border border-ds-border-subtle px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-ds-text-3">
                        Flag
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {channel !== "email" && hasPhone
                      ? "WA"
                      : channel !== "whatsapp" && hasEmail
                        ? "Mail"
                        : channel === "both" && hasPhone && hasEmail
                          ? "WA+Mail"
                          : "·"}
                  </span>
                </label>
              );
            })}
          </div>

          <label className="text-xs text-muted-foreground">Mensaje (editable)</label>
          <Textarea
            value={messageValue}
            onChange={(e) => setCustomMessage(e.target.value)}
            rows={6}
            className="text-sm"
          />

          {error && (
            <div className="rounded-md border border-status-error-fg/20 bg-status-error-soft px-3 py-2 text-xs text-status-error-fg">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={selected.size === 0 || sending || !crmAccountId}>
            {sending ? "Enviando..." : `Enviar a ${selected.size}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
