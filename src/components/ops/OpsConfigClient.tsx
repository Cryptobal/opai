"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Mail,
  Clock,
  Shield,
  QrCode,
  Save,
  CheckCircle2,
  AlertTriangle,
  Fingerprint,
  ArrowRight,
  Send,
  Timer,
  Loader2,
  Route,
  Camera,
  Users,
  FileText,
  Plus,
  Trash2,
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

type PostulacionDocItem = { code: string; label: string; required: boolean };
type InstalacionDocItem = { code: string; label: string; required: boolean };
type GuardiaDocConfigItem = { code: string; hasExpiration: boolean; alertDaysBefore: number };

const GUARDIA_DOC_LABELS: Record<string, string> = {
  certificado_antecedentes: "Certificado de antecedentes",
  certificado_os10: "Certificado OS-10",
  cedula_identidad: "Cédula de identidad",
  curriculum: "Currículum",
  contrato: "Contrato",
  anexo_contrato: "Anexo de contrato",
  certificado_ensenanza_media: "Certificado enseñanza media",
  certificado_afp: "Certificado AFP",
  certificado_fonasa_isapre: "Certificado Fonasa / Isapre",
};

/* ── Catálogo de emails del módulo Operaciones ── */

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

export function OpsConfigClient() {
  const [config, setConfig] = useState<MarcacionConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingTestEmail, setSendingTestEmail] = useState<string | null>(null);
  const [testEmailResults, setTestEmailResults] = useState<
    { type: string; status: string; error?: string }[] | null
  >(null);
  const [postulacionDocs, setPostulacionDocs] = useState<PostulacionDocItem[]>([]);
  const [postulacionDocsLoading, setPostulacionDocsLoading] = useState(true);
  const [postulacionDocsSaving, setPostulacionDocsSaving] = useState(false);
  const [newDocLabel, setNewDocLabel] = useState("");
  const [instalacionDocs, setInstalacionDocs] = useState<InstalacionDocItem[]>([]);
  const [instalacionDocsLoading, setInstalacionDocsLoading] = useState(true);
  const [instalacionDocsSaving, setInstalacionDocsSaving] = useState(false);
  const [newInstalacionDocLabel, setNewInstalacionDocLabel] = useState("");
  const [guardiaDocConfig, setGuardiaDocConfig] = useState<GuardiaDocConfigItem[]>([]);
  const [guardiaDocConfigLoading, setGuardiaDocConfigLoading] = useState(true);
  const [guardiaDocConfigSaving, setGuardiaDocConfigSaving] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/ops/marcacion/config");
      const data = await res.json();
      if (data.success) setConfig(data.data);
    } catch {
      toast.error("No se pudo cargar la configuración");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPostulacionDocs = useCallback(async () => {
    try {
      const res = await fetch("/api/ops/postulacion-documentos");
      const data = await res.json();
      if (data.success) setPostulacionDocs(data.data);
    } catch {
      toast.error("No se pudo cargar documentos de postulación");
    } finally {
      setPostulacionDocsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    void fetchPostulacionDocs();
  }, [fetchPostulacionDocs]);

  const fetchInstalacionDocs = useCallback(async () => {
    try {
      const res = await fetch("/api/ops/instalacion-documentos");
      const data = await res.json();
      if (data.success) setInstalacionDocs(data.data);
    } catch {
      toast.error("No se pudo cargar documentos de instalación");
    } finally {
      setInstalacionDocsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchInstalacionDocs();
  }, [fetchInstalacionDocs]);

  const fetchGuardiaDocConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/ops/guardia-documentos-config");
      const data = await res.json();
      if (data.success) setGuardiaDocConfig(data.data);
    } catch {
      toast.error("No se pudo cargar configuración de documentos de guardia");
    } finally {
      setGuardiaDocConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchGuardiaDocConfig();
  }, [fetchGuardiaDocConfig]);

  // Sincronizar guardiaDocConfig con postulacionDocs (para docs custom)
  useEffect(() => {
    if (postulacionDocs.length === 0 || guardiaDocConfig.length === 0) return;
    const guardiaCodes = new Set(guardiaDocConfig.map((g) => g.code));
    const missing = postulacionDocs.filter((p) => !guardiaCodes.has(p.code));
    if (missing.length > 0) {
      setGuardiaDocConfig((prev) => [
        ...prev,
        ...missing.map((m) => ({ code: m.code, hasExpiration: false, alertDaysBefore: 30 })),
      ]);
    }
  }, [postulacionDocs, guardiaDocConfig]);

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch("/api/ops/marcacion/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data.data);
        toast.success("Configuración guardada");
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const slugFromLabel = (label: string) =>
    label
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");

  const addPostulacionDoc = () => {
    const label = newDocLabel.trim();
    if (!label) {
      toast.error("Escribe el nombre del documento");
      return;
    }
    const code = slugFromLabel(label);
    if (!code) {
      toast.error("Nombre de documento inválido");
      return;
    }
    if (postulacionDocs.some((d) => d.code === code)) {
      toast.error("Ya existe un documento con ese nombre");
      return;
    }
    setPostulacionDocs((prev) => [...prev, { code, label, required: false }]);
    setNewDocLabel("");
  };

  const updatePostulacionDoc = (index: number, patch: Partial<PostulacionDocItem>) => {
    setPostulacionDocs((prev) =>
      prev.map((d, i) => (i === index ? { ...d, ...patch } : d))
    );
  };

  const removePostulacionDoc = (index: number) => {
    setPostulacionDocs((prev) => prev.filter((_, i) => i !== index));
  };

  const updateGuardiaDocConfigItem = (index: number, patch: Partial<GuardiaDocConfigItem>) => {
    setGuardiaDocConfig((prev) =>
      prev.map((d, i) => (i === index ? { ...d, ...patch } : d))
    );
  };

  const saveGuardiaDocConfig = async () => {
    setGuardiaDocConfigSaving(true);
    try {
      const res = await fetch("/api/ops/guardia-documentos-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: guardiaDocConfig }),
      });
      const data = await res.json();
      if (data.success) {
        setGuardiaDocConfig(data.data);
        toast.success("Configuración de documentos de guardia guardada");
      } else throw new Error(data.error);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setGuardiaDocConfigSaving(false);
    }
  };

  const savePostulacionDocs = async () => {
    setPostulacionDocsSaving(true);
    try {
      const res = await fetch("/api/ops/postulacion-documentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documents: postulacionDocs }),
      });
      const data = await res.json();
      if (data.success) {
        setPostulacionDocs(data.data);
        toast.success("Documentos de postulación guardados");
      } else throw new Error(data.error);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setPostulacionDocsSaving(false);
    }
  };

  const addInstalacionDoc = () => {
    const label = newInstalacionDocLabel.trim();
    if (!label) {
      toast.error("Escribe el nombre del documento");
      return;
    }
    const code = slugFromLabel(label);
    if (!code) {
      toast.error("Nombre de documento inválido");
      return;
    }
    if (instalacionDocs.some((d) => d.code === code)) {
      toast.error("Ya existe un documento con ese nombre");
      return;
    }
    setInstalacionDocs((prev) => [...prev, { code, label, required: false }]);
    setNewInstalacionDocLabel("");
  };

  const updateInstalacionDoc = (index: number, patch: Partial<InstalacionDocItem>) => {
    setInstalacionDocs((prev) =>
      prev.map((d, i) => (i === index ? { ...d, ...patch } : d))
    );
  };

  const removeInstalacionDoc = (index: number) => {
    setInstalacionDocs((prev) => prev.filter((_, i) => i !== index));
  };

  const saveInstalacionDocs = async () => {
    setInstalacionDocsSaving(true);
    try {
      const res = await fetch("/api/ops/instalacion-documentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documents: instalacionDocs }),
      });
      const data = await res.json();
      if (data.success) {
        setInstalacionDocs(data.data);
        toast.success("Documentos de instalación guardados");
      } else throw new Error(data.error);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setInstalacionDocsSaving(false);
    }
  };

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

  if (loading || !config) {
    return (
      <Card>
        <CardContent className="pt-5 text-center text-muted-foreground text-sm py-12">
          Cargando configuración...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Sección 1: Parámetros de marcación ── */}
      <Card>
        <CardContent className="pt-5 space-y-5">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Fingerprint className="h-4 w-4 text-primary" />
            Parámetros de marcación
          </h3>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                Tolerancia de atraso (min)
              </Label>
              <Input
                type="number"
                min={0}
                max={120}
                value={config.toleranciaAtrasoMinutos}
                onChange={(e) =>
                  setConfig((c) => c && { ...c, toleranciaAtrasoMinutos: Number(e.target.value) || 0 })
                }
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Entradas dentro de este rango no se consideran atraso
              </p>
            </div>

            <div>
              <Label className="flex items-center gap-1.5">
                <QrCode className="h-3.5 w-3.5 text-muted-foreground" />
                Rotación código QR (horas)
              </Label>
              <Input
                type="number"
                min={0}
                max={720}
                value={config.rotacionCodigoHoras}
                onChange={(e) =>
                  setConfig((c) => c && { ...c, rotacionCodigoHoras: Number(e.target.value) || 0 })
                }
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                0 = no rotar automáticamente. Ej: 168 = cada semana
              </p>
            </div>

            <div>
              <Label className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                Plazo oposición (horas)
              </Label>
              <Input
                type="number"
                min={12}
                max={168}
                value={config.plazoOposicionHoras}
                onChange={(e) =>
                  setConfig((c) => c && { ...c, plazoOposicionHoras: Number(e.target.value) || 48 })
                }
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Horas para que el trabajador se oponga a un ajuste manual
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-1">
            <div className="sm:max-w-xs">
              <Label className="flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5 text-muted-foreground" />
                Delay email marca manual (min)
              </Label>
              <Input
                type="number"
                min={0}
                max={1440}
                value={config.emailDelayManualMinutos ?? 0}
                onChange={(e) =>
                  setConfig((c) => c && { ...c, emailDelayManualMinutos: Number(e.target.value) || 0 })
                }
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Minutos de espera antes de enviar el email de marca manual.
                0 = inmediato. Si se resetea la asistencia antes de este plazo, el email no se envía.
              </p>
            </div>
          </div>

          <div>
            <Label>Cláusula legal (incluida en aviso de marca manual)</Label>
            <textarea
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y"
              value={config.clausulaLegal}
              onChange={(e) =>
                setConfig((c) => c && { ...c, clausulaLegal: e.target.value })
              }
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={() => void saveConfig()} disabled={saving} size="sm">
              <Save className="h-4 w-4 mr-1" />
              {saving ? "Guardando..." : "Guardar parámetros"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Sección 1b: Documentos de guardias (postulación + ficha) ── */}
      <Card>
        <CardContent className="pt-5 space-y-5">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Documentos de guardias
          </h3>
          <p className="text-xs text-muted-foreground">
            Lista de documentos para postulación y ficha de guardia. Obligatorio: si es requerido para enviar la postulación. Vencimiento: si aplica fecha de vencimiento y alertas en la ficha.
          </p>

          {(postulacionDocsLoading || guardiaDocConfigLoading) ? (
            <p className="text-sm text-muted-foreground py-4">Cargando...</p>
          ) : (
            <>
              <div className="space-y-2">
                {postulacionDocs.map((doc, postIndex) => {
                  const guardiaIndex = guardiaDocConfig.findIndex((g) => g.code === doc.code);
                  const guardia = guardiaIndex >= 0 ? guardiaDocConfig[guardiaIndex] : { hasExpiration: false, alertDaysBefore: 30 };
                  return (
                    <div
                      key={doc.code}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border p-3"
                    >
                      <span className="text-sm font-medium min-w-[140px]">{doc.label}</span>
                      <span className="text-[11px] text-muted-foreground font-mono shrink-0">{doc.code}</span>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={doc.required}
                          onChange={(e) => updatePostulacionDoc(postIndex, { required: e.target.checked })}
                          className="rounded border-border"
                        />
                        <span className="text-xs">Obligatorio</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={guardia.hasExpiration}
                          onChange={(e) => {
                            if (guardiaIndex >= 0) {
                              updateGuardiaDocConfigItem(guardiaIndex, {
                                hasExpiration: e.target.checked,
                                alertDaysBefore: e.target.checked ? guardia.alertDaysBefore : 30,
                              });
                            } else {
                              setGuardiaDocConfig((prev) => [
                                ...prev,
                                { code: doc.code, hasExpiration: e.target.checked, alertDaysBefore: 30 },
                              ]);
                            }
                          }}
                          className="rounded border-border"
                        />
                        <span className="text-xs">Vence</span>
                      </label>
                      {guardia.hasExpiration && guardiaIndex >= 0 && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-muted-foreground">Alerta:</span>
                          <Input
                            type="number"
                            min={1}
                            max={365}
                            value={guardia.alertDaysBefore}
                            onChange={(e) =>
                              updateGuardiaDocConfigItem(guardiaIndex, {
                                alertDaysBefore: Math.max(1, Math.min(365, Number(e.target.value) || 30)),
                              })
                            }
                            className="h-7 w-16 min-w-[4rem] text-xs"
                          />
                          <span className="text-[11px] text-muted-foreground">días</span>
                        </div>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive ml-auto shrink-0"
                        onClick={() => removePostulacionDoc(postIndex)}
                        title="Quitar documento"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder="Nombre del nuevo documento (ej: Certificado)"
                  value={newDocLabel}
                  onChange={(e) => setNewDocLabel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPostulacionDoc())}
                  className="max-w-xs"
                />
                <Button type="button" variant="outline" size="sm" onClick={addPostulacionDoc}>
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar documento
                </Button>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  onClick={async () => {
                    await savePostulacionDocs();
                    await saveGuardiaDocConfig();
                  }}
                  disabled={postulacionDocsSaving || guardiaDocConfigSaving}
                  size="sm"
                >
                  <Save className="h-4 w-4 mr-1" />
                  {postulacionDocsSaving || guardiaDocConfigSaving ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Sección 1c: Documentos de instalación (supervisión) ── */}
      <Card>
        <CardContent className="pt-5 space-y-5">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Documentos de instalación (supervisión)
          </h3>
          <p className="text-xs text-muted-foreground">
            Lista de documentos que el supervisor debe verificar en cada visita (directiva de funcionamiento, contrato de guardias, OS10, etc.). Aparecen como checklist en el flujo de nueva visita.
          </p>

          {instalacionDocsLoading ? (
            <p className="text-sm text-muted-foreground py-4">Cargando...</p>
          ) : (
            <>
              <div className="space-y-2">
                {instalacionDocs.map((doc, index) => (
                  <div
                    key={doc.code}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"
                  >
                    <span className="text-sm font-medium min-w-[140px]">{doc.label}</span>
                    <span className="text-[11px] text-muted-foreground font-mono">{doc.code}</span>
                    <label className="flex items-center gap-2 cursor-pointer ml-auto">
                      <input
                        type="checkbox"
                        checked={doc.required}
                        onChange={(e) => updateInstalacionDoc(index, { required: e.target.checked })}
                        className="rounded border-border"
                      />
                      <span className="text-xs">Obligatorio en visita</span>
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => removeInstalacionDoc(index)}
                      title="Quitar documento"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder="Ej: Directiva de funcionamiento"
                  value={newInstalacionDocLabel}
                  onChange={(e) => setNewInstalacionDocLabel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addInstalacionDoc())}
                  className="max-w-xs"
                />
                <Button type="button" variant="outline" size="sm" onClick={addInstalacionDoc}>
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar documento
                </Button>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => void saveInstalacionDocs()} disabled={instalacionDocsSaving} size="sm">
                  <Save className="h-4 w-4 mr-1" />
                  {instalacionDocsSaving ? "Guardando..." : "Guardar documentos"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Sección 2: Parámetros de rondas ── */}
      <Card>
        <CardContent className="pt-5 space-y-5">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Route className="h-4 w-4 text-primary" />
            Parámetros de rondas
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label>Polling monitoreo (seg)</Label>
              <Input
                type="number"
                min={10}
                max={120}
                value={config.rondasPollingSegundos ?? 30}
                onChange={(e) =>
                  setConfig((c) => c && { ...c, rondasPollingSegundos: Number(e.target.value) || 30 })
                }
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Frecuencia de actualización recomendada para monitoreo.
              </p>
            </div>
            <div>
              <Label>Ventana inicio antes (min)</Label>
              <Input
                type="number"
                min={0}
                max={360}
                value={config.rondasVentanaInicioAntesMin ?? 60}
                onChange={(e) =>
                  setConfig((c) => c && { ...c, rondasVentanaInicioAntesMin: Number(e.target.value) || 0 })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label>Ventana inicio después (min)</Label>
              <Input
                type="number"
                min={0}
                max={360}
                value={config.rondasVentanaInicioDespuesMin ?? 120}
                onChange={(e) =>
                  setConfig((c) => c && { ...c, rondasVentanaInicioDespuesMin: Number(e.target.value) || 0 })
                }
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-3 rounded border border-border px-3 py-2">
              <input
                type="checkbox"
                checked={Boolean(config.rondasRequiereFotoEvidencia)}
                onChange={(e) =>
                  setConfig((c) => c && { ...c, rondasRequiereFotoEvidencia: e.target.checked })
                }
                className="rounded border-border"
              />
              <div className="text-xs">
                <p className="font-medium flex items-center gap-1.5">
                  <Camera className="h-3.5 w-3.5" />
                  Requerir foto evidencia
                </p>
                <p className="text-muted-foreground">
                  Exige evidencia visual al marcar checkpoint.
                </p>
              </div>
            </label>
            <label className="flex items-center gap-3 rounded border border-border px-3 py-2">
              <input
                type="checkbox"
                checked={Boolean(config.rondasPermiteReemplazo)}
                onChange={(e) =>
                  setConfig((c) => c && { ...c, rondasPermiteReemplazo: e.target.checked })
                }
                className="rounded border-border"
              />
              <div className="text-xs">
                <p className="font-medium flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Permitir reemplazo de guardia
                </p>
                <p className="text-muted-foreground">
                  Autoriza inicio de ronda por guardia distinto al asignado.
                </p>
              </div>
            </label>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => void saveConfig()} disabled={saving} size="sm">
              <Save className="h-4 w-4 mr-1" />
              {saving ? "Guardando..." : "Guardar parámetros de rondas"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Sección 3: Catálogo de emails automáticos ── */}
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
                    <p className="text-xs text-muted-foreground font-medium mb-1">
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
            <Button onClick={() => void saveConfig()} disabled={saving} size="sm">
              <Save className="h-4 w-4 mr-1" />
              {saving ? "Guardando..." : "Guardar configuración"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Sección 4: Enviar emails de prueba ── */}
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
