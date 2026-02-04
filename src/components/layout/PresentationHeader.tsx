'use client';

/**
 * PresentationHeader - Header PREMIUM GARANTIZADO visible
 */

import { CTALinks } from '@/types';
import Image from 'next/image';
import { Calendar, Phone, MessageCircle } from 'lucide-react';

interface PresentationHeaderProps {
  logo?: string;
  cta: CTALinks;
  contactName?: string;
  companyName?: string;
  quoteName?: string;
  className?: string;
}

export function PresentationHeader({ 
  logo = '/Logo Gard Blanco.png', 
  cta,
  contactName = 'Interesado',
  companyName = 'tu empresa',
  quoteName = 'la cotización',
  className 
}: PresentationHeaderProps) {
  // Mensaje de WhatsApp predefinido
  const whatsappMessage = `Hola, soy ${contactName} de ${companyName}, vi ${quoteName} y me gustaría conversar`;
  const whatsappLink = `https://wa.me/56982307771?text=${encodeURIComponent(whatsappMessage)}`;
  
  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-slate-950/90 border-b border-teal-500/20 shadow-2xl">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between h-20 md:h-24">
          {/* Logo */}
          <a href="https://gard.cl" target="_blank" rel="noopener noreferrer" className="flex-shrink-0 group">
            <div className="relative w-32 h-12 md:w-40 md:h-14 transition-transform group-hover:scale-110">
              <Image
                src={logo}
                alt="Gard Security"
                fill
                className="object-contain drop-shadow-[0_0_10px_rgba(0,212,170,0.3)]"
                priority
              />
            </div>
          </a>
          
          {/* CTA Principal (Desktop) - VISIBLE Y PULSANDO */}
          <div className="hidden md:flex items-center gap-4">
            {/* WhatsApp */}
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-green-600 hover:bg-green-500 transition-all hover:scale-105 shadow-lg shadow-green-600/30"
            >
              <MessageCircle className="w-5 h-5" />
              <span>WhatsApp</span>
            </a>
            
            {/* Teléfono */}
            {cta.phone && (
              <a
                href={`tel:${cta.phone}`}
                className="flex items-center gap-2 text-sm font-bold text-white/80 hover:text-teal-400 transition-colors"
              >
                <Phone className="w-4 h-4" />
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
