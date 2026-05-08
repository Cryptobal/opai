"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getSignerColor } from "@/lib/docs/signature-token-colors";
import { CcContactPicker } from "./CcContactPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SignatureRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  initialRecipients?: Array<{ name: string; email: string; rut?: string }>;
  onCreated: () => void;
}

type RecipientRow = {
  id: string;
  name: string;
  email: string;
  rut: string;
  role: "signer" | "cc";
  signingOrder: number;
};

function getNextSigningOrder(rows: RecipientRow[]): number {
  const signerOrders = rows
    .filter((r) => r.role === "signer")
    .map((r) => r.signingOrder);
  if (signerOrders.length === 0) return 1;
  return Math.max(...signerOrders) + 1;
}

function createRecipient(
  overrides?: Partial<RecipientRow>,
  existingRows?: RecipientRow[],
): RecipientRow {
  const role = overrides?.role ?? "signer";
  const computedOrder =
    role === "cc"
      ? 1 // dummy for CC; backend ignores order on cc, schema needs >=1.
      : existingRows
        ? getNextSigningOrder(existingRows)
        : 1;
  return {
    id: crypto.randomUUID(),
    name: "",
    email: "",
    rut: "",
    role,
    signingOrder: computedOrder,
    ...overrides,
  };
}

export function SignatureRequestModal({
  open,
  onOpenChange,
  documentId,
  initialRecipients,
  onCreated,
}: SignatureRequestModalProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [rows, setRows] = useState<RecipientRow[]>(() =>
    initialRecipients?.length
      ? initialRecipients.map((r, i) =>
          createRecipient({
            name: r.name,
            email: r.email,
            rut: r.rut ?? "",
            role: "signer",
            signingOrder: i + 1,
          })
        )
      : [createRecipient()]
  );
  const [error, setError] = useState<string | null>(null);
  const [tenantRepLegal, setTenantRepLegal] = useState<{
    name: string;
    rut: string;
    email: string;
  } | null>(null);

  // Cargar config liviana del rep legal del tenant para warnings y quick-fill.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`/api/docs/documents/${documentId}/tenant-rep-legal`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.success && d.data) setTenantRepLegal(d.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, documentId]);

  const tenantRepConfigured = !!tenantRepLegal?.name && !!tenantRepLegal?.rut;
  const tenantRepHasEmail = !!tenantRepLegal?.email;
  const showRepEmailBanner = tenantRepConfigured && !tenantRepHasEmail;

  // Actualizar filas cuando cambian initialRecipients (ej. al abrir con otro guardia)
  useEffect(() => {
    if (open && initialRecipients?.length) {
      setRows(
        initialRecipients.map((r, i) =>
          createRecipient({
            name: r.name,
            email: r.email,
            rut: r.rut ?? "",
            role: "signer",
            signingOrder: i + 1,
          })
        )
      );
    }
  }, [open, initialRecipients]);

  // Auto-load suggested signers (empresa rep + client reps) from the backend
  // when the modal opens without explicit initialRecipients. The endpoint reads
  // the document's signature.signer_N tokens and matches them with:
  //   - signer_1 ← Settings empresa.repLegal*
  //   - signer_N≥2 ← AccountRepresentanteLegal
  useEffect(() => {
    if (!open) return;
    if (initialRecipients && initialRecipients.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/docs/documents/${documentId}/suggested-signers`
        );
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        const data = json?.data as
          | Array<{ name: string; rut: string; email: string; signingOrder: number }>
          | undefined;
        if (!data || data.length === 0) return;
        setRows(
          data.map((r) =>
            createRecipient({
              name: r.name ?? "",
              email: r.email ?? "",
              rut: r.rut ?? "",
              role: "signer",
              signingOrder: r.signingOrder ?? 1,
            })
          )
        );
      } catch {
        // Non-blocking: modal stays usable with empty rows.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, documentId, initialRecipients]);

  const signerCount = useMemo(() => rows.filter((r) => r.role === "signer").length, [rows]);

  const addRow = () => {
    setRows((prev) => [...prev, createRecipient(undefined, prev)]);
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRow = (id: string, patch: Partial<RecipientRow>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const merged = { ...r, ...patch };
        // When role changes, recalculate signingOrder so signers stay
        // sequential and CCs don't pollute the order.
        if (patch.role && patch.role !== r.role) {
          if (patch.role === "cc") {
            merged.signingOrder = 1;
          } else if (patch.role === "signer") {
            const others = prev.filter((row) => row.id !== id);
            merged.signingOrder = getNextSigningOrder(others);
          }
        }
        return merged;
      }),
    );
  };

  const handleCreate = async () => {
    setError(null);
    if (rows.length === 0) {
      setError("Debes agregar al menos un destinatario");
      return;
    }
    if (signerCount === 0) {
      setError("Debes tener al menos un firmante");
      return;
    }
    const invalid = rows.find((r) => !r.name.trim() || !r.email.trim());
    if (invalid) {
      setError("Todos los destinatarios deben tener nombre y email");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/docs/documents/${documentId}/signature-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim() || null,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          recipients: rows.map((r) => ({
            name: r.name.trim(),
            email: r.email.trim(),
            rut: r.rut.trim() || null,
            role: r.role,
            // Backend orders signers only; CC's order is irrelevant.
            // Send 1 as a no-op to satisfy the zod schema's min=1.
            signingOrder: r.role === "signer" ? r.signingOrder : 1,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "No fue posible crear la solicitud");
        return;
      }
      toast.success("Documento enviado a firma");
      onCreated();
      onOpenChange(false);
      setRows([createRecipient()]);
      setMessage("");
      setExpiresAt("");
    } catch {
      setError("No fue posible crear la solicitud");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Enviar documento a firma</DialogTitle>
          <DialogDescription>
            Configura los firmantes y el orden de firma. En el documento, usa <strong>Insertar token → Firma</strong> e inserta «Firma del firmante 1» donde vaya la firma del primero, «Firma del firmante 2» del segundo, etc.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {showRepEmailBanner && (
            <div className="rounded-md border border-status-warn-border bg-status-warn-soft p-3 text-sm text-status-warn-fg space-y-1">
              <p>
                <strong>Falta el email del representante legal de tu empresa.</strong>{" "}
                Configúralo en{" "}
                <a
                  href="/opai/configuracion/empresa"
                  className="underline font-medium"
                >
                  Configuración → Empresa
                </a>{" "}
                para que se autocomplete en futuras firmas.
              </p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sigExpiresAt">Fecha límite</Label>
              <Input
                id="sigExpiresAt"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sigMessage">Mensaje (opcional)</Label>
              <Input
                id="sigMessage"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Indicaciones para los firmantes"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Destinatarios</h4>
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addRow}>
                <Plus className="h-3.5 w-3.5" />
                Agregar
              </Button>
            </div>

            <div className="space-y-2">
              {rows.map((row) => {
                const signerColor = row.role === "signer" ? getSignerColor(row.signingOrder) : null;
                return (
                <div key={row.id} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-12 items-center">
                  <div className="flex items-center gap-2 sm:col-span-3">
                    {signerColor ? (
                      <div
                        className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-semibold border-2"
                        style={{
                          background: signerColor.bg,
                          borderColor: signerColor.border,
                          color: signerColor.text,
                        }}
                        title={`Firma del firmante ${row.signingOrder} — mismo color que el token en el documento`}
                      >
                        {row.signingOrder}
                      </div>
                    ) : null}
                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      <Input
                        className="min-w-0"
                        placeholder="Nombre"
                        value={row.name}
                        onChange={(e) => updateRow(row.id, { name: e.target.value })}
                      />
                      {row.role === "signer" &&
                        row.signingOrder === 1 &&
                        tenantRepLegal?.name &&
                        (!row.name || !row.email) && (
                          <button
                            type="button"
                            className="text-[12px] text-primary hover:underline self-start"
                            onClick={() =>
                              updateRow(row.id, {
                                name: tenantRepLegal.name,
                                rut: tenantRepLegal.rut,
                                email: tenantRepLegal.email,
                              })
                            }
                          >
                            Usar rep. legal de mi empresa ({tenantRepLegal.name})
                          </button>
                        )}
                    </div>
                    {row.role === "cc" && (
                      <CcContactPicker
                        documentId={documentId}
                        onSelect={(c) =>
                          updateRow(row.id, { name: c.name, email: c.email })
                        }
                      />
                    )}
                  </div>
                  <Input
                    className="sm:col-span-3"
                    placeholder="Email"
                    value={row.email}
                    onChange={(e) => updateRow(row.id, { email: e.target.value })}
                  />
                  <Input
                    className="sm:col-span-2"
                    placeholder="RUT"
                    value={row.rut}
                    onChange={(e) => updateRow(row.id, { rut: e.target.value })}
                  />
                  <select
                    className="sm:col-span-2 rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={row.role}
                    onChange={(e) => updateRow(row.id, { role: e.target.value as "signer" | "cc" })}
                  >
                    <option value="signer">Firmante</option>
                    <option value="cc">Copia</option>
                  </select>
                  {row.role === "signer" ? (
                    <div className="sm:col-span-1 space-y-1">
                      <Label className="text-xs text-muted-foreground">Orden</Label>
                      <Input
                        type="number"
                        min={1}
                        value={row.signingOrder}
                        onChange={(e) =>
                          updateRow(row.id, {
                            signingOrder: Math.max(1, Number(e.target.value || 1)),
                          })
                        }
                      />
                    </div>
                  ) : (
                    <div className="sm:col-span-1" aria-hidden="true" />
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="sm:col-span-1"
                    onClick={() => removeRow(row.id)}
                    disabled={rows.length === 1}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                );
              })}
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={() => void handleCreate()} disabled={loading}>
            {loading ? "Enviando..." : "Enviar a firma"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
