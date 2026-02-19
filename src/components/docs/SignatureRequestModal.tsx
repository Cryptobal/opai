"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getSignerColor } from "@/lib/docs/signature-token-colors";
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

function createRecipient(overrides?: Partial<RecipientRow>): RecipientRow {
  return {
    id: crypto.randomUUID(),
    name: "",
    email: "",
    rut: "",
    role: "signer",
    signingOrder: 1,
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

  const signerCount = useMemo(() => rows.filter((r) => r.role === "signer").length, [rows]);

  const addRow = () => {
    const maxOrder = rows.reduce((acc, r) => Math.max(acc, r.signingOrder), 1);
    setRows((prev) => [...prev, createRecipient({ signingOrder: maxOrder })]);
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRow = (id: string, patch: Partial<RecipientRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
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
            signingOrder: r.signingOrder,
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
                    <Input
                      className="min-w-0 flex-1"
                      placeholder="Nombre"
                      value={row.name}
                      onChange={(e) => updateRow(row.id, { name: e.target.value })}
                    />
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
                  <div className="sm:col-span-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">Orden</Label>
                    <Input
                      type="number"
                      min={1}
                      value={row.signingOrder}
                      onChange={(e) => updateRow(row.id, { signingOrder: Math.max(1, Number(e.target.value || 1)) })}
                    />
                  </div>
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
