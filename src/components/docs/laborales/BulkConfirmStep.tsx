"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/opai-ds";

export function BulkConfirmStep({
  count,
  skipped,
  working,
  progress,
  onBack,
  onConfirm,
}: {
  count: number;
  skipped: number;
  working: boolean;
  progress: { processed: number; remaining: number } | null;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const total = progress ? progress.processed + progress.remaining : count;
  const pct = total > 0 && progress ? Math.round((progress.processed / total) * 100) : 0;

  return (
    <Surface elevation={1} padding="md" className="space-y-3">
      <p className="font-medium">3. Confirmar envío</p>
      <p className="text-[13px] text-ds-text-2">
        Se enviarán <strong>{count}</strong> documentos. Excluidos / sin contacto: {skipped}.
      </p>
      <p className="text-[13px] text-status-warn-fg">
        Si un guardia ya tiene una versión firmada, se crea una nueva. Las firmas en curso se omiten.
      </p>
      {progress && (
        <div className="space-y-1">
          <div className="h-2 rounded-full bg-ds-surface-3">
            <div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[12px] text-ds-text-3">Procesados {progress.processed} · Restantes {progress.remaining}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="min-h-11" disabled={working} onClick={onBack}>Atrás</Button>
        <Button className="min-h-11" disabled={working || count === 0} onClick={onConfirm}>
          {working ? "Enviando…" : `Enviar ${count} documentos`}
        </Button>
        {progress && progress.remaining === 0 && (
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/opai/documentos/laborales/seguimiento">Ver seguimiento</Link>
          </Button>
        )}
      </div>
    </Surface>
  );
}
