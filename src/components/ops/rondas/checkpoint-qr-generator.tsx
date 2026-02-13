"use client";

import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { QrCode } from "lucide-react";

export function CheckpointQrGenerator({
  code,
  label,
}: {
  code: string;
  label: string;
}) {
  const download = async () => {
    const canvas = document.createElement("canvas");
    await QRCode.toCanvas(canvas, code, { width: 640, margin: 2, errorCorrectionLevel: "H" });
    const data = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = data;
    a.download = `QR-Checkpoint-${label.replace(/\s+/g, "-")}-${code}.png`;
    a.click();
  };

  return (
    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void download()}>
      <QrCode className="mr-1 h-3.5 w-3.5" />
      Descargar QR
    </Button>
  );
}
