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
  draftPresentationId?: string;
}

interface SendResult {
  uniqueId: string;
  publicUrl: string;
  recipientEmail: string;
  recipientPhone?: string;
}

export function PreviewActions({
  sessionId,
  companyName,
  contactName,
  contactEmail,
  draftPresentationId,
}: PreviewActionsProps) {
  const [showSendModal, setShowSendModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const handleDeleteDraft = async () => {
    if (!draftPresentationId) {
      window.alert("No se encontró el borrador para eliminar.");
      return;
    }

    const confirmed = window.confirm(
      "¿Eliminar este borrador?\n\nEsta acción no se puede deshacer."
    );
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/presentations/${draftPresentationId}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo eliminar el borrador");
      }

      window.alert("Borrador eliminado correctamente.");
      window.location.href = "/opai/inicio";
    } catch (error) {
      console.error(error);
      window.alert("No se pudo eliminar el borrador.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-lg border-t border-white/10 p-4 shadow-2xl">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row gap-3 justify-center items-center">
          <button
            onClick={() => setShowSendModal(true)}
            className="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-teal-500 to-blue-500 text-white font-bold rounded-lg hover:scale-105 transition-transform text-center shadow-lg shadow-teal-500/50"
          >
            📧 Enviar
          </button>
          
          <button
            onClick={handleCancel}
            className="w-full sm:w-auto px-8 py-3 bg-white/10 text-white font-semibold rounded-lg hover:bg-white/20 transition-colors text-center"
          >
            ❌ Cancelar
          </button>

          <button
            onClick={() => void handleDeleteDraft()}
            disabled={isDeleting || !draftPresentationId}
            className="w-full sm:w-auto px-8 py-3 bg-red-500/20 border border-red-500/40 text-red-200 font-semibold rounded-lg hover:bg-red-500/30 transition-colors text-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            🗑️ {isDeleting ? "Eliminando..." : "Eliminar borrador"}
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
