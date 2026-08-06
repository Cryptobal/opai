"use client";

import { useState } from "react";
import { Surface } from "@/components/opai-ds";
import { Switch } from "@/components/ui/switch";
import { patchCrmField } from "@/components/crm/patchCrmField";
import { toast } from "sonner";

type RecibeKey =
  | "recibeCesion"
  | "recibeFacturacion"
  | "recibeNotasCredito"
  | "recibeCobranza"
  | "recibeOperacional";

const ROWS: Array<{ key: RecibeKey; label: string; description: string }> = [
  {
    key: "recibeFacturacion",
    label: "Facturación",
    description: "Copia del DTE emitido y su XML",
  },
  {
    key: "recibeNotasCredito",
    label: "Notas de crédito",
    description: "Aviso al emitir una NC contra este cliente",
  },
  {
    key: "recibeCobranza",
    label: "Cobranza",
    description: "Recordatorios de pago por email y WhatsApp",
  },
  {
    key: "recibeOperacional",
    label: "Operacional",
    description: "Novedades de turno, incidencias, rondas",
  },
  {
    key: "recibeCesion",
    label: "Cesión a factoring",
    description: "Aviso al deudor cuando se cede un DTE",
  },
];

export function ContactNotificationMatrix({
  contactId,
  values,
  canEdit,
  onChange,
}: {
  contactId: string;
  values: Record<RecibeKey, boolean>;
  canEdit: boolean;
  onChange: (key: RecibeKey, value: boolean) => void;
}) {
  const [savingKey, setSavingKey] = useState<RecibeKey | null>(null);

  const toggle = async (key: RecibeKey, next: boolean) => {
    if (!canEdit || savingKey) return;
    const prev = values[key];
    onChange(key, next);
    setSavingKey(key);
    try {
      await patchCrmField({
        url: `/api/crm/contacts/${contactId}`,
        key,
        value: next,
      });
    } catch (error) {
      onChange(key, prev);
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <Surface elevation={1} padding="md" className="space-y-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-ds-text-3">
          Notificaciones por correo
        </p>
        <p className="mt-0.5 text-[13px] text-ds-text-2">
          Define qué comunicaciones recibe este contacto.
        </p>
      </div>
      <ul className="space-y-2">
        {ROWS.map((row) => (
          <li
            key={row.key}
            className="flex items-start justify-between gap-3 rounded-lg border border-ds-border-subtle bg-ds-surface-1 px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ds-text-1">{row.label}</p>
              <p className="text-[12px] text-ds-text-3">{row.description}</p>
            </div>
            <Switch
              checked={values[row.key]}
              disabled={!canEdit || savingKey === row.key}
              onCheckedChange={(checked) => void toggle(row.key, checked)}
              aria-label={row.label}
              className="mt-0.5 shrink-0"
            />
          </li>
        ))}
      </ul>
    </Surface>
  );
}
