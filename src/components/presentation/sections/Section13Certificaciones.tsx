'use client';

/**
 * Section13Certificaciones - Certificaciones y estándares
 * OS-10, Ley Karin, screening
 */

import { Section13_Certificaciones } from '@/types/presentation';
import { SectionWrapper, ContainerWrapper, StaggerContainer, StaggerItem } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { Award, Shield, CheckCircle2, QrCode } from 'lucide-react';
import Image from 'next/image';

interface Section13CertificacionesProps {
  data: Section13_Certificaciones;
}

export function Section13Certificaciones({ data }: Section13CertificacionesProps) {
  const theme = useThemeClasses();
  
  return (
    <SectionWrapper id="s13-certificaciones">
      <ContainerWrapper size="xl">
        {/* Header */}
        <div className="text-center mb-12">
          <Award className={cn('w-16 h-16 mx-auto mb-6', theme.accent.replace('bg-', 'text-'))} />
          
          <h2 className={cn('text-3xl md:text-5xl font-bold mb-4', theme.text, theme.headlineWeight)}>
            Certificaciones y estándares
          </h2>
          
          <p className={cn('text-lg md:text-xl max-w-2xl mx-auto', theme.textMuted)}>
            Cumplimiento verificable de normativas legales y estándares de calidad
          </p>
        </div>
        
        {/* Main certifications */}
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto mb-12">
          {/* OS-10 */}
          <div className={cn('p-6 rounded-lg border text-center', theme.border, theme.secondary)}>
            <div className={cn('w-32 h-32 mx-auto mb-4 relative rounded-lg overflow-hidden', theme.border, 'border-2')}>
              {data.os10_qr && (
                <Image
                  src={data.os10_qr}
                  alt="QR OS-10"
                  fill
                  className="object-cover"
                />
              )}
            </div>
            <h3 className={cn('text-lg font-bold mb-2', theme.text)}>
              OS-10 Vigente
            </h3>
            <p className={cn('text-sm', theme.textMuted)}>
              Escanea el QR para verificar en tiempo real
            </p>
          </div>
          
          {/* Ley Karin */}
          <div className={cn('p-6 rounded-lg border text-center', theme.border, theme.secondary)}>
            <Shield className={cn('w-16 h-16 mx-auto mb-4', theme.accent.replace('bg-', 'text-'))} />
            <h3 className={cn('text-lg font-bold mb-2', theme.text)}>
              Ley Karin
            </h3>
            <p className={cn('text-sm', theme.textMuted)}>
              {data.ley_karin_info}
            </p>
          </div>
          
          {/* Ethics code */}
          <div className={cn('p-6 rounded-lg border text-center', theme.border, theme.secondary)}>
            <Award className={cn('w-16 h-16 mx-auto mb-4', theme.accent.replace('bg-', 'text-'))} />
            <h3 className={cn('text-lg font-bold mb-2', theme.text)}>
              Código de Ética
            </h3>
            <p className={cn('text-sm', theme.textMuted)}>
              {data.ethics_code}
            </p>
          </div>
        </div>
        
        {/* Screening checks */}
        <div className="max-w-4xl mx-auto">
          <h3 className={cn('text-2xl font-bold text-center mb-8', theme.text)}>
            Screening de personal
          </h3>
          
          <StaggerContainer className="grid md:grid-cols-2 gap-4">
            {data.screening_checks.map((check, index) => (
              <StaggerItem key={index}>
                <div className={cn(
                  'flex items-start gap-3 p-4 rounded-lg border',
                  theme.border,
                  theme.secondary
                )}>
                  <CheckCircle2 className={cn('w-5 h-5 flex-shrink-0 mt-0.5', theme.accent.replace('bg-', 'text-'))} />
                  <span className={cn('text-base', theme.text)}>
                    {check}
                  </span>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </ContainerWrapper>
    </SectionWrapper>
  );
}
