"use client";

import { useRef, useState, type ReactNode } from "react";
import { motion, useMotionValue, animate } from "framer-motion";
import { Loader2, ArrowDown } from "lucide-react";

const PULL_THRESHOLD = 60;
const MAX_PULL = 100;
const RESISTANCE = 0.5;

type PullToRefreshProps = {
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
  className?: string;
};

export function PullToRefresh({ onRefresh, children, className }: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number | null>(null);
  const pullY = useMotionValue(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [canPull, setCanPull] = useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    const el = containerRef.current;
    if (!el || isRefreshing) return;
    if (el.scrollTop > 0) {
      setCanPull(false);
      startYRef.current = null;
      return;
    }
    setCanPull(true);
    startYRef.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!canPull || startYRef.current === null || isRefreshing) return;
    const dy = e.touches[0].clientY - startYRef.current;
    if (dy > 0) {
      const damped = Math.min(dy * RESISTANCE, MAX_PULL);
      pullY.set(damped);
    } else if (dy < 0) {
      pullY.set(0);
    }
  };

  const handleTouchEnd = async () => {
    if (!canPull || isRefreshing) {
      startYRef.current = null;
      setCanPull(false);
      return;
    }
    const current = pullY.get();
    if (current >= PULL_THRESHOLD) {
      setIsRefreshing(true);
      animate(pullY, PULL_THRESHOLD, { type: "spring", stiffness: 300, damping: 30 });
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try { navigator.vibrate(10); } catch {}
      }
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        animate(pullY, 0, { type: "spring", stiffness: 300, damping: 30 });
      }
    } else {
      animate(pullY, 0, { type: "spring", stiffness: 300, damping: 30 });
    }
    startYRef.current = null;
    setCanPull(false);
  };

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className={className ?? "h-full overflow-y-auto"}
    >
      <motion.div
        style={{ height: pullY }}
        className="flex items-end justify-center overflow-hidden"
        aria-hidden
      >
        <div className="pb-2 text-muted-foreground">
          {isRefreshing ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <ArrowDown className="h-5 w-5" />
          )}
        </div>
      </motion.div>

      {children}
    </div>
  );
}
