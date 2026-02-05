'use client';

/**
 * Success Modal
 * 
 * Modal de confirmación después de enviar email exitosamente
 */

import { useState } from 'react';

interface SuccessModalProps {
  publicUrl: string;
  recipientEmail: string;
  companyName: string;
  recipientPhone?: string;
  onClose: () => void;
}

export function SuccessModal({ publicUrl, recipientEmail, companyName, recipientPhone, onClose }: SuccessModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsApp = () => {
    const message = encodeURIComponent(
      `Hola! Te envié nuestra propuesta para ${companyName}. Puedes verla aquí: ${publicUrl}`
    );
    // Si hay número de teléfono, usarlo. Si no, WhatsApp genérico
    const whatsappUrl = recipientPhone 
      ? `https://wa.me/${recipientPhone.replace(/\D/g, '')}?text=${message}`
      : `https://wa.me/?text=${message}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full border border-white/10 overflow-hidden">
        {/* Header con animación de éxito */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-500 px-6 py-8 text-center">
          <div className="text-6xl mb-4 animate-bounce">✅</div>
          <h2 className="text-3xl font-bold text-white mb-2">
            ¡Email Enviado!
          </h2>
          <p className="text-white/90">
            Presentación enviada exitosamente
          </p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Info del envío */}
          <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-white/60 text-sm">📨 Enviado a:</span>
              <span className="text-white font-semibold">{recipientEmail}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white/60 text-sm">🏢 Cliente:</span>
              <span className="text-white font-semibold">{companyName}</span>
            </div>
          </div>

          {/* Link público */}
          <div>
            <label className="text-white font-semibold mb-2 block">
              🔗 Link público de la presentación:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={publicUrl}
                readOnly
                className="flex-1 px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm"
              />
              <button
                onClick={handleCopy}
                className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors font-semibold"
              >
                {copied ? '✓ Copiado' : '📋 Copiar'}
              </button>
            </div>
          </div>

          {/* Botón de WhatsApp */}
          <button
            onClick={handleWhatsApp}
            className="w-full px-6 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
          >
            <span className="text-xl">💬</span>
            Compartir por WhatsApp
          </button>

          {/* Info adicional */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
            <p className="text-blue-200 text-xs">
              📊 Podrás hacer seguimiento de aperturas y clicks en el dashboard de administración.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-800/50 px-6 py-4 flex justify-center">
          <button
            onClick={onClose}
            className="px-8 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors font-semibold"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
