import { cn } from '@/lib/utils';

interface AvatarProps {
  name: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Avatar - Inicial circular con color determinístico
 */
export function Avatar({ name, className, size = 'md' }: AvatarProps) {
  const initial = name?.charAt(0)?.toUpperCase() || '?';
  
  // Color determinístico basado en el nombre
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const colors = [
    'bg-blue-500/15 text-blue-400',
    'bg-emerald-500/15 text-emerald-400',
    'bg-purple-500/15 text-purple-400',
    'bg-amber-500/15 text-amber-400',
    'bg-pink-500/15 text-pink-400',
    'bg-cyan-500/15 text-cyan-400',
  ];
  const colorClass = colors[hash % colors.length];

  const sizeClasses = {
    sm: 'h-6 w-6 text-xs',
    md: 'h-8 w-8 text-sm',
    lg: 'h-10 w-10 text-base',
  };

  return (
    <div className={cn(
      'flex shrink-0 items-center justify-center rounded-full font-semibold',
      colorClass,
      sizeClasses[size],
      className
    )}>
      {initial}
    </div>
  );
}
