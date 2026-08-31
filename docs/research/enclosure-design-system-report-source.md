# Faraday enclosure design system — research and product direction

**Audience:** Faraday product and engineering team
**Date:** 2026-08-31
**Scope:** Make Faraday-generated electronics enclosures feel like durable, print-ready products rather than generic shells with features pasted into them. The focus is FDM-first, browser-side Manifold CSG, and a deliberately bounded enclosure generator—not general-purpose CAD.

## Executive answer

Faraday should not become a SCAD editor or add an open-ended modelling language. It should adopt the *useful* SCAD pattern: a small set of named, composable, parameterized construction recipes whose inputs are constrained, derived values are visible, and variants can be saved. The existing app already has much of the raw geometry: six body shapes; multiple lid systems; panel retention; board mounts; flared standoffs; corner snap combs; external mounts; and printability checks.

The next fidelity leap is a coherent **enclosure design system** with three foundations:

1. A calibrated **manufacturing profile** owns every printer-dependent rule—line width, wall count, fit clearances, layer height, material, and minimum printable web—instead of the current global 0.4 mm nozzle assumption.
2. A **structural mounting recipe** builds PCB supports, screw towers, ribs, wall ties, and keep-outs as a connected assembly. A post is either deliberately floor-standing with a flare, or is a wall/corner-integrated tower tied by thin ribs; it is never an unexplained cylinder floating near a wall.
3. A **case language** makes seams, recesses, vent frames, fasteners, labels, and feet intentional, repeatable choices. This makes generated cases read as a product family while preserving the fast direct-manipulation flow.

This is an additive upgrade to the current architecture. It strengthens the existing discriminated TypeScript model and worker-only CSG pipeline; it does not require a rewrite or a move away from Manifold.

## What Faraday already has

The present implementation is substantially beyond the early two-box screenshot:

- `EnclosureBody` already supports box, cylinder, hexagon, octagon, stadium, and wedge footprints; all preserve mm as canonical units.
- The base/lid generator supports friction lip, screw-boss, and snap-comb retention; gasket channels; edge bevels; and separately printable, retained/screwed panels.
- Board mounts produce a standoff pattern and optional L-shaped board guides. Standalone and board-mount standoffs can have a support-free conical root flare.
- `ScrewSpec` already offers interior/exterior columns, column shape, shortened wall-tied feet, counterbores, heat-set or self-tap selection, and user-controlled insets.
- `printRules.ts` centralizes a 0.4 mm-nozzle baseline and uses 1.2 mm as the preferred skin/web, while `designChecks.ts` finds weak cutout webs and edge margins.

The shortcomings are architectural rather than a lack of primitives: process assumptions are global; structural elements are selected separately instead of resolved as one mount plan; features do not yet share a visual design language; and the diagnostics are not yet able to explain the structural reasoning behind a generated post or tower.

## Evidence and implications

### 1. Print rules must be profile-owned, not universal constants

FDM capability depends on the chosen machine, nozzle, material, slicing settings, orientation, and layer height. Stratasys publishes a wall-thickness table tied to slice thickness and recommends about four layers as a general minimum; UltiMaker likewise says feature limits grow with nozzle size and identifies orientation as a mechanical and support decision. These are useful lower bounds, not portable quality guarantees. [Stratasys FDM feature guide](https://www.stratasys.com/siteassets/sdm/content---website-storage/design-guides/dg_sdm_fdm_0725a.pdf), [UltiMaker FFF design guide](https://ultimaker.com/learn/design-for-fff-3d-printing-maximize-your-success/)

**Implication:** retain `MIN_SKIN`, `MIN_WEB`, and `MIN_RIB` as *derived* values, but put their source in a versioned `ManufacturingProfile`, e.g. `lineWidth × targetPerimeters`, not a hard-coded global nozzle. A profile must be explicit about whether a value is a printability floor, a robust default, or a user-calibrated fit value.

Recommended initial shape:

```ts
interface ManufacturingProfile {
  id: string;
  label: string;
  process: 'fdm' | 'sla' | 'sls' | 'mjf';
  material: 'pla' | 'petg' | 'abs' | 'asa' | 'nylon' | 'custom';
  nozzleDiameter?: number;
  lineWidth?: number;
  layerHeight?: number;
  targetPerimeters: number;
  minPerimeters: number;
  fit: {
    slidingPerSide: number;
    pressPerSide: number;
    boardPerimeter: number;
    portPerimeter: number;
  };
  supportFreeOverhangDeg?: number;
}
```

Do not silently convert an existing project to a new profile. Migrate it to an explicit legacy “0.4 mm nozzle” profile, show a non-blocking upgrade recommendation, and preserve its output geometry. This is important for reproducibility.

### 2. Treat a boss as a connected structural element

In plastic design, a boss is not merely a cylinder: it is a circular rib that carries assembly load. Protolabs’ injection-moulding guidance says a boss close to a wall should be tied to it with ribs rather than filled as one thick mass; greater strength comes from ribs/gussets, not indiscriminately thickening the boss. That guidance is specifically about moulding and its sink/void risks, so its percentages must not be copied into FDM as a law. Its structural topology—hollow boss, controlled section thickness, and wall ties—is directly applicable to a high-fidelity Faraday recipe. [Protolabs boss design guidance](https://www.protolabs.com/en-gb/resources/design-tips/choosing-the-right-boss-for-your-part-design/), [Protolabs ribs and gussets guidance](https://www.protolabs.com/resources/design-tips/design-stronger-molded-parts/)

**Implication:** build wall-integrated towers and thin web ties, not giant solid corner blocks. For FDM, derive web thickness from the profile’s printable-perimeter rule; for future injection-moulding export, offer a separate DFM warning instead of pretending FDM geometry automatically satisfies draft/sink rules.

### 3. Fastener geometry must start from the actual insert, not only M2/M3

SPIROL’s 3D-printing guidance recommends a solid boss at least 1.5× the insert knurl diameter, with peak performance at 2×; it also reports that FDM insert performance rises with wall loops and infill. Its general insert guide specifies a hole depth of insert length plus two thread pitches and a boss diameter of roughly 2–3× insert diameter. These are manufacturer guidance for the selected insert family—not a substitute for the chosen vendor’s datasheet or a printer calibration print. [SPIROL: inserts in 3D-printed assemblies](https://www.spirol.com/resources/white-papers/how-to-select-a-threaded-insert-for-your-3d-printed-assembly/), [SPIROL: heat/ultrasonic insert hole design](https://www.spirol.com/resources/white-papers/how-to-design-the-proper-hole-for-heat-ultrasonic-inserts/)

**Implication:** change the source of truth from generic `size: 'M2' | …` to a fastener library entry that contains the exact insert’s pilot diameter, knurl diameter, length, relief, recommended boss OD, head clearance, and evidence URL. Keep generic M2/M2.5/M3 entries as clearly labeled starter recipes, but make each editable and printable as a coupon.

### 4. Snap fits are material and orientation problems, not just a tab-count problem

Snap-fit joint behavior depends on beam length, thickness, hook height, clearance, material strain limits, and print orientation. Formlabs advises that a longer hook reduces root stress, lower hook height reduces assembly force, and a tapered hook is preferable to a rectangular one; it also describes FDM parts as directionally weaker, particularly when the stress crosses layer lines. UltiMaker separately confirms that FDM orientation drives both strength and overhang/support requirements. [Formlabs snap-fit guide](https://formlabs.com/global/blog/designing-3d-printed-snap-fit-enclosures/), [UltiMaker FFF design guide](https://ultimaker.com/learn/design-for-fff-3d-printing-maximize-your-success/)

**Implication:** the existing corner comb is a good foundation, but its generated recipe needs a material-aware `SnapFitSpec` with beam length, root/beam thickness, lead angle, catch height, finger count, and an explicit life class (`one-time`, `serviceable`, `frequent`). The UI should choose a safe recipe and show the assumed print orientation; it should not claim a cycle life until coupon testing establishes it for that profile/material.

### 5. Parametric design is valuable because it separates intent from geometry

OpenSCAD’s Customizer shows the useful model: a set of bounded named parameters can be grouped into presets, updated interactively, and saved as variants. Manifold is a good implementation substrate for the same idea: its `CrossSection` API provides robust 2D offset, boolean, hull, and extrusion operations; it regularizes intersections rather than making the UI manage raw mesh topology. [OpenSCAD Customizer manual](https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Customizer), [Manifold CrossSection API](https://manifoldcad.org/docs/jsuser/classes/CrossSection.html)

**Implication:** add parameterized *recipes*, not a textual SCAD mode. This preserves Faraday’s stated non-goal of general-purpose CAD/scripting, keeps validation possible, and allows each recipe to surface a small meaningful inspector rather than exposing arbitrary boolean operations.

## The proposed enclosure design system

### A. Structural mount plan: the priority feature

Replace independent “post + optional gusset” decisions with a generated mount plan for each board/fastener group. The user still works in familiar terms—select a board, mounting holes, and a preferred retention method—but the engine owns the structural outcome.

```text
PCB/hardware datum
        │
        ├── keep-outs: board outline, holes, ports, tall components, cable corridors
        │
        └── MountPlan
             ├── floor standoff + profile-derived flare
             ├── wall-tied standoff + one/two thin ribs
             ├── corner tower (part of both walls + floor)
             ├── lid screw tower + matching lid column
             ├── support-pad/edge rail beneath a bending board edge
             └── L-guides or latches for screwless X/Y retention
```

Rules for the resolver:

1. **Use a floor standoff** when the hole sits away from walls and no component/cable keep-out is crossed. Its flare is automatic from the manufacturing profile; the user may override it only in Advanced settings.
2. **Use a wall-tied standoff** when it is near one wall. Connect it with one or two profile-thickness ribs, leaving open cable and airflow passages. Do not bridge the full gap with a solid block.
3. **Use a corner tower** when the fastening point legitimately belongs in a corner. The tower is made from a corner-local cross-section: it joins both walls and the floor, has a hollow/bored center, and may carry the lid fastener. It should look like a deliberate continuation of the shell, not an inserted tube.
4. **Use an underside rail or pad** for a board edge that can flex under connector insertion. This generalizes the existing support pad: choose a short pad row only outside component keep-outs; do not blanket the PCB underside.
5. **Do not force every PCB post into a wall.** Central hole patterns, cable paths, RF keep-outs, and asymmetric boards require free-standing supports. “Part of the walls” is a high-value option, not a universal geometry rule.

Suggested types:

```ts
type MountAnchor = 'floor' | 'wall' | 'corner' | 'auto';
type MountReinforcement = 'none' | 'root-flare' | 'wall-rib' | 'corner-tower';

interface MountingSystemSpec {
  strategy: 'auto' | 'floor-posts' | 'wall-towers' | 'hybrid';
  keepoutMargin: number;
  standoff: FastenerRecipe;
  undersideSupport: 'off' | 'auto' | 'pads' | 'rail';
  guides?: CornerGuideSpec;
}

interface ResolvedMount {
  anchor: MountAnchor;
  reinforcement: MountReinforcement;
  position: { x: number; y: number; z: number };
  reasons: string[]; // “wall tie selected: 2.1 mm clearance, no keep-out conflict”
}
```

`ResolvedMount` is derived, not persisted as a second user-editable source of truth. Persist user intent plus a geometry/version stamp; recompute the plan whenever the board, shell, profile, or keep-outs change.

### B. A case language that produces visual fidelity

Introduce a high-level `CaseTreatmentSpec`, with three named styles at first: `utility`, `field`, and `refined`. These must be recipes, not independent decoration toggles:

| Treatment | Purpose | Geometry it controls |
| --- | --- | --- |
| `utility` | Fast, low-risk workshop case | profile-aligned shell, simple seam, visible fasteners, plain port frames |
| `field` | Serviceable hardware enclosure | reinforced screw towers, guarded ports, gasket-ready seam, feet/strap/mount options, protected corners |
| `refined` | Everyday carry / desk product | intentional reveal seam, recessed lid field, matched corner/edge treatment, framed vents, flush counterbores or caps, label recess |

The selected treatment provides defaults but never hides the underlying components. The inspector can show a short “computed design” card:

- shell: 4 perimeter-equivalents, 1.8 mm nominal
- seam: 0.25 mm/side calibrated clearance, 3 mm engagement
- screws: selected insert’s 6.0 mm boss OD; corner-tower attachment
- PCB: four floor posts, one edge-support rail due to unsupported connector edge
- risk: two board-to-wall clearances awaiting calibration

This directly answers why a design looks and behaves as it does.

### C. A reliable geometry compiler

Keep the present worker boundary. Within it, separate intent, derivation, geometry, and checks:

```text
project intent
  → normalize units / validate schema
  → resolve ManufacturingProfile
  → derive shell, fit, structural, and fastener dimensions
  → resolve MountPlan against keep-outs
  → construct CrossSections / solids by recipe
  → batch union subtractive and additive sets where suitable
  → run geometry + printability invariants
  → mesh / STL export
```

This is the key SCAD lesson: a module should receive a compact, named parameter set and own its internal derived dimensions. Do not make components calculate their own conflicting “wall = 1.2” defaults. Every recipe needs:

- a pure `derive…()` function returning dimensions and explanation strings;
- a `build…()` function that owns and deletes its Manifold objects;
- a `validate…()` function returning warnings/errors against the profile and keep-outs;
- tests for bounding box, bore continuity, minimum cross-section, no forbidden overlap, and manifold export.

Use Manifold `CrossSection.offset()`/boolean/hull operations for 2D footprints (corner towers, ribs, port frames, gasket paths) before extrusion where that is clearer and cheaper than many 3D primitives. Its robust 2D regularization is well-suited to these profiles. [Manifold CrossSection API](https://manifoldcad.org/docs/jsuser/classes/CrossSection.html)

### D. Parametric rules and UI behavior

- **Inputs are few and semantic.** “M3 insert, serviceable, near wall” is a better input than bore, OD, rib count, relief, and every angle.
- **Derived dimensions are inspectable.** Show the measured bore/OD/rib/clearance with its origin—profile, fastener library, or explicit override.
- **Constraints do not secretly break hardware fit.** Clamp generator-owned values such as a rib or decorative recess. For hardware-owned locations (PCB holes, ports), warn and explain; do not slide a connector automatically.
- **Overrides are localized.** An advanced edit overrides only the field selected, preserving future library/profile improvements elsewhere.
- **Variants are first-class.** Save `Draft PETG`, `Daily PLA`, and `Serviceable ASA` profiles/variants in project JSON, in the same spirit as OpenSCAD Customizer presets but without a scripting surface.

## Concrete geometry recipes to add

### 1. Wall-tied PCB standoff

Build the current bored standoff plus a profile-derived root flare. If its center is within an eligible wall-tie distance and no keep-out blocks it, add one or two tapered ribs from the post toward the interior wall. The ribs terminate into the wall with a rounded or chamfered transition and are not thicker than the profile’s rib rule. This is the default improvement most likely to make posts look intentional.

### 2. Corner fastener tower

Replace a freestanding cylinder at a legitimate shell corner with a corner-local, hollow “pilaster” profile. It merges into both adjacent walls and the floor, retains a controlled bore/insert pocket, and provides a landing for the lid’s matching column. Drive it from the same fastener recipe as the clearance and counterbore holes. This should be the default for screw-boss lids where the interior is not board-constrained.

### 3. Board edge rail / discrete pads

Use the existing support-pad concept as a resolver output. Build short pads or a thin rail under an unsupported board edge only where the user-defined board keep-out map says the underside is clear. Add a chamfered lead-in to avoid snagging the board during assembly.

### 4. Port frame and local reinforcement

Every substantial cutout should offer a profile-thickness local frame or shallow recess. A large port opening gets a clear visual boundary and the generator can preserve an explicit web budget around it. This is more useful than making the whole wall thicker and should reuse the existing cutout margin checks.

### 5. Deliberate seam and lid field

Add an optional seam treatment: a shallow exterior reveal groove or a recessed lid field, both derived from the shell and fit profile. It turns the lid/base division from a raw split line into an intentional detail. Keep its depth below the exterior skin budget and prevent it from crossing fastener towers or port frames.

## What not to do

- Do not add free-form SCAD, arbitrary user code, or a generic boolean palette. It conflicts with Faraday’s bounded enclosure focus and makes safety/printability validation much weaker.
- Do not give a universal “0.2 mm clearance” promise. Fit is machine/material/slicer/orientation dependent; a profile must be calibrated with coupons.
- Do not apply injection-moulding ratios as FDM facts. Use their topology lessons—controlled thickness, hollow bosses, ribs, smooth transitions—but label future draft/sink checks as injection-specific.
- Do not replace all posts with wall geometry. Board clearance, cables, airflow, RF layout, and internal components decide the anchor.
- Do not make a completed design look stronger by silently adding material through a keep-out. Show a collision and let the user choose another mount strategy.

## Rollout plan and acceptance gates

### Phase A — manufacturing profiles and explainable checks

1. Add `ManufacturingProfile`, retain a legacy 0.4 mm profile, and move print-rule constants behind it.
2. Add profile-aware warnings for free skin/web, wall count, hole orientation, overhangs, and feature-to-feature gaps.
3. Show “assumption / derived / user override” on the Printability card.

**Acceptance:** legacy JSON round-trips with byte-for-byte equivalent geometry for the same profile; all present export watertightness tests stay green; profile changes visibly recompute checks; no port or PCB position is silently moved.

### Phase B — structural mounting-system resolver

1. Introduce `MountingSystemSpec`, board/component keep-outs, and a pure resolved mount plan.
2. Add wall-tied standoffs, corner towers, and automatic support pads/rails behind a feature flag or explicit `auto` strategy.
3. Add cross-section tests that prove each tie/flare reaches its anchor and retains profile minimum material.

**Acceptance:** snapshot and section-probe matrix across all supported body shapes; each generated bore remains open; every exported part is watertight; at least one representative board is physically printed and installed without component/cable interference.

### Phase C — fastener and fit calibration

1. Add a typed insert/fastener library with source URLs and editable, versioned recipes.
2. Export small calibration coupons for friction lips, panel grooves, inserts, snap beams, and ports.
3. Let users save measured results into a profile rather than changing global defaults.

**Acceptance:** use one known insert family and one target material/printer to test pilot/boss/counterbore dimensions; record the print settings and measured fit. Only then label that profile “calibrated.”

### Phase D — fidelity treatments

1. Add seam, lid-field, port-frame, and label-recess recipes.
2. Add the three case treatments as curated defaults over the structural system.
3. Create a visual regression fixture gallery and browser golden-path checks for the treatment matrix.

**Acceptance:** no treatment removes required material beneath a port, fastener, or gasket; printability warnings are comprehensible; a user can make a refined enclosure without opening Advanced settings.

## Research limitations and calibration protocol

No credible source supports universal consumer-FDM dimensions for all printers and materials. The cited manufacturer guidance is intentionally diverse: it establishes that orientation, line/nozzle dimensions, material, and construction matter, but its numeric limits apply to the source’s process and should not be represented as Faraday guarantees.

Faraday should therefore ship **starting profiles** and require a compact calibration protocol for any profile marked trusted:

1. Print a shell/port/fit coupon using the target slicer, nozzle, material, and layer height.
2. Measure wall width, hole diameter, sliding clearance, and insert fit with calipers.
3. Print a snap coupon in the proposed orientation; assemble/disassemble for the intended service class and record result, not an inferred cycle count.
4. Print one representative enclosure/board; confirm ports, PCB, cable bend radius, fasteners, seam, and support-free surfaces.
5. Store profile version, slicer settings, material, test date, and pass/fail notes with the project or a local profile library.

## Gap matrix and stopping rule

| Question | Best evidence | Confidence | Product response |
| --- | --- | --- | --- |
| Are FDM wall/feature constraints universal? | Stratasys and UltiMaker both tie them to process settings; values differ by machine | High | Profile-owned rules, calibration required |
| Do bosses benefit from wall ties/gussets rather than mass? | Protolabs plastic-feature guidance | High for topology; medium for FDM dimensions | Wall-tied/corner-tower recipes, profile-derived webs |
| Can generic M2/M3 entries safely define heat-set geometry? | SPIROL specifies insert-family dimensions and surrounding material needs | High | Exact fastener recipes plus editable starter values |
| Is a generic snap tab sufficient? | Formlabs and UltiMaker show material/orientation dependence | High | Material-aware snap recipe and coupon gate |
| Can Manifold support profile-driven CSG? | Official CrossSection API | High | Use 2D offsets/booleans/hulls then extrusion where appropriate |
| Should Faraday add SCAD scripting? | Product scope plus OpenSCAD parameter/preset model | High | Adopt constrained recipes/presets, not code execution |

The research stops here because the remaining unknowns are physical, project-specific calibration data—not facts that additional web searching can resolve. The next high-value activity is a bounded print-coupon experiment with a declared printer/material/profile.

## Source ledger

- **Stratasys Direct — “Key Feature Considerations,”** accessed 2026-08-31. FDM wall guidance tied to slice thickness; holes may print undersize. [Source PDF](https://www.stratasys.com/siteassets/sdm/content---website-storage/design-guides/dg_sdm_fdm_0725a.pdf)
- **UltiMaker — “Design for FFF 3D Printing: Maximize Your Success,”** accessed 2026-08-31. Orientation, support-free overhang, nozzle-dependent features, and moving-part gap guidance. [Source page](https://ultimaker.com/learn/design-for-fff-3d-printing-maximize-your-success/)
- **SPIROL — “How to Select a Threaded Insert for Your 3D Printed Assembly,”** accessed 2026-08-31. FDM insert construction and performance guidance. [Source page](https://www.spirol.com/resources/white-papers/how-to-select-a-threaded-insert-for-your-3d-printed-assembly/)
- **SPIROL — “How to Design the Proper Hole for Heat / Ultrasonic Inserts,”** accessed 2026-08-31. Insert depth, bore, and boss-diameter guidance. [Source page](https://www.spirol.com/resources/white-papers/how-to-design-the-proper-hole-for-heat-ultrasonic-inserts/)
- **Formlabs — “How to Design and 3D Print Snap-Fit Joints for Enclosures, Boxes, Lids, and More,”** accessed 2026-08-31. Snap geometry, materials, FDM directionality, and enclosure clearance context. [Source page](https://formlabs.com/global/blog/designing-3d-printed-snap-fit-enclosures/)
- **Protolabs — “How to Choose the Right Boss for Your Part Design,”** accessed 2026-08-31. Injection-moulded boss topology, thickness, and wall-tie guidance; applied here only as a topology analogy for FDM. [Source page](https://www.protolabs.com/en-gb/resources/design-tips/choosing-the-right-boss-for-your-part-design/)
- **Protolabs — “Design Stronger Molded Parts: Ribs, Gussets, and Materials,”** accessed 2026-08-31. Reinforcement rationale and injection-specific rib/gusset constraints. [Source page](https://www.protolabs.com/resources/design-tips/design-stronger-molded-parts/)
- **ManifoldCAD — `CrossSection` JS/TS API,** accessed 2026-08-31. Robust 2D cross-section boolean, offset, hull, and extrusion capabilities. [Source page](https://manifoldcad.org/docs/jsuser/classes/CrossSection.html)
- **OpenSCAD User Manual — “Customizer,”** accessed 2026-08-31. Bounded parameter UI, presets, and saved variants. [Source page](https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Customizer)
