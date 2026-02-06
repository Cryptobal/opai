'use client';

/**
 * Send Email Modal
 * 
 * Modal para enviar presentación por email con opción de agregar CC
 */

import { useState } from 'react';

interface SendEmailModalProps {
  sessionId: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  onClose: () => void;
  onSuccess: (result: { uniqueId: string; publicUrl: string; recipientEmail: string; recipientPhone?: string }) => void;
}

export function SendEmailModal({ sessionId, companyName, contactName, contactEmail, onClose, onSuccess }: SendEmailModalProps) {
  const [recipientEmail, setRecipientEmail] = useState(contactEmail);
  const [recipientName, setRecipientName] = useState(contactName);
  const [ccEmails, setCcEmails] = useState<string[]>(['']);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addCcField = () => {
    setCcEmails([...ccEmails, '']);
  };

  const removeCcField = (index: number) => {
    setCcEmails(ccEmails.filter((_, i) => i !== index));
  };

  const updateCcEmail = (index: number, value: string) => {
    const updated = [...ccEmails];
    updated[index] = value;
    setCcEmails(updated);
  };

  const handleSend = async () => {
    setIsSending(true);
    setError(null);

    // Validar que haya un email destinatario
    if (!recipientEmail || !recipientEmail.trim() || !recipientEmail.includes('@')) {
      setError('Por favor ingresa un email válido para el destinatario');
      setIsSending(false);
      return;
    }

    try {
      // Filtrar emails vacíos y validar formato básico
      const validCcEmails = ccEmails
        .map(email => email.trim())
        .filter(email => email && email.includes('@'));

      const response = await fetch('/api/presentations/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          recipientEmail: recipientEmail.trim(),
          recipientName: recipientName.trim(),
          ccEmails: validCcEmails,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al enviar email');
      }

      // Llamar al callback de éxito
      onSuccess({
        uniqueId: data.presentation.uniqueId,
        publicUrl: data.presentation.publicUrl,
        recipientEmail: data.email.sentTo,
        recipientPhone: data.email.recipientPhone,
      });

    } catch (err: any) {
      console.error('Error al enviar:', err);
      setError(err.message || 'Error al enviar email');
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full border border-white/10 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-500 to-blue-500 px-6 py-4">
          <h2 className="text-2xl font-bold text-white">📧 Enviar Presentación</h2>
          <p className="text-white/80 text-sm mt-1">
            {companyName}
          </p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Destinatario principal (editable) */}
          <div>
            <label className="text-white font-semibold mb-2 block">
              📨 Destinatario principal
            </label>
            <div className="space-y-2">
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Nombre del destinatario"
                className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="email@ejemplo.cl"
                className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* CC Emails */}
          <div>
            <label className="text-white font-semibold mb-2 block">
              Copias adicionales (CC) - Opcional
            </label>
            
            {ccEmails.map((email, index) => (
              <div key={index} className="flex gap-2 mb-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => updateCcEmail(index, e.target.value)}
                  placeholder="ejemplo@empresa.cl"
                  className="flex-1 px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                {ccEmails.length > 1 && (
                  <button
                    onClick={() => removeCcField(index)}
                    className="px-3 py-2 bg-red-500/20 text-red-300 rounded-lg hover:bg-red-500/30 transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}

            {ccEmails.length < 5 && (
              <button
                onClick={addCcField}
                className="text-teal-400 hover:text-teal-300 text-sm font-semibold mt-2"
              >
                + Agregar otro email CC
              </button>
            )}
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3">
              <p className="text-red-200 text-sm">⚠️ {error}</p>
            </div>
          )}

          {/* Info adicional */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
            <p className="text-blue-200 text-xs">
              💡 Se generará un link público único y se enviará por email. 
              Podrás hacer seguimiento de aperturas y clicks.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-800/50 px-6 py-4 flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={isSending}
            className="px-6 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSend}
            disabled={isSending}
            className="px-8 py-2 bg-gradient-to-r from-teal-500 to-blue-500 text-white font-bold rounded-lg hover:scale-105 transition-transform disabled:opacity-50 disabled:scale-100 shadow-lg shadow-teal-500/30"
          >
            {isSending ? '📤 Enviando...' : '📧 Enviar Ahora'}
          </button>
        </div>
      </div>
    </div>
  );
}
