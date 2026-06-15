/**
 * Script de demo: genera un PDF de Propuesta Técnica con datos representativos
 * (sin tocar la base de datos) para validar visualmente el rediseño.
 *
 * Uso: npx tsx scripts/gen-proposal-demo.ts
 */

import * as fs from "fs";
import * as path from "path";
import { renderProposalToBufferFromProps } from "../src/lib/pdf/templates/proposal/render-proposal";

/** Lee todos los logos de public/clientes como data URIs (para demostrar la grilla sin tope) */
function loadClientLogos(): Array<{ name: string; url: string }> {
  const dir = path.join(process.cwd(), "public", "clientes");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(png|jpe?g)$/i.test(f))
    .map((f) => {
      const buf = fs.readFileSync(path.join(dir, f));
      const ext = path.extname(f).toLowerCase().replace(".", "");
      const mime = ext === "png" ? "image/png" : "image/jpeg";
      const name = f.replace(/\.(png|jpe?g)$/i, "").replace(/_/g, " ");
      return { name, url: `data:${mime};base64,${buf.toString("base64")}` };
    });
}

async function main() {
  const props: any = {
    companyName: "Zalvaria SpA",
    companyLogo: undefined,
    quotationCode: "CPQ-2026-163",
    proposalDate: new Date().toLocaleDateString("es-CL"),
    contactName: "Andrés Gutiérrez",
    contactPosition: "Gerente de Operaciones",

    ai: {
      descripcionBreve: "Operación logística con bodegas de alto valor en Iquique, turnos 24/7.",
      resumenEjecutivo:
        "Zalvaria opera un centro de distribución en Iquique con flujo continuo de carga y descarga, lo que expone activos de alto valor a riesgos de sustracción y accesos no autorizados.\nProponemos una dotación mixta diurna y nocturna, dimensionada para cubrir los puntos críticos sin sobredimensionar el costo.\nGard opera con OPAI, su plataforma propietaria desarrollada por LX3.ai: visibilidad total, control en tiempo real y reportes automáticos. No es solo vigilancia, es un sistema de seguridad gestionado.\nLa inversión mensual se posiciona como una protección directa frente al costo de un solo incidente.",
      analisisNecesidades:
        "En logística los riesgos principales son la sustracción de mercadería, el control de carga/descarga y el acceso de contratistas externos. La trazabilidad es clave para auditorías y seguros.\nLa dotación propuesta cubre estos puntos con rondas verificadas por GPS y control de acceso digital, algo que un proveedor tradicional sin tecnología no puede garantizar.",
      sectoresRelevantes: ["Logística y Bodegas", "Manufactura e Industria", "Retail y Centros Comerciales", "Construcción e Inmobiliaria"],
    },

    serviceType: "Guardia día, Guardia noche",
    installationName: "CD Iquique - Bodega Norte",
    installationCity: "Iquique",
    installationAddress: "Ruta 5 Norte Km 1.785, Iquique",
    serviceDetail:
      "• Incluye dotación de 5 guardias en modalidad mixta: día (08:00-20:00) entre semana y noche (20:00-08:00) todos los días.\n• Incluye uniformes completos con renovación periódica.\n• Incorpora exámenes preocupacionales y de drogas.\n• Incluye equipos operativos: celular con plan de datos y linterna.\n• Incluye sistema de gestión operacional OPAI con portal de cliente 24/7.\n• Incluye supervisión en terreno con mínimo 2 rondas por turno.",
    coverageSchedule: "08:00 - 20:00, Lunes a Viernes",
    staffingCount: 5,
    staffingRegime: "2x1 + 3x1",
    supervisionFrequency: "Mínimo 2 supervisiones por turno",

    items: [
      { index: 1, description: "Guardia día · 2 guardia(s) · Lunes a Viernes · 08:00 - 20:00", quantity: 2, unitPrice: 1100000, subtotal: 2200000, unitPriceFormatted: "$1.100.000", subtotalFormatted: "$2.200.000" },
      { index: 2, description: "Guardia noche · 3 guardia(s) · Todos los días · 20:00 - 08:00", quantity: 3, unitPrice: 1250000, subtotal: 3750000, unitPriceFormatted: "$1.250.000", subtotalFormatted: "$3.750.000" },
    ],
    totalNeto: 5950000,
    totalNetoFormatted: "$5.950.000",
    currency: "CLP",
    ufValue: undefined,
    paymentTerms: "Mensual, contra entrega de factura",
    validUntil: "15/08/2026",

    providerLogo: "",
    opaiLogo: "",
    lx3Logo: "",
    clientLogos: [],
    portalScreenshots: {},

    companyConfig: {
      commercialName: "Gard Security",
      companyName: "Gard SpA",
      brandNameUpper: "GARD",
      website: "www.gard.cl",
      phone: "+56 2 2345 6789",
      email: "comercial@gard.cl",
      brandingLogoWhite: undefined,
      brandingLogoFull: undefined,
      brandingLogoIcon: undefined,
    },
    clientLogosWithNames: [
      ...loadClientLogos(),
      // Clientes activos sin logo cargado (deben aparecer igual, como celda con nombre)
      { name: "Bodega Santa Amalia", url: "" },
      { name: "FT Foods S.A.", url: "" },
      { name: "Condominio La Florida", url: "" },
      { name: "Pine", url: "" },
      { name: "Norrinco", url: "" },
      { name: "Santa Hilda", url: "" },
    ],

    companyStats: {
      yearsInOperation: "8",
      activeGuards: "120+",
      protectedFacilities: "45+",
      regionsCount: "5",
    },
    proposalMetrics: [
      { value: "67%", label: "Reducción de incidentes" },
      { value: "96%", label: "Cumplimiento de rondas" },
      { value: "100%", label: "Documentado" },
      { value: "94%", label: "Tasa de renovación" },
    ],
    regimeExplanation:
      "El turno mixto combina cobertura diurna en horario de operación con presencia nocturna reforzada, alineado con el flujo logístico de la instalación.",
    breakdown: {
      positions: [
        {
          id: "p1", name: "Guardia día", numGuards: 2, numPuestos: 1, totalGuardsInPosition: 2,
          baseSalary: 1100000, gratification: 275000, totalImponible: 1375000,
          sisEmployer: 25000, afcEmployer: 33000, mutualEmployer: 12000,
          vacationProvision: 50000, severanceProvision: 45000,
          totalLaborCost: 1500000, salePrice: 2200000, hourlyRateSale: 6111,
        },
        {
          id: "p2", name: "Guardia noche", numGuards: 3, numPuestos: 1, totalGuardsInPosition: 3,
          baseSalary: 1800000, gratification: 450000, totalImponible: 2250000,
          sisEmployer: 40000, afcEmployer: 54000, mutualEmployer: 20000,
          vacationProvision: 90000, severanceProvision: 75000,
          totalLaborCost: 2500000, salePrice: 3750000, hourlyRateSale: 6944,
        },
      ],
      totalLaborCost: 4000000, holidayAdjustment: 80000,
      uniforms: 90000, exams: 60000, meals: 0, vehicles: 250000, infrastructure: 0,
      equipment: 30000, transport: 40000, systems: 20000, other: 0,
      subtotalBase: 4570000, marginPct: 18, marginAmount: 1260000,
      financial: 120000, financialRatePct: 2.5, policy: 0, policyRatePct: 0,
      totalSalePrice: 5950000, additionalLines: 0, grandTotal: 5950000,
      monthlyHoursStandard: 180, currency: "CLP",
    },
    resourceBreakdown: [
      { category: "Uniformes", categoryType: "direct", subtotal: 90000, items: [
        { name: "Uniforme completo", amount: 90000, unit: "por guardia/mes", technicalSpecs: "2 mudas + chaqueta corporativa + calzado de seguridad certificado" },
      ] },
      { category: "Exámenes Médicos", categoryType: "direct", subtotal: 60000, items: [
        { name: "Examen preocupacional", amount: 40000, unit: "por guardia/mes" },
        { name: "Test de drogas y alcohol", amount: 20000, unit: "por guardia/mes" },
      ] },
      { category: "Vehículos", categoryType: "indirect", subtotal: 250000, items: [
        { name: "Camioneta de supervisión (×1)", amount: 250000, unit: "1 unidad(es)", technicalSpecs: "Arriendo + combustible + mantención" },
      ] },
      { category: "Equipos Operativos", categoryType: "indirect", subtotal: 30000, items: [
        { name: "Celular con plan de datos", amount: 30000 },
      ] },
      { category: "Transporte", categoryType: "indirect", subtotal: 40000, items: [
        { name: "Movilización turno noche", amount: 40000 },
      ] },
      { category: "Sistemas", categoryType: "indirect", subtotal: 20000, items: [
        { name: "Plataforma OPAI + portal de cliente", amount: 20000 },
      ] },
    ],
    includedItems: [
      "Personal con OS-10 vigente",
      "Supervisión periódica en terreno",
      "Uniformes y equipamiento operativo",
      "Plataforma OPAI y portal de cliente",
      "Reportes automáticos diarios",
    ],
  };

  const buffer = await renderProposalToBufferFromProps(props);
  const out = path.join(process.cwd(), "tmp", "propuesta-demo.pdf");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, buffer);
  console.log("PDF generado:", out, `(${(buffer.length / 1024).toFixed(0)} KB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
