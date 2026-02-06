'use client';

/**
 * DownloadPricingButton - Botón para descargar PDF de pricing
 * IMPORTANTE: Este componente solo se carga en el cliente (ver dynamic import en Section23)
 */

import { PDFDownloadLink } from '@react-pdf/renderer';
import { PricingPDF } from '../pdf/PricingPDF';
import { PricingData } from '@/types/presentation';
import { Download } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DownloadPricingButtonProps {
  clientName: string;
  quoteNumber: string;
  quoteDate: string;
  pricing: PricingData;
  contactEmail?: string;
  contactPhone?: string;
  className?: string;
}

export function DownloadPricingButton({
  clientName,
  quoteNumber,
  quoteDate,
  pricing,
  contactEmail,
  contactPhone,
  className
}: DownloadPricingButtonProps) {
  const fileName = `Propuesta_${clientName.replace(/\s+/g, '_')}_${quoteNumber}.pdf`;
  
  return (
    <PDFDownloadLink
      document={
        <PricingPDF
          clientName={clientName}
          quoteNumber={quoteNumber}
          quoteDate={quoteDate}
          pricing={pricing}
          contactEmail={contactEmail}
          contactPhone={contactPhone}
        />
      }
      fileName={fileName}
      className={cn(
        'inline-flex items-center justify-center gap-3 px-8 py-4 rounded-xl',
        'text-base font-bold text-white',
        'bg-gradient-to-r from-teal-500 to-blue-500 hover:from-teal-400 hover:to-blue-400',
        'shadow-xl shadow-teal-500/30 hover:shadow-2xl',
        'border-2 border-teal-400/30',
        'transition-all duration-300 hover:scale-105',
        'no-underline',
        className
      )}
    >
      {({ loading }: { loading: boolean }) => (
        <>
          <Download className="w-5 h-5" />
          <span>{loading ? 'Generando PDF...' : 'Descargar Propuesta PDF'}</span>
        </>
      )}
    </PDFDownloadLink>
  );
}

// Export default para dynamic import
export default DownloadPricingButton;
