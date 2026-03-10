'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';

interface ThemeLogoProps {
  width?: number;
  height?: number;
  className?: string;
}

/**
 * ThemeLogo — Muestra el logo del escudo en blanco (dark) o azul (light)
 * usando CSS visibility para evitar layout shift.
 */
export function ThemeLogo({ width = 28, height = 28, className }: ThemeLogoProps) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width, height }}>
      {/* Logo azul: visible en light, oculto en dark */}
      <Image
        src="/icons/isotipo-dark.png"
        alt={process.env.NEXT_PUBLIC_COMPANY_NAME || "OPAI"}
        width={width}
        height={height}
        className="absolute inset-0 h-full w-full object-contain dark:hidden"
      />
      {/* Logo blanco: oculto en light, visible en dark */}
      <Image
        src="/icons/isotipo-white.png"
        alt={process.env.NEXT_PUBLIC_COMPANY_NAME || "OPAI"}
        width={width}
        height={height}
        className="absolute inset-0 h-full w-full object-contain hidden dark:block"
      />
    </span>
  );
}
