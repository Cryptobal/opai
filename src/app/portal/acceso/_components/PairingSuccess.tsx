"use client";

import { CheckCircle2, Building2 } from "lucide-react";

interface PairingSuccessProps {
  installationName: string;
  installationAddress: string;
  onContinue: () => void;
}

export function PairingSuccess({
  installationName,
  installationAddress,
  onContinue,
}: PairingSuccessProps) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-card opai-glass-soft-m px-6">
      <div className="flex flex-col items-center max-w-sm w-full">
        {/* Green checkmark */}
        <CheckCircle2 className="h-20 w-20 text-status-ok-fg mb-6" />

        {/* Title */}
        <h1 className="text-2xl font-bold text-foreground mb-2">
          Dispositivo vinculado
        </h1>

        {/* Subtitle */}
        <p className="text-sm text-muted-foreground mb-8">
          Este dispositivo está ahora asociado a:
        </p>

        {/* Installation info */}
        <div className="w-full rounded-xl border border-border bg-muted opai-glass-soft-m px-5 py-4 mb-10">
          <div className="flex items-start gap-3">
            <Building2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-foreground">{installationName}</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {installationAddress}
              </p>
            </div>
          </div>
        </div>

        {/* Continue button */}
        <button
          type="button"
          onClick={onContinue}
          className="flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:brightness-110 active:brightness-95"
        >
          COMENZAR
        </button>
      </div>
    </div>
  );
}
