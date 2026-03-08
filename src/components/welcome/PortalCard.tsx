"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface SubOption {
  label: string;
  subtitle: string;
  href: string;
}

interface PortalCardProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  accentColor: string;
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
  href,
  subOptions,
  index,
  onNavigate,
}: PortalCardProps) {
  const [expanded, setExpanded] = useState(false);

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
      transition={{ duration: 0.4, delay: index * 0.1 }}
    >
      <button
        onClick={handleClick}
        className="w-full text-left rounded-xl border border-white/10 bg-white/5 p-5 transition-all duration-200 hover:bg-white/10 hover:-translate-y-0.5 group"
        style={{
          ["--accent" as string]: accentColor,
          boxShadow: "0 0 0 0 transparent",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = `0 8px 30px -5px ${accentColor}30`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = "0 0 0 0 transparent";
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${accentColor}20` }}
            >
              <Icon className="h-5 w-5" style={{ color: accentColor }} />
            </div>
            <div>
              <div className="font-semibold text-white">{title}</div>
              <div className="text-sm text-white/60">{subtitle}</div>
            </div>
          </div>
          {subOptions && (
            <motion.div
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="h-4 w-4 text-white/40" />
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
                  className="w-full text-left rounded-lg border border-white/10 bg-white/5 p-3.5 transition-all duration-200 hover:bg-white/10"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = `0 4px 20px -5px ${accentColor}25`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <div className="font-medium text-sm text-white">{opt.label}</div>
                  <div className="text-xs text-white/50 mt-0.5">{opt.subtitle}</div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
