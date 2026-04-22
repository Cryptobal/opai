/**
 * ZohoToken - Componente para mostrar tokens de Zoho resaltados
 * Se usa cuando showTokens=true para mostrar el campo real de Zoho
 */

import { cn } from '@/lib/utils';

interface ZohoTokenProps {
  token: string;
  className?: string;
  inline?: boolean;
}

export function ZohoToken({ token, className, inline = false }: ZohoTokenProps) {
  const baseClasses = "font-mono text-[10px] font-semibold bg-yellow-400/80 text-slate-900 px-1.5 py-0.5 rounded border border-yellow-500";
  
  if (inline) {
    return (
      <span className={cn(baseClasses, "inline-block", className)}>
        {token}
      </span>
    );
  }
  
  return (
    <div className={cn(baseClasses, "inline-block", className)}>
      {token}
    </div>
  );
}
