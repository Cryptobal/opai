/**
 * Manejo de archivos con Slack (Fase 5). Estas funciones NO pasan por
 * `callSlack`: la descarga es un GET binario a `url_private` con Bearer, y la
 * subida usa el flujo external upload (getUploadURLExternal → PUT → complete).
 *
 * Scopes requeridos en el bot: `files:read` (descarga) y `files:write` (subida).
 */

import { callSlack, SlackApiError } from "./api";

/**
 * Descarga un archivo privado de Slack (`file.url_private`) con el token del bot.
 * Slack responde HTML de login si el token no tiene `files:read`; lo detectamos
 * para no guardar basura como si fuera la imagen.
 */
export async function slackDownloadFile(
  urlPrivate: string,
  token: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(urlPrivate, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new SlackApiError(`file_download_http_${res.status}`);
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  if (contentType.includes("text/html")) throw new SlackApiError("file_download_not_authed");
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, contentType };
}

/**
 * Sube un archivo a un canal/hilo de Slack por el flujo external upload:
 *  1) `files.getUploadURLExternal` reserva una URL firmada + file_id.
 *  2) PUT/POST del binario a esa URL (sin Bearer).
 *  3) `files.completeUploadExternal` confirma y lo comparte en el canal/hilo.
 */
export async function slackFilesUpload(
  token: string,
  params: { channelId: string; threadTs?: string; filename: string; buffer: Buffer; title?: string },
): Promise<{ fileId: string }> {
  const start = await callSlack(
    "files.getUploadURLExternal",
    { filename: params.filename, length: params.buffer.length },
    token,
  );
  const uploadUrl = start.upload_url as string;
  const fileId = start.file_id as string;
  if (!uploadUrl || !fileId) throw new SlackApiError("upload_url_missing");

  const put = await fetch(uploadUrl, { method: "POST", body: new Uint8Array(params.buffer) });
  if (!put.ok) throw new SlackApiError(`file_upload_http_${put.status}`);

  await callSlack(
    "files.completeUploadExternal",
    {
      files: [{ id: fileId, title: params.title ?? params.filename }],
      channel_id: params.channelId,
      thread_ts: params.threadTs,
    },
    token,
  );
  return { fileId };
}
