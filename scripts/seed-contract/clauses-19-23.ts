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
    t("Toda comunicación formal entre las partes se efectuará por escrito, mediante correo electrónico a las direcciones registradas, carta certificada o notificación notarial, según corresponda a la naturaleza y relevancia del acto."),
  ]),
  // VIGÉSIMA PRIMERA
  hClause(2, "vigesima-primera", [bold("VIGÉSIMA PRIMERA: Legislación Aplicable y Jurisdicción")]),
  p([
    t("El presente contrato se rige por la legislación de la República de Chile, en particular el Decreto Ley N° 3.607 sobre seguridad privada y su Reglamento, la Ley N° 21.659, la Ley N° 19.628, la Ley N° 21.719, el Código del Trabajo y demás normas aplicables."),
  ]),
  p([
    t("Para todos los efectos legales derivados del presente contrato, las partes fijan su domicilio en la ciudad de "),
    tk("empresa.comuna"),
    t(" y se someten a la jurisdicción de sus Tribunales Ordinarios de Justicia."),
  ]),
  // VIGÉSIMA SEGUNDA
  hClause(2, "vigesima-segunda", [bold("VIGÉSIMA SEGUNDA: Personería")]),
  p([
    t("La personería de don(a) "), tk("empresa.repLegalNombre"),
    t(" para representar a "), tk("empresa.razonSocial"),
    t(" consta en el registro de empresas y sociedades correspondiente. La personería de don(a) "),
    tk("account.legalRepresentativeName"),
    t(" para representar a "), tk("account.legalName"),
    t(" consta en escritura pública de fecha "), tk("account.notaryDate"),
    t(", otorgada ante "), tk("account.notaryName"), t("."),
  ]),
  // VIGÉSIMA TERCERA
  hClause(2, "vigesima-tercera", [bold("VIGÉSIMA TERCERA: Ejemplares y Firma")]),
  p([
    t("El presente contrato se firma en dos ejemplares de igual tenor y fecha, quedando uno en poder de cada parte. Las partes declaran conocer y aceptar íntegramente las condiciones aquí estipuladas, firmando en señal de conformidad."),
  ]),
];
