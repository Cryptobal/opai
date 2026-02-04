'use client';

/**
 * PresentationHeader - Header PREMIUM GARANTIZADO visible
 */

import { CTALinks } from '@/types';
import Image from 'next/image';
import Link from 'next/link';
import { Calendar, Phone } from 'lucide-react';

interface PresentationHeaderProps {
  logo?: string;
  cta: CTALinks;
  className?: string;
}

export function PresentationHeader({ 
  logo = '/Logo Gard Blanco.png', 
  cta, 
  className 
}: PresentationHeaderProps) {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-slate-950/90 border-b border-teal-500/20 shadow-2xl">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between h-20 md:h-24">
          {/* Logo */}
          <Link href="/" className="flex-shrink-0 group">
            <div className="relative w-32 h-12 md:w-40 md:h-14 transition-transform group-hover:scale-110">
              <Image
                src={logo}
                alt="Gard Security"
                fill
                className="object-contain drop-shadow-[0_0_10px_rgba(0,212,170,0.3)]"
                priority
              />
            </div>
          </Link>
          
          {/* CTA Principal (Desktop) - VISIBLE Y PULSANDO */}
          <div className="hidden md:flex items-center gap-6">
            {/* Teléfono */}
            {cta.phone && (
              <a
                href={`tel:${cta.phone}`}
                className="flex items-center gap-2 text-base font-bold text-white hover:text-teal-400 transition-colors"
              >
                <Phone className="w-5 h-5" />
                <span>{cta.phone}</span>
              </a>
            )}
            
            {/* CTA Button - MUY OBVIO */}
            <a
              href={cta.meeting_link}
              target="_blank"
              rel="noopener noreferrer"
              className="relative group inline-flex items-center justify-center gap-3 px-8 py-4 rounded-2xl text-base font-black text-white uppercase tracking-wide bg-gradient-to-r from-teal-500 to-teal-400 hover:from-teal-400 hover:to-teal-300 transition-all duration-300 hover:scale-110 shadow-[0_0_30px_rgba(0,212,170,0.6)] hover:shadow-[0_0_50px_rgba(0,212,170,0.9)] border-2 border-teal-400 animate-pulse"
            >
              <Calendar className="w-6 h-6" />
              <span>Agendar visita técnica</span>
            </a>
          </div>
          
          {/* Mobile */}
          <a
            href={cta.meeting_link}
            target="_blank"
            rel="noopener noreferrer"
            className="md:hidden inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-black text-white bg-gradient-to-r from-teal-500 to-teal-400 shadow-[0_0_20px_rgba(0,212,170,0.5)] border-2 border-teal-400 animate-pulse"
          >
            <Calendar className="w-4 h-4" />
            <span>Agendar</span>
          </a>
        </div>
      </div>
    </header>
  );
}
