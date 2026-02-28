"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  onConfirm: (dataUrl: string) => void;
  onClear: () => void;
  existingDataUrl: string | null;
};

export function SignatureCanvas({ onConfirm, onClear, existingDataUrl }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [confirmed, setConfirmed] = useState(!!existingDataUrl);

  const getContext = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    return ctx;
  }, []);

  // Set up canvas dimensions
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";

    // If existing signature, draw it
    if (existingDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
        setHasStrokes(true);
      };
      img.src = existingDataUrl;
    }
  }, [existingDataUrl]);

  function getPos(e: React.TouchEvent | React.MouseEvent): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();

    if ("touches" in e) {
      const touch = e.touches[0];
      if (!touch) return null;
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  }

  function startDraw(e: React.TouchEvent | React.MouseEvent) {
    if (confirmed) return;
    const ctx = getContext();
    const pos = getPos(e);
    if (!ctx || !pos) return;

    setIsDrawing(true);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    e.preventDefault();
  }

  function draw(e: React.TouchEvent | React.MouseEvent) {
    if (!isDrawing || confirmed) return;
    const ctx = getContext();
    const pos = getPos(e);
    if (!ctx || !pos) return;

    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasStrokes(true);
    e.preventDefault();
  }

  function stopDraw() {
    setIsDrawing(false);
  }

  function handleClear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    setHasStrokes(false);
    setConfirmed(false);
    onClear();
  }

  function handleConfirm() {
    const canvas = canvasRef.current;
    if (!canvas || !hasStrokes) return;
    const dataUrl = canvas.toDataURL("image/png");
    setConfirmed(true);
    onConfirm(dataUrl);
  }

  return (
    <div className="space-y-2">
      <div
        className={`rounded-lg border-2 ${
          confirmed
            ? "border-emerald-500/50 bg-emerald-500/5"
            : "border-dashed border-muted-foreground/30 bg-muted/20"
        }`}
      >
        <canvas
          ref={canvasRef}
          className="w-full touch-none"
          style={{ height: 150 }}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
        />
      </div>
      {!confirmed && !hasStrokes && (
        <p className="text-center text-xs text-muted-foreground">
          Firme aqui con el dedo
        </p>
      )}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={handleClear}
          disabled={!hasStrokes && !confirmed}
        >
          Limpiar
        </Button>
        {!confirmed && (
          <Button
            size="sm"
            className="flex-1"
            onClick={handleConfirm}
            disabled={!hasStrokes}
          >
            Confirmar firma
          </Button>
        )}
        {confirmed && (
          <div className="flex flex-1 items-center justify-center text-xs text-emerald-400">
            Firma confirmada
          </div>
        )}
      </div>
    </div>
  );
}
