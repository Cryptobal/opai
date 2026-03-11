"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { X, Keyboard } from "lucide-react";

interface QrScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

export function QrScanner({ onScan, onClose }: QrScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerIdRef = useRef("qr-reader-" + Date.now());
  const hasScannedRef = useRef(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    let cancelled = false;
    const scanner = new Html5Qrcode(containerIdRef.current);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
        },
        (decodedText) => {
          if (hasScannedRef.current || cancelled) return;
          hasScannedRef.current = true;
          scanner.stop().catch(() => {});
          onScanRef.current(decodedText);
        },
        () => {} // ignore scan failures (no QR in frame yet)
      )
      .catch((err: Error) => {
        if (cancelled) return;
        setError("No se pudo acceder a la cámara. Verifica los permisos.");
        setShowManual(true);
        console.error("QR scanner error:", err);
      });

    return () => {
      cancelled = true;
      scanner.stop().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleManualSubmit = () => {
    const code = manualCode.trim();
    if (code) onScan(code);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
      {/* Header — botón cerrar siempre visible */}
      <div
        className="flex items-center justify-between p-4 shrink-0"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <span className="text-white text-lg font-semibold">Escanear QR</span>
        <button
          onClick={onClose}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-white transition-colors active:bg-zinc-700"
          aria-label="Cerrar"
        >
          <X size={22} />
        </button>
      </div>

      {/* Scanner area */}
      {!showManual && (
        <div className="flex-1 flex items-center justify-center px-4">
          <div id={containerIdRef.current} className="w-full max-w-sm" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-2">
          <p className="text-red-400 text-sm text-center">{error}</p>
        </div>
      )}

      {/* Manual fallback */}
      <div className="p-4 space-y-3">
        {!showManual ? (
          <button
            onClick={() => setShowManual(true)}
            className="w-full flex items-center justify-center gap-2 py-3 text-zinc-400 text-sm"
          >
            <Keyboard size={16} />
            No puedes escanear? Ingresa el codigo manual
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-zinc-400 text-sm text-center">
              Ingresa el codigo impreso debajo del QR
            </p>
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value.toUpperCase())}
              placeholder="Ej: CP-NORTE-001"
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-center text-lg uppercase"
              autoFocus
            />
            <button
              onClick={handleManualSubmit}
              disabled={!manualCode.trim()}
              className="w-full py-3 bg-teal-600 text-white rounded-lg font-semibold disabled:opacity-40"
            >
              Verificar Codigo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
