'use client';

/**
 * TrustBadges - Componente para mostrar badges de confianza
 * Usado para mostrar OS-10, compliance, SLAs, etc.
 */

import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { Shield, Clock, CheckCircle, Award } from 'lucide-react';

interface TrustBadge {
  icon: 'shield' | 'clock' | 'check' | 'award';
  title: string;
  value: string;
  description?: string;
}

interface TrustBadgesProps {
  badges: TrustBadge[];
  className?: string;
}

const iconMap = {
  shield: Shield,
  clock: Clock,
  check: CheckCircle,
  award: Award,
};

export function TrustBadges({ badges, className }: TrustBadgesProps) {
  const theme = useThemeClasses();
  
  return (
    <div className={cn(
      'grid grid-cols-2 md:grid-cols-4 gap-4',
      className
    )}>
      {badges.map((badge, index) => {
        const Icon = iconMap[badge.icon];
        
        return (
          <div
            key={index}
            className={cn(
              'p-4 rounded-lg border text-center',
              theme.border,
              theme.secondary,
              'transition-all hover:scale-105'
            )}
          >
            <Icon className={cn(
              'w-8 h-8 mx-auto mb-2',
              theme.accent.replace('bg-', 'text-')
            )} />
            
            <div className={cn('text-xs font-semibold mb-1', theme.textMuted)}>
              {badge.title}
            </div>
            
            <div className={cn('text-lg font-bold mb-1', theme.text)}>
              {badge.value}
            </div>
            
            {badge.description && (
              <div className={cn('text-xs', theme.textMuted)}>
                {badge.description}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Badge individual para casos específicos
 */
interface SingleBadgeProps {
  badge: TrustBadge;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function SingleBadge({ badge, className, size = 'md' }: SingleBadgeProps) {
  const theme = useThemeClasses();
  const Icon = iconMap[badge.icon];
  
  const sizeClasses = {
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  };
  
  const iconSizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
  };
  
  return (
    <div
      className={cn(
        'rounded-lg border inline-flex items-center gap-3',
        theme.border,
        theme.secondary,
        sizeClasses[size],
        className
      )}
    >
      <Icon className={cn(
        iconSizeClasses[size],
        theme.accent.replace('bg-', 'text-')
      )} />
      
      <div className="text-left">
        <div className={cn('text-xs font-semibold', theme.textMuted)}>
          {badge.title}
        </div>
        <div className={cn('font-bold', theme.text)}>
          {badge.value}
        </div>
      </div>
    </div>
  );
}
