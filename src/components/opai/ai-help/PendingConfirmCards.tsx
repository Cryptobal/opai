"use client";

import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type PendingConfirmationClient = {
  id: string;
  confirmToolName: string;
  summary: string;
  status: string;
  expiresAt: string;
};

export function PendingConfirmCards({
  items,
  onResolved,
}: {
  items: PendingConfirmationClient[];
  onResolved: (id: string, status: "CONFIRMED" | "CANCELLED") => void;
}) {
  if (!items.length) return null;
  return (
    <div className="mt-2 space-y-2">
      {items.map((p) => (
        <PendingConfirmCard key={p.id} item={p} onResolved={onResolved} />
      ))}
    </div>
  );
}

function PendingConfirmCard({
  item,
  onResolved,
}: {
  item: PendingConfirmationClient;
  onResolved: (id: string, status: "CONFIRMED" | "CANCELLED") => void;
}) {
  const [busy, setBusy] = useState<"confirm" | "cancel" | null>(null);
  const expired = item.status !== "PENDING" || new Date(item.expiresAt).getTime() <= Date.now();
  const resolved = item.status === "CONFIRMED" || item.status === "CANCELLED" || item.status === "EXPIRED";

  const run = async (action: "confirm" | "cancel") => {
    if (busy || expired || resolved) return;
    setBusy(action);
    try {
      const res = await fetch(`/api/ai/help-chat/pending/${item.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: { label?: string };
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "No se pudo resolver la acción");
      }
      const status = action === "confirm" ? "CONFIRMED" : "CANCELLED";
      onResolved(item.id, status);
      toast.success(
        action === "confirm"
          ? `Confirmado: ${json.data?.label ?? item.summary}`
          : "Acción cancelada",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al resolver");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5",
        resolved || expired
          ? "border-ds-border-subtle bg-ds-surface-2/40"
          : "border-status-warn-border bg-status-warn-soft",
      )}
    >
      <p className="text-[13px] font-medium text-white">
        {resolved
          ? item.status === "CONFIRMED"
            ? "✅ Confirmado"
            : item.status === "CANCELLED"
              ? "Cancelado"
              : "Expirado"
          : expired
            ? "⌛ Expiró"
            : "⚠️ Confirma para ejecutar"}
      </p>
      <p className="mt-0.5 text-[12px] text-ds-text-2">{item.summary}</p>
      {!resolved && !expired ? (
        <div className="mt-2 flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="h-10 sm:h-8 gap-1 bg-primary text-white"
            disabled={busy !== null}
            onClick={() => void run("confirm")}
          >
            {busy === "confirm" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Confirmar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-10 sm:h-8 gap-1 border-white/20 bg-white/5 text-white"
            disabled={busy !== null}
            onClick={() => void run("cancel")}
          >
            {busy === "cancel" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            Cancelar
          </Button>
          <span className="ml-auto text-[12px] text-ds-text-3">vence en 15 min</span>
        </div>
      ) : null}
    </div>
  );
}
