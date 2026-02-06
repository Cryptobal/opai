/**
 * Pricing Format Page - Vista previa del formato de propuesta económica
 * Muestra cómo se verá el PDF para poder editarlo
 */

import { getMockPresentationPayload } from '@/lib/mock-data';
import { formatCurrency } from '@/lib/utils';
import { redirect } from 'next/navigation';
import Image from 'next/image';

interface PricingFormatPageProps {
  searchParams: Promise<{
    admin?: string;
  }>;
}

export default async function PricingFormatPage(props: PricingFormatPageProps) {
  const searchParams = await props.searchParams;
  
  if (searchParams.admin !== 'true') {
    redirect('/opai');
  }
  
  const payload = getMockPresentationPayload();
  const { client, quote, contact } = payload;
  const { pricing } = payload.sections.s23_propuesta_economica;
  
  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-4xl mx-auto bg-white shadow-2xl rounded-lg overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-500 to-blue-500 p-8 text-white">
          <div className="flex items-center justify-between mb-6">
            <div className="relative w-32 h-12">
              <Image
                src="/Logo Gard Blanco.png"
                alt="Gard Security"
                width={128}
                height={48}
                className="object-contain"
                priority
              />
            </div>
            <div className="text-right text-sm">
              <div>Página 1 de 1</div>
            </div>
          </div>
          
          <h1 className="text-3xl font-black mb-4">PROPUESTA ECONÓMICA</h1>
          <div className="space-y-1 text-sm">
            <div><span className="font-semibold">Para:</span> {client.company_name}</div>
            <div><span className="font-semibold">Cotización:</span> {quote.number}</div>
            <div><span className="font-semibold">Fecha:</span> {quote.date}</div>
          </div>
        </div>
        
        {/* Tabla de items */}
        <div className="p-8">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-100 border-b-2 border-teal-500">
                <th className="text-left p-3 text-sm font-bold text-gray-700">Descripción</th>
                <th className="text-center p-3 text-sm font-bold text-gray-700">Cant.</th>
                <th className="text-right p-3 text-sm font-bold text-gray-700">P. Unit.</th>
                <th className="text-right p-3 text-sm font-bold text-gray-700">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {pricing.items.map((item, index) => (
                <tr key={index} className="border-b border-gray-200">
                  <td className="p-3 text-sm text-gray-800">{item.description}</td>
                  <td className="p-3 text-sm text-center text-gray-600">{item.quantity}</td>
                  <td className="p-3 text-sm text-right text-gray-600">{formatCurrency(item.unit_price)}</td>
                  <td className="p-3 text-sm text-right font-semibold text-gray-800">{formatCurrency(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {/* Total */}
          <div className="mt-6 bg-teal-50 p-6 rounded-lg border-2 border-teal-500">
            <div className="flex justify-between items-center">
              <span className="text-xl font-black text-gray-800">TOTAL NETO MENSUAL</span>
              <span className="text-3xl font-black text-teal-600">{formatCurrency(pricing.subtotal)}</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">Valores netos. IVA se factura según ley.</p>
          </div>
          
          {/* Términos */}
          <div className="mt-6 bg-gray-50 p-6 rounded-lg">
            <h3 className="text-sm font-bold text-gray-800 mb-3">Condiciones Comerciales</h3>
            <div className="space-y-2 text-sm text-gray-700">
              {pricing.payment_terms && (
                <div>• <span className="font-semibold">Forma de pago:</span> {pricing.payment_terms}</div>
              )}
              {pricing.adjustment_terms && (
                <div>• <span className="font-semibold">Reajuste:</span> {pricing.adjustment_terms}</div>
              )}
              {pricing.notes?.map((note, i) => (
                <div key={i}>• {note}</div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="bg-gray-100 p-6 border-t border-gray-200">
          <div className="flex justify-between items-center text-sm text-gray-600">
            <div>
              <div>{contact.email}</div>
              <div>{contact.phone}</div>
            </div>
            <div className="text-right">
              <div className="font-bold text-gray-800">Gard Security</div>
              <div>www.gard.cl</div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Nota para admin */}
      <div className="mt-8 text-center">
        <p className="text-sm text-gray-600">
          Vista previa del formato PDF • Solo visible en modo admin
        </p>
      </div>
    </div>
  );
}

export const metadata = {
  title: 'Formato Propuesta Económica | Gard Docs',
  description: 'Vista previa del formato de propuesta económica PDF',
  robots: 'noindex, nofollow',
};
