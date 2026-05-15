"use client";

/**
 * DteRecipientsPicker — selector controlado TO / CC / BCC con chips y
 * sugerencias de contactos CRM. Extraído desde `SendEmailDialog` para
 * reutilizarse en los formularios de emisión (factura, NC, ND) sin
 * duplicar la lógica de chips, validación de email y fetch de contactos.
 *
 * No maneja adjuntos ni dispara ningún endpoint de envío: es puramente
 * `value`/`onChange`.
 */

import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { normalizeEmailAddress } from "@/lib/email-address";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export type DteRecipientsValue = {
  to: string;
  cc: string[];
  bcc: string[];
};

export interface DteRecipientsPickerProps {
  value: DteRecipientsValue;
  onChange: (next: DteRecipientsValue) => void;
  /** Cuenta CRM para traer contactos asociados como chips sugeridos. */
  crmAccountId?: string | null;
  /** Fallback por RUT del receptor cuando no hay accountId. */
  receiverRut?: string | null;
  /** Sugerencias extra ya resueltas (opcional). */
  suggestedContacts?: { email: string; label?: string }[];
  /** Emails a pre-marcar en CC al montar (ej: contactos de la factura original). */
  defaultCheckedCc?: string[];
  disabled?: boolean;
}

export function DteRecipientsPicker({
  value,
  onChange,
  crmAccountId,
  receiverRut,
  suggestedContacts = [],
  defaultCheckedCc,
  disabled = false,
}: DteRecipientsPickerProps) {
  const [ccInput, setCcInput] = useState("");
  const [bccInput, setBccInput] = useState("");
  const [crmContacts, setCrmContacts] = useState<
    { email: string; label?: string }[]
  >([]);
  // Marca para evitar volver a aplicar `defaultCheckedCc` cuando la
  // referencia cambia por motivos no semánticos (ej: nuevo array vacío
  // cada render del padre).
  const [defaultsApplied, setDefaultsApplied] = useState(false);

  // Pre-marcado de CC: una sola vez por montaje (o cuando llega un
  // defaultCheckedCc no vacío por primera vez).
  useEffect(() => {
    if (defaultsApplied) return;
    if (!defaultCheckedCc || defaultCheckedCc.length === 0) return;
    const normalizedDefaults = defaultCheckedCc
      .map((e) => normalizeEmailAddress(e))
      .filter((e) => EMAIL_RE.test(e));
    const normalizedCc = value.cc.map((e) => normalizeEmailAddress(e));
    const toKey = normalizeEmailAddress(value.to);
    const merged = Array.from(
      new Set([...normalizedCc, ...normalizedDefaults]),
    ).filter((e) => e !== toKey);
    const prevKey = [...value.cc.map((e) => normalizeEmailAddress(e))].sort().join("|");
    const nextKey = [...merged].sort().join("|");
    if (prevKey !== nextKey) {
      onChange({ ...value, cc: merged });
    }
    setDefaultsApplied(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- correr una sola vez
  }, [defaultCheckedCc]);

  // Cargar contactos del CRM asociados a la cuenta. Estrategia:
  // primero por accountId, fallback por RUT — coincide con el patrón
  // del SendEmailDialog para DTEs viejos sin crmAccountId.
  useEffect(() => {
    const param = crmAccountId
      ? `accountId=${crmAccountId}`
      : receiverRut
        ? `rut=${encodeURIComponent(receiverRut)}`
        : null;
    if (!param) {
      setCrmContacts([]);
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/crm/contacts?${param}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j) => {
        if (!j?.success || !Array.isArray(j.data)) return;
        const list: { email: string; label?: string }[] = [];
        for (const c of j.data) {
          const email = normalizeEmailAddress(c.email ?? "");
          if (!email || !EMAIL_RE.test(email)) continue;
          const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
          list.push({ email, label: name ? `${name} <${email}>` : email });
        }
        setCrmContacts(list);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [crmAccountId, receiverRut]);

  const isRecipientValid = useMemo(() => {
    const t = value.to.trim();
    return t === "" || EMAIL_RE.test(normalizeEmailAddress(t));
  }, [value.to]);

  const allSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const out: { email: string; label?: string }[] = [];
    for (const s of [...suggestedContacts, ...crmContacts]) {
      const email = normalizeEmailAddress(s.email);
      if (!email || !EMAIL_RE.test(email)) continue;
      if (seen.has(email)) continue;
      seen.add(email);
      out.push({ email, label: s.label });
    }
    return out;
  }, [suggestedContacts, crmContacts]);

  const ccKeys = new Set(value.cc.map((e) => normalizeEmailAddress(e)));
  const toKey = normalizeEmailAddress(value.to);
  const ccSuggestionsToShow = allSuggestions.filter(
    (s) => !ccKeys.has(s.email) && s.email !== toKey,
  );

  function addChip(
    target: "cc" | "bcc",
    raw: string,
    inputSetter: (s: string) => void,
  ) {
    const trimmed = normalizeEmailAddress(raw.replace(/[,;]+$/, ""));
    if (!trimmed) {
      inputSetter("");
      return;
    }
    if (!EMAIL_RE.test(trimmed)) {
      toast.error(`Email inválido: ${trimmed}`);
      return;
    }
    const list = value[target];
    const listKeys = list.map((e) => normalizeEmailAddress(e));
    if (listKeys.includes(trimmed) || trimmed === normalizeEmailAddress(value.to)) {
      inputSetter("");
      return;
    }
    if (list.length >= 10) {
      toast.error("Máximo 10 emails por campo (CC o BCC).");
      return;
    }
    onChange({ ...value, [target]: [...list, trimmed] });
    inputSetter("");
  }

  function removeChip(target: "cc" | "bcc", email: string) {
    const drop = normalizeEmailAddress(email);
    onChange({
      ...value,
      [target]: value[target].filter(
        (e) => normalizeEmailAddress(e) !== drop,
      ),
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="dte-rcpt-to">Para (TO) *</Label>
        <Input
          id="dte-rcpt-to"
          type="email"
          value={value.to}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
          placeholder="cliente@empresa.cl"
          disabled={disabled}
          className={`h-10 sm:h-9 ${
            !isRecipientValid && value.to.trim()
              ? "border-status-danger-border"
              : ""
          }`}
        />
        {!isRecipientValid && value.to.trim() && (
          <p className="text-[12px] text-status-danger-fg">
            Formato de email inválido.
          </p>
        )}
        {!value.to.trim() && (
          <p className="text-[12px] text-muted-foreground">
            El receptor no tiene email guardado. Ingresá uno acá.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="dte-rcpt-cc">
          CC{" "}
          <span className="text-[12px] text-muted-foreground font-normal">
            (visibles para el receptor)
          </span>
        </Label>
        <ChipList
          list={value.cc}
          onRemove={(e) => removeChip("cc", e)}
          disabled={disabled}
        />
        <div className="flex gap-2">
          <Input
            id="dte-rcpt-cc"
            type="email"
            value={ccInput}
            onChange={(e) => setCcInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addChip("cc", ccInput, setCcInput);
              }
            }}
            placeholder="contador@empresa.cl, gerencia@empresa.cl…"
            disabled={disabled}
            className="h-10 sm:h-9 flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addChip("cc", ccInput, setCcInput)}
            disabled={disabled || !ccInput.trim()}
            className="h-10 sm:h-9 shrink-0"
          >
            <Plus className="h-4 w-4 mr-1" />
            Agregar
          </Button>
        </div>
        {ccSuggestionsToShow.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            <span className="text-[12px] text-muted-foreground self-center">
              Sugerencias del CRM:
            </span>
            {ccSuggestionsToShow.map((s) => (
              <button
                key={s.email}
                type="button"
                onClick={() => {
                  if (!ccKeys.has(s.email)) {
                    onChange({ ...value, cc: [...value.cc, s.email] });
                  }
                }}
                disabled={disabled}
                className="text-[12px] px-2 py-0.5 rounded-md border border-dashed border-ds-border-default hover:bg-status-info-soft hover:border-status-info-border hover:text-status-info-fg transition-colors"
                title={`Agregar ${s.email}`}
              >
                + {s.label ?? s.email}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="dte-rcpt-bcc">
          BCC{" "}
          <span className="text-[12px] text-muted-foreground font-normal">
            (ocultos — el receptor NO los ve)
          </span>
        </Label>
        <ChipList
          list={value.bcc}
          onRemove={(e) => removeChip("bcc", e)}
          variant="bcc"
          disabled={disabled}
        />
        <div className="flex gap-2">
          <Input
            id="dte-rcpt-bcc"
            type="email"
            value={bccInput}
            onChange={(e) => setBccInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addChip("bcc", bccInput, setBccInput);
              }
            }}
            placeholder="contabilidad-interna@miempresa.cl…"
            disabled={disabled}
            className="h-10 sm:h-9 flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addChip("bcc", bccInput, setBccInput)}
            disabled={disabled || !bccInput.trim()}
            className="h-10 sm:h-9 shrink-0"
          >
            <Plus className="h-4 w-4 mr-1" />
            Agregar
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChipList({
  list,
  onRemove,
  variant,
  disabled,
}: {
  list: string[];
  onRemove: (email: string) => void;
  variant?: "bcc";
  disabled?: boolean;
}) {
  if (list.length === 0) return null;
  const baseClass =
    variant === "bcc"
      ? "inline-flex items-center gap-1 text-[12px] px-2 py-1 rounded-md bg-ds-surface-3 text-ds-text-2 border border-ds-border-subtle"
      : "inline-flex items-center gap-1 text-[12px] px-2 py-1 rounded-md bg-status-info-soft text-status-info-fg border border-status-info-border";
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((email) => (
        <span key={email} className={baseClass}>
          {email}
          <button
            type="button"
            onClick={() => onRemove(email)}
            disabled={disabled}
            className="hover:opacity-70 disabled:opacity-40"
            aria-label={`Quitar ${email}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
