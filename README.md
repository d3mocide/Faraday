# Faraday

A browser-based, self-hosted parametric enclosure generator for electronics projects. Set overall
box dimensions, pick a lid system, and export print-ready STLs — no accounts, no backend, no
server-side rendering. All CSG geometry runs client-side via [manifold-3d](https://github.com/elalish/manifold)
(WASM) in a Web Worker.

This build currently covers:

- Live-editable box body (length/width/height, wall thickness, sharp/rounded/chamfered corners)
- Two-piece lid system: friction-lip and screw-boss (with heat-set or self-tap hole options)
- Connector/feature library: click a connector or standoff in the palette, then click a face to
  place a cutout or PCB-mounting standoff
- Direct manipulation: drag handles to resize the body, hover-highlighted faces, click-to-select a
  placed feature (with an editable rotation and, for standoffs, dimensions), drag-to-reposition
  with snapping to edges/center/other features
- Board presets (RTL-SDR dongle, Heltec V3, T-Beam, Pi Zero) as a starting point, save/load
  projects as JSON, localStorage autosave, mm/in units toggle, undo/redo
- Real-time 3D preview (Three.js) with debounced regeneration in a Web Worker
- Zipped STL export (`case_base.stl` + `case_lid.stl`) at full tessellation quality

Not yet implemented: vents, snap-fit lids, cylindrical bodies.

See [`DESIGN.md`](./DESIGN.md) for the full design doc and [`PROGRESS.md`](./PROGRESS.md) for
what's done, what's next, and notes for picking this work back up in a new session.

## Project layout

The app lives entirely under [`frontend/`](./frontend) (a static Vite/React SPA — see the design
doc for why there's no backend). `docker-compose.yml` at the repo root builds and serves it.

## Development

```bash
cd frontend
npm install
npm run dev
```

## Build

```bash
cd frontend
npm run build
```

## Docker

**Self-hosting (pulls the published image):**

```bash
docker compose up
```

Pulls `ghcr.io/d3mocide/faraday` (built for `linux/amd64` and `linux/arm64`) and serves it on
`http://localhost:8090`. Faraday is currently in beta — `docker-compose.yml` tracks the `beta` tag;
pin an exact version (e.g. `ghcr.io/d3mocide/faraday:0.1.0-beta.1`) for a reproducible deploy. See
[`CHANGELOG.md`](./CHANGELOG.md) for what's in each release.

**Local development (builds `./frontend` from source):**

```bash
docker compose -f docker-compose.dev.yml up --build
```
