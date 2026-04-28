"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2, ScanFace } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SHOW_PIN_IN_PROFILE } from "@/lib/guard-portal";

interface MarcacionSectionProps {
  guardiaId: string;
  marcacionPin?: string | null;
  marcacionPinVisible?: string | null;
  faceIdRegistered?: boolean;
  faceIdPhotoUrl?: string | null;
  faceIdRegisteredAt?: string | null;
  canManageGuardias: boolean;
  /** Generar/resetear PIN (incluye supervisores con plan de selección). */
  canReloadMarcacionPin?: boolean;
  onPinUpdated: (pin: string) => void;
  onFaceIdReset?: () => void;
}

export default function MarcacionSection({
  guardiaId,
  marcacionPin,
  marcacionPinVisible,
  faceIdRegistered,
  faceIdPhotoUrl,
  faceIdRegisteredAt,
  canManageGuardias,
  canReloadMarcacionPin,
  onPinUpdated,
  onFaceIdReset,
}: MarcacionSectionProps) {
  const [faceIdResetting, setFaceIdResetting] = useState(false);
  const canPinActions = canReloadMarcacionPin ?? canManageGuardias;

  const handleFaceIdReset = async () => {
    setFaceIdResetting(true);
    try {
      const res = await fetch(`/api/ops/guardias/${guardiaId}/face-id-reset`, {
        method: "POST",
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Error al resetear Face ID");
        return;
      }
      toast.success("Face ID reseteado exitosamente");
      onFaceIdReset?.();
    } catch {
      toast.error("Error de conexión");
    } finally {
      setFaceIdResetting(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Face ID */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/40 p-4 sm:p-5 transition-colors hover:bg-card/60 hover:border-border">
        <div className="flex items-center gap-3 min-w-0">
          {faceIdRegistered && faceIdPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={faceIdPhotoUrl} className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover ring-1 ring-border/60" alt="Face ID" />
          ) : (
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-muted/40 flex items-center justify-center ring-1 ring-border/40">
              <ScanFace className="h-7 w-7 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Face ID</p>
            {faceIdRegistered && faceIdRegisteredAt ? (
              <p className="text-xs text-muted-foreground mt-0.5">
                Registrado el{" "}
                {new Date(faceIdRegisteredAt).toLocaleString("es-CL", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5">No registrado</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {faceIdRegistered ? (
            <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-300">
              Activo
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              No registrado
            </span>
          )}
          {canManageGuardias && faceIdRegistered && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={handleFaceIdReset}
              disabled={faceIdResetting}
            >
              {faceIdResetting && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Resetear
            </Button>
          )}
        </div>
      </div>

      {/* PIN de marcación — estado */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/40 p-4 sm:p-5 transition-colors hover:bg-card/60 hover:border-border">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">PIN de marcación</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {marcacionPin
              ? "PIN configurado — el guardia puede marcar asistencia"
              : "Sin PIN — el guardia no puede marcar asistencia"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {marcacionPin ? (
            <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-300">
              Activo
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Sin PIN
            </span>
          )}
        </div>
      </div>

      {/* PIN activo (visible cuando aplica) */}
      <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3 sm:px-5 sm:py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">PIN activo</p>
        {SHOW_PIN_IN_PROFILE && marcacionPinVisible ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="text-2xl font-mono font-semibold tracking-[0.2em] text-foreground">{marcacionPinVisible}</p>
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
          <p className="mt-2 text-xs text-muted-foreground">
            PIN configurado pero no disponible en texto. Genera uno nuevo para verlo.
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Aún no tiene PIN activo.
          </p>
        )}
      </div>

      {canPinActions && (
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
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] p-4 sm:p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-300/90 mb-2">
            PIN generado
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-3xl font-mono font-bold tracking-[0.3em] text-emerald-100">
              {generatedPin}
            </span>
            <Button
              size="sm"
              variant="secondary"
              className="bg-emerald-600 hover:bg-emerald-500 text-white border-0"
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
