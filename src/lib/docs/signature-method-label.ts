export function signatureMethodLabel(method: string | null | undefined): string {
  switch (method) {
    case "typed":
      return "Nombre escrito";
    case "drawn":
      return "Firma dibujada";
    case "stamped":
      return "Firma estampada electrónicamente";
    case "uploaded":
      return "Imagen subida";
    default:
      return method ? "Imagen subida" : "—";
  }
}
