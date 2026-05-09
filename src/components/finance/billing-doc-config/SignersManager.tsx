"use client";

/**
 * SignersManager — CRUD inline de TenantBillingSigner.
 *
 * Tabla de firmantes (orden, nombre, cargo, firma, estado) + modal para
 * crear/editar + upload de imagen PNG/JPG en R2.
 * Máx. 3 firmantes activos por tenant (validado en server).
 */

import { useEffect, useRef, useState } from "react";
import {
  Loader2,
  Plus,
  Trash2,
  Upload,
  ChevronUp,
  ChevronDown as ChevronDownIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

interface Signer {
  id: string;
  name: string;
  role: string;
  signatureStorageKey: string | null;
  displayOrder: number;
  isActive: boolean;
}

const R2_PUBLIC_BASE = process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.replace(
  /\/$/,
  "",
);

function signatureUrl(key: string | null): string | null {
  if (!key) return null;
  if (R2_PUBLIC_BASE) return `${R2_PUBLIC_BASE}/${key}`;
  return null;
}

export function SignersManager() {
  const [signers, setSigners] = useState<Signer[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Signer | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    role: "",
    displayOrder: 1,
    isActive: true,
  });
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingUploadFor, setPendingUploadFor] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/finance/billing/signers");
      const json = await res.json();
      if (json.success) setSigners(json.data);
    } catch {
      toast.error("Error cargando firmantes");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditing(null);
    setDraft({ name: "", role: "", displayOrder: signers.length + 1, isActive: true });
    setCreating(true);
  }

  function openEdit(s: Signer) {
    setEditing(s);
    setDraft({
      name: s.name,
      role: s.role,
      displayOrder: s.displayOrder,
      isActive: s.isActive,
    });
    setCreating(true);
  }

  async function saveDraft() {
    if (!draft.name.trim() || !draft.role.trim()) {
      toast.error("Nombre y cargo son requeridos");
      return;
    }
    setSaving(true);
    try {
      const url = editing
        ? `/api/finance/billing/signers/${editing.id}`
        : "/api/finance/billing/signers";
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (!res.ok || !json.success)
        throw new Error(json.error ?? "Error guardando");
      toast.success(editing ? "Firmante actualizado" : "Firmante creado");
      setCreating(false);
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(s: Signer) {
    try {
      const res = await fetch(`/api/finance/billing/signers/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !s.isActive }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function moveOrder(s: Signer, dir: -1 | 1) {
    const newOrder = Math.max(0, s.displayOrder + dir);
    try {
      await fetch(`/api/finance/billing/signers/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayOrder: newOrder }),
      });
      load();
    } catch {
      toast.error("Error reordenando");
    }
  }

  async function deleteSigner(s: Signer) {
    if (!confirm(`¿Desactivar firmante "${s.name}"? Quedará archivado.`))
      return;
    try {
      const res = await fetch(`/api/finance/billing/signers/${s.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Firmante archivado");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function triggerUpload(signerId: string) {
    setPendingUploadFor(signerId);
    fileInputRef.current?.click();
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const signerId = pendingUploadFor;
    if (!file || !signerId) return;
    setUploadingId(signerId);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(
        `/api/finance/billing/signers/${signerId}/upload-signature`,
        { method: "POST", body: fd },
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Firma subida");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploadingId(null);
      setPendingUploadFor(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Firmantes</h3>
            <p className="text-xs text-muted-foreground">
              Hasta 3 firmantes activos. Aparecen al pie del Estado de Pago.
            </p>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Agregar firmante
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={onFileChange}
        />

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : signers.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
            Sin firmantes configurados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="px-2 py-2 font-medium">Orden</th>
                  <th className="px-2 py-2 font-medium">Nombre</th>
                  <th className="px-2 py-2 font-medium">Cargo</th>
                  <th className="px-2 py-2 font-medium">Firma</th>
                  <th className="px-2 py-2 font-medium">Activo</th>
                  <th className="px-2 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {signers.map((s) => {
                  const url = signatureUrl(s.signatureStorageKey);
                  return (
                    <tr
                      key={s.id}
                      className="border-b border-border/40 last:border-0"
                    >
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs">{s.displayOrder}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => moveOrder(s, -1)}
                          >
                            <ChevronUp className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => moveOrder(s, 1)}
                          >
                            <ChevronDownIcon className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                      <td
                        className="px-2 py-2 cursor-pointer"
                        onClick={() => openEdit(s)}
                      >
                        {s.name}
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">{s.role}</td>
                      <td className="px-2 py-2">
                        {url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={url}
                            alt="firma"
                            className="h-8 max-w-[120px] object-contain"
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            (sin firma)
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => triggerUpload(s.id)}
                          disabled={uploadingId === s.id}
                          className="ml-2 h-7 px-2 text-xs"
                        >
                          {uploadingId === s.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              <Upload className="mr-1 h-3 w-3" />
                              {url ? "Cambiar" : "Subir"}
                            </>
                          )}
                        </Button>
                      </td>
                      <td className="px-2 py-2">
                        <Switch
                          checked={s.isActive}
                          onCheckedChange={() => toggleActive(s)}
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => deleteSigner(s)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editing ? "Editar firmante" : "Nuevo firmante"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nombre completo</Label>
                <Input
                  value={draft.name}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, name: e.target.value }))
                  }
                  placeholder="Jorge Montenegro"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Cargo</Label>
                <Input
                  value={draft.role}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, role: e.target.value }))
                  }
                  placeholder="Director de Operaciones"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Orden</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={draft.displayOrder}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        displayOrder: parseInt(e.target.value, 10) || 0,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Estado</Label>
                  <div className="flex h-9 items-center gap-2">
                    <Switch
                      checked={draft.isActive}
                      onCheckedChange={(v) =>
                        setDraft((d) => ({ ...d, isActive: v }))
                      }
                    />
                    <span className="text-xs text-muted-foreground">
                      {draft.isActive ? "Activo" : "Archivado"}
                    </span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                La imagen de la firma se sube luego desde la tabla, una vez
                creado el firmante.
              </p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Cancelar
              </Button>
              <Button onClick={saveDraft} disabled={saving}>
                {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
