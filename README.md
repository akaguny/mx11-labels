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
- **QR key mode** — a second tab that prints any text (recovery key, seed phrase, …) as a QR code on the tape; see below.
- **Catalog & history** — everything you print is saved to localStorage; reprint any filament in one click.
- **Preflight checks & debug report** — verify readiness before printing; copy a debug report if something misbehaves.
- **i18n** — RU/EN with automatic browser-language detection.
- **Offline PWA** — service worker caching, installable on Android/desktop.

## QR key mode

Switch to the **QR key** tab to print a QR code that encodes an arbitrary string — a recovery key, a seed phrase, any text (UTF-8, Cyrillic and line breaks are fine, up to 2000 characters), with an optional caption (up to 60 characters).

- **Size** — the QR is a square with a side of 20–48 mm (presets 30 / 40 / 48 mm, default 40 mm), printed across the tape. Without a caption the label is exactly the QR square.
- **Caption** — printed rotated by 90° (reads bottom-to-top, like a book spine) in a vertical 6 mm strip to the left of the QR, with a 2 mm gap; the label height stays equal to the QR side, so no tape is wasted lengthwise. The font is 16→10 px, shrunk to fit the strip length, with `…` if it still does not fit. With a non-empty caption the QR side is capped at 40 mm (48 − 6 − 2) and the panel says so; the side field keeps your value and it is restored when the caption is cleared.
- **Auto-fit** — error-correction levels are tried in the order H → Q → M → L; the first one that gives a module of at least 3 dots (0.375 mm) wins. A 2-dot module is allowed with a yellow warning; if even that does not fit, printing is blocked and the app tells you the minimum side in mm (or that the text must be shortened). The panel shows `version · EC · module px · label size`.
- **Printing** — copies (1–5), density and the tear feed come from the common settings. After a **successful** print the data and caption fields are cleared automatically. *Download PNG* saves `qr-key.png`.
- **The key is not stored by the app and is not sent over the network.** It lives only in the page memory: nothing is written to localStorage/sessionStorage/IndexedDB, the URL, the catalog, the history or the debug report, no history event is emitted, and the QR is generated locally by the vendored `src/vendor/qrcode.js`. The only thing remembered about this mode is which tab was last open.

Check the fitting logic and the print-job framing without a browser or a printer:

```bash
node tools/qr-fit.mjs                          # self-test (exit code 0 = all checks passed)
node tools/qr-fit.mjs "some text" 40           # JSON fit for one string (text is not echoed)
```

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
src/core/qrkey.js    — QR key mode: EC/version auto-fit and canvas rendering
src/core/ble.js      — Web Bluetooth transport (characteristic priorities)
src/core/i18n.js     — RU/EN dictionary + language auto-detection
src/core/store.js    — localStorage: catalog, history, settings
src/components/*.js  — web components (UI)
tools/qr-fit.mjs     — node self-test for the QR key mode and the print-job framing
```

## Development

No build step — plain static ES modules. For local development:

```bash
python3 -m http.server 8765   # then open http://localhost:8765
```

Web Bluetooth requires **HTTPS or localhost**. Supported in Chrome/Edge (Android, Windows, macOS, Linux); on iPhone/iPad use the Bluefy browser — plain Safari and Firefox don't support Web Bluetooth.

## Deploy

Push to `main` — GitHub Pages serves the repo as a static PWA (see `manifest.webmanifest` and `sw.js`).
