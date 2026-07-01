# Faraday

A browser-based, self-hosted parametric enclosure generator for electronics projects. Set overall
box dimensions, pick a lid system, and export print-ready STLs — no accounts, no backend, no
server-side rendering. All CSG geometry runs client-side via [manifold-3d](https://github.com/elalish/manifold)
(WASM) in a Web Worker.

This build currently covers:

- Live-editable box body (length/width/height, wall thickness, sharp/rounded/chamfered corners)
- Two-piece lid system: friction-lip and screw-boss (with heat-set or self-tap hole options)
- Real-time 3D preview (Three.js) with debounced regeneration in a Web Worker
- Zipped STL export (`case_base.stl` + `case_lid.stl`) at full tessellation quality

Not yet implemented: connector/feature cutouts, direct-manipulation drag handles, board presets,
save/load projects, units toggle, snap-fit lids.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Docker

```bash
docker compose up --build
```

Serves the static build on `http://localhost:8090`.
