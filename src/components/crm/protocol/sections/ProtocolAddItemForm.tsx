"use client";

import { Loader2, Plus, RefreshCw, Save, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AiNotice } from "./AiHelpers";

type ManualProps = {
  newItemTitle: string;
  setNewItemTitle: (v: string) => void;
  newItemDesc: string;
  setNewItemDesc: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export function ProtocolAddItemManual({
  newItemTitle,
  setNewItemTitle,
  newItemDesc,
  setNewItemDesc,
  onSubmit,
  onCancel,
}: ManualProps) {
  return (
    <div className="rounded-lg border border-border/70 bg-card/40 p-2.5 space-y-2">
      <Input
        autoFocus
        value={newItemTitle}
        onChange={(e) => setNewItemTitle(e.target.value)}
        placeholder="Título del ítem"
        className="h-8 text-sm"
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit();
          if (e.key === "Escape") onCancel();
        }}
      />
      <Textarea
        value={newItemDesc}
        onChange={(e) => setNewItemDesc(e.target.value)}
        placeholder="Descripción (opcional)"
        rows={2}
        className="text-sm"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={onSubmit}
          disabled={!newItemTitle.trim()}
        >
          <Plus className="h-3 w-3 mr-1" />
          Agregar
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={onCancel}
        >
          <X className="h-3 w-3 mr-1" />
          Cancelar
        </Button>
      </div>
    </div>
  );
}

type AiProps = {
  aiAvailable: boolean | null;
  generating: boolean;
  result: { title: string; description: string } | null;
  desc: string;
  setDesc: (v: string) => void;
  onGenerate: () => void;
  onRegenerate: () => void;
  onSave: () => void;
  onCancel: () => void;
};

export function ProtocolAddItemAi({
  aiAvailable,
  generating,
  result,
  desc,
  setDesc,
  onGenerate,
  onRegenerate,
  onSave,
  onCancel,
}: AiProps) {
  return (
    <div className="rounded-lg border border-status-ok-border bg-status-ok-soft/30 p-2.5 space-y-2">
      {generating ? (
        <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-status-ok-fg" />
          Generando ítem...
        </div>
      ) : result ? (
        <div className="space-y-2">
          <div className="text-sm">
            <p className="font-medium text-foreground">{result.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
              {result.description}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={onRegenerate}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Regenerar
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={onSave}>
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
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Describe qué tipo de ítem necesitas..."
            className="h-8 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") onGenerate();
              if (e.key === "Escape") onCancel();
            }}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={onGenerate}
              disabled={!desc.trim() || aiAvailable === false}
            >
              <Sparkles className="h-3 w-3 mr-1" />
              Generar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={onCancel}
            >
              <X className="h-3 w-3 mr-1" />
              Cancelar
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
