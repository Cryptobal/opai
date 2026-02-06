'use client';

/**
 * PresentationHeader - Header MINIMALISTA
 */

import { CTALinks } from '@/types';
import Image from 'next/image';
import { Calendar, MessageCircle, Sparkles } from 'lucide-react';
import { ZohoToken } from '@/components/presentation/ZohoToken';

interface PresentationHeaderProps {
  logo?: string;
  cta: CTALinks;
  contactName?: string;
  companyName?: string;
  quoteName?: string; // Asunto de la cotización (ej: "Apoyo nocturno Coronel")
  quoteNumber?: string;
  showTokens?: boolean;
  className?: string;
}

export function PresentationHeader({ 
  logo = '/Logo Gard Blanco.png', 
  cta,
  contactName = 'Interesado',
  companyName = 'tu empresa',
  quoteName = 'la cotización',
  quoteNumber = '',
  showTokens = false,
  className 
}: PresentationHeaderProps) {
  const whatsappMessage = `Hola, soy ${contactName} de ${companyName}, vi ${quoteName} y me gustaría conversar`;
  const whatsappLink = `https://wa.me/56982307771?text=${encodeURIComponent(whatsappMessage)}`;
  
  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-slate-950/95 border-b border-white/10 shadow-2xl">
      <div className="w-full px-4 sm:px-6">
        {/* Info propuesta - DISEÑO MEJORADO */}
        {companyName && companyName !== 'tu empresa' && (
          <div className="py-3 border-b border-white/5">
            <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
              {/* Lado izquierdo: Propuesta para + Nombre empresa */}
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                <span className="text-white/60">Propuesta para</span>
                {showTokens ? (
                  <ZohoToken token="account.Account_Name" inline />
                ) : (
                  <span className="font-bold text-white">{companyName}</span>
                )}
              </div>
              
              {/* Centro: Nombre de la propuesta (Subject) */}
              {(quoteName && quoteName !== 'la cotización') || showTokens ? (
                <div className="hidden lg:flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-500/10 border border-teal-400/30">
                  {showTokens ? (
                    <ZohoToken token="quote.Subject" inline />
                  ) : (
                    <span className="font-bold text-teal-400">{quoteName}</span>
                  )}
                </div>
              ) : null}
              
              {/* Lado derecho: Número + Preparado para */}
              <div className="flex items-center gap-3 text-white/70">
                {(quoteNumber || showTokens) && (
                  <span className="flex items-center gap-1">
                    <span className="text-white/50">N°</span> 
                    {showTokens ? (
                      <ZohoToken token="quote.Quote_Number" inline />
                    ) : (
                      <span className="font-semibold text-teal-400">{quoteNumber}</span>
                    )}
                  </span>
                )}
                <span className="hidden sm:inline text-white/30">•</span>
                <span className="hidden sm:inline flex items-center gap-1">
                  Preparado para{' '}
                  {showTokens ? (
                    <ZohoToken token="contact.Full_Name" inline />
                  ) : (
                    <span className="font-semibold text-white">{contactName}</span>
                  )}
                </span>
              </div>
            </div>
          </div>
        )}
        
        {/* Main header - MINIMALISTA */}
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Logo */}
          <a href="https://gard.cl" target="_blank" rel="noopener noreferrer" className="flex-shrink-0 group">
            <div className="relative w-28 h-10 sm:w-32 sm:h-12 transition-transform group-hover:scale-110">
              <Image
                src={logo}
                alt="Gard Security"
                fill
                className="object-contain drop-shadow-[0_0_10px_rgba(0,212,170,0.3)]"
                priority
              />
            </div>
          </a>
          
          {/* CTAs Minimalistas */}
          <div className="flex items-center gap-3">
            {/* WhatsApp - Solo icon */}
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative"
              title="WhatsApp"
            >
              <div className="w-10 h-10 rounded-full bg-green-500/10 border border-green-500/30 hover:bg-green-500 hover:border-green-500 flex items-center justify-center transition-all hover:scale-110">
                <MessageCircle className="w-5 h-5 text-green-500 group-hover:text-white transition-colors" />
              </div>
            </a>
            
            {/* Agendar - Minimalista */}
            <a
              href={cta.meeting_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-teal-500/30 hover:bg-teal-500 hover:border-teal-500 text-white/80 hover:text-white transition-all hover:scale-105 text-sm font-semibold"
              title="Agendar visita técnica"
            >
              <Calendar className="w-4 h-4" />
              <span className="hidden sm:inline">Agendar</span>
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
