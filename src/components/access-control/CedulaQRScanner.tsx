"use client";

import React, { useEffect, useRef, useState } from "react";
import { X, Camera, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseCedulaQR } from "@/lib/access-control/utils";
import type { CedulaQRData } from "@/lib/access-control/types";

interface Props {
  onResult: (data: CedulaQRData) => void;
  onCancel: () => void;
}

export function CedulaQRScanner({ onResult, onCancel }: Props) {
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrRef = useRef<InstanceType<typeof import("html5-qrcode").Html5Qrcode> | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let started = false;

    async function startScanner() {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (!mounted) return;

        const scannerId = "cedula-qr-scanner";
        const scanner = new Html5Qrcode(scannerId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
          verbose: false,
        } as import("html5-qrcode/esm/html5-qrcode").Html5QrcodeFullConfig);
        html5QrRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 20,
            qrbox: { width: 280, height: 280 },
            aspectRatio: 1,
            disableFlip: false,
          },
          (decodedText) => {
            const data = parseCedulaQR(decodedText);
            if (data) {
              navigator.vibrate?.(200);
              started = false;
              scanner.stop().catch(() => {});
              onResult(data);
            }
          },
          () => {}
        );

        // Apply zoom + continuous autofocus so QR is readable from a
        // comfortable distance (avoids blurry close-ups on Android).
        try {
          const caps = scanner.getRunningTrackCapabilities() as MediaTrackCapabilities & {
            zoom?: { min: number; max: number; step: number };
            focusMode?: string[];
          };

          const constraints: MediaTrackConstraints & Record<string, unknown> = {};

          if (caps.zoom) {
            const desiredZoom = 2.0;
            constraints.advanced = [
              { zoom: Math.min(desiredZoom, caps.zoom.max) } as Record<string, unknown>,
            ];
          }

          if (caps.focusMode?.includes("continuous")) {
            constraints.focusMode = "continuous" as never;
          }

          if (Object.keys(constraints).length > 0) {
            await scanner.applyVideoConstraints(constraints);
          }
        } catch {
          // Zoom/focus not supported — no-op, scanner works fine without it.
        }

        started = true;
        if (mounted) setScanning(true);
      } catch (err) {
        if (mounted) {
          setError(
            err instanceof Error
              ? err.message
              : "No se pudo acceder a la cámara. Usa ingreso manual de RUT."
          );
        }
      }
    }

    startScanner();

    return () => {
      mounted = false;
      if (started && html5QrRef.current) {
        html5QrRef.current.stop().catch(() => {});
      }
    };
  }, [onResult]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-zinc-300">
          <Camera className="h-4 w-4" />
          Escanea el QR de la cédula
        </div>
        <button onClick={onCancel} className="text-zinc-500 hover:text-zinc-300">
          <X className="h-5 w-5" />
        </button>
      </div>

      {error ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-status-danger-border bg-status-danger-soft p-6">
          <AlertCircle className="h-8 w-8 text-status-danger-fg" />
          <p className="text-sm text-status-danger-fg text-center">{error}</p>
          <Button variant="outline" size="sm" onClick={onCancel}>
            Volver
          </Button>
        </div>
      ) : (
        <div className="relative">
          {!scanning && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 rounded-lg z-10">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          )}
          <div
            id="cedula-qr-scanner"
            ref={scannerRef}
            className="rounded-lg overflow-hidden"
          />
          <p className="mt-2 text-center text-xs text-zinc-500">
            Posiciona el código QR del reverso de la cédula dentro del recuadro
          </p>
        </div>
      )}
    </div>
  );
}
