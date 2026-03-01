"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

interface Props {
  onScan: (value: string) => void;
  onClose: () => void;
}

export function QrScannerReal({ onScan, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (!mounted || !containerRef.current) return;

        const scanner = new Html5Qrcode(containerRef.current.id);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 200, height: 200 } },
          (decoded) => {
            if (mounted) {
              scanner.stop().catch(() => {});
              onScan(decoded);
            }
          },
          () => {},
        );
      } catch {
        if (mounted) setError("No se pudo acceder a la cámara");
      }
    }

    void init();

    return () => {
      mounted = false;
      scannerRef.current?.stop?.().catch(() => {});
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-white">Escanear código QR</span>
          <button onClick={onClose} className="p-2 rounded-lg bg-white/10 active:bg-white/20">
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        {error ? (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-center">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        ) : (
          <div
            id="qr-reader-patrullaje"
            ref={containerRef}
            className="rounded-xl overflow-hidden bg-black"
          />
        )}
      </div>
    </div>
  );
}
