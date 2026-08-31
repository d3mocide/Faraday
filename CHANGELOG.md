# Changelog

Notable changes to Faraday, release by release. Loosely follows [Keep a
Changelog](https://keepachangelog.com/en/1.0.0/); this project is pre-1.0, so expect breaking
changes between minor versions. See [`PROGRESS.md`](./PROGRESS.md) for the full session-by-session
development history behind each entry.

Each entry here corresponds to a `vX.Y.Z` git tag, which is what triggers
[`docker-release.yml`](./.github/workflows/docker-release.yml) to build and publish that version.

## [Unreleased]

## [0.1.0-beta.6] - 2026-08-31

Manufacturing-fidelity release: profile-aware print rules, derived board reinforcement, a
fastener-recipe library, two new lid closures, calibration/3MF exports, and a workspace UX pass —
plus a real geometry bug fix found while validating the new lid closure in-browser.

### Added

- **Manufacturing profiles** (Legacy FDM 0.4mm, Daily PLA, Daily PETG): `printRulesForProfile()`
  derives skin/web/rib/wall floors from each profile's line width and perimeter count. Imported
  projects with no profile resolve to the old Legacy FDM values byte-for-byte; new projects record
  a profile explicitly. The Printability card exposes a persistent profile selector, and panel
  clamps, BOM metrics, inspector limits, and advisory checks all read the active profile instead of
  a fixed global.
- **Auto reinforcement for board mounts** (`csg/mountPlan.ts`): an opt-in, derived
  `ResolvedBoardMountPlan` adds a short wall-tie rib from a PCB standoff to its nearest box cavity
  wall only when eligible, and a distributed support row (individual pads or a continuous rail)
  under a materially cantilevered board edge. Treats every connector/vent/custom-hole opening on a
  candidate wall as a keep-out and picks a different wall (or falls back to a floor post) rather
  than colliding with a port. Manual support-pad placement is untouched.
- **Fastener recipe library** (`fasteners/library.ts`): named M2/M2.5/M3/M4 heat-set and
  self-tapping recipes with legacy-equivalent bore/head/clearance dimensions and an explicit
  `calibrated: false` status. New lid inspector recipe selector; BOM now names the resolved recipe
  and flags it uncalibrated instead of implying a generic size is universally printable.
- **Lid surface treatments**: `refined` (centered recessed label field, profile- and
  screw-boss-clearance-aware) and `field-marked` (adds a shallow perimeter seam accent when the
  wall has the skin budget for it). Falls back to plain geometry with a Design Check explanation
  when the wall/fastener layout can't support it.
- **Two new lid closures**: Captive slide rail (box/stadium/wedge — a flat cover captured by
  external U-channel rails hooking under base flanges, closed-position stop on box/wedge) and
  Bayonet quarter-turn (cylinder-only — three lugs lower through shelf gaps, then turn beneath
  them).
- **Calibration pack export**: five printable, watertight coupons (fit tabs, fit slots,
  selected-fastener insert boss, port gauge, snap beam) plus a README recording the manufacturing
  profile and measurement protocol, as a separate download from the standard STL/BOM export.
- **Native 3MF export** alongside the STL/BOM ZIP, preserving every base/lid/panel as its own build
  item for slicers that read the format.
- **Reinforced port frame**: an opt-in, profile-derived exterior rim around connector/custom
  openings that adds local material without changing the functional cutout size.
- **History tab** in the inspector: jump to any past project state directly from a derived
  per-step summary (feature/body/lid/panel changes), alongside the existing Structure/Layers/Studio
  tabs.
- **Info tooltips** (`InfoTooltip.tsx`) replace the always-visible field-hint paragraphs that had
  accumulated across the inspector, connector palette, and board-preset cards.

### Changed

- **Board Presets picker** redesigned as a searchable quick-decision surface: cards lead with a
  derived summary (dimensions + mount pattern / I/O count) with the full original note available
  via tooltip, plus name/note search.
- **Design Checks** moved from the top of the Structure sidebar to a persistent, expandable
  bottom-center viewport alert rail.
- **Selected-feature editor** moved out of the persistent sidebar into a viewport-owned panel next
  to the 2D Blueprint/Caliper tools, freeing sidebar space while a feature is selected.
- **Printability card** restyled to single-column stat rows (was a cramped 3-column grid) and a
  missing-space text bug in its hint copy fixed.
- **Modal layering** corrected so dialogs (Presets, etc.) sit above every viewport control.
- Board-preset split heights (Wio-WM6180, CYD, Raspberry Pi family) now retain the active profile's
  minimum skin at the seam; dense BeagleBone I/O is modeled as a connected stepped opening instead
  of leaving unprintably thin webs between cutouts; the Waveshare CM4 panel thickness and intake
  vent placement now meet the strict profile budget.

### Fixed

- **Captive slide rail lid had an open gap between the base and cover.** `applySlideRailLid`
  builds the cover as a flat plate plus external rails and never used the box wall/roof the CSG
  split produced above the seam, while the base's own wall stopped at the seam — leaving the band
  between them open air everywhere except the two rail strips (visibly a floating disconnected
  plate with daylight all around it, at any seam position below the very top). The base now
  reclaims that band and keeps continuous wall material all the way up to the cover's underside.
- **Captive slide rail's split-height slider** now labels its two sides "Seam" / "Cover envelope"
  instead of the "Body / Lid = 100%" model the other three lid types use — the flat cover
  deliberately overlaps the base rather than partitioning the body height — and enforces a
  slide-specific minimum seam so the rail channel can never collapse into the floor.
- **`resolveRefinedLidField()` floating-point boundary bug**: a wall/profile combination landing
  exactly on the skin floor (e.g. `2 - 1.8` in JS) could be incorrectly rejected as not fitting.
- 3D Printability card's filament/volume/print-time stats no longer wrap their labels across
  multiple lines in the sidebar.

## [0.1.0-beta.5.1] - 2026-08-23

Snap-fit orientation & lid mating column fix:

### Fixed

- **Snap-fit tab orientation**: corrected coordinate rotation so cantilever tabs lie flat against the enclosure wall and barbs protrude outward into the wall pockets across all body shapes (box, cylinder, polygon).
- **Snap-fit lid roots**: snap tabs now include a solid backing root that extends upward from the parting line through hollow lid skirts into the ceiling, anchoring tabs solidly to the lid body.
- **Interior screw boss lid columns**: interior screw bosses now generate matching boss columns inside the lid from the split height to the ceiling, eliminating hollow air gaps and preventing lid flexing under screw clamping.
- **Collapse-to-rail icon button**: added zero padding and explicit SVG dimensions to the palette collapse button so the chevron icon renders correctly.

## [0.1.0-beta.5] - 2026-08-23

Fastener/mounting release, reverse-engineered from a real printed CYD (ESP32-2432S028) case shared
by a user: a proper cantilever snap-fit profile positioned the way a real design actually places
it, a self-supporting standoff base, and a new kickstand mount style.

### Added

- **Cantilever snap-fit barb profile**, replacing the sphere nub/pocket placeholder: a sloped ramp
  cams the tab inward on assembly and a sharp shoulder catches to resist pull-apart. Positioned as a
  multi-finger comb (`LidSpec.snap.fingerCount`, 1–3) next to a corner instead of centered on a
  wall — matching where a real design places it — with real gaps cut between fingers so it reads as
  a comb rather than separate hanging tabs. Applies across box/cylinder/hexagon/octagon/stadium/
  wedge bodies.
- **Snap comb is now independent of lid type** (`LidSpec.snap`, works like the existing gasket
  field): a corner comb can layer on top of `screw-boss` or `friction-lip` instead of only ever
  being the sole retention, matching the reference case's actual screws-plus-comb design. New
  "Corner snap comb" inspector checkbox.
- **Standoff base flare** (`StandoffSpec.gusset`): an optional conical collar at a standoff's root,
  printing without support and resisting snap-off at the base — the same self-supporting-flare
  technique external mount bosses already used.
- **Kickstand external-mount style** (`ExternalMountStyle: 'kickstand'`): a solid tapered wedge prop
  (never a knife-edge tip) for fold-out stands or feet, placeable on any face of any body shape.
- 6 new automated tests (286 → 292).

## [0.1.0-beta.4] - 2026-08-16

Print-quality release: the slide-in panel retaining lip measured 0.40 mm against a nominal 1.0 mm
and broke on the first real print of the Waveshare CM4 preset. This fixes that, and the same class
of thin-wall defect everywhere else it turned up — plus optional M2 screws for panels, centralized
printability rules, and design-check warnings for minimum material between openings.

### Fixed

- **Panel retaining lip no longer collapses at rounded/chamfered corners.** The channel end-slots
  are now intersected with the outer shell shrunk inward by `retainLip`, so the lip follows the
  corner geometry instead of running into it. On the preset that failed, the lip went from 0.40 mm
  to its full nominal 1.2 mm. Where a corner treatment is too large for any grip at all, the
  clipping produces no lip rather than a fragile one, and a `panels:corner-eats-lip` design-check
  finding says so.
- **Flange holes clamped to keep `MIN_SKIN` from the tab's tip, root, and sides.** The stock CM4
  wall tab left only 0.5 mm at the tip; it now gets 1.2 mm, and a slot longer than the tab no
  longer comes out as an open-ended fork.
- **Heat-set bores get 1.5 mm of relief** past the insert length, for the plastic the insert
  displaces during installation.
- **Eight board-preset port layouts corrected**: Waveshare CM4 Dual ETH WiFi6 (0.19 mm web between
  USB-A and RJ45), BeagleBone Black (overlapping Ethernet/Mini-USB cutouts), CM4 IO board
  (0.25 mm power/boot web), and five presets with a port sitting under 1.2 mm below the lid seam
  (Raspberry Pi 3B/4B/5 family, Pi HAT stack).

### Added

- **Optional M2 panel screws** (`PanelSpec.screw`, off by default). A vertical post in each
  interior corner behind the plate, bored for a self-tapping pilot or heat-set socket, with
  counterbored clearance holes through the plate. Independent of the retaining lip — a screwed
  connector panel comes off without removing the lid. Inspector controls, BOM rows, and
  printability checks wired.
- **Centralized print-rule constants** (`csg/printRules.ts`): `NOZZLE`, `MIN_SKIN`/`MIN_WEB`
  (1.2 mm — three perimeters at 0.4 mm nozzle), `MIN_RIB`, and `MIN_WALL` (0.8 mm), replacing
  scattered magic-number literals that never composed.
- **Design checks for minimum material** between cutouts and between a cutout and the edge of its
  printed part. Warn-only by design: machine-chosen dimensions (groove depths) are clamped
  silently, but user-placed port positions produce warnings rather than being moved.
- **Design-note document** (`docs/panel-retention.md`) recording the failure investigation,
  measurements, and the options considered before the fix shipped.
- 15 new automated tests (271 → 286): `test/panels.test.ts` (11 — lip probe across corner styles,
  all-or-nothing invariant, screw-post presence, clear screw axis through both pieces, screwed
  plate lift-out assembly) and `test/flangeHoles.test.ts` (4).

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
