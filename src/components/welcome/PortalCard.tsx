"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface SubOption {
  label: string;
  subtitle: string;
  href: string;
}

interface PortalCardProps {
  icon: React.ComponentType<{ color: string }>;
  title: string;
  subtitle: string;
  accentColor: string;
  glow: string;
  href?: string;
  subOptions?: SubOption[];
  index: number;
  onNavigate: (href: string, portalKey: string) => void;
}

export function PortalCard({
  icon: Icon,
  title,
  subtitle,
  accentColor,
  glow,
  href,
  subOptions,
  index,
  onNavigate,
}: PortalCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);

  function handleClick() {
    if (subOptions) {
      setExpanded((prev) => !prev);
    } else if (href) {
      onNavigate(href, title.toLowerCase());
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.25 + index * 0.08, ease: [0.16, 1, 0.3, 1] }}
      className="h-full"
    >
      <button
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="w-full h-full text-left transition-all duration-300 group"
        style={{
          padding: "20px 22px",
          borderRadius: "16px",
          background: hovered
            ? `linear-gradient(135deg, rgba(255,255,255,0.035), ${glow})`
            : "rgba(255,255,255,0.018)",
          border: `1px solid ${hovered ? accentColor + "35" : "rgba(255,255,255,0.055)"}`,
          boxShadow: hovered
            ? `0 8px 30px ${glow}, 0 0 0 1px ${accentColor}10`
            : "none",
          transform: hovered ? "translateY(-2px)" : "translateY(0)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Top glow line on hover */}
        <div
          className="absolute -top-px left-1/2 -translate-x-1/2 h-px transition-all duration-300"
          style={{
            width: hovered ? "60%" : "0%",
            background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
            opacity: hovered ? 1 : 0,
          }}
        />

        <div className="flex items-center gap-3.5">
          <div
            className="flex items-center justify-center shrink-0 transition-all duration-300"
            style={{
              width: "46px",
              height: "46px",
              borderRadius: "12px",
              background: hovered ? `${accentColor}12` : `${accentColor}06`,
              border: `1px solid ${accentColor}20`,
              transform: hovered ? "scale(1.05)" : "scale(1)",
            }}
          >
            <Icon color={accentColor} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-[#f9fafb] text-[15px]" style={{ letterSpacing: "-0.01em" }}>
              {title}
            </div>
            <div className="text-[13px] text-[#6b7280] mt-0.5">{subtitle}</div>
          </div>
          {subOptions && (
            <motion.div
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </motion.div>
          )}
        </div>
      </button>

      <AnimatePresence>
        {expanded && subOptions && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="mt-2 ml-4 space-y-2">
              {subOptions.map((opt) => (
                <button
                  key={opt.href}
                  onClick={() => onNavigate(opt.href, opt.label.toLowerCase().replace(/\s/g, "-"))}
                  className="w-full text-left rounded-xl p-3.5 transition-all duration-200"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = `${glow}`;
                    e.currentTarget.style.borderColor = `${accentColor}25`;
                    e.currentTarget.style.boxShadow = `0 4px 20px -5px ${glow}`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <div className="font-medium text-sm text-[#f9fafb]">{opt.label}</div>
                  <div className="text-xs text-[#6b7280] mt-0.5">{opt.subtitle}</div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
