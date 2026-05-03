"use client";

import { useRef, useState } from "react";
import { FileText, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AiErrorBlock, AiLoadingOverlay, AiNotice, SectionsPreview } from "./AiHelpers";
import type { ProtocolSection } from "./types";

type Props = {
  aiAvailable: boolean | null;
  extracting: boolean;
  error: string | null;
  result: ProtocolSection[] | null;
  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  onBack: () => void;
  onExtract: () => void;
  onClearResult: () => void;
  onSave: (sections: ProtocolSection[]) => void;
};

export function ProtocolWizardPdf({
  aiAvailable,
  extracting,
  error,
  result,
  files,
  setFiles,
  onBack,
  onExtract,
  onClearResult,
  onSave,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <section className="mx-auto max-w-2xl px-4 py-6">
      <header className="mb-5 flex items-center gap-2">
        <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-status-warn-soft text-status-warn-fg">
          <FileText className="h-4 w-4" />
        </div>
        <div>
          <h3 className="font-display text-base font-semibold text-foreground">
            Extraer protocolo desde PDF
          </h3>
          <p className="text-xs text-muted-foreground">
            Sube uno o varios PDFs y la IA construirá las secciones.
          </p>
        </div>
      </header>

      {aiAvailable === false && !error && (
        <div className="mb-4">
          <AiNotice />
        </div>
      )}

      {extracting ? (
        <AiLoadingOverlay message="Extrayendo protocolo del PDF..." />
      ) : error ? (
        <AiErrorBlock error={error} onRetry={onExtract} onBack={onBack} />
      ) : result ? (
        <SectionsPreview
          sections={result}
          onSave={() => onSave(result)}
          onRegenerate={onClearResult}
        />
      ) : (
        <div className="space-y-4">
          {/* Drop zone */}
          <div
            className={`relative rounded-2xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${
              dragOver
                ? "border-primary bg-primary/5"
                : "border-border bg-muted/20 hover:border-muted-foreground/40"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const accepted = Array.from(e.dataTransfer.files).filter(
                (f) => f.type === "application/pdf",
              );
              if (accepted.length === 0) {
                toast.error("Solo se permiten archivos PDF");
                return;
              }
              setFiles((prev) => [...prev, ...accepted]);
            }}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              Arrastra PDFs aquí o haz clic para seleccionar
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Solo archivos PDF
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                }
                e.target.value = "";
              }}
            />
          </div>

          {/* Lista de archivos */}
          {files.length > 0 && (
            <div className="space-y-1.5">
              {files.map((f, i) => (
                <div
                  key={`${f.name}-${i}`}
                  className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/50 px-3 py-2 text-sm"
                >
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="break-all text-foreground min-w-0">{f.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0 ml-auto">
                    {(f.size / 1024).toFixed(0)} KB
                  </span>
                  <button
                    type="button"
                    aria-label="Quitar archivo"
                    className="text-muted-foreground hover:text-status-danger-fg transition-colors"
                    onClick={() =>
                      setFiles((prev) => prev.filter((_, idx) => idx !== i))
                    }
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onBack}>
              ← Volver
            </Button>
            <Button
              size="sm"
              onClick={onExtract}
              disabled={files.length === 0 || aiAvailable === false}
            >
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              Extraer protocolo
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
