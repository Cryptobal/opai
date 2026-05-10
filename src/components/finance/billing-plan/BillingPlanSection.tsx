"use client";

/**
 * BillingPlanSection — sección "Documento de Cobro" en el DteForm.
 *
 * Permite al usuario configurar EN el borrador qué documentos de cobro
 * se deben enviar al cliente ANTES de emitir al SII:
 *  - Proforma a contactos del cliente
 *  - Estado de Pago a contactos del cliente (que también firman el PDF)
 *
 * Los datos quedan persistidos en el FinanceDte (campos del plan). Cuando
 * el usuario abre la lista de borradores, ve qué tiene pendiente. Al
 * mandar el documento, el servicio sendBillingDocument lee los recipientes
 * desde acá (no se piden ad-hoc en el modal de envío).
 */

import { useEffect, useState } from "react";
import { Loader2, FileText, FileSignature } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

interface ContactOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  roleTitle: string | null;
}

export interface BillingPlanValue {
  requireProforma: boolean;
  proformaRecipientContactIds: string[];
  requireEstadoPago: boolean;
  estadoPagoRecipientContactIds: string[];
}

interface Props {
  /** ID del CrmAccount para cargar contactos. Si null, sección queda inactiva. */
  accountId: string | null;
  value: BillingPlanValue;
  onChange: (next: BillingPlanValue) => void;
  /** Para el caller: indica si el draft ya está guardado (puede mandar). */
  isDraftSaved?: boolean;
}

export function BillingPlanSection({
  accountId,
  value,
  onChange,
}: Props) {
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!accountId) {
      setContacts([]);
      return;
    }
    setLoading(true);
    fetch(`/api/crm/contacts?accountId=${accountId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success && Array.isArray(j.data)) {
          setContacts(
            j.data.map((c: Record<string, unknown>) => ({
              id: String(c.id),
              firstName: String(c.firstName ?? ""),
              lastName: String(c.lastName ?? ""),
              email: (c.email as string | null) ?? null,
              roleTitle: (c.roleTitle as string | null) ?? null,
            })),
          );
        }
      })
      .catch(() => setContacts([]))
      .finally(() => setLoading(false));
  }, [accountId]);

  function toggleProformaContact(id: string) {
    const set = new Set(value.proformaRecipientContactIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange({ ...value, proformaRecipientContactIds: Array.from(set) });
  }

  function toggleEstadoPagoContact(id: string) {
    const set = new Set(value.estadoPagoRecipientContactIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange({ ...value, estadoPagoRecipientContactIds: Array.from(set) });
  }

  const noAccount = !accountId;

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold">Documento de Cobro</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configurá si este DTE requiere mandar Proforma o Estado de Pago al
          cliente <strong>antes de emitir al SII</strong>.
        </p>
      </div>

      {noAccount && (
        <div className="px-4 py-4 text-xs text-muted-foreground italic">
          Seleccioná primero el cliente CRM (arriba) para configurar el plan
          de cobro.
        </div>
      )}

      {!noAccount && (
        <div className="divide-y divide-border">
          {/* ── Proforma ── */}
          <div className="px-4 py-3 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium">Enviar Proforma</div>
                  <div className="text-xs text-muted-foreground">
                    Documento referencial sin valor tributario. Útil para
                    pre-aprobación con el cliente antes de generar la
                    factura electrónica.
                  </div>
                </div>
              </div>
              <Switch
                checked={value.requireProforma}
                onCheckedChange={(v) =>
                  onChange({ ...value, requireProforma: v })
                }
              />
            </div>

            {value.requireProforma && (
              <div className="pl-6 space-y-1.5">
                <Label className="text-xs">
                  Destinatarios (contactos del cliente)
                </Label>
                {loading ? (
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" /> Cargando contactos…
                  </div>
                ) : contacts.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    Este cliente no tiene contactos cargados en el CRM.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {contacts.map((c) => (
                      <label
                        key={c.id}
                        className="flex items-center gap-2 text-sm cursor-pointer py-1"
                      >
                        <Checkbox
                          checked={value.proformaRecipientContactIds.includes(c.id)}
                          onCheckedChange={() => toggleProformaContact(c.id)}
                        />
                        <span>
                          {c.firstName} {c.lastName}
                        </span>
                        {c.email && (
                          <span className="text-xs text-muted-foreground truncate">
                            · {c.email}
                          </span>
                        )}
                        {c.roleTitle && (
                          <span className="text-xs text-muted-foreground">
                            · {c.roleTitle}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Estado de Pago ── */}
          <div className="px-4 py-3 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <FileSignature className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium">Enviar Estado de Pago</div>
                  <div className="text-xs text-muted-foreground">
                    Formato chileno estándar de servicios con columnas
                    operativas y firmas. Los contactos seleccionados aparecen
                    como firmantes-cliente en el PDF.
                  </div>
                </div>
              </div>
              <Switch
                checked={value.requireEstadoPago}
                onCheckedChange={(v) =>
                  onChange({ ...value, requireEstadoPago: v })
                }
              />
            </div>

            {value.requireEstadoPago && (
              <div className="pl-6 space-y-1.5">
                <Label className="text-xs">
                  Destinatarios y firmantes (contactos del cliente)
                </Label>
                {loading ? (
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" /> Cargando contactos…
                  </div>
                ) : contacts.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    Este cliente no tiene contactos cargados en el CRM.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {contacts.map((c) => (
                      <label
                        key={c.id}
                        className="flex items-center gap-2 text-sm cursor-pointer py-1"
                      >
                        <Checkbox
                          checked={value.estadoPagoRecipientContactIds.includes(c.id)}
                          onCheckedChange={() => toggleEstadoPagoContact(c.id)}
                        />
                        <span>
                          {c.firstName} {c.lastName}
                        </span>
                        {c.email && (
                          <span className="text-xs text-muted-foreground truncate">
                            · {c.email}
                          </span>
                        )}
                        {c.roleTitle && (
                          <span className="text-xs text-muted-foreground">
                            · {c.roleTitle}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground/80 mt-1">
                  Los seleccionados aparecen abajo del Estado de Pago en el
                  bloque "Por el cliente — Recibido conforme".
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
