"use client";

/**
 * GlassAmbient — fondo ambiental fijo (aurora) que el Liquid Glass refracta.
 *
 * 3 blobs (teal / esmeralda / azul profundo) con drift lento + capa de noise
 * al 5%. Es lo que el vidrio translúcido de las superficies refleja/refracta.
 *
 * Sólo mobile (`< lg`). Se oculta bajo `prefers-reduced-transparency` y no
 * anima bajo `prefers-reduced-motion` (reglas en globals.css). `aria-hidden`.
 */

const NOISE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'>" +
      "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter>" +
      "<rect width='100%' height='100%' filter='url(#n)'/></svg>",
  );

const BLOBS = [
  { c: "hsl(166 76% 47% / 0.30)", top: "-10%", left: "-12%", size: "64vw", dur: "30s", delay: "0s" },
  { c: "hsl(152 70% 45% / 0.22)", top: "36%", left: "56%", size: "72vw", dur: "38s", delay: "-7s" },
  { c: "hsl(214 82% 42% / 0.26)", top: "70%", left: "-8%", size: "60vw", dur: "26s", delay: "-14s" },
];

export function GlassAmbient() {
  return (
    <div
      aria-hidden
      className="glass-ambient pointer-events-none fixed inset-0 -z-10 overflow-hidden lg:hidden"
    >
      {BLOBS.map((b, i) => (
        <div
          key={i}
          className="glass-ambient-blob absolute rounded-full"
          style={{
            top: b.top,
            left: b.left,
            width: b.size,
            height: b.size,
            background: `radial-gradient(circle at center, ${b.c}, transparent 70%)`,
            filter: "blur(90px)",
            animation: `glassDrift ${b.dur} ease-in-out ${b.delay} infinite`,
            willChange: "transform",
          }}
        />
      ))}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url("${NOISE}")`,
          backgroundSize: "120px 120px",
          opacity: 0.05,
          mixBlendMode: "overlay",
        }}
      />
    </div>
  );
}
