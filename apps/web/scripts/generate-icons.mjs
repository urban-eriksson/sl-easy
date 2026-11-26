/**
 * One-off: renders public/favicon.svg to the PNG sizes the manifest and iOS need.
 * Run `npm run icons` after editing favicon.svg, commit the output.
 */
import { writeFileSync } from "node:fs";
import sharp from "sharp";

const BG = "#101114";
const targets = [
  { size: 192, out: "public/icon-192.png" },
  { size: 512, out: "public/icon-512.png" },
  { size: 180, out: "public/apple-touch-icon.png" },
  // Maskable: the artwork shrunk into the safe zone on a full-bleed background.
  { size: 192, out: "public/icon-maskable-192.png", inset: 0.14 },
  { size: 512, out: "public/icon-maskable-512.png", inset: 0.14 },
];

for (const { size, out, inset = 0 } of targets) {
  const inner = Math.round(size * (1 - 2 * inset));
  const art = await sharp("public/favicon.svg", { density: 300 })
    .resize(inner, inner)
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: art }])
    .png()
    .toFile(out);
  console.log(`wrote ${out} (${size}x${size})`);
}

// favicon.ico for browsers that skip the SVG: one 32px PNG in an ICO wrapper.
const png = await sharp("public/favicon.svg", { density: 300 }).resize(32, 32).png().toBuffer();
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // one image
header.writeUInt8(32, 6); // width
header.writeUInt8(32, 7); // height
header.writeUInt16LE(1, 10); // colour planes
header.writeUInt16LE(32, 12); // bits per pixel
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(22, 18); // offset of the image
writeFileSync("public/favicon.ico", Buffer.concat([header, png]));
console.log("wrote public/favicon.ico (32x32)");
