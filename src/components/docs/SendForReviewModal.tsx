"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, Mail, UserRound, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DocAssociation } from "@/types/docs";
import type { CrmContact } from "@/types/crm";

interface SendForReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  associations?: DocAssociation[];
  onSent: () => void;
}

type ManualRow = { id: string; name: string; email: string };

type ContactOption = {
  id: string;
  name: string;
  email: string;
  roleTitle?: string | null;
  isPrimary: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function newManualRow(): ManualRow {
  return { id: crypto.randomUUID(), name: "", email: "" };
}

export function SendForReviewModal({
  open,
  onOpenChange,
  documentId,
  associations,
  onSent,
}: SendForReviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [manualRows, setManualRows] = useState<ManualRow[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const accountId = useMemo(
    () =>
      associations?.find((a) => a.entityType === "crm_account")?.entityId ??
      null,
    [associations]
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    setMessage("");
    setManualRows([]);

    if (!accountId) {
      setContacts([]);
      setSelectedIds(new Set());
      return;
    }

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/crm/contacts?accountId=${encodeURIComponent(accountId)}`
        );
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json?.success) {
          setContacts([]);
          setSelectedIds(new Set());
          return;
        }
        const list: ContactOption[] = (json.data as CrmContact[])
          .filter((c) => !!c.email)
          .map((c) => ({
            id: c.id,
            name: [c.firstName, c.lastName].filter(Boolean).join(" ").trim(),
            email: c.email!.trim(),
            roleTitle: c.roleTitle ?? null,
            isPrimary: !!c.isPrimary,
          }));
        setContacts(list);
        const primary = list.find((c) => c.isPrimary);
        setSelectedIds(new Set(primary ? [primary.id] : []));
      } catch {
        if (!cancelled) {
          setContacts([]);
          setSelectedIds(new Set());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, accountId]);

  const toggleContact = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addManualRow = () =>
    setManualRows((prev) => [...prev, newManualRow()]);

  const removeManualRow = (id: string) =>
    setManualRows((prev) => prev.filter((r) => r.id !== id));

  const updateManualRow = (id: string, patch: Partial<ManualRow>) =>
    setManualRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );

  const totalRecipients = useMemo(() => {
    const manual = manualRows.filter((r) => EMAIL_RE.test(r.email.trim()));
    return selectedIds.size + manual.length;
  }, [selectedIds, manualRows]);

  const handleSend = async () => {
    setError(null);

    const fromContacts = contacts
      .filter((c) => selectedIds.has(c.id))
      .map((c) => ({ name: c.name || "Estimado(a)", email: c.email }));

    const fromManual: Array<{ name: string; email: string }> = [];
    for (const row of manualRows) {
      const email = row.email.trim();
      if (!email) continue;
      if (!EMAIL_RE.test(email)) {
        setError(`El email "${email}" no es válido`);
        return;
      }
      fromManual.push({
        name: row.name.trim() || "Estimado(a)",
        email,
      });
    }

    // De-dup by email (case-insensitive).
    const seen = new Set<string>();
    const recipients = [...fromContacts, ...fromManual].filter((r) => {
      const key = r.email.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (recipients.length === 0) {
      setError(
        "Selecciona al menos un contacto o agrega un correo manualmente."
      );
      return;
    }

    setSending(true);
    try {
      const res = await fetch(
        `/api/docs/documents/${documentId}/send-review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipients,
            message: message.trim() || null,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || "No se pudo enviar la revisión");
      }
      const sent = data?.data?.results ?? [];
      toast.success(
        sent.length === 1
          ? `Borrador enviado a ${sent[0].email}`
          : `Borrador enviado a ${sent.length} destinatarios`
      );
      onOpenChange(false);
      onSent();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al enviar a revisión"
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Enviar borrador a revisión</DialogTitle>
          <DialogDescription>
            Elige a qué contactos enviar el borrador para que lo revisen y
            propongan cambios antes de la firma. Puedes seleccionar uno o más
            contactos del cliente y/o agregar correos manualmente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Contacts list */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">
              Contactos del cliente
            </Label>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando contactos…
              </div>
            ) : !accountId ? (
              <p className="text-sm text-muted-foreground">
                Este documento no está asociado a una cuenta. Agrega correos
                manualmente abajo.
              </p>
            ) : contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                La cuenta no tiene contactos con email. Agrega uno desde el CRM
                o escribe los correos manualmente abajo.
              </p>
            ) : (
              <ul className="space-y-1.5 max-h-56 overflow-y-auto rounded-md border border-border p-1">
                {contacts.map((c) => {
                  const checked = selectedIds.has(c.id);
                  return (
                    <li key={c.id}>
                      <label
                        className={`flex items-start gap-3 rounded-md p-2 cursor-pointer transition-colors ${
                          checked
                            ? "bg-primary/10"
                            : "hover:bg-muted"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 accent-primary"
                          checked={checked}
                          onChange={() => toggleContact(c.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <UserRound className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium truncate">
                              {c.name || c.email}
                            </span>
                            {c.isPrimary && (
                              <span
                                title="Contacto principal"
                                className="inline-flex items-center gap-0.5 text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500"
                              >
                                <Star className="h-2.5 w-2.5 fill-current" />
                                Principal
                              </span>
                            )}
                            {c.roleTitle && (
                              <span className="text-xs text-muted-foreground truncate">
                                · {c.roleTitle}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {c.email}
                          </div>
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Manual emails */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">
                Correos adicionales
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={addManualRow}
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar
              </Button>
            </div>
            {manualRows.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Opcional: agrega otros correos para enviar el borrador.
              </p>
            ) : (
              <div className="space-y-2">
                {manualRows.map((row) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-12 gap-2 items-center"
                  >
                    <Input
                      className="col-span-5"
                      placeholder="Nombre (opcional)"
                      value={row.name}
                      onChange={(e) =>
                        updateManualRow(row.id, { name: e.target.value })
                      }
                    />
                    <div className="col-span-6 relative">
                      <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                      <Input
                        className="pl-8"
                        type="email"
                        placeholder="correo@ejemplo.cl"
                        value={row.email}
                        onChange={(e) =>
                          updateManualRow(row.id, { email: e.target.value })
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="col-span-1"
                      onClick={() => removeManualRow(row.id)}
                      title="Quitar"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Message */}
          <div className="space-y-1.5">
            <Label htmlFor="reviewMessage" className="text-sm font-semibold">
              Mensaje (opcional)
            </Label>
            <Textarea
              id="reviewMessage"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Agrega un mensaje para el destinatario…"
              className="min-h-[70px]"
            />
          </div>

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => void handleSend()}
            disabled={sending || totalRecipients === 0}
          >
            {sending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                Enviando…
              </>
            ) : (
              <>
                Enviar
                {totalRecipients > 0 ? ` (${totalRecipients})` : ""}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
