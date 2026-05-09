"use client";

/**
 * AccountBillingDocSection
 *
 * Sección colapsable "Documento de Cobro" en el detail de un CrmAccount.
 * Permite configurar 3 campos por cliente:
 *   - Número de Orden / Contrato (ej. "P05048" para Estado de Pago Gard).
 *   - Contacto receptor del documento de cobro (CrmContact de la cuenta).
 *   - Layout preferido: DTE_PREVIEW | PROFORMA | ESTADO_DE_PAGO.
 *
 * Persiste con PATCH /api/crm/accounts/[id].
 */

import { useState } from "react";
import { ChevronDown, Loader2, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export type BillingDocLayout = "DTE_PREVIEW" | "PROFORMA" | "ESTADO_DE_PAGO";

interface ContactOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  roleTitle: string | null;
}

interface Props {
  accountId: string;
  initialNumeroOrdenContrato: string | null;
  initialContactoEstadoPagoId: string | null;
  initialLayoutDocumentoCobro: BillingDocLayout;
  contacts: ContactOption[];
  onSaved?: (next: {
    numeroOrdenContrato: string | null;
    contactoEstadoPagoId: string | null;
    layoutDocumentoCobro: BillingDocLayout;
  }) => void;
}

export function AccountBillingDocSection({
  accountId,
  initialNumeroOrdenContrato,
  initialContactoEstadoPagoId,
  initialLayoutDocumentoCobro,
  contacts,
  onSaved,
}: Props) {
  const [numeroOrden, setNumeroOrden] = useState(
    initialNumeroOrdenContrato ?? "",
  );
  const [contactoId, setContactoId] = useState<string | null>(
    initialContactoEstadoPagoId,
  );
  const [layout, setLayout] = useState<BillingDocLayout>(
    initialLayoutDocumentoCobro,
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const body = {
        numeroOrdenContrato: numeroOrden.trim() || null,
        contactoEstadoPagoId: contactoId,
        layoutDocumentoCobro: layout,
      };
      const res = await fetch(`/api/crm/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "No se pudo guardar");
      }
      toast.success("Configuración de documento de cobro guardada");
      onSaved?.(body);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="group rounded-xl border border-border bg-card">
      <summary className="flex cursor-pointer list-none select-none items-center justify-between px-4 py-3 transition-colors hover:bg-muted/20">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Documento de cobro
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>

      <div className="space-y-4 px-4 pb-4 pt-1">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="numeroOrden">N° Orden / Contrato</Label>
            <Input
              id="numeroOrden"
              className="h-10 sm:h-9"
              value={numeroOrden}
              onChange={(e) => setNumeroOrden(e.target.value)}
              placeholder="P05048"
              maxLength={60}
            />
            <p className="text-[10px] text-muted-foreground/80">
              Texto libre que aparece en el Estado de Pago.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contactoEP">Contacto receptor</Label>
            <Select
              value={contactoId ?? "__none__"}
              onValueChange={(v) =>
                setContactoId(v === "__none__" ? null : v)
              }
            >
              <SelectTrigger id="contactoEP" className="h-10 sm:h-9">
                <SelectValue placeholder="(Auto-detectar)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  Auto: primer contacto activo
                </SelectItem>
                {contacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.firstName} {c.lastName}
                    {c.email ? ` · ${c.email}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="layoutDocCobro">Layout preferido</Label>
            <Select
              value={layout}
              onValueChange={(v) => setLayout(v as BillingDocLayout)}
            >
              <SelectTrigger id="layoutDocCobro" className="h-10 sm:h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DTE_PREVIEW">
                  DTE Preview (estándar SII)
                </SelectItem>
                <SelectItem value="PROFORMA">
                  Proforma (formato factura, sin folio)
                </SelectItem>
                <SelectItem value="ESTADO_DE_PAGO">
                  Estado de Pago (formato servicios)
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground/80">
              Define qué layout PDF se sugiere por defecto al enviar
              documento de cobro a este cliente.
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            Guardar
          </Button>
        </div>
      </div>
    </details>
  );
}
