"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ReasonDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  onOpenChange,
  onConfirm,
  loading,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void | Promise<void>;
  loading?: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setReason("");
        onOpenChange(v);
      }}
      title={title}
      description={
        <div className="space-y-3">
          {description ? <p className="text-[13px] text-ds-text-3">{description}</p> : null}
          <div className="space-y-1.5">
            <Label htmlFor="pf-reason">Motivo</Label>
            <Input
              id="pf-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-10 sm:h-9"
              required
            />
          </div>
        </div>
      }
      confirmLabel={confirmLabel}
      variant="destructive"
      loading={loading}
      confirmDisabled={!reason.trim()}
      onConfirm={() => onConfirm(reason.trim())}
    />
  );
}
