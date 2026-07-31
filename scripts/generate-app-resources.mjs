/**
 * Generates store-ready icon/splash PNGs for each Capacitor app.
 *
 * Outputs (committed under resources/):
 *   resources/<app>/icon.png         — 1024×1024 (Apple App Store)
 *   resources/<app>/splash.png       — 2732×2732 light splash
 *   resources/<app>/splash-dark.png  — 2732×2732 dark splash
 *
 * Source: public/icons/icon-512x512.png, composited onto a solid brand
 * background. Terreno / Cliente get a small color badge overlay so the
 * three listings stay visually distinct on the home screen.
 *
 * After `npm run cap:<app>:ios:init` (or android:init), generate native
 * asset catalogs locally with:
 *
 *   npx @capacitor/assets generate --assetPath resources/<app> --ios --android
 *
 * Usage:
 *   node scripts/generate-app-resources.mjs
 */
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const SOURCE = join(ROOT, "public/icons/icon-512x512.png");

const APPS = [
  {
    id: "erp",
    bg: "#0a1628",
    badge: null,
  },
  {
    id: "terreno",
    bg: "#0a1628",
    badge: "#f59e0b",
  },
  {
    id: "cliente",
    bg: "#060a13",
    badge: "#38bdf8",
  },
];

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

async function composeIcon(app, size) {
  const { r, g, b } = hexToRgb(app.bg);
  const pad = Math.round(size * 0.18);
  const inner = size - pad * 2;

  const baseIcon = await sharp(SOURCE)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const layers = [
    {
      input: {
        create: {
          width: size,
          height: size,
          channels: 4,
          background: { r, g, b, alpha: 1 },
        },
      },
    },
    { input: baseIcon, top: pad, left: pad },
  ];

  if (app.badge) {
    const badgeSize = Math.round(size * 0.22);
    const badgeSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${badgeSize}" height="${badgeSize}">
        <circle cx="${badgeSize / 2}" cy="${badgeSize / 2}" r="${badgeSize / 2}" fill="${app.badge}"/>
      </svg>`,
    );
    layers.push({
      input: await sharp(badgeSvg).png().toBuffer(),
      top: size - badgeSize - Math.round(size * 0.08),
      left: size - badgeSize - Math.round(size * 0.08),
    });
  }

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r, g, b, alpha: 1 },
    },
  })
    .composite(layers.slice(1))
    .png()
    .toBuffer();
}

async function composeSplash(app, size) {
  const { r, g, b } = hexToRgb(app.bg);
  const iconSize = Math.round(size * 0.28);
  const icon = await composeIcon(app, iconSize);
  const top = Math.round((size - iconSize) / 2);
  const left = Math.round((size - iconSize) / 2);

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r, g, b, alpha: 1 },
    },
  })
    .composite([{ input: icon, top, left }])
    .png()
    .toBuffer();
}

async function main() {
  if (!existsSync(SOURCE)) {
    console.error(`[generate-app-resources] missing source icon: ${SOURCE}`);
    process.exit(1);
  }

  for (const app of APPS) {
    const dir = join(ROOT, "resources", app.id);
    mkdirSync(dir, { recursive: true });

    const icon = await composeIcon(app, 1024);
    const splash = await composeSplash(app, 2732);

    await sharp(icon).toFile(join(dir, "icon.png"));
    await sharp(splash).toFile(join(dir, "splash.png"));
    await sharp(splash).toFile(join(dir, "splash-dark.png"));

    console.log(`[generate-app-resources] wrote resources/${app.id}/{icon,splash,splash-dark}.png`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
