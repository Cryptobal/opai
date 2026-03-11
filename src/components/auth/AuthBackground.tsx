"use client";

import { useEffect, useRef } from "react";

interface AuthBackgroundProps {
  accentRgb: string; // ej: "45, 212, 191"
}

export function AuthBackground({ accentRgb }: AuthBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rgbRef = useRef(accentRgb);
  rgbRef.current = accentRgb;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let animationId: number;
    let time = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const orbs = [
      { x: 0.25, y: 0.2, r: 340, alpha: 0.04, speed: 0.0003 },
      { x: 0.72, y: 0.6, r: 300, alpha: 0.03, speed: 0.0004 },
      { x: 0.48, y: 0.85, r: 260, alpha: 0.025, speed: 0.0005 },
    ];

    const animate = () => {
      time++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const rgb = rgbRef.current;

      orbs.forEach((orb) => {
        const cx = canvas.width * (orb.x + Math.sin(time * orb.speed) * 0.08);
        const cy = canvas.height * (orb.y + Math.cos(time * orb.speed * 1.3) * 0.06);
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, orb.r);
        gradient.addColorStop(0, `rgba(${rgb}, ${orb.alpha})`);
        gradient.addColorStop(1, "transparent");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      });

      animationId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none z-0"
    />
  );
}
