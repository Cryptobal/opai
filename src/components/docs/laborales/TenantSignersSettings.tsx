"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Signature } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, Spinner, Surface, Tag } from "@/components/opai-ds";
import { TEMPLATE_SIGNER_ROLE_LABELS, type TenantSignerRole } from "@/lib/docs/laborales/constants";

type Signer = {
  id: string;
  role: TenantSignerRole;
  name: string;
  email: string;
  rut: string | null;
  isActive: boolean;
  hasSignature: boolean;
  signatureUrl: string | null;
};

export function TenantSignersSettings() {
  const [rows, setRows] = useState<Signer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    role: "rep_legal" as TenantSignerRole,
    name: "",
    email: "",
    rut: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/docs/tenant-signers");
      const data = await res.json();
      if (data.success) setRows(data.data);
      else toast.error(data.error ?? "No se pudieron cargar los firmantes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createSigner() {
    setSaving(true);
    try {
      const res = await fetch("/api/docs/tenant-signers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error ?? "No se pudo crear");
        return;
      }
      toast.success("Firmante creado");
      setForm({ role: "rep_legal", name: "", email: "", rut: "" });
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function uploadSignature(id: string, file: File) {
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch(`/api/docs/tenant-signers/${id}/upload-signature`, {
      method: "POST",
      body: fd,
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      toast.error(data.error ?? "No se pudo subir la firma");
      return;
    }
    toast.success("Firma registrada");
    await load();
  }

  if (loading) return <Spinner />;
  return (
    <div className="space-y-4">
      <Surface elevation={1} padding="md" className="space-y-3">
        <p className="text-[13px] text-ds-text-2">
          Firmas registradas de la empresa para auto-estampado (representante legal y prevencionista).
        </p>
        <div className="grid gap-2 sm:grid-cols-4">
          <select
            className="h-10 sm:h-9 rounded-md border border-ds-border-default bg-ds-surface-1 px-2 text-[13px]"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as TenantSignerRole }))}
          >
            <option value="rep_legal">Representante legal</option>
            <option value="prevencionista">Prevencionista</option>
          </select>
          <Input className="h-10 sm:h-9" placeholder="Nombre" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Input className="h-10 sm:h-9" placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          <Input className="h-10 sm:h-9" placeholder="RUT" value={form.rut} onChange={(e) => setForm((f) => ({ ...f, rut: e.target.value }))} />
        </div>
        <Button onClick={() => void createSigner()} disabled={saving} className="min-h-11 sm:min-h-9">
          Agregar firmante
        </Button>
      </Surface>

      {rows.length === 0 ? (
        <EmptyState icon={Signature} title="Sin firmantes de empresa" description="Agrega al representante legal o prevencionista para auto-estampado." />
      ) : (
        <ul className="ds-list-cascade space-y-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Surface elevation={1} padding="sm" className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ds-text-1">{row.name}</p>
                  <p className="text-[12px] text-ds-text-3">{row.email}</p>
                </div>
                <Tag size="sm">{TEMPLATE_SIGNER_ROLE_LABELS[row.role]}</Tag>
                <Tag size="sm" variant={row.hasSignature ? "ok" : "warn"}>
                  {row.hasSignature ? "Firma lista" : "Sin firma"}
                </Tag>
                <label className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-ds-border-default px-3 text-[13px] cursor-pointer">
                  Subir firma
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadSignature(row.id, file);
                    }}
                  />
                </label>
              </Surface>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
