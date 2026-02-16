"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Building, Check, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/opai";

const FIELDS = [
  { key: "empresa.razonSocial", label: "Razón Social", placeholder: "Ej: Gard Seguridad Ltda." },
  { key: "empresa.rut", label: "RUT Empresa", placeholder: "Ej: 77.XXX.XXX-X" },
  { key: "empresa.direccion", label: "Dirección", placeholder: "Ej: Av. Providencia 1234, Of. 501" },
  { key: "empresa.comuna", label: "Comuna", placeholder: "Ej: Providencia" },
  { key: "empresa.ciudad", label: "Ciudad", placeholder: "Ej: Santiago" },
  { key: "empresa.telefono", label: "Teléfono", placeholder: "Ej: +56 2 1234 5678" },
  { key: "empresa.repLegalNombre", label: "Nombre Representante Legal", placeholder: "Ej: Jorge Andrés Montenegro Fuenzalida" },
  { key: "empresa.repLegalRut", label: "RUT Representante Legal", placeholder: "Ej: 13.051.246-1" },
];

export default function EmpresaConfigPage() {
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/configuracion/empresa");
      const data = await res.json();
      if (data.success) setForm(data.data);
    } catch {
      toast.error("Error al cargar configuración");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/configuracion/empresa", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success("Configuración guardada");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al guardar";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuración · Empresa"
        description="Datos de la empresa empleadora. Estos datos se usan como tokens en contratos, finiquitos, cartas de aviso y otros documentos laborales."
      />

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="max-w-2xl space-y-6">
          <div className="rounded-lg border border-border p-6 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Building className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Datos de la empresa</h3>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {FIELDS.map((field) => (
                <div key={field.key} className={field.key.includes("direccion") ? "sm:col-span-2" : ""}>
                  <Label className="text-xs">{field.label}</Label>
                  <Input
                    value={form[field.key] ?? ""}
                    onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="mt-1 text-sm"
                  />
                </div>
              ))}
            </div>

            <div className="pt-2">
              <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Guardar configuración
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            <p className="font-medium mb-1">Tokens disponibles para documentos:</p>
            <div className="grid grid-cols-2 gap-1 text-xs font-mono">
              {FIELDS.map((f) => (
                <span key={f.key} className="text-primary/70">{`{{${f.key}}}`}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
