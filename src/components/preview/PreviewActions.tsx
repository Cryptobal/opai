'use client';

/**
 * Preview Actions
 * 
 * Botones de acción para la vista de preview de borrador
 * Incluye modal de envío con CC y confirmación
 */

import { useState } from 'react';
import { SendEmailModal } from './SendEmailModal';
import { SuccessModal } from './SuccessModal';

interface PreviewActionsProps {
  sessionId: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
}

interface SendResult {
  uniqueId: string;
  publicUrl: string;
  recipientEmail: string;
  recipientPhone?: string;
}

export function PreviewActions({ sessionId, companyName, contactName, contactEmail }: PreviewActionsProps) {
  const [showSendModal, setShowSendModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);

  const handleCancel = () => {
    // Intentar cerrar la ventana (si es popup)
    if (window.opener) {
      window.close();
    } else {
      // Si no es popup, volver atrás
      window.history.back();
    }
  };

  const handleSendSuccess = (result: SendResult) => {
    setSendResult(result);
    setShowSendModal(false);
    setShowSuccessModal(true);
  };

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-lg border-t border-white/10 p-4 shadow-2xl">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row gap-3 justify-center items-center">
          <button
            onClick={() => setShowSendModal(true)}
            className="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-teal-500 to-blue-500 text-white font-bold rounded-lg hover:scale-105 transition-transform text-center shadow-lg shadow-teal-500/50"
          >
            📧 Enviar por Email
          </button>
          
          <button
            onClick={handleCancel}
            className="w-full sm:w-auto px-8 py-3 bg-white/10 text-white font-semibold rounded-lg hover:bg-white/20 transition-colors text-center"
          >
            ❌ Cancelar
          </button>
        </div>
      </div>

      {/* Modal de envío */}
      {showSendModal && (
        <SendEmailModal
          sessionId={sessionId}
          companyName={companyName}
          contactName={contactName}
          contactEmail={contactEmail}
          onClose={() => setShowSendModal(false)}
          onSuccess={handleSendSuccess}
        />
      )}

      {/* Modal de éxito */}
      {showSuccessModal && sendResult && (
        <SuccessModal
          publicUrl={sendResult.publicUrl}
          recipientEmail={sendResult.recipientEmail}
          companyName={companyName}
          recipientPhone={sendResult.recipientPhone}
          onClose={() => {
            setShowSuccessModal(false);
            // Cerrar ventana o redirigir
            if (window.opener) {
              window.close();
            }
          }}
        />
      )}
    </>
  );
}
