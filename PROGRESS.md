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
| Phase 4 — Presets, persistence, polish | ⬜ Not started |
| Phase 5 — Stretch | ⬜ Not started |

Open PR: [#2 — AGENTS.md/CLAUDE.md + Phase 2](https://github.com/d3mocide/Faraday/pull/2) (draft).
PR #1 (Phase 0+1 scaffold) is merged.

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
                            plus connectors/ (Phase 2, see below)
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

## Next steps (suggested order)

1. **Phase 4 — Presets, persistence, polish**: board presets, save/load JSON, localStorage
   autosave, mm/in units toggle (the `units` field already exists on `EnclosureProject` but has no
   UI yet), undo/redo.
2. **Phase 5 — Stretch**: cylindrical body, snap-fit lid, gasket channel, BOM export.

Smaller items that surfaced during Phase 2/3 but aren't blocking: `vent`/`custom-hole` feature
types have no CSG or UI implementation; `dshape` connector holes fall back to circle/rect;
`antenna-passthrough` has no per-feature size override; drag-to-reposition snapping doesn't yet
snap across faces (e.g. matching u/v on an adjacent face) — only within the same face, per
DESIGN.md §13's "other features" wording.

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

<!-- When you pick this up: append a new dated entry above summarizing what changed, rather than
editing old entries, so this stays a readable history. -->
