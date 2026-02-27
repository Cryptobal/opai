"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Plus, Save, Trash2 } from "lucide-react";
import type { PostulacionDocItem, GuardiaDocConfigItem } from "@/components/ops/OpsConfigTabs";

interface OpsDocsGuardiasTabProps {
  postulacionDocs: PostulacionDocItem[];
  setPostulacionDocs: React.Dispatch<React.SetStateAction<PostulacionDocItem[]>>;
  postulacionDocsLoading: boolean;
  guardiaDocConfig: GuardiaDocConfigItem[];
  setGuardiaDocConfig: React.Dispatch<React.SetStateAction<GuardiaDocConfigItem[]>>;
  guardiaDocConfigLoading: boolean;
}

export function OpsDocsGuardiasTab({
  postulacionDocs,
  setPostulacionDocs,
  postulacionDocsLoading,
  guardiaDocConfig,
  setGuardiaDocConfig,
  guardiaDocConfigLoading,
}: OpsDocsGuardiasTabProps) {
  const [newDocLabel, setNewDocLabel] = useState("");
  const [postulacionDocsSaving, setPostulacionDocsSaving] = useState(false);
  const [guardiaDocConfigSaving, setGuardiaDocConfigSaving] = useState(false);

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
      prev.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    );
  };

  const removePostulacionDoc = (index: number) => {
    setPostulacionDocs((prev) => prev.filter((_, i) => i !== index));
  };

  const updateGuardiaDocConfigItem = (index: number, patch: Partial<GuardiaDocConfigItem>) => {
    setGuardiaDocConfig((prev) =>
      prev.map((d, i) => (i === index ? { ...d, ...patch } : d)),
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

  return (
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
  );
}
