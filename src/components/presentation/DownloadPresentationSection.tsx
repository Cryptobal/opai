'use client';

/**
 * DownloadPresentationSection - Sección para descargar la presentación completa en PDF
 * Se muestra al final de la presentación pública
 */

import { useState } from 'react';
import { Download, Loader2, FileDown, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DownloadPresentationSectionProps {
  uniqueId: string;
  className?: string;
}

export function DownloadPresentationSection({ uniqueId, className }: DownloadPresentationSectionProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  const handleDownload = async () => {
    setIsLoading(true);
    setError(null);
    setDownloaded(false);
    
    try {
      const response = await fetch('/api/pdf/generate-presentation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uniqueId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Error generando PDF' }));
        throw new Error(errorData.error || 'Error generando PDF');
      }

      // Obtener nombre del archivo del header
      const disposition = response.headers.get('Content-Disposition');
      const fileNameMatch = disposition?.match(/filename="(.+)"/);
      const fileName = fileNameMatch?.[1] || `Presentacion.pdf`;

      // Descargar el blob
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setDownloaded(true);
      
      // Reset del estado después de 5s
      setTimeout(() => setDownloaded(false), 5000);
      
    } catch (err: any) {
      console.error('Error descargando presentación PDF:', err);
      setError(err.message || 'Error al generar el PDF. Intenta nuevamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className={cn(
      'relative bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950',
      'border-t border-white/10',
      'py-16 md:py-20',
      className
    )}>
      {/* Glow decorativo */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-teal-500/10 rounded-full blur-3xl pointer-events-none hidden sm:block" />
      
      <div className="relative z-10 max-w-2xl mx-auto px-6 text-center">
        {/* Icono */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/5 border border-white/10 mb-6">
          <FileDown className="w-8 h-8 text-teal-400" />
        </div>
        
        {/* Texto */}
        <h3 className="text-2xl md:text-3xl font-black text-white mb-3">
          Descarga esta propuesta
        </h3>
        <p className="text-base text-white/60 mb-8 max-w-lg mx-auto">
          Obtén una copia completa de esta presentación en formato PDF para compartir con tu equipo.
        </p>
        
        {/* Botón de descarga */}
        <button
          onClick={handleDownload}
          disabled={isLoading}
          className={cn(
            'inline-flex items-center justify-center gap-3 px-10 py-5 rounded-2xl',
            'text-lg font-bold text-white',
            'transition-all duration-300',
            'shadow-xl',
            'disabled:cursor-not-allowed disabled:hover:scale-100',
            downloaded
              ? 'bg-green-500/20 border-2 border-green-400/50 shadow-green-500/20'
              : 'bg-gradient-to-r from-teal-500 to-blue-500 hover:from-teal-400 hover:to-blue-400 hover:scale-105 hover:shadow-2xl hover:shadow-teal-500/30 border-2 border-teal-400/30',
            isLoading && 'opacity-70'
          )}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>Generando PDF...</span>
            </>
          ) : downloaded ? (
            <>
              <CheckCircle2 className="w-6 h-6 text-green-400" />
              <span>Descarga completada</span>
            </>
          ) : (
            <>
              <Download className="w-6 h-6" />
              <span>Descargar Presentación PDF</span>
            </>
          )}
        </button>
        
        {/* Tiempo estimado */}
        {isLoading && (
          <p className="text-sm text-white/40 mt-4 animate-pulse">
            Esto puede tomar entre 15-30 segundos...
          </p>
        )}
        
        {/* Error */}
        {error && (
          <div className="mt-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-400/30 text-sm text-red-400">
            {error}
          </div>
        )}
      </div>
    </section>
  );
}
