"use client";

import {
  Component,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { X, Keyboard } from "lucide-react";
import { normalizeCheckpointQrCode } from "@/lib/rondas/normalize-qr-code";

interface QrScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

type Html5QrcodeInstance = InstanceType<typeof import("html5-qrcode").Html5Qrcode>;

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

/**
 * Atrapa NotFoundError / removeChild de html5-qrcode peleando con React.
 * Sin esto, la carrera stop+unmount termina en global-error "Algo salió mal".
 */
class QrScannerErrorBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn("[QrScanner] DOM race swallowed:", error?.message ?? error);
    this.props.onError();
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

async function safeStopHtml5(scanner: Html5QrcodeInstance | null) {
  if (!scanner) return;
  try {
    const scanning = typeof scanner.isScanning === "boolean" ? scanner.isScanning : true;
    if (scanning) {
      await scanner.stop();
    }
  } catch {
    // ya detenido / elemento ausente
  }
  try {
    await scanner.clear();
  } catch {
    // clear() también puede fallar si el nodo ya no existe
  }
}

/**
 * Escáner QR del portal de rondas.
 *
 * Estrategia:
 * 1) Preferir BarcodeDetector nativo + <video> controlado por React (sin mutación DOM externa).
 * 2) Fallback html5-qrcode sobre un host vacío; stop+clear+wipe ANTES de onScan/unmount.
 * 3) ErrorBoundary local para que una carrera residual no tumbe toda la app.
 */
export function QrScanner({ onScan, onClose }: QrScannerProps) {
  const reactId = useId().replace(/:/g, "");
  const containerId = `rondas-qr-reader-${reactId}`;
  const [error, setError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [ready, setReady] = useState(false);
  const [engine, setEngine] = useState<"native" | "html5" | null>(null);
  const [boundaryFailed, setBoundaryFailed] = useState(false);

  const hostRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<Html5QrcodeInstance | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const hasScannedRef = useRef(false);
  const cancelledRef = useRef(false);
  const finishingRef = useRef(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const wipeHost = useCallback(() => {
    const host = hostRef.current;
    if (host) {
      try {
        host.innerHTML = "";
      } catch {
        // ignore
      }
    }
  }, []);

  const stopNativeStream = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
    }
    const video = videoRef.current;
    if (video) {
      try {
        video.srcObject = null;
      } catch {
        // ignore
      }
    }
  }, []);

  const teardown = useCallback(async () => {
    cancelledRef.current = true;
    stopNativeStream();
    const scanner = scannerRef.current;
    scannerRef.current = null;
    await safeStopHtml5(scanner);
    wipeHost();
  }, [stopNativeStream, wipeHost]);

  const teardownRef = useRef(teardown);
  teardownRef.current = teardown;

  const finishWithCode = useCallback(async (raw: string) => {
    if (hasScannedRef.current || finishingRef.current) return;
    const normalized = normalizeCheckpointQrCode(raw);
    if (!normalized) return;
    hasScannedRef.current = true;
    finishingRef.current = true;

    // Liberar cámara/DOM antes de que el padre desmonte este componente.
    await teardownRef.current();

    setTimeout(() => {
      onScanRef.current(normalized);
    }, 0);
  }, []);

  const finishWithCodeRef = useRef(finishWithCode);
  finishWithCodeRef.current = finishWithCode;

  useEffect(() => {
    cancelledRef.current = false;
    hasScannedRef.current = false;
    finishingRef.current = false;

    async function startNativeBarcodeDetector(): Promise<boolean> {
      if (typeof window === "undefined" || typeof window.BarcodeDetector !== "function") {
        return false;
      }
      const video = videoRef.current;
      if (!video) return false;

      let detector: BarcodeDetectorLike;
      try {
        detector = new window.BarcodeDetector!({ formats: ["qr_code"] });
      } catch {
        return false;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      if (cancelledRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return true;
      }

      streamRef.current = stream;
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      video.muted = true;
      await video.play();
      setEngine("native");

      const tick = async () => {
        if (cancelledRef.current || hasScannedRef.current) return;
        try {
          if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            const codes = await detector.detect(video);
            const raw = codes[0]?.rawValue;
            if (raw) {
              await finishWithCodeRef.current(raw);
              return;
            }
          }
        } catch {
          // frame fallido — seguir
        }
        if (!cancelledRef.current && !hasScannedRef.current) {
          rafRef.current = requestAnimationFrame(() => {
            void tick();
          });
        }
      };

      rafRef.current = requestAnimationFrame(() => {
        void tick();
      });
      return true;
    }

    async function startHtml5Fallback() {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (cancelledRef.current) return;

      const el = hostRef.current ?? document.getElementById(containerId);
      if (!el) {
        setError("No se pudo iniciar el escáner. Usa ingreso manual.");
        setShowManual(true);
        return;
      }
      el.id = containerId;

      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      if (cancelledRef.current) return;

      const scanner = new Html5Qrcode(containerId, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        verbose: false,
      } as import("html5-qrcode/esm/html5-qrcode").Html5QrcodeFullConfig);
      scannerRef.current = scanner;
      setEngine("html5");

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
        },
        (decodedText) => {
          void finishWithCodeRef.current(decodedText);
        },
        () => {
          // ignore frame-level scan failures
        },
      );
    }

    async function startScanner() {
      try {
        let started = false;
        try {
          started = await startNativeBarcodeDetector();
        } catch (nativeErr) {
          console.warn("[QrScanner] native BarcodeDetector failed, fallback html5:", nativeErr);
          stopNativeStream();
          started = false;
        }
        if (cancelledRef.current) return;
        if (!started) {
          await startHtml5Fallback();
        }
        if (!cancelledRef.current) setReady(true);
      } catch (err) {
        if (cancelledRef.current) return;
        console.error("QR scanner error:", err);
        setError("No se pudo acceder a la cámara. Verifica los permisos.");
        setShowManual(true);
        await teardownRef.current();
      }
    }

    void startScanner();

    return () => {
      void teardownRef.current();
    };
  }, [containerId, stopNativeStream]);

  const openManual = () => {
    void teardown().finally(() => setShowManual(true));
  };

  const handleClose = () => {
    void teardown().finally(() => onClose());
  };

  const handleManualSubmit = () => {
    const code = normalizeCheckpointQrCode(manualCode);
    if (code) {
      void teardown().finally(() => onScan(code));
    }
  };

  const handleBoundaryError = () => {
    setBoundaryFailed(true);
    setShowManual(true);
    setError("El escáner se cerró de forma inesperada. Ingresa el código manual.");
    void teardown();
  };

  const hideCamera = showManual || boundaryFailed;

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
      <button
        onClick={handleClose}
          className="absolute top-4 right-4 z-[10001] flex h-11 w-11 items-center justify-center rounded-full bg-ds-surface-2 text-ds-text-1 shadow-lg transition-colors active:bg-ds-surface-3"
        aria-label="Cerrar"
      >
        <X size={24} />
      </button>
      <div
        className="flex items-center justify-between p-4 shrink-0"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <button
          onClick={handleClose}
          className="rounded-lg bg-ds-surface-2 px-4 py-2.5 text-sm font-medium text-ds-text-2 active:bg-ds-surface-3"
        >
          Cancelar
        </button>
        <span className="text-white text-lg font-semibold">Escanear QR</span>
        <button
          onClick={handleClose}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ds-surface-2 text-ds-text-1 transition-colors active:bg-ds-surface-3"
          aria-label="Cerrar"
        >
          <X size={22} />
        </button>
      </div>

      <QrScannerErrorBoundary onError={handleBoundaryError}>
        <div className={`flex-1 flex items-center justify-center px-4 ${hideCamera ? "hidden" : ""}`}>
          <div className="w-full max-w-sm relative aspect-square overflow-hidden rounded-lg bg-black">
            <video
              ref={videoRef}
              className={`absolute inset-0 h-full w-full object-cover ${engine === "html5" ? "hidden" : ""}`}
              playsInline
              muted
              autoPlay
            />
            <div
              ref={hostRef}
              id={containerId}
              className={`absolute inset-0 [&_video]:h-full [&_video]:w-full [&_video]:object-cover ${
                engine === "native" ? "hidden" : engine === "html5" ? "" : "pointer-events-none"
              }`}
            />
            {!ready && !error && (
              <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-ds-text-3">
                Iniciando cámara…
              </p>
            )}
          </div>
        </div>
      </QrScannerErrorBoundary>

      {error && (
        <div className="px-4 py-2">
          <p className="text-status-danger-fg text-sm text-center">{error}</p>
        </div>
      )}

      <div className="p-4 space-y-3">
        {!showManual ? (
          <button
            onClick={openManual}
            className="w-full flex items-center justify-center gap-2 py-3 text-ds-text-3 text-sm"
          >
            <Keyboard size={16} />
            No puedes escanear? Ingresa el codigo manual
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-ds-text-3 text-sm text-center">
              Ingresa el codigo impreso debajo del QR
            </p>
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value.toUpperCase())}
              placeholder="Ej: CP-NORTE-001"
              className="w-full px-4 py-3 bg-ds-surface-2 border border-ds-border-default rounded-lg text-ds-text-1 text-center text-lg uppercase"
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
