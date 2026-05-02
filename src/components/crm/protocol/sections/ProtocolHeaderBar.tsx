"use client";

import { CheckCircle2, Loader2, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProtocolData } from "./types";

type Props = {
  protocol: ProtocolData;
  publishing: boolean;
  onPublish: () => void;
  onRecreate: () => void;
};

export function ProtocolHeaderBar({
  protocol,
  publishing,
  onPublish,
  onRecreate,
}: Props) {
  const { sectionCount, itemCount } = protocol.stats;
  const version = protocol.latestVersion;
  const isPublished = version?.status === "published";

  return (
    <div className="sticky top-0 z-10 -mx-1 mb-3 rounded-2xl border border-border/60 bg-card/80 px-3 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="flex flex-wrap items-center gap-2">
        {/* Estado / KPIs */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {isPublished ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-status-ok-border bg-status-ok-soft px-2 py-0.5 font-medium text-status-ok-fg">
              <CheckCircle2 className="h-3 w-3" />
              Publicado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-status-warn-border bg-status-warn-soft px-2 py-0.5 font-medium text-status-warn-fg">
              Borrador
            </span>
          )}

          {version && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              v{version.versionNumber}
            </span>
          )}

          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/40 px-2 py-0.5 text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground tabular-nums">
              {sectionCount}
            </span>{" "}
            secciones
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/40 px-2 py-0.5 text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground tabular-nums">
              {itemCount}
            </span>{" "}
            ítems
          </span>
        </div>

        {/* Acciones */}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRecreate}
            className="h-8"
          >
            <RefreshCw className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">Recrear</span>
          </Button>
          <Button
            size="sm"
            onClick={onPublish}
            disabled={publishing}
            className="h-8"
          >
            {publishing ? (
              <Loader2 className="h-3.5 w-3.5 sm:mr-1 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5 sm:mr-1" />
            )}
            <span className="hidden sm:inline">Publicar</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
