'use client';

/**
 * PresentationHeader - Header optimizado 100%
 */

import { CTALinks } from '@/types';
import Image from 'next/image';
import { Calendar, MessageCircle, Sparkles } from 'lucide-react';

interface PresentationHeaderProps {
  logo?: string;
  cta: CTALinks;
  contactName?: string;
  companyName?: string;
  quoteName?: string;
  quoteNumber?: string;
  className?: string;
}

export function PresentationHeader({ 
  logo = '/Logo Gard Blanco.png', 
  cta,
  contactName = 'Interesado',
  companyName = 'tu empresa',
  quoteName = 'la cotización',
  quoteNumber = '',
  className 
}: PresentationHeaderProps) {
  const whatsappMessage = `Hola, soy ${contactName} de ${companyName}, vi ${quoteName} y me gustaría conversar`;
  const whatsappLink = `https://wa.me/56982307771?text=${encodeURIComponent(whatsappMessage)}`;
  
  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-slate-950/95 border-b border-teal-500/20 shadow-2xl">
      <div className="w-full px-4 sm:px-6">
        {/* Info propuesta - NUEVA LÍNEA */}
        {(companyName || quoteNumber) && companyName !== 'tu empresa' && (
          <div className="py-2 border-b border-white/5">
            <div className="flex items-center justify-center gap-2 text-xs text-white/70">
              <Sparkles className="w-3 h-3 text-teal-400" />
              <span>
                Propuesta para <span className="font-bold text-white">{companyName}</span>
                {quoteNumber && (
                  <> — <span className="font-bold text-teal-400">{quoteNumber}</span></>
                )}
              </span>
              <span className="hidden sm:inline">• Preparado para {contactName}</span>
            </div>
          </div>
        )}
        
        {/* Main header */}
        <div className="flex items-center justify-between h-16 sm:h-18">
          {/* Logo */}
          <a href="https://gard.cl" target="_blank" rel="noopener noreferrer" className="flex-shrink-0 group">
            <div className="relative w-24 h-8 sm:w-32 sm:h-12 transition-transform group-hover:scale-110">
              <Image
                src={logo}
                alt="Gard Security"
                fill
                className="object-contain drop-shadow-[0_0_10px_rgba(0,212,170,0.3)]"
                priority
              />
            </div>
          </a>
          
          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-3">
            {/* WhatsApp - MISMO TAMAÑO que Agendar */}
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-black text-white uppercase tracking-wide bg-green-600 hover:bg-green-500 transition-all duration-300 hover:scale-105 shadow-lg shadow-green-600/40 border-2 border-green-500"
            >
              <MessageCircle className="w-5 h-5" />
              <span>WhatsApp</span>
            </a>
            
            {/* Agendar - PULSANDO */}
            <a
              href={cta.meeting_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-black text-white uppercase tracking-wide bg-gradient-to-r from-teal-500 to-teal-400 hover:from-teal-400 hover:to-teal-300 transition-all duration-300 hover:scale-105 shadow-lg shadow-teal-500/50 border-2 border-teal-400 animate-pulse"
            >
              <Calendar className="w-5 h-5" />
              <span>Agendar visita</span>
            </a>
          </div>
          
          {/* Mobile CTAs */}
          <div className="md:hidden flex items-center gap-2">
            {/* WhatsApp Mobile */}
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white bg-green-600 shadow-md"
            >
              <MessageCircle className="w-4 h-4" />
              <span>WhatsApp</span>
            </a>
            
            {/* Agendar Mobile */}
            <a
              href={cta.meeting_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-teal-500 to-teal-400 shadow-md animate-pulse"
            >
              <Calendar className="w-4 h-4" />
              <span>Agendar</span>
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
