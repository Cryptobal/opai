"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MarcacionSectionProps {
  guardiaId: string;
  marcacionPin?: string | null;
  marcacionPinVisible?: string | null;
  canManageGuardias: boolean;
  onPinUpdated: (pin: string) => void;
}

export default function MarcacionSection({
  guardiaId,
  marcacionPin,
  marcacionPinVisible,
  canManageGuardias,
  onPinUpdated,
}: MarcacionSectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
        <div>
          <p className="text-sm font-medium">PIN de marcación</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {marcacionPin
              ? "PIN configurado — el guardia puede marcar asistencia"
              : "Sin PIN — el guardia no puede marcar asistencia"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {marcacionPin && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
              Activo
            </span>
          )}
          {!marcacionPin && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
              Sin PIN
            </span>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background px-4 py-3">
        <p className="text-xs text-muted-foreground">PIN activo</p>
        {marcacionPinVisible ? (
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-2xl font-mono font-semibold tracking-[0.2em]">{marcacionPinVisible}</p>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => {
                void navigator.clipboard.writeText(marcacionPinVisible || "");
                toast.success("PIN copiado");
              }}
            >
              <Copy className="mr-1 h-3 w-3" />
              Copiar PIN
            </Button>
          </div>
        ) : marcacionPin ? (
          <p className="mt-2 text-xs text-amber-600">
            Este guardia tiene PIN activo, pero no está visible en ficha. Usa "Resetear PIN" para dejarlo visible.
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Aún no tiene PIN activo.
          </p>
        )}
      </div>

      {canManageGuardias && (
        <MarcacionPinSection
          guardiaId={guardiaId}
          hasPin={!!marcacionPin}
          onPinUpdated={onPinUpdated}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub-componente: Gestión de PIN de marcación
// ─────────────────────────────────────────────

function MarcacionPinSection({
  guardiaId,
  hasPin,
  onPinUpdated,
}: {
  guardiaId: string;
  hasPin: boolean;
  onPinUpdated: (pin: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [generatedPin, setGeneratedPin] = useState<string | null>(null);
  const [pinConfigured, setPinConfigured] = useState(hasPin);

  const handleGeneratePin = async () => {
    setLoading(true);
    setGeneratedPin(null);
    try {
      const res = await fetch("/api/ops/marcacion/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guardiaId }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Error al generar PIN");
        return;
      }
      setGeneratedPin(data.data.pin);
      setPinConfigured(true);
      onPinUpdated(data.data.pin);
      toast.success(pinConfigured ? "PIN reseteado exitosamente" : "PIN generado exitosamente");
    } catch {
      toast.error("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPin = () => {
    if (generatedPin) {
      navigator.clipboard.writeText(generatedPin);
      toast.success("PIN copiado al portapapeles");
    }
  };

  return (
    <div className="space-y-3">
      {generatedPin && (
        <div className="p-4 bg-emerald-950/50 border border-emerald-700/50 rounded-lg dark:bg-emerald-900/20 dark:border-emerald-600/50">
          <p className="text-sm font-medium text-emerald-200 mb-2">
            PIN generado (queda registrado en el sistema para marcación):
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-3xl font-mono font-bold tracking-[0.3em] text-emerald-100">
              {generatedPin}
            </span>
            <Button
              size="sm"
              variant="secondary"
              className="bg-emerald-700 hover:bg-emerald-600 text-white border-0"
              onClick={handleCopyPin}
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copiar
            </Button>
          </div>
          <p className="text-xs text-emerald-300/90 mt-2">
            PIN actualizado. También queda visible en la ficha para consulta operativa.
          </p>
        </div>
      )}

      <Button
        size="sm"
        variant={pinConfigured ? "outline" : "default"}
        onClick={handleGeneratePin}
        disabled={loading}
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        <KeyRound className="mr-1.5 h-4 w-4" />
        {pinConfigured ? "Resetear PIN" : "Generar PIN"}
      </Button>
    </div>
  );
}
