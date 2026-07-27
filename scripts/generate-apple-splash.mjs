#!/usr/bin/env node
/**
 * Genera splash screens iOS (fondo #060a13 + marca centrada).
 * Uso: node scripts/generate-apple-splash.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { join } from "node:path";

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeB = Buffer.from(type);
  const crcB = Buffer.alloc(4);
  crcB.writeUInt32BE(crc32(Buffer.concat([typeB, data])));
  return Buffer.concat([len, typeB, data, crcB]);
}
function writePng(w, h, outPath) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.08;
  for (let y = 0; y < h; y++) {
    const row = y * (w * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const i = row + 1 + x * 4;
      const d = Math.hypot(x - cx, y - cy);
      let R = 6, G = 10, B = 19;
      if (d < r) { R = 20; G = 168; B = 138; }
      else if (d < r + 2) { R = 12; G = 80; B = 70; }
      raw[i] = R; raw[i + 1] = G; raw[i + 2] = B; raw[i + 3] = 255;
    }
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const idat = deflateSync(raw, { level: 9 });
  writeFileSync(outPath, Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]));
}

const outDir = join(process.cwd(), "public/icons/splash");
mkdirSync(outDir, { recursive: true });
for (const [w, h] of [[1170, 2532], [1284, 2778], [1290, 2796], [750, 1334]]) {
  writePng(w, h, join(outDir, `apple-splash-${w}-${h}.png`));
}
console.log("splash PNGs generated in public/icons/splash/");
