import sharp from "sharp";
import { readFileSync } from "fs";

const svg = readFileSync("public/favicon.svg");

async function generate() {
  const sizes = [192, 512];
  for (const size of sizes) {
    await sharp(svg)
      .resize(size, size)
      .png()
      .toFile(`public/pwa-${size}x${size}.png`);
    console.log(`Generated pwa-${size}x${size}.png`);
  }

  const maskable = [192, 512];
  const padding = (s) => Math.round(s * 0.15);
  for (const s of maskable) {
    const inner = s - padding(s) * 2;
    await sharp(svg)
      .resize(inner, inner)
      .extend({
        top: padding(s),
        bottom: padding(s),
        left: padding(s),
        right: padding(s),
        background: { r: 30, g: 41, b: 59, alpha: 1 },
      })
      .png()
      .toFile(`public/pwa-maskable-${s}x${s}.png`);
    console.log(`Generated pwa-maskable-${s}x${s}.png`);
  }
}

generate().catch(console.error);
