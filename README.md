# mx11-labels

Label generator for filament swatches — prints on the **MX11 thermal label printer** over Bluetooth (Web Bluetooth).

A static, installable PWA hosted on GitHub Pages. Built with vanilla Web Components — no frameworks, no build step.

**Live app:** <https://akaguny.github.io/mx11-labels/>

> Print the swatches with this model on MakerWorld: [Filament Swatch with Test](https://makerworld.com/en/models/64888-filament-swatch-with-test#profileId-68134) — the 67 × 25 mm preset matches its label platform (Avery 5160 label size).

## Features

- **Label contents** — brand, type, color and an optional extra line (temperatures, article number, …).
- **QR code** — scans to a Google search for the filament name, so you can instantly find where to order more.
- **True-size preview** — on-screen calibration with a bank card (ISO/IEC 7810 ID-1) makes the preview exactly 1:1 with the printed label.
- **Presets tuned for the swatch** — 67 × 25 mm (Avery 5160 platform), 67 × 20 mm (shorter), 90 × 14 mm (long strip), 48 × 15 mm (across the tape); or set a custom size. Orientation auto / across / along, edge offset, copies, print darkness, cut border.
- **Batch printing** — paste lines like `Bambu Lab, ABS, White` (one label per line), and the whole series prints as a single job with a thin cut line between labels; runs of 10+ are split into batches with a tear feed in between.
- **Catalog & history** — everything you print is saved to localStorage; reprint any filament in one click.
- **Preflight checks & debug report** — verify readiness before printing; copy a debug report if something misbehaves.
- **i18n** — RU/EN with automatic browser-language detection.
- **Offline PWA** — service worker caching, installable on Android/desktop.

## Hardware & tape

- Printer: MX11 thermal label printer (Bluetooth LE, no phone app required).
- Tape: self-adhesive thermal tape **57 mm** wide; printable label width **48 mm** (384 dots @ 203.2 dpi), label length up to 200 mm.
- Alternatively, **Download PNG** gives a 384 px wide image for printing with the vendor's Fun Print app.

## Project structure

```
index.html          — entry point (assembles the components)
src/vendor/qrcode.js — QR generator (d-project, MIT)
src/core/protocol.js — MX11 protocol: frames, CRC-8, RLE, print jobs
src/core/label.js    — label rendering on canvas, tape layout, calibration
src/core/ble.js      — Web Bluetooth transport (characteristic priorities)
src/core/i18n.js     — RU/EN dictionary + language auto-detection
src/core/store.js    — localStorage: catalog, history, settings
src/components/*.js  — web components (UI)
```

## Development

No build step — plain static ES modules. For local development:

```bash
python3 -m http.server 8765   # then open http://localhost:8765
```

Web Bluetooth requires **HTTPS or localhost**. Supported in Chrome/Edge (Android, Windows, macOS, Linux); on iPhone/iPad use the Bluefy browser — plain Safari and Firefox don't support Web Bluetooth.

## Deploy

Push to `main` — GitHub Pages serves the repo as a static PWA (see `manifest.webmanifest` and `sw.js`).
