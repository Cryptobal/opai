'use client';

/**
 * PresentationFooter - Footer premium con información de contacto
 * Único punto de contacto al final de la presentación
 */

import { cn } from '@/lib/utils';
import { ContactInfo } from '@/types';
import Image from 'next/image';
import Link from 'next/link';
import { Mail, Phone, Globe, MapPin, Linkedin, Instagram, X as XIcon, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';

interface PresentationFooterProps {
  logo?: string;
  contact: ContactInfo;
  address?: string;
  website?: string;
  social_media?: {
    linkedin?: string;
    instagram?: string;
    x?: string;
    youtube?: string;
  };
  className?: string;
}

export function PresentationFooter({ 
  logo = '/Logo Gard Blanco.png',
  contact,
  address,
  website,
  social_media,
  className 
}: PresentationFooterProps) {
  const currentYear = new Date().getFullYear();
  
  // Google Maps link directo a Gard Security
  const googleMapsLink = 'https://www.google.com/maps/place/Gard+Security/@-33.3829252,-70.5343354,1028m/data=!3m2!1e3!4b1!4m6!3m5!1s0xad000dfe016a150d:0x3fcad00015b6e4bd!8m2!3d-33.3829252!4d-70.5317605!16s%2Fg%2F11vsbpgym7?entry=ttu&g_ep=EgoyMDI2MDIwMS4wIKXMDSoKLDEwMDc5MjA2N0gBUAM%3D';
  
  return (
    <footer className={cn('relative overflow-hidden', className)}>
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
      <div className="absolute inset-0 bg-gradient-to-t from-teal-500/5 via-transparent to-transparent" />
      
      <div className="relative z-10 container mx-auto px-4 md:px-6 py-16 md:py-20">
        {/* Main content */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-12">
          {/* Logo y descripción */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <a href="https://gard.cl" target="_blank" rel="noopener noreferrer" className="inline-block group">
              <div className="relative w-40 h-16 mb-6 transition-transform group-hover:scale-110">
                <Image
                  src={logo}
                  alt="Gard Security"
                  fill
                  className="object-contain drop-shadow-[0_0_10px_rgba(0,212,170,0.3)]"
                />
              </div>
            </a>
            <p className="text-base text-white/70 mb-6 leading-relaxed">
              Seguridad privada diseñada para continuidad operacional
            </p>
          </motion.div>
          
          {/* Contacto */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            <h3 className="text-lg font-black text-white mb-6 uppercase tracking-wider">
              Contacto
            </h3>
            <div className="space-y-4">
              {contact.email && (
                <a
                  href={`mailto:${contact.email}`}
                  className="flex items-center gap-3 text-base text-white/80 hover:text-teal-400 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-teal-500/20 transition-colors">
                    <Mail className="w-5 h-5" />
                  </div>
                  <span>{contact.email}</span>
                </a>
              )}
              
              {contact.phone && (
                <a
                  href={`tel:${contact.phone}`}
                  className="flex items-center gap-3 text-base text-white/80 hover:text-teal-400 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-teal-500/20 transition-colors">
                    <Phone className="w-5 h-5" />
                  </div>
                  <span>{contact.phone}</span>
                </a>
              )}
              
              {website && (
                <a
                  href={`https://${website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 text-base text-white/80 hover:text-teal-400 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-teal-500/20 transition-colors">
                    <Globe className="w-5 h-5" />
                  </div>
                  <span>{website}</span>
                </a>
              )}
              
              {address && googleMapsLink && (
                <a
                  href={googleMapsLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 text-base text-white/80 hover:text-teal-400 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-teal-500/20 transition-colors flex-shrink-0">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div className="flex items-start gap-2">
                    <span>{address}</span>
                    <ExternalLink className="w-4 h-4 opacity-50" />
                  </div>
                </a>
              )}
            </div>
          </motion.div>
          
          {/* Redes sociales */}
          {social_media && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              <h3 className="text-lg font-black text-white mb-6 uppercase tracking-wider">
                Síguenos
              </h3>
              <div className="flex gap-4">
                {social_media.linkedin && (
                  <a
                    href={social_media.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-12 h-12 rounded-xl bg-white/5 hover:bg-gradient-to-br hover:from-teal-500 hover:to-blue-500 flex items-center justify-center transition-all hover:scale-110 shadow-lg hover:shadow-teal-500/50"
                  >
                    <Linkedin className="w-6 h-6 text-white" />
                  </a>
                )}
                
                {social_media.instagram && (
                  <a
                    href={social_media.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-12 h-12 rounded-xl bg-white/5 hover:bg-gradient-to-br hover:from-pink-500 hover:to-purple-500 flex items-center justify-center transition-all hover:scale-110 shadow-lg hover:shadow-pink-500/50"
                  >
                    <Instagram className="w-6 h-6 text-white" />
                  </a>
                )}
                
                {social_media.x && (
                  <a
                    href={social_media.x}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-12 h-12 rounded-xl bg-white/5 hover:bg-gradient-to-br hover:from-slate-600 hover:to-slate-500 flex items-center justify-center transition-all hover:scale-110 shadow-lg hover:shadow-slate-500/50"
                  >
                    <XIcon className="w-6 h-6 text-white" />
                  </a>
                )}
                
                {social_media.youtube && (
                  <a
                    href={social_media.youtube}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-12 h-12 rounded-xl bg-white/5 hover:bg-gradient-to-br hover:from-red-500 hover:to-red-600 flex items-center justify-center transition-all hover:scale-110 shadow-lg hover:shadow-red-500/50"
                  >
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                    </svg>
                  </a>
                )}
              </div>
            </motion.div>
          )}
        </div>
        
        {/* Copyright */}
        <div className="pt-8 border-t border-white/10 text-center">
          <p className="text-sm text-white/50">
            © {currentYear} Gard Security. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
