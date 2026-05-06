/**
 * Template de email al receptor con placeholders {{razonSocial}},
 * {{folio}}, {{tipo}}, {{total}}, {{fecha}}, {{receiverName}}.
 *
 * Si el tenant no configura plantilla custom (TenantDteConfig.emailTemplate*),
 * se usa el default razonable definido aquí.
 */
type Vars = {
  razonSocial: string;
  folio: string;
  tipo: string;
  total: string;
  fecha: string;
  receiverName: string;
};

const DEFAULT_SUBJECT = `{{tipo}} N° {{folio}} - {{razonSocial}}`;

const DEFAULT_BODY = `<!DOCTYPE html>
<html><body style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #0066FF;">{{tipo}} Electrónica</h2>
  <p>Estimado/a {{receiverName}},</p>
  <p>Adjunto encontrará la <strong>{{tipo}} N° {{folio}}</strong> emitida por {{razonSocial}}.</p>
  <table style="border-collapse: collapse; margin-top: 20px;">
    <tr><td style="padding: 4px 12px;"><strong>Folio:</strong></td><td>{{folio}}</td></tr>
    <tr><td style="padding: 4px 12px;"><strong>Fecha:</strong></td><td>{{fecha}}</td></tr>
    <tr><td style="padding: 4px 12px;"><strong>Total:</strong></td><td>{{total}}</td></tr>
  </table>
  <p style="margin-top: 30px; font-size: 12px; color: #666;">
    Se adjunta el archivo XML firmado electrónicamente conforme a la normativa del SII de Chile.
  </p>
</body></html>`;

function applyTemplate(template: string, vars: Vars): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? (vars as Record<string, string>)[key] : "",
  );
}

export function renderDteEmailSubject(template: string | null, vars: Vars): string {
  return applyTemplate(template?.trim() || DEFAULT_SUBJECT, vars);
}

export function renderDteEmailHtml(template: string | null, vars: Vars): string {
  return applyTemplate(template?.trim() || DEFAULT_BODY, vars);
}
