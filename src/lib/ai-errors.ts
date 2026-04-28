/**
 * Errores tipados que produce el aiService y consumen las rutas /api/ai/*.
 * Permiten que el frontend muestre mensajes en español en vez del cuerpo crudo
 * del proveedor (OpenAI/Anthropic/Google).
 */

export type AIErrorCode =
  | "AI_NOT_CONFIGURED"
  | "AI_QUOTA_EXCEEDED"
  | "AI_RATE_LIMITED"
  | "AI_INVALID_KEY"
  | "AI_MODEL_NOT_FOUND"
  | "AI_PROVIDER_ERROR";

export class AIError extends Error {
  constructor(
    public code: AIErrorCode,
    message: string,
    public providerType?: string,
    public providerStatus?: number,
  ) {
    super(message);
    this.name = "AIError";
  }

  /** Forma serializable para devolver desde rutas /api. */
  toResponse() {
    return {
      success: false as const,
      error: this.message,
      code: this.code,
      providerType: this.providerType ?? null,
    };
  }

  /** Status HTTP que la ruta devuelve al cliente. */
  get clientHttpStatus(): number {
    switch (this.code) {
      case "AI_QUOTA_EXCEEDED":
      case "AI_INVALID_KEY":
      case "AI_NOT_CONFIGURED":
        return 503;
      case "AI_RATE_LIMITED":
        return 429;
      case "AI_MODEL_NOT_FOUND":
        return 502;
      default:
        return 502;
    }
  }
}

/** Clasifica una respuesta no-OK del proveedor en un AIError tipado. */
export function classifyProviderError(
  providerType: string,
  status: number,
  bodyText: string,
): AIError {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    parsed = null;
  }

  const errObj =
    (parsed && typeof parsed === "object" && "error" in parsed
      ? (parsed as { error: unknown }).error
      : null) ?? {};
  const errType =
    typeof errObj === "object" && errObj !== null && "type" in errObj
      ? String((errObj as { type: unknown }).type ?? "")
      : "";
  const errCode =
    typeof errObj === "object" && errObj !== null && "code" in errObj
      ? String((errObj as { code: unknown }).code ?? "")
      : "";
  const errMessage =
    typeof errObj === "object" && errObj !== null && "message" in errObj
      ? String((errObj as { message: unknown }).message ?? bodyText)
      : bodyText;

  if (errType === "insufficient_quota" || errCode === "insufficient_quota") {
    return new AIError(
      "AI_QUOTA_EXCEEDED",
      "El proveedor de IA agotó su cuota disponible.",
      providerType,
      status,
    );
  }
  if (
    status === 429 ||
    errType === "rate_limit_error" ||
    errType === "rate_limit_exceeded" ||
    errCode === "rate_limit_exceeded"
  ) {
    return new AIError(
      "AI_RATE_LIMITED",
      "El proveedor de IA está limitando las solicitudes. Reintenta en unos segundos.",
      providerType,
      status,
    );
  }
  if (
    status === 401 ||
    status === 403 ||
    errType === "authentication_error" ||
    errCode === "invalid_api_key"
  ) {
    return new AIError(
      "AI_INVALID_KEY",
      "La API key del proveedor es inválida o no tiene permisos.",
      providerType,
      status,
    );
  }
  if (status === 404 && /model/i.test(errMessage)) {
    return new AIError(
      "AI_MODEL_NOT_FOUND",
      "El modelo configurado no existe o no está disponible.",
      providerType,
      status,
    );
  }
  return new AIError("AI_PROVIDER_ERROR", errMessage, providerType, status);
}

/** Mensajes amigables que muestra el `AiErrorDialog` al usuario. */
export const AI_ERROR_USER_MESSAGES: Record<
  AIErrorCode,
  { title: string; description: string; actionLabel?: string; actionHref?: string }
> = {
  AI_NOT_CONFIGURED: {
    title: "IA no configurada",
    description:
      "Tu empresa todavía no tiene un proveedor de IA configurado. Configúralo en Configuración → Inteligencia Artificial.",
    actionLabel: "Configurar IA",
    actionHref: "/opai/configuracion/inteligencia-artificial",
  },
  AI_QUOTA_EXCEEDED: {
    title: "Cuota de IA agotada",
    description:
      "El proveedor de IA configurado para tu empresa agotó su cuota. Recarga saldo en la cuenta del proveedor o cambia a otro proveedor en la configuración.",
    actionLabel: "Ir a configuración de IA",
    actionHref: "/opai/configuracion/inteligencia-artificial",
  },
  AI_RATE_LIMITED: {
    title: "Demasiadas solicitudes",
    description:
      "El proveedor de IA está limitando las solicitudes. Espera unos segundos e intenta de nuevo.",
  },
  AI_INVALID_KEY: {
    title: "API key inválida",
    description:
      "La API key configurada no es válida. Revisa la configuración de IA.",
    actionLabel: "Revisar configuración",
    actionHref: "/opai/configuracion/inteligencia-artificial",
  },
  AI_MODEL_NOT_FOUND: {
    title: "Modelo no disponible",
    description:
      "El modelo de IA configurado ya no existe o no está disponible. Elige otro modelo.",
    actionLabel: "Cambiar modelo",
    actionHref: "/opai/configuracion/inteligencia-artificial",
  },
  AI_PROVIDER_ERROR: {
    title: "Error del proveedor de IA",
    description:
      "Ocurrió un error con el proveedor de IA. Reintenta más tarde y, si persiste, revisa la configuración.",
  },
};
