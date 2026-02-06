'use client';

/**
 * SectionWrapper - Envuelve secciones con animaciones on-scroll tipo Qwilr
 * Fade-in y slide-up al hacer scroll
 */

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { cn } from '@/lib/utils';
import { useThemeClasses } from './ThemeProvider';

interface SectionWrapperProps {
  children: ReactNode;
  id: string;
  className?: string;
  animation?: 'fade' | 'slide' | 'scale' | 'none';
  delay?: number;
}

export function SectionWrapper({ 
  children, 
  id, 
  className,
  animation = 'slide',
  delay = 0 
}: SectionWrapperProps) {
  const theme = useThemeClasses();
  const [ref, inView] = useInView({
    triggerOnce: true,
    threshold: 0.1,
    rootMargin: '-50px 0px',
  });
  
  // Variantes de animación (más marcadas)
  const variants = {
    fade: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
    },
    slide: {
      initial: { opacity: 0, y: 80 }, // Más marcado
      animate: { opacity: 1, y: 0 },
    },
    scale: {
      initial: { opacity: 0, scale: 0.85 }, // Más marcado
      animate: { opacity: 1, scale: 1 },
    },
    none: {
      initial: {},
      animate: {},
    },
  };
  
  const selectedVariant = variants[animation];
  
  return (
    <motion.section
      ref={ref}
      id={id}
      initial={selectedVariant.initial}
      animate={inView ? selectedVariant.animate : selectedVariant.initial}
      transition={{ 
        duration: 0.8, // Más lento = más obvio
        ease: [0.16, 1, 0.3, 1], // easeOutExpo más dramático
        delay 
      }}
      className={cn(
        'section-container',
        'py-16 md:py-24',
        theme.text,
        className
      )}
    >
      {children}
    </motion.section>
  );
}

/**
 * ContainerWrapper - Wrapper para el contenedor interno de secciones
 * Mantiene el ancho máximo y padding consistente
 */
interface ContainerWrapperProps {
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  className?: string;
}

export function ContainerWrapper({ 
  children, 
  size = 'lg',
  className 
}: ContainerWrapperProps) {
  const maxWidths = {
    sm: 'max-w-3xl',
    md: 'max-w-4xl',
    lg: 'max-w-6xl',
    xl: 'max-w-7xl',
    full: 'max-w-none',
  };
  
  return (
    <div className={cn(
      'w-full mx-auto px-4 sm:px-6 md:px-8 lg:px-12',
      maxWidths[size],
      className
    )}>
      {children}
    </div>
  );
}

/**
 * AnimatedContent - Componente para animar elementos individuales dentro de una sección
 * Útil para listas, grids, etc.
 */
interface AnimatedContentProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

export function AnimatedContent({ children, delay = 0, className }: AnimatedContentProps) {
  const [ref, inView] = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });
  
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * StaggerContainer - Container para efectos de stagger en lista de elementos
 */
interface StaggerContainerProps {
  children: ReactNode;
  staggerDelay?: number;
  className?: string;
}

export function StaggerContainer({ 
  children, 
  staggerDelay = 0.1,
  className 
}: StaggerContainerProps) {
  const [ref, inView] = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });
  
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={inView ? "visible" : "hidden"}
      variants={{
        visible: {
          transition: {
            staggerChildren: staggerDelay,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * StaggerItem - Item individual para usar con StaggerContainer
 */
interface StaggerItemProps {
  children: ReactNode;
  className?: string;
}

export function StaggerItem({ children, className }: StaggerItemProps) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 },
      }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
