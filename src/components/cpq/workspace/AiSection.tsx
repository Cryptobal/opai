"use client";

/**
 * Sección Contenido AI: descripción + detalle de servicio con generación IA
 * (extraída de CpqQuoteDetail sin cambio visual).
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { SectionCard } from "./SectionCard";

export function AiSection({
  open,
  onToggle,
  isLocked,
  aiDescription,
  serviceDetail,
  onAiDescriptionChange,
  onServiceDetailChange,
  aiCustomInstruction,
  setAiCustomInstruction,
  serviceDetailInstruction,
  setServiceDetailInstruction,
  generatingAi,
  generatingServiceDetail,
  onGenerateAiDescription,
  onGenerateServiceDetail,
  regeneratingProposalAi,
  onRegenerateProposalAi,
}: {
  open: boolean;
  onToggle: () => void;
  isLocked: boolean;
  aiDescription: string | null;
  serviceDetail: string | null;
  onAiDescriptionChange: (value: string) => void;
  onServiceDetailChange: (value: string) => void;
  aiCustomInstruction: string;
  setAiCustomInstruction: (value: string) => void;
  serviceDetailInstruction: string;
  setServiceDetailInstruction: (value: string) => void;
  generatingAi: boolean;
  generatingServiceDetail: boolean;
  onGenerateAiDescription: () => void;
  onGenerateServiceDetail: () => void;
  regeneratingProposalAi: boolean;
  onRegenerateProposalAi: () => void;
}) {
  return (
    <SectionCard
      id="sec-ai"
      title="Contenido AI"
      icon={<Sparkles className="h-4 w-4 text-muted-foreground shrink-0" />}
      open={open}
      onToggle={onToggle}
      cardClassName="overflow-hidden scroll-mt-[calc(var(--app-island-bottom)+var(--cpq-sticky-h))] lg:scroll-mt-32"
      bodyClassName="grid gap-4 bg-card/60 px-3 pb-3 pt-3 sm:px-4 sm:pb-4 sm:pt-4 lg:grid-cols-2"
      bodyInert={isLocked}
      summary={
        <span className="text-xs text-muted-foreground break-words">
          {aiDescription ? "Descripción generada" : "Sin descripción"}
        </span>
      }
    >
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Descripción AI
        </Label>
        <div className="flex items-center gap-2">
          <Input
            value={aiCustomInstruction}
            onChange={(e) => setAiCustomInstruction(e.target.value)}
            placeholder="Instrucción AI (opcional)"
            className="h-8 flex-1 border-border/60 bg-muted/20 text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 text-xs shrink-0"
            onClick={onGenerateAiDescription}
            disabled={generatingAi}
          >
            {generatingAi ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {generatingAi ? "..." : "Generar"}
          </Button>
        </div>
        <textarea
          value={aiDescription ?? ""}
          onChange={(e) => onAiDescriptionChange(e.target.value)}
          placeholder="Clic en 'Generar' para crear una descripción profesional..."
          className="w-full min-h-[160px] rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          rows={8}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Detalle servicio
        </Label>
        <div className="flex items-center gap-2">
          <Input
            value={serviceDetailInstruction}
            onChange={(e) => setServiceDetailInstruction(e.target.value)}
            placeholder="Instrucción AI (opcional)"
            className="h-8 flex-1 border-border/60 bg-muted/20 text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 text-xs shrink-0"
            onClick={onGenerateServiceDetail}
            disabled={generatingServiceDetail}
          >
            {generatingServiceDetail ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {generatingServiceDetail ? "..." : "Generar"}
          </Button>
        </div>
        <textarea
          value={serviceDetail ?? ""}
          onChange={(e) => onServiceDetailChange(e.target.value)}
          placeholder="Clic en 'Generar' para detalle de servicios..."
          className="w-full min-h-[160px] rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          rows={8}
        />
      </div>

      <div className="lg:col-span-2 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between rounded-md border border-dashed border-border/60 bg-muted/10 px-3 py-2">
        <p className="text-[11px] text-muted-foreground">
          La Propuesta Técnica usa estos textos como base. Si los editás, se regenera sola; o forzá la regeneración ahora.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1 text-xs shrink-0"
          onClick={onRegenerateProposalAi}
          disabled={regeneratingProposalAi}
        >
          {regeneratingProposalAi ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {regeneratingProposalAi ? "Regenerando..." : "Regenerar propuesta"}
        </Button>
      </div>
    </SectionCard>
  );
}
