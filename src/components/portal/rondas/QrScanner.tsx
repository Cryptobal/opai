"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X, Keyboard } from "lucide-react";
import { normalizeCheckpointQrCode } from "@/lib/rondas/normalize-qr-code";

interface QrScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

/**
 * Escáner QR del portal de rondas.
 *
 * Importante: html5-qrcode manipula el DOM del contenedor. Hay que:
 * 1) esperar a que el nodo exista,
 * 2) detener la cámara ANTES de notificar onScan (evita crash al desmontar),
 * 3) atrapar errores síncronos del constructor (si no → global-error "Algo salió mal").
 */
export function QrScanner({ onScan, onClose }: QrScannerProps) {
  const reactId = useId().replace(/:/g, "");
  const containerId = `rondas-qr-reader-${reactId}`;
  const [error, setError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [ready, setReady] = useState(false);

  const scannerRef = useRef<InstanceType<typeof import("html5-qrcode").Html5Qrcode> | null>(null);
  const hasScannedRef = useRef(false);
  const cancelledRef = useRef(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    cancelledRef.current = false;
    hasScannedRef.current = false;

    async function startScanner() {
      try {
        // Asegura que el contenedor ya está en el DOM (evita throw síncrono).
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
        if (cancelledRef.current) return;

        const el = document.getElementById(containerId);
        if (!el) {
          setError("No se pudo iniciar el escáner. Usa ingreso manual.");
          setShowManual(true);
          return;
        }

        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (cancelledRef.current) return;

        const scanner = new Html5Qrcode(containerId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
          verbose: false,
        } as import("html5-qrcode/esm/html5-qrcode").Html5QrcodeFullConfig);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1,
          },
          (decodedText) => {
            if (hasScannedRef.current || cancelledRef.current) return;
            hasScannedRef.current = true;
            const normalized = normalizeCheckpointQrCode(decodedText);
            if (!normalized) {
              hasScannedRef.current = false;
              return;
            }

            // Detener cámara antes de desmontar el componente (evita crash React).
            const finish = () => {
              if (cancelledRef.current) return;
              onScanRef.current(normalized);
            };

            scanner
              .stop()
              .catch(() => {})
              .finally(() => {
                // Defer un tick para que html5-qrcode termine de soltar el DOM.
                setTimeout(finish, 0);
              });
          },
          () => {
            // ignore frame-level scan failures
          },
        );

        if (!cancelledRef.current) setReady(true);
      } catch (err) {
        if (cancelledRef.current) return;
        console.error("QR scanner error:", err);
        setError("No se pudo acceder a la cámara. Verifica los permisos.");
        setShowManual(true);
      }
    }

    void startScanner();

    return () => {
      cancelledRef.current = true;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      // stop() es tolerante si la cámara aún no arrancó o ya se detuvo
      scanner?.stop().catch(() => {});
    };
  }, [containerId]);

  const stopCamera = () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    scanner.stop().catch(() => {});
  };

  const openManual = () => {
    stopCamera();
    setShowManual(true);
  };

  const handleManualSubmit = () => {
    const code = normalizeCheckpointQrCode(manualCode);
    if (code) onScan(code);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
      {/* X flotante siempre visible (por si el header queda oculto en vista embebida) */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-[10001] flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-zinc-900 shadow-lg transition-colors active:bg-white"
        aria-label="Cerrar"
      >
        <X size={24} />
      </button>
      {/* Header — Cancelar + X */}
      <div
        className="flex items-center justify-between p-4 shrink-0"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <button
          onClick={onClose}
          className="rounded-lg bg-zinc-800 px-4 py-2.5 text-sm font-medium text-gray-200 active:bg-zinc-700"
        >
          Cancelar
        </button>
        <span className="text-white text-lg font-semibold">Escanear QR</span>
        <button
          onClick={onClose}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-white transition-colors active:bg-zinc-700"
          aria-label="Cerrar"
        >
          <X size={22} />
        </button>
      </div>

      {/* Contenedor del scanner: permanece en el DOM (oculto en modo manual) para
          que html5-qrcode no pierda el elementId a mitad del stop(). */}
      <div
        className={`flex-1 flex items-center justify-center px-4 ${showManual ? "hidden" : ""}`}
      >
        <div className="w-full max-w-sm relative">
          <div id={containerId} className="w-full" />
          {!ready && !error && (
            <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-zinc-400">
              Iniciando cámara…
            </p>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2">
          <p className="text-status-danger-fg text-sm text-center">{error}</p>
        </div>
      )}

      {/* Manual fallback */}
      <div className="p-4 space-y-3">
        {!showManual ? (
          <button
            onClick={openManual}
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
              className="w-full py-3 bg-status-info text-white rounded-lg font-semibold disabled:opacity-40"
            >
              Verificar Codigo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
