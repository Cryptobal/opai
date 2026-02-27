"use client";

import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Mail,
  Save,
  CheckCircle2,
  AlertTriangle,
  Fingerprint,
  ArrowRight,
  Send,
  Loader2,
} from "lucide-react";

interface MarcacionConfig {
  toleranciaAtrasoMinutos: number;
  rotacionCodigoHoras: number;
  plazoOposicionHoras: number;
  emailComprobanteDigitalEnabled: boolean;
  emailAvisoMarcaManualEnabled: boolean;
  emailDelayManualMinutos: number;
  clausulaLegal: string;
  rondasPollingSegundos: number;
  rondasVentanaInicioAntesMin: number;
  rondasVentanaInicioDespuesMin: number;
  rondasRequiereFotoEvidencia: boolean;
  rondasPermiteReemplazo: boolean;
}

const EMAIL_CATALOG = [
  {
    id: "comprobante_marcacion_digital",
    nombre: "Comprobante de Marcación Digital",
    descripcion:
      "Se envía al guardia inmediatamente después de marcar entrada o salida vía QR/PIN en el celular.",
    trigger: "Al registrar marcación digital (POST /api/public/marcacion/registrar)",
    destinatario: "Guardia (email personal)",
    configKey: "emailComprobanteDigitalEnabled" as const,
    contenido: [
      "Nombre y RUT del guardia",
      "Instalación y tipo de marca (Entrada / Salida)",
      "Hora y fecha del servidor (sello de tiempo)",
      "Estado de geolocalización (validada / fuera de rango)",
      "Hash SHA-256 de integridad",
    ],
    template: "Inline HTML (src/lib/marcacion-email.ts → sendMarcacionComprobante)",
  },
  {
    id: "aviso_marca_manual",
    nombre: "Aviso de Marca Manual",
    descripcion:
      'Se envía al guardia cuando un supervisor marca "Asistió" o asigna reemplazo en la Asistencia Diaria y el guardia no tiene marcación digital previa.',
    trigger:
      'Al actualizar asistencia a "asistió" o "reemplazo" sin marcación digital (PATCH /api/ops/asistencia/[id])',
    destinatario: "Guardia afectado (email personal)",
    configKey: "emailAvisoMarcaManualEnabled" as const,
    contenido: [
      "Nombre, RUT del colaborador",
      "Tipo de marca (Entrada / Salida Laboral)",
      "Fecha y hora registrada",
      "Tipo de ajuste (Omitido)",
      "Nombre del supervisor que registró",
      "Empresa y RUT",
      "Hash SHA-256 de integridad",
      "Cláusula legal de 48 horas",
    ],
    template: "Inline HTML (src/lib/marcacion-email.ts → sendAvisoMarcaManual)",
  },
];

interface OpsEmailsTabProps {
  config: MarcacionConfig;
  setConfig: Dispatch<SetStateAction<MarcacionConfig | null>>;
  saving: boolean;
  onSave: () => void;
}

export function OpsEmailsTab({ config, setConfig, saving, onSave }: OpsEmailsTabProps) {
  const [sendingTestEmail, setSendingTestEmail] = useState<string | null>(null);
  const [testEmailResults, setTestEmailResults] = useState<
    { type: string; status: string; error?: string }[] | null
  >(null);

  const sendTestEmail = async (type: "digital" | "manual" | "both") => {
    setSendingTestEmail(type);
    setTestEmailResults(null);
    try {
      const res = await fetch("/api/ops/marcacion/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Error enviando email de prueba");
      }
      setTestEmailResults(data.data.results);
      const allSent = data.data.allSent;
      if (allSent) {
        toast.success(`Email(s) de prueba enviado(s) a ${data.data.targetEmail}`);
      } else {
        toast.error("Algunos emails fallaron. Revisa los detalles.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error enviando email de prueba");
    } finally {
      setSendingTestEmail(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Catálogo de emails automáticos */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            Emails automáticos del módulo Operaciones
          </h3>
          <p className="text-xs text-muted-foreground">
            Lista completa de correos que el sistema envía automáticamente.
            Puedes habilitar o deshabilitar cada uno.
          </p>

          <div className="space-y-3">
            {EMAIL_CATALOG.map((email) => {
              const enabled = config[email.configKey];
              return (
                <div
                  key={email.id}
                  className="rounded-lg border border-border p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-semibold">{email.nombre}</h4>
                        {enabled ? (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500 font-medium">
                            <CheckCircle2 className="h-3 w-3" />
                            Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 font-medium">
                            <AlertTriangle className="h-3 w-3" />
                            Inactivo
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {email.descripcion}
                      </p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) =>
                          setConfig((c) => c && { ...c, [email.configKey]: e.target.checked })
                        }
                        className="rounded border-border"
                      />
                      <span className="text-xs">Habilitado</span>
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 text-xs">
                    <div>
                      <p className="text-muted-foreground font-medium mb-1 flex items-center gap-1">
                        <ArrowRight className="h-3 w-3" />
                        Cuándo se envía
                      </p>
                      <p className="text-foreground">{email.trigger}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground font-medium mb-1">Destinatario</p>
                      <p className="text-foreground">{email.destinatario}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-1.5">
                      Contenido del email
                    </p>
                    <ul className="text-xs text-foreground space-y-0.5 list-disc list-inside">
                      {email.contenido.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="text-[10px] text-muted-foreground bg-muted/50 rounded px-2 py-1.5">
                    <span className="font-medium">Plantilla:</span> {email.template}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end">
            <Button onClick={() => void onSave()} disabled={saving} size="sm">
              <Save className="h-4 w-4 mr-1" />
              {saving ? "Guardando..." : "Guardar configuración"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Enviar emails de prueba */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            Enviar emails de prueba
          </h3>
          <p className="text-xs text-muted-foreground">
            Envía emails de prueba a tu dirección de usuario para verificar que
            el servicio de correo funciona correctamente.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={sendingTestEmail !== null}
              onClick={() => void sendTestEmail("digital")}
            >
              {sendingTestEmail === "digital" ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Fingerprint className="h-4 w-4 mr-1" />
              )}
              Prueba: Comprobante digital
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={sendingTestEmail !== null}
              onClick={() => void sendTestEmail("manual")}
            >
              {sendingTestEmail === "manual" ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Mail className="h-4 w-4 mr-1" />
              )}
              Prueba: Aviso marca manual
            </Button>
            <Button
              size="sm"
              disabled={sendingTestEmail !== null}
              onClick={() => void sendTestEmail("both")}
            >
              {sendingTestEmail === "both" ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-1" />
              )}
              Enviar ambos
            </Button>
          </div>

          {testEmailResults && (
            <div className="space-y-1.5">
              {testEmailResults.map((r) => (
                <div
                  key={r.type}
                  className={`text-xs rounded px-3 py-2 ${
                    r.status === "sent"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-red-500/10 text-red-400"
                  }`}
                >
                  <span className="font-medium">
                    {r.type === "digital" ? "Comprobante digital" : "Aviso marca manual"}:
                  </span>{" "}
                  {r.status === "sent" ? "Enviado correctamente" : `Error: ${r.error}`}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
