"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Plus, Save, Trash2 } from "lucide-react";
import type { InstalacionDocItem } from "@/components/ops/OpsConfigTabs";

interface OpsDocsInstalacionTabProps {
  instalacionDocs: InstalacionDocItem[];
  setInstalacionDocs: React.Dispatch<React.SetStateAction<InstalacionDocItem[]>>;
  instalacionDocsLoading: boolean;
}

export function OpsDocsInstalacionTab({
  instalacionDocs,
  setInstalacionDocs,
  instalacionDocsLoading,
}: OpsDocsInstalacionTabProps) {
  const [newInstalacionDocLabel, setNewInstalacionDocLabel] = useState("");
  const [instalacionDocsSaving, setInstalacionDocsSaving] = useState(false);

  const slugFromLabel = (label: string) =>
    label
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");

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
      prev.map((d, i) => (i === index ? { ...d, ...patch } : d)),
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

  return (
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
  );
}
