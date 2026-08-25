function p(text: string) {
  return { type: "paragraph", content: text ? [{ type: "text", text }] : [] };
}

function token(key: string, label: string) {
  return { type: "contractToken", attrs: { tokenKey: key, label, module: "guardia" } };
}

function pTokens(...parts: Array<string | { token: string; label: string }>) {
  return {
    type: "paragraph",
    content: parts.map((part) =>
      typeof part === "string"
        ? { type: "text", text: part }
        : token(part.token, part.label),
    ),
  };
}

export function odiContent() {
  return {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Obligación de Informar (ODI)" }] },
      pTokens(
        "La empresa ",
        { token: "empresa.razonSocial", label: "Razón social" },
        ", RUT ",
        { token: "empresa.rut", label: "RUT empresa" },
        ", informa a ",
        { token: "guardia.fullName", label: "Nombre" },
        " (RUT ",
        { token: "guardia.rut", label: "RUT" },
        ") sobre los riesgos de su puesto en ",
        { token: "guardia.currentInstallation", label: "Instalación" },
        ".",
      ),
      p("Este documento se firma en cumplimiento del D.S. 40 y la Ley 16.744."),
    ],
  };
}

export function dasContent() {
  return {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Derecho a Saber" }] },
      pTokens(
        "Se informa a ",
        { token: "guardia.fullName", label: "Nombre" },
        " los procedimientos de trabajo seguro aplicables a la instalación ",
        { token: "guardia.currentInstallation", label: "Instalación" },
        ".",
      ),
      p("El trabajador declara haber recibido la inducción y comprender las medidas de control."),
    ],
  };
}

export function eppContent() {
  return {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Entrega de EPP" }] },
      pTokens(
        "Se deja constancia de la entrega de elementos de protección personal a ",
        { token: "guardia.fullName", label: "Nombre" },
        ".",
      ),
      p("El trabajador se obliga a usarlos y a reportar deterioro o pérdida."),
    ],
  };
}
