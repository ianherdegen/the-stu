import { readFileSync } from "fs";
import opentype from "opentype.js";
import sharp from "sharp";

const font = opentype.parse(readFileSync(new URL("./fonts/Anybody-800.woff", import.meta.url)));

function linePath(text, fontSize) {
  const path = new opentype.Path();
  const tracking = fontSize * 0.14;
  let x = 0;
  for (const char of text) {
    const glyph = font.charToGlyph(char);
    const glyphPath = glyph.getPath(x, 0, fontSize);
    path.commands.push(...glyphPath.commands);
    x += (glyph.advanceWidth || 0) * (fontSize / font.unitsPerEm) + tracking;
  }
  return path;
}

function measureWidth(text) {
  const box = linePath(text, 100).getBoundingBox();
  return Math.max(1, box.x2 - box.x1);
}

export async function watermark(buffer, name) {
  const label = String(name || "").trim().replace(/\s+/g, " ").toUpperCase();
  if (!label) return null;

  const base = sharp(buffer, { animated: false, failOn: "none" }).rotate();
  const meta = await base.metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  if (!width || !height) return null;

  const fontSize = Math.max(18, Math.min(width * 0.13, (Math.hypot(width, height) * 0.9) / measureWidth(label) * 100));
  const path = linePath(label, fontSize);
  const box = path.getBoundingBox();
  const midX = (box.x1 + box.x2) / 2;
  const data = path.toPathData(2);
  const stroke = Math.max(1, fontSize * 0.018);
  const lines = [0.2, 0.4, 0.62, 0.84].map((portion) => {
    const baseline = height * portion;
    return `<path d="${data}" transform="translate(${width / 2 - midX} ${baseline})"/>`;
  }).join("");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <g transform="rotate(-28 ${width / 2} ${height / 2})" fill="rgba(255,255,255,0.78)" stroke="rgba(0,0,0,0.4)" stroke-width="${stroke}" stroke-linejoin="round" paint-order="stroke fill">
    ${lines}
  </g>
</svg>`;

  return base.composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
}
