"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Building, Copy, FileSignature, Globe, Loader2, Mail, Paintbrush, Phone, Save, Smartphone, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SignatureCanvas } from "@/components/docs/SignatureCanvas";
import { ConfigTabs } from "@/components/configuracion/ConfigTabs";

const CCO_MODULES: Array<{ module: "commercial" | "operations" | "finance" | "system"; label: string; help: string }> = [
  { module: "commercial", label: "Comercial", help: "CRM, cotizaciones, presentaciones, portal cliente." },
  { module: "operations", label: "Operaciones", help: "Tickets, rondas, asistencia, cobertura, supervisión." },
  { module: "finance", label: "Finanzas", help: "Facturas, notas de crédito, órdenes de compra, cobranza, estados de pago." },
  { module: "system", label: "Sistema", help: "Onboarding, recuperación de contraseña, alertas de plataforma." },
];

const FIELDS = [
  { key: "empresa.razonSocial", label: "Razón Social", placeholder: "Ej: Mi Empresa Seguridad Ltda." },
  { key: "empresa.rut", label: "RUT Empresa", placeholder: "Ej: 77.XXX.XXX-X" },
  { key: "empresa.direccion", label: "Dirección", placeholder: "Ej: Av. Providencia 1234, Of. 501" },
  { key: "empresa.comuna", label: "Comuna", placeholder: "Ej: Providencia" },
  { key: "empresa.ciudad", label: "Ciudad", placeholder: "Ej: Santiago" },
  { key: "empresa.telefono", label: "Teléfono empresa", placeholder: "Ej: +56 2 1234 5678" },
  { key: "empresa.repLegalNombre", label: "Nombre Representante Legal", placeholder: "Ej: Juan Pérez González" },
  { key: "empresa.repLegalRut", label: "RUT Representante Legal", placeholder: "Ej: 12.345.678-9" },
  { key: "empresa.repLegalEmail", label: "Email Representante Legal", placeholder: "Ej: jperez@miempresa.cl" },
  { key: "empresa.fechaEscrituraPublica", label: "Fecha Escritura Pública", placeholder: "Ej: 15 de marzo de 2020" },
  { key: "empresa.nombreNotaria", label: "Notaría que otorgó la escritura", placeholder: "Ej: Notaría Juan Ricardo San Martín Urrejola" },
];

const BRAND_FIELDS = [
  { key: "empresa.companyName", label: "Nombre corto (razón social)", placeholder: "Ej: Mi Empresa SpA", help: "Para documentos legales y correos." },
  { key: "empresa.commercialName", label: "Nombre comercial / marca", placeholder: "Ej: Mi Empresa Security", help: "Para presentaciones, PDFs y comunicaciones." },
  { key: "empresa.brandNameUpper", label: "Marca (mayúsculas)", placeholder: "Ej: MIEMPRESA", help: "Para headers y logos en mayúscula." },
  { key: "empresa.website", label: "Sitio web", placeholder: "Ej: www.miempresa.cl" },
  { key: "empresa.logoUrl", label: "URL del logo", placeholder: "https://...", help: "URL pública del logo de la empresa." },
];

const CONTACT_FIELDS = [
  { key: "empresa.email", label: "Email comercial principal", placeholder: "Ej: comercial@miempresa.cl", help: "Email principal que se muestra en presentaciones y PDFs." },
  { key: "empresa.emailOps", label: "Email operaciones", placeholder: "Ej: operaciones@miempresa.cl", help: "Recibe reportes de control nocturno y alertas operacionales." },
  { key: "empresa.emailFinance", label: "Email finanzas", placeholder: "Ej: finanzas@miempresa.cl", help: "Recibe documentos tributarios, órdenes de compra, notas de crédito y cobranza interna." },
  { key: "empresa.emailContact", label: "Email contacto / general", placeholder: "Ej: contacto@miempresa.cl", help: "Email genérico para footer de cotizaciones." },
  { key: "empresa.phone", label: "Teléfono comercial", placeholder: "Ej: +56 9 1234 5678", help: "Con formato, para mostrar en documentos." },
  { key: "empresa.phoneRaw", label: "Teléfono WhatsApp (sin formato)", placeholder: "Ej: 56912345678", help: "Sin +, espacios ni guiones. Para links wa.me." },
  { key: "empresa.whatsappLink", label: "Link WhatsApp", placeholder: "Ej: https://wa.me/56912345678", help: "Se deriva automáticamente del teléfono si no se configura." },
];

const EMAIL_FIELDS = [
  { key: "empresa.emailFromName", label: "Nombre del remitente", placeholder: "Ej: OPAI", help: "El nombre que aparece en el email (ej: 'OPAI')" },
  { key: "empresa.emailFrom", label: "Correo de envío (From)", placeholder: "Ej: notificaciones@miempresa.cl", help: "Dirección desde la cual se envían los correos. Debe estar verificada en Resend." },
  { key: "empresa.emailReplyTo", label: "Correo de respuesta (Reply-To)", placeholder: "Ej: comercial@miempresa.cl", help: "Dirección a la que llegan las respuestas de los clientes." },
];

const BRANDING_IMAGE_FIELDS = [
  { key: "empresa.branding.logoFull", label: "Logo completo (horizontal)", help: "Para headers, documentos y emails. Recomendado: PNG transparente, min 400px ancho." },
  { key: "empresa.branding.logoIcon", label: "Icono / Isotipo", help: "Para favicon, app icon y espacios reducidos. Recomendado: cuadrado, min 256px." },
  { key: "empresa.branding.logoWhite", label: "Logo version clara", help: "Para fondos oscuros (dark mode). PNG con transparencia." },
  { key: "empresa.branding.logoDark", label: "Logo version oscura", help: "Para fondos claros (light mode). PNG con transparencia." },
  { key: "empresa.branding.favicon", label: "Favicon", help: "Icono del navegador. Recomendado: ICO o PNG 32x32." },
];

const BRANDING_COLOR_FIELDS = [
  { key: "empresa.branding.primaryColor", label: "Color principal", help: "Navy principal de la marca.", placeholder: "#0a1628" },
  { key: "empresa.branding.secondaryColor", label: "Color secundario", help: "Color secundario de la marca.", placeholder: "#0d9488" },
  { key: "empresa.branding.accentColor", label: "Color accent", help: "Para CTAs y elementos destacados.", placeholder: "#2dd4bf" },
];

const BRANDING_TEXT_FIELDS = [
  { key: "empresa.branding.appName", label: "Nombre de la aplicacion", placeholder: "OPAI", help: "Se muestra en la welcome screen y titulo de la app." },
  { key: "empresa.branding.tagline", label: "Subtitulo / Tagline", placeholder: "Plataforma de Operaciones", help: "Se muestra debajo del nombre en la welcome screen." },
];

export function EmpresaConfigTabs() {
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

  async function handleBrandingUpload(fieldKey: string, file: File) {
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/configuracion/branding/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (data.success && data.data?.url) {
        setForm((prev) => ({ ...prev, [fieldKey]: data.data.url }));
        toast.success("Imagen subida");
      } else {
        throw new Error(data.error || "Error al subir");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al subir imagen";
      toast.error(msg);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const datosTab = (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-lg border border-border p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Building className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Datos de la empresa</h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((field) => (
            <div key={field.key} className={field.key.includes("direccion") ? "sm:col-span-2" : ""}>
              <Label className="text-xs mb-1.5">{field.label}</Label>
              <Input
                value={form[field.key] ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                className="text-sm"
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
          <span key="firmaRepLegal" className="text-primary/70">{"{{empresa.firmaRepLegal}}"}</span>
          <span key="firmaGuardia" className="text-primary/70">{"{{signature.firmaGuardia}}"}</span>
        </div>
      </div>
    </div>
  );

  const brandTab = (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-lg border border-border p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Globe className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Marca y sitio web</h3>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          Estos valores se usan en presentaciones, PDFs, cotizaciones y emails.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {BRAND_FIELDS.map((field) => (
            <div key={field.key} className={field.key.includes("logoUrl") ? "sm:col-span-2" : ""}>
              <Label className="text-xs mb-1.5">{field.label}</Label>
              <Input
                value={form[field.key] ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                className="text-sm"
              />
              {"help" in field && <p className="text-[11px] text-muted-foreground mt-1">{field.help}</p>}
            </div>
          ))}
        </div>
        <div className="pt-2">
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar marca
          </Button>
        </div>
      </div>
    </div>
  );

  const contactTab = (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-lg border border-border p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Phone className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Contacto y emails operacionales</h3>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          Emails y teléfonos que se usan en los distintos módulos (CRM, Ops, etc.).
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {CONTACT_FIELDS.map((field) => (
            <div key={field.key}>
              <Label className="text-xs mb-1.5">{field.label}</Label>
              <Input
                value={form[field.key] ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                className="text-sm"
              />
              {"help" in field && <p className="text-[11px] text-muted-foreground mt-1">{field.help}</p>}
            </div>
          ))}
        </div>
        <div className="pt-2">
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar contacto
          </Button>
        </div>
      </div>
    </div>
  );

  const correoTab = (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-lg border border-border p-6 space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Correo electrónico (envío OPAI)</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Configura desde qué dirección se envían los correos de OPAI (notificaciones, invitaciones, alertas) y a qué dirección llegan las respuestas.
          </p>
        </div>

        <div className="grid gap-4">
          {EMAIL_FIELDS.map((field) => (
            <div key={field.key}>
              <Label className="text-xs mb-1.5">{field.label}</Label>
              <Input
                value={form[field.key] ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                className="text-sm"
              />
              <p className="text-[11px] text-muted-foreground mt-1">{field.help}</p>
            </div>
          ))}
        </div>

        <div className="rounded-md bg-muted/30 p-3 text-xs text-muted-foreground">
          <p className="font-medium mb-1">Ejemplo de cómo se ve:</p>
          <p>
            De: <span className="text-foreground font-mono">{form["empresa.emailFromName"] || "OPAI"} &lt;{form["empresa.emailFrom"] || "correo@miempresa.cl"}&gt;</span>
          </p>
          <p>
            Responder a: <span className="text-foreground font-mono">{form["empresa.emailReplyTo"] || "correo@miempresa.cl"}</span>
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border p-6 space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <Copy className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Copias ocultas automáticas por módulo</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Cuando OPAI envía un correo a un cliente o externo, opcionalmente puede copiar en oculto (CCO) a una casilla interna del tenant para auditar el envío. Configurable por módulo.
          </p>
        </div>

        {CCO_MODULES.map(({ module, label, help }) => {
          const enabledKey = `empresa.cco.${module}.enabled`;
          const emailsKey = `empresa.cco.${module}.emails`;
          const replyKey = `empresa.cco.${module}.replyTo`;
          const enabled = form[enabledKey] !== "false";
          return (
            <div key={module} className="rounded-md border border-border/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-[11px] text-muted-foreground">{help}</p>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={(v) => setForm((p) => ({ ...p, [enabledKey]: v ? "true" : "false" }))}
                />
              </div>
              {enabled && (
                <>
                  <div>
                    <Label className="text-xs mb-1.5">CCO automático (separar con coma)</Label>
                    <Input
                      value={form[emailsKey] ?? ""}
                      onChange={(e) => setForm((p) => ({ ...p, [emailsKey]: e.target.value }))}
                      placeholder="Ej: contabilidad@miempresa.cl, gerencia@miempresa.cl"
                      className="text-sm"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Si lo dejas vacío, se usará el primer email del módulo configurado en el tab &quot;Contacto&quot;.
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5">Reply-To específico de este módulo (opcional)</Label>
                    <Input
                      value={form[replyKey] ?? ""}
                      onChange={(e) => setForm((p) => ({ ...p, [replyKey]: e.target.value }))}
                      placeholder="Opcional. Si lo dejas vacío, se usa el Reply-To global."
                      className="text-sm"
                    />
                  </div>
                </>
              )}
            </div>
          );
        })}

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
    </div>
  );

  const firmaTab = (
    <div className="max-w-2xl">
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
            <Label className="text-xs mb-1.5">Subir imagen</Label>
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
            <Label className="text-xs mb-1.5">O dibujar a mano</Label>
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
    </div>
  );

  const brandingTab = (
    <div className="max-w-2xl space-y-6">
      {/* Image uploads */}
      <div className="rounded-lg border border-border p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Upload className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Logos e iconos</h3>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          Sube las variantes del logo de tu empresa. Se usan en la welcome screen, headers, documentos y la app movil.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {BRANDING_IMAGE_FIELDS.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label className="text-xs">{field.label}</Label>
              {form[field.key] ? (
                <div className="relative group rounded-lg border border-border p-3 bg-muted/20">
                  <img
                    src={form[field.key]}
                    alt={field.label}
                    className="h-16 max-w-full object-contain mx-auto"
                  />
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, [field.key]: "" }))}
                    className="absolute top-1 right-1 p-1 rounded-full bg-destructive/80 text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center h-24 rounded-lg border-2 border-dashed border-border hover:border-primary/50 cursor-pointer transition-colors bg-muted/10">
                  <Upload className="h-5 w-5 text-muted-foreground mb-1" />
                  <span className="text-xs text-muted-foreground">Click o arrastra</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleBrandingUpload(field.key, file);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
              <p className="text-[11px] text-muted-foreground">{field.help}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Colors */}
      <div className="rounded-lg border border-border p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Paintbrush className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Colores corporativos</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {BRANDING_COLOR_FIELDS.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label className="text-xs">{field.label}</Label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={form[field.key] || field.placeholder}
                  onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  className="h-9 w-12 rounded border border-border cursor-pointer bg-transparent"
                />
                <Input
                  value={form[field.key] ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="text-sm font-mono flex-1"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">{field.help}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Text fields */}
      <div className="rounded-lg border border-border p-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {BRANDING_TEXT_FIELDS.map((field) => (
            <div key={field.key}>
              <Label className="text-xs mb-1.5">{field.label}</Label>
              <Input
                value={form[field.key] ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                className="text-sm"
              />
              <p className="text-[11px] text-muted-foreground mt-1">{field.help}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="rounded-lg border border-border p-6 space-y-3">
        <h3 className="text-sm font-semibold">Vista previa</h3>
        <div
          className="rounded-lg p-6 flex flex-col items-center gap-3"
          style={{ backgroundColor: form["empresa.branding.primaryColor"] || "#0a1628" }}
        >
          {form["empresa.branding.logoWhite"] || form["empresa.branding.logoFull"] ? (
            <img
              src={form["empresa.branding.logoWhite"] || form["empresa.branding.logoFull"]}
              alt="Logo preview"
              className="h-12 object-contain"
            />
          ) : (
            <div className="text-white/60 text-xs">Sin logo configurado</div>
          )}
          <span className="text-white font-bold text-lg">
            {form["empresa.branding.appName"] || "OPAI"}
          </span>
          <span className="text-white/70 text-sm">
            {form["empresa.branding.tagline"] || "Plataforma de Operaciones"}
          </span>
          <div className="flex gap-2 mt-2">
            <div
              className="w-8 h-8 rounded-full border border-white/20"
              style={{ backgroundColor: form["empresa.branding.primaryColor"] || "#0a1628" }}
              title="Primary"
            />
            <div
              className="w-8 h-8 rounded-full border border-white/20"
              style={{ backgroundColor: form["empresa.branding.secondaryColor"] || "#0d9488" }}
              title="Secondary"
            />
            <div
              className="w-8 h-8 rounded-full border border-white/20"
              style={{ backgroundColor: form["empresa.branding.accentColor"] || "#2dd4bf" }}
              title="Accent"
            />
          </div>
        </div>
      </div>

      <div className="pt-2">
        <Button onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar imagen corporativa
        </Button>
      </div>
    </div>
  );

  const portalesTab = (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-lg border border-border p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Smartphone className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Portales de Rondas y Acceso</h3>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          Configuración de seguridad para los dispositivos de guardia.
        </p>

        <div>
          <Label className="text-xs mb-1.5">PIN de cierre de sesión</Label>
          <Input
            value={form["portales.logoutPin"] ?? ""}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9]/g, "").slice(0, 4);
              setForm((prev) => ({ ...prev, "portales.logoutPin": val }));
            }}
            placeholder="0000"
            inputMode="numeric"
            maxLength={4}
            className="text-sm font-mono max-w-[120px] tracking-widest"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            PIN de 4 dígitos que los guardias deben ingresar para cerrar sesión en los portales de rondas y acceso. Por defecto: 0000.
          </p>
        </div>

        <div className="pt-2">
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar configuración de portales
          </Button>
        </div>
      </div>
    </div>
  );

  const tabs = [
    {
      id: "datos",
      label: "Datos Generales",
      icon: Building,
      content: datosTab,
    },
    {
      id: "marca",
      label: "Marca y Web",
      icon: Globe,
      content: brandTab,
    },
    {
      id: "contacto",
      label: "Contacto",
      icon: Phone,
      content: contactTab,
    },
    {
      id: "correo",
      label: "Correo Electrónico",
      icon: Mail,
      content: correoTab,
    },
    {
      id: "firma",
      label: "Firma Legal",
      icon: FileSignature,
      content: firmaTab,
    },
    {
      id: "branding",
      label: "Imagen Corporativa",
      icon: Paintbrush,
      content: brandingTab,
    },
    {
      id: "portales",
      label: "Portales",
      icon: Smartphone,
      content: portalesTab,
    },
  ];

  return <ConfigTabs tabs={tabs} defaultTab="datos" />;
}
