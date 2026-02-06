'use client';

/**
 * PreviewModeToggle - Botón flotante para abrir/cerrar sidebar
 * Solo visible en modo preview
 */

import { LayoutDashboard } from 'lucide-react';
import { motion } from 'framer-motion';

interface PreviewModeToggleProps {
  isOpen: boolean;
  onClick: () => void;
}

export function PreviewModeToggle({ isOpen, onClick }: PreviewModeToggleProps) {
  return (
    <motion.button
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ delay: 1, type: 'spring' }}
      onClick={onClick}
      className="fixed bottom-6 left-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-teal-500 to-blue-500 hover:from-teal-400 hover:to-blue-400 shadow-2xl shadow-teal-500/50 hover:shadow-teal-500/80 flex items-center justify-center transition-all hover:scale-110 border-2 border-teal-400/50 group"
      title="Toggle Preview Navigator"
    >
      <LayoutDashboard className="w-6 h-6 text-white group-hover:rotate-180 transition-transform duration-500" />
      
      {/* Pulse ring */}
      <div className="absolute inset-0 rounded-full border-2 border-teal-400 animate-ping opacity-20" />
    </motion.button>
  );
}
