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
├── docker-compose.yml   builds ./frontend, serves on :8090
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
- Docker image build was **not** verified (no docker daemon available in the sandbox this was
  built in). `Dockerfile`/`Caddyfile` follow DESIGN.md §11 exactly; worth a real `docker compose up
  --build` smoke test before relying on it.
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

## Next steps (suggested order)

All phases in DESIGN.md §13 (0 through 5) are now implemented and verified. What's left is smaller
polish, not a phase:

`vent`/`custom-hole` feature types have no CSG or UI implementation; `dshape` connector holes fall
back to circle/rect; `antenna-passthrough` has no per-feature size override; drag-to-reposition
snapping doesn't yet snap across faces (e.g. matching u/v on an adjacent box face, or across a
cylinder's `u=0`/`u=1` wrap point) — only within the same face, per DESIGN.md §13's "other
features" wording; board presets set dimensions only, not real mounting-hole positions; snap-fit's
nub/pocket profile could be upgraded to a wedge with a lead-in ramp (see above).

Also still open from earlier phases, not blocking: the ~845KB main bundle (see below), and the
never-verified Docker build.

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

<!-- When you pick this up: append a new dated entry above summarizing what changed, rather than
editing old entries, so this stays a readable history. -->
