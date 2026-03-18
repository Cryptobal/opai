'use client';

/**
 * Section29Contacto - Información de contacto
 * Última sección con todos los canales de comunicación
 */

import { Section29_Contacto } from '@/types/presentation';
import { SectionWrapper, ContainerWrapper } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { Mail, Phone, Globe, MapPin, Linkedin, Instagram, Youtube } from 'lucide-react';

interface Section29ContactoProps {
  data: Section29_Contacto;
}

export function Section29Contacto({ data }: Section29ContactoProps) {
  const theme = useThemeClasses();
  
  return (
    <SectionWrapper id="s29-contacto" className={theme.backgroundAlt}>
      <ContainerWrapper size="lg">
        <div className="text-center mb-12">
          <h2 className={cn('text-3xl md:text-5xl font-bold mb-4', theme.text, theme.headlineWeight)}>
            Hablemos
          </h2>
          <p className={cn('text-lg md:text-xl', theme.textMuted)}>
            Estamos disponibles para responder tus consultas
          </p>
        </div>
        
        {/* Contact grid */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-12">
          {/* Email */}
          <a
            href={`mailto:${data.email}`}
            className={cn(
              'flex items-center gap-4 p-6 rounded-lg border',
              theme.border,
              theme.secondary,
              'hover:scale-105 transition-all'
            )}
          >
            <div className={cn('w-12 h-12 rounded-full flex items-center justify-center', theme.accent, 'bg-opacity-20')}>
              <Mail className={cn('w-6 h-6', theme.accent.replace('bg-', 'text-'))} />
            </div>
            <div className="text-left">
              <div className={cn('text-sm font-semibold mb-1', theme.textMuted)}>
                Email
              </div>
              <div className={cn('text-lg font-bold', theme.text)}>
                {data.email}
              </div>
            </div>
          </a>
          
          {/* Phone */}
          <a
            href={`tel:${data.phone}`}
            className={cn(
              'flex items-center gap-4 p-6 rounded-lg border',
              theme.border,
              theme.secondary,
              'hover:scale-105 transition-all'
            )}
          >
            <div className={cn('w-12 h-12 rounded-full flex items-center justify-center', theme.accent, 'bg-opacity-20')}>
              <Phone className={cn('w-6 h-6', theme.accent.replace('bg-', 'text-'))} />
            </div>
            <div className="text-left">
              <div className={cn('text-sm font-semibold mb-1', theme.textMuted)}>
                Teléfono
              </div>
              <div className={cn('text-lg font-bold', theme.text)}>
                {data.phone}
              </div>
            </div>
          </a>
          
          {/* Website */}
          <a
            href={`https://${data.website}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'flex items-center gap-4 p-6 rounded-lg border',
              theme.border,
              theme.secondary,
              'hover:scale-105 transition-all'
            )}
          >
            <div className={cn('w-12 h-12 rounded-full flex items-center justify-center', theme.accent, 'bg-opacity-20')}>
              <Globe className={cn('w-6 h-6', theme.accent.replace('bg-', 'text-'))} />
            </div>
            <div className="text-left">
              <div className={cn('text-sm font-semibold mb-1', theme.textMuted)}>
                Web
              </div>
              <div className={cn('text-lg font-bold', theme.text)}>
                {data.website}
              </div>
            </div>
          </a>
          
          {/* Address */}
          <div className={cn(
            'flex items-center gap-4 p-6 rounded-lg border',
            theme.border,
            theme.secondary
          )}>
            <div className={cn('w-12 h-12 rounded-full flex items-center justify-center', theme.accent, 'bg-opacity-20')}>
              <MapPin className={cn('w-6 h-6', theme.accent.replace('bg-', 'text-'))} />
            </div>
            <div className="text-left">
              <div className={cn('text-sm font-semibold mb-1', theme.textMuted)}>
                Dirección
              </div>
              <div className={cn('text-base font-bold', theme.text)}>
                {data.address}
              </div>
            </div>
          </div>
        </div>
        
        {/* Social media */}
        {data.social_media && (
          <div className="text-center">
            <p className={cn('text-sm font-semibold mb-4', theme.textMuted)}>
              Síguenos en redes sociales
            </p>
            <div className="flex justify-center gap-4">
              {data.social_media.linkedin && (
                <a
                  href={data.social_media.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'w-12 h-12 rounded-full flex items-center justify-center',
                    theme.secondary,
                    'border',
                    theme.border,
                    'hover:scale-110 transition-all'
                  )}
                >
                  <Linkedin className={cn('w-5 h-5', theme.text)} />
                </a>
              )}
              
              {data.social_media.instagram && (
                <a
                  href={data.social_media.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'w-12 h-12 rounded-full flex items-center justify-center',
                    theme.secondary,
                    'border',
                    theme.border,
                    'hover:scale-110 transition-all'
                  )}
                >
                  <Instagram className={cn('w-5 h-5', theme.text)} />
                </a>
              )}
              
              {data.social_media.youtube && (
                <a
                  href={data.social_media.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'w-12 h-12 rounded-full flex items-center justify-center',
                    theme.secondary,
                    'border',
                    theme.border,
                    'hover:scale-110 transition-all'
                  )}
                >
                  <Youtube className={cn('w-5 h-5', theme.text)} />
                </a>
              )}
            </div>
          </div>
        )}
      </ContainerWrapper>
    </SectionWrapper>
  );
}
