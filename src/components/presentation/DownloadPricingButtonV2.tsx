'use client';

/**
 * DownloadPricingButtonV2 - Botón que genera PDF usando Playwright (idéntico al preview)
 */

import { useState } from 'react';
import { Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PricingData } from '@/types/presentation';

interface DownloadPricingButtonV2Props {
  clientName: string;
  quoteNumber: string;
  pricing: PricingData;
  quoteDate?: string;
  className?: string;
}

export function DownloadPricingButtonV2({
  clientName,
  quoteNumber,
  pricing,
  quoteDate,
  className
}: DownloadPricingButtonV2Props) {
  const [isGenerating, setIsGenerating] = useState(false);
  
  const handleDownload = async () => {
    setIsGenerating(true);
    
    try {
      const response = await fetch('/api/pdf/generate-pricing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientName,
          quoteNumber,
          pricing,
          quoteDate: quoteDate || new Date().toLocaleDateString('es-CL'),
        }),
      });
      
      if (!response.ok) {
        throw new Error('Error generando PDF');
      }
      
      // Descargar el PDF
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Propuesta_${clientName.replace(/\s+/g, '_')}_${quoteNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Error descargando PDF:', error);
      alert('Error generando PDF. Por favor intenta de nuevo.');
    } finally {
      setIsGenerating(false);
    }
  };
  
  return (
    <button
      onClick={handleDownload}
      disabled={isGenerating}
      className={cn(
        'inline-flex items-center justify-center gap-3 px-8 py-4 rounded-xl',
        'text-base font-bold text-white',
        'bg-gradient-to-r from-teal-500 to-blue-500 hover:from-teal-400 hover:to-blue-400',
        'shadow-xl shadow-teal-500/30 hover:shadow-2xl',
        'border-2 border-teal-400/30',
        'transition-all duration-300',
        isGenerating ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105',
        className
      )}
    >
      <Download className={cn('w-5 h-5', isGenerating && 'animate-bounce')} />
      <span>{isGenerating ? 'Generando PDF...' : 'Descargar Propuesta PDF'}</span>
    </button>
  );
}

export default DownloadPricingButtonV2;
