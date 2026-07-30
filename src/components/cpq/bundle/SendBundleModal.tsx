"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BundleDetail } from "./useBundle";

export function SendBundleModal({
  open,
  onOpenChange,
  bundle,
  onSent,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  bundle: BundleDetail;
  onSent: () => Promise<void>;
}) {
  const defaultEmail = bundle.contact?.email || "";
  const defaultName = bundle.contact
    ? `${bundle.contact.firstName} ${bundle.contact.lastName}`.trim()
    : "";
  const [email, setEmail] = useState(defaultEmail);
  const [name, setName] = useState(defaultName);
  const [loading, setLoading] = useState(false);

  const included = bundle.totals.includedCount;

  const send = async () => {
    if (!email.trim()) {
      toast.error("Email requerido");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/cpq/bundles/${bundle.id}/send-presentation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipientEmail: email.trim(),
            recipientName: name.trim() || undefined,
          }),
        },
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error || "Error al enviar");
        return;
      }
      toast.success(`Propuesta enviada a ${json.data.sentTo}`);
      onOpenChange(false);
      await onSent();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar propuesta consolidada</DialogTitle>
          <DialogDescription>
            Se generará el PDF con {included} instalación
            {included === 1 ? "" : "es"} y se enviará por correo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Destinatario</Label>
            <Input
              className="h-10 sm:h-9"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input
              className="h-10 sm:h-9"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            className="h-10 sm:h-9 bg-status-ok hover:bg-status-ok/90"
            disabled={loading || included === 0}
            onClick={() => void send()}
          >
            {loading ? "Enviando…" : "Enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
