"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AiErrorBlock, AiLoadingOverlay, AiNotice, SectionsPreview } from "./AiHelpers";
import { INSTALLATION_TYPES, type ProtocolSection } from "./types";

type Props = {
  aiAvailable: boolean | null;
  generating: boolean;
  error: string | null;
  result: ProtocolSection[] | null;
  installationType: string;
  setInstallationType: (v: string) => void;
  context: string;
  setContext: (v: string) => void;
  onBack: () => void;
  onGenerate: () => void;
  onRegenerate: () => void;
  onSave: (sections: ProtocolSection[]) => void;
};

export function ProtocolWizardAi({
  aiAvailable,
  generating,
  error,
  result,
  installationType,
  setInstallationType,
  context,
  setContext,
  onBack,
  onGenerate,
  onRegenerate,
  onSave,
}: Props) {
  return (
    <section className="mx-auto max-w-2xl px-4 py-6">
      <header className="mb-5 flex items-center gap-2">
        <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <h3 className="font-display text-base font-semibold text-foreground">
            Generar protocolo con IA
          </h3>
          <p className="text-xs text-muted-foreground">
            Indica el tipo de instalación y deja que la IA arme la base.
          </p>
        </div>
      </header>

      {aiAvailable === false && !error && (
        <div className="mb-4">
          <AiNotice />
        </div>
      )}

      {generating ? (
        <AiLoadingOverlay message="Generando protocolo con IA..." />
      ) : error ? (
        <AiErrorBlock error={error} onRetry={onGenerate} onBack={onBack} />
      ) : result ? (
        <SectionsPreview
          sections={result}
          onSave={() => onSave(result)}
          onRegenerate={onRegenerate}
        />
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Tipo de instalación
            </Label>
            <Select value={installationType} onValueChange={setInstallationType}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar tipo..." />
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

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Contexto adicional <span className="lowercase opacity-60">(opcional)</span>
            </Label>
            <Textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Ej: Bodega con áreas de despacho 24/7, control de acceso vehicular, sin guardias armados..."
              rows={3}
            />
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onBack}>
              ← Volver
            </Button>
            <Button
              size="sm"
              onClick={onGenerate}
              disabled={!installationType || aiAvailable === false}
            >
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              Generar protocolo
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
