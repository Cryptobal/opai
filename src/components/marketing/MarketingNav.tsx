"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";

const NAV_LINKS = [
  { label: "Módulos", href: "#modulos" },
  { label: "Portales", href: "#portales" },
  { label: "Precios", href: "#precios" },
  { label: "Add-ons", href: "#addons" },
  { label: "FAQ", href: "#faq" },
];

export default function MarketingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[#0B1120]/80 backdrop-blur-xl border-b border-white/[0.07]"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex-shrink-0">
            <Image
              src="/brand/opai/svg/logo-horizontal.svg"
              alt="OPAI"
              width={100}
              height={32}
              className="h-8 w-auto"
              priority
            />
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-[#94A3B8] hover:text-white transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="#login"
              className="text-sm text-[#94A3B8] hover:text-white transition-colors px-4 py-2"
            >
              Ingresar
            </Link>
            <Link
              href="#demo"
              className="text-sm font-semibold bg-[#00D4AA] hover:bg-[#00B894] text-[#0B1120] px-5 py-2.5 rounded-lg transition-colors"
            >
              Demo gratis
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 text-[#94A3B8] hover:text-white"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Menú"
          >
            {mobileOpen ? (
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M6 18L18 6" />
              </svg>
            ) : (
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-[#0B1120]/95 backdrop-blur-xl border-t border-white/[0.07]">
          <div className="px-4 py-4 space-y-1">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="block py-3 text-[#94A3B8] hover:text-white transition-colors"
              >
                {link.label}
              </a>
            ))}
            <div className="pt-4 border-t border-white/[0.07] space-y-3">
              <Link
                href="#login"
                className="block text-center py-2.5 text-[#94A3B8] hover:text-white transition-colors"
              >
                Ingresar
              </Link>
              <Link
                href="#demo"
                className="block text-center py-2.5 font-semibold bg-[#00D4AA] hover:bg-[#00B894] text-[#0B1120] rounded-lg transition-colors"
              >
                Demo gratis
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
