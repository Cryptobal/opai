"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * useCollapsibleHeader — estado de colapso on-scroll para headers de ficha.
 *
 * Histéresis 64/26: colapsa al superar 64px de scroll y solo re-expande al
 * bajar de 26px, evitando jitter con el momentum scroll de iOS. El contenedor
 * de scroll real puede ser la ventana (caso del AppShell, donde `<main>` no
 * tiene overflow propio) o un ancestro con `overflow-y: auto|scroll`; se
 * detecta subiendo desde `rootRef` al montar.
 */

const SHRINK_AT = 64;
const EXPAND_AT = 26;
// Colapsar reduce la altura del documento (~header). Si la página apenas
// scrollea, el clamp del scroll re-expandiría en loop: exigimos holgura.
const MIN_SCROLL_RANGE = SHRINK_AT + 140;

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node && node !== document.body) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

export function useCollapsibleHeader(enabled = true): {
  collapsed: boolean;
  rootRef: RefObject<HTMLDivElement | null>;
} {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const collapsedRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      collapsedRef.current = false;
      setCollapsed(false);
      return;
    }

    const scrollParent = findScrollParent(rootRef.current);
    const target: HTMLElement | Window = scrollParent ?? window;

    let raf = 0;
    const scroller = () => scrollParent ?? document.scrollingElement ?? document.documentElement;
    const readScrollTop = () =>
      scrollParent ? scrollParent.scrollTop : (document.scrollingElement?.scrollTop ?? window.scrollY);

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const top = readScrollTop();
        const el = scroller();
        const scrollRange = el.scrollHeight - el.clientHeight;
        const prev = collapsedRef.current;
        const next = prev
          ? top > EXPAND_AT
          : top > SHRINK_AT && scrollRange > MIN_SCROLL_RANGE;
        if (next !== prev) {
          collapsedRef.current = next;
          setCollapsed(next);
        }
      });
    };

    onScroll();
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      target.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [enabled]);

  return { collapsed, rootRef };
}
