"use client";

import Link from "next/link";
import { AlertTriangle, Loader2, RefreshCw, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ProtocolSection } from "./types";

const IA_CONFIG_HREF = "/opai/configuracion/inteligencia-artificial";

/* ─── Notice: IA todavía no configurada ─── */

export function AiNotice() {
  return (
    <div className="rounded-xl border border-status-warn-border bg-amber-500/[0.06] p-3 text-xs leading-relaxed text-amber-200/90">
      <div className="flex items-start gap-2">
        <Sparkles className="h-4 w-4 mt-0.5 shrink-0 text-status-warn-fg" />
        <div>
          Para usar IA, configura un proveedor en{" "}
          <Link
            href={IA_CONFIG_HREF}
            className="underline font-medium text-amber-100 hover:text-white"
          >
            Configuración → Inteligencia Artificial
          </Link>
          .
        </div>
      </div>
    </div>
  );
}

/* ─── Loading overlay grande para wizards ─── */

export function AiLoadingOverlay({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 px-4 text-center">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl" />
        <Loader2 className="relative h-8 w-8 animate-spin text-primary" />
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

/* ─── Bloque de error de IA + retry ─── */

type AiErrorProps = {
  error: string;
  onRetry: () => void;
  onBack?: () => void;
};

export function AiErrorBlock({ error, onRetry, onBack }: AiErrorProps) {
  if (error === "NO_AI_CONFIGURED") {
    return (
      <div className="rounded-xl border border-status-danger-border bg-red-500/[0.06] p-4 space-y-2">
        <div className="flex items-center gap-2 text-status-danger-fg text-sm font-medium">
          <AlertTriangle className="h-4 w-4" />
          IA no configurada
        </div>
        <p className="text-sm text-red-300/80">
          Configura un proveedor de IA en{" "}
          <Link
            href={IA_CONFIG_HREF}
            className="underline hover:text-red-200"
          >
            Configuración → Inteligencia Artificial
          </Link>
          .
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-status-danger-border bg-red-500/[0.06] p-4 space-y-3">
      <div className="flex items-center gap-2 text-status-danger-fg text-sm font-medium">
        <AlertTriangle className="h-4 w-4" />
        {error}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          Reintentar
        </Button>
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack}>
            ← Volver al inicio
          </Button>
        )}
      </div>
    </div>
  );
}

/* ─── Preview editable de secciones (post-generación IA/PDF) ─── */

type SectionsPreviewProps = {
  sections: ProtocolSection[];
  onSave: () => void;
  onRegenerate?: () => void;
  saving?: boolean;
};

export function SectionsPreview({
  sections,
  onSave,
  onRegenerate,
  saving,
}: SectionsPreviewProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {sections.map((s) => (
          <Card key={s.id || s.title} className="bg-card/60 border-border/60">
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="text-base">{s.icon}</span>
                <span className="truncate">{s.title}</span>
                <Badge
                  variant="secondary"
                  className="ml-auto text-[10px] shrink-0"
                >
                  {s.items.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <ul className="space-y-1">
                {s.items.slice(0, 4).map((item) => (
                  <li
                    key={item.id || item.title}
                    className="text-xs text-muted-foreground line-clamp-1"
                  >
                    <span className="text-foreground">•</span> {item.title}
                  </li>
                ))}
                {s.items.length > 4 && (
                  <li className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                    +{s.items.length - 4} más
                  </li>
                )}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        {onRegenerate && (
          <Button variant="outline" size="sm" onClick={onRegenerate}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Regenerar
          </Button>
        )}
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5 mr-1" />
          )}
          Guardar protocolo
        </Button>
      </div>
    </div>
  );
}
