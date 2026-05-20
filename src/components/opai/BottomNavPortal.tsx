"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renders children as a direct child of <body> to guarantee that
 * `position: fixed` inside them is anchored to the viewport, not to
 * an ancestor that creates a containing block (transform, filter,
 * backdrop-filter, will-change, perspective). On iOS Safari this is
 * the safest way to keep a bottom nav glued to the screen edge while
 * scrolling content above it.
 */
export function BottomNavPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
