"use client";

import React, { useRef, useState, useCallback } from "react";

interface SwipeActionProps {
  children: React.ReactNode;
  actionLabel: string;
  actionColor?: string;
  onAction: () => void;
}

const SWIPE_THRESHOLD = 80;

export default function SwipeAction({
  children,
  actionLabel,
  onAction,
}: SwipeActionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const currentXRef = useRef(0);
  const [translateX, setTranslateX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    currentXRef.current = 0;
    setIsSwiping(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isSwiping) return;

    const deltaX = e.touches[0].clientX - startXRef.current;
    const clampedDelta = Math.min(0, Math.max(-SWIPE_THRESHOLD * 1.5, deltaX));
    currentXRef.current = clampedDelta;
    setTranslateX(clampedDelta);
  }, [isSwiping]);

  const handleTouchEnd = useCallback(() => {
    setIsSwiping(false);

    if (currentXRef.current < -SWIPE_THRESHOLD) {
      setTranslateX(-SWIPE_THRESHOLD);
    } else {
      setTranslateX(0);
    }
  }, []);

  const handleAction = useCallback(() => {
    setTranslateX(0);
    onAction();
  }, [onAction]);

  const handleContentClick = useCallback(() => {
    if (translateX < 0) {
      setTranslateX(0);
    }
  }, [translateX]);

  return (
    <div className="relative overflow-hidden rounded-xl" ref={containerRef}>
      <div className="absolute inset-y-0 right-0 flex w-20 items-center justify-center bg-status-danger px-4">
        <button
          type="button"
          onClick={handleAction}
          className="min-h-11 text-sm font-bold uppercase tracking-wide text-white"
        >
          {actionLabel}
        </button>
      </div>

      <div
        className={`relative z-10 ${!isSwiping ? "transition-transform duration-200 ease-out motion-reduce:transition-none" : ""}`}
        style={{ transform: `translateX(${translateX}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleContentClick}
      >
        {children}
      </div>
    </div>
  );
}
