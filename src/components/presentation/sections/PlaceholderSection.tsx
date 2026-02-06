'use client';

/**
 * PlaceholderSection - Sección genérica placeholder
 * Se usa temporalmente para secciones que aún no están implementadas
 */

import { SectionWrapper, ContainerWrapper } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { FileQuestion } from 'lucide-react';

interface PlaceholderSectionProps {
  id: string;
  title: string;
  data: any;
}

export function PlaceholderSection({ id, title, data }: PlaceholderSectionProps) {
  const theme = useThemeClasses();
  
  // Determinar background alternado según ID
  const sectionNumber = parseInt(id.replace('s', ''));
  const isEven = sectionNumber % 2 === 0;
  
  return (
    <SectionWrapper 
      id={id} 
      className={isEven ? theme.backgroundAlt : 'bg-transparent'}
    >
      <ContainerWrapper>
        <div className="text-center">
          {/* Icono */}
          <div className={cn('inline-flex items-center justify-center w-16 h-16 rounded-full mb-6', theme.accent, 'bg-opacity-20')}>
            <FileQuestion className={cn('w-8 h-8', theme.accent.replace('bg-', 'text-'))} />
          </div>
          
          {/* Título */}
          <h2 className={cn('text-2xl md:text-4xl font-bold mb-4', theme.text, theme.headlineWeight)}>
            {title}
          </h2>
          
          {/* Subtitle */}
          <p className={cn('text-base md:text-lg mb-6', theme.textMuted)}>
            Sección {id.toUpperCase()} - En implementación
          </p>
          
          {/* Data preview */}
          <div className={cn('max-w-2xl mx-auto p-6 rounded-lg border', theme.border, theme.secondary)}>
            <pre className={cn('text-xs text-left overflow-x-auto', theme.textMuted)}>
              {JSON.stringify(data, null, 2).slice(0, 500)}
              {JSON.stringify(data).length > 500 && '\n...'}
            </pre>
          </div>
        </div>
      </ContainerWrapper>
    </SectionWrapper>
  );
}
