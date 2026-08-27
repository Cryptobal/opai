"use client";

/**
 * ResendXmlDialog — reenvía el XML de un DTE ya emitido a la casilla
 * del facturador electrónico y, si el usuario elige más contactos,
 * el XML + la factura (PDF) a esos otros.
 *
 * No re-emite ni genera nota de crédito: usa el XML ya aceptado por el SII.
 */

import { useEffect, useMemo, useState } from "react";
import { FileCode, Loader2, Mail, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tag } from "@/components/opai-ds";
import { toast } from "sonner";
import { normalizeEmailAddress } from "@/lib/email-address";
import {
  buildDteResendContactOptions,
  defaultDteResendSelection,
  isDteReceptionEmail,
  partitionDteResendRecipients,
  type DteResendContactOption,
} from "@/modules/finance/billing/dte-recipient-guard";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

type CrmContactRow = {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  recibeFacturacion?: boolean | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dteId: string;
  folio: number;
  dteType: number;
  crmAccountId?: string | null;
  receiverRut?: string | null;
  storedEmails?: string[];
  onSent?: () => void;
}

function roleTag(role: DteResendContactOption["role"]) {
  if (role === "xml_mailbox") {
    return (
      <Tag variant="brand" size="md">
        Casilla XML
      </Tag>
    );
  }
  if (role === "billing") {
    return (
      <Tag variant="info" size="md">
        Facturación
      </Tag>
    );
  }
  return null;
}

export function ResendXmlDialog({
  open,
  onOpenChange,
  dteId,
  folio,
  dteType,
  crmAccountId,
  receiverRut,
  storedEmails = [],
  onSent,
}: Props) {
  const [options, setOptions] = useState<DteResendContactOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [extraEmail, setExtraEmail] = useState("");

  const storedKey = storedEmails.join("|");

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    setLoading(true);
    setExtraEmail("");

    const param = crmAccountId
      ? `accountId=${crmAccountId}`
      : receiverRut
        ? `rut=${encodeURIComponent(receiverRut)}`
        : null;

    const apply = (contacts: CrmContactRow[]) => {
      const next = buildDteResendContactOptions({
        contacts,
        storedEmails,
      });
      setOptions(next);
      setSelected(new Set(defaultDteResendSelection(next)));
    };

    if (!param) {
      apply([]);
      setLoading(false);
      return () => ctrl.abort();
    }

    fetch(`/api/crm/contacts?${param}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j) => {
        apply(j?.success && Array.isArray(j.data) ? j.data : []);
      })
      .catch(() => apply([]))
      .finally(() => setLoading(false));

    return () => ctrl.abort();
    // storedKey evita re-fetch por nueva referencia del array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, crmAccountId, receiverRut, dteId, storedKey]);

  const selectedEmails = useMemo(
    () => options.filter((o) => selected.has(o.email)).map((o) => o.email),
    [options, selected],
  );
  const plan = useMemo(
    () => partitionDteResendRecipients(selectedEmails),
    [selectedEmails],
  );

  function toggle(email: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  function addExtra() {
    const email = normalizeEmailAddress(extraEmail.replace(/[,;]+$/, ""));
    if (!email) return;
    if (!EMAIL_RE.test(email)) {
      toast.error(`Email inválido: ${email}`);
      return;
    }
    setOptions((prev) => {
      if (prev.some((o) => o.email === email)) return prev;
      const role = isDteReceptionEmail(email) ? "xml_mailbox" : "other";
      return [...prev, { email, label: email, role }];
    });
    setSelected((prev) => new Set(prev).add(email));
    setExtraEmail("");
  }

  async function handleSend() {
    if (selectedEmails.length === 0) {
      toast.error("Selecciona al menos un contacto.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(
        `/api/finance/billing/issued/${dteId}/resend-xml`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emails: selectedEmails }),
        },
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Error al reenviar XML");
      }
      const xmlCount = json.data?.xmlMailbox?.emails?.length ?? 0;
      const otherCount = json.data?.others?.emails?.length ?? 0;
      if (xmlCount > 0 && otherCount > 0) {
        toast.success(
          `XML enviado a la casilla y XML + factura a ${otherCount} contacto(s).`,
        );
      } else if (xmlCount > 0) {
        toast.success("XML enviado a la casilla de recepción DTE.");
      } else {
        toast.success("XML y factura enviados.");
      }
      onOpenChange(false);
      onSent?.();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCode className="h-5 w-5 text-primary" />
            Reenviar XML
          </DialogTitle>
          <DialogDescription>
            DTE tipo {dteType} folio {folio}. La factura no se re-emite: se
            reenvía el XML ya emitido. La casilla del facturador electrónico
            recibe solo el XML; si marcas más contactos, ellos reciben XML y
            factura (PDF).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {loading ? (
            <p className="flex items-center gap-2 text-[13px] text-ds-text-3">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando contactos…
            </p>
          ) : options.length === 0 ? (
            <p className="text-[13px] text-ds-text-3">
              No hay contactos en la cuenta. Agrega el email de la casilla XML
              abajo.
            </p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-ds-border-subtle p-2">
              {options.map((o) => {
                const checked = selected.has(o.email);
                const adjunto =
                  o.role === "xml_mailbox" ? "Solo XML" : "XML + factura";
                return (
                  <li key={o.email}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-ds-surface-2">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggle(o.email)}
                        disabled={sending}
                        className="h-5 w-5"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[13px] text-ds-text-1">
                            {o.label}
                          </span>
                          {roleTag(o.role)}
                        </span>
                        <span className="block truncate text-[12px] text-ds-text-3">
                          {o.email === o.label ? adjunto : `${o.email} · ${adjunto}`}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex gap-2">
            <Input
              type="email"
              value={extraEmail}
              onChange={(e) => setExtraEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addExtra();
                }
              }}
              placeholder="Agregar otro email…"
              disabled={sending}
              className="h-10 sm:h-9 flex-1"
            />
            <Button
              type="button"
              variant="outline"
              onClick={addExtra}
              disabled={sending || !extraEmail.trim()}
              className="h-10 sm:h-9 shrink-0"
            >
              <Plus className="h-4 w-4 mr-1" />
              Agregar
            </Button>
          </div>

          {selectedEmails.length > 0 && (
            <p className="text-[12px] text-ds-text-3">
              {plan.xmlMailbox.length > 0 && (
                <>
                  Casilla XML ({plan.xmlMailbox.length}): solo XML.
                  {plan.others.length > 0 ? " " : ""}
                </>
              )}
              {plan.others.length > 0 && (
                <>
                  Otros ({plan.others.length}): XML + factura.
                </>
              )}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || selectedEmails.length === 0}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Mail className="h-4 w-4 mr-1.5" />
            )}
            Reenviar XML
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
