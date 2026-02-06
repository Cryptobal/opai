'use client';

/**
 * SectionHeader - Header responsive garantizado para secciones
 * NO se corta en ninguna pantalla
 */

import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface SectionHeaderProps {
  badge?: string;
  icon?: LucideIcon;
  title: string | React.ReactNode;
  subtitle?: string;
  className?: string;
}

export function SectionHeader({ badge, icon: Icon, title, subtitle, className }: SectionHeaderProps) {
  return (
    <div className={cn('text-center mb-8 sm:mb-12 px-4', className)}>
      {/* Badge opcional */}
      {badge && (
        <motion.div
          initial={{ scale: 0 }}
          whileInView={{ scale: 1 }}
          viewport={{ once: true }}
          transition={{ type: 'spring', duration: 0.6 }}
          className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full glass-card border border-teal-400/30 glow-teal mb-4 sm:mb-6"
        >
          {Icon && <Icon className="w-4 h-4 text-teal-400" />}
          <span className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
            {badge}
          </span>
        </motion.div>
      )}
      
      {/* Title - SIEMPRE responsive */}
      <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black mb-3 sm:mb-4 md:mb-6 text-white leading-tight px-2">
        {title}
      </h2>
      
      {/* Subtitle opcional */}
      {subtitle && (
        <p className="text-base sm:text-lg md:text-xl lg:text-2xl text-white/70 max-w-4xl mx-auto px-2">
          {subtitle}
        </p>
      )}
    </div>
  );
}
