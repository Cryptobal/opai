/**
 * Presentación comercial institucional en formato 16:9.
 *
 * Se mantiene separada de la propuesta técnica porque ambos documentos tienen
 * objetivos distintos: la propuesta se imprime y detalla alcance/precio; esta
 * presentación se consume principalmente en pantalla y debe contar una historia
 * comercial breve, visual y personalizada.
 *
 * Igual que render-proposal.ts, este archivo debe permanecer sin JSX. Cargar
 * React y @react-pdf desde la misma instancia evita incompatibilidades entre el
 * reconciler incluido por Next.js y el de @react-pdf/renderer.
 */

import type { ProposalProps } from "./build-proposal-props";

const DECK_SIZE = { width: 960, height: 540 } as const;
const TOTAL_SLIDES = 16;
const deckPageSize = () => ({ ...DECK_SIZE });

export type InstitutionalPresentationProps = ProposalProps & {
  /** Deep-link opcional al portal, usado como CTA en el PDF adjunto. */
  portalUrl?: string;
};

type ImageOptions = {
  grayscale?: boolean;
  trim?: boolean;
  width?: number;
};

export async function renderInstitutionalPresentationToBufferFromProps(
  props: InstitutionalPresentationProps,
): Promise<Buffer> {
  // eslint-disable-next-line no-eval
  const nodeRequire = eval("require") as NodeRequire;
  const React = nodeRequire("react");
  const pdf = await import("@react-pdf/renderer");
  const fs = nodeRequire("fs") as typeof import("fs");
  const path = nodeRequire("path") as typeof import("path");

  const {
    renderToBuffer,
    Document,
    Page,
    View,
    Text,
    StyleSheet,
    Image: PDFImage,
    Svg,
    Path,
    Circle,
    Rect,
    Link,
    Font,
  } = pdf;

  const fontsDir = path.join(process.cwd(), "public", "fonts");
  const registered = (globalThis as Record<string, unknown>).__pdfFontsRegistered;
  if (!registered) {
    Font.register({
      family: "PlusJakartaSans",
      fonts: [
        {
          src: path.join(fontsDir, "PlusJakartaSans-Regular.ttf"),
          fontWeight: 400,
        },
        {
          src: path.join(fontsDir, "PlusJakartaSans-Medium.ttf"),
          fontWeight: 500,
        },
        {
          src: path.join(fontsDir, "PlusJakartaSans-SemiBold.ttf"),
          fontWeight: 600,
        },
        {
          src: path.join(fontsDir, "PlusJakartaSans-Bold.ttf"),
          fontWeight: 700,
        },
        {
          src: path.join(fontsDir, "PlusJakartaSans-ExtraBold.ttf"),
          fontWeight: 800,
        },
      ],
    });
    Font.register({
      family: "JetBrainsMono",
      fonts: [
        {
          src: path.join(fontsDir, "JetBrainsMono-Regular.ttf"),
          fontWeight: 400,
        },
        {
          src: path.join(fontsDir, "JetBrainsMono-Medium.ttf"),
          fontWeight: 500,
        },
      ],
    });
    (globalThis as Record<string, unknown>).__pdfFontsRegistered = true;
  }
  // Evita cortes automáticos poco naturales en español ("opera-ción",
  // "ejecuti-vo"). El layout ya controla largos máximos explícitamente.
  Font.registerHyphenationCallback((word: string) => [word]);

  const e = React.createElement;
  const publicDir = path.join(process.cwd(), "public");

  const C = {
    ink: "#0B1426",
    ink2: "#13213A",
    ink3: "#1C2D4A",
    coral: "#F04464",
    coralSoft: "#FFF0F3",
    teal: "#18B7A6",
    tealSoft: "#EAFBF8",
    white: "#FFFFFF",
    paper: "#F7F9FC",
    mist: "#EDF2F7",
    line: "#DDE5EE",
    text: "#223047",
    text2: "#516078",
    text3: "#8491A5",
    green: "#1FA971",
    amber: "#D78A1D",
  } as const;
  const F = { sans: "PlusJakartaSans", mono: "JetBrainsMono" } as const;

  const cleanText = (value: unknown): string =>
    String(value ?? "")
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\s*\n\s*/g, "\n")
      .trim();

  const excerpt = (value: unknown, maxLength: number): string => {
    const text = cleanText(value).replace(/\n+/g, " ");
    if (text.length <= maxLength) return text;
    const candidate = text.slice(0, maxLength + 1);
    const sentenceEnd = Math.max(
      candidate.lastIndexOf(". "),
      candidate.lastIndexOf("? "),
      candidate.lastIndexOf("! "),
    );
    if (sentenceEnd >= Math.floor(maxLength * 0.58)) {
      return candidate.slice(0, sentenceEnd + 1).trim();
    }
    const wordEnd = candidate.lastIndexOf(" ");
    return `${candidate.slice(0, wordEnd > 0 ? wordEnd : maxLength).trim()}...`;
  };

  const paragraphs = (value: unknown): string[] =>
    cleanText(value)
      .split(/\n+/)
      .map((part) => part.trim())
      .filter(Boolean);

  const toDataUri = async (
    source: string | null | undefined,
    options: ImageOptions = {},
  ): Promise<string | null> => {
    if (!source) return null;
    try {
      let buffer: Buffer;
      let mime = "";
      let extension = "";

      if (source.startsWith("data:")) {
        const match = source.match(/^data:([^;,]+);base64,(.+)$/);
        if (!match) return source;
        mime = match[1].toLowerCase();
        extension = mime.split("/").pop() ?? "";
        buffer = Buffer.from(match[2], "base64");
      } else {
        let localPath: string | null = null;
        if (/^https?:\/\//i.test(source)) {
          try {
            const parsed = new URL(source);
            const candidate = path.resolve(
              publicDir,
              decodeURIComponent(parsed.pathname).replace(/^\/+/, ""),
            );
            if (
              candidate.startsWith(`${path.resolve(publicDir)}${path.sep}`) &&
              fs.existsSync(candidate)
            ) {
              localPath = candidate;
            }
          } catch {
            localPath = null;
          }
        } else {
          const candidate = path.resolve(publicDir, source.replace(/^\/+/, ""));
          if (
            candidate.startsWith(`${path.resolve(publicDir)}${path.sep}`) &&
            fs.existsSync(candidate)
          ) {
            localPath = candidate;
          }
        }

        if (localPath) {
          buffer = fs.readFileSync(localPath);
          extension = path.extname(localPath).slice(1).toLowerCase();
        } else {
          const response = await fetch(source, {
            signal: AbortSignal.timeout(8_000),
          });
          if (!response.ok) return null;
          buffer = Buffer.from(await response.arrayBuffer());
          mime = (response.headers.get("content-type") ?? "")
            .split(";")[0]
            .toLowerCase();
          extension = new URL(source).pathname.split(".").pop()?.toLowerCase() ?? "";
        }
      }

      const needsConversion =
        options.grayscale ||
        options.trim ||
        options.width ||
        mime.includes("svg") ||
        mime.includes("webp") ||
        ["svg", "webp"].includes(extension);

      if (needsConversion) {
        const sharp = nodeRequire("sharp") as typeof import("sharp");
        let pipeline = sharp(buffer);
        if (options.trim) {
          pipeline = pipeline.trim({ background: "#ffffff", threshold: 10 });
        }
        if (options.width) {
          pipeline = pipeline.resize({
            width: options.width,
            withoutEnlargement: true,
          });
        }
        if (options.grayscale) {
          pipeline = pipeline.grayscale().normalise().linear(1.08, -4);
        }
        const sourceIsJpeg =
          mime.includes("jpeg") || ["jpg", "jpeg"].includes(extension);
        if (sourceIsJpeg) {
          buffer = Buffer.from(
            await pipeline.jpeg({ quality: 84, mozjpeg: true }).toBuffer(),
          );
          mime = "image/jpeg";
        } else {
          buffer = Buffer.from(await pipeline.png().toBuffer());
          mime = "image/png";
        }
      } else if (!mime) {
        mime = ["jpg", "jpeg"].includes(extension) ? "image/jpeg" : "image/png";
      }

      return `data:${mime || "image/png"};base64,${buffer.toString("base64")}`;
    } catch {
      return null;
    }
  };

  const localAsset = (relativePath: string, options?: ImageOptions) =>
    toDataUri(relativePath, options);

  const clientLogoCandidates = (props.clientLogosWithNames ?? [])
    .filter((client) => client.url?.trim())
    .slice(0, 12);

  const [
    providerLogoUri,
    coverPhoto,
    teamPhoto,
    accessPhoto,
    conciergePhoto,
    portalShot,
    roundsShot,
    accessShot,
    operationsShot,
    clientLogoResults,
  ] = await Promise.all([
    toDataUri(props.providerLogo, { width: 500 }),
    localAsset("guardias/hero.jpg", { width: 1_400 }),
    localAsset("guardias/entrada.jpg", { width: 900 }),
    localAsset("guardias/cims.jpg", { width: 900 }),
    localAsset("guardias/conserje.jpg", { width: 900 }),
    localAsset("opai/portal-clientes.jpg", { width: 1_400 }),
    localAsset("opai/rondas.jpg", { width: 900 }),
    localAsset("opai/control-acceso.jpg", { width: 900 }),
    localAsset("opai/operaciones.jpg", { width: 900 }),
    Promise.all(
      clientLogoCandidates.map(async (client) => {
        const src = await toDataUri(client.url, { width: 360, trim: true });
        return src ? { name: cleanText(client.name), src } : null;
      }),
    ),
  ]);

  const clientLogos = clientLogoResults.filter(
    (item): item is { name: string; src: string } => item !== null,
  );

  const {
    companyName,
    contactName,
    contactPosition,
    proposalDate,
    ai,
    companyConfig,
    companyStats,
    proposalMetrics,
  } = props;

  const brandName =
    cleanText(companyConfig.commercialName) ||
    cleanText(companyConfig.brandNameUpper) ||
    "Gard Security";
  const website = cleanText(companyConfig.website);
  const websiteLabel =
    website.replace(/^https?:\/\//i, "").replace(/\/+$/, "") || "gard.cl";
  const summaryParagraphs = paragraphs(ai.resumenEjecutivo);
  const needsParagraphs = paragraphs(ai.analisisNecesidades);
  const challengeText = excerpt(
    needsParagraphs[0] || summaryParagraphs[0] || ai.descripcionBreve,
    520,
  );
  const responseText = excerpt(
    needsParagraphs[1] ||
      summaryParagraphs.slice(1).join(" ") ||
      ai.resumenEjecutivo,
    590,
  );
  const sectors = (ai.sectoresRelevantes ?? [])
    .map(cleanText)
    .filter(Boolean)
    .slice(0, 5);

  const configuredMetrics = (proposalMetrics ?? [])
    .filter((metric) => cleanText(metric.value) && cleanText(metric.label))
    .slice(0, 3)
    .map((metric) => ({
      value: cleanText(metric.value),
      label: cleanText(metric.label),
    }));

  const configuredStats = [
    {
      value: cleanText(companyStats.yearsInOperation),
      label: "Años de operación",
    },
    {
      value: cleanText(companyStats.activeGuards),
      label: "Guardias activos",
    },
    {
      value: cleanText(companyStats.protectedFacilities),
      label: "Instalaciones protegidas",
    },
    {
      value: cleanText(companyStats.regionsCount),
      label: "Regiones",
    },
  ].filter((item) => item.value);

  const proofMetrics =
    configuredMetrics.length > 0
      ? configuredMetrics
      : configuredStats.length > 0
        ? configuredStats.slice(0, 3)
        : [
            { value: "24/7", label: "Visibilidad para el cliente" },
            { value: "GPS", label: "Rondas con evidencia" },
            { value: "EN LÍNEA", label: "Operación documentada" },
          ];

  const s = StyleSheet.create({
    page: {
      fontFamily: F.sans,
      width: DECK_SIZE.width,
      height: 600,
      backgroundColor: C.paper,
      color: C.text,
      position: "relative",
      paddingTop: 30,
      paddingHorizontal: 44,
      paddingBottom: 28,
    },
    pageDark: {
      fontFamily: F.sans,
      width: DECK_SIZE.width,
      height: 600,
      backgroundColor: C.ink,
      color: C.white,
      position: "relative",
      paddingTop: 30,
      paddingHorizontal: 44,
      paddingBottom: 28,
    },
    fixedPage: {
      fontFamily: F.sans,
      width: DECK_SIZE.width,
      height: DECK_SIZE.height,
      backgroundColor: C.paper,
      color: C.text,
      position: "relative",
    },
    fixedPageDark: {
      fontFamily: F.sans,
      width: DECK_SIZE.width,
      height: DECK_SIZE.height,
      backgroundColor: C.ink,
      color: C.white,
      position: "relative",
    },
    fixedPageCanvas: {
      width: DECK_SIZE.width,
      height: DECK_SIZE.height,
    },
    fixedPageContent: {
      position: "absolute",
      top: 30,
      left: 44,
      right: 44,
      bottom: 28,
    },
    topbar: {
      height: 25,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 25,
    },
    topbarBrand: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
    },
    topbarLogo: {
      width: 88,
      height: 24,
      objectFit: "contain",
      objectPosition: "left center",
    },
    topbarFallback: {
      fontSize: 10,
      fontWeight: 800,
      color: C.ink,
      letterSpacing: 1.1,
    },
    topbarFallbackDark: {
      fontSize: 10,
      fontWeight: 800,
      color: C.white,
      letterSpacing: 1.1,
    },
    topbarRule: {
      width: 18,
      height: 2,
      backgroundColor: C.coral,
    },
    slideNumber: {
      fontFamily: F.mono,
      fontSize: 8,
      color: C.text3,
      letterSpacing: 1,
    },
    slideNumberDark: {
      fontFamily: F.mono,
      fontSize: 8,
      color: "#A9B6CA",
      letterSpacing: 1,
    },
    footer: {
      position: "absolute",
      left: 44,
      right: 44,
      bottom: 15,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    footerText: {
      fontSize: 6.5,
      color: C.text3,
      letterSpacing: 0.3,
    },
    footerTextDark: {
      fontSize: 6.5,
      color: "#7F8DA4",
      letterSpacing: 0.3,
    },
    eyebrow: {
      fontFamily: F.mono,
      color: C.coral,
      fontSize: 8,
      fontWeight: 500,
      letterSpacing: 1.2,
      marginBottom: 8,
      textTransform: "uppercase",
    },
    title: {
      color: C.ink,
      fontSize: 27,
      fontWeight: 800,
      lineHeight: 1.08,
      letterSpacing: -0.6,
    },
    titleDark: {
      color: C.white,
      fontSize: 27,
      fontWeight: 800,
      lineHeight: 1.08,
      letterSpacing: -0.6,
    },
    subtitle: {
      color: C.text2,
      fontSize: 10.5,
      lineHeight: 1.55,
      marginTop: 8,
      maxWidth: 680,
    },
    subtitleDark: {
      color: "#A9B6CA",
      fontSize: 10.5,
      lineHeight: 1.55,
      marginTop: 8,
      maxWidth: 680,
    },
    bodyText: {
      color: C.text2,
      fontSize: 9.5,
      lineHeight: 1.62,
    },
    bodyTextDark: {
      color: "#B9C4D5",
      fontSize: 9.5,
      lineHeight: 1.62,
    },
    smallLabel: {
      fontFamily: F.mono,
      color: C.text3,
      fontSize: 6.5,
      letterSpacing: 0.8,
      textTransform: "uppercase",
    },
    cardTitle: {
      color: C.ink,
      fontSize: 11,
      fontWeight: 700,
      lineHeight: 1.2,
    },
    cardText: {
      color: C.text2,
      fontSize: 8,
      lineHeight: 1.5,
      marginTop: 5,
    },
    cardTitleDark: {
      color: C.white,
      fontSize: 11,
      fontWeight: 700,
      lineHeight: 1.2,
    },
    cardTextDark: {
      color: "#A9B6CA",
      fontSize: 8,
      lineHeight: 1.5,
      marginTop: 5,
    },

    coverPage: {
      fontFamily: F.sans,
      width: DECK_SIZE.width,
      height: DECK_SIZE.height,
      backgroundColor: C.ink,
      color: C.white,
      position: "relative",
    },
    coverPhoto: {
      position: "absolute",
      top: 0,
      right: 0,
      width: 485,
      height: 540,
      objectFit: "cover",
    },
    coverPhotoFallback: {
      position: "absolute",
      top: 0,
      right: 0,
      width: 485,
      height: 540,
      backgroundColor: C.ink3,
    },
    coverPhotoOverlay: {
      position: "absolute",
      top: 0,
      right: 0,
      width: 485,
      height: 540,
      backgroundColor: C.ink,
      opacity: 0.28,
    },
    coverPanel: {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      width: 565,
      backgroundColor: C.ink,
      paddingTop: 46,
      paddingHorizontal: 52,
      paddingBottom: 42,
    },
    coverEdge: {
      position: "absolute",
      left: 530,
      top: 0,
      width: 70,
      height: 540,
      backgroundColor: C.ink,
      opacity: 0.9,
      transform: "skewX(-7deg)",
    },
    coverLogo: {
      width: 124,
      height: 42,
      objectFit: "contain",
      objectPosition: "left center",
    },
    coverBrandFallback: {
      fontSize: 18,
      fontWeight: 800,
      letterSpacing: 1.6,
      color: C.white,
    },
    coverKicker: {
      fontFamily: F.mono,
      color: "#B9C4D5",
      fontSize: 7.5,
      fontWeight: 500,
      letterSpacing: 1.5,
      marginTop: 65,
      textTransform: "uppercase",
    },
    coverAccent: {
      width: 38,
      height: 4,
      backgroundColor: C.coral,
      marginTop: 14,
      marginBottom: 18,
    },
    coverTitle: {
      width: 440,
      fontSize: 37,
      fontWeight: 800,
      color: C.white,
      lineHeight: 1.04,
      letterSpacing: -1,
    },
    coverPromise: {
      width: 400,
      fontSize: 11,
      lineHeight: 1.55,
      color: "#B9C4D5",
      marginTop: 15,
    },
    coverClient: {
      position: "absolute",
      left: 52,
      bottom: 43,
      width: 445,
      paddingTop: 14,
      borderTop: "1 solid #31415C",
    },
    coverClientLabel: {
      fontFamily: F.mono,
      color: "#7F8DA4",
      fontSize: 6.5,
      letterSpacing: 1.1,
      textTransform: "uppercase",
    },
    coverClientName: {
      color: C.white,
      fontSize: 14,
      fontWeight: 700,
      marginTop: 5,
    },
    coverClientMeta: {
      color: "#A9B6CA",
      fontSize: 7.5,
      marginTop: 4,
    },

    executiveGrid: {
      flexDirection: "row",
      gap: 22,
      marginTop: 22,
      height: 278,
    },
    executiveCopy: {
      width: 535,
      flexDirection: "column",
      gap: 11,
    },
    executiveCard: {
      flex: 1,
      backgroundColor: C.white,
      border: `1 solid ${C.line}`,
      borderRadius: 12,
      padding: 16,
      position: "relative",
    },
    executiveCardAccent: {
      position: "absolute",
      top: 16,
      left: 0,
      width: 3,
      height: 32,
      backgroundColor: C.coral,
      borderTopRightRadius: 2,
      borderBottomRightRadius: 2,
    },
    executivePhotoWrap: {
      flex: 1,
      borderRadius: 14,
      overflow: "hidden",
      position: "relative",
      backgroundColor: C.ink2,
    },
    executivePhoto: {
      width: "100%",
      height: "100%",
      objectFit: "cover",
    },
    executivePhotoOverlay: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: 110,
      backgroundColor: C.ink,
      opacity: 0.82,
    },
    executivePhotoCopy: {
      position: "absolute",
      left: 18,
      right: 18,
      bottom: 17,
    },
    executiveQuote: {
      color: C.white,
      fontSize: 13,
      fontWeight: 700,
      lineHeight: 1.28,
    },
    executiveQuoteMeta: {
      color: "#B9C4D5",
      fontSize: 7.5,
      marginTop: 6,
      lineHeight: 1.4,
    },

    pillarGrid: {
      flexDirection: "row",
      gap: 10,
      marginTop: 24,
    },
    pillarCard: {
      flex: 1,
      height: 132,
      borderRadius: 12,
      padding: 14,
      backgroundColor: C.ink2,
      border: "1 solid #273A59",
    },
    iconBubbleDark: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: "#253854",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    flowStrip: {
      marginTop: 22,
      borderRadius: 12,
      backgroundColor: C.white,
      paddingVertical: 15,
      paddingHorizontal: 20,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    flowStep: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    flowNumber: {
      fontFamily: F.mono,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: C.coralSoft,
      color: C.coral,
      fontSize: 8,
      fontWeight: 500,
      textAlign: "center",
      paddingTop: 7,
    },
    flowLabel: {
      color: C.ink,
      fontSize: 9,
      fontWeight: 700,
    },
    flowArrow: {
      color: C.text3,
      fontSize: 12,
    },

    opaiGrid: {
      flexDirection: "row",
      gap: 24,
      marginTop: 20,
      height: 300,
    },
    opaiCopy: {
      width: 286,
    },
    opaiLogo: {
      width: 118,
      height: 34,
      objectFit: "contain",
      objectPosition: "left center",
      marginBottom: 12,
    },
    opaiNameFallback: {
      color: C.teal,
      fontSize: 24,
      fontWeight: 800,
      letterSpacing: 1,
      marginBottom: 12,
    },
    featureGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 17,
    },
    featureChip: {
      width: 135,
      minHeight: 53,
      borderRadius: 9,
      padding: 9,
      backgroundColor: C.white,
      border: `1 solid ${C.line}`,
    },
    featureChipLabel: {
      color: C.ink,
      fontSize: 7.8,
      fontWeight: 700,
      lineHeight: 1.3,
    },
    featureChipMeta: {
      color: C.text3,
      fontSize: 6.5,
      marginTop: 3,
      lineHeight: 1.35,
    },
    deviceFrame: {
      flex: 1,
      borderRadius: 14,
      padding: 8,
      backgroundColor: C.ink,
      position: "relative",
    },
    deviceTop: {
      height: 15,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingLeft: 2,
    },
    deviceDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: "#52627B",
    },
    deviceImage: {
      width: "100%",
      height: 260,
      borderRadius: 8,
      objectFit: "cover",
      objectPosition: "top center",
    },
    deviceFallback: {
      width: "100%",
      height: 260,
      borderRadius: 8,
      backgroundColor: C.ink2,
      alignItems: "center",
      justifyContent: "center",
    },
    deviceCaption: {
      position: "absolute",
      right: 16,
      bottom: 14,
      backgroundColor: C.teal,
      color: C.white,
      borderRadius: 8,
      paddingVertical: 7,
      paddingHorizontal: 11,
      fontSize: 7,
      fontWeight: 700,
    },

    evidenceGrid: {
      flexDirection: "row",
      gap: 12,
      marginTop: 21,
      height: 291,
    },
    evidenceCard: {
      flex: 1,
      borderRadius: 12,
      overflow: "hidden",
      backgroundColor: C.white,
      border: `1 solid ${C.line}`,
    },
    evidenceImage: {
      width: "100%",
      height: 183,
      objectFit: "cover",
      objectPosition: "top center",
    },
    evidenceFallback: {
      width: "100%",
      height: 183,
      backgroundColor: C.ink2,
    },
    evidenceCopy: {
      padding: 13,
    },
    evidenceIndex: {
      fontFamily: F.mono,
      color: C.coral,
      fontSize: 6.5,
      letterSpacing: 0.8,
      marginBottom: 5,
    },
    evidenceTitle: {
      color: C.ink,
      fontSize: 10,
      fontWeight: 700,
    },
    evidenceText: {
      color: C.text2,
      fontSize: 7,
      lineHeight: 1.42,
      marginTop: 4,
    },

    chain: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 20,
      paddingVertical: 16,
      paddingHorizontal: 18,
      borderRadius: 12,
      backgroundColor: C.white,
      border: `1 solid ${C.line}`,
    },
    chainNode: {
      width: 180,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    chainIcon: {
      width: 35,
      height: 35,
      borderRadius: 18,
      backgroundColor: C.coralSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    chainTitle: {
      color: C.ink,
      fontSize: 8.5,
      fontWeight: 700,
    },
    chainMeta: {
      color: C.green,
      fontSize: 6.5,
      fontWeight: 700,
      marginTop: 3,
    },
    chainConnector: {
      width: 34,
      height: 1,
      backgroundColor: C.line,
      marginHorizontal: 4,
    },
    operationsBottom: {
      flexDirection: "row",
      gap: 14,
      marginTop: 15,
      height: 164,
    },
    slaPanel: {
      width: 452,
      borderRadius: 12,
      backgroundColor: C.ink,
      padding: 14,
    },
    slaGrid: {
      flexDirection: "row",
      gap: 8,
      marginTop: 11,
    },
    slaCard: {
      flex: 1,
      borderRadius: 8,
      backgroundColor: C.ink2,
      padding: 10,
    },
    slaValue: {
      color: C.coral,
      fontSize: 14,
      fontWeight: 800,
    },
    slaLabel: {
      color: "#A9B6CA",
      fontSize: 6.5,
      lineHeight: 1.35,
      marginTop: 3,
    },
    reportingPanel: {
      flex: 1,
      borderRadius: 12,
      backgroundColor: C.white,
      border: `1 solid ${C.line}`,
      padding: 14,
    },
    reportRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      paddingVertical: 7,
      borderBottom: `0.5 solid ${C.line}`,
    },
    reportBadge: {
      width: 42,
      borderRadius: 5,
      backgroundColor: C.tealSoft,
      color: C.teal,
      fontFamily: F.mono,
      fontSize: 6,
      fontWeight: 500,
      textAlign: "center",
      paddingVertical: 5,
    },
    reportTitle: {
      color: C.ink,
      fontSize: 7.5,
      fontWeight: 700,
    },
    reportMeta: {
      color: C.text3,
      fontSize: 6.2,
      marginTop: 2,
    },

    peopleGrid: {
      flexDirection: "row",
      gap: 22,
      marginTop: 20,
      height: 306,
    },
    photoMosaic: {
      width: 378,
      flexDirection: "row",
      gap: 8,
    },
    photoLarge: {
      width: 233,
      height: 306,
      borderRadius: 12,
      objectFit: "cover",
    },
    photoSide: {
      flex: 1,
      gap: 8,
    },
    photoSmall: {
      width: "100%",
      height: 149,
      borderRadius: 12,
      objectFit: "cover",
    },
    photoPlaceholder: {
      backgroundColor: C.ink2,
      borderRadius: 12,
    },
    peopleCopy: {
      flex: 1,
    },
    complianceRow: {
      flexDirection: "row",
      gap: 7,
      marginTop: 13,
      marginBottom: 12,
    },
    complianceBadge: {
      flex: 1,
      borderRadius: 8,
      backgroundColor: C.tealSoft,
      border: "1 solid #C8F1E9",
      paddingVertical: 8,
      paddingHorizontal: 9,
    },
    complianceValue: {
      color: C.teal,
      fontSize: 8,
      fontWeight: 800,
    },
    complianceMeta: {
      color: C.text2,
      fontSize: 5.8,
      lineHeight: 1.3,
      marginTop: 3,
    },
    peopleStep: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      paddingVertical: 6,
      borderBottom: `0.5 solid ${C.line}`,
    },
    peopleStepNum: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: C.coralSoft,
      color: C.coral,
      fontFamily: F.mono,
      fontSize: 6.5,
      fontWeight: 500,
      textAlign: "center",
      paddingTop: 6,
    },
    peopleStepTitle: {
      color: C.ink,
      fontSize: 7.5,
      fontWeight: 700,
    },
    peopleStepMeta: {
      color: C.text3,
      fontSize: 6.2,
      marginTop: 2,
    },
    contingency: {
      marginTop: 10,
      borderRadius: 9,
      padding: 10,
      backgroundColor: C.ink,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    contingencyTitle: {
      color: C.white,
      fontSize: 8,
      fontWeight: 700,
    },
    contingencyMeta: {
      color: "#A9B6CA",
      fontSize: 6.3,
      marginTop: 2,
    },

    proofTop: {
      flexDirection: "row",
      gap: 10,
      marginTop: 18,
    },
    proofMetric: {
      flex: 1,
      borderRadius: 10,
      backgroundColor: C.ink,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    proofValue: {
      color: C.white,
      fontSize: 16,
      fontWeight: 800,
    },
    proofLabel: {
      color: "#A9B6CA",
      fontSize: 6.5,
      lineHeight: 1.35,
      marginTop: 4,
    },
    sectorRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 12,
    },
    sectorTag: {
      borderRadius: 12,
      backgroundColor: C.mist,
      color: C.text2,
      fontSize: 6.8,
      fontWeight: 600,
      paddingVertical: 6,
      paddingHorizontal: 10,
    },
    logoWall: {
      marginTop: 15,
      borderRadius: 12,
      backgroundColor: C.white,
      border: `1 solid ${C.line}`,
      padding: 12,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      justifyContent: "space-between",
      minHeight: 144,
    },
    logoCell: {
      width: 200,
      height: 52,
      borderRadius: 7,
      backgroundColor: C.paper,
      alignItems: "center",
      justifyContent: "center",
      padding: 6,
    },
    clientLogo: {
      width: 158,
      height: 38,
      objectFit: "contain",
    },
    trustFallback: {
      minHeight: 144,
      marginTop: 15,
      borderRadius: 12,
      backgroundColor: C.ink,
      padding: 24,
      flexDirection: "row",
      alignItems: "center",
      gap: 20,
    },
    trustFallbackValue: {
      color: C.coral,
      fontSize: 34,
      fontWeight: 800,
    },
    trustFallbackCopy: {
      color: C.white,
      fontSize: 14,
      fontWeight: 700,
      lineHeight: 1.3,
    },

    timeline: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginTop: 28,
      paddingHorizontal: 4,
    },
    timelineStep: {
      width: 159,
      alignItems: "center",
      position: "relative",
    },
    timelineLine: {
      position: "absolute",
      top: 17,
      left: 96,
      width: 126,
      height: 2,
      backgroundColor: C.line,
    },
    timelineCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: C.coral,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 10,
    },
    timelineNumber: {
      color: C.white,
      fontFamily: F.mono,
      fontSize: 8,
      fontWeight: 500,
    },
    timelineDay: {
      color: C.coral,
      fontFamily: F.mono,
      fontSize: 6.3,
      fontWeight: 500,
      marginBottom: 5,
    },
    timelineTitle: {
      color: C.ink,
      fontSize: 8.5,
      fontWeight: 700,
      textAlign: "center",
      lineHeight: 1.25,
    },
    timelineMeta: {
      color: C.text3,
      fontSize: 6.2,
      lineHeight: 1.4,
      textAlign: "center",
      marginTop: 5,
      paddingHorizontal: 8,
    },
    launchPanel: {
      marginTop: 24,
      borderRadius: 12,
      backgroundColor: C.ink,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    launchTitle: {
      color: C.white,
      fontSize: 13,
      fontWeight: 800,
    },
    launchText: {
      color: "#A9B6CA",
      fontSize: 7.5,
      lineHeight: 1.45,
      marginTop: 5,
      width: 520,
    },
    launchBadge: {
      borderRadius: 9,
      backgroundColor: C.teal,
      color: C.white,
      fontFamily: F.mono,
      fontSize: 7,
      fontWeight: 500,
      letterSpacing: 0.6,
      paddingVertical: 10,
      paddingHorizontal: 14,
    },

    closePage: {
      fontFamily: F.sans,
      width: DECK_SIZE.width,
      height: DECK_SIZE.height,
      backgroundColor: C.ink,
      color: C.white,
      position: "relative",
    },
    closePhoto: {
      position: "absolute",
      top: 0,
      right: 0,
      width: 430,
      height: 540,
      objectFit: "cover",
    },
    closeOverlay: {
      position: "absolute",
      top: 0,
      right: 0,
      width: 430,
      height: 540,
      backgroundColor: C.ink,
      opacity: 0.38,
    },
    closeBody: {
      position: "absolute",
      top: 0,
      left: 0,
      bottom: 0,
      width: 600,
      paddingTop: 48,
      paddingHorizontal: 52,
      paddingBottom: 42,
      backgroundColor: C.ink,
    },
    closeEyebrow: {
      fontFamily: F.mono,
      color: C.coral,
      fontSize: 7.5,
      letterSpacing: 1.3,
      textTransform: "uppercase",
      marginTop: 54,
    },
    closeTitle: {
      color: C.white,
      fontSize: 35,
      lineHeight: 1.08,
      fontWeight: 800,
      letterSpacing: -0.8,
      marginTop: 14,
      width: 460,
    },
    closeText: {
      color: "#B9C4D5",
      fontSize: 10.5,
      lineHeight: 1.55,
      marginTop: 16,
      width: 440,
    },
    closeCta: {
      marginTop: 22,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    closeCtaButton: {
      borderRadius: 8,
      backgroundColor: C.coral,
      color: C.white,
      fontSize: 8,
      fontWeight: 700,
      paddingVertical: 10,
      paddingHorizontal: 14,
      textDecoration: "none",
    },
    closeCtaFallback: {
      borderRadius: 8,
      backgroundColor: C.coral,
      color: C.white,
      fontSize: 8,
      fontWeight: 700,
      paddingVertical: 10,
      paddingHorizontal: 14,
    },
    closeContact: {
      position: "absolute",
      left: 52,
      bottom: 44,
      width: 470,
      borderTop: "1 solid #31415C",
      paddingTop: 14,
      flexDirection: "row",
      gap: 24,
    },
    closeContactItem: {
      maxWidth: 145,
    },
    closeContactValue: {
      color: C.white,
      fontSize: 7.5,
      fontWeight: 600,
      marginTop: 4,
    },
  });

  const icon = (
    name: "shield" | "eye" | "chart" | "users" | "check" | "map" | "scan",
    color: string = C.coral,
    size = 16,
  ) => {
    const line = {
      fill: "none",
      stroke: color,
      strokeWidth: 1.8,
      strokeLinecap: "round" as const,
      strokeLinejoin: "round" as const,
    };
    const paths: Record<string, unknown[]> = {
      shield: [
        e(Path, {
          key: "a",
          ...line,
          d: "M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z",
        }),
        e(Path, { key: "b", ...line, d: "M9 12l2 2 4-4" }),
      ],
      eye: [
        e(Path, {
          key: "a",
          ...line,
          d: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z",
        }),
        e(Circle, { key: "b", ...line, cx: 12, cy: 12, r: 2.5 }),
      ],
      chart: [
        e(Path, { key: "a", ...line, d: "M4 20V10M10 20V4M16 20v-7M22 20H2" }),
      ],
      users: [
        e(Circle, { key: "a", ...line, cx: 9, cy: 8, r: 3 }),
        e(Path, { key: "b", ...line, d: "M3 20v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2" }),
        e(Path, { key: "c", ...line, d: "M16 6a3 3 0 0 1 0 6M18 14a4 4 0 0 1 4 4v2" }),
      ],
      check: [
        e(Circle, { key: "a", ...line, cx: 12, cy: 12, r: 9 }),
        e(Path, { key: "b", ...line, d: "M8 12l2.5 2.5L16 9" }),
      ],
      map: [
        e(Path, { key: "a", ...line, d: "M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" }),
        e(Path, { key: "b", ...line, d: "M9 3v15M15 6v15" }),
      ],
      scan: [
        e(Path, { key: "a", ...line, d: "M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" }),
        e(Circle, { key: "b", ...line, cx: 12, cy: 12, r: 3 }),
      ],
    };
    return e(
      Svg,
      { width: size, height: size, viewBox: "0 0 24 24" },
      ...(paths[name] ?? paths.check),
    );
  };

  const brandMark = (dark: boolean, width = 88, height = 24) =>
    dark && providerLogoUri
      ? e(PDFImage, {
          src: providerLogoUri,
          style: [s.topbarLogo, { width, height }],
        })
      : e(
          Text,
          { style: dark ? s.topbarFallbackDark : s.topbarFallback },
          brandName.toUpperCase(),
        );

  const topbar = (pageNumber: number, dark = false) =>
    e(
      View,
      { style: s.topbar },
      e(
        View,
        { style: s.topbarBrand },
        brandMark(dark),
        e(View, { style: s.topbarRule }),
      ),
      e(
        Text,
        { style: dark ? s.slideNumberDark : s.slideNumber },
        `${String(pageNumber).padStart(2, "0")} / ${TOTAL_SLIDES}`,
      ),
    );

  const footer = (pageNumber: number, dark = false) =>
    e(
      View,
      { style: s.footer },
      e(
        Text,
        { style: dark ? s.footerTextDark : s.footerText },
        `${brandName} · Presentación confidencial para ${cleanText(companyName)}`,
      ),
      e(
        Text,
        { style: dark ? s.footerTextDark : s.footerText },
        `${websiteLabel} · ${String(pageNumber).padStart(2, "0")}`,
      ),
    );

  const fixedSlide = (
    key: string,
    pageNumber: number,
    dark: boolean,
    ...children: unknown[]
  ) =>
    e(
      Page,
      {
        key,
        size: deckPageSize(),
        style: dark ? s.fixedPageDark : s.fixedPage,
        wrap: false,
      },
      e(View, { style: s.fixedPageCanvas }),
      e(
        View,
        { style: s.fixedPageContent },
        topbar(pageNumber, dark),
        ...children,
      ),
      footer(pageNumber, dark),
    );

  const heading = (
    kicker: string,
    title: string,
    subtitle?: string,
    dark = false,
  ) =>
    e(
      View,
      null,
      e(Text, { style: s.eyebrow }, cleanText(kicker)),
      e(Text, { style: dark ? s.titleDark : s.title }, cleanText(title)),
      subtitle
        ? e(
            Text,
            { style: dark ? s.subtitleDark : s.subtitle },
            cleanText(subtitle),
          )
        : null,
    );

  const cover = e(
    Page,
    { key: "cover", size: deckPageSize(), style: s.coverPage, wrap: false },
    e(View, { style: { width: DECK_SIZE.width, height: DECK_SIZE.height } }),
    coverPhoto
      ? e(PDFImage, { src: coverPhoto, style: s.coverPhoto })
      : e(View, { style: s.coverPhotoFallback }),
    e(View, { style: s.coverPhotoOverlay }),
    e(View, { style: s.coverEdge }),
    e(
      View,
      { style: s.coverPanel },
      providerLogoUri
        ? e(PDFImage, { src: providerLogoUri, style: s.coverLogo })
        : e(
            Text,
            { style: s.coverBrandFallback },
            brandName.toUpperCase(),
          ),
      e(
        Text,
        { style: s.coverKicker },
        "Presentación comercial · Seguridad privada + tecnología",
      ),
      e(View, { style: s.coverAccent }),
      e(
        Text,
        { style: s.coverTitle },
        "Seguridad visible.\nOperación bajo control.",
      ),
      e(
        Text,
        { style: s.coverPromise },
        "Personas capacitadas, supervisión activa y evidencia en tiempo real para proteger lo que hace posible su operación.",
      ),
      e(
        View,
        { style: s.coverClient },
        e(Text, { style: s.coverClientLabel }, "Preparada especialmente para"),
        e(Text, { style: s.coverClientName }, cleanText(companyName)),
        e(
          Text,
          { style: s.coverClientMeta },
          `${cleanText(contactName)}${contactPosition ? ` · ${cleanText(contactPosition)}` : ""} · ${cleanText(proposalDate)}`,
        ),
      ),
    ),
  );

  const executive = fixedSlide(
    "executive",
    2,
    false,
    heading(
      "01 · Entendemos su operación",
      `Seguridad diseñada para ${cleanText(companyName)}`,
      excerpt(ai.descripcionBreve, 130),
    ),
    e(
      View,
      { style: s.executiveGrid },
      e(
        View,
        { style: s.executiveCopy },
        e(
          View,
          { style: s.executiveCard },
          e(View, { style: s.executiveCardAccent }),
          e(Text, { style: s.smallLabel }, "El desafío"),
          e(
            Text,
            { style: [s.cardTitle, { marginTop: 7 }] },
            "Proteger continuidad, personas e información",
          ),
          e(Text, { style: [s.bodyText, { marginTop: 8 }] }, challengeText),
        ),
        e(
          View,
          { style: s.executiveCard },
          e(View, {
            style: [s.executiveCardAccent, { backgroundColor: C.teal }],
          }),
          e(Text, { style: s.smallLabel }, "Nuestra respuesta"),
          e(
            Text,
            { style: [s.cardTitle, { marginTop: 7 }] },
            "Un sistema de seguridad gestionado, no vigilancia pasiva",
          ),
          e(Text, { style: [s.bodyText, { marginTop: 8 }] }, responseText),
        ),
      ),
      e(
        View,
        { style: s.executivePhotoWrap },
        conciergePhoto
          ? e(PDFImage, { src: conciergePhoto, style: s.executivePhoto })
          : e(View, { style: s.photoPlaceholder }),
        e(View, { style: s.executivePhotoOverlay }),
        e(
          View,
          { style: s.executivePhotoCopy },
          e(
            Text,
            { style: s.executiveQuote },
            "Presencia profesional.\nCriterio operativo.\nTrazabilidad total.",
          ),
          e(
            Text,
            { style: s.executiveQuoteMeta },
            "Una misma operación, conectada desde el terreno hasta la gerencia.",
          ),
        ),
      ),
    ),
  );

  const gard = fixedSlide(
    "gard",
    3,
    true,
    heading(
      "02 · Quiénes somos",
      `${brandName}: seguridad operada con tecnología propia`,
      "Una empresa de seguridad y un equipo tecnológico trabajando como una sola operación.",
      true,
    ),
    e(
      View,
      {
        style: {
          flexDirection: "row",
          gap: 18,
          marginTop: 20,
          height: 238,
        },
      },
      e(
        View,
        { style: { width: 490, gap: 10 } },
        e(
          View,
          {
            style: {
              flex: 1,
              borderRadius: 12,
              padding: 16,
              backgroundColor: C.ink2,
              border: "1 solid #273A59",
            },
          },
          e(Text, { style: s.eyebrow }, "GARD SECURITY"),
          e(
            Text,
            { style: s.cardTitleDark },
            "El equipo que ejecuta y responde",
          ),
          e(
            Text,
            { style: s.cardTextDark },
            "Empresa chilena de seguridad privada integral. Seleccionamos, preparamos y desplegamos personal; definimos protocolos; supervisamos el terreno y sostenemos la continuidad del servicio.",
          ),
        ),
        e(
          View,
          {
            style: {
              flex: 1,
              borderRadius: 12,
              padding: 16,
              backgroundColor: C.ink2,
              border: "1 solid #273A59",
            },
          },
          e(
            Text,
            { style: [s.eyebrow, { color: C.teal }] },
            "LX3.AI + OPAI",
          ),
          e(
            Text,
            { style: s.cardTitleDark },
            "La capa que conecta y demuestra",
          ),
          e(
            Text,
            { style: s.cardTextDark },
            "Nuestro brazo tecnológico desarrolla OPAI: la plataforma que conecta guardias, supervisores, operaciones y clientes para registrar cada evento, automatizar alertas y convertir actividad en información.",
          ),
        ),
      ),
      e(
        View,
        {
          style: {
            flex: 1,
            borderRadius: 13,
            overflow: "hidden",
            position: "relative",
            backgroundColor: C.ink3,
          },
        },
        coverPhoto
          ? e(PDFImage, {
              src: coverPhoto,
              style: {
                width: "100%",
                height: "100%",
                objectFit: "cover",
              },
            })
          : null,
        e(View, {
          style: {
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 76,
            backgroundColor: C.ink,
            opacity: 0.82,
          },
        }),
        e(
          View,
          {
            style: {
              position: "absolute",
              left: 16,
              right: 16,
              bottom: 14,
            },
          },
          e(
            Text,
            { style: s.cardTitleDark },
            "Una sola responsabilidad operacional",
          ),
          e(
            Text,
            { style: s.cardTextDark },
            "Personas, supervisión, tecnología y servicio al cliente bajo el mismo modelo.",
          ),
        ),
      ),
    ),
    e(
      View,
      {
        style: {
          flexDirection: "row",
          gap: 8,
          marginTop: 12,
        },
      },
      ...[
        ["01", "Terreno", "Ejecución disciplinada"],
        ["02", "Supervisión", "Control y corrección"],
        ["03", "CCO + OPAI", "Monitoreo y evidencia"],
        ["04", "Cliente", "Visibilidad y respuesta"],
      ].map(([number, title, meta]) =>
        e(
          View,
          {
            key: number,
            style: {
              flex: 1,
              borderRadius: 9,
              padding: 11,
              backgroundColor: C.white,
            },
          },
          e(Text, { style: s.smallLabel }, number),
          e(Text, { style: [s.cardTitle, { marginTop: 4 }] }, title),
          e(Text, { style: [s.cardText, { marginTop: 2 }] }, meta),
        ),
      ),
    ),
  );

  const comparisonRows = [
    ["Visibilidad", "Correo y planillas", "Portal 24/7 en tiempo real"],
    ["Rondas", "Control manual", "GPS, foto y timestamp"],
    ["Incidentes", "Reporte verbal", "Workflow, evidencia y responsable"],
    ["Supervisión", "Reactiva", "Proactiva y respaldada por datos"],
    ["Reportabilidad", "Resumen mensual", "Diaria, semanal y ejecutiva"],
    ["Continuidad", "Respuesta improvisada", "Respaldo y escalamiento definido"],
  ];

  const differentiation = fixedSlide(
    "differentiation",
    4,
    false,
    heading(
      "03 · Diferenciación",
      "Lo que cambia cuando la seguridad se gestiona",
      "Gard reemplaza la opacidad del modelo tradicional por control, evidencia y capacidad de respuesta.",
    ),
    e(
      View,
      {
        style: {
          marginTop: 18,
          borderRadius: 12,
          overflow: "hidden",
          border: `1 solid ${C.line}`,
          backgroundColor: C.white,
        },
      },
      e(
        View,
        {
          style: {
            flexDirection: "row",
            backgroundColor: C.ink,
            paddingVertical: 10,
            paddingHorizontal: 14,
          },
        },
        e(Text, { style: { width: 190, color: C.white, fontSize: 7, fontWeight: 700 } }, "ASPECTO"),
        e(Text, { style: { flex: 1, color: "#A9B6CA", fontSize: 7, fontWeight: 700 } }, "PROVEEDOR TRADICIONAL"),
        e(Text, { style: { flex: 1, color: C.teal, fontSize: 7, fontWeight: 700 } }, "GARD SECURITY + OPAI"),
      ),
      ...comparisonRows.map(([label, traditional, gardValue], index) =>
        e(
          View,
          {
            key: label,
            style: {
              flexDirection: "row",
              alignItems: "center",
              minHeight: 40,
              paddingVertical: 8,
              paddingHorizontal: 14,
              backgroundColor: index % 2 === 0 ? C.white : C.paper,
              borderBottom:
                index < comparisonRows.length - 1
                  ? `0.5 solid ${C.line}`
                  : undefined,
            },
          },
          e(
            Text,
            { style: { width: 190, color: C.ink, fontSize: 8, fontWeight: 700 } },
            label,
          ),
          e(
            Text,
            { style: { flex: 1, color: C.text3, fontSize: 8 } },
            traditional,
          ),
          e(
            View,
            { style: { flex: 1, flexDirection: "row", alignItems: "center", gap: 7 } },
            icon("check", C.teal, 13),
            e(
              Text,
              { style: { flex: 1, color: C.ink, fontSize: 8, fontWeight: 600 } },
              gardValue,
            ),
          ),
        ),
      ),
    ),
    e(
      View,
      {
        style: {
          marginTop: 13,
          borderRadius: 10,
          backgroundColor: C.coralSoft,
          borderLeft: `4 solid ${C.coral}`,
          paddingVertical: 11,
          paddingHorizontal: 14,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        },
      },
      e(
        Text,
        { style: { color: C.ink, fontSize: 10, fontWeight: 700 } },
        "Nuestro diferencial no es una app: es operar con información.",
      ),
      e(
        Text,
        { style: { color: C.coral, fontFamily: F.mono, fontSize: 7, fontWeight: 500 } },
        "PERSONAS + PROCESO + OPAI",
      ),
    ),
  );

  const pillars = [
    {
      icon: "shield" as const,
      title: "Prevención",
      text: "Protocolos, rondas verificadas y lectura temprana de riesgos.",
    },
    {
      icon: "eye" as const,
      title: "Supervisión",
      text: "Control activo en terreno y escalamiento con responsables claros.",
    },
    {
      icon: "chart" as const,
      title: "Tecnología",
      text: "OPAI transforma cada evento en información útil y auditable.",
    },
    {
      icon: "users" as const,
      title: "Capital humano",
      text: "Selección rigurosa, capacitación continua y evaluación.",
    },
  ];

  const model = fixedSlide(
    "model",
    5,
    true,
    heading(
      "04 · Nuestro modelo",
      "De la presencia a la inteligencia operacional",
      "Integramos personas, protocolos y tecnología en un ciclo de mejora continuo.",
      true,
    ),
    e(
      View,
      { style: s.pillarGrid },
      ...pillars.map((pillar) =>
        e(
          View,
          { key: pillar.title, style: s.pillarCard },
          e(View, { style: s.iconBubbleDark }, icon(pillar.icon, C.coral, 15)),
          e(Text, { style: s.cardTitleDark }, pillar.title),
          e(Text, { style: s.cardTextDark }, pillar.text),
        ),
      ),
    ),
    e(
      View,
      { style: s.flowStrip },
      ...["Detectar", "Verificar", "Actuar", "Reportar"].flatMap((label, index) => [
        e(
          View,
          { key: `step-${label}`, style: s.flowStep },
          e(Text, { style: s.flowNumber }, `0${index + 1}`),
          e(Text, { style: s.flowLabel }, label),
        ),
        index < 3
          ? e(Text, { key: `arrow-${label}`, style: s.flowArrow }, "→")
          : null,
      ]),
    ),
    e(
      Text,
      {
        style: [
          s.bodyTextDark,
          { marginTop: 15, textAlign: "center", paddingHorizontal: 80 },
        ],
      },
      "El resultado: una seguridad medible, con evidencia y capacidad real de corregir antes de que un desvío se convierta en incidente.",
    ),
  );

  const opaiFeatures = [
    ["Rondas GPS", "Checkpoints, geofence y evidencia"],
    ["Control de acceso", "Visitas, personas y vehículos"],
    ["Alertas", "Anomalías y escalamiento en línea"],
    ["KPIs", "Cumplimiento y tendencias operativas"],
    ["Reportes", "Información diaria, semanal y mensual"],
    ["Portal 24/7", "Visibilidad directa para el cliente"],
  ];

  const opai = fixedSlide(
    "opai",
    6,
    false,
    heading(
      "05 · Tecnología propietaria",
      "Un portal. Toda la operación.",
      "OPAI conecta el servicio en terreno con la información que necesita su equipo para decidir.",
    ),
    e(
      View,
      { style: s.opaiGrid },
      e(
        View,
        { style: s.opaiCopy },
        e(Text, { style: s.opaiNameFallback }, "OPAI"),
        e(
          Text,
          { style: s.bodyText },
          "Cada ronda, acceso, novedad e incidente queda registrado. Usted ve el estado del servicio, recibe alertas y accede a reportes sin depender de planillas ni cadenas de correo.",
        ),
        e(
          View,
          { style: s.featureGrid },
          ...opaiFeatures.map(([label, meta]) =>
            e(
              View,
              { key: label, style: s.featureChip },
              e(Text, { style: s.featureChipLabel }, label),
              e(Text, { style: s.featureChipMeta }, meta),
            ),
          ),
        ),
      ),
      e(
        View,
        { style: s.deviceFrame },
        e(
          View,
          { style: s.deviceTop },
          e(View, { style: s.deviceDot }),
          e(View, { style: s.deviceDot }),
          e(View, { style: s.deviceDot }),
        ),
        portalShot
          ? e(PDFImage, { src: portalShot, style: s.deviceImage })
          : e(
              View,
              { style: s.deviceFallback },
              e(Text, { style: s.cardTextDark }, "Portal de clientes OPAI"),
            ),
        e(Text, { style: s.deviceCaption }, "Visibilidad en tiempo real"),
      ),
    ),
  );

  const evidenceCards = [
    {
      image: roundsShot,
      index: "01 · RONDAS",
      title: "Evidencia georreferenciada",
      text: "Ruta, hora, checkpoint y respaldo fotográfico en una sola vista.",
    },
    {
      image: accessShot,
      index: "02 · ACCESO",
      title: "Trazabilidad de ingresos",
      text: "Registro digital de personas, visitas y movimientos relevantes.",
    },
    {
      image: operationsShot,
      index: "03 · OPERACIÓN",
      title: "Planificación conectada",
      text: "Cobertura, asistencia y gestión operativa coordinadas en OPAI.",
    },
  ];

  const evidence = fixedSlide(
    "evidence",
    7,
    false,
    heading(
      "06 · Evidencia, no promesas",
      "La operación se puede ver, medir y auditar",
      "Tres capas de control convierten la actividad diaria en trazabilidad útil para supervisores y clientes.",
    ),
    e(
      View,
      { style: s.evidenceGrid },
      ...evidenceCards.map((card) =>
        e(
          View,
          { key: card.index, style: s.evidenceCard },
          card.image
            ? e(PDFImage, { src: card.image, style: s.evidenceImage })
            : e(View, { style: s.evidenceFallback }),
          e(
            View,
            { style: s.evidenceCopy },
            e(Text, { style: s.evidenceIndex }, card.index),
            e(Text, { style: s.evidenceTitle }, card.title),
            e(Text, { style: s.evidenceText }, card.text),
          ),
        ),
      ),
    ),
    e(
      Text,
      {
        style: [
          s.bodyText,
          { textAlign: "center", marginTop: 13, color: C.text3 },
        ],
      },
      "Una fuente de verdad compartida reduce fricción, acelera respuestas y mejora el control.",
    ),
  );

  const chainItems = [
    ["users", "Ejecutivo de cuenta", "Respuesta < 2 h"],
    ["chart", "Jefe de operaciones", "Escala < 1 h"],
    ["eye", "Supervisor de turno", "En sitio < 30 min"],
    ["shield", "Equipo asignado", "Cobertura 24/7"],
  ] as const;

  const operations = fixedSlide(
    "operations",
    8,
    false,
    heading(
      "07 · Gobierno del servicio",
      "Una cadena directa, con tiempos y responsables",
      "Cada requerimiento tiene dueño, escalamiento y evidencia de cierre.",
    ),
    e(
      View,
      { style: s.chain },
      ...chainItems.flatMap(([iconName, title, meta], index) => [
        e(
          View,
          { key: title, style: s.chainNode },
          e(View, { style: s.chainIcon }, icon(iconName, C.coral, 15)),
          e(
            View,
            null,
            e(Text, { style: s.chainTitle }, title),
            e(Text, { style: s.chainMeta }, meta),
          ),
        ),
        index < chainItems.length - 1
          ? e(View, { key: `connector-${title}`, style: s.chainConnector })
          : null,
      ]),
    ),
    e(
      View,
      { style: s.operationsBottom },
      e(
        View,
        { style: s.slaPanel },
        e(Text, { style: s.smallLabel }, "SLA operativo"),
        e(Text, { style: [s.cardTitleDark, { marginTop: 5 }] }, "Respuesta coordinada"),
        e(
          View,
          { style: s.slaGrid },
          ...[
            ["< 5 min", "Detección y registro"],
            ["< 15 min", "Reporte al cliente"],
            ["< 30 min", "Acción correctiva"],
          ].map(([value, label]) =>
            e(
              View,
              { key: value, style: s.slaCard },
              e(Text, { style: s.slaValue }, value),
              e(Text, { style: s.slaLabel }, label),
            ),
          ),
        ),
        e(
          Text,
          { style: [s.cardTextDark, { marginTop: 9 }] },
          "Los niveles definitivos se ajustan al alcance acordado y quedan documentados en contrato.",
        ),
      ),
      e(
        View,
        { style: s.reportingPanel },
        e(Text, { style: s.smallLabel }, "Reportabilidad"),
        ...[
          ["DIARIO", "Novedades y asistencia", "Actividad crítica del turno"],
          ["SEMANAL", "KPIs y tendencias", "Alertas y recomendaciones"],
          ["MENSUAL", "Informe ejecutivo", "Cumplimiento y plan de acción"],
        ].map(([badge, title, meta]) =>
          e(
            View,
            { key: badge, style: s.reportRow },
            e(Text, { style: s.reportBadge }, badge),
            e(
              View,
              null,
              e(Text, { style: s.reportTitle }, title),
              e(Text, { style: s.reportMeta }, meta),
            ),
          ),
        ),
      ),
    ),
  );

  const shiftPhases = [
    {
      number: "01",
      title: "Antes del turno",
      items: [
        "Cobertura y puesto confirmados",
        "Ausencias detectadas",
        "Reemplazos activados",
      ],
    },
    {
      number: "02",
      title: "Inicio controlado",
      items: [
        "Asistencia validada",
        "Equipamiento verificado",
        "Briefing y consignas",
      ],
    },
    {
      number: "03",
      title: "Ejecución",
      items: [
        "Accesos y rondas",
        "Novedades e incidentes",
        "Supervisión del servicio",
      ],
    },
    {
      number: "04",
      title: "Cierre y relevo",
      items: [
        "Entrega de puesto",
        "Pendientes documentados",
        "Reporte consolidado",
      ],
    },
  ];

  const shiftLifecycle = fixedSlide(
    "shift-lifecycle",
    9,
    false,
    heading(
      "08 · Disciplina del turno",
      "Cada turno se prepara, ejecuta y cierra con evidencia",
      "La calidad operacional no depende de la memoria: sigue una secuencia controlada y visible.",
    ),
    e(
      View,
      {
        style: {
          flexDirection: "row",
          gap: 10,
          marginTop: 22,
          height: 226,
        },
      },
      ...shiftPhases.map((phase, phaseIndex) =>
        e(
          View,
          {
            key: phase.number,
            style: {
              flex: 1,
              borderRadius: 12,
              backgroundColor: C.white,
              border: `1 solid ${C.line}`,
              padding: 15,
              position: "relative",
            },
          },
          e(
            View,
            {
              style: {
                width: 31,
                height: 31,
                borderRadius: 16,
                backgroundColor:
                  phaseIndex === shiftPhases.length - 1
                    ? C.tealSoft
                    : C.coralSoft,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 13,
              },
            },
            e(
              Text,
              {
                style: {
                  fontFamily: F.mono,
                  color:
                    phaseIndex === shiftPhases.length - 1 ? C.teal : C.coral,
                  fontSize: 7,
                  fontWeight: 500,
                },
              },
              phase.number,
            ),
          ),
          e(Text, { style: s.cardTitle }, phase.title),
          e(
            View,
            { style: { marginTop: 12, gap: 8 } },
            ...phase.items.map((item) =>
              e(
                View,
                {
                  key: item,
                  style: {
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 7,
                  },
                },
                e(View, {
                  style: {
                    width: 5,
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: C.teal,
                  },
                }),
                e(
                  Text,
                  {
                    style: {
                      flex: 1,
                      color: C.text2,
                      fontSize: 7.2,
                      lineHeight: 1.35,
                    },
                  },
                  item,
                ),
              ),
            ),
          ),
        ),
      ),
    ),
    e(
      View,
      {
        style: {
          marginTop: 15,
          borderRadius: 12,
          backgroundColor: C.ink,
          padding: 15,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        },
      },
      e(
        View,
        { style: { width: 250 } },
        e(Text, { style: s.smallLabel }, "SALIDA OPERACIONAL"),
        e(
          Text,
          { style: [s.cardTitleDark, { marginTop: 5 }] },
          "El cliente recibe una operación legible",
        ),
      ),
      ...[
        ["ASISTENCIA", "Quién está y dónde"],
        ["RONDAS", "Qué se verificó"],
        ["INCIDENTES", "Qué ocurrió y cómo se actuó"],
        ["SUPERVISIÓN", "Qué se corrigió"],
      ].map(([label, meta]) =>
        e(
          View,
          {
            key: label,
            style: {
              width: 132,
              borderLeft: "1 solid #31415C",
              paddingLeft: 11,
            },
          },
          e(
            Text,
            {
              style: {
                color: C.teal,
                fontFamily: F.mono,
                fontSize: 6.2,
                fontWeight: 500,
              },
            },
            label,
          ),
          e(
            Text,
            {
              style: {
                color: "#A9B6CA",
                fontSize: 6.3,
                lineHeight: 1.35,
                marginTop: 4,
              },
            },
            meta,
          ),
        ),
      ),
    ),
  );

  const incidentSteps = [
    "Detectar",
    "Registrar",
    "Clasificar",
    "Contener",
    "Escalar",
    "Cerrar",
  ];

  const incidentManagement = fixedSlide(
    "incident-management",
    10,
    true,
    heading(
      "09 · Gestión de incidentes",
      "Del hallazgo al cierre: un flujo, no una llamada aislada",
      "OPAI mantiene la trazabilidad mientras la cadena operacional actúa.",
      true,
    ),
    e(
      View,
      {
        style: {
          flexDirection: "row",
          alignItems: "center",
          marginTop: 20,
          borderRadius: 12,
          backgroundColor: C.white,
          paddingVertical: 14,
          paddingHorizontal: 15,
        },
      },
      ...incidentSteps.flatMap((step, index) => [
        e(
          View,
          {
            key: step,
            style: {
              width: 122,
              alignItems: "center",
            },
          },
          e(
            View,
            {
              style: {
                width: 27,
                height: 27,
                borderRadius: 14,
                backgroundColor:
                  index === incidentSteps.length - 1 ? C.teal : C.coral,
                alignItems: "center",
                justifyContent: "center",
              },
            },
            e(
              Text,
              {
                style: {
                  color: C.white,
                  fontFamily: F.mono,
                  fontSize: 6.5,
                  fontWeight: 500,
                },
              },
              `0${index + 1}`,
            ),
          ),
          e(
            Text,
            {
              style: {
                color: C.ink,
                fontSize: 7.3,
                fontWeight: 700,
                marginTop: 7,
              },
            },
            step,
          ),
        ),
        index < incidentSteps.length - 1
          ? e(
              Text,
              {
                key: `incident-arrow-${step}`,
                style: { color: C.text3, fontSize: 9, marginHorizontal: -5 },
              },
              "→",
            )
          : null,
      ]),
    ),
    e(
      View,
      {
        style: {
          flexDirection: "row",
          gap: 14,
          marginTop: 15,
          height: 186,
        },
      },
      e(
        View,
        {
          style: {
            width: 520,
            borderRadius: 12,
            backgroundColor: C.ink2,
            border: "1 solid #273A59",
            padding: 16,
          },
        },
        e(Text, { style: s.smallLabel }, "CADA INCIDENTE DEJA"),
        e(
          View,
          {
            style: {
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 9,
              marginTop: 13,
            },
          },
          ...[
            ["Hora y ubicación", "Cuándo y dónde ocurrió"],
            ["Evidencia", "Fotos, notas y antecedentes"],
            ["Responsable", "Quién tomó la acción"],
            ["Cierre", "Resultado y seguimiento"],
          ].map(([title, meta], index) =>
            e(
              View,
              {
                key: title,
                style: {
                  width: 238,
                  minHeight: 57,
                  borderRadius: 8,
                  backgroundColor: C.ink3,
                  padding: 10,
                  flexDirection: "row",
                  gap: 9,
                },
              },
              e(
                View,
                {
                  style: {
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: "#253854",
                    alignItems: "center",
                    justifyContent: "center",
                  },
                },
                icon(index % 2 === 0 ? "check" : "eye", C.teal, 12),
              ),
              e(
                View,
                { style: { flex: 1 } },
                e(
                  Text,
                  { style: { color: C.white, fontSize: 7.5, fontWeight: 700 } },
                  title,
                ),
                e(
                  Text,
                  {
                    style: {
                      color: "#A9B6CA",
                      fontSize: 6.2,
                      lineHeight: 1.35,
                      marginTop: 3,
                    },
                  },
                  meta,
                ),
              ),
            ),
          ),
        ),
      ),
      e(
        View,
        {
          style: {
            flex: 1,
            borderRadius: 12,
            overflow: "hidden",
            position: "relative",
            backgroundColor: C.ink3,
          },
        },
        roundsShot
          ? e(PDFImage, {
              src: roundsShot,
              style: {
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "top center",
              },
            })
          : null,
        e(View, {
          style: {
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 54,
            backgroundColor: C.ink,
            opacity: 0.86,
          },
        }),
        e(
          Text,
          {
            style: {
              position: "absolute",
              left: 12,
              bottom: 18,
              color: C.white,
              fontSize: 7.5,
              fontWeight: 700,
            },
          },
          "Alertas + contexto + trazabilidad",
        ),
      ),
    ),
  );

  const continuity = fixedSlide(
    "continuity",
    11,
    false,
    heading(
      "10 · Supervisión + continuidad",
      "Nadie opera solo y ningún desvío queda sin dueño",
      "La supervisión de terreno y el Centro de Control Operacional sostienen cobertura, calidad y respuesta.",
    ),
    e(
      View,
      {
        style: {
          flexDirection: "row",
          gap: 12,
          marginTop: 18,
          height: 200,
        },
      },
      ...[
        {
          label: "SUPERVISOR DE TERRENO",
          title: "Verifica y corrige en sitio",
          icon: "eye" as const,
          items: [
            "Asistencia, presentación y equipamiento",
            "Rondas, consignas y puntos críticos",
            "Coaching y corrección inmediata",
            "Escalamiento al jefe de operaciones",
          ],
        },
        {
          label: "CENTRO DE CONTROL OPERACIONAL",
          title: "Monitorea y coordina",
          icon: "chart" as const,
          items: [
            "Alertas y cumplimiento en tiempo real",
            "Coordinación de reemplazos y apoyo",
            "Trazabilidad de incidentes",
            "Información consolidada para el cliente",
          ],
        },
      ].map((panel, panelIndex) =>
        e(
          View,
          {
            key: panel.label,
            style: {
              flex: 1,
              borderRadius: 12,
              padding: 15,
              backgroundColor: panelIndex === 0 ? C.white : C.ink,
              border:
                panelIndex === 0 ? `1 solid ${C.line}` : "1 solid #273A59",
            },
          },
          e(
            View,
            { style: { flexDirection: "row", alignItems: "center", gap: 9 } },
            e(
              View,
              {
                style: {
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor:
                    panelIndex === 0 ? C.coralSoft : C.ink3,
                },
              },
              icon(panel.icon, panelIndex === 0 ? C.coral : C.teal, 14),
            ),
            e(
              View,
              null,
              e(
                Text,
                {
                  style: [
                    s.smallLabel,
                    panelIndex === 1 ? { color: "#7F8DA4" } : {},
                  ],
                },
                panel.label,
              ),
              e(
                Text,
                {
                  style:
                    panelIndex === 0 ? s.cardTitle : s.cardTitleDark,
                },
                panel.title,
              ),
            ),
          ),
          e(
            View,
            { style: { marginTop: 13, gap: 8 } },
            ...panel.items.map((item) =>
              e(
                View,
                {
                  key: item,
                  style: {
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  },
                },
                e(View, {
                  style: {
                    width: 5,
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: panelIndex === 0 ? C.coral : C.teal,
                  },
                }),
                e(
                  Text,
                  {
                    style: {
                      flex: 1,
                      color: panelIndex === 0 ? C.text2 : "#A9B6CA",
                      fontSize: 7.2,
                      lineHeight: 1.35,
                    },
                  },
                  item,
                ),
              ),
            ),
          ),
        ),
      ),
    ),
    e(
      View,
      {
        style: {
          marginTop: 14,
          flexDirection: "row",
          gap: 8,
        },
      },
      ...[
        ["Inasistencia", "Equipo de respaldo", "< 2 h"],
        ["Emergencia en sitio", "Supervisor + protocolo", "< 30 min"],
        ["Falla tecnológica", "Soporte + contingencia", "< 1 h"],
        ["Escalamiento crítico", "Operaciones + gerencia", "< 2 h"],
      ].map(([scenario, action, time]) =>
        e(
          View,
          {
            key: scenario,
            style: {
              flex: 1,
              minHeight: 78,
              borderRadius: 10,
              backgroundColor: C.white,
              border: `1 solid ${C.line}`,
              padding: 11,
            },
          },
          e(Text, { style: s.smallLabel }, scenario),
          e(
            Text,
            { style: [s.cardTitle, { fontSize: 8.5, marginTop: 6 }] },
            action,
          ),
          e(
            Text,
            {
              style: {
                color: C.coral,
                fontFamily: F.mono,
                fontSize: 7,
                fontWeight: 500,
                marginTop: 6,
              },
            },
            time,
          ),
        ),
      ),
    ),
    e(
      Text,
      {
        style: {
          color: C.text3,
          fontSize: 6.2,
          marginTop: 7,
          textAlign: "right",
        },
      },
      "Tiempos referenciales; el SLA definitivo se establece según alcance y contrato.",
    ),
  );

  const peopleSteps = [
    ["Selección", "Entrevista, referencias y validación de antecedentes"],
    ["Habilitación", "Documentación y acreditaciones requeridas"],
    ["Capacitación", "Protocolos generales y específicos de la instalación"],
    ["Evaluación", "Supervisión, desempeño y mejora continua"],
  ];

  const people = fixedSlide(
    "people",
    12,
    false,
    heading(
      "11 · Personas",
      "La tecnología amplifica a un equipo bien preparado",
      "La calidad del servicio comienza antes de asignar a una persona y se sostiene con supervisión.",
    ),
    e(
      View,
      { style: s.peopleGrid },
      e(
        View,
        { style: s.photoMosaic },
        teamPhoto
          ? e(PDFImage, { src: teamPhoto, style: s.photoLarge })
          : e(View, { style: [s.photoLarge, s.photoPlaceholder] }),
        e(
          View,
          { style: s.photoSide },
          accessPhoto
            ? e(PDFImage, { src: accessPhoto, style: s.photoSmall })
            : e(View, { style: [s.photoSmall, s.photoPlaceholder] }),
          conciergePhoto
            ? e(PDFImage, { src: conciergePhoto, style: s.photoSmall })
            : e(View, { style: [s.photoSmall, s.photoPlaceholder] }),
        ),
      ),
      e(
        View,
        { style: s.peopleCopy },
        e(Text, { style: s.smallLabel }, "ESTÁNDAR GARD"),
        e(
          View,
          { style: s.complianceRow },
          ...[
            ["Perfil", "Selección alineada al puesto y al entorno"],
            ["Protocolo", "Formación específica para la instalación"],
            ["Desempeño", "Evaluación y retroalimentación continua"],
          ].map(([value, meta]) =>
            e(
              View,
              { key: value, style: s.complianceBadge },
              e(Text, { style: s.complianceValue }, value),
              e(Text, { style: s.complianceMeta }, meta),
            ),
          ),
        ),
        ...peopleSteps.map(([title, meta], index) =>
          e(
            View,
            { key: title, style: s.peopleStep },
            e(Text, { style: s.peopleStepNum }, `0${index + 1}`),
            e(
              View,
              null,
              e(Text, { style: s.peopleStepTitle }, title),
              e(Text, { style: s.peopleStepMeta }, meta),
            ),
          ),
        ),
        e(
          View,
          { style: s.contingency },
          icon("check", C.teal, 18),
          e(
            View,
            null,
            e(Text, { style: s.contingencyTitle }, "Equipo estable, con respaldo"),
            e(
              Text,
              { style: s.contingencyMeta },
              "La continuidad se planifica antes de que ocurra una ausencia.",
            ),
          ),
        ),
      ),
    ),
  );

  const compliance = fixedSlide(
    "compliance",
    13,
    true,
    heading(
      "12 · Cumplimiento operativo",
      "El cumplimiento se incorpora al servicio, no se archiva",
      "Acreditación, prevención y evidencia acompañan todo el ciclo de la operación.",
      true,
    ),
    e(
      View,
      {
        style: {
          flexDirection: "row",
          gap: 9,
          marginTop: 20,
        },
      },
      ...[
        ["OS-10", "Acreditación de seguridad privada"],
        ["LEY 21.659", "Marco legal de seguridad privada"],
        ["D.S. 44", "Gestión preventiva de riesgos"],
        ["LEY 16.744", "Seguridad y salud en el trabajo"],
      ].map(([value, meta]) =>
        e(
          View,
          {
            key: value,
            style: {
              flex: 1,
              borderRadius: 10,
              backgroundColor: C.white,
              padding: 12,
              minHeight: 70,
            },
          },
          e(
            Text,
            { style: { color: C.teal, fontSize: 10, fontWeight: 800 } },
            value,
          ),
          e(
            Text,
            {
              style: {
                color: C.text2,
                fontSize: 6.5,
                lineHeight: 1.4,
                marginTop: 5,
              },
            },
            meta,
          ),
        ),
      ),
    ),
    e(
      View,
      {
        style: {
          flexDirection: "row",
          gap: 12,
          marginTop: 13,
          height: 180,
        },
      },
      ...[
        {
          label: "ANTES DE ASIGNAR",
          title: "Screening y habilitación",
          items: [
            "Antecedentes y referencias laborales",
            "Evaluación psicológica y de idoneidad",
            "Documentación y acreditaciones vigentes",
            "Inducción al protocolo del cliente",
          ],
        },
        {
          label: "DURANTE EL SERVICIO",
          title: "Evidencia de cumplimiento",
          items: [
            "Asistencia y cobertura registradas",
            "Rondas y consignas verificables",
            "Capacitaciones y evaluaciones",
            "Incidentes, acciones y cierres trazables",
          ],
        },
      ].map((panel, index) =>
        e(
          View,
          {
            key: panel.label,
            style: {
              flex: 1,
              borderRadius: 12,
              padding: 15,
              backgroundColor: C.ink2,
              border: "1 solid #273A59",
            },
          },
          e(
            Text,
            {
              style: [
                s.smallLabel,
                { color: index === 0 ? C.coral : C.teal },
              ],
            },
            panel.label,
          ),
          e(
            Text,
            { style: [s.cardTitleDark, { marginTop: 6 }] },
            panel.title,
          ),
          e(
            View,
            { style: { gap: 9, marginTop: 13 } },
            ...panel.items.map((item) =>
              e(
                View,
                {
                  key: item,
                  style: {
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  },
                },
                icon("check", index === 0 ? C.coral : C.teal, 12),
                e(
                  Text,
                  {
                    style: {
                      flex: 1,
                      color: "#B9C4D5",
                      fontSize: 7.2,
                      lineHeight: 1.35,
                    },
                  },
                  item,
                ),
              ),
            ),
          ),
        ),
      ),
    ),
    e(
      View,
      {
        style: {
          marginTop: 13,
          borderRadius: 10,
          backgroundColor: C.white,
          paddingVertical: 12,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        },
      },
      e(
        Text,
        { style: { color: C.ink, fontSize: 9.5, fontWeight: 700 } },
        "Cumplimiento continuo, desde la selección hasta el reporte ejecutivo",
      ),
      e(
        View,
        { style: { flexDirection: "row", alignItems: "center", gap: 8 } },
        ...["HABILITAR", "OPERAR", "VERIFICAR", "MEJORAR"].flatMap(
          (label, index) => [
            e(
              Text,
              {
                key: label,
                style: {
                  color: index === 3 ? C.teal : C.text2,
                  fontFamily: F.mono,
                  fontSize: 6.3,
                  fontWeight: 500,
                },
              },
              label,
            ),
            index < 3
              ? e(
                  Text,
                  {
                    key: `${label}-arrow`,
                    style: { color: C.text3, fontSize: 8 },
                  },
                  "→",
                )
              : null,
          ],
        ),
      ),
    ),
  );

  const proof = fixedSlide(
    "proof",
    14,
    false,
    heading(
      "13 · Confianza",
      "Resultados que se sostienen en terreno",
      "Experiencia en operaciones donde la continuidad, el control y la trazabilidad importan.",
    ),
    e(
      View,
      { style: s.proofTop },
      ...proofMetrics.map((metric) =>
        e(
          View,
          { key: `${metric.value}-${metric.label}`, style: s.proofMetric },
          e(Text, { style: s.proofValue }, metric.value),
          e(Text, { style: s.proofLabel }, metric.label),
        ),
      ),
    ),
    sectors.length > 0
      ? e(
          View,
          { style: s.sectorRow },
          ...sectors.map((sector) =>
            e(Text, { key: sector, style: s.sectorTag }, sector),
          ),
        )
      : null,
    clientLogos.length > 0
      ? e(
          View,
          { style: s.logoWall },
          ...clientLogos.map((client) =>
            e(
              View,
              { key: client.name, style: s.logoCell },
              e(PDFImage, { src: client.src, style: s.clientLogo }),
            ),
          ),
        )
      : e(
          View,
          { style: s.trustFallback },
          e(Text, { style: s.trustFallbackValue }, "24/7"),
          e(
            Text,
            { style: s.trustFallbackCopy },
            "Un servicio conectado,\ndocumentado y visible\npara su equipo.",
          ),
        ),
  );

  const timelineSteps = [
    ["01", "DÍA 1-2", "Diagnóstico", "Kick-off, visita y definición de protocolos"],
    ["02", "DÍA 3-5", "Preparación", "Selección, asignación y capacitación específica"],
    ["03", "DÍA 5-7", "Configuración", "OPAI, dispositivos y flujos de información"],
    ["04", "DÍA 7-8", "Validación", "Pruebas, simulacros y ajustes operativos"],
    ["05", "DÍA 9-10", "Inicio", "Inicio supervisado y ajustes finales"],
  ];

  const implementation = fixedSlide(
    "implementation",
    15,
    false,
    heading(
      "14 · Puesta en marcha",
      "Implementación controlada, sin improvisaciones",
      "Un plan de 5 a 10 días hábiles prepara personas, protocolos y tecnología antes del inicio.",
    ),
    e(
      View,
      { style: s.timeline },
      ...timelineSteps.map(([number, day, title, meta], index) =>
        e(
          View,
          { key: number, style: s.timelineStep },
          index < timelineSteps.length - 1
            ? e(View, { style: s.timelineLine })
            : null,
          e(
            View,
            {
              style: [
                s.timelineCircle,
                index === timelineSteps.length - 1
                  ? { backgroundColor: C.teal }
                  : {},
              ],
            },
            e(Text, { style: s.timelineNumber }, number),
          ),
          e(Text, { style: s.timelineDay }, day),
          e(Text, { style: s.timelineTitle }, title),
          e(Text, { style: s.timelineMeta }, meta),
        ),
      ),
    ),
    e(
      View,
      { style: s.launchPanel },
      e(
        View,
        null,
        e(Text, { style: s.launchTitle }, "Acompañamiento desde el primer día"),
        e(
          Text,
          { style: s.launchText },
          "Nuestro equipo permanece cerca durante la puesta en marcha para verificar cobertura, resolver desvíos y asegurar una transición ordenada.",
        ),
      ),
      e(Text, { style: s.launchBadge }, "OPERACIÓN + OPAI"),
    ),
  );

  const portalUrl = cleanText(props.portalUrl);
  const closeImage = conciergePhoto || teamPhoto || coverPhoto;
  const close = e(
    Page,
    { key: "close", size: deckPageSize(), style: s.closePage, wrap: false },
    e(View, { style: { width: DECK_SIZE.width, height: DECK_SIZE.height } }),
    closeImage
      ? e(PDFImage, { src: closeImage, style: s.closePhoto })
      : e(View, { style: s.coverPhotoFallback }),
    e(View, { style: s.closeOverlay }),
    e(
      View,
      { style: s.closeBody },
      providerLogoUri
        ? e(PDFImage, { src: providerLogoUri, style: s.coverLogo })
        : e(
            Text,
            { style: s.coverBrandFallback },
            brandName.toUpperCase(),
          ),
      e(Text, { style: s.closeEyebrow }, "Siguiente paso"),
      e(
        Text,
        { style: s.closeTitle },
        "Conversemos sobre una seguridad que pueda demostrarse.",
      ),
      e(
        Text,
        { style: s.closeText },
        `${cleanText(contactName)}, podemos ajustar el modelo a las prioridades de ${cleanText(companyName)} y definir juntos el alcance de una operación segura, visible y medible.`,
      ),
      e(
        View,
        { style: s.closeCta },
        portalUrl
          ? e(
              Link,
              { src: portalUrl, style: s.closeCtaButton },
              "ABRIR PORTAL DEL CLIENTE",
            )
          : website
            ? e(
                Link,
                {
                  src: /^https?:\/\//i.test(website)
                    ? website
                    : `https://${website}`,
                  style: s.closeCtaButton,
                },
                "CONOCER MÁS",
              )
            : e(Text, { style: s.closeCtaFallback }, "COORDINAR REUNIÓN"),
        e(
          Text,
          { style: [s.bodyTextDark, { fontSize: 7.5 }] },
          "Respuesta comercial directa · Sin compromiso",
        ),
      ),
      e(
        View,
        { style: s.closeContact },
        e(
          View,
          { style: s.closeContactItem },
          e(Text, { style: s.smallLabel }, "Email"),
          e(
            Text,
            { style: s.closeContactValue },
            cleanText(companyConfig.email),
          ),
        ),
        e(
          View,
          { style: s.closeContactItem },
          e(Text, { style: s.smallLabel }, "Teléfono"),
          e(
            Text,
            { style: s.closeContactValue },
            cleanText(companyConfig.phone),
          ),
        ),
        e(
          View,
          { style: s.closeContactItem },
          e(Text, { style: s.smallLabel }, "Web"),
          e(Text, { style: s.closeContactValue }, websiteLabel),
        ),
      ),
    ),
  );

  const document = e(
    Document,
    {
      title: `Presentación comercial - ${cleanText(companyName)}`,
      author: brandName,
      subject: "Presentación institucional de servicios de seguridad",
      keywords: "seguridad privada, OPAI, supervisión, trazabilidad",
      language: "es-CL",
    },
    cover,
    executive,
    gard,
    differentiation,
    model,
    opai,
    evidence,
    operations,
    shiftLifecycle,
    incidentManagement,
    continuity,
    people,
    compliance,
    proof,
    implementation,
    close,
  );

  const buffer = await renderToBuffer(document);
  return Buffer.from(buffer);
}
