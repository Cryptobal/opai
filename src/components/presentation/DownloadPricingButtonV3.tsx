'use client';

/**
 * DownloadPricingButtonV3 - Botón para descargar PDF usando Playwright
 * Genera PDFs idénticos al template HTML
 */

import { useState } from 'react';
import { PricingData } from '@/types/presentation';
import { Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DownloadPricingButtonV3Props {
  clientName: string;
  quoteNumber: string;
  quoteDate: string;
  pricing: PricingData;
  contactEmail?: string;
  contactPhone?: string;
  className?: string;
}

export function DownloadPricingButtonV3({
  clientName,
  quoteNumber,
  quoteDate,
  pricing,
  contactEmail,
  contactPhone,
  className
}: DownloadPricingButtonV3Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/pdf/generate-pricing-v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientName,
          quoteNumber,
          quoteDate,
          pricing,
          contactEmail,
          contactPhone,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error generando PDF');
      }

      // Obtener el blob del PDF
      const blob = await response.blob();
      
      // Crear URL temporal y descargar
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Propuesta_${clientName.replace(/\s+/g, '_')}_${quoteNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      
      // Limpiar
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
    } catch (err: any) {
      console.error('Error descargando PDF:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleDownload}
        disabled={isLoading}
        className={cn(
          'inline-flex items-center justify-center gap-3 px-8 py-4 rounded-xl',
          'text-base font-bold text-white',
          'bg-gradient-to-r from-teal-500 to-blue-500 hover:from-teal-400 hover:to-blue-400',
          'shadow-xl shadow-teal-500/30 hover:shadow-2xl',
          'border-2 border-teal-400/30',
          'transition-all duration-300 hover:scale-105',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100',
          className
        )}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Generando PDF...</span>
          </>
        ) : (
          <>
            <Download className="w-5 h-5" />
            <span>Descargar Propuesta PDF</span>
          </>
        )}
      </button>
      
      {error && (
        <div className="absolute top-full mt-2 left-0 right-0 text-sm text-red-400 text-center">
          {error}
        </div>
      )}
    </div>
  );
}

export default DownloadPricingButtonV3;
