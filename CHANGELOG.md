# Changelog

Notable changes to Faraday, release by release. Loosely follows [Keep a
Changelog](https://keepachangelog.com/en/1.0.0/); this project is pre-1.0, so expect breaking
changes between minor versions. See [`PROGRESS.md`](./PROGRESS.md) for the full session-by-session
development history behind each entry.

Each entry here corresponds to a `vX.Y.Z` git tag, which is what triggers
[`docker-release.yml`](./.github/workflows/docker-release.yml) to build and publish that version.

## [Unreleased]

## [0.1.0-beta.3] - 2026-08-15

Bug-fix release: the hexagon/octagon/stadium/wedge body shapes (added in beta.2) had broken lid
fasteners and, for hexagon/octagon, no working resize handles. Both are fixed here, along with a
cluster of related parity gaps the investigation surfaced.

### Fixed

- **Lid fasteners on hexagon/octagon/stadium/wedge bodies no longer collapse into a single column
  at the body center.** Screw-boss, friction-lip, and snap-fit lids now place real, correctly
  positioned bosses/skirts/tabs on all four shapes, matching box and cylinder.
- **Hexagon and octagon bodies are now resizable by their drag handles** (previously silently did
  nothing). Wedge gained independent front/back height handles in place of a single handle that
  wrote to a field the wedge doesn't have; stadium's corner handles now sit on the model surface
  instead of floating past the rounded ends.
- **Hexagon/octagon/stadium/wedge projects no longer get silently discarded on page reload or file
  Load.** Project validation only recognized box and cylinder bodies, so restoring an autosaved (or
  loading a saved) project in any of the other four shapes quietly fell back to a default box.
- External mounts (flanges/bosses) and fan-mount bosses placed on a hexagon/octagon facet or a
  wedge's slanted top now point outward correctly instead of using the box front/back orientation.
- The per-feature Face dropdown, the 2D Blueprint Editor's face tabs, and interior-click handling
  (lid hidden/ghosted) now work correctly across all six body shapes instead of only offering box's
  six faces.
- Corner-style controls (sharp/rounded/chamfered/faceted/double-chamfer) are now available for
  wedge bodies, and edge-bevel rim chamfers now apply correctly to hexagon, octagon, and stadium
  bodies (previously box- and cylinder-only).

### Added

- 134 new automated tests (137 → 271) covering fastener geometry, project validation, and face
  placement across all six body shapes.

## [0.1.0-beta.2] - 2026-08-14

Second beta release, focusing on complete UI/UX modernization, workspace ergonomics, visual brand identity, and editing workflows.

### Added

- **Collapsible Feature Activity Rail**: Left sidebar now collapses into a slim 54px vertical icon rail (default on load) with 13 categorized vector icons and 1-click filter-and-expand interaction.
- **Brand Identity & Vector Logo**: Added a 3D isometric enclosure Faraday logo with electromagnetic flux node to the top bar and browser favicon (`favicon.svg`), paired with stylized typography.
- **Top Bar Ergonomics**: Centered viewport options and segmented view mode chips (`Assembled | Ghost | Hidden | Exploded`) with dedicated keyboard shortcuts (`1`-`4`, `O`, `G`, `H`), 1-click segmented unit toggle (`mm | in`), and Figma-style inline project rename.
- **Floating Viewport Regeneration Pill**: Relocated CSG background worker status to a floating glassmorphic indicator in the 3D viewport next to Blueprint & Caliper tools, eliminating all top bar layout jitter.
- **Enhanced 2D Blueprint & Inspector Drawer Controls**: Added canvas background click-to-deselect, `Escape` key deselect/close handlers, live Lock/Unlock toggles with visual badges, and compact `✕` close actions replacing overflowing text buttons.
- **Studio Tessellation Segmented Bar**: Replaced grid buttons with an intuitive 4-segment pill bar for mesh quality (`Draft 20`, `Standard 32`, `High 64`, `Ultra 128`).
- **Dynamic Build Version & GitHub Link**: Added sidebar footer with live compile-time injected version badge and direct link to the Faraday repository.

### Changed

- Replaced all legacy unicode emoji icons throughout the entire codebase with crisp, scalable vector SVGs.
- Standardized rail category icons at 20px × 20px with 2px stroke width.

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
