# Faraday — Progress Tracker

Living status doc for picking this project back up in a new session (human or agent). The
original spec is [`DESIGN.md`](./DESIGN.md) — read that first for *what* and *why*; this doc
tracks *how far we've gotten* and *what's different from the spec in practice*.

## Status at a glance

| Phase (DESIGN.md §13) | Status |
|---|---|
| Phase 0 — Scaffold & static box | ✅ Done |
| Phase 1 — Lid system | ✅ Done |
| Phase 2 — Connector/feature library | ✅ Done |
| Phase 3 — Direct manipulation | ✅ Done |
| Phase 4 — Presets, persistence, polish | ✅ Done |
| Phase 5 — Stretch | ✅ Done |

PR #1 (Phase 0+1 scaffold) and PR #2 (AGENTS.md/CLAUDE.md + Phases 2-4) are merged. Phase 5 is on
its own PR (see session log below).

## Repo layout

The app lives under [`frontend/`](./frontend) (plain Vite/React SPA, no backend — see
DESIGN.md §4). Root holds only planning docs and deployment orchestration:

```
/
├── DESIGN.md          the original design doc, verbatim
├── PROGRESS.md         this file
├── AGENTS.md            repo structure / coding / workflow rules for any agent (or human)
├── CLAUDE.md             thin pointer to AGENTS.md
├── README.md            quick-start
├── CHANGELOG.md          per-release notes; source for GitHub Release bodies
├── docker-compose.yml   pulls the published image from GHCR, serves on :8090 (self-hosting)
├── docker-compose.dev.yml  builds ./frontend from source (local dev / testing Dockerfile changes)
├── .github/workflows/    docker-release.yml — tag-gated multi-arch build + GHCR publish + release
└── frontend/
    ├── Dockerfile, Caddyfile   (build/serve config, scoped to the frontend build context)
    ├── package.json, vite.config.ts, tsconfig*.json, .oxlintrc.json
    ├── public/
    └── src/               matches DESIGN.md §12 (state/, types/, csg/, components/, export/),
                            plus connectors/ (Phase 2) and presets/ (Phase 4, see below)
```

This `frontend/` split is **not** in DESIGN.md §12 (which shows everything flat at repo root) —
it was introduced after Phase 0+1 landed to keep the root free for docs like this one. If you add
a backend or other top-level concern later, it's a sibling of `frontend/`, not inside it.

## Phase 0 + 1 implementation notes

- CSG pipeline (`frontend/src/csg/generateEnclosure.ts` + `primitives.ts`) matches DESIGN.md §7
  step-for-step: outer shell → hollow → split at `lid.splitHeight` → lid mating geometry.
- `friction-lip` and `screw-boss` lid types are implemented; `snap-fit` is typed but falls back to
  a plain split shell (Phase 5 stretch goal, per DESIGN.md §13).
- Screw hole diameters (`frontend/src/csg/screwLibrary.ts`) are starter/approximate values, same
  "verify before printing" disclaimer as the connector library in DESIGN.md §6.
- Export STL flips the lid 180° so its open/mating face prints up without support (not specified
  in DESIGN.md — a print-friendliness addition). See `orientLidForPrint` in `generateEnclosure.ts`.
- Verified end-to-end with Playwright: live viewport updates on every body/lid control, and the
  exported ZIP contains two watertight binary STLs (checked by confirming every mesh edge is
  shared by exactly two triangles).

### Deviation from DESIGN.md: no ×1000 integer coordinate scaling

DESIGN.md §4/§14 calls for scaling coordinates to integers internally to sidestep Manifold's
floating-point boolean issues. This was deliberately **not** implemented: manifold-3d's boolean
kernel is exact/robust regardless of input scale, and its output mesh is float32 either way, so at
project-box dimensions (tens of mm) the scaling has no measurable effect while adding real bug
surface (every literal constant in the boss/skirt geometry would need to carry the scale factor
too). If real-world testing surfaces precision issues, `Manifold.setTolerance()` is the more
targeted, documented escape hatch — reach for that before revisiting this.

## Phase 2 implementation notes

- `frontend/src/connectors/library.ts` has the DESIGN.md §6 starter set (6 entries: SMA, BNC,
  USB-C, USB-A, DC barrel, antenna passthrough).
- `frontend/src/csg/faceFrame.ts` defines the box's face/axis convention (length=X, width=Y,
  height=Z) and the `(u,v) ↔ world xyz` mapping used by both the CSG pipeline (worker-side) and
  `Viewport3D`'s raycasting (main-thread side). It's deliberately framework-agnostic (no `three`
  or `manifold-3d` imports) so both sides share one source of truth for face geometry instead of
  two hand-derived copies that could drift.
- **Click-to-place, not drag-and-drop.** Clicking a palette entry "arms" it; clicking the model
  raycasts against the actual rendered mesh (not proxy planes), reads the hit triangle's normal to
  resolve which of the 6 canonical faces was hit (`closestFace` in `faceFrame.ts`), then maps the
  hit point to normalized (u,v) on that face. Drag-to-reposition and hover face-highlighting are
  explicitly Phase 3 (DESIGN.md §13) — not done here.
- **Standoffs are floor-only.** A standoff feature always gets `face: 'bottom'` and rises from the
  interior floor (`wallThickness`) upward — it is never interpreted relative to whichever face was
  actually clicked. Clicking any face other than `bottom` while a standoff is armed is silently
  ignored (see the guard in `App.tsx`'s `handlePlaceFeature`) rather than placing it against the
  wrong axis. This means placing one requires orbiting the camera to see the underside — no
  "look from below" shortcut was added.
- **Cutout extrusion is built symmetric about its own local origin** (`extrude(..., center: true)`
  in `featurePrimitives.ts`) before being rotated to align with the target face's outward normal.
  This sidesteps needing to get the *sign* of each face's rotation exactly right — a rotation by
  the wrong sign still produces the identical (symmetric) solid, so it only matters that extrusion
  runs along the correct axis, not which direction. Doesn't generalize to asymmetric hole shapes,
  but nothing in the v1 library is asymmetric (see dshape note below).
- **`holeShape: 'dshape'` has no real geometry** — no starter-library connector uses it, so it
  falls back to a circle (if `diameter` is set) or rect (otherwise), same documented-fallback
  pattern as the `snap-fit` lid type in Phase 0/1.
- **`vent` and `custom-hole` feature types are typed but not wired into the CSG pipeline**, and the
  palette has no UI to create either yet — same rationale as above: building CSG support for a
  feature type nothing can currently produce would be untested dead code. Natural follow-up
  alongside Phase 3/4 inspector work (vent needs a slot/honeycomb pattern generator; custom-hole
  needs width/height inputs in the UI, plus per-feature dimensions since it has no library entry).
- **`antenna-passthrough` ships a 10mm placeholder diameter** even though DESIGN.md §6 says it
  should have "no sane default" — there's no per-feature dimension override yet (`Feature` only
  carries `connectorId`, not a size override), so for now it's a fixed value like every other
  library entry, flagged in its `notes` field. Per-feature overrides are natural Phase 3 inspector
  work (same UI that will let you edit `rotationDeg`, drag-reposition, etc.).
- Verified end-to-end with Playwright: placed a connector cutout on the lid and one on the base
  (confirmed by the correct piece getting a visible hole and by parsing the exported binary STL for
  vertices), placed a standoff and confirmed its height in the exported mesh matches the computed
  default exactly, confirmed an off-target standoff click is rejected, confirmed removal via the
  inspector list works, and confirmed both exported STLs remain watertight (every mesh edge shared
  by exactly two triangles) with multiple features applied together.

## Phase 3 implementation notes

- All pointer interaction (click-to-place, hover face highlight, feature select/drag, resize
  handles) lives in **one** set of DOM listeners attached once in `Viewport3D`'s mount effect,
  rather than several effects each attaching their own. Changing props (`outer`, `features`,
  `placementArmed`, the callbacks) are read through refs updated by small dependency-effects, not
  by re-attaching listeners — see the comment block above the listener setup. This was a deliberate
  consolidation versus Phase 2's separate click-to-place effect, once hover/drag/handles all
  needed to coexist on the same canvas without fighting each other or `OrbitControls`.
- **`OrbitControls.enabled` is toggled off for the duration of any handle or feature drag**
  (`setControlsEnabled` in `Viewport3D.tsx`), checked eagerly on `pointerdown` (not after a
  movement threshold) so there's no camera-jiggle at the start of a drag. Re-enabled on
  `pointerup` regardless of what was being dragged.
- **Feature dragging raycasts against the rendered mesh, not an infinite face plane** — this was
  the one real bug caught during verification: an infinite-plane raycast blows up near the
  silhouette edge under perspective (a few screen px can map to tens of mm on a steeply-angled
  plane), so a drag would rocket to the face boundary almost immediately instead of tracking the
  cursor. Raycasting the actual mesh naturally bounds the drag to visible geometry. `face` itself
  stays fixed from pickup (not re-derived each move) and the hit point's raw xyz is reinterpreted
  through that fixed face's `faceFromWorld` — this is also what keeps a standoff drag constrained
  to the bottom face rather than jumping to whatever face the cursor happens to stray onto.
- **Resize handles**: 4 corner cubes at the top face corners drag on the horizontal plane at
  `z = height` and set length/width together (`length = 2*|x|`, `width = 2*|y|`, exploiting the
  body being centered at the origin); a separate cone handle above the top face center drags along
  a camera-facing vertical plane through the height axis (standard gizmo technique — a plane
  containing the drag axis, oriented to face the camera, avoids the axis-parallel-to-view
  degenerate case a naive fixed plane would hit).
- **Snapping** (`csg/snapping.ts`) is a single generic `snapValue(value, candidates, threshold)`
  used for both axes independently: candidates are `[0, 0.5, 1, ...otherFeaturesOnSameFace]`, and
  the mm-based threshold (2mm) is converted to normalized per-axis via `faceSize()` since a face's
  two axes are rarely the same physical length.
- Per-feature dimension overrides (standoff outer/screw-hole/height) are editable in the inspector
  now via `updateFeature`; `antenna-passthrough`'s "no sane default" gap from the Phase 2 notes is
  **still** open, though — connector-cutout features have no override fields in the data model yet,
  only `rotationDeg` is editable for them. Adding a size-override field is a small, isolated
  follow-up if it's ever needed.
- `vent` and `custom-hole` remain unimplemented, same as noted in Phase 2 — nothing in Phase 3
  changed that.
- Verified end-to-end with Playwright: hover highlight appears/disappears correctly per face;
  clicking a marker selects it (turns red) and populates the inspector; editing rotation in the
  inspector updates the store; dragging a marker tracks the cursor smoothly and is bounded to the
  face (this is what caught the infinite-plane bug above); clicking empty space deselects;
  removing the selected feature also clears the selection; both corner and height handles resize
  the body live with the numeric fields staying in sync in both directions; export after a resize
  + feature placement still produces two watertight STLs.

## Phase 4 implementation notes

- **`projectStore.ts` was refactored around a single `mutate()` choke point** that every action
  goes through instead of calling Zustand's `set` directly. This is what makes undo/redo possible
  without touching every action individually: `mutate` decides whether the incoming change starts
  a new history entry or coalesces into the current one, so the ~15 existing actions (and any
  future ones) get undo/redo for free just by routing through it.
- **History snapshots debounce on the gap since the last *mutation*, not the last *snapshot*** —
  this was the one real bug caught during Phase 4 verification. The first version gated on "time
  since we last recorded a checkpoint," which sounds equivalent but isn't: for a continuous drag
  gesture lasting longer than the debounce window (500ms), the gate re-opens mid-drag purely
  because enough wall-clock time has passed since the *snapshot*, splitting one drag into several
  undo steps. Gating on the gap since the last mutation (and resetting that clock on every
  mutation, snapshot or not) means an arbitrarily long continuous burst — a slow multi-second drag
  included — coalesces into exactly one undo step, only starting a new one after a genuine pause.
  Caught by running the same Playwright drag test three times and noticing the "after undo" value
  wasn't fully reverting and wasn't even consistent between runs; a single run had looked plausible
  enough to almost miss.
- **Board presets** (`presets/boards.ts`) only set body dimensions, wall thickness, and split
  height, and clear placed features — they don't attempt real mounting-hole/connector positions
  for the named boards. Getting individual hole diameters approximately right (like the connector
  library) is one thing; getting a whole board's mounting pattern right is a different, much
  higher-precision claim this session had no way to verify against real hardware, so it wasn't
  attempted. Same "verify before printing" disclaimer as the connector/screw libraries.
- **Save/Load is the real persistence; autosave is a cache** (DESIGN.md §10, taken literally):
  `exportProjectJson`/`parseProjectJsonFile` round-trip a downloadable `.json`; a separate
  `state/autosave.ts` debounced-writes the same project shape to `localStorage` on every change
  and is read back on store init instead of `createDefaultProject()` when present and valid. Both
  paths share one structural validator (`state/projectValidation.ts`) so a corrupt/incompatible
  autosave entry and a bad imported file fail the same way (fall back to a fresh default project,
  or surface an inline error banner for an explicit Load).
- **Units toggle is purely a display layer** (`state/units.ts` + `UnitNumberField` in
  `InspectorPanel.tsx`): the store never holds anything but canonical mm; every mm-based numeric
  field converts for display/input at the component boundary. Verified round-trip: typed `4` while
  in inches, switched back to mm, got exactly `101.6`.
- **Undo/redo keyboard shortcuts are gated on `document.activeElement`** — Ctrl+Z inside a focused
  text/number/select field is left alone (native in-field undo, not intercepted) rather than
  hijacking it for project-level undo, which would be surprising while typing.
- Verified end-to-end with Playwright: applying a board preset changes body dimensions and clears
  features; invalid JSON and a structurally-invalid-but-parseable JSON file both surface the error
  banner without crashing; a valid (hand-edited) project file loads correctly; a change survives a
  full page reload via autosave; undo/redo works across ordinary discrete edits, coalesces a
  multi-step corner-handle drag into a single step (verified 3x after the fix, not just once), and
  responds to both the toolbar buttons and keyboard shortcuts; export still produces two watertight
  STLs after Phase 4 changes.

## Phase 5 implementation notes

- **`EnclosureBody` is now a real discriminated union** (`BoxBody | CylinderBody` in
  `types/project.ts`), not the single-shape interface DESIGN.md §5 shows — this is the "additive,
  not a rewrite" extensibility DESIGN.md §9 explicitly designed for. `CylinderBody.outer` is
  `{ diameter, height }` and it has no `cornerStyle` (nothing to round/chamfer on a circular
  footprint).
- **A new `'side'` `Face` variant** covers a cylinder's curved lateral wall (box bodies never
  produce or accept it). `u` is the angle around Z (0→0°, 1→360°, wrapping) and `v` is 0 (bottom)
  to 1 (top), matching the box side faces' `v` convention. `csg/faceFrame.ts`'s `toWorld`/
  `faceSize`/`faceFromWorld`/`closestFace` all now take a shape-tagged `BodyGeometry` (derived from
  `EnclosureBody` via `bodyGeometry()`) and branch on `.shape` internally, rather than assuming a
  box's length/width/height everywhere.
- **`FaceFrame.normal` became `normalAt(u, v)`** — a cylinder's outward normal on the `'side'` face
  varies continuously with `u` (it's radial), so it can't be a fixed per-face constant the way a
  box face's normal is. Box faces just ignore the arguments and return their fixed normal.
- **Connector cutouts on `'side'` are oriented by angle, not just face name**:
  `featurePrimitives.ts`'s `orientAlongFace` takes the feature's `u` for the `'side'` case and
  rotates the extrusion axis to point radially outward at `u * 360` degrees, reusing the same
  Z→X building block `'left'`/`'right'` already used before spinning around Z.
- **Viewport3D resize handle is shape-dependent**: a box gets its existing 4 corner cubes; a
  cylinder gets a single radius handle (drags on the same top-of-body plane, but sets `diameter =
  2 * hypot(x, y)` instead of `length`/`width`). Both funnel through the same `'corner'` drag-state
  branch in the pointer-move handler, just producing a different `BodyResizePatch` shape.
- **Cylinder hover highlight covers the whole lateral surface**, not a local tangent patch — a
  curved face has no single flat plane the way a box face does, so `'side'` gets an open
  `THREE.CylinderGeometry` band spanning the full height. This is actually the direct analogue of
  how box hover-highlighting already lights up an entire (flat) face rather than a patch under the
  cursor, not a compromise.
- **Switching `body.shape` (or applying a board preset while the body is a cylinder) clears all
  placed features**, same precedent as Phase 4's board presets: old `(face, u, v)` placements are
  meaningless against a differently-shaped body, so there's no attempt to remap or selectively keep
  ones that might still "fit."
- **CSG-side, box and cylinder lid mating are parallel implementations, not one generalized
  function**: `applyScrewBossLid`/`applyScrewBossLidCylinder`, `applyFrictionLipLid`/
  `applyFrictionLipLidCylinder`, `applySnapFitLid`/`applySnapFitLidCylinder` share a boss-position
  helper (`bossPositions` corners vs `bossPositionsCircular` evenly-spaced ring) and a per-shape
  solid-shell primitive (`boxShell` vs `cylinderShell`), but the assembly logic is written twice.
  Per AGENTS.md's "no premature abstraction" — two shapes times three lid types is a real amount of
  divergent geometry (rectangular footprints and shrink-by-corner-radius vs. circular footprints
  and shrink-by-radius), and forcing one generic function through both would need more parameters
  and branches than just writing the cylinder version directly.
- **Snap-fit lid** (`applySnapFitLid`/`applySnapFitLidCylinder` in `csg/primitives.ts`) models the
  final assembled state only, not the insertion motion: two cantilever tabs (front/back for a box,
  0°/180° for a cylinder) hang from the lid into the base cavity, each with a small sphere "nub"
  near its tip that pokes past the tab's own face into a slightly-larger spherical pocket cut into
  the base wall. This is a simplified profile — a real engineered cantilever snap uses a wedge with
  a lead-in ramp and a sharp catching ledge for more retention force — flagged as a starting point,
  same "verify before printing" spirit as the connector/screw libraries. Verified the nub geometry
  actually lands in the exported mesh (not silently dropped by a degenerate boolean) by checking for
  vertices at the expected bulge radius in the raw STL bytes.
- **Gasket channel is an optional `LidSpec.gasket` field**, independent of `lid.type` — any of the
  three lid types can be combined with a gasket channel, so it's applied as a separate pass in
  `generateEnclosure.ts` after the lid-mating branch rather than folded into each one. It only cuts
  a groove into the **base's** top rim (centered in the wall thickness); there's no matching ridge
  on the lid, since a real O-ring/foam cord — not a printed ridge — is what seats in the channel and
  gets compressed by the lid's flat underside. Verified the groove's floor (`z = splitHeight -
  depth`) actually appears in the exported base mesh alongside the rim's top surface (`z =
  splitHeight`), confirming it's a real cut and not a no-op.
- **BOM export (`export/bom.ts`) rides the same Export button**, adding a third file (`bom.csv`)
  into the zip alongside `case_base.stl`/`case_lid.stl` rather than being a separate UI flow — it's
  "alongside the STLs" per DESIGN.md's stretch-goal wording. Rows: lid screws + heat-set inserts
  (only for `screw-boss`), a gasket cord estimate (cross-section width + computed perimeter, only
  if a gasket channel is enabled), one row per distinct connector (aggregated by `connectorId`, not
  one row per placement), and one row per distinct standoff spec (aggregated by outer/screw-hole
  diameter). Plain CSV with manual quote-escaping (no library) since the four-column shape is fixed
  and small.
- Verified end-to-end with Playwright across both shapes: shape switching, diameter/height fields
  replacing length/width (and the Corners section disappearing) for a cylinder, dragging the
  radius/height handles, placing a connector cutout on the cylinder's curved side wall and a
  standoff on its bottom cap, all three lid types (including snap-fit) on both shapes, gasket
  channel toggle + width/depth fields, board-preset application correctly coercing a cylinder body
  back to box, and save/load round-tripping a cylinder + snap-fit + gasket project through a full
  page reload. Every exported STL pair checked (box/cylinder × all 3 lid types, with and without a
  gasket) remained watertight (every mesh edge shared by exactly two triangles). No console errors
  in any of the above. Box-shape regressions spot-checked (corner handles, front-face cutout
  placement) to confirm the shape-dispatch refactor didn't disturb the existing box code path.

## Known issues / gotchas for future sessions

- **React StrictMode + Web Worker gotcha**: the CSG worker client must be constructed inside a
  `useEffect` (not a `useState(() => new CsgWorkerClient())` lazy initializer). Under StrictMode's
  dev-only mount→cleanup→mount cycle, a lazy-initializer-created worker gets `terminate()`d by the
  cleanup pass but the same (now-dead) instance survives into the second mount, so
  `postMessage` calls silently go nowhere — no error, the UI just hangs on "Regenerating...".
  See the comment in `frontend/src/csg/useLiveGeometry.ts`. Preserve this pattern if you refactor
  geometry state management.
- Production bundle is ~845KB (gzip ~228KB) for the main chunk — three.js + JSZip + the manifold
  WASM loader are the bulk. Not yet addressed. Candidate fix: dynamic `import()` the export path
  (JSZip/STLExporter) since it's only needed after clicking Export, not on initial load.
- Docker image build **was verified** in the 2026-08-13 release-pipeline session (see below): a
  real `docker build ./frontend` + container run confirmed `index.html`, the SPA fallback route,
  and the `manifold-3d` wasm asset all serve correctly. `linux/arm64` was validated by inspection
  (QEMU cross-emulation of arbitrary `RUN` steps doesn't work in *this* sandbox's nested-container
  setup — a sandbox limitation, not something specific to this Dockerfile) rather than an actual
  emulated build; there's nothing platform-specific in the Dockerfile (pure npm/vite build, no
  native compilation, and both `node:22-alpine`/`caddy:2-alpine` publish arm64 images), so it
  should build the same way GitHub Actions' `docker/setup-qemu-action` does it — worth confirming
  once the first real `arm64` image is published and someone can pull it on real arm64 hardware.
- **Snap-fit's nub/pocket is a plain sphere pair, no lead-in ramp or catching ledge** — see the
  Phase 5 notes above. Functions as a retention feature but with less holding force than an
  engineered wedge profile would give; revisit if real-world prints show the lid popping off too
  easily.
- **Cylinder feature placement was verified on `'side'` and `'bottom'`, not explicitly on `'top'`**
  — `'top'` reuses the exact same square-domain convention as `'bottom'` (just `+height` instead of
  `z=0`), so it should work identically, but wasn't separately clicked-and-confirmed this session.
- Drag-to-reposition snapping on a cylinder's `'side'` face snaps `u`/`v` the same way a box face
  does, but doesn't do anything special at the `u=0`/`u=1` wrap point (e.g. a feature near 359° and
  one near 1° won't snap to each other even though they're physically adjacent). Minor, same
  "smaller items" tier as the pre-existing cross-face snapping gap below.

## Post-Phase-5 improvements (2026-07-12 session)

### Lid view modes + interior placement

- **The viewport now has a lid-view toolbar** (top-left overlay): Assembled / Ghost / Hidden /
  Exploded. This is *view-only* state held in `App` component state — deliberately not in the
  project store, so it never dirties undo history, autosave, or saved project files. The base and
  lid were always separate meshes end-to-end; the viewport just never let you pull them apart.
- **New `csg/lidSplit.ts`** shares the split-height clamp (`effectiveSplitHeight`) and the
  lid-vs-base assignment rule (`featureOnLid`) between `generateEnclosure` (worker-side) and
  `Viewport3D` (main-thread side) — same one-source-of-truth pattern as `faceFrame.ts`.
- **Raycast semantics per mode**: hidden and ghost lids are excluded from placement/hover raycasts
  (three's raycaster does *not* skip invisible meshes on its own — must be excluded explicitly);
  ghost is deliberately see-through for interaction so you can place interior features while the
  lid stays visible as context. Exploded-lid hits are mapped back through the explode offset
  (`modelPoint` in `Viewport3D`) before any (u,v) lookup. Feature markers ride their piece:
  lifted with an exploded lid, hidden with a hidden one.
- **Interior surfaces now resolve to the wall they physically belong to** (`resolveInteriorFace`):
  the interior floor (upward normal below the split plane) maps to `bottom`, the inside of the
  back wall (front-facing normal, +y half) maps to `back`, etc. This is what makes standoffs
  placeable from a normal top-down view with the lid hidden — the Phase 2 "orbit underneath to
  place a standoff" wart is gone. It also matters for correctness: hiding the lid newly exposed
  interior walls to clicks, and without the remap a click on the inside of the back wall would
  have placed a front-face feature.
- Exploded-lid hover highlight only tracks the lift for the `top` face (the only face entirely on
  the lid); side-face highlights straddle the split and stay at the model position — cosmetic,
  noted here so nobody chases it as a bug.

### Vent / custom-hole / d-shape / per-placement size overrides

- **`vent` and `custom-hole` are now real** (CSG + palette "Openings" section + inspector
  editors), closing the gap flagged in the Phase 2/3 notes. Vents are through-wall patterns on
  any face: `slots` (rounded-end slats, stacked along the face's v axis) or `honeycomb` (hex
  cells, across-corners = "cell size", offset grid at the given pitch, cells kept fully inside
  the area). Custom holes are per-feature circles (`width` = diameter) or rects.
- **`dshape` has real geometry**: circle minus a chord flat; the library entry's `height` is the
  across-flat dimension, clamped so a flat >= diameter degenerates gracefully to a full circle.
  New `toggle-switch-d` library entry (misc) actually uses it.
- **`Feature.connectorOverride`** (`{diameter?, width?, height?}`) gives any connector-cutout
  per-placement dimensions, falling back field-by-field to the library entry, with a "Reset to
  library size" button in the inspector. This closes the long-open `antenna-passthrough` "no sane
  default" gap from the Phase 2 notes.
- **Fixed a latent orientation bug in `orientAlongFace`**: the cross-section's local X axis
  mapped to the *vertical* on `left`/`right`/`side` faces, so any non-square rect cutout (e.g.
  USB-C 9x3.5) placed there rendered rotated 90°. Cross-section X/Y now follow every face's u/v
  convention. Verified geometrically: a 12x6 rect on the right face measures 12mm along Y and
  6mm along Z in the exported STL. (Pre-fix projects that compensated with `rotationDeg` would
  see those placements turn — judged acceptable since the old behavior was simply wrong.)

### Board mounts (board layout support)

- **New `board-mount` feature type**: one floor feature carrying a PCB outline
  (`boardWidth`/`boardDepth`/`boardThickness`), a mounting-hole list (mm offsets from board
  center, rotated by the feature's `rotationDeg`), and a shared standoff spec. CSG generates one
  standoff per hole (`buildBoardMount`); the viewport draws a translucent PCB-green **ghost
  board** floating on its standoffs (display-only: never raycast, never exported) so
  wall/lid/connector clearance can be judged by eye. Rides all existing feature plumbing
  (placement guard like standoffs: base floor only; drag; undo; save/load).
- **Inspector board editor**: outline fields, standoff spec, per-hole X/Y rows with add/remove,
  and a "4-corner pattern" regenerator (3.5mm corner inset — the de-facto hobby-board default).
- **The four Raspberry Pi presets now carry their officially documented mounting patterns**
  (from the published Pi mechanical drawings): 85x56 board with the 58x49 M2.5 grid for
  3B/4B/5/HAT-stack (note the pattern is intentionally off-center on the board), 65x30 with
  58x23 for the Zero. Applying such a preset drops a centered board-mount instead of an empty
  feature list. The other presets (RTL-SDR, Heltec, T-Beam, XIAO) stay dimension-only rather
  than guessing hole positions — XIAO boards don't even have mounting holes.
- BOM aggregates board-mount standoffs into the same "PCB standoff" rows as single standoffs.

All three chunks verified end-to-end with Playwright against the dev server (scripted checks +
screenshot review): lid modes render correctly (pixel-classified per mode, exploded offset
measured in screen rows), standoff placed on the interior floor from a top-down view lands on
`bottom` with sane (u,v), exploded-lid placement maps back into model space, vents/custom
holes/D-holes/overrides round-trip through store and inspector, exported STL pairs stay
watertight (every edge shared by exactly two triangles) with all new feature types applied at
once, the Pi preset's four bosses sit at the documented hole positions in the exported base mesh
(vertex-level check), and the rect-orientation fix was measured in the exported STL. No console
errors in any run.

## Connector/board preset library growth

- **Connector library** (`connectors/library.ts`) grew from the DESIGN.md §6 starter set (6
  entries) to add HDMI (full-size, mini, micro), Ethernet RJ45, Micro-USB (B), USB-B, a 3.5mm TRS
  audio jack, and an IEC C14 power inlet — same "verify before printing" unverified-starter-value
  disclaimer as the original set. This needed three new `ConnectorCategory` values (`video`,
  `network`, `audio`) added to the type union and to `FeaturePalette.tsx`'s `CATEGORY_LABELS`/
  `CATEGORY_ORDER` — everything else (palette rendering, cutout CSG) is data-driven off the array,
  so no other code changed.
- **Board presets** (`presets/boards.ts`) grew from 4 to 8: added Seeed Studio XIAO (RP2040/
  ESP32-C3/SAMD21 share one footprint), Raspberry Pi 3B/4B, Raspberry Pi 5 (taller, for the active
  cooler), and a Raspberry Pi + HAT stack variant (taller still, for header + HAT clearance). Same
  precedent as the existing 4 presets: dimensions/wall-thickness/split-height only, no real
  mounting-hole positions.
- Verified end-to-end with Playwright: all new palette entries appear under their category
  headers, placing a new cutout (Ethernet RJ45) works identically to an original-set connector,
  and all 4 new board presets appear in the picker and correctly resize the body (checked
  Raspberry Pi 5 → 100×70×35mm, split height 22mm).

## Align/mirror inspector controls (2026-07-18 session)

- **New "Position" controls** in the selected-feature section of `InspectorPanel.tsx`: an
  `AlignMirrorAxisRow` per axis (U and V) with three Align buttons (Start/Center/End, snapping that
  axis to 0/0.5/1) and one Mirror button. Prompted by looking at SketchForge-3D
  (github.com/Formsmith746/SketchForge-3D) for UI ideas worth borrowing — its align/mirror overlay's
  "hover to preview, click to commit" interaction is the piece that carried over; the general-CAD
  primitive-sculpting side of that project was deliberately left out, since it's exactly what
  DESIGN.md §1 rules out as a non-goal.
- **Align moves the selected feature; Mirror adds a duplicate** rather than moving it — flattening
  mirror into a move would destroy the original placement a symmetric layout (e.g. two SMA
  connectors mirrored left/right on a panel) still needs. Mirror is disabled when the feature is
  already centered on that axis (reflecting would stack an identical duplicate on itself).
- **New `state/alignMirror.ts`**: pure position math (`alignedPosition`, `mirroredPosition`) plus
  `cloneFeatureAt`, which `structuredClone`s the feature (so nested specs like `standoff`/`board`/
  `vent`/`connectorOverride` are copied, not shared) and assigns a fresh id.
  `mirroredPosition` returns `null` at the disabled-mirror condition above, which both the button's
  `disabled` state and its preview read.
- **Hover/focus preview**: a new `PreviewTarget` (face + u/v) is lifted into `App` state (view-only,
  same non-persisted precedent as `lidView` — never touches the project store, undo history, or
  autosave) and passed to `Viewport3D`, which renders a translucent ghost marker (distinct from the
  solid feature markers, not a raycast/selection target) at the hovered target. Cleared on click
  (before the real update commits) and whenever `selectedFeatureId` changes, so a stale preview
  can't linger past a selection change that doesn't fire the button's `onMouseLeave` (e.g. clicking
  a different marker directly in the viewport).
- Verified end-to-end with Playwright against the dev server: placed an off-center SMA cutout,
  hovered Align Center on both axes (screenshotted the ghost preview), clicked to commit and
  confirmed the marker moved to the face center; confirmed the Mirror button is disabled exactly
  when centered on that axis; undid back to the off-center placement, mirrored the V axis, and
  confirmed a second feature appeared in the list (screenshotted) and the ghost/committed positions
  matched the expected reflection; confirmed Export still opens and packages STLs normally with the
  mirrored duplicate present. No console errors in any step.

## Multi-part enclosures: slide-in panels + external mounts (2026-08-11 session)

Prompted by a user-contributed CadQuery design for the Waveshare CM4-DUAL-ETH-WIFI6-BASE — a
four-piece case (tray, lid, two slide-in end plates) with wall-mount ears and exterior screw
columns, none of which the app could express. Three capabilities plus the preset:

### Parts, not "base and lid"

- **`generateEnclosure` now returns `parts: EnclosurePart[]`** (id/label/kind/face/manifold)
  instead of a fixed `{ base, lid }` pair. That shape flows through `workerProtocol`
  (`PartMesh[]`), `CsgWorkerClient` (`EnclosureMeshes.parts`), `Viewport3D` (one `THREE.Mesh` per
  part, created and disposed as the set changes — the set is dynamic now, so meshes can't be
  allocated once at mount like the old base/lid pair) and `stlExport` (one STL per piece:
  `case_base.stl`, `case_lid.stl`, `panel_left.stl`, …).
- **New `csg/parts.ts` owns the routing rule** (`featurePart`), replacing `lidSplit.ts`'s
  `featureOnLid`, which had only two possible answers. Same one-source-of-truth pattern as
  `faceFrame.ts`/`lidSplit.ts`: the worker uses it to pick a boolean target, the viewport uses it
  to know which piece a marker rides on.
- **Exploded view moved from "lift the lid" to a per-part offset** (`partDisplayOffset`): the lid
  lifts, each panel slides out along its own face normal. Raycast hits are mapped back to model
  space by subtracting the hit mesh's own position, which generalizes the old lid-only offset.

### Slide-in panels (`BoxBody.panels`)

- Any of the four walls can be printed as a separate flat plate that drops into a channel grooved
  into the two adjacent walls, the floor, and (optionally) the lid's underside. Cutouts placed on
  that face are cut into the **plate**, not the base — which is the point: a connector panel can be
  reprinted on its own when the port layout changes.
- **Channels are cut after the lid mating geometry**, so a screw boss or friction lip can never end
  up blocking the slot the plate has to slide down.
- **Plates are trimmed against the outer shell** so their ends follow the body's corner style
  instead of poking out past a rounded corner.
- **Where two panels meet, their ends stop clear of the corner radius** (`cornerInset + 0.6`, not
  just the neighbouring channel). Found by the "all four walls are panels" test: with the default
  3mm rounded corners, stopping at the neighbouring channel leaves a corner post made of nothing
  but a sliver of the corner arc, which comes out non-manifold.
- **Lid capture depth is clamped to the skirt actually available** and drops to zero (plate flush
  with the base rim, held by the flat lid) when there isn't enough. Without this, a shallow lid
  gets its groove cut past its own interior ceiling, leaving a razor-thin ledge — a real
  non-manifold pinch, 16 edges shared by 4 triangles, found via the CM4 preset.

### External mounts (`external-mount` feature)

- The outward-growing counterpart to the interior-only `standoff`: `flange` is a flat wall-mount
  ear (optional round/slot/keyhole hole, the slot and keyhole both running along the outward
  direction so the screw position is adjustable / the case can be dropped over a screw head and
  slid to trap it); `boss` is an external post — a foot, a spacer, a bolt pillar — with an optional
  blind hole. Both union into whichever part owns that patch of the face, so a boss placed above
  the lid seam attaches to the lid.
- **`orientOutward` is a second orientation helper alongside `orientAlongFace`**, because a
  one-sided solid needs the sign of "outward" right on every face, where a symmetric cutout
  extrusion never did. On the faces whose (u, v, n) frame is left-handed (back, left, bottom) no
  pure rotation matches all three axes; those flip v, which is invisible here since the mount
  geometry's only asymmetric axis is the normal.
- Flange ears are built in their own natural frame (X across, Y outward, Z through the plate) and
  rotated into the local frame, so the hole cross-sections are drawn in the plane you'd draw them
  on paper.

### Exterior lid screw columns (`ScrewSpec.placement`)

- `'exterior'` puts the columns outside the front and back walls instead of inside the cavity. This
  is what a case whose board fills the interior has to use — there is no floor left for corner
  bosses — and it's the one case the existing `edgeInset` lever can't reach. Left/right walls are
  left alone until count 8, since those are the faces most likely to be slide-in panels.
- Unlike an interior boss (which lives entirely in the base, under a flat lid), an exterior column
  is a continuous post that the split cuts in half, so the lid gets **matching material** plus its
  clearance hole rather than a hole alone.

### Waveshare CM4 Dual ETH WiFi6 preset

- Full four-piece case: 6-hole board mount, 12 port cutouts across the two end plates (including
  four SMA bulkheads above the HAT stack), intake louvres on the left plate and the front wall, a
  40mm fan grille + screw holes in the lid, and four slotted wall-mount tabs.
- **Provenance is different from every other preset here and is flagged as such**: the board
  outline, hole pattern and port silhouettes were measured off Waveshare's vendor STEP model (they
  publish no dimensioned drawing), by way of the contributed CadQuery design. Same "verify before
  printing" tier, but the mounting holes are the thing worth checking first.
- **Measured openings ride library entries plus a `connectorOverride`** rather than becoming
  anonymous custom holes, so the inspector still names the connector and offers "reset to library
  size". The board's USB-A ports are mounted vertically, so their opening is tall and narrow — a
  good example of why the override exists.
- Preset plumbing grew to match: `BoardIoCutout` can now carry a vent, an external mount or a size
  override, and can sit on the horizontal top/bottom faces (`acrossMm`); `BoardPresetBody` can pin
  the lid type, screw placement and panel spec. Applying a preset **replaces** panels (unlike the
  gasket, which is preserved) — panels change how many pieces the case prints as and which piece
  each cutout lands on, so inheriting them silently would reshape the new case.
- The preset's `splitHeight` (41mm) is deliberately below the source design's lid plane: it keeps a
  real lid skirt for the end plates to be captured in, and still clears the tallest opening (the
  SMA row tops out at 37.2mm).

### Verification

- `tsc -b`, `oxlint`, `npm run build` clean; **73 vitest tests passing** (was 43). New CSG coverage:
  panel part counts and plate dimensions, cutout routing to the plate, all four walls as panels,
  panels across every lid type, each external mount style watertight, and — for the CM4 preset —
  part list, feature routing, board-relative position round-trip, and a **geometric probe check**
  that each measured port is a real hole through the end plate at its measured height (a 0.8mm
  cube intersected against the plate must be empty at the port center and solid just beside it).
- Playwright against the dev server: panels toggled on from the Body card produce visibly separate
  plates in exploded view; the CM4 preset applies (27 features: 1 board-mount, 12 connector
  cutouts, 7 custom holes, 3 vents, 4 external mounts) and survives a full page reload through
  autosave; toggling a panel face off drops that part and undo restores it; a flange and a boss
  placed by hand land on the clicked wall (the boss above the seam correctly attaching to the lid);
  the inspector's mount editor round-trips a hole-style change; and Export produces a zip with four
  STLs plus `bom.csv`. Zero console errors across every run.

## Fans, corner mounts, screw column variations (2026-08-11 session, follow-up)

Second round on the same request, filling the gaps the CM4 port exposed.

### Fan mounts (`fan-mount` feature, `csg/fanLibrary.ts`)

- **Ten standard sizes** (20 → 120mm) with their square bolt-circle pitches, in the same
  "starter values, verify against your actual part" tier as the connector and screw libraries. The
  20mm entry is flagged as the least standardized (some use 15.5mm rather than 16mm).
- **The concentric ring grille is ported from the contributed CadQuery design**, generalized to any
  fan size: open annuli from the hub outward, cut back by N radial spokes so the middle stays tied
  to the rim. Every span is a short bridge between two rings, which is what makes it print without
  support. `honeycomb` (reusing the vent hex generator, clipped to the fan circle) and `open` (a
  plain round hole for a fan with its own guard) are the alternatives.
- **The hub hole is restored after the spokes are cut**, not before — cutting spokes across a
  grille that already contains the hub fills the middle back in. Caught by a probe test; it's also
  what the source design does (its central hole is the last operation).
- **Mounting bosses run from the outer surface inward through the wall**, so `bossHeight` is what
  actually stands proud on the inside. The first version measured from the outer face, which on a
  2mm wall turned a 3mm boss into 1mm of usable pad. Also caught by a probe test.
- A fan mount is the only feature that is **both additive and subtractive** — bosses union in, then
  the same cut bores the screw holes through them — so `buildFanMount` returns `{ add, cut }` and
  `generateEnclosure` applies both to the same part.
- The CM4 preset now uses a real 40mm fan mount instead of a honeycomb vent plus four hand-placed
  circles.

### Corner-anchored external mounts (`ExternalMountSpec.anchor`)

- `'corner'` snaps a mount to whichever vertical corner of a box its `u` is nearest and aims it out
  along the diagonal, welding into **both** walls — the four-ears-at-the-corners pattern most
  wall-mounted project boxes use. `u` picks the end of the face, `v` still sets the height.
- **Corner ears sink deeper into the case than face-mounted ones**: a rounded or chamfered corner
  cuts the corner point away by `r*(sqrt2 - 1)` along the diagonal, so the embed depth adds that
  back. Without it the ear would float next to a radiused corner instead of welding to it.
- **A corner mount always belongs to the base/lid, never a panel**, even when its face is a panel
  face — panels stop short of the corners, so the ear physically hangs off the corner post
  (`featurePart` has an explicit carve-out for this).
- `cornerAnchor()` lives in `csg/faceFrame.ts` with the rest of the shape-aware placement math, so
  the CSG and the viewport's marker placement can't drift.
- Inspector adds a **"Put one on each corner"** action: the four vertical corners are exactly
  front/back × u∈{0,1}, so it clones the mount onto the three it isn't on.

### Screw column variations (`ScrewSpec`)

- **`shape`**: round or square columns. **`size`**: M4 joins M2/M2.5/M3 (the library grew a
  `headDiameter` per size for counterbores).
- **`columnHeight`**: a column shorter than the base hangs from the lid seam instead of standing on
  the floor, leaving the space underneath clear for a board or cable run. A hanging column has no
  floor holding it up, so its edge inset is **capped at just inside the boss radius** — it has to
  reach into the wall far enough to weld, overriding a user `edgeInset` that would leave it
  floating.
- **`headStyle: 'counterbore'`** conceals the screw head in a pocket in the lid. Depth is clamped
  against the material actually over the screw — for an interior boss that's the lid's top slab
  (the wall thickness), *not* the lid piece's height, since the piece is a tray with air under it.
  The first version used the piece height and cut straight through into the cavity: another probe
  test catch. Exterior columns are solid to the top, so they're clamped against the piece instead.
- BOM now names the screw **`M3x12mm`** rather than just `M3`, deriving the length from what it has
  to pass through (lid, less any counterbore) plus its engagement in the column, rounded up to the
  next even millimetre.

### Verification

- 89 vitest tests passing (was 73). The new ones lean on a **geometric probe helper** (intersect a
  0.8mm cube with a part and ask whether it's empty), which is what caught all three of the bugs
  above — every one of them produced perfectly watertight geometry that was simply the wrong shape,
  so watertightness checks alone would have passed them.
- Playwright: all ten fan sizes render in a new palette group and a placed 40mm fan shows its ring
  grille and four screw holes in the lid; a flange switched to corner anchoring plus "put one on
  each corner" yields four diagonal ears (verified in the store as four distinct corners); square +
  concealed + 12mm columns apply live and the shortened columns are visibly hanging from the seam
  with the floor clear beneath them; the CM4 preset re-applies (23 features now the fan is one
  feature instead of five) and survives a reload. No console errors.

## Support pads + ghost fan bodies (2026-08-11 session, third round)

The two items the CM4 port had left on the table.

### Support pads (`support-pad` feature)

- A blind pillar on the interior floor with **no screw hole** — something for an unsupported board
  edge to rest on. Carrier boards whose mounting holes are all down one side cantilever the
  opposite edge over open air, and pushing a cable into a connector on that edge flexes the PCB.
  Rectangular or round, sized in plan, height set to match the board's standoffs so it meets the
  underside without lifting it.
- Floor-only, exactly like a standoff and a board mount: `featurePart` routes it to the base and
  `App`'s placement guard ignores clicks on any other face (verified — a click on an interior wall
  leaves the palette armed rather than placing something in the wrong plane).
- **The CM4 preset ships the source design's four bands** (6mm across, 5.1/4.1/2/2mm deep, 4mm
  tall) under the right edge that carries the HDMI/USB/Ethernet stack. They ride the same
  board-relative `io` list as everything else, on the `bottom` face via `alongMm`/`acrossMm`.

### Ghost fan bodies

- `FanMountSpec.bodyDepth` records the fan's own thickness (40x40x**10**), defaulted per size from
  `FAN_PRESETS`. Nothing is cut or printed from it — the viewport draws the fan's envelope as a
  translucent volume hanging off the inside of its face, at the end of the same wall + boss stack
  the CSG builds through, so you can see whether it fouls a HAT or a heatsink under it.
- Orientation is by quaternion from local +Z onto the face's outward normal, then a spin about that
  axis for `rotationDeg` — a square fan's envelope really does change when it's turned. Works on
  any face, including a cylinder's curved side.
- **The "Show Ghost Boards" toggle became "Show Ghost Parts"** and now covers both ghosts (prop
  `showGhostBoards` → `showGhosts`, `ghostBoardGroupRef` → `ghostGroupRef`). One concept, one
  switch: display-only hardware you're designing around. Hidden features are excluded from both
  ghosts now, which the board ghost wasn't doing before.

### Verification

- 93 vitest tests passing (was 89). Pad coverage is probe-based: it stands on the floor, stops at
  its stated height, has **no** bore through the middle (the thing that distinguishes it from a
  standoff), is the size it claims in both axes, and meets the underside of a board sitting on
  standoffs of the same height. The CM4 preset test asserts all four pads route to the base, sit
  under the board's right edge, and match the board-mount's standoff height.
- Playwright: the CM4 preset places four pads with the source design's dimensions; a hand-placed
  pad lands on the interior floor and a click on a wall is correctly ignored; the ghost fan body
  renders inside the case for both a lid-mounted fan (CM4) and a wall-mounted one, and disappears
  with the Show Ghost Parts toggle. No console errors.

## Pad rows + design checks (2026-08-11 session, fourth round)

Closing the two gaps the support-pad work left: placing a run of pads one at a time, and having no
way to tell a pad is doing nothing.

### Pad rows and the overhang planner

- **`SupportPadSpec` gained `count` / `pitch` / `axis`**: one feature emits a row of evenly spaced
  pillars, the same one-feature-many-solids arrangement a board-mount uses for its standoffs, so a
  run moves and edits as a unit. The row direction is the pad's axis turned by the feature's own
  rotation, so rotating a row rotates the whole arrangement instead of skewing it.
- **`csg/faceFrame.ts`'s `supportPadPositions()` is the single source of where the pillars are** —
  the CSG builds them there, the checks test them there, and they can't drift apart.
- **New `state/boardSupport.ts`: `planOverhangSupport()`**, behind a "Prop up the *right* edge"
  button on the board-mount inspector. It measures each board edge's distance to its nearest
  mounting hole, takes the worst, and returns a ready-made pad row just inside that edge at the
  board's own standoff height. Returns null (and the inspector says so) when every edge is within
  15mm of a hole — a four-corner board doesn't need propping.
- Sanity check on the heuristic: fed the Waveshare CM4's real hole pattern, it puts the pads at
  x = 41.765mm — the same inset the contributed design chose by hand. There's a test pinning that.
- **Rows don't replace individual pads.** The CM4's own four bands are irregular (5.1 / 4.1 / 2 /
  2mm deep at uneven spacings) because they dodge components on the board's underside, so that
  preset keeps its four hand-placed pads. The inspector hint says as much.

### Design checks (`state/designChecks.ts`)

- A pure `runDesignChecks(project)` returning advisory findings, surfaced in a new **Checks card**
  (badge = count, each row selects its feature) and as a **magenta wireframe halo** around the
  flagged feature's marker in the viewport. Nothing blocks an export — every rule is a heuristic
  about intent, and the user knows more about their hardware than we do.
- Three rules to start, all about support pads because that's where the ambiguity is: not under any
  board, height ≠ the host board's standoff height (it either won't touch or will lift the board),
  and overlapping a standoff.
- **Deliberately quiet**: a rule only fires when the project holds enough information to be sure.
  A pad in a project with no board at all is *not* flagged — there's nothing to check it against,
  and the user may be propping something the app knows nothing about. Hidden features are excluded
  on both sides. Rotated boards are handled by testing points in the board's own frame.
- The real value is the seam: `designChecks.ts` is where feature-collision, thin-wall and
  seam-straddling rules go next, all of which DESIGN.md's own next-steps list already wants.
- **Every shipped preset is asserted check-clean** in `presetFeatures.test.ts`. A preset that trips
  a rule is either a broken preset or a broken rule, and we want to hear it there rather than from
  someone applying it.

### Verification

- 112 vitest tests passing (was 93). The checks and the planner are pure functions, so most of the
  new tests need no WASM: row geometry (including rotation and a zero pitch collapsing to one
  pillar), each rule firing on the mistake it's for, each rule staying silent when it can't know,
  a rotated board changing what counts as "underneath", the planner declining a four-corner board,
  and the planner's own output passing the checks it would be judged by.
- Playwright: applying the CM4 preset and selecting its board-mount offers "Prop up the right
  edge", which adds a 3-pad row at 46.5mm pitch and 4mm height; the Checks card stays empty for
  that (and for every preset), then fires "3.0mm taller than the board's standoffs" when the row's
  height is raised and "not under a board" when it's dragged off, with the halo appearing on the
  flagged marker and a click on a finding selecting its feature. No console errors.
- One UI bug found and fixed while verifying: the Checks card was created with
  `defaultOpen={findings.length > 0}`, and `SectionCard` reads `defaultOpen` exactly once — so the
  card stayed collapsed when the first finding appeared. It's always open now.

## Panel retention + mount blending (2026-08-11 session, fifth round)

Two "it looks right but wouldn't work" reports from the repo owner, both about the multi-part work
that landed in PR #13.

### Slide-in plates had nothing holding them in (`PanelSpec.retainLip`)

The report: *"I don't think that these will actually attach to the case at all, there is nothing
holding the yellow sides into the case."* It was correct, and a sweep test confirmed it — translate
the plate straight out along its own normal and it never meets the base. The first cut of
`panels.ts` cut the channel all the way to the **outer** surface of the neighbouring walls and made
the plate flush with them, so there was no material outboard of the plate at all. The groove only
constrained the plate sideways; nothing stopped it sliding back out the way it went in.

- **`PanelSpec.retainLip`** (mm, default 1) is how much of each adjacent wall is left standing
  proud of the plate at the plate's two ends. `panelChannelCut()` now cuts a **window** (full depth
  across the cavity, so the opening is real) plus **lipped end slots** that stop short of the outer
  face by the lip; `panelPlate()` rebates the plate's own ends by `retainLip + clearance/2` so the
  thin tongue slides behind the lip and the thick middle fills the window. The plate now captures
  in both directions and only comes out by lifting the lid.
- `panelBounds()` was rewritten to return a per-end `PanelEnd { sign, bound, cavityEdge, hasWall }`
  instead of a single span, because the two ends are not symmetric: an end that abuts another
  *panel* has no wall to lip against, so it stays flush there.
- Everything is clamped in `panelMetrics()`: `retainLip ≤ thickness - 0.8`, so a plate can never be
  rebated down to nothing. A plate too thin to hold a lip *and* still hold together (< ~1.8mm)
  gets a design-check finding rather than silently losing its retention — unless the user set
  `retainLip: 0` themselves, which is an opt-out, not a mistake.
- The lid's capture pocket calls `panelChannelCut(..., withLip = false)`. The lid needs the plain
  full-depth window; lipping it there would trap the plate under the lid and make assembly
  impossible.

### External mounts now blend into the wall (`ExternalMountSpec.gusset`)

The report: mounts *"look weird and don't smoothly connect to the body of the case at all"*, plus a
sketch (in green) of a sloped connector under a hanging screw column. `decompose()` confirmed the
mounts were genuinely welded to the wall — one connected component per part — so this was joint
*quality*, not connectivity: a slab meeting a wall at a hard 90° is both ugly and the weakest
possible joint in a printed part, since the layer lines run straight across it.

- **`ExternalMountSpec.gusset`** (mm, defaults to `min(protrusion * 0.45, 4)`, clamped to
  `protrusion - 0.5`) adds a triangular brace where the mount meets the wall. Flanges get
  **two webs, one at each end of the ear**, with the middle left clear so a screwdriver and washer
  still reach the slot; bosses get a **conical collar** instead, which is the round-section
  equivalent and stays symmetric under any rotation.
- The brace goes on whichever side has room: `roomBelow = mountZ - wallThickness/2`, so a low ear
  braces *upward* rather than through the floor. The sign is negated on the face path only — the
  two build paths differ in whether natural +Z survives as world +Z (the face path applies
  `rotate(90,0,0)` twice, the corner path doesn't), and getting this backwards is exactly the bug
  the brace-side test caught.
- Polygon winding is normalised through a small `polygonCcw()` helper before extruding. Manifold
  will happily extrude a clockwise cross-section into an inside-out solid, and a union with one is
  silently wrong rather than an error.

### Hanging screw columns get a sloped foot

Matching the owner's green sketch: a column with `ScrewSpec.columnHeight` set hangs from the lid
seam and used to stop dead in mid-air with a flat, unsupported face. `columnFoot()` in
`primitives.ts` now caps it with a 45° taper — a cone for round columns, an extruded-with-scale
frustum for square ones — sized `min(size/2 - 0.8, distanceToFloor, 5)` and skipped entirely below
0.6mm, where it would be smaller than a couple of layers and not worth the facets. It reads as a
deliberate detail rather than a truncation, and gives the overhang somewhere to start.

### Verification

- 121 vitest tests passing (was 112). The retention tests are the interesting ones: a **sweep test**
  (translate the plate along its normal, intersect with the base, assert it hits material) is what
  pins the actual complaint — watertightness can't see it, and neither could a bounding-box check.
  Plus: the lip appearing/disappearing with the setting, a panel abutting another panel staying
  flush at that end, brace webs present above *and* below depending on room, and a column foot
  narrowing toward the floor.
- Playwright: a demo case with a low flange ear and a mid-wall boss, rendered with the gusset off
  and on, shows the webs and the collar; hanging round and square columns render with visible
  tapered feet. No console errors, and the CM4 preset still passes its own design checks.

## Wall-mount alignment fixes (2026-08-12 session, sixth round)

Two defects reported off screenshots of the Waveshare CM4 preset with short exterior screw
columns: *"the wall edges on the back side are anchoring to the bottom under the printable zone,
the columns are also just tapering down into empty space and not sitting flush at a slope to the
wall they are attached to."* Both were geometry bugs in the previous round's own additions, and
both produced watertight-but-wrong solids, so nothing in the suite could see them.

### Flange braces pointed the wrong way on the back and left walls

`buildExternalMount()` picks a brace side from how much room the owning part has above vs. below
the mount, then hands that to `flangeSolid()` in the flange's *natural* frame. The previous round
noted that the face path has to negate the sign because its rotations land natural +Z on world -Z
— but that is only true on **front/right/side**. `orientOutward()` rotates back and left the other
way (`rotate(-90, 0, 0)`), which leaves natural +Z on world **+Z**, so those two faces got the
opposite of the side that was chosen. A CM4 wall tab sits level with the underside of the tray
(z = 1.5mm), which has no room below it, so the picker correctly chose "brace upward" and the back
wall's two tabs then braced *downward* — 4mm of gusset hanging below z = 0, under the print bed.
New `naturalZAlongFace()` in `featurePrimitives.ts` owns the per-face sign in one place.

### The sloped column foot tapered to a point in mid-air

`columnFoot()` was a cone (or a scaled frustum for square columns): it shrank away from **every**
side at once, including the side welded to the wall. An exterior M3 column's center sits
`bossRadius - 2` proud of the wall's outer face, so a cone narrowing about its own axis ends as a
stub floating clear of the wall — the "tapering into empty space" in the report. The interior
hanging column had the same defect, just smaller (0.6mm of overlap to lose).

The foot is now **one-sided per wall**: the column prism below the seam, intersected with a plane
per wall that climbs at 45° along the direction the material has to retreat in. That keeps the
wall side of the column full-section and eats only the free side, so the slope actually lands on
the wall. The run is no longer an arbitrary 5mm cap — it is `halfExtent + back`, exactly the drop
that buries the taper in the wall plane, and a corner column intersects both of its walls' planes
so it tapers into the corner. `FootWalls` (interior/exterior box walls, or a cylinder radius) is
passed down from `applyScrewBossLid`/`applyScrewBossLidCylinder`, which are the only places that
know where the walls are.

One gotcha worth keeping: the slope plane starts `FOOT_SLOPE_CLEARANCE` (0.05mm) outboard of the
column's widest point. Grazing a cylinder exactly along its own tangent line produces a knife edge
of zero width, and that comes back out of the CSG as a non-manifold sliver — caught by a
throwaway 232-variation watertightness sweep (placement × shape × screw size × boss count ×
column height × body shape) run while developing this. The sweep itself is not in the suite — it
takes longer than the whole of the rest of it — but the exterior-hanging-column case it caught is.

### Verification

- 129 vitest tests passing (was 125). Two of the old column-foot assertions encoded the *buggy*
  cone behaviour and were rewritten to assert the fixed one: the foot keeps its corner as it
  descends and gives up the free side. New regressions: a back-wall ear bracing upward, all four
  vertical faces keeping the base's bounding box on the bed (`min z >= 0`), an exterior column's
  foot still touching the wall near its tip, and exterior hanging columns staying watertight.
- Playwright on the CM4 preset with the reported settings (exterior columns, 20.5mm column
  height): before/after pairs from a below-the-floor camera show the back tabs' wedges disappear
  from under the bed, and a low three-quarter view shows the column foot meeting the wall instead
  of ending in a floating point. No console errors; `npm run lint` and `npm run build` clean.

## Next steps (suggested order)

All phases in DESIGN.md §13 (0 through 5) are implemented and verified, plus the 2026-07-12
improvements above (lid view modes + interior placement, vent/custom-hole/dshape/size overrides,
board mounts). Remaining ideas, roughly by value for radio projects:

- Text embossing/engraving (project name, port labels next to cutouts) — needs a font→polygon
  path (e.g. opentype.js) feeding a Manifold extrude.
- Case-mounting features: pole/mast clamp bosses (still nothing anywhere in the app); zip-tie
  anchors. Keyhole wall hangers, external flange tabs and corner ears landed 2026-08-11 as the
  `external-mount` feature; cable glands (PG7/PG9/PG11) landed as library entries 2026-07-20.
- Panels: no per-panel thickness/groove/lip override yet (one `PanelSpec` covers every selected
  face), and a panel can't yet be split by the lid seam — a face is either a plate up to the split
  or it isn't. Retention is a plain rebated lip (2026-08-11); a detented or latching plate that
  clicks home, rather than one held by the lid, is the obvious next step if plates ever need to
  come out without opening the case.
- Fans: no finger-guard-only mode (grille without screw holes) and no rectangular blower support.
  The fan's body *is* now drawn as a ghost (2026-08-11), so clearance under it can be judged by eye.
- Design checks cover support pads only so far (see the 2026-08-11 section). The obvious next rules,
  all wanted by DESIGN.md's own list: two features overlapping on the same face, a cutout straddling
  the lid seam, a wall thinner than two perimeters, a connector taller than the interior.
- Battery features: 18650 holder pocket, LiPo tray with strap slots.
- Printability: chamfered hole edges, thin-wall/feature-collision warnings, snap-fit wedge
  profile upgrade (see Phase 5 notes), 3MF export alongside STL.
- Smaller UI gaps: drag-to-reposition snapping still doesn't snap across faces or across a
  cylinder's u=0/u=1 wrap; ghost boards could render their hole positions; a top-down 2D floor
  view would make dense board layouts easier to edit than the 3D view.

### Captured sidebar/inspector ideas (2026-07-20, agreed with repo owner — each its own PR)

- **Body card**: chamfered top edges / lid-side corner treatment for printability (CSG work —
  needs watertightness verification across the corner-style × lid-type matrix).
- **Lid & Fasteners card**: the snap-fit wedge profile upgrade already flagged in the Phase 5
  notes (replace the plain sphere nub/pocket with a lead-in ramp + catching ledge).
- **Feature Layers card**: true multi-select (the 2026-07-20 bulk Hide/Lock-all buttons cover the
  all-or-nothing case; multi-select needs the selection model to become a set, rippling through
  `App`/`Viewport3D`/`InspectorPanel`).

### Complete-preset-designs roadmap (2026-07-20, agreed with repo owner — closed 2026-07-21, see session log)

All four items below (issue #10) are now done — see the 2026-07-21 session log entry for
implementation notes. Kept here as a historical record of the original plan:

1. ~~**Pi 3B + Pi 5 IO layouts**~~ — done.
2. ~~**Promote the palette-only mounts to full enclosure presets**: Pi Pico, Arduino Uno R3,
   Arduino Mega 2560, Adafruit Feather.~~ — done.
3. ~~**New boards with officially documented mechanicals**: Jetson Orin Nano dev kit, BeagleBone
   Black, Raspberry Pi CM4 IO Board.~~ — done.
4. ~~Non-board "sealed outdoor node" starter preset (gasket on, PG9 gland, SMA bulkhead).~~ —
   done, minus pole/mast mounting clamps (still not implemented anywhere in the app — see "Next
   steps" below, unchanged).

Boards WITHOUT reliable published mounting/port drawings (generic ESP32 DevKits, Heltec V3,
T-Beam, XIAO/RTL-SDR which lack mounting holes) stay dimension-only on purpose — the generic
board-mount + hand-placed cutouts serve those better than shipped-wrong holes would.

Also still open from earlier phases, not blocking: the ~845KB main bundle (see below), and the
never-verified Docker build.

## Complete preset designs (2026-07-21 session, issue #10)

- **`buildPresetFeatures` and `BoardPresetBody` no longer require a `boardMount` to place `io`
  cutouts or enable a gasket.** Previously a preset's IO ports were always positioned relative to
  a board's top surface (`boardTopZ = wallThickness + standoff.height + boardThickness`); a
  board-less preset now measures the same `aboveBoardMm` field from the interior floor instead
  (`boardTopZ = wallThickness`). This is what makes the sealed outdoor node (no board at all) and
  the Jetson Orin Nano devkit (a real board, but an unconfirmed hole pattern — see below) possible
  without inventing new plumbing. `presetFeatures.test.ts` tracks the allowlist of presets
  expected to use this path (`sealed-outdoor-node`, `jetson-orin-nano-devkit`) so a future preset
  that's missing a `boardMount` by mistake still fails loudly.
- **Pi 3B and Pi 5 got real IO layouts**, sourced from the official mechanical drawings, not
  guessed. Two non-obvious findings the drawings themselves surfaced: the 3B/5 put Ethernet
  nearest the front edge with the USB stacks farther back — the *opposite* front-to-back order
  from the 4B — and the Pi 5 removed the 3.5mm audio jack entirely (no audio cutout in its io
  list). All three Pi-full-size presets (3B, 5, HAT stack) needed `splitHeight` bumped to 24mm to
  clear the USB dual-stack cutouts, matching the 4B's existing margin. The HAT stack preset
  inherits the 4B's IO layout per the original plan; its notes flag that stacking on a 3B/5 needs
  a different port list swapped in by hand.
- **Pico, Arduino Uno R3, Arduino Mega 2560, and Adafruit Feather** were promoted from
  palette-only mounts (`presets/boardMounts.ts`) to full `BOARD_PRESETS` entries with IO. Their
  mount specs were extracted into named consts (`PICO_MOUNT`, `ARDUINO_UNO_MOUNT`, etc.) so the
  palette entries and the new enclosure presets share one source of truth, same precedent as the
  existing Pi mounts. Port positions came from Arduino's own Eagle CAD board files (cross-checked
  against the datasheet drawings, not assumed identical between Uno and Mega even though they
  turned out to match) and the Pico's official datasheet mechanical drawing. Connector heights
  above the board follow the half-cutout-height convention already implicit in the Pi presets
  (a connector's centerline sits at roughly half its own cutout height above the board, assuming
  a flush-mounted shell) — made explicit here since there was no existing precedent value to reuse
  for USB-B/DC-barrel/micro-USB in this context.
- **Three new board presets** with officially documented mechanicals, each ships without guessing
  anything the source didn't dimension:
  - **BeagleBone Black** (86.4×54.6mm, non-corner-symmetric M3 pattern) — sourced from
    BeagleBoard.org's official SRM drawing and assembly/placement data. Flags a real discrepancy
    in BeagleBoard's own docs (prose says 53.34mm wide, the dimensioned drawing's own
    mounting-hole symmetry only checks out at 54.61mm) rather than silently picking one. Needed a
    new `usb-mini-b` connector library entry — BBB uses Mini-USB, not the Micro-USB every other
    preset in this library uses.
  - **Raspberry Pi CM4 IO Board** (160×90mm, 7-hole pattern: 3 primary + 4 HAT-compatible) —
    sourced from the official datasheet's mechanical drawing via pixel measurement against its own
    printed dimension callouts. Explicitly does NOT model the PCIe x1 socket, which mounts
    perpendicular to the board (like a desktop slot) and needs internal height clearance rather
    than a wall cutout — flagged in the preset's notes as a manual follow-up, not silently
    dropped.
  - **NVIDIA Jetson Orin Nano Developer Kit** (100×79mm carrier, sized for the 34.77mm module +
    heatsink/fan stack) — port centerlines came from NVIDIA's official CAD reference-design
    package (Allegro placement export), which is more precise than the datasheet's undimensioned
    drawing. **Ships without a `boardMount`**: NVIDIA's public docs don't dimension mounting-hole
    positions, and the official CAD package didn't yield a confidently-verified pattern, so per
    the "don't guess hole positions" rule this stays dimension + IO only. Needed a new
    `displayport-panel` connector entry (generic VESA envelope, no prior entry existed).
- **Sealed outdoor node** starter preset: no board at all, gasket channel on by default, one SMA
  bulkhead (antenna) and one PG9 cable gland (sealed cable entry) cutout. Does not attempt a
  pole/mast mounting clamp — that feature doesn't exist anywhere in the app yet (still on the
  "Next steps" list above), so the preset's notes say so rather than pretending it's covered.
- All 17 board presets (was 11 at session start) are covered by `presetFeatures.test.ts`: every
  `io` connectorId resolves in the library, every board-less `io` preset is on the explicit
  allowlist above, every cutout's full extent (not just its centerline) clears the floor and lid
  split, and every preset with a `boardMount` or `io` generates watertight base+lid meshes at
  export quality (43 tests passing, up from 35).
- Verified end-to-end with Playwright against the dev server: applied all 11 new/changed presets
  and screenshotted each (default angle, plus a closer orbited/zoomed pass on 6 of them) —
  confirmed cutouts land on the expected face in the expected left-to-right order with plausible
  relative sizes (e.g. Jetson's front edge reads DC-jack/DisplayPort/USB-A/USB-A/Ethernet/USB-C
  left to right exactly matching its sourced centerlines; BeagleBone and the Arduino boards
  correctly show a *blank* front face since their real ports sit on the short edge, not the GPIO
  edge). Zero console errors across all 11 preset applications. `tsc -b`, `oxlint`, `npm run test`
  (43 passing), and `npm run build` all clean.

## Session log

- **2026-07-01**: Phase 0 + Phase 1 implemented and verified (scaffold, CSG worker pipeline,
  viewport, lid system, zipped STL export, Docker deploy config). Opened PR #1. Repo restructured
  into `frontend/` + this tracking doc and `DESIGN.md` added at the request of the repo owner.
- **2026-07-01**: Added `AGENTS.md`/`CLAUDE.md` (repo structure, coding conventions, workflow
  rules — codifying patterns already established in Phase 0/1 rather than introducing new ones).
  Implemented and verified Phase 2 (connector/feature library, click-to-place, cutout + standoff
  generation) — see the Phase 2 implementation notes above for the scope decisions and what's
  intentionally deferred. Opened PR #2 (draft) on top of the merged PR #1.
- **2026-07-01**: Implemented and verified Phase 3 (direct manipulation: corner/height resize
  handles, hover face highlighting, click-to-select + inspector editing of placed features,
  drag-to-reposition with snapping) on the same branch/PR #2. Caught and fixed one real bug during
  Playwright verification — see the Phase 3 implementation notes above for the infinite-plane
  raycasting issue with feature dragging.
- **2026-07-01**: Implemented and verified Phase 4 (board presets, save/load project JSON,
  localStorage autosave, mm/in units toggle, undo/redo) on the same branch/PR #2. Caught and fixed
  one real bug during verification — see the Phase 4 implementation notes above for the
  history-debounce issue that could split a single drag into multiple undo steps.
- **2026-07-01**: Implemented and verified all four Phase 5 stretch items on a new branch/PR:
  cylindrical body shape (new `EnclosureBody` discriminated union, `'side'` face, shape-aware
  `faceFrame`/viewport handles/hover-highlight/raycasting), snap-fit lid (cantilever tab + nub/
  pocket, both shapes), gasket channel (optional `LidSpec.gasket`, independent of lid type), and
  BOM/screw list export (`bom.csv` bundled into the export zip). See the Phase 5 implementation
  notes above for the architecture decisions (why box/cylinder lid mating is written twice rather
  than genericized) and what's intentionally simplified (snap-fit's plain-sphere nub instead of an
  engineered wedge profile). No regressions found in the existing box-only code paths.
- **2026-07-02**: Grew the connector library (HDMI full/mini/micro, Ethernet RJ45, Micro-USB,
  USB-B, 3.5mm TRS audio jack, IEC C14 power inlet) and board preset list (Seeed XIAO, Raspberry Pi
  3B/4B, Raspberry Pi 5, Pi + HAT stack) per user request — see the new section above this log.
  Purely additive to existing data-driven UI (three new connector categories added to the type and
  to `FeaturePalette.tsx`), no architecture changes. Verified with Playwright.
- **2026-07-12**: Three improvement chunks per user request ("separate the lid from the body, add
  objects on the inside, draw custom objects for board layouts") — see the "Post-Phase-5
  improvements" section above. (1) Lid view modes (assembled/ghost/hidden/exploded) with
  interior-surface click remapping so standoffs place from a top-down view; new `csg/lidSplit.ts`
  shared helper. (2) Implemented the dead `vent`/`custom-hole` feature types, real `dshape`
  geometry + a toggle-switch entry, and per-placement `connectorOverride` sizes; fixed a latent
  90°-rotation bug for rect cutouts on left/right/side faces. (3) New `board-mount` feature
  (PCB outline + hole pattern → standoffs, ghost-board preview) with the official Raspberry Pi
  hole patterns wired into the four Pi presets. Each chunk verified with Playwright before its
  commit; exported STLs re-checked watertight throughout.

- **2026-07-18**: Added align/mirror controls to the selected-feature inspector (Align
  Start/Center/End per axis, Mirror-to-duplicate per axis, with a hover/focus preview ghost marker
  in the viewport) — see the "Align/mirror inspector controls" section above for the design
  rationale (why Mirror duplicates instead of moving) and what was verified. Purely additive: new
  `state/alignMirror.ts` module, new props threaded through `App`/`InspectorPanel`/`Viewport3D`, no
  changes to the data model or CSG pipeline.

- **2026-07-20**: Fixed top height indicator handle orientation in `Viewport3D.tsx`. Rotated the `ConeGeometry` mesh by 90° around X axis (`Math.PI / 2`) so it points upward (+Z direction) along the enclosure's height axis instead of horizontally (+Y direction).
- **2026-07-20**: Fixed shading artifact ("weird channels"/shadow lines) around screw clearance holes by replacing unconstrained `computeVertexNormals()` in `csg/meshToBufferGeometry.ts` with `toCreasedNormals(geometry, Math.PI / 6)` (30° threshold). Prevents smooth-shading normal averaging across $90^\circ$ sharp edges (e.g., between the flat lid top face and inner vertical hole walls).
- **2026-07-20**: Redesigned `BoardPresetPicker` modal from a narrow 1-column list into a responsive multi-column CSS grid (`max-width: 760px`, 2-column cards) in `App.css` and `BoardPresetPicker.tsx` to display all board presets cleanly without excessive vertical scrolling.
- **2026-07-20**: Fixed side face hover highlights in `Viewport3D.tsx`: (1) Fixed rotation matrix for `left` (`[Math.PI / 2, 0, -Math.PI / 2]`) and `right` (`[Math.PI / 2, 0, Math.PI / 2]`) faces, eliminating rotated vertical monolith highlights. (2) Added hit-aware height and $Z$-positioning for exploded lid view, so hovering over the base or exploded lid highlights only the corresponding sub-face without spanning empty air.
- **2026-07-20**: Redesigned `FeaturePalette` in `FeaturePalette.tsx` and `App.css` into a rich CAD component library: (1) Instant search bar filtering by name, notes, or dimensions. (2) Filter category tabs (`All`, `Mounting`, `Openings`, `USB`, `RF`, `Video`, etc.). (3) Category SVG icons, shape/dimension badges (e.g., `9×3.5mm`, `Ø 6.5mm`), and pre-placement guidance status bar.
- **2026-07-20**: Redesigned right-hand `InspectorPanel` in `InspectorPanel.tsx` and `App.css`: (1) Grouped settings into 5 collapsible card containers with section icons (`Body`, `Corners`, `Lid & Fasteners`, `Placed Features`, `Feature Inspector`). (2) Implemented 2-column field grids (`FieldsGrid2Col`) for paired dimensions (Length × Width, Height × Wall Thickness, Split Height × Clearance), eliminating endless vertical scrolling. (3) Formatted mounting holes into clean inline `[ #1 ] [ X ] [ Y ] [ Delete ]` row cards. (4) Rendered placed features as interactive cards with type icons, face location badges, and selection states.
- **2026-07-20**: Adjusted scrollbar positioning in `App.css` for `FeaturePalette`: set outer container padding to `12px 0 12px 12px` and `.palette-content` padding to `padding-right: 12px` with custom 6px translucent scrollbar styling so the scrollbar hugs the far outer panel edge with a clean 12px whitespace gap separating it from component cards.
- **2026-07-20**: Expanded Feature Property Inspector in `InspectorPanel.tsx` & fixed 3D handle alignment in `Viewport3D.tsx`: (1) Added `Target Face` select dropdown, numerical `U` and `V` ratio inputs (0-1), and millimeter offset fields from center (`U Center Offset`, `V Center Offset`) plus a `+ Duplicate` button. (2) Positioned corner handles and height cone handle at `splitHeight` (top rim of base wall) when `lidView === 'hidden'` instead of floating in mid-air. (3) Positioned internal feature markers (`standoff` & `board-mount`) inside the box at the standoff top (`z = wallThickness + standoffHeight + 1.2`) instead of underneath the outer bottom floor.
- **2026-07-20**: Added 3D Viewport Orientation Gizmo & Photoshop-Style Feature Layers Panel with 3D Drag Gating: (1) Added `AxesHelper(40)` triad & viewport legend overlay in `Viewport3D.tsx` & `App.css` identifying **X (Red / Length)**, **Y (Green / Width)**, and **Z (Blue / Height)** axes. (2) Extended `Feature` in `types/project.ts` with `hidden?: boolean` and `locked?: boolean` flags. (3) Reworked Placed Features into a Feature Layers Panel in `InspectorPanel.tsx` with 👁️ (Hide/Show), 🔒 (Lock drag), 📋 (Duplicate), and 🗑️ (Delete) controls. (4) Excluded hidden features from `generateEnclosure.ts` CSG generation & 3D preview, and gated 3D drag gestures on locked features in `Viewport3D.tsx`.
- **2026-07-20**: Implemented Inspector Scrolling, Sidebar Lid View & 3D Handle Toggles, Locked Marker Hiding, and Side Highlight Alignment: (1) Omitted 3D move marker ball for locked features (`feature.locked === true`) in `Viewport3D.tsx`. (2) Added `Viewport & Lid View` card section in `InspectorPanel.tsx` with Lid View segment buttons and a `Show 3D Resize Handles` toggle. (3) Applied `max-height: 100vh`, `overflow-y: auto`, and `padding-bottom: 60px` in `App.css` so no inspector fields get cut off at the bottom. (4) Applied `polygonOffset: true` (`depthWrite: false`) to `highlightMaterial` so side face highlights sit flush against the outer wall surface.
- **2026-07-20**: Fixed Sidebar Overflow & Card Height Clipping in `App.css`: (1) Removed `overflow: hidden` from `.inspector-card` and set `overflow: visible` on `.inspector-card` and `.card-body` so section cards expand dynamically to fit 100% of their content without truncating inputs or labels. (2) Updated `.inspector-panel` to `height: 100%; overflow-y: auto; padding: 10px 0 30px 10px;` and added `margin-right: 10px` on `.inspector-card` so the outer scrollbar sits cleanly on the far right window edge.
- **2026-07-20**: Replaced All Emojis with Clean Vector SVG Icons in `InspectorPanel.tsx` & `App.css`: (1) Added `<SidebarSectionIcon type="..." />` with 6 vector SVG section icons (`viewport`, `body`, `corners`, `fasteners`, `layers`, `inspector`) matching CAD palette styling. (2) Replaced Feature Layers action button emojis with vector SVG icons (`SvgEyeIcon`, `SvgEyeOffIcon`, `SvgLockIcon`, `SvgUnlockIcon`, `SvgCopyIcon`, `SvgTrashIcon`).
- **2026-07-20**: Added a camera-synced orientation gizmo + condensed the inspector sidebar: (1) New always-visible XYZ orientation gizmo in the lower-right corner of the viewport (`Viewport3D.tsx`) — a second scene (arrow triad + axis-letter sprites + dim negative stubs over a translucent disc backdrop) rendered by the same renderer into a scissored 104px viewport each frame, with an ortho camera that copies the main camera's direction relative to the orbit target so it tracks orbiting but ignores panning. Axis colors match the top-right legend badge. The in-scene `AxesHelper` at the grid corner is kept for on-plane reference. (2) Sidebar reorder in `InspectorPanel.tsx` per user request: `Lid & Fasteners` now sits directly under the view card, which was renamed `Viewport & Lid View` → `View` (it holds only view-only settings; the old name collided confusingly with `Lid & Fasteners` once they became neighbors). (3) The standalone `Corners` card was merged into `Body` as a "Corner Style" subgroup (corner style is a body property; one fewer top-level card). Card order is now View → Lid & Fasteners → Body → Feature Layers → Inspector. Verified with Playwright: gizmo renders and visibly rotates when orbiting (screenshot-compared), card order/merge confirmed in the DOM, Corner Style correctly disappears for a cylinder body, lid view buttons still work, no console errors.

- **2026-07-20**: Follow-up to the gizmo/sidebar PR (#8), per user request: (1) **XYZ legend moved
  into the lower-right orientation cluster** — `.viewport-orientation-badge` now docks just above
  the gizmo instead of the opposite (top-right) corner, so all orientation info lives in one place;
  kept (not deleted) because it's the only element mapping axes to dimension names (X=Length etc.).
  (2) **Placeable board-mount presets in the palette**: new "Boards" group with 6 entries
  (Pi 3B/4B/5, Pi Zero, Pi Pico, Arduino Uno R3, Arduino Mega 2560, Adafruit Feather) that place a
  board-mount with the board's documented outline + hole pattern. Data lives in a new
  `presets/boardMounts.ts`; the Pi mounts previously private to `presets/boards.ts` moved there and
  are imported back, so enclosure presets and palette presets share one source of truth. The
  armed template gained an optional `boardPresetId`, resolved in `featureFactory` with a
  `structuredClone` so placements never alias library objects. Arduino/Feather/Pico patterns are
  from the official board drawings/datasheets — same "verify before printing" disclaimer as ever.
  (3) **View card toggles** for grid + floor axes (one `gridGroup` in `Viewport3D`), ghost boards,
  and feature markers — view-only App state like `lidView`; hidden markers are also excluded from
  the pointer raycast (three doesn't skip invisible meshes) so they can't be click-selected.
  (4) **Feature Layers bulk actions**: Hide/Show all and Lock/Unlock all buttons above the layer
  list (loop over `updateFeature`; the store's history debounce coalesces it into one undo step).
  (5) **PG7/PG9/PG11 cable gland** entries added to the connector library (misc). Deferred to
  future PRs (agreed with user, CSG-heavy): chamfered top edges / lid-side corner treatment,
  snap-fit wedge profile, and true multi-select in Feature Layers. Verified with Playwright:
  badge position, Boards group rendering/search/armed state, a placed Pi Zero mount carrying the
  exact 65×30 / ±29,±11.5 spec in the store, all three view toggles (screenshot-compared), bulk
  hide/lock across 2 features, gland search hits, no console errors; `lint` + `build` pass.

- **2026-07-20**: Board preset IO layouts, per user request ("click RPi 4, get a preset case at
  all the right sizes"): (1) **`BoardPreset` gained an `io` array** (`BoardIoCutout` in
  `presets/boards.ts`): wall cutouts stored board-relative (mm along the face's u axis from the
  board center; mm above the board's top surface, negative for underside ports), expanded to
  face/(u,v) features by the new `buildPresetFeatures()` in `state/featureFactory.ts`.
  `applyBoardPreset` now takes prebuilt features instead of a bare `BoardMountSpec`. (2) The
  combined "Raspberry Pi 3B/4B" preset **split into 3B (mount only) and 4B (mount + full IO)** —
  one IO layout can't serve both since the 3B's port arrangement differs; 3B/Pi 5 centerlines were
  not guessed. The **Pi 4B layout** (USB-C, 2× micro-HDMI, audio, 2× USB-A dual stacks, Ethernet,
  underside microSD) uses the official drawing's port centerlines; its `splitHeight` moved 20→24
  so the tallest opening (USB stack, tops out ~23.5mm) clears the lid seam instead of straddling
  it. The **Pi Zero preset** got its (smaller) IO layout too. Port heights-above-board are
  datasheet approximations — "verify before printing" tier. (3) New library entries:
  `usb-a-dual-stack` (13.3×15.6 stacked receptacle), `microsd-slot` (12×3). (4) New
  `test/presetFeatures.test.ts` in the vitest CSG harness: every io `connectorId` resolves, io
  implies a board mount, every opening (not just centerline) sits inside its face between floor
  and split, and every mount-carrying preset generates watertight base+lid at export quality.
  (5) That harness caught a **pre-existing false negative in `test/helpers/geometry.ts`**: the
  Pi Zero body (75×40, screw-boss M2.5, rounded corners) yields two sub-micron sliver triangles
  that the helper's own 1µm vertex quantization collapses, which it then reported as "degenerate →
  not watertight" despite zero unmatched edges (verified by dumping the edge histogram). Fix:
  raw-index degenerates still fail, but triangles collapsed only by the quantized merge are
  skipped — their neighbours' edge pairing stays balanced. Verified with Playwright: applying Pi
  4B places 9 features on the correct faces (screenshots show the real Pi 4 port order in the
  walls), Zero places 5, 3B places 1, undo restores the previous preset's features; no console
  errors; `lint`/`build`/`test` (35 passing) all green.

- **2026-07-20**: Two small UI polish requests. (1) **Orientation gizmo/axis-key swap**: the
  `.viewport-orientation-badge` (X/Y/Z legend) used to dock just *above* the lower-right
  orientation gizmo; moved it to dock at the viewport's bottom-right corner *below* the gizmo
  instead, per user request from a screenshot. The gizmo itself (WebGL scissor viewport in
  `Viewport3D.tsx`) shifted up via a new `GIZMO_MARGIN_BOTTOM` constant (46px, vs. the unchanged
  12px `GIZMO_MARGIN` used for the right edge) to leave room; the badge got a `line-height: 16px`
  so its rendered height is deterministic and lines up with that clearance. (2) **`BoardPresetPicker`
  tabs + widened modal**: split the "Start from a board" preset grid into two tabs — "Complete
  Boards (IO)" (presets with a populated `io` array: Pi Zero, Pi 4B) and "Case Only" (everything
  else, whether or not it has a `boardMount` — RTL-SDR/Heltec/LILYGO/XIAO have neither; Pi
  3B/5/HAT-stack have mount only). `.preset-modal` max-width went 760px → 960px. Verified with
  Playwright: both tabs render their expected preset sets, switching tabs and picking a preset
  from the non-default tab still applies body dims correctly and closes the modal, no console
  errors; `tsc -b` and `oxlint` clean.

- **2026-07-21**: Closed out the complete-preset-designs roadmap (issue #10) — see the "Complete
  preset designs" section above for full details. Pi 3B + Pi 5 got real IO layouts sourced from
  the official mechanical drawings; Pico/Arduino Uno R3/Arduino Mega 2560/Adafruit Feather were
  promoted from palette-only mounts to full presets with IO; three new board presets landed
  (BeagleBone Black, Raspberry Pi CM4 IO Board, Jetson Orin Nano Developer Kit), each sourced from
  official mechanicals and each flagging what those sources didn't give (BeagleBoard's own
  board-width discrepancy, the CM4 IO board's unmodeled PCIe socket, the Jetson's unconfirmed
  mounting holes); and a non-board "sealed outdoor node" starter preset (gasket + SMA + PG9 gland)
  went in, which needed `buildPresetFeatures`/`BoardPresetBody` generalized to support `io`
  cutouts and a gasket without a `boardMount`. Board preset count: 11 → 17. New connector library
  entries: `usb-mini-b`, `displayport-panel`. `presetFeatures.test.ts` extended to cover every new
  preset (43 tests, up from 35); Playwright-verified all 11 new/changed presets against the dev
  server (screenshots + zero console errors). `tsc -b`, `oxlint`, `npm run test`, and `npm run
  build` all clean.

- **2026-07-21 (follow-up)**: Added a real "Seeed Studio XIAO ESP32 (C3/S3/C6)" preset per user
  request, upgrading it beyond the existing dimension-only `seeed-xiao` entry. Confirmed via the
  official Seeed XIAO Series SoM User Manual and per-variant getting-started wiki pages that **no
  XIAO board of any kind has mounting holes** (the whole family plugs into shields via
  edge-castellated pins instead of screws) — this validates a precedent already assumed elsewhere
  in this file, now sourced. All three ESP32 variants share a ~21×17.8mm footprint with a USB-C
  port centered on a short edge and an external U.FL/IPEX antenna connector (position not
  officially dimensioned by Seeed, so not cut — noted as an optional manual addition). New preset
  uses the board-less `io` path (no `boardMount`, real `io`) added earlier this session for the
  Jetson preset — same rationale: a real board with a real, sourced port position, but genuinely no
  hole pattern to place. The original `seeed-xiao` entry was relabeled to drop "ESP32-C3" (now
  covers only SAMD21/RP2040/nRF52840, the non-WiFi variants) since it's superseded by the dedicated
  entry for WiFi users. Board preset count: 17 → 18. `presetFeatures.test.ts` allowlist extended;
  44 tests passing (up from 43). Playwright-verified the USB-C cutout renders on the expected face
  with the expected shape, zero console errors; `tsc -b`, `oxlint`, `npm run build` all clean.

- **2026-07-21 (follow-up 2)**: Fixed a real design bug the repo owner spotted from a screenshot:
  **every board-mount preset's lid screw bosses overlapped the board itself**, not just the outer
  walls. `bossPositions()` places corner bosses inset from the *interior cavity* corners, which
  keeps them clear of the outer wall -- but says nothing about a board-mount sitting in the middle
  of that same cavity. Since a board-mount's standoffs and the lid's screw bosses are two
  independent solids that both `.add()` onto the base and both rise from the floor, an overlapping
  boss still produces a perfectly valid (watertight) mesh -- it's a real-world assembly conflict,
  not a geometry error, so nothing in the existing test suite could have caught it.
  - Added a new `presetFeatures.test.ts` check (`bossPositions`/`bossRadiusFor` exported from
    `csg/primitives.ts` for reuse) that computes, in plain 2D, whether the *default* lid's 4
    corner bosses (screw-boss, M3, heat-set -- `state/defaultProject.ts`'s actual default, and the
    worst case of the three screw sizes) clear each boardMount preset's board rectangle by a
    minimum margin. Ran first to find the damage: **all 11 existing boardMount presets failed**,
    including Pi 4B/Zero from earlier sessions that this PR never touched -- confirming it wasn't
    specific to the boards added this session.
  - Fixed by growing each preset's `body.outer` on whichever axis (length or width) needed the
    smaller absolute increase to clear the board via that axis alone -- corner bosses are
    symmetric, so one axis clearing fully is sufficient regardless of the other axis (see the new
    doc comment on `BoardPreset.boardMount` in `presets/boards.ts`). Typical growth was
    +10 to +20mm on one dimension; the other dimension was untouched. All 11 presets now pass with
    a comfortable margin above the bare minimum, not a knife's-edge pass.
  - Added the second half of the ask -- **adjustable screw spacing**: `ScrewSpec` gained an
    optional `edgeInset` (mm from the interior wall to each boss center; undefined = the same
    `bossRadius + 1` default as before, so no behavior changes unless a user touches it).
    Threaded through `bossPositions()`/`bossPositionsCircular()` and both `applyScrewBossLid*`
    functions. New "Screw edge inset" field in the Lid & Fasteners card (`InspectorPanel.tsx`)
    shows the computed default and lets a user pull bosses toward the case's outer edge (or push
    them further in) by hand -- useful for hand-tuning clearance on a custom board-mount the app
    has no way to reason about automatically.
  - Verified with Playwright: "Hidden" lid view + ghost board on the tightest presets (Pi Zero,
    Pico) now visibly shows all 4 boss cylinders sitting outside the green board outline with real
    air gaps, versus overlapping before the fix; the new inspector field renders with the correct
    computed default (5.4mm for the default M3 heat-set screw) and no console errors.
    `presetFeatures.test.ts` now 55 passing (up from 44, +11 boss-clearance checks); `tsc -b`,
    `oxlint`, `npm run build` all clean.

- **2026-08-11**: Fixed corner-anchored wall-mount flanges that visually detached at their side
  edges when placed on a case corner. The root cause was the corner-ear geometry in
  `csg/featurePrimitives.ts`: its root was a *flat* diagonal strip, which only overlapped the case
  near the middle of the corner and could leave the ear's two side edges floating instead of
  actually reaching both walls. Fixed by replacing the corner-flange path with a dedicated
  V-shaped root profile that drives farther inward toward each wall as it moves across the ear's
  width, while leaving the nominal corner anchor itself unchanged (`csg/faceFrame.ts`). Updated the
  viewport marker path to match the restored anchor behavior. Added a regression in
  `test/generateEnclosure.test.ts` that probes the new root area on a sharp corner so the bug is
  covered by the geometry suite. Verified with `npx vitest run test/generateEnclosure.test.ts`
  (61 passing).

- **2026-08-11 (follow-up)**: Tightened the rest of the external-mount flange behavior after user
  screenshots surfaced two more geometry bugs plus a small usability request. (1) **Wall-flange
  brace direction now keys off the owning part's Z span, not the whole enclosure's world Z**:
  lid-side wall mounts used to see the space below the *assembled* box and could droop their
  gussets down toward the base when the lid itself had no room there. `generateEnclosure.ts` now
  passes the target part's actual Z span into `buildExternalMount()`, and `featurePrimitives.ts`
  picks above-vs-below reinforcement from that local span instead. (2) **Top/bottom-face flanges
  no longer join the body through a pointy, floating-looking center support**: those faces now use
  full-width reinforcement webs across the tab instead of the side-wall/end-web pattern, so the
  slope visibly meets the lid/base across the tab width. (3) **External flange tabs now support an
  optional edge radius** (`ExternalMountSpec.edgeRadius`), exposed in the inspector and given a
  1.5mm default for new flange placements; implemented by switching the flat tab body from a plain
  cube to a rounded-rectangle cross-section before extrusion. Added three regressions in
  `test/generateEnclosure.test.ts` for rounded-edge flanges, lid-side gusset direction, and
  full-width top-face reinforcement. Verified with `npx vitest run test/generateEnclosure.test.ts`
  (64 passing), plus `npm run lint` and `npm run build`.

<!-- When you pick this up: append a new dated entry above summarizing what changed, rather than
editing old entries, so this stays a readable history. -->

- **2026-08-11**: Multi-part enclosures, per user request (a contributed CadQuery design for the
  Waveshare CM4-DUAL-ETH-WIFI6-BASE, plus "add features to support designing cases like this") —
  see the "Multi-part enclosures" section above for the full rationale. (1) The CSG pipeline now
  returns a list of parts instead of a base/lid pair, with `csg/parts.ts` owning which piece each
  feature belongs to. (2) New `BoxBody.panels`: any wall can be printed as a slide-in plate, with
  cutouts on that face routed into the plate. (3) New `external-mount` feature (wall-mount flange
  ears with round/slot/keyhole holes, and external bosses). (4) New `ScrewSpec.placement:
  'exterior'` for cases whose board leaves no floor for interior corner bosses. (5) The Waveshare
  CM4 preset itself, with the preset plumbing (vents/mounts/overrides/top-face placement/panels)
  it needed. Two real geometry bugs caught during verification: a non-manifold corner post where
  two panels meet on a rounded corner, and a non-manifold pinch when a shallow lid's capture groove
  cuts past its own ceiling. 73 tests passing (was 43); browser-verified end to end.

- **2026-08-11**: Follow-up round per user request (fan support "40mm, 30mm and 20mm are pretty
  standard", the script's circular grille, corner-mountable flanges, and screw column variations
  "shape, screw size length and the option to also conceal them" plus internal columns that don't
  run floor-to-lid) — see the "Fans, corner mounts, screw column variations" section above.
  (1) New `fan-mount` feature with a ten-size library and the source design's concentric ring
  grille, honeycomb and open alternatives, plus optional inner mounting bosses; the CM4 preset now
  uses it. (2) `ExternalMountSpec.anchor: 'corner'` for diagonal corner ears that weld into both
  walls, with a one-click "put one on each corner". (3) `ScrewSpec` gained column shape, M4,
  explicit column height (hanging columns that leave the floor clear) and counterbored/concealed
  heads; the BOM now derives the screw length. Three geometry bugs caught by the new probe-based
  tests, each of which produced watertight-but-wrong geometry: a spoke-filled fan hub, bosses
  measured from the wrong face, and a counterbore cutting through the lid into the cavity.
  89 tests passing (was 73); browser-verified end to end.

- **2026-08-11**: Closed the two follow-ups flagged at the end of the previous round, per user
  request — see the "Support pads + ghost fan bodies" section above. (1) New `support-pad` feature:
  a blind floor pillar (no screw hole) for propping an unsupported/cantilevered board edge, with
  the CM4 source design's four bands added to that preset. (2) `FanMountSpec.bodyDepth` plus a
  translucent ghost of the fan's body inside the case, so clearance to a HAT or heatsink under it
  is visible; the "Show Ghost Boards" toggle became "Show Ghost Parts" and now covers both ghosts.
  93 tests passing (was 89); browser-verified, including that a pad click on a wall is ignored the
  same way a standoff's is.

- **2026-08-11**: Follow-up on the two gaps the support-pad round left, per user request ("what can
  we do about the no pad every nmm or checker?") — see the "Pad rows + design checks" section
  above. (1) `SupportPadSpec` gained count/pitch/axis so one feature emits a row, with
  `supportPadPositions()` in `faceFrame.ts` as the shared source of truth for where the pillars
  are; plus `state/boardSupport.ts`'s `planOverhangSupport()` behind a "Prop up the <edge> edge"
  button on the board-mount inspector, which finds the cantilevered edge from the hole pattern an- **2026-08-11**: Two fixes from the repo owner's review of the merged PR #13 — see the "Panel
  retention + mount blending" section above. (1) Slide-in plates genuinely had nothing holding
  them in: the channel was cut to the walls' outer surface and the plate sat flush, so it could be
  pulled straight back out. New `PanelSpec.retainLip` (default 1mm) leaves each adjacent wall
  standing proud at the plate's ends and rebates the plate to slide behind it, with a design-check
  rule for plates too thin to hold a lip. Caught and pinned by a sweep test — watertightness
  cannot see this class of defect. (2) External mounts met the wall at a hard 90°; new
  `ExternalMountSpec.gusset` adds triangular webs at a flange's two ends (middle left clear for a
  driver) or a conical collar on a boss, on whichever side has room. Plus `columnFoot()`, giving a
  hanging screw column the 45° sloped foot the owner sketched in green instead of a flat face in
  mid-air. 121 tests passing (was 112); browser-verified with the gusset off and on.

- **2026-08-12**: Two wall-mount geometry bugs from the previous round, reported with screenshots
  of the CM4 preset — see the "Wall-mount alignment fixes" section above. (1) **Flange braces
  pointed the wrong way on the back and left walls**: the face path negates the brace side to
  compensate for its rotations, but that compensation is only correct on front/right/side —
  `orientOutward()` rotates back/left the opposite way, so a tab sitting level with the tray floor
  braced *downward*, below the print bed. New `naturalZAlongFace()` keeps the per-face sign in one
  place. (2) **A hanging column's sloped foot tapered to a point in mid-air**: it was a cone
  shrinking away from every side at once, including the side welded to the wall, so it ended as a
  stub floating clear of it. The foot is now one-sided per wall — the column prism cut by a 45°
  plane per wall, run out to exactly the drop that buries it in the wall plane, both walls at a
  corner. Non-obvious detail: the cut plane has to start a hair outboard of the column's widest
  point, or the tangency produces a non-manifold sliver (found with a 232-variation watertightness
  sweep). 129 tests passing (was 125), including two old assertions rewritten because they pinned
  the buggy cone; browser-verified with before/after screenshots from under the floor plane.

- **2026-08-12**: High-polygon dynamic rendering & portable radio enclosure features:
  - Added `TessellationSpec` (`liveSegments` 16-128, `exportSegments` 32-256) passing directly into `manifold-3d` circular segment generator.
  - Implemented 3D rim edge chamfers (`topEdgeBevel`, `bottomEdgeBevel`) for 45° subtraction along top and bottom enclosure perimeters.
  - Added faceted octagonal (`faceted`) and double chamfer (`double-chamfer`) corner styles.
  - Added Viewport Shading Studio (CAD edge outlines, smooth vs flat/faceted shading, and 5 PBR material themes).
  - Added `grip-ribs` tactile side-wall feature.
  - 130 vitest tests passing (was 121); oxlint clean; `npm run build` verified.

- **2026-08-12**: Inspector UI/UX Restructuring & Floating Viewport Toolbar:
  - Floating 3D Viewport Toolbar (`ViewportToolbar.tsx`) containing glassmorphic controls for Lid Presentation (`Assembled`, `Ghost`, `Hidden`, `Exploded`) and quick display chips (`Outlines`, `Grid`, `Handles`, `Ghosts`, `Markers`).
  - Restructured Inspector Panel (`InspectorPanel.tsx`) into 3 top segmented tabs: `Structure`, `Layers`, `Studio`.
  - Added real-time feature search bar and face-grouped accordions (`BOTTOM`, `FRONT`, `BACK`, `LEFT`, `RIGHT`, `TOP`) in the `Layers` tab.
  - Focused feature header drawer with cyan border and `✕ Done` button pinned at top when editing a feature.
  - 130 vitest tests passing; oxlint clean (0 errors); `npm run build` verified.

- **2026-08-12**: Top Taskbar Relocation, Vector SVG Icon Conversion & 7 Advanced UX Features:
  - Relocated Viewport Controls directly into top header taskbar (`AppShell.tsx`), removing floating viewport overlay.
  - Complete project-wide emoji removal: substituted all emojis with vector SVG icons.
  - Implemented 2D Face Blueprint Editor (`BlueprintModal.tsx` & `blueprint2d.ts`) with orthogonal SVG CAD canvas and face tabs.
  - Implemented CAD Smart Snap Alignment (`computeSmartSnap` in `blueprint2d.ts`) with cyan guidelines and snap distance thresholds.
  - Implemented 3D Digital Caliper (`CaliperTool.tsx`) for live 3D point-to-point measurements and delta readout.
  - Implemented Quick Command Palette (`CommandPalette.tsx`) triggered via `Ctrl+K` / `Cmd+K` for searching connectors, features, and board presets.
  - Implemented 3D Exploded View with smooth offsets for lid, slide-in panels, and body parts.
  - Implemented Live 3D Printability & Hardware BOM Dashboard (`PrintabilityCard.tsx` & `printability.ts`) calculating shell volume ($\text{cm}^3$), estimated PLA weight (g), print time (hrs), hardware fastener list, and overhang bridging warnings.
  - 130 vitest tests passing; oxlint clean (0 errors); `npm run build` verified (1.02s).

- **2026-08-12**: 3D Caliper Surface Point Picking & 2D Blueprint CAD Drawing Enhancements:
  - Implemented 3D surface point-to-point raycast picking for the Digital Caliper Tool in `Viewport3D.tsx`: calculates 3D Euclidean distance $d$ and deltas $\Delta X, \Delta Y, \Delta Z$ and renders a 3D yellow line with endpoint spheres.
  - Upgraded 2D Face Blueprint Editor (`BlueprintModal.tsx`):
    - Sub-feature CAD geometry rendering: renders actual slot arrays for vents (`slots`/`honeycomb`), screw holes/tabs for external mounts, connector cutout shapes (USB/HDMI/RF), standoff rings, and fan bolt circle patterns.
    - Added Lid Seam Line (`splitHeight`) overlay in magenta (`#ff007f`) on lateral faces (`front`, `back`, `left`, `right`).
    - Added CAD Engineering Callout dimension lines ($X, Y$ distances in amber `#ffc107` with extension lines) for selected/dragged features.
  - 130 vitest tests passing; oxlint clean (0 errors); `npm run build` verified (876ms).

- **2026-08-12**: PrintabilityCard Elevation & Slide-in Panel Selector Spacing:
  - Elevated `3D Printability & BOM` section card to the 1st top position in the `Structure` tab in `InspectorPanel.tsx` (above `Body Dimensions`).
  - Added clean spacing (`margin-top`, `margin-bottom`, `gap`) to the Slide-in Panels face selector (`Front`, `Back`, `Left`, `Right`).
  - 130 vitest tests passing; oxlint clean (0 errors); `npm run build` verified (2.61s).

- **2026-08-13**: Screw Boss Column Foot Taper Fix & Custom Angle Controls:
  - Integrated `FootWalls` one-sided wall plane cuts (`primitives.ts`) with custom angle controls so foot renders cleanly as a wall-facing bracket slope on non-full-height columns.
  - Added `footEnabled` (checkbox: `Sloped foot (towards wall)`) and `footAngleDeg` to `ScrewSpec` in `types/project.ts`, `state/projectStore.ts`, and `InspectorPanel.tsx`.
  - Upgraded foot angle controls to clean, deterministic CAD presets: `40° (Gentle slope)`, `45° (Standard 1:1)`, and `50° (Steep slope)`.
  - Expanded `ScrewColumnShape` with 3 new industrial CAD mounting profiles: `Hexagonal` (`hex`), `Octagonal` (`octagon`), and `Rounded Square` (`rounded-square`).
  - 134 vitest tests passing; oxlint clean (0 errors); `npm run build` verified.

- **2026-08-13**: 4 New Parametric Body Shapes (`Hexagon`, `Octagon`, `Stadium`, `Wedge` / Desktop Console):
  - Added 4 new parametric body types to `BodyShape` discriminated union: `hexagon`, `octagon`, `stadium` (pill), and `wedge` (desktop console with slanted top lid).
  - Expanded `Face` type with `f1`..`f6` (for Hexagon), `f1`..`f8` (for Octagon), and `slanted-top` (for Wedge).
  - Implemented 2D offset shell primitives (`hexagonShell`, `octagonShell`, `stadiumShell`, `wedgeShell`) and polygon boss positioning functions (`hexagonBossPositions`, `octagonBossPositions`, `stadiumBossPositions`) in `csg/primitives.ts`.
  - Corrected plane normal in `wedgeShell` (`-dz / len`) so the wedge sits flat on the ground plane (Z=0) with the slanted surface at the top console face.
  - Implemented 3D face frame mapping (`toWorld`, `normalAt`, `faceSize`, `faceFromWorld`, `closestFace`) in `csg/faceFrame.ts` for all 6 enclosure body shapes.
  - Wired full CSG shell extrusion and inner cavity hollowing in `csg/generateEnclosure.ts`.
  - Updated UI dimension inputs and shape selection controls in `InspectorPanel.tsx`, `Viewport3D.tsx`, `printability.ts`, `boardSupport.ts`, `bom.ts`, and `lidSplit.ts`.
  - 134 vitest unit tests passing; oxlint clean (0 errors); `npm run build` verified (2.03s).

- **2026-08-13**: Micro Board Preset Sizing & Friction-Lip Lid Enhancements (`Seeed Studio XIAO`, `Heltec LoRa32`, `RTL-SDR`):
  - Fixed micro-enclosure preset sizing in `presets/boards.ts` (`seeed-xiao`, `seeed-xiao-esp32`, `heltec-lora32-v3`, `rtl-sdr-dongle`):
    - Enlarged outer enclosure dimensions ($42 \times 34 \times 16 \text{ mm}$ for XIAO) to accommodate board clearance, pin headers, and wiring.
    - Set default `lidType: 'friction-lip'` for micro-controller presets to eliminate interior M3 corner screw boss overlap in small cavities.
  - Added automated unit test assertion in `test/presetFeatures.test.ts` verifying that all presets maintain $\ge 10\text{ mm}$ of clear inner cavity span between corner bosses.
  - 135 vitest unit tests passing; oxlint clean (0 errors); `npm run build` verified (618ms).

- **2026-08-13**: ESP32 Cheap Yellow Display (`CYD 2.8" ESP32-2432S028`) Board & Case Preset:
  - Added `CYD_MOUNT` ($91.5 \times 52\text{ mm}$ PCB outline, 4-corner $84.5 \times 45\text{ mm}$ pitch M3 standoff pattern) in `presets/boardMounts.ts`.
  - Added `cyd-esp32-2432s028` preset in `presets/boards.ts` complete with top lid $60 \times 46\text{ mm}$ TFT touchscreen display bezel cutout, USB-C power port, MicroSD card slot, 3.5mm audio jack opening, and rear cooling vents.
  - 137 vitest unit tests passing; oxlint clean (0 errors); `npm run build` verified (635ms).

## Release pipeline: first beta, Docker publish, GHCR (2026-08-13 session)

The app has been developed straight off `main` with no cut releases and no CI so far — this
session adds the first release/publish pipeline and cuts the first tag.

- **New `.github/workflows/docker-release.yml`**, gated entirely on pushing a `vMAJOR.MINOR.PATCH[-
  PRERELEASE]` git tag (nothing else triggers it): a `verify` job (`npm ci && lint && build &&
  test`) gates a `build-and-push` job that cross-builds `linux/amd64` + `linux/arm64` via
  `docker/setup-qemu-action` + Buildx and pushes to `ghcr.io/d3mocide/faraday`, which gates a
  `release` job that cuts a GitHub Release. `docker/metadata-action` only applies the `latest` and
  bare-`major.minor` tags to a suffix-free tag (no `latest` pointing at a beta); any `-beta` tag
  also gets the floating `beta` tag, which is what `docker-compose.yml` tracks until a real stable
  release exists.
- **Release notes come from `CHANGELOG.md`**, not hand-written per release: the `release` job
  `awk`-extracts the section between this tag's `## [x.y.z]` heading and the next one and passes it
  as the release body (`generate_release_notes: true` appends GitHub's own commit list after it).
  Verified the extraction against the new `[0.1.0-beta.1]` entry directly (correct section, no
  bleed into the next heading) before wiring it into the workflow.
- **`docker-compose.yml` now pulls the published image** (`ghcr.io/d3mocide/faraday:beta`) instead
  of building locally — this is the self-hosting path. **New `docker-compose.dev.yml`** carries the
  old `build: ./frontend` behavior forward for local development / testing Dockerfile changes.
- **Versioned `0.1.0-beta.1`**: pre-1.0 because there's no automated UI/visual-regression coverage
  yet (browser verification has been manual/Playwright-driven every session, per the entries
  above) and several library values are still flagged "verify before printing" — both real gaps for
  a 1.0 claim, not just caution. `-beta.1` because this is the first cut, full stop, not because
  anything specific is known-broken.
- **Docker build/serve verified for real** (see the updated Known-issues entry above): a docker
  daemon happened to be available in this session's sandbox, so `docker build ./frontend` +
  container run was smoke-tested directly (`index.html`, the SPA fallback route, and the
  `manifold-3d` wasm asset all returned 200) rather than left as a standing "not verified" caveat.
  `arm64` specifically could not be emulated end-to-end in this sandbox (QEMU's `binfmt_misc`
  registration didn't extend into the nested container setup here — confirmed as a sandbox
  limitation via `exec format error` on a trivial `RUN`, not a Dockerfile issue) — worth a real pull
  on arm64 hardware once the first tag publishes.
- **`AGENTS.md`'s Workflow section gained a "Cutting a release" step** (CHANGELOG entry → merge →
  tag push) and its `npm run lint && npm run build` line grew `&& npm test` — the 137-test vitest
  suite referenced throughout the log above was never actually reflected in that instruction.
- Not done in this session: the tag itself. `v0.1.0-beta.1` is documented here and in
  `CHANGELOG.md` as the plan, but cutting it (and therefore the first real GHCR publish + GitHub
  Release) is left for after this PR merges to `main`, per the repo's tag-goes-on-main convention —
  pushing a tag from a feature branch would trigger a real public package publish before review.

## Face-selector highlight fixes for the new body shapes (2026-08-14 session)

The hexagon/octagon/stadium/wedge shapes added in the 2026-08-13 "4 New Parametric Body Shapes"
session shipped `faceFrame.ts` support for their new `Face` values, but the code that *resolves* a
raycast hit into one of those faces (`closestFace`), and the viewport's hover/placement highlight,
were never extended to match — so on every shape but box/cylinder, hovering or clicking a facet
either silently mapped to the wrong facet or drew a highlight that didn't match the model at all.
Full written audit (all 13 findings, P0-P2) is in this session's chat log; this entry covers the
8 items actually fixed (audit items 1-8, the P0s and the two easy P1s among them):

- **`closestFace(normal, shape: string)` → `closestFace(normal, geom: BodyGeometry)`**
  (`csg/faceFrame.ts`): the old version only special-cased `'cylinder'`, so a raycast hit on a
  hexagon/octagon facet fell through to the six box-face normals and (via `faceFrame`'s
  then-unclamped `indexOf` fallback) always resolved to facet `f1` — every side click and hover on
  a polygon body landed on facet 1 regardless of where you actually clicked. Added hex/oct branches
  (inverse of the facet-angle formula below) and a wedge branch (max-dot over
  `bottom/front/back/left/right/slanted-top`, deliberately excluding `'top'`, which a wedge doesn't
  have).
- **Octagon facet phase was off by one half-step** (`faceFrame.ts`): `CrossSection.circle(r, 8)`
  puts vertices at 0°/45°/90°… (confirmed empirically), so facet *centers* sit at the vertex angle
  + half a step (22.5° for octagon) — the hexagon branch already had this offset (+30°), the
  octagon branch didn't, so every octagon facet frame straddled a vertex instead of centering on
  its own flat face. Factored both shapes' phase/step math into one shared `polygonFacetAngleRad`/
  `polygonFacetAngleDeg` helper (`faceFrame.ts`) so `faceFrame`, `closestFace`, and
  `orientAlongFace` (see below) can't drift apart again.
- **`updateHighlight` in `Viewport3D.tsx` read `body` (the prop captured when the mount effect
  first ran) instead of `bodyRef.current`** for its Z placement — resizing the body height (or
  changing shape) left the hover highlight's vertical position stuck at whatever it was on first
  mount, even though its footprint tracked live via `geom`. Fixed by deriving `outerHeight` from
  the already-current `geom`. This was flagged by oxlint's `exhaustive-deps` rule and is now clean.
- **Replaced `HIGHLIGHT_ROTATION` (a `Face → fixed rotation` table covering only the six box
  faces) with direct corner-sampling from `faceFrame`** for every non-planar-top/bottom face
  (`Viewport3D.tsx`): box/stadium walls, hexagon/octagon facets, and a wedge's `slanted-top` and
  (trapezoidal) left/right walls are all planar quads in their own frame, so the highlight mesh's 4
  corners are now built by calling `frame.toWorld(u,v)`/`normalAt(u,v)` directly instead of trying
  to describe the face with one fixed `Euler` rotation. This is what actually fixes the visible
  bug: previously every hex/oct facet highlighted as a flat horizontal disc (wrong plane entirely),
  and a wedge's slanted-top highlighted as a flat plane floating above the real slope. The existing
  exploded-view partial-height restriction (only highlight the base-or-lid half under the cursor)
  is preserved for every face except `slanted-top`, whose `v=0` edge isn't at the floor so there's
  no single cutoff fraction — full-face highlight is the accepted simplification there.
- **`wedgeShell()` kept the wrong half of `Manifold.splitByPlane`** (`csg/primitives.ts`):
  `splitByPlane` returns `[above the plane, below it]`; the actual wedge (flat floor at z=0, slope
  from `heightFront` to `heightBack`) is the *below* half, but the code destructured the first
  element. Selecting a wedge body used to produce an inverted floating sliver split into a splinter
  base and an oversized lid reaching above `heightBack` — confirmed by direct `manifold-3d` probe
  and by running `generateEnclosure` on a wedge body before/after: the base's bounding box now
  starts at `z=0` with the full footprint and is watertight, where before it was a 70×6.25×5mm
  fragment floating at `z=20`. One-character fix (`const [wedge]` → `const [, wedge]`).
- **`orientAlongFace()` (`csg/featurePrimitives.ts`) had no cases for `f1`..`f8` or `slanted-top`**,
  so a connector cutout or grip-ribs feature placed on a polygon facet or a wedge's slope got the
  `default` orientation (front/back's) and was extruded in the wrong direction relative to the
  material there. Added facet cases (same rotate-then-spin-to-angle pattern as the existing
  cylinder `'side'` case, reusing `polygonFacetAngleDeg`) and a `slanted-top` case (single `Rx`
  rotation by `atan2(heightBack-heightFront, width)`, derived to land local Z on the slope's own
  outward normal while keeping local X on world X, matching `faceFrame`'s convention). Threaded a
  new `geom: BodyGeometry` parameter through `orientAlongFace` and both its call sites
  (`extrudeThroughWall`, `buildGripRibs`) since the facet/slope math needs the body's actual shape
  and dimensions, not just the `Face` string. (`orientOutward`, the analogous function for
  external-mount flanges, has the same gap but wasn't in scope this session — flagged for later.)
- **Wedge `front`/`back`/`left`/`right` all used `heightBack` in `faceFrame.ts`**: `front` (the
  short wall) is `heightFront` tall, not `heightBack`, so its highlight/cutout plane used to float
  above the actual wall; `left`/`right` are trapezoids (height ramps `heightFront → heightBack`
  across `u`, not a constant), not rectangles. Split the old combined `stadium`/`wedge` branch in
  `faceFrame`/`faceSize`/`faceFromWorld` apart; wedge's `left`/`right` `toWorld` is now `v * (hF +
  u * dz)` instead of `v * hB`, with a matching `faceFromWorld` inverse. (This is also what makes
  the corner-sampled highlight above draw the correct trapezoid instead of a rectangle — the four
  sampled corners are genuinely at different heights now.)
- **`faceFromWorld` hardcoded `u = 0.5` for every hexagon/octagon side face** (`faceFrame.ts`):
  dragging or placing a feature on a polygon facet used to always snap to the facet's horizontal
  center regardless of where you clicked. Replaced with a proper projection onto the facet's own
  tangent axis (`u = 0.5 + ((point - facetCenter) · tangent) / faceWidth`), using the same
  `nx,ny,ux,uy` the `toWorld` direction already computes.

### Verification

- `npx tsc -b`, `npm run lint` (only the one pre-existing, unrelated warning left), and `npm test`
  (137/137) all clean.
- Added a throwaway vitest probe (not committed) asserting, for every shape/face, that
  `faceFromWorld(face, geom, toWorld(u,v)) ≈ (u,v)` and `closestFace(normalAt(u,v), geom) === face`
  — passed for box/hexagon/octagon/wedge. Also probed `generateEnclosure` directly on a wedge body:
  base bbox now starts at `z=0` across the full footprint and both pieces are watertight (was a
  floating 70×6.25×5mm sliver before the `wedgeShell` fix).
- **Browser-verified** (dev server + Playwright/`chromium-cli`-equivalent driving, screenshots
  taken at each step, no console errors):
  - Wedge: selecting the shape now renders an actual wedge (flat rounded-rect floor, slope from a
    short front wall to a tall back wall); hovering the slanted-top, front, back, left, and right
    walls each highlight as a quad hugging that specific surface (including the trapezoidal
    left/right walls and the tilted slope), not a flat disc floating nearby.
  - Octagon/hexagon: hovering different facets highlights each one individually, correctly shaped
    and positioned (not always facet 1, not rotated off-facet). Placing a Custom Hole feature via
    click-to-place landed on distinct facets across repeated placements (`f7` on an octagon, `f5`
    and `f6` on a hexagon) — confirmed via the feature's `face-badge` in the Inspector, not just
    visually.
  - Box height resize (typing a new value into the Height field, which goes through the same store
    action a handle-drag would): re-hovering the same screen position after growing the box from
    30mm to 90mm correctly highlighted the (now much taller) side wall spanning its full new
    height, rather than staying pinned to the old 30mm position.
- **Not verified this session**: dragging the 3D height-resize handle itself (a UI-interaction
  detail unrelated to the 8 fixes above — the handle's own hit-testing wasn't touched) got stubborn
  under headless-Playwright pixel-targeting and was swapped for the equivalent Height-field test
  above, which exercises the same `updateHighlight` code path.

### Known gaps intentionally left for a follow-up session

From the same audit, not part of this pass:
- Stadium's curved end-caps (`left`/`right`) are still flat planes tangent at one point, not a
  proper arc band; its `front`/`back` width still includes the rounded-cap overhang.
- Hex/oct/stadium top/bottom highlight is still a `PlaneGeometry` sized `[2r, 2r]` (a bounding
  square), not the actual polygon footprint.
- `resolveInteriorFace` (interior-click remapping when the lid is hidden/ghosted) doesn't know
  about polygon facets or `slanted-top`.
- Corner/height resize-handle dragging is still box/cylinder-only in practice: `BodyResizePatch`
  has no `radius`/`heightFront`/`heightBack`, so dragging a hexagon's corner handle or a wedge's
  height cone silently does nothing useful (confirmed above) rather than resizing.
- `BlueprintModal`'s 2D face list is hardcoded to the six box faces (`front/back/left/right/top/
  bottom`) — unusable for a cylinder's `side`, a polygon's `f1..f8`, or a wedge's `slanted-top`.
- The per-feature "Placement & Position" **Face** `<select>` in `InspectorPanel.tsx`'s focused
  feature drawer only offers `side/top/bottom` for any non-box shape — noticed while verifying the
  octagon placement above (the selected feature's face was correctly `f7` per its badge and the
  underlying data, but the dropdown itself has no matching `<option value="f7">` so it renders
  with nothing visibly selected). Cosmetic — the stored `face` value is correct — but worth fixing
  alongside `BlueprintModal`'s face list since it's the same root gap (shape-specific face lists
  hardcoded to box's six faces in more than one place).
- `orientOutward` (`featurePrimitives.ts`, external-mount flanges) has the same missing-facet-cases
  gap `orientAlongFace` had, wasn't touched this session.
