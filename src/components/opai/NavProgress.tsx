"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function NavProgressInner() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [key, setKey] = useState(0);

  useEffect(() => {
    setKey((k) => k + 1);
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), 420);
    return () => clearTimeout(t);
  }, [pathname, search]);

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
