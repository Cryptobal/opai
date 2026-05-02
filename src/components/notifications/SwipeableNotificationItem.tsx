"use client";

import { useEffect, useState, type ReactNode } from "react";
import { motion, useMotionValue, animate, type PanInfo } from "framer-motion";
import { CheckCheck, Circle, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const ACTION_WIDTH = 80;
const TOTAL_ACTIONS = ACTION_WIDTH * 2;
const SNAP_THRESHOLD = 40;
const DELETE_THRESHOLD = 200;

function triggerHaptic(ms: number) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(ms);
    } catch {
      // no-op (some browsers throw on unsupported user-gesture context)
    }
  }
}

type SwipeableNotificationItemProps = {
  id: string;
  isRead: boolean;
  onToggleRead: () => void;
  onDelete: () => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
};

export function SwipeableNotificationItem({
  isRead,
  onToggleRead,
  onDelete,
  isOpen,
  onOpenChange,
  children,
}: SwipeableNotificationItemProps) {
  const x = useMotionValue(0);
  const [isDragging, setIsDragging] = useState(false);

  // Sync external "isOpen" prop -> motion value (close-others-on-open pattern)
  useEffect(() => {
    if (isOpen) {
      animate(x, -TOTAL_ACTIONS, { type: "spring", stiffness: 300, damping: 30 });
    } else {
      animate(x, 0, { type: "spring", stiffness: 300, damping: 30 });
    }
  }, [isOpen, x]);

  const close = () => {
    onOpenChange(false);
  };

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    setIsDragging(false);
    const offset = info.offset.x;

    if (offset < -DELETE_THRESHOLD) {
      triggerHaptic(25);
      const width = typeof window !== "undefined" ? window.innerWidth : 400;
      animate(x, -width, {
        duration: 0.2,
        onComplete: () => onDelete(),
      });
      return;
    }

    if (offset < -SNAP_THRESHOLD) {
      triggerHaptic(10);
      onOpenChange(true);
    } else {
      onOpenChange(false);
    }
  };

  const handleToggleRead = () => {
    triggerHaptic(25);
    onToggleRead();
    close();
  };

  const handleDelete = () => {
    triggerHaptic(25);
    onDelete();
    close();
  };

  return (
    <div className="relative overflow-hidden">
      {/* Action layer revealed when dragged left */}
      <div className="absolute inset-y-0 right-0 flex items-stretch">
        <button
          type="button"
          onClick={handleToggleRead}
          aria-label={isRead ? "Marcar como no leida" : "Marcar como leida"}
          className={cn(
            "flex w-20 items-center justify-center transition-colors",
            isRead
              ? "bg-muted text-muted-foreground"
              : "bg-status-info text-white"
          )}
        >
          {isRead ? <Circle className="h-5 w-5" /> : <CheckCheck className="h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          aria-label="Eliminar notificacion"
          className="flex w-20 items-center justify-center bg-status-danger text-white transition-colors"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      </div>

      {/* Draggable content */}
      <motion.div
        drag="x"
        dragConstraints={{ left: -TOTAL_ACTIONS - 40, right: 0 }}
        dragElastic={{ left: 0.1, right: 0 }}
        dragMomentum={false}
        style={{ x }}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={handleDragEnd}
        onTap={() => {
          if (x.get() !== 0) close();
        }}
        className={cn(
          "relative bg-background touch-pan-y",
          isDragging && "select-none"
        )}
      >
        {children}
      </motion.div>
    </div>
  );
}
