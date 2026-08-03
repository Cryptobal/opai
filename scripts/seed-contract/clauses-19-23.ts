import { p, t, bold, tk, hClause } from "./helpers";

export const CLAUSES_19_23 = [
  // DÉCIMA NOVENA
  hClause(2, "decima-novena", [bold("DÉCIMA NOVENA: Propiedad Intelectual y Protocolos")]),
  p([
    t("Los protocolos de seguridad, procedimientos operativos, manuales, Normas del Puesto y toda la documentación técnica desarrollada por LA EMPRESA en el marco de este contrato constituyen "),
    bold("propiedad intelectual exclusiva de LA EMPRESA"),
    t(" y no podrán ser reproducidos, distribuidos, divulgados ni utilizados por EL CLIENTE para fines distintos a los del presente contrato, sin autorización previa y escrita de LA EMPRESA."),
  ]),
  // VIGÉSIMA
  hClause(2, "vigesima", [bold("VIGÉSIMA: Coordinadores y Comunicaciones")]),
  p([
    t("Para el adecuado desarrollo y ejecución del presente contrato, cada parte designará por escrito a un representante autorizado para coordinar todas las materias y aspectos que digan relación con el debido cumplimiento del contrato. Los coordinadores no podrán ser reemplazados sin notificación previa y por escrito a la otra parte, y "),
    bold("cualquier comunicación o acción de coordinación que emane de personas distintas a dichos representantes carecerá de todo valor"),
    t(" entre las partes."),
  ]),
  p([
    t("Las comunicaciones ordinarias del contrato podrán efectuarse válidamente por correo electrónico a las casillas que las partes se informen por escrito al inicio del servicio, o a las que las reemplacen. Las comunicaciones relativas al término, incumplimiento o modificación del contrato deberán efectuarse mediante carta certificada o notificación notarial."),
  ]),
  // VIGÉSIMA PRIMERA
  hClause(2, "vigesima-primera", [bold("VIGÉSIMA PRIMERA: Legislación Aplicable, Cumplimiento Normativo y Jurisdicción")]),
  p([
    t("El presente contrato se rige por la legislación de la República de Chile, en particular la "),
    bold("Ley N° 21.659"),
    t(" sobre Seguridad Privada y su reglamento, el Decreto Ley N° 3.607 en lo que resulte aplicable conforme al régimen transitorio, la Ley N° 19.628, la Ley N° 21.719, el Código del Trabajo y demás normas aplicables."),
  ]),
  p([
    t("Las partes declaran conocer la normativa sobre responsabilidad penal de las personas jurídicas ("),
    bold("Ley N° 20.393"),
    t(" y "),
    bold("Ley N° 21.595"),
    t(") y se obligan a no realizar, con ocasión de este contrato, conducta alguna constitutiva de los delitos allí contemplados, informándose recíprocamente de cualquier hecho relevante al respecto. El incumplimiento grave y comprobado de esta obligación facultará a la parte diligente para poner término inmediato al contrato, sin indemnización para la parte infractora."),
  ]),
  p([
    t("Para todos los efectos legales derivados del presente contrato, las partes fijan su domicilio en la comuna y ciudad de "),
    tk("empresa.comuna"),
    t(" y se someten a la jurisdicción de sus Tribunales Ordinarios de Justicia."),
  ]),
  // VIGÉSIMA SEGUNDA
  hClause(2, "vigesima-segunda", [bold("VIGÉSIMA SEGUNDA: Personería")]),
  p([
    t("La personería de don(a) "), tk("empresa.repLegalNombre"),
    t(" para representar a "), tk("empresa.razonSocial"),
    t(" consta en escritura pública de fecha "), tk("empresa.fechaEscrituraPublica"),
    t(", otorgada en notaría "), tk("empresa.nombreNotaria"),
    t(". La personería de don(a) "), tk("account.legalRepresentativeName"),
    t(" para representar a "), tk("account.legalName"),
    t(" consta en escritura pública de fecha "), tk("account.notaryDate"),
    t(", otorgada ante "), tk("account.notaryName"), t("."),
  ]),
  // VIGÉSIMA TERCERA
  hClause(2, "vigesima-tercera", [bold("VIGÉSIMA TERCERA: Disposiciones Generales, Ejemplares y Firma")]),
  p([
    bold("a) Acuerdo íntegro: "),
    t("el presente contrato y su Anexo N°2 (Normas del Puesto), que forma parte integrante del mismo, contienen el acuerdo completo entre las partes y reemplazan toda negociación, oferta o acuerdo anterior sobre la misma materia. En caso de discrepancia, prevalecerá el texto del contrato por sobre su Anexo."),
  ]),
  p([
    bold("b) Nulidad parcial: "),
    t("la declaración de nulidad o ineficacia de una o más estipulaciones no afectará la validez de las restantes."),
  ]),
  p([
    bold("c) No renuncia: "),
    t("la falta o demora de una parte en el ejercicio de un derecho no importará renuncia al mismo."),
  ]),
  p([
    bold("d) Firma electrónica: "),
    t("el presente contrato podrá suscribirse mediante firma electrónica simple o avanzada, conforme a la "),
    bold("Ley N° 19.799"),
    t(", teniendo dicha suscripción pleno valor entre las partes."),
  ]),
  p([
    bold("e) Ejemplares: "),
    t("el presente contrato se firma en dos ejemplares de igual tenor y fecha, quedando uno en poder de cada parte."),
  ]),
  p([
    t("Las partes declaran conocer y aceptar íntegramente las condiciones aquí estipuladas, firmando en señal de conformidad."),
  ]),
];
