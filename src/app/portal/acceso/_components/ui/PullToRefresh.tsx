"use client";

import React, { useRef, useState, useCallback } from "react";

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  pullThreshold?: number;
}

const DEFAULT_THRESHOLD = 80;

export default function PullToRefresh({
  onRefresh,
  children,
  pullThreshold = DEFAULT_THRESHOLD,
}: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (isRefreshing) return;

      const container = containerRef.current;
      if (container && container.scrollTop === 0) {
        startYRef.current = e.touches[0].clientY;
        setIsPulling(true);
      }
    },
    [isRefreshing]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isPulling || isRefreshing) return;

      const deltaY = e.touches[0].clientY - startYRef.current;
      if (deltaY > 0) {
        // Apply resistance: diminishing returns as you pull further
        const resistance = Math.min(deltaY * 0.4, pullThreshold * 1.5);
        setPullDistance(resistance);
      }
    },
    [isPulling, isRefreshing, pullThreshold]
  );

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling || isRefreshing) return;
    setIsPulling(false);

    if (pullDistance >= pullThreshold * 0.6) {
      setIsRefreshing(true);
      setPullDistance(pullThreshold * 0.5);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [isPulling, isRefreshing, pullDistance, pullThreshold, onRefresh]);

  return (
    <div
      ref={containerRef}
      className="relative overflow-visible"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      <div
        className={`flex items-center justify-center overflow-hidden ${
          !isPulling && !isRefreshing ? "transition-all duration-300 ease-out" : ""
        }`}
        style={{ height: pullDistance }}
      >
        {isRefreshing ? (
          <svg
            className="w-6 h-6 text-status-info-fg animate-spin"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : (
          <svg
            className="w-5 h-5 text-gray-400 transition-transform duration-150"
            style={{
              transform: `rotate(${pullDistance >= pullThreshold * 0.6 ? 180 : 0}deg)`,
            }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        )}
      </div>

      {/* Content */}
      {children}
    </div>
  );
}
