# TSMeet brand assets

Original vector identity: a video camera, conversation bubble and negative-space
T in a teal rounded tile. The sources and generated project assets are included
under the repository [license](../../LICENSE.md); no stock logo or external font
service is used. Wordmark SVGs use local Arial/Helvetica/sans-serif fallbacks.

Preview: `/brand/preview.html` (also opens directly from this folder).

| Asset | Use |
|---|---|
| `mark.svg` | Editable master / shared UI mark |
| `logo.svg`, `logo-dark.svg`, `logo.png` | Light/dark wordmarks and transparent PNG export |
| `../icon.svg`, `../favicon.ico`, `../favicon-*.png` | Browser tabs, including 16/32/48 sizes |
| `../apple-icon.png` | Opaque 180px Apple touch icon |
| `../app-icon-192.png`, `../app-icon-512.png` | App shortcuts / manifest icons |
| `../app-icon-maskable-512.png` | Full-bleed launcher icon with safe-area artwork |
| `../og-image.png` | 1200x630 social-link image |
| `../site.webmanifest` | Standalone shortcut metadata, not an offline app implementation |

Regenerate from the repo root using the Sharp renderer already installed with Next:

```bash
node scripts/generate-brand-assets.cjs
node scripts/validate-brand-assets.cjs
```

Generated PNG/ICO/SVG exports are checked in manually; deployment does not need
to regenerate them. Edit `mark.svg` and the generator's wordmark/share composition,
then regenerate and visually inspect. Font rasterization can differ by OS.
Keep favicon revision queries in `app/layout.tsx` current when replacing icons.
Legacy light/dark 32px filenames are intentionally re-exported to avoid leaving
old placeholder branding at those URLs. The runtime UI uses `BrandLogo`.
