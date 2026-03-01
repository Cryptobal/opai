"use client";

import { useState } from "react";
import { ExternalLink, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  installationId: string;
  installationName: string;
}

export function PatrullajeLink({ installationId, installationName }: Props) {
  const [showQr, setShowQr] = useState(false);
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${baseUrl}/patrullaje/${installationId}`;

  return (
    <>
      <div className="rounded-lg border border-border bg-card/50 p-3 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium flex items-center gap-1.5">
            📱 Página de patrullaje — {installationName}
          </p>
          <p className="text-[10px] text-muted-foreground truncate mt-0.5">{url}</p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1" asChild>
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3 w-3" /> Abrir
            </a>
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setShowQr(true)}>
            <QrCode className="h-3 w-3" /> QR
          </Button>
        </div>
      </div>

      <Dialog open={showQr} onOpenChange={setShowQr}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-center text-sm">Escanear para acceder</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="rounded-xl border border-border p-4 bg-white">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`}
                alt="QR Code"
                width={200}
                height={200}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">{installationName}</p>
            <p className="text-[10px] text-muted-foreground text-center break-all">{url}</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
