# Third-party notices

The BasketCompass web app ships no third-party source. It is dependency-free: the
runtime is plain ES modules with no bundled libraries. This file records the
external data sources it reads and the tools used only at build or release time,
for attribution.

## Data sources (read at runtime, not redistributed)

- **épiceries.ca** — documented public Quebec grocery price API, used by the live
  price adapter (`dist/Provider.js`). Search terms and product ids are sent to the
  provider; lists and postal code are not. Retailer names, product names, images,
  and marks shown in the app belong to their respective owners; no affiliation is
  implied. See https://epiceries.ca/developers.
- **Sales tax rates** — standard GST/HST and provincial rates in `dist/Engine.js`
  were verified 2026-10-03 against the Canada Revenue Agency and Revenu Québec rate
  tables. They are public reference figures, not third-party code.

## Build and release tooling (not bundled into the web app)

- **PyInstaller** — freezes the small Python launcher (`installer/Launcher.py`)
  into the desktop app. PyInstaller is GPL-2.0 with a bootloader exception that
  permits distributing frozen applications under any licence; only its runtime
  bootloader ships inside the built `.exe`, not its source. The frozen launcher
  serves the static `dist/` files on `127.0.0.1`.
- **Inno Setup** — wraps the frozen app into the downloadable Windows
  `Setup.exe`. Inno Setup is free software under its own permissive licence and is
  a build-time tool only.
- **Node.js test runner** (`node --test`) and **Pillow** (brand asset generation)
  are developer tools invoked locally and in CI, not shipped to users.

BasketCompass itself is released under the MIT License (see `LICENSE`). No
third-party source is copied into this repository.
