'use client';

/**
 * YouTubeEmbed - Componente para incrustar videos de YouTube responsive
 */

import { cn } from '@/lib/utils';
import { Play } from 'lucide-react';
import { motion } from 'framer-motion';

interface YouTubeEmbedProps {
  videoId: string;
  title?: string;
  className?: string;
}

export function YouTubeEmbed({ videoId, title = 'Video', className }: YouTubeEmbedProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className={cn('relative group', className)}
    >
      {/* Glow effect */}
      <div className="absolute -inset-1 bg-gradient-to-r from-teal-500/20 to-blue-500/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-500" />
      
      {/* Video container */}
      <div className="relative aspect-video rounded-2xl overflow-hidden border-2 border-white/10 group-hover:border-teal-400/50 transition-all shadow-2xl">
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?controls=1&modestbranding=1&rel=0&showinfo=0`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full"
        />
      </div>
      
      {/* Play icon overlay (solo visual) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-20 transition-opacity">
        <Play className="w-20 h-20 text-white" fill="white" />
      </div>
    </motion.div>
  );
}

/**
 * Extrae videoId de una URL de YouTube
 */
export function extractYouTubeId(url: string): string {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  
  return url; // Si ya es un ID, retornarlo
}
