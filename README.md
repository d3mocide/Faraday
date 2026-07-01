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
- Real-time 3D preview (Three.js) with debounced regeneration in a Web Worker
- Zipped STL export (`case_base.stl` + `case_lid.stl`) at full tessellation quality

Not yet implemented: vents, board presets, save/load projects, units toggle, snap-fit lids.

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

```bash
docker compose up --build
```

Serves the static build on `http://localhost:8090`.
