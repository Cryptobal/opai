'use client';

/**
 * @deprecated DESDE: 2026-04-16
 *
 * Este módulo forma parte del Sistema de Presentación Comercial de 29 secciones,
 * que NO se muestra al cliente final. El flujo activo de envío al cliente usa
 * el Portal del Cliente (ver `sendQuoteToPortal()` en
 * `src/modules/cpq/send/send-quote-to-portal.ts`).
 *
 * NO USAR EN CÓDIGO NUEVO. Este archivo será eliminado después de
 * 2026-06-15 una vez confirmada estabilidad.
 *
 * Ver: src/lib/_deprecated/README.md
 */

/**
 * Success Modal
 * 
 * Modal de confirmación después de enviar email exitosamente.
 * Usa plantilla de WhatsApp editable desde Configuración CRM.
 */

import { useEffect, useState } from 'react';

/** Reemplaza tokens {key} en un template (client-side version) */
function resolveTokens(template: string, values: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    const token = key.startsWith("{") ? key : `{${key}}`;
    result = result.replaceAll(token, value || "");
  }
  result = result.replace(/\{[a-zA-Z_]+\}/g, "");
  result = result.replace(/\n{3,}/g, "\n\n").trim();
  return result;
}

interface SuccessModalProps {
  publicUrl: string;
  recipientEmail: string;
  companyName: string;
  recipientPhone?: string;
  contactName?: string;
  onClose: () => void;
}

export function SuccessModal({ publicUrl, recipientEmail, companyName, recipientPhone, contactName, onClose }: SuccessModalProps) {
  const [copied, setCopied] = useState(false);
  const [waTemplate, setWaTemplate] = useState<string | null>(null);

  // Cargar plantilla de WhatsApp "proposal_sent"
  useEffect(() => {
    fetch("/api/crm/whatsapp-templates")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          const tpl = data.data?.find((t: { slug: string }) => t.slug === "proposal_sent");
          if (tpl) setWaTemplate(tpl.body);
        }
      })
      .catch(() => {
        // Silently fall back to default
      });
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsApp = () => {
    const template = waTemplate || `Hola {contactName}, te envío la propuesta para {companyName}:\n\n{proposalUrl}`;
    const resolved = resolveTokens(template, {
      contactName: contactName || "",
      companyName,
      proposalUrl: publicUrl,
    });
    const message = encodeURIComponent(resolved);
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
