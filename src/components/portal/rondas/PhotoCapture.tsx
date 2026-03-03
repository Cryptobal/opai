"use client";

import { useRef, useState, useCallback, useEffect } from "react";

interface Props {
  onCapture: (blob: Blob) => void;
  onClose: () => void;
}

export function PhotoCapture({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraKey, setCameraKey] = useState(0);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (preview) return; // Don't start camera while showing preview
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      })
      .catch(() => {});
    return () => { cancelled = true; stopCamera(); };
  }, [stopCamera, preview, cameraKey]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    setPreview(canvas.toDataURL("image/jpeg", 0.8));
    stopCamera();
  }, [stopCamera]);

  const confirm = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(blob => { if (blob) onCapture(blob); }, "image/jpeg", 0.8);
  }, [onCapture]);

  const retake = useCallback(() => {
    setPreview(null);
    setCameraKey(k => k + 1);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-lg font-semibold text-white">Foto Evidencia</h2>
        <button onClick={() => { stopCamera(); onClose(); }} className="rounded-lg bg-gray-800 px-4 py-2 text-base text-white">
          Cerrar
        </button>
      </div>
      <canvas ref={canvasRef} className="hidden" />
      {preview ? (
        <div className="flex flex-1 flex-col">
          <img src={preview} alt="Preview" className="flex-1 object-contain" />
          <div className="flex gap-3 px-4 py-4">
            <button onClick={retake} className="flex-1 rounded-xl bg-gray-700 py-4 text-lg text-white">
              Repetir
            </button>
            <button onClick={confirm} className="flex-1 rounded-xl bg-teal-600 py-4 text-lg font-semibold text-white">
              Usar Foto
            </button>
          </div>
        </div>
      ) : (
        <div className="relative flex-1">
          <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
          <div className="absolute inset-x-0 bottom-0 flex justify-center pb-8">
            <button
              onClick={capture}
              className="h-20 w-20 rounded-full border-4 border-white bg-white/20 active:bg-white/40"
            />
          </div>
        </div>
      )}
    </div>
  );
}
