"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getHubForPortal, type HubId, type PortalId } from "./auth-config";

interface AuthNavBarProps {
  activePortalId: PortalId | "home";
}

/**
 * Top navigation bar shown on every login / pairing screen.
 *
 * Collapsed to the three hubs users care about:
 *   - Terreno: shared device (marcación, rondas, acceso pairing)
 *   - Personas: personal device (guardia, supervisor, cliente login)
 *   - OPAI ERP: admin ERP login
 *
 * Sub-portals inherit the parent hub's active state via getHubForPortal().
 * See src/components/auth/auth-config.ts for the mapping.
 */
const NAV_HUBS: { id: HubId; label: string; accent: string; href: string }[] = [
  { id: "terreno", label: "Terreno", accent: "#f59e0b", href: "/portal/terreno" },
  { id: "personas", label: "Personas", accent: "#2dd4bf", href: "/portal/personas" },
  { id: "opai", label: "OPAI ERP", accent: "#f43f5e", href: "/opai/login" },
];

export function AuthNavBar({ activePortalId }: AuthNavBarProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const activeHub = getHubForPortal(activePortalId);

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100] transition-colors duration-300"
      style={{
        background: scrolled ? "rgba(6,10,19,0.92)" : "rgba(6,10,19,0.7)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      <div
        className="max-w-[720px] mx-auto flex items-center justify-center gap-1 px-4 py-2"
        style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}
      >
        {/* OPAI mini logo */}
        <Link
          href="/welcome"
          className="flex items-center gap-2 mr-3 shrink-0 px-2.5 py-1 rounded-lg transition-all"
          style={{
            background: activeHub === "home" ? "rgba(244,63,94,0.1)" : "transparent",
          }}
        >
          <div
            className="w-7 h-7 rounded-[7px] flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #f43f5e, #e11d48)",
              boxShadow: "0 0 16px rgba(244,63,94,0.2)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <span className="text-sm font-bold text-[#f9fafb]" style={{ letterSpacing: "-0.02em" }}>
            OPAI
          </span>
        </Link>

        {/* Divider */}
        <div className="w-px h-5 bg-white/[0.06] mr-2 shrink-0" />

        {/* Hub tabs — only 3 */}
        {NAV_HUBS.map((hub) => {
          const isActive = activeHub === hub.id;
          return (
            <Link
              key={hub.id}
              href={hub.href}
              className="shrink-0 px-3 py-1.5 rounded-[7px] text-xs transition-all whitespace-nowrap"
              style={{
                background: isActive ? `${hub.accent}15` : "transparent",
                color: isActive ? hub.accent : "#6b7280",
                fontWeight: isActive ? 600 : 400,
                outline: isActive ? `1px solid ${hub.accent}25` : "none",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              {hub.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
