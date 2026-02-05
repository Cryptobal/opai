/**
 * Email Template Preview
 * 
 * Página para ver y probar el template de email
 * con datos de ejemplo
 */

export default function EmailTemplatePreviewPage() {
  // Datos de ejemplo para metadata
  const exampleData = {
    recipientName: 'Daniel Troncoso',
    companyName: 'Polpaico Soluciones',
    subject: 'Apoyo nocturno Coronel V1',
  };

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <div className="bg-slate-900 text-white py-6 px-6 border-b border-white/10">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold mb-2">📧 Template de Email</h1>
          <p className="text-white/60 text-sm">
            Vista previa del template con datos de ejemplo
          </p>
        </div>
      </div>

      {/* Info sobre el template */}
      <div className="max-w-6xl mx-auto py-6 px-6">
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-lg mb-6">
          <h3 className="text-blue-900 font-bold mb-2">ℹ️ Información del Template</h3>
          <ul className="text-blue-800 text-sm space-y-1">
            <li>• <strong>Archivo:</strong> <code className="bg-blue-100 px-2 py-0.5 rounded">src/emails/PresentationEmail.tsx</code></li>
            <li>• <strong>Tecnología:</strong> React Email + Resend</li>
            <li>• <strong>Editable:</strong> Sí, editando el archivo del template</li>
            <li>• <strong>Personalización:</strong> Automática con datos de Zoho</li>
          </ul>
        </div>

        {/* Controles */}
        <div className="bg-white rounded-lg shadow-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 mb-1">Vista del template</h3>
              <p className="text-slate-600 text-sm">Datos de ejemplo para visualización</p>
            </div>
            <div className="flex gap-2">
              <button className="px-4 py-2 bg-teal-500 text-white rounded-lg text-sm font-semibold hover:bg-teal-600 transition-colors">
                💻 Desktop
              </button>
              <button className="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-300 transition-colors">
                📱 Mobile
              </button>
            </div>
          </div>
        </div>

        {/* Email preview */}
        <div className="bg-white rounded-lg shadow-xl overflow-hidden">
          {/* Email metadata */}
          <div className="bg-slate-50 border-b border-slate-200 p-4 space-y-2 text-sm">
            <div className="flex gap-2">
              <span className="text-slate-500 font-semibold w-16">De:</span>
              <span className="text-slate-900">comercial@gard.cl</span>
            </div>
            <div className="flex gap-2">
              <span className="text-slate-500 font-semibold w-16">Para:</span>
              <span className="text-slate-900">{exampleData.recipientName} &lt;cliente@empresa.cl&gt;</span>
            </div>
            <div className="flex gap-2">
              <span className="text-slate-500 font-semibold w-16">Asunto:</span>
              <span className="text-slate-900">{exampleData.subject} - Gard Security</span>
            </div>
          </div>

          {/* Email template en iframe */}
          <div className="p-6">
            <iframe
              src="/api/email-preview"
              className="w-full h-[800px] border-0"
              title="Preview de Email"
            />
          </div>
        </div>

        {/* Guía de edición */}
        <div className="mt-6 bg-gradient-to-r from-teal-50 to-blue-50 border border-teal-200 rounded-lg p-6">
          <h3 className="text-teal-900 font-bold text-lg mb-3">
            🛠️ Cómo editar el template
          </h3>
          <div className="space-y-3 text-sm text-teal-800">
            <div>
              <p className="font-semibold mb-1">1. Abrir el archivo:</p>
              <code className="block bg-white px-3 py-2 rounded border border-teal-200 font-mono text-xs">
                src/emails/PresentationEmail.tsx
              </code>
            </div>
            <div>
              <p className="font-semibold mb-1">2. Editar contenido:</p>
              <p className="text-teal-700">
                Puedes cambiar textos, colores, estructura, etc. Es un componente React normal.
              </p>
            </div>
            <div>
              <p className="font-semibold mb-1">3. Ver cambios:</p>
              <p className="text-teal-700">
                Refresca esta página para ver los cambios en tiempo real.
              </p>
            </div>
            <div className="pt-2 border-t border-teal-200">
              <p className="font-semibold mb-1">💡 Tip profesional:</p>
              <p className="text-teal-700">
                Instala React Email CLI para ver preview en tiempo real:
              </p>
              <code className="block bg-white px-3 py-2 rounded border border-teal-200 font-mono text-xs mt-2">
                npx react-email dev
              </code>
              <p className="text-teal-600 text-xs mt-1">
                Abre http://localhost:3000 para ver editor interactivo
              </p>
            </div>
          </div>
        </div>

        {/* Botón volver */}
        <div className="mt-6 flex justify-center gap-3">
          <a
            href="/templates/commercial/preview?admin=true"
            className="px-6 py-3 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors font-semibold"
          >
            ← Volver a Templates
          </a>
          <a
            href="/templates/email/preview"
            className="px-6 py-3 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors font-semibold"
          >
            🔄 Refrescar Preview
          </a>
        </div>
      </div>
    </div>
  );
}
