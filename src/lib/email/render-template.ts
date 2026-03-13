/**
 * Renderiza plantillas de email (bloques) a HTML.
 * Usa tablas y CSS inline para compatibilidad con clientes de email.
 */

import type { EmailBlock } from "./types";
import { replaceVariables } from "./resolve-variables";

const ACCENT_COLOR = "#f97316"; // OPAI coral/naranja
const BG_DARK = "#0a0a0f";
const TEXT_LIGHT = "#e5e5e5";
const TEXT_MUTED = "#a3a3a3";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderBlock(block: EmailBlock, variables: Record<string, string>): string {
  const c = block.contenido;
  const r = (t: string) => replaceVariables(t ?? "", variables);

  switch (block.tipo) {
    case "header": {
      const titulo = escapeHtml(r(c.titulo ?? "Bienvenido a OPAI"));
      const subtitulo = c.subtitulo ? escapeHtml(r(c.subtitulo)) : "";
      return `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
          <tr>
            <td align="center" style="padding:24px 0;">
              <h1 style="margin:0;font-family:Arial,sans-serif;font-size:24px;color:${TEXT_LIGHT};font-weight:600;">${titulo}</h1>
              ${subtitulo ? `<p style="margin:8px 0 0;font-size:14px;color:${TEXT_MUTED};">${subtitulo}</p>` : ""}
            </td>
          </tr>
        </table>`;
    }

    case "texto": {
      const texto = escapeHtml(r(c.texto ?? "")).replace(/\n/g, "<br/>");
      return `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
          <tr>
            <td style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:${TEXT_LIGHT};">${texto}</td>
          </tr>
        </table>`;
    }

    case "pin": {
      const antes = escapeHtml(r(c.textoAntes ?? "Tu PIN de acceso es:"));
      const pin = escapeHtml(r("{{pin}}").replace("{{pin}}", variables.pin ?? ""));
      const despues = c.textoDespues ? escapeHtml(r(c.textoDespues)) : "";
      return `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
          <tr>
            <td align="center" style="padding:20px;background:${ACCENT_COLOR}20;border:2px solid ${ACCENT_COLOR};border-radius:8px;">
              <p style="margin:0 0 8px;font-size:14px;color:${TEXT_MUTED};">${antes}</p>
              <p style="margin:0;font-size:28px;font-weight:700;letter-spacing:4px;color:${ACCENT_COLOR};">${pin}</p>
              ${despues ? `<p style="margin:8px 0 0;font-size:12px;color:${TEXT_MUTED};">${despues}</p>` : ""}
            </td>
          </tr>
        </table>`;
    }

    case "boton": {
      const label = escapeHtml(r(c.label ?? "Acceder"));
      const url = r(c.url ?? "#");
      const color = c.color ?? ACCENT_COLOR;
      return `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
          <tr>
            <td align="center">
              <a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 24px;background:${color};color:#fff;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;font-weight:600;border-radius:6px;">${label}</a>
            </td>
          </tr>
        </table>`;
    }

    case "portales": {
      const baseUrl = variables.portalGuardia?.replace(/\/portal\/guardia.*$/, "") ?? "";
      const portalG = variables.portalGuardia ?? `${baseUrl}/portal/guardia`;
      const portalR = variables.portalRondas ?? `${baseUrl}/portal/rondas`;
      const portalA = variables.portalAcceso ?? `${baseUrl}/portal/acceso`;

      const cards: string[] = [];

      if (c.mostrarGuardia !== false) {
        cards.push(`
          <td width="33%" valign="top" style="padding:12px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1a1a24;border-radius:8px;padding:16px;">
              <tr><td style="font-family:Arial,sans-serif;font-size:14px;font-weight:600;color:${TEXT_LIGHT};margin-bottom:8px;">Portal del Guardia</td></tr>
              <tr><td style="font-size:12px;color:${TEXT_MUTED};line-height:1.5;padding:8px 0;">Turnos, asistencia, documentos y chat.</td></tr>
              <tr><td style="padding-top:12px;"><a href="${portalG}" style="color:${ACCENT_COLOR};font-size:13px;text-decoration:none;">Acceder →</a></td></tr>
            </table>
          </td>`);
      }
      if (c.mostrarRondas !== false) {
        cards.push(`
          <td width="33%" valign="top" style="padding:12px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1a1a24;border-radius:8px;padding:16px;">
              <tr><td style="font-family:Arial,sans-serif;font-size:14px;font-weight:600;color:${TEXT_LIGHT};">Portal de Rondas</td></tr>
              <tr><td style="font-size:12px;color:${TEXT_MUTED};line-height:1.5;padding:8px 0;">Registra recorridos con GPS.</td></tr>
              <tr><td style="padding-top:12px;"><a href="${portalR}" style="color:${ACCENT_COLOR};font-size:13px;text-decoration:none;">Acceder →</a></td></tr>
            </table>
          </td>`);
      }
      if (c.mostrarAcceso !== false) {
        cards.push(`
          <td width="33%" valign="top" style="padding:12px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1a1a24;border-radius:8px;padding:16px;">
              <tr><td style="font-family:Arial,sans-serif;font-size:14px;font-weight:600;color:${TEXT_LIGHT};">Portal de Acceso</td></tr>
              <tr><td style="font-size:12px;color:${TEXT_MUTED};line-height:1.5;padding:8px 0;">Control de ingreso y salida.</td></tr>
              <tr><td style="padding-top:12px;"><a href="${portalA}" style="color:${ACCENT_COLOR};font-size:13px;text-decoration:none;">Acceder →</a></td></tr>
            </table>
          </td>`);
      }

      return `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
          <tr>${cards.join("")}</tr>
        </table>`;
    }

    case "separador":
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;"><tr><td style="border-top:1px solid #333;height:1px;"></td></tr></table>`;

    case "imagen": {
      const src = r(c.src ?? "");
      const alt = escapeHtml(c.alt ?? "");
      const w = c.width ?? 200;
      if (!src) return "";
      return `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
          <tr>
            <td align="center"><img src="${escapeHtml(src)}" alt="${alt}" width="${w}" style="max-width:100%;height:auto;" /></td>
          </tr>
        </table>`;
    }

    case "footer": {
      const texto = escapeHtml(r(c.texto ?? "OPAI — Gard Security"));
      return `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:32px;padding-top:24px;border-top:1px solid #333;">
          <tr>
            <td align="center" style="font-family:Arial,sans-serif;font-size:12px;color:${TEXT_MUTED};">${texto}</td>
          </tr>
        </table>`;
    }

    default:
      return "";
  }
}

export function renderEmailTemplate(
  blocks: EmailBlock[],
  variables: Record<string, string>
): string {
  const sorted = [...blocks].sort((a, b) => a.orden - b.orden);
  const body = sorted.map((b) => renderBlock(b, variables)).join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OPAI</title>
</head>
<body style="margin:0;padding:0;background:${BG_DARK};font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG_DARK};">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table width="100%" style="max-width:600px;" cellpadding="0" cellspacing="0" border="0">
          ${body}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
