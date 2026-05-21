"use client";

/**
 * BillingDocConfigForm — formulario de plantillas de email + branding
 * + plantilla de código de verificación para el documento de cobro.
 *
 * Persiste en TenantDteConfig vía PATCH /api/finance/billing/doc-config.
 * Incluye preview en vivo de la plantilla del código de verificación.
 */

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface DocConfig {
  proformaEmailSubject: string | null;
  proformaEmailIntro: string | null;
  estadoPagoEmailSubject: string | null;
  estadoPagoEmailIntro: string | null;
  estadoPagoFooterLegal: string | null;
  billingDocBrandPrimary: string | null;
  billingDocBrandSecondary: string | null;
  verificationCodeTemplate: string;
}

const EMPTY: DocConfig = {
  proformaEmailSubject: null,
  proformaEmailIntro: null,
  estadoPagoEmailSubject: null,
  estadoPagoEmailIntro: null,
  estadoPagoFooterLegal: null,
  billingDocBrandPrimary: null,
  billingDocBrandSecondary: null,
  verificationCodeTemplate: "EP-{{year}}{{month}}-{{folio}}",
};

function renderVerifPreview(
  tpl: string,
  vars: { year: string; month: string; folio: string },
): string {
  return tpl.replace(/\{\{([^}]+)\}\}/g, (_m, k: string) => {
    const key = k.trim();
    if (key === "year") return vars.year;
    if (key === "month") return vars.month;
    if (key === "folio") return vars.folio;
    if (key === "accountSlug") return "ametel";
    if (key === "installationSlug") return "los-poetas";
    return `{{${key}}}`;
  });
}

export function BillingDocConfigForm() {
  const [cfg, setCfg] = useState<DocConfig>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/finance/billing/doc-config");
        const json = await res.json();
        if (json.success) setCfg({ ...EMPTY, ...json.data });
      } catch {
        toast.error("Error cargando configuración");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/finance/billing/doc-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      const json = await res.json();
      if (!res.ok || !json.success)
        throw new Error(json.error ?? "No se pudo guardar");
      toast.success("Configuración guardada");
      setCfg({ ...EMPTY, ...json.data });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  const verifPreview = renderVerifPreview(cfg.verificationCodeTemplate, {
    year: "2026",
    month: "05",
    folio: "1234",
  });

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        {/* ── Plantillas Proforma ── */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Email de Proforma</h3>
          <div className="space-y-1.5">
            <Label>Asunto</Label>
            <Input
              className="h-10 sm:h-9"
              value={cfg.proformaEmailSubject ?? ""}
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  proformaEmailSubject: e.target.value || null,
                }))
              }
              placeholder="Proforma - {{nombreCuenta}} - {{instalacion}} - {{periodo}}"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Texto introductorio</Label>
            <Textarea
              rows={4}
              value={cfg.proformaEmailIntro ?? ""}
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  proformaEmailIntro: e.target.value || null,
                }))
              }
              placeholder="Estimado/a {{receiverName}}, adjunto encontrará la proforma..."
            />
            <p className="text-[10px] text-muted-foreground/80">
              Tokens: {"{{nombreCuenta}}"} {"{{razonSocial}}"} {"{{instalacion}}"}{" "}
              {"{{folio}}"} {"{{tipo}}"} {"{{total}}"} {"{{fecha}}"}{" "}
              {"{{receiverName}}"} {"{{numeroOrdenContrato}}"}{" "}
              {"{{periodo}}"} {"{{mes}}"} {"{{anio}}"}.
            </p>
          </div>
        </section>

        {/* ── Plantillas Estado de Pago ── */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Email de Estado de Pago</h3>
          <div className="space-y-1.5">
            <Label>Asunto</Label>
            <Input
              className="h-10 sm:h-9"
              value={cfg.estadoPagoEmailSubject ?? ""}
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  estadoPagoEmailSubject: e.target.value || null,
                }))
              }
              placeholder="Estado de Pago - {{nombreCuenta}} - {{instalacion}} - {{periodo}}"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Texto introductorio</Label>
            <Textarea
              rows={4}
              value={cfg.estadoPagoEmailIntro ?? ""}
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  estadoPagoEmailIntro: e.target.value || null,
                }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Footer legal</Label>
            <Textarea
              rows={3}
              value={cfg.estadoPagoFooterLegal ?? ""}
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  estadoPagoFooterLegal: e.target.value || null,
                }))
              }
              placeholder="Este Estado de Pago es un documento administrativo interno..."
            />
          </div>
        </section>

        {/* ── Branding override ── */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Branding del documento</h3>
          <p className="text-xs text-muted-foreground">
            Si lo dejás vacío, se usan los colores definidos en{" "}
            <span className="font-mono">empresa.brandingPrimaryColor</span>.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Color primario</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  className="h-10 w-16 p-1"
                  value={cfg.billingDocBrandPrimary ?? "#0D1117"}
                  onChange={(e) =>
                    setCfg((c) => ({
                      ...c,
                      billingDocBrandPrimary: e.target.value,
                    }))
                  }
                />
                <Input
                  className="h-10 sm:h-9 font-mono"
                  value={cfg.billingDocBrandPrimary ?? ""}
                  onChange={(e) =>
                    setCfg((c) => ({
                      ...c,
                      billingDocBrandPrimary: e.target.value || null,
                    }))
                  }
                  placeholder="#0D1117"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Color secundario</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  className="h-10 w-16 p-1"
                  value={cfg.billingDocBrandSecondary ?? "#0066FF"}
                  onChange={(e) =>
                    setCfg((c) => ({
                      ...c,
                      billingDocBrandSecondary: e.target.value,
                    }))
                  }
                />
                <Input
                  className="h-10 sm:h-9 font-mono"
                  value={cfg.billingDocBrandSecondary ?? ""}
                  onChange={(e) =>
                    setCfg((c) => ({
                      ...c,
                      billingDocBrandSecondary: e.target.value || null,
                    }))
                  }
                  placeholder="#0066FF"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── Código verificación ── */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Código de verificación</h3>
          <div className="space-y-1.5">
            <Label>Plantilla</Label>
            <Input
              className="h-10 sm:h-9 font-mono"
              value={cfg.verificationCodeTemplate}
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  verificationCodeTemplate: e.target.value,
                }))
              }
            />
            <p className="text-[10px] text-muted-foreground/80">
              Tokens: {"{{year}}"} {"{{month}}"} {"{{folio}}"}{" "}
              {"{{accountSlug}}"} {"{{installationSlug}}"}.
            </p>
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Vista previa: </span>
              <span className="font-mono">{verifPreview}</span>
            </div>
          </div>
        </section>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            Guardar configuración
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
