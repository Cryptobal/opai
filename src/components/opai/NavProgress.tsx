"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { startNavProgress, subscribeNavProgress } from "./nav-progress-bus";

function NavProgressInner() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [key, setKey] = useState(0);

  const pulse = () => {
    setKey((k) => k + 1);
    setVisible(true);
  };

  useEffect(() => {
    return subscribeNavProgress(pulse);
  }, []);

  useEffect(() => {
    pulse();
    const t = window.setTimeout(() => setVisible(false), 420);
    return () => clearTimeout(t);
  }, [pathname, search]);

  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(() => setVisible(false), 420);
    return () => clearTimeout(t);
  }, [visible, key]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || anchor.target === "_blank") {
        return;
      }
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }
      try {
        const url = new URL(href, window.location.origin);
        if (url.origin !== window.location.origin) return;
        if (
          url.pathname === window.location.pathname &&
          url.search === window.location.search
        ) {
          return;
        }
        startNavProgress();
      } catch {
        /* ignore */
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  if (!visible) return null;

  return (
    <div
      key={key}
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[2px] overflow-hidden"
    >
      <div className="opai-nav-progress h-full w-full bg-primary" />
    </div>
  );
}

/** Barra de progreso superior (2 px, acento) ante navegaciones. */
export function NavProgress() {
  return (
    <Suspense fallback={null}>
      <NavProgressInner />
    </Suspense>
  );
}
