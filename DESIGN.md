# Faraday — Parametric Radio Enclosure Generator
### Design Doc v1.0
*Working title "Faraday" — rename freely. This doc is written to be handed directly to a coding agent (e.g. Claude Code) for implementation.*
---
## 1. Overview & Goals
A browser-based, self-hosted tool that generates 3D-printable electronics enclosures. Primary user is a technical hobbyist (RF/radio projects: RTL-SDR dongles, Meshtastic/LoRa nodes, custom PCBs) but the interaction model must be simple enough for a non-technical user to pick up in under a minute — direct-manipulation 3D editing plus numeric inputs, not a scripting language.
**Core loop:** set overall box dimensions → drop connector/mounting cutouts onto faces → watch it update live in 3D → export STL(s).
**Explicit non-goals for v1:**
- No auth / accounts / multi-user (single-user tool, access controlled at the reverse-proxy layer if needed)
- No freeform sculpting or general-purpose CAD (this is not Fusion 360)
- No cloud sync — projects are local files + browser storage
- No server-side rendering or generation — everything runs client-side in-browser
---
## 2. UX Design Philosophy — Tinkercad, translated
Tinkercad's usability comes from a few specific patterns. This app borrows them directly:
| Tinkercad pattern | Faraday equivalent |
|---|---|
| Shape shelf you drag onto the workplane | Feature palette (connector cutouts, standoffs, vents) dragged onto a face |
| Numeric fields appear when a shape is selected | Inspector panel shows editable fields for whatever is selected (body or feature) |
| Drag handles on the shape for interactive resize | Drag handles on box corners/edges; drag handles on placed features to reposition within their face |
| Grid snapping | Snap-to-edge, snap-to-center, snap-to-other-feature while dragging |
| Solid vs. Hole toggle + Group | Not needed — each feature already knows whether it's a cutout (subtract) or a boss (union), so there's no manual boolean step for the user |
The key simplification versus Tinkercad: because this tool is purpose-built for enclosures (not general shapes), we can pre-encode correct behavior into each feature type instead of exposing raw CSG operations to the user.
---
## 3. Primary User Flow
1. **Start:** blank project, or pick a board preset (RTL-SDR dongle, Heltec V3, T-Beam, etc.) which pre-fills dimensions and drops in the right standoff pattern.
2. **Set body:** length/width/height, wall thickness, corner style, lid type — via numeric fields or by dragging corner handles on the live 3D box.
3. **Add features:** drag a connector (SMA, USB-C, vent, standoff...) from the palette onto a face of the box. It snaps into place; drag to fine-position; numeric fields in the inspector for precise offsets.
4. **Preview:** live 3D view updates in real time (low-resolution regen while dragging, for responsiveness).
5. **Export:** click Export → high-resolution regen → downloads `case_base.stl` + `case_lid.stl` (zipped).
No login, no save-to-server step required — project state autosaves locally, and can be exported/imported as a `.json` project file for backup or sharing.
---
## 4. Architecture
**Fully static single-page app. No backend, no database, no auth.** This is the main lever for "minimum container usage" — since manifold-3d runs as WASM in the browser, there is no server-side computation to host at all. The only container is a static file server.
```
Browser
├── React UI (body/feature editing, inspector, palette)
├── Three.js viewport (render, orbit controls, drag handles, raycasting for feature placement)
├── Web Worker
│   └── manifold-3d (WASM) — all CSG boolean ops happen here, off the main thread
├── State store (Zustand) — single EnclosureProject object, single source of truth
└── Local persistence — localStorage autosave + explicit JSON export/import
```
**Why manifold-3d:** guaranteed-manifold boolean output (directly solves the "watertight STL" requirement), OpenSCAD-inspired API, fast enough for live interaction, small-ish WASM payload. Tradeoff: no native fillets — only chamfers via subtracting an angled wedge — which is actually the right call for FDM printing anyway (fillets need supports; chamfers don't).
**Why a Web Worker:** boolean CSG on a moderately complex part is not free — running it on the main thread would stutter the UI/render loop during drags. All geometry regeneration is dispatched to the worker; the worker returns a mesh (vertex/index arrays) that gets converted to a `THREE.BufferGeometry` for display.
**Known Manifold gotchas to build around (from their docs):**
- Rotation API takes **degrees**, not radians.
- Floating-point drift can prevent unions from closing. Fix: scale coordinates to integers internally (e.g. ×1000) for all Manifold operations, convert back to real mm on export.
- Manifold's own file I/O is limited and their docs recommend against using it for STL directly — pull raw mesh arrays and export via three.js's `STLExporter` instead.
---
## 5. Data Model
All internal geometry is canonical millimeters. Units toggle (mm/in) is a **display-only** conversion layer — never store inches.
```typescript
type Face = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right';
interface EnclosureProject {
  id: string;
  name: string;
  units: 'mm' | 'in';        // display preference only
  createdAt: string;
  updatedAt: string;
  body: EnclosureBody;
  features: Feature[];
}
interface EnclosureBody {
  shape: 'box';                // extensible — see Section 9
  outer: { length: number; width: number; height: number }; // mm
  wallThickness: number;       // mm
  cornerStyle: {
    type: 'sharp' | 'rounded' | 'chamfered';
    radius: number;            // mm, ignored if 'sharp'
  };
  lid: LidSpec;
}
interface LidSpec {
  type: 'friction-lip' | 'screw-boss' | 'snap-fit';
  splitHeight: number;          // mm from base where the lid separates
  wallGap: number;               // mm clearance for the fit (tune per printer)
  screw?: {                      // only for 'screw-boss'
    size: 'M2' | 'M2.5' | 'M3';
    insertType: 'heat-set' | 'self-tap';
    count: 4 | 6 | 8;
  };
}
interface Feature {
  id: string;
  type: 'connector-cutout' | 'standoff' | 'vent' | 'custom-hole';
  face: Face;
  u: number;                     // 0–1 normalized position across the face
  v: number;                     // 0–1 normalized position across the face
  rotationDeg: number;           // rotation about the face normal
  connectorId?: string;          // ref into ConnectorLibraryEntry, for 'connector-cutout'
  standoff?: StandoffSpec;
  vent?: VentSpec;
  custom?: { shape: 'circle' | 'rect'; width: number; height?: number };
}
interface StandoffSpec {
  outerDiameter: number;         // mm
  screwHoleDiameter: number;     // mm
  height: number;                // mm
}
interface VentSpec {
  pattern: 'slots' | 'honeycomb';
  areaWidth: number;
  areaHeight: number;
  slotWidth: number;
  slotSpacing: number;
}
interface ConnectorLibraryEntry {
  id: string;
  label: string;
  category: 'rf' | 'usb' | 'power' | 'antenna' | 'misc';
  holeShape: 'circle' | 'rect' | 'dshape';
  diameter?: number;
  width?: number;
  height?: number;
  cornerRadius?: number;
  notes?: string;
}
```
---
## 6. Connector Library — v1 Starter Set
These are **typical/starting values pulled from connector datasheets and panel-mount references, not guaranteed specs for any specific part.** Treat them as editable defaults — verify against your actual hardware with calipers before your first real print. Tolerances also depend on your printer's calibration (holes usually print slightly undersized).
| id | Label | Shape | Starter dimensions | Notes |
|---|---|---|---|---|
| `sma-bulkhead-female` | SMA Bulkhead (F) | circle | Ø6.5 mm | Consistent across multiple connector manufacturer references (6.3–6.6 mm range); tightest-consensus value in the library |
| `bnc-bulkhead` | BNC Bulkhead | circle | Ø9.6 mm (approx.) | BNC hole size varies more by style than SMA — verify against your specific part |
| `usb-c-panel` | USB-C Port Cutout | rect | 9.0 × 3.5 mm, r0.8 | Port opening only; widen if the connector's shell needs clearance |
| `usb-a-panel` | USB-A Port Cutout | rect | 13.0 × 6.5 mm, r1.0 | Approximate, verify against your specific connector |
| `dc-barrel-5.5x2.1` | DC Barrel Jack (5.5×2.1mm) | circle | Ø8.0 mm | Common panel-mount barrel jack |
| `antenna-passthrough` | Antenna Pass-Through Grommet | circle | user-configurable | No universal standard, no sane default — always prompt for size |
Implementation note: this is just a typed array (`connectors/library.ts`) — trivial to extend. Consider a "custom" entry type from day one so users aren't blocked waiting on the library to catch up with a connector we haven't added.
---
## 7. CSG Generation Pipeline (runs in the Web Worker)
```
function generateEnclosure(project): { base: Manifold, lid: Manifold }
1. Build outer shell
   outerShape = roundedOrChamferedBox(body.outer, body.cornerStyle)
2. Hollow it out
   innerShape = roundedOrChamferedBox(
     shrink(body.outer, wallThickness),
     shrunkCornerStyle
   ).translateZ(wallThickness)   // leaves floor thickness intact
   hollowShell = outerShape.subtract(innerShape)
3. Split into base + lid at body.lid.splitHeight
   (base, lidRaw) = splitAtHeight(hollowShell, splitHeight)
4. Apply lid mating geometry per lid.type
   - friction-lip: lid gets an inset skirt that friction-fits inside the base wall,
     sized by wallGap
   - screw-boss: corner bosses on the base with pilot holes, matching clearance
     holes in the lid
   - snap-fit: cantilever tabs on the lid, matching catches on the base (v2+)
5. Apply per-face features
   for each feature in project.features:
     target = (feature is on the lid half of the split ? lid : base)
     primitive = buildFeaturePrimitive(feature, body)   // positioned + rotated
     target = isSubtractive(feature)
       ? target.subtract(primitive)
       : target.union(primitive)     // standoffs, bosses
return { base, lid }
```
Two resolution modes: **live** (coarse tessellation on curves, fast — used while dragging) and **export** (full tessellation — used only when the user clicks Export). This keeps drag interactions responsive without sacrificing print quality on the final file.
**Mesh → viewport / STL:**
```typescript
function manifoldToBufferGeometry(m: Manifold): THREE.BufferGeometry {
  const mesh = m.getMesh(); // vertProperties (positions) + triVerts (indices)
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(mesh.vertProperties, 3));
  geo.setIndex(new THREE.BufferAttribute(mesh.triVerts, 1));
  geo.computeVertexNormals();
  return geo;
}
// Export via three/examples/jsm/exporters/STLExporter — verify exact Manifold
// mesh field names against the installed package version during implementation.
```
---
## 8. UI Components
- **`AppShell`** — top bar: project name, units toggle, Export button, Save/Load (JSON) buttons
- **`Viewport3D`** — Three.js canvas, OrbitControls, corner drag-handles for body resize, face-hover highlighting, click-to-place / drag-to-reposition for features, raycasting to resolve which face was clicked
- **`FeaturePalette`** — left sidebar, connector/feature library grouped by category, drag source
- **`InspectorPanel`** — right sidebar; body properties when nothing's selected, feature properties when a feature is selected
- **`BoardPresetPicker`** — modal for starting from a known board template
- **`ExportModal`** — triggers high-res regen, shows progress, downloads zipped STLs
**State:** single Zustand store holding `EnclosureProject`, with actions (`setBodyDimension`, `addFeature`, `updateFeature`, `removeFeature`, `setLidType`, ...). Any change to the store triggers a debounced (~150ms) dispatch to the worker for regeneration — this is the only place the CSG pipeline gets invoked from.
---
## 9. Extensibility (why v1 scope doesn't box you in)
`EnclosureBody.shape` is typed as `'box'` but designed as a discriminated union from day one, even though only `'box'` ships in v1. This means a future cylindrical body (for mast/antenna-mount projects) or a polygonal-footprint body is an additive change to `generateEnclosure()`, not a rewrite. Same idea for `Feature.type` — the palette and inspector are already data-driven off the library, so adding a new feature type is a new entry, not new UI plumbing.
---
## 10. Persistence
No backend, no database — deliberately, per the "skip the auth chain" instruction and the minimal-container goal:
- **Autosave:** current project JSON to `localStorage` on every change (debounced), so a refresh doesn't lose work.
- **Real persistence:** explicit "Save Project" downloads a `.json` file; "Load Project" imports one. This is the actual backup/share mechanism — treat localStorage as a convenience cache, not the source of truth.
- **Board presets:** bundled as static JSON in the app itself (`presets/boards.ts`), not user data.
---
## 11. Deployment — single container
```dockerfile
# Build stage
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
# Serve stage — static files only
FROM caddy:2-alpine
COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
```
```
# Caddyfile
:80 {
  root * /srv
  file_server
  try_files {path} /index.html
}
```
```yaml
# docker-compose.yml — one service, no volumes, no env vars needed
services:
  faraday:
    build: .
    ports:
      - "8090:80"
    restart: unless-stopped
```
That's the entire deployment footprint: one image, one service, no database, no auth middleware, no session store.
---
## 12. Project Structure
```
faraday/
├── Dockerfile
├── Caddyfile
├── docker-compose.yml
├── package.json
├── vite.config.ts
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── state/
    │   └── projectStore.ts
    ├── types/
    │   └── project.ts
    ├── csg/
    │   ├── worker.ts
    │   ├── generateEnclosure.ts
    │   ├── primitives.ts
    │   └── manifoldToGeometry.ts
    ├── connectors/
    │   └── library.ts
    ├── presets/
    │   └── boards.ts
    ├── components/
    │   ├── AppShell.tsx
    │   ├── Viewport3D.tsx
    │   ├── FeaturePalette.tsx
    │   ├── InspectorPanel.tsx
    │   ├── BoardPresetPicker.tsx
    │   └── ExportModal.tsx
    └── export/
        └── stlExport.ts
```
---
## 13. Phased Implementation Plan
**Phase 0 — Scaffold & static box**
- [ ] Vite + React + TS scaffold
- [ ] Three.js viewport, orbit controls, basic lighting
- [ ] manifold-3d wired up inside a Web Worker; round-trip a plain cube to prove the pipeline
- [ ] Dimension inputs (L/W/H, wall thickness) update the box live
- [ ] STL export of a plain hollow box, end to end, opens cleanly in a slicer
**Phase 1 — Lid system**
- [ ] Split shell at configurable height into base + lid
- [ ] Friction-lip lid (simplest, no hardware)
- [ ] Screw-boss lid (corner bosses + clearance holes, configurable screw size)
- [ ] Export both `case_base.stl` and `case_lid.stl`, zipped
**Phase 2 — Connector/feature library**
- [ ] `ConnectorLibraryEntry` data + starter set (Section 6)
- [ ] Feature palette UI, click-to-place on a face
- [ ] Cutout generation (subtract) wired into the pipeline
- [ ] Standoff/boss feature type (union) for PCB mounting
**Phase 3 — Direct manipulation**
- [ ] Drag handles on box corners for resize, synced bidirectionally with numeric inputs
- [ ] Drag-to-reposition features on their face, with snapping (edges, center lines, other features)
- [ ] Face highlighting on hover, click-to-select shows the inspector
**Phase 4 — Presets, persistence, polish**
- [ ] Board presets (RTL-SDR dongle, Heltec V3, T-Beam, Pi Zero) as bundled JSON
- [ ] Save/load project as downloadable/importable JSON
- [ ] Autosave to localStorage
- [ ] Units toggle (mm/in), display-only
- [ ] Undo/redo (simple state history stack)
**Phase 5 — Stretch**
- [ ] Cylindrical body shape (mast/antenna-mount enclosures)
- [ ] Snap-fit lid type
- [ ] Gasket channel / seal groove option
- [ ] BOM/screw list export alongside the STLs
---
## 14. Decisions Flagged for Review
Consequential calls made in this doc — worth confirming before handing off, since they're the ones that would be expensive to reverse later:
1. **manifold-3d over replicad/OpenCascade.** Chosen for speed and guaranteed-watertight output. Cost: no native fillets (chamfers only) — arguably the right tradeoff for FDM printing, but flagging it as a real capability cut, not an oversight.
2. **Fully static, no backend, ever (for v1+stretch).** If you later want cross-device sync or a shared preset library, that's a deliberate new scope addition (small sync endpoint), not something the current architecture blocks — but it's not planned for now.
3. **Two-piece box is the only v1 body topology.** Covers the large majority of project-box use cases. Non-box shapes are deferred but not architecturally blocked (Section 9).
4. **Canonical units are mm, integer-scaled internally** to sidestep Manifold's documented floating-point boolean failures, converted back to real mm only at export/display time.
5. **Connector library defaults are unverified starting points**, not guaranteed specs — flagged explicitly in Section 6 rather than presented as authoritative.
6. **Persistence is local-only** (autosave + JSON export/import), no accounts — directly matches "skip the auth chain."
