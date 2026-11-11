const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require(require.resolve('sharp', { paths: [path.dirname(require.resolve('next/package.json'))] }));
const root = path.resolve(__dirname, '../public');

async function validate() {
  for (const [file, width, height = width] of [
    ['favicon-16x16.png', 16], ['favicon-32x32.png', 32], ['favicon-48x48.png', 48],
    ['icon-light-32x32.png', 32], ['icon-dark-32x32.png', 32], ['apple-icon.png', 180],
    ['app-icon-192.png', 192], ['app-icon-512.png', 512], ['app-icon-maskable-512.png', 512],
    ['og-image.png', 1200, 630], ['brand/logo.png', 736, 192],
    ['brand/logo.svg', 368, 96], ['brand/logo-dark.svg', 368, 96],
  ]) {
    const metadata = await sharp(path.join(root, file)).metadata();
    assert.equal(metadata.width, width, file); assert.equal(metadata.height, height, file);
  }
  assert.equal(fs.readFileSync(path.join(root, 'icon.svg'), 'utf8'), fs.readFileSync(path.join(root, 'brand/mark.svg'), 'utf8'));
  const ico = fs.readFileSync(path.join(root, 'favicon.ico'));
  assert.equal(ico.readUInt16LE(0), 0); assert.equal(ico.readUInt16LE(2), 1); assert.equal(ico.readUInt16LE(4), 3);
  for (let i = 0; i < 3; i++) {
    const entry = 6 + i * 16;
    const size = [16, 32, 48][i];
    assert.equal(ico[entry], size); assert.equal(ico[entry + 1], size);
    const start = ico.readUInt32LE(entry + 12), length = ico.readUInt32LE(entry + 8);
    assert.ok(start + length <= ico.length);
    const image = await sharp(ico.subarray(start, start + length)).metadata();
    assert.equal(image.width, size); assert.equal(image.height, size);
  }
  for (const [file, size] of [['apple-icon.png', 180], ['app-icon-maskable-512.png', 512]]) {
    const pixels = await sharp(path.join(root, file)).ensureAlpha().raw().toBuffer();
    for (const index of [0, size - 1, size * (size - 1), size * size - 1]) assert.equal(pixels[index * 4 + 3], 255, `${file} must have opaque corners`);
    if (size === 512) {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        if (pixels[i] > 245 && pixels[i + 1] > 245 && pixels[i + 2] > 245) {
          assert.ok((x - size / 2) ** 2 + (y - size / 2) ** 2 <= (size * .4) ** 2, 'Maskable glyph outside safe circle');
        }
      }
    }
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'site.webmanifest'), 'utf8'));
  assert.equal(manifest.short_name, 'TSMeet'); assert.equal(manifest.start_url, '/');
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
  for (const icon of manifest.icons) {
    assert.match(icon.src, /^\/[a-z0-9-]+\.png$/);
    const image = await sharp(path.join(root, icon.src.slice(1))).metadata();
    assert.equal(icon.sizes, `${image.width}x${image.height}`);
  }
  console.log('TSMeet brand assets valid: SVG/PNG sizes, ICO frames, maskable safe area and manifest references.');
}
validate().catch((error) => { console.error(error); process.exitCode = 1; });
