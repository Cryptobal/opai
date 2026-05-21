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
import { Loader2, FileText, FileSignature, UserPlus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

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

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newContact, setNewContact] = useState({
    firstName: "",
    lastName: "",
    email: "",
  });

  async function handleCreateContact() {
    if (!accountId) return;
    if (!newContact.firstName.trim() || !newContact.email.trim()) {
      toast.error("Nombre y email son obligatorios");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          firstName: newContact.firstName.trim(),
          lastName: newContact.lastName.trim(),
          email: newContact.email.trim(),
        }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error ?? "No se pudo crear el contacto");
        return;
      }
      const created = data.data;
      const createdId = String(created.id);
      setContacts((prev) =>
        prev.some((c) => c.id === createdId)
          ? prev
          : [
              ...prev,
              {
                id: createdId,
                firstName: String(created.firstName ?? ""),
                lastName: String(created.lastName ?? ""),
                email: (created.email as string | null) ?? null,
                roleTitle: (created.roleTitle as string | null) ?? null,
              },
            ],
      );
      // Auto-marcar como destinatario en variantes activas.
      const nextProforma = value.proformaRecipientContactIds.includes(createdId)
        ? value.proformaRecipientContactIds
        : [...value.proformaRecipientContactIds, createdId];
      const nextEp = value.estadoPagoRecipientContactIds.includes(createdId)
        ? value.estadoPagoRecipientContactIds
        : [...value.estadoPagoRecipientContactIds, createdId];
      onChange({
        ...value,
        proformaRecipientContactIds: value.requireProforma
          ? nextProforma
          : value.proformaRecipientContactIds,
        estadoPagoRecipientContactIds: value.requireEstadoPago
          ? nextEp
          : value.estadoPagoRecipientContactIds,
      });
      setCreateOpen(false);
      setNewContact({ firstName: "", lastName: "", email: "" });
      toast.success("Contacto creado y marcado como destinatario");
    } catch {
      toast.error("Error de red al crear el contacto");
    } finally {
      setCreating(false);
    }
  }

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
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs text-muted-foreground italic flex-1 min-w-0">
                      Este cliente no tiene contactos cargados en el CRM.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setCreateOpen(true)}
                    >
                      <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                      Agregar contacto
                    </Button>
                  </div>
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
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7 px-2 mt-1"
                      onClick={() => setCreateOpen(true)}
                    >
                      <UserPlus className="h-3 w-3 mr-1" />
                      Agregar otro contacto
                    </Button>
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs text-muted-foreground italic flex-1 min-w-0">
                      Este cliente no tiene contactos cargados en el CRM.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setCreateOpen(true)}
                    >
                      <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                      Agregar contacto
                    </Button>
                  </div>
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
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7 px-2 mt-1"
                      onClick={() => setCreateOpen(true)}
                    >
                      <UserPlus className="h-3 w-3 mr-1" />
                      Agregar otro contacto
                    </Button>
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar contacto al cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="bp-fn" className="text-xs">Nombre *</Label>
                <Input
                  id="bp-fn"
                  value={newContact.firstName}
                  onChange={(e) => setNewContact({ ...newContact, firstName: e.target.value })}
                  disabled={creating}
                />
              </div>
              <div>
                <Label htmlFor="bp-ln" className="text-xs">Apellido</Label>
                <Input
                  id="bp-ln"
                  value={newContact.lastName}
                  onChange={(e) => setNewContact({ ...newContact, lastName: e.target.value })}
                  disabled={creating}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="bp-em" className="text-xs">Email *</Label>
              <Input
                id="bp-em"
                type="email"
                value={newContact.email}
                onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                disabled={creating}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancelar
            </Button>
            <Button onClick={handleCreateContact} disabled={creating}>
              {creating ? "Creando..." : "Crear y agregar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
