"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Building, FileSignature, Loader2, Mail, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/opai";
import { SignatureCanvas } from "@/components/docs/SignatureCanvas";

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

const EMAIL_FIELDS = [
  { key: "empresa.emailFromName", label: "Nombre del remitente", placeholder: "Ej: OPAI", help: "El nombre que aparece en el email (ej: 'OPAI')" },
  { key: "empresa.emailFrom", label: "Correo de envío (From)", placeholder: "Ej: opai@gard.cl", help: "Dirección desde la cual se envían los correos. Debe estar verificada en Resend." },
  { key: "empresa.emailReplyTo", label: "Correo de respuesta (Reply-To)", placeholder: "comercial@gard.cl", help: "Las respuestas siempre llegan a comercial@gard.cl (valor fijo).", disabled: true },
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
      const payload = { ...form };
      payload["empresa.emailReplyTo"] = "comercial@gard.cl"; // Siempre fijo
      const res = await fetch("/api/configuracion/empresa", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
    <div className="space-y-6 min-w-0">
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

          <div className="rounded-lg border border-border p-6 space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Correo electrónico</h3>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Configura desde qué dirección se envían los correos de OPAI (notificaciones, invitaciones, alertas) y a qué dirección llegan las respuestas.
              </p>
            </div>

            <div className="grid gap-4">
              {EMAIL_FIELDS.map((field) => (
                <div key={field.key}>
                  <Label className="text-xs">{field.label}</Label>
                  <Input
                    value={field.key === "empresa.emailReplyTo" ? "comercial@gard.cl" : (form[field.key] ?? "")}
                    onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="mt-1 text-sm"
                    disabled={"disabled" in field && field.disabled}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">{field.help}</p>
                </div>
              ))}
            </div>

            <div className="rounded-md bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="font-medium mb-1">Ejemplo de cómo se ve:</p>
              <p>
                De: <span className="text-foreground font-mono">{form["empresa.emailFromName"] || "OPAI"} &lt;{form["empresa.emailFrom"] || "opai@gard.cl"}&gt;</span>
              </p>
              <p>
                Responder a: <span className="text-foreground font-mono">{form["empresa.emailReplyTo"] || "comercial@gard.cl"}</span>
              </p>
            </div>

            <div className="pt-2">
              <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Guardar correo de envío y respuesta
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border p-6 space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <FileSignature className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Firma del representante legal</h3>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                La firma se inserta automáticamente en contratos y anexos con el token <code className="bg-muted px-1 rounded">{"{{empresa.firmaRepLegal}}"}</code>.
              </p>
            </div>
            <label className="flex items-center justify-between rounded-lg border border-border p-4 cursor-pointer hover:bg-muted/30 transition-colors">
              <div>
                <span className="text-sm font-medium">
                  Firmar automáticamente contratos y anexos como representante legal
                </span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Si está activo, la firma del rep. legal se aplica en documentos. Si está desactivado, no se muestra.
                </p>
              </div>
              <input
                type="checkbox"
                checked={form["empresa.autoFirmaRepLegalContratos"] === "true"}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    "empresa.autoFirmaRepLegalContratos": e.target.checked ? "true" : "false",
                  }))
                }
                className="h-4 w-4 rounded border-border"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs">Subir imagen</Label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="block w-full text-sm file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const fd = new FormData();
                      fd.append("file", file);
                      const res = await fetch("/api/docs/sign/upload", { method: "POST", body: fd });
                      const data = await res.json();
                      if (data.success && data.data?.url) {
                        setForm((prev) => ({ ...prev, "empresa.repLegalFirma": data.data.url }));
                        toast.success("Firma subida");
                      } else throw new Error(data.error);
                    } catch {
                      toast.error("Error al subir firma");
                    }
                    e.target.value = "";
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">O dibujar a mano</Label>
                <SignatureCanvas
                  value={form["empresa.repLegalFirma"] || null}
                  onChange={(dataUrl) =>
                    setForm((prev) => ({ ...prev, "empresa.repLegalFirma": dataUrl || "" }))
                  }
                />
              </div>
            </div>
            {form["empresa.repLegalFirma"] ? (
              <div className="flex items-center gap-2">
                <img
                  src={form["empresa.repLegalFirma"]}
                  alt="Firma rep legal"
                  className="h-16 rounded border bg-white"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setForm((prev) => ({ ...prev, "empresa.repLegalFirma": "" }))}
                >
                  Quitar firma
                </Button>
              </div>
            ) : null}
            <div className="pt-2">
              <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Guardar firma
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            <p className="font-medium mb-1">Tokens disponibles para documentos:</p>
            <div className="grid grid-cols-2 gap-1 text-xs font-mono">
              {FIELDS.map((f) => (
                <span key={f.key} className="text-primary/70">{`{{${f.key}}}`}</span>
              ))}
              <span key="firmaRepLegal" className="text-primary/70">{"{{empresa.firmaRepLegal}}"}</span>
              <span key="firmaGuardia" className="text-primary/70">{"{{signature.firmaGuardia}}"}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
