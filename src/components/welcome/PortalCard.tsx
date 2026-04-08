"use client";

import { useState } from "react";
import { motion } from "framer-motion";

interface PortalCardProps {
  icon: React.ComponentType<{ color: string }>;
  title: string;
  subtitle: string;
  accentColor: string;
  glow: string;
  href?: string;
  index: number;
  onNavigate: (href: string, portalKey: string) => void;
  /** Small icon chips shown below the title, e.g. sub-apps inside the hub. */
  subChips?: string[];
}

/**
 * Vertical portal card used by the /welcome screen.
 *
 * Mobile: stacks full-width. Desktop: sits in a 3-column grid and every
 * card is the same height thanks to `h-full`. The layout is:
 *
 *   ┌─────────────────────────┐
 *   │ [Icon badge]            │
 *   │                         │
 *   │ Title (large)           │
 *   │ Subtitle                │
 *   │                         │
 *   │ ─── hairline ────       │
 *   │ chip · chip · chip  →   │
 *   └─────────────────────────┘
 *
 * Single-mode only — no sub-options expand. If a portal has multiple
 * entry points, those live INSIDE the hub (e.g. /portal/terreno shows
 * marcación/rondas/acceso after pairing), not here.
 */
export function PortalCard({
  icon: Icon,
  title,
  subtitle,
  accentColor,
  glow,
  href,
  index,
  onNavigate,
  subChips = [],
}: PortalCardProps) {
  const [hovered, setHovered] = useState(false);

  function handleClick() {
    if (href) onNavigate(href, title.toLowerCase());
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay: 0.2 + index * 0.08,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="h-full"
    >
      <button
        type="button"
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="relative w-full h-full text-left rounded-[20px] group overflow-hidden transition-all duration-300 flex flex-col"
        style={{
          padding: "22px 22px 18px 22px",
          background: hovered
            ? `linear-gradient(180deg, rgba(255,255,255,0.05), ${glow})`
            : "rgba(255,255,255,0.025)",
          border: `1px solid ${
            hovered ? accentColor + "40" : "rgba(255,255,255,0.06)"
          }`,
          boxShadow: hovered
            ? `0 14px 44px ${glow}, 0 0 0 1px ${accentColor}14, inset 0 1px 0 rgba(255,255,255,0.04)`
            : "0 4px 20px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.025)",
          transform: hovered ? "translateY(-3px)" : "translateY(0)",
          backdropFilter: "blur(18px) saturate(1.15)",
          WebkitBackdropFilter: "blur(18px) saturate(1.15)",
        }}
      >
        {/* Top hairline accent on hover */}
        <div
          aria-hidden
          className="absolute -top-px left-1/2 -translate-x-1/2 h-px transition-all duration-500"
          style={{
            width: hovered ? "70%" : "0%",
            background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
            opacity: hovered ? 1 : 0,
          }}
        />

        {/* Icon badge */}
        <div
          className="flex items-center justify-center shrink-0 transition-all duration-300 mb-5"
          style={{
            width: "54px",
            height: "54px",
            borderRadius: "14px",
            background: hovered ? `${accentColor}18` : `${accentColor}0c`,
            border: `1px solid ${accentColor}30`,
            boxShadow: hovered ? `0 0 28px ${accentColor}25` : "none",
            transform: hovered ? "scale(1.05)" : "scale(1)",
          }}
        >
          <Icon color={accentColor} />
        </div>

        {/* Title + subtitle */}
        <div className="flex-1">
          <div
            className="font-semibold text-[#f9fafb] text-[17px] mb-1"
            style={{ letterSpacing: "-0.02em" }}
          >
            {title}
          </div>
          <div className="text-[13px] text-[#6b7280] leading-snug">
            {subtitle}
          </div>
        </div>

        {/* Sub-chips footer */}
        {subChips.length > 0 ? (
          <div
            className="mt-5 pt-4 flex items-center justify-between gap-2 border-t"
            style={{ borderColor: "rgba(255,255,255,0.05)" }}
          >
            <div className="flex items-center gap-1.5 flex-wrap">
              {subChips.map((chip) => (
                <span
                  key={chip}
                  className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                  style={{
                    background: `${accentColor}10`,
                    border: `1px solid ${accentColor}20`,
                    color: `${accentColor}`,
                    letterSpacing: "0.02em",
                  }}
                >
                  {chip}
                </span>
              ))}
            </div>
            <div
              className="transition-transform duration-300"
              style={{
                color: accentColor,
                transform: hovered ? "translateX(3px)" : "translateX(0)",
              }}
              aria-hidden
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </div>
          </div>
        ) : (
          // When there are no chips, still show the arrow on the right
          <div
            className="mt-5 pt-4 flex justify-end border-t transition-transform duration-300"
            style={{
              borderColor: "rgba(255,255,255,0.05)",
              color: accentColor,
              transform: hovered ? "translateX(3px)" : "translateX(0)",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </div>
        )}
      </button>
    </motion.div>
  );
}
