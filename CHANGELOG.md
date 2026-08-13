# Changelog

Notable changes to Faraday, release by release. Loosely follows [Keep a
Changelog](https://keepachangelog.com/en/1.0.0/); this project is pre-1.0, so expect breaking
changes between minor versions. See [`PROGRESS.md`](./PROGRESS.md) for the full session-by-session
development history behind each entry.

Each entry here corresponds to a `vX.Y.Z` git tag, which is what triggers
[`docker-release.yml`](./.github/workflows/docker-release.yml) to build and publish that version.

## [Unreleased]

## [0.1.0-beta.1] - 2026-08-13

First tagged release, and the first version published as a Docker image
(`ghcr.io/d3mocide/faraday`, `linux/amd64` + `linux/arm64`). Everything below has been in the app
for a while — this is the first time it's been cut into a release rather than developed straight
off `main`.

### Added

- **Parametric enclosure bodies**: box, cylinder, hexagon, octagon, stadium, and wedge shapes,
  with sharp/rounded/chamfered/faceted corner styles on box bodies.
- **Lid systems**: friction-lip, screw-boss (round/square/hex/octagon columns, interior or
  exterior placement, exposed or counterbored heads, heat-set or self-tap holes), and snap-fit,
  plus an optional gasket channel.
- **Multi-part enclosures**: any wall can be a slide-in panel (with a retention lip) instead of
  part of the fixed shell, on top of the base/lid split.
- **Feature library**: 25+ connector cutouts (USB, HDMI, Ethernet, SMA/BNC/antenna, audio, power),
  standoffs, board mounts, vents (slot/honeycomb), custom holes, D-shape holes, fan mounts (10
  standard sizes with ring/honeycomb/open grilles), external mounts (flange/boss, face or
  corner-anchored), and support pads.
- **15+ board presets**, including the Raspberry Pi 3B/4B/5 family (+ HAT stack), Pi Zero, Jetson
  Orin Nano, Waveshare CM4 Dual ETH WiFi6, RTL-SDR dongle, Heltec LoRa32, T-Beam, Seeed XIAO
  (RP2040/ESP32-C3/S3/C6/SAMD21), and an ESP32 Cheap Yellow Display case.
- **Direct manipulation**: drag-to-resize, click-to-place, drag-to-reposition with snapping,
  align/mirror tools, a 2D face blueprint editor, and a 3D digital caliper.
- **Export**: zipped STL export (one file per printed part) plus a hardware BOM CSV; save/load
  projects as JSON with localStorage autosave; undo/redo; mm/in unit toggle.
- **Self-hosted deployment**: single Docker container (Caddy serving a static Vite build), no
  backend, no accounts, no cloud sync.

### Known limitations

- No automated visual-regression suite — UI behavior is verified manually (dev server +
  Playwright) each session rather than in CI; the `verify` job in `docker-release.yml` only
  catches type/lint/unit-test regressions, not rendering or interaction bugs.
- Connector, screw, board-mount, and fan dimensions are starter values sourced from datasheets or
  vendor drawings where noted — verify against your actual hardware before printing.
