"use client";

import { Button } from "@/components/ui/button";

export function QrScanner({
  onScan,
}: {
  onScan: (value: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <p className="text-xs text-muted-foreground">
        Escáner QR listo para integración con cámara. Mientras tanto, usa ingreso manual.
      </p>
      <Button size="sm" className="h-10 w-full" onClick={() => onScan(prompt("Ingresa código QR") ?? "")}>
        Escanear / ingresar QR
      </Button>
    </div>
  );
}
