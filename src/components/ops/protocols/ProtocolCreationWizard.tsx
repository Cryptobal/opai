"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  BookOpen,
  FileUp,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────

type CreationMode = "select" | "manual" | "ai" | "pdf";

const INSTALLATION_TYPES = [
  { value: "condominio", label: "Condominio" },
  { value: "edificio_corporativo", label: "Edificio Corporativo" },
  { value: "mall_retail", label: "Mall / Retail" },
  { value: "bodega_industria", label: "Bodega / Industria" },
  { value: "obra_construccion", label: "Obra en Construcción" },
  { value: "educacional", label: "Educacional" },
];

interface ProtocolCreationWizardProps {
  installationId: string;
  onComplete: () => void;
}

// ─── Component ───────────────────────────────────────────────

export function ProtocolCreationWizard({
  installationId,
  onComplete,
}: ProtocolCreationWizardProps) {
  const [mode, setMode] = useState<CreationMode>("select");
  const [loading, setLoading] = useState(false);

  // AI mode state
  const [installationType, setInstallationType] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");

  // PDF mode state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // ─── AI Generate ───────────────────────────────────────────

  const handleAiGenerate = async () => {
    if (!installationType) {
      toast.error("Selecciona un tipo de instalación");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/ops/protocols/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installationId,
          installationType,
          additionalContext: additionalContext || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Protocolo generado con IA exitosamente");
        onComplete();
      } else {
        toast.error(json.error);
      }
    } catch {
      toast.error("Error al generar protocolo");
    } finally {
      setLoading(false);
    }
  };

  // ─── PDF Upload ────────────────────────────────────────────

  const handlePdfUpload = async () => {
    if (!selectedFile) {
      toast.error("Selecciona un archivo PDF");
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("installationId", installationId);

      const res = await fetch("/api/ops/protocols/ai-from-pdf", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Protocolo extraído del PDF exitosamente");
        onComplete();
      } else {
        toast.error(json.error);
      }
    } catch {
      toast.error("Error al procesar PDF");
    } finally {
      setLoading(false);
    }
  };

  // ─── Mode selection ────────────────────────────────────────

  if (mode === "select") {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Crear protocolo de seguridad</h3>
        <p className="text-xs text-muted-foreground">
          Elige cómo quieres crear el protocolo para esta instalación.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          {/* Manual */}
          <button
            onClick={() => {
              setMode("manual");
              onComplete(); // Go straight to editor (empty state)
            }}
            className={cn(
              "flex flex-col items-center gap-2 p-4 rounded-lg border",
              "hover:border-foreground/30 hover:bg-muted/50 transition-colors text-left",
            )}
          >
            <BookOpen className="h-6 w-6 text-muted-foreground" />
            <span className="text-sm font-medium">Manual</span>
            <span className="text-xs text-muted-foreground text-center">
              Crea secciones e ítems uno a uno
            </span>
          </button>

          {/* AI */}
          <button
            onClick={() => setMode("ai")}
            className={cn(
              "flex flex-col items-center gap-2 p-4 rounded-lg border",
              "hover:border-foreground/30 hover:bg-muted/50 transition-colors text-left",
              "border-primary/30 bg-primary/5",
            )}
          >
            <Sparkles className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium">Generar con IA</span>
            <span className="text-xs text-muted-foreground text-center">
              Genera un protocolo completo según el tipo de instalación
            </span>
          </button>

          {/* PDF */}
          <button
            onClick={() => setMode("pdf")}
            className={cn(
              "flex flex-col items-center gap-2 p-4 rounded-lg border",
              "hover:border-foreground/30 hover:bg-muted/50 transition-colors text-left",
            )}
          >
            <FileUp className="h-6 w-6 text-muted-foreground" />
            <span className="text-sm font-medium">Desde PDF</span>
            <span className="text-xs text-muted-foreground text-center">
              Extrae el protocolo de un documento existente
            </span>
          </button>
        </div>
      </div>
    );
  }

  // ─── AI mode ───────────────────────────────────────────────

  if (mode === "ai") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setMode("select")} disabled={loading}>
            Volver
          </Button>
          <h3 className="text-sm font-semibold">Generar protocolo con IA</h3>
        </div>

        <div className="space-y-3 max-w-md">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Tipo de instalación
            </label>
            <Select value={installationType} onValueChange={setInstallationType}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona tipo..." />
              </SelectTrigger>
              <SelectContent>
                {INSTALLATION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Contexto adicional (opcional)
            </label>
            <textarea
              value={additionalContext}
              onChange={(e) => setAdditionalContext(e.target.value)}
              placeholder="Ej: Tiene 3 accesos vehiculares, estacionamiento subterráneo, 2 torres..."
              className="w-full border rounded-md px-3 py-2 text-sm min-h-[80px] resize-y bg-background"
            />
          </div>

          <Button onClick={handleAiGenerate} disabled={loading || !installationType}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Generando protocolo...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generar protocolo
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ─── PDF mode ──────────────────────────────────────────────

  if (mode === "pdf") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setMode("select")} disabled={loading}>
            Volver
          </Button>
          <h3 className="text-sm font-semibold">Extraer protocolo de PDF</h3>
        </div>

        <div className="space-y-3 max-w-md">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Archivo PDF
            </label>
            <Input
              type="file"
              accept=".pdf,application/pdf"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
            {selectedFile && (
              <p className="text-xs text-muted-foreground mt-1">
                {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(1)} MB)
              </p>
            )}
          </div>

          <Button onClick={handlePdfUpload} disabled={loading || !selectedFile}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Procesando PDF...
              </>
            ) : (
              <>
                <FileUp className="h-4 w-4 mr-2" />
                Extraer protocolo
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
