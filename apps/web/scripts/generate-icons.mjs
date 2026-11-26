/**
 * One-off: cuts the icon artwork (icon-source.jpg) into the PNG sizes the manifest,
 * iOS and the browser tab need. Run `npm run icons` after replacing it, commit the output.
 *
 * The artwork is a rounded square drawn on a checkerboard, so it is cropped to the
 * square and its corners are filled with the square's own near-black.
 */
import { writeFileSync } from "node:fs";
import sharp from "sharp";

const SOURCE = "icon-source.jpg";
/** The square inside the 1024px artwork, a few pixels in from its edge. */
const CROP = { left: 126, top: 126, width: 772, height: 772 };
/** Corner radius of the square, taken a little large so no checkerboard is left. */
const RADIUS = 150;
const BG = "#060606";

const rounded = (size, radius) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}"/></svg>`,
  );

// The square with see-through corners, and the same on a full near-black square.
const cut = await sharp(SOURCE)
  .extract(CROP)
  .ensureAlpha()
  .composite([{ input: rounded(CROP.width, RADIUS), blend: "dest-in" }])
  .png()
  .toBuffer();
const full = await sharp({
  create: { width: CROP.width, height: CROP.height, channels: 4, background: BG },
})
  .composite([{ input: cut }])
  .png()
  .toBuffer();

const targets = [
  { size: 192, out: "public/icon-192.png" },
  { size: 512, out: "public/icon-512.png" },
  // iOS rounds the corners harder than the artwork does: keep the frame clear of them.
  { size: 180, out: "public/apple-touch-icon.png", inset: 0.04 },
  // Maskable: the artwork shrunk into the safe zone on a full-bleed background.
  { size: 192, out: "public/icon-maskable-192.png", inset: 0.14 },
  { size: 512, out: "public/icon-maskable-512.png", inset: 0.14 },
];

for (const { size, out, inset = 0 } of targets) {
  const inner = Math.round(size * (1 - 2 * inset));
  const art = await sharp(full).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: art }])
    .png()
    .toFile(out);
  console.log(`wrote ${out} (${size}x${size})`);
}

// The browser tab: rounded, see-through corners.
await sharp(cut).resize(96, 96).png().toFile("public/favicon.png");
console.log("wrote public/favicon.png (96x96)");

// favicon.ico for browsers that ask for it: one 32px PNG in an ICO wrapper.
const png = await sharp(cut).resize(32, 32).png().toBuffer();
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
