"use client";

import { Loader2, Plus, RefreshCw, Save, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AiNotice } from "./AiHelpers";
import type { ProtocolSection } from "./types";

type AddSectionMode = "manual" | "ai" | null;

type Props = {
  mode: AddSectionMode;
  onSetMode: (m: AddSectionMode) => void;

  // Manual
  newSectionTitle: string;
  newSectionIcon: string;
  setNewSectionTitle: (v: string) => void;
  setNewSectionIcon: (v: string) => void;
  onCreate: () => void;

  // IA
  aiAvailable: boolean | null;
  aiSectionDesc: string;
  setAiSectionDesc: (v: string) => void;
  aiSectionGenerating: boolean;
  aiSectionResult: ProtocolSection | null;
  onAiGenerate: () => void;
  onAiRegenerate: () => void;
  onAiSave: () => void;
};

export function ProtocolAddSection({
  mode,
  onSetMode,
  newSectionTitle,
  newSectionIcon,
  setNewSectionTitle,
  setNewSectionIcon,
  onCreate,
  aiAvailable,
  aiSectionDesc,
  setAiSectionDesc,
  aiSectionGenerating,
  aiSectionResult,
  onAiGenerate,
  onAiRegenerate,
  onAiSave,
}: Props) {
  /* Sin estado expandido: muestra dos pills de "Agregar" */
  if (!mode) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="border-dashed"
          onClick={() => onSetMode("manual")}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Agregar sección
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="border-dashed text-status-ok-fg hover:text-status-ok-fg"
          onClick={() => onSetMode("ai")}
        >
          <Sparkles className="h-3.5 w-3.5 mr-1.5" />
          Con IA
        </Button>
      </div>
    );
  }

  if (mode === "manual") {
    return (
      <Card className="border-dashed border-border/70 bg-card/40">
        <CardContent className="p-3 space-y-2">
          <div className="flex gap-2">
            <Input
              value={newSectionIcon}
              onChange={(e) => setNewSectionIcon(e.target.value)}
              className="w-14 h-9 text-center text-sm"
              placeholder="📋"
              aria-label="Icono"
            />
            <Input
              autoFocus
              value={newSectionTitle}
              onChange={(e) => setNewSectionTitle(e.target.value)}
              placeholder="Nombre de la sección"
              className="h-9 text-sm flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") onCreate();
                if (e.key === "Escape") onSetMode(null);
              }}
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={onCreate}
              disabled={!newSectionTitle.trim()}
            >
              <Plus className="h-3 w-3 mr-1" />
              Crear
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => onSetMode(null)}
            >
              <X className="h-3 w-3 mr-1" />
              Cancelar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // IA
  return (
    <Card className="border-dashed border-status-ok-border bg-status-ok-soft/30">
      <CardContent className="p-3 space-y-2">
        {aiSectionGenerating ? (
          <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-status-ok-fg" />
            Generando sección...
          </div>
        ) : aiSectionResult ? (
          <div className="space-y-2">
            <div className="text-sm font-semibold text-foreground">
              {aiSectionResult.icon} {aiSectionResult.title}
            </div>
            {aiSectionResult.items?.length > 0 && (
              <ul className="ml-4 list-disc space-y-0.5 text-xs text-muted-foreground">
                {aiSectionResult.items.map((it) => (
                  <li key={it.id || it.title}>{it.title}</li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={onAiRegenerate}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Regenerar
              </Button>
              <Button size="sm" className="h-7 text-xs" onClick={onAiSave}>
                <Save className="h-3 w-3 mr-1" />
                Agregar
              </Button>
            </div>
          </div>
        ) : (
          <>
            {aiAvailable === false && <AiNotice />}
            <Input
              autoFocus
              value={aiSectionDesc}
              onChange={(e) => setAiSectionDesc(e.target.value)}
              placeholder="Describe qué sección necesitas..."
              className="h-9 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") onAiGenerate();
                if (e.key === "Escape") onSetMode(null);
              }}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={onAiGenerate}
                disabled={!aiSectionDesc.trim() || aiAvailable === false}
              >
                <Sparkles className="h-3 w-3 mr-1" />
                Generar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => onSetMode(null)}
              >
                <X className="h-3 w-3 mr-1" />
                Cancelar
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
