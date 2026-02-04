'use client';

/**
 * Section07SistemaCapas - Seguridad como sistema en capas
 * Pirámide de 5 niveles
 */

import { Section07_SistemaCapas } from '@/types/presentation';
import { SectionWrapper, ContainerWrapper, StaggerContainer, StaggerItem } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { Layers } from 'lucide-react';

interface Section07SistemaCapasProps {
  data: Section07_SistemaCapas;
}

export function Section07SistemaCapas({ data }: Section07SistemaCapasProps) {
  const theme = useThemeClasses();
  
  return (
    <SectionWrapper id="s07-sistema-capas">
      <ContainerWrapper size="lg">
        {/* Header */}
        <div className="text-center mb-12">
          <Layers className={cn('w-16 h-16 mx-auto mb-6', theme.accent.replace('bg-', 'text-'))} />
          
          <h2 className={cn('text-3xl md:text-5xl font-bold mb-4', theme.text, theme.headlineWeight)}>
            Seguridad como sistema
          </h2>
          
          <p className={cn('text-xl md:text-2xl mb-4', theme.textMuted)}>
            {data.intro_text}
          </p>
        </div>
        
        {/* Pyramid layers */}
        <StaggerContainer className="max-w-3xl mx-auto space-y-4">
          {[...data.layers].reverse().map((layer, index) => {
            const width = `${60 + (layer.level * 8)}%`;
            const isTop = layer.level === 5;
            
            return (
              <StaggerItem key={layer.level}>
                <div
                  className="mx-auto transition-all hover:scale-105"
                  style={{ width }}
                >
                  <div className={cn(
                    'p-6 rounded-lg border text-center',
                    theme.border,
                    isTop ? theme.accent : theme.secondary,
                    isTop && 'text-white'
                  )}>
                    <div className={cn(
                      'text-sm font-semibold mb-2',
                      isTop ? 'text-white/80' : theme.textMuted
                    )}>
                      Nivel {layer.level}
                    </div>
                    <div className={cn(
                      'text-xl font-bold mb-2',
                      isTop ? 'text-white' : theme.text
                    )}>
                      {layer.name}
                    </div>
                    <div className={cn(
                      'text-sm',
                      isTop ? 'text-white/90' : theme.textMuted
                    )}>
                      {layer.description}
                    </div>
                  </div>
                </div>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
        
        {/* Bottom message */}
        <div className="mt-12 text-center max-w-2xl mx-auto">
          <p className={cn('text-base', theme.textMuted)}>
            Cada capa refuerza la anterior. Ninguna funciona de forma aislada. 
            Este es el modelo que diferencia una <span className={cn('font-bold', theme.text)}>operación profesional</span> de 
            una <span className={cn('font-bold', theme.text)}>presencia reactiva</span>.
          </p>
        </div>
      </ContainerWrapper>
    </SectionWrapper>
  );
}
