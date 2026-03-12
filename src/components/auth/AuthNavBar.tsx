"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PortalId } from "./auth-config";

interface AuthNavBarProps {
  activePortalId: PortalId | "home";
}

const NAV_PORTALS: { id: PortalId; label: string; accent: string; href: string }[] = [
  { id: "guardia", label: "Guardia", accent: "#2dd4bf", href: "/portal/guardia" },
  { id: "rondas", label: "Rondas", accent: "#10b981", href: "/portal/rondas" },
  { id: "supervisor", label: "Supervisor", accent: "#8b5cf6", href: "/portal/supervisor" },
  { id: "cliente", label: "Cliente", accent: "#3b82f6", href: "/portal/cliente" },
  { id: "marcacion", label: "Marcación", accent: "#f97316", href: "/portal/marcacion" },
  { id: "acceso", label: "Acceso", accent: "#f59e0b", href: "/portal/acceso" },
  { id: "opai", label: "OPAI ERP", accent: "#f43f5e", href: "/opai/login" },
];

export function AuthNavBar({ activePortalId }: AuthNavBarProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

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
        className="max-w-[720px] mx-auto flex items-center gap-0.5 px-4 py-2 overflow-x-auto"
        style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {/* OPAI mini logo */}
        <Link
          href="/welcome"
          className="flex items-center gap-2 mr-3 shrink-0 px-2.5 py-1 rounded-lg transition-all"
          style={{
            background: activePortalId === "home" ? "rgba(244,63,94,0.1)" : "transparent",
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

        {/* Portal tabs */}
        {NAV_PORTALS.map((portal) => {
          const isActive = activePortalId === portal.id;
          return (
            <Link
              key={portal.id}
              href={portal.href}
              className="shrink-0 px-3 py-1.5 rounded-[7px] text-xs transition-all whitespace-nowrap"
              style={{
                background: isActive ? `${portal.accent}15` : "transparent",
                color: isActive ? portal.accent : "#6b7280",
                fontWeight: isActive ? 600 : 400,
                outline: isActive ? `1px solid ${portal.accent}25` : "none",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              {portal.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
