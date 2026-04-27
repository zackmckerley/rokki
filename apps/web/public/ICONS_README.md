# PWA assets — manual export required

The `manifest.webmanifest` and `app/layout.tsx` reference these PNG files.
They are **not yet committed** to the repo and must be exported from the
design source (Figma — wordmark + glyph board) before a production deploy.

Until the PNGs land, browsers will 404 on each icon URL — the install
chip still works, but the installed app icon falls back to a generic.

## Required files (place in `apps/web/public/`)

| File | Size | Purpose | Notes |
| --- | --- | --- | --- |
| `icon-192.png` | 192×192 | `any` | Standard PWA + Android home-screen + push-notification icon |
| `icon-192-maskable.png` | 192×192 | `maskable` | Safe zone within central 80% — the OS may crop edges |
| `icon-192-monochrome.png` | 192×192 | `monochrome` | Single-color silhouette for adaptive theming |
| `icon-512.png` | 512×512 | `any` | High-res for splash + app-store-style listings |
| `icon-512-maskable.png` | 512×512 | `maskable` | High-res maskable; same safe zone rule |
| `favicon.ico` | 32×32 + 16×16 | — | Browser tab |

## Required iOS splash screens (place in `apps/web/public/splash/`)

iOS Safari does not synthesize a splash from `background_color` —
each device size needs its own PNG. Use the design source's "splash"
artboard (background `#0A0B0D`, centered Rokki wordmark at 40% width).

| File | Size | Devices |
| --- | --- | --- |
| `apple-splash-2048-2732.png` | 2048×2732 | iPad Pro 12.9" |
| `apple-splash-1668-2388.png` | 1668×2388 | iPad Pro 11" |
| `apple-splash-1536-2048.png` | 1536×2048 | iPad 9.7"/10.2" |
| `apple-splash-1290-2796.png` | 1290×2796 | iPhone 15/16 Pro Max |
| `apple-splash-1179-2556.png` | 1179×2556 | iPhone 15/16 Pro |
| `apple-splash-1170-2532.png` | 1170×2532 | iPhone 12/13/14 |
| `apple-splash-1125-2436.png` | 1125×2436 | iPhone X/XS/11 Pro |
| `apple-splash-828-1792.png` | 828×1792 | iPhone XR/11 |
| `apple-splash-750-1334.png` | 750×1334 | iPhone 6/7/8/SE2 |

## Generation tip

`https://www.pwabuilder.com/imageGenerator` accepts a single 1024×1024
source PNG and outputs the full set above (icons + splash) zipped.
