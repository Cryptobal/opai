"use client";

/**
 * Contenido AI global de la propuesta: reinicia el contenido cacheado del PDF
 * consolidado para que se regenere con los textos actuales de cada instalación.
 * El contenido AI por instalación se edita en el tab de cada una.
 */

import { useState } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Surface } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import type { BundleDetail } from "@/components/cpq/bundle/useBundle";

export function BundleAiSection({
  bundle,
  onOpenInstall,
}: {
  bundle: BundleDetail;
  onOpenInstall: (quoteId: string) => void;
}) {
  const [resetting, setResetting] = useState(false);

  const reset = async () => {
    setResetting(true);
    try {
      const res = await fetch(`/api/cpq/bundles/${bundle.id}/proposal-ai`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error || "No se pudo reiniciar el contenido IA");
        return;
      }
      toast.success("Contenido IA reiniciado. Se regenerará al previsualizar el PDF.");
    } finally {
      setResetting(false);
    }
  };

  return (
    <Surface elevation={1} padding="md" className="space-y-3" id="sec-ai-bundle">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-ds-text-3" />
          <h2 className="font-display text-base text-foreground">Contenido AI</h2>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-10 sm:h-9 gap-1.5 text-xs"
          onClick={() => void reset()}
          disabled={resetting}
        >
          {resetting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {resetting ? "Regenerando…" : "Regenerar propuesta"}
        </Button>
      </div>
      <p className="text-[13px] text-ds-text-3">
        La narrativa del PDF consolidado se edita en Propuesta técnica consolidada
        (arriba). Acá reiniciás el cache del documento para forzar una regeneración
        al previsualizar.
      </p>
      <ul className="ds-list-cascade space-y-1.5">
        {bundle.quotes.map((m) => (
          <li key={m.quoteId}>
            <button
              type="button"
              onClick={() => onOpenInstall(m.quoteId)}
              className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-lg border border-ds-border-subtle px-3 py-2 text-left transition-colors hover:bg-ds-surface-2/60"
            >
              <span className="min-w-0">
                <span className="block truncate text-[13px] text-foreground">
                  {m.quote.installation?.name || m.quote.code}
                </span>
                <span className="block font-mono text-[12px] text-ds-text-3">
                  {m.quote.code}
                </span>
              </span>
              <span className="shrink-0 text-[12px] text-primary">Editar AI →</span>
            </button>
          </li>
        ))}
      </ul>
    </Surface>
  );
}
