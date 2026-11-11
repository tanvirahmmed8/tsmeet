// Original vector identity, exported using Next's existing Sharp dependency.
// Run from the repository root: node scripts/generate-brand-assets.cjs
const fs = require('node:fs');
const path = require('node:path');
const sharp = require(require.resolve('sharp', { paths: [path.dirname(require.resolve('next/package.json'))] }));
const root = path.resolve(__dirname, '../public');
const mark = fs.readFileSync(path.join(root, 'brand/mark.svg'), 'utf8');
const embeddedMark = (x, y, size) => mark.replace('<svg ', `<svg x="${x}" y="${y}" `).replace('width="128" height="128"', `width="${size}" height="${size}"`);
const wordmark = (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="368" height="96" viewBox="0 0 368 96">${embeddedMark(0, 0, 96)}<text x="116" y="66" font-family="Arial, Helvetica, sans-serif" font-size="58" font-weight="700" letter-spacing="-2" fill="${color}">TS<tspan fill="#00998b">Meet</tspan></text></svg>`;
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
 <defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#081923"/><stop offset="1" stop-color="#103e43"/></linearGradient></defs>
 <rect width="1200" height="630" fill="url(#bg)"/>
 <circle cx="1120" cy="100" r="280" fill="none" stroke="#73d7c6" stroke-opacity=".08" stroke-width="70"/>
 <circle cx="1100" cy="600" r="220" fill="none" stroke="#73d7c6" stroke-opacity=".08" stroke-width="2"/>
 ${embeddedMark(80, 78, 90)}
 <text x="192" y="141" fill="#fff" font-family="Arial, Helvetica, sans-serif" font-size="54" font-weight="700" letter-spacing="-2">TS<tspan fill="#65e6cc">Meet</tspan></text>
 <text x="80" y="302" fill="#fff" font-family="Arial, Helvetica, sans-serif" font-size="76" font-weight="700" letter-spacing="-3">Meet. Share. Connect.</text>
 <text x="84" y="369" fill="#bbd5d9" font-family="Arial, Helvetica, sans-serif" font-size="28">Your conversations. Your infrastructure.</text>
 <rect x="80" y="460" width="470" height="56" rx="28" fill="#173e43" stroke="#418579" stroke-opacity=".6"/>
 <text x="107" y="495" fill="#aff2dd" font-family="Arial, Helvetica, sans-serif" font-size="20">VIDEO MEETINGS  /  SELF-HOSTED</text>
</svg>`;

async function generate() {
  for (const [file, size] of [
    ['favicon-16x16.png', 16], ['favicon-32x32.png', 32], ['favicon-48x48.png', 48],
    ['icon-light-32x32.png', 32], ['icon-dark-32x32.png', 32],
    ['apple-icon.png', 180], ['app-icon-192.png', 192], ['app-icon-512.png', 512],
  ]) {
    await sharp(Buffer.from(mark)).resize(size, size).png().toFile(path.join(root, file));
  }
  // Full-bleed backgrounds: platform launchers, not the SVG, apply the mask.
  const fullBleed = mark.replace('rx="30"', 'rx="0"');
  await sharp(Buffer.from(fullBleed)).resize(180, 180).png().toFile(path.join(root, 'apple-icon.png'));
  await sharp(Buffer.from(fullBleed)).resize(512, 512).png().toFile(path.join(root, 'app-icon-maskable-512.png'));
  fs.writeFileSync(path.join(root, 'icon.svg'), mark);
  fs.writeFileSync(path.join(root, 'brand/logo.svg'), wordmark('#102b33'));
  fs.writeFileSync(path.join(root, 'brand/logo-dark.svg'), wordmark('#f2fbf9'));
  await sharp(Buffer.from(wordmark('#102b33'))).resize(736, 192).png().toFile(path.join(root, 'brand/logo.png'));
  await sharp(Buffer.from(og)).png().toFile(path.join(root, 'og-image.png'));

  // Standard multi-image ICO directory, with lossless embedded PNG entries.
  const sizes = [16, 32, 48];
  const pngs = await Promise.all(sizes.map((size) => sharp(Buffer.from(mark)).resize(size, size).png().toBuffer()));
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, index) => {
    const position = 6 + index * 16;
    header[position] = size; header[position + 1] = size;
    header.writeUInt16LE(1, position + 4); header.writeUInt16LE(32, position + 6);
    header.writeUInt32LE(pngs[index].length, position + 8); header.writeUInt32LE(offset, position + 12);
    offset += pngs[index].length;
  });
  fs.writeFileSync(path.join(root, 'favicon.ico'), Buffer.concat([header, ...pngs]));
  console.log('Generated TSMeet logo, favicons, Apple/app/maskable icons and 1200x630 social image.');
}
generate().catch((error) => { console.error(error); process.exitCode = 1; });
