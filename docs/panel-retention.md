# Side panels, grooves, and thin-wall guards

**Status:** implemented 2026-08-15 — see §8 for what shipped and where it deviates from the
proposal below.
**Written:** 2026-08-15, after the first real print of the Waveshare CM4 Dual ETH preset broke.

The slide-in panel channel (`csg/panels.ts`) produces features that are too thin to print. This
note measures exactly what is thin and why, sets a single minimum-material rule for the whole
generator, and works through the options for a screw-secured side panel before recommending one.

---

## 1. What actually broke, measured

All numbers below were probed off the real generated geometry (manifold `slice()` cross-sections
of the `waveshare-cm4-dual-eth-wifi6` preset at export quality), not estimated from the source.

Preset parameters in play: body `97.4 × 114.8 × 45.5`, `wallThickness 2.4`, default corner style
`rounded r3`, panels on `left` + `right`, `thickness 2.4`, `fitClearance 0.2`, `grooveDepth 1.2`,
`captureInLid true`, `retainLip` unset → the `DEFAULT_RETAIN_LIP` of 1.0 mm.

### 1a. The retaining lip is 0.4 mm thick at its outer edge

Slice of the **base** at z = 20, at the corner where the right-hand panel channel meets the back
wall (world mm):

```
groove inner face  x = 46.10      (outer 48.70 − plate 2.4 − clearance 0.2)
lip inner face     x = 47.70      (outer 48.70 − retainLip 1.0)
channel end        y = 56.20      (wall inner face 55.00 + grooveDepth 1.2)
outer surface      x = 48.64 at y = 55.00   ← r3 corner arc, not a flat wall
                   x = 48.10 at y = 56.20
```

The lip is the material between `x = 47.70` and the outer surface. Because the outer surface here
is the **corner arc**, that is:

| position | lip thickness |
|---|---|
| y = 55.00 (inboard edge) | **0.94 mm** |
| y = 56.20 (outboard edge) | **0.40 mm** |

It is 1.2 mm wide, **40.8 mm tall** (z 1.3 → 42.1), stands vertically off the wall, and is the only
thing stopping the plate falling out of the case. At 0.4–0.94 mm it is one to two extrusion widths
of unsupported, unbonded perimeter, printed with the layer lines running perpendicular to the load
it exists to carry. There are eight of these on this print (two ends × two panels × base). They
broke, and they were always going to.

The matching feature on the plate — the rebated ear that slides behind the lip — is 1.3 mm thick ×
1.3 mm wide × 40.8 mm tall. Marginal, but it prints flat on the bed, so it is laminated in-plane
and much stronger than its cross-section suggests. The lip is the weak half of the joint.

**Root cause:** `panelMetrics()` (`csg/parts.ts`) clamps `retainLip` against the *plate thickness*
and `grooveDepth` against the *wall thickness*, and neither clamp knows the body has a corner
radius. `panelBounds()` (`csg/panels.ts`) already has a `cornerInset` term — but it is only applied
where a panel meets *another panel*. Where a panel meets a **wall**, the channel is driven blindly
to `acrossHalf − wallThickness + grooveDepth`, straight into the arc. Nothing in the pipeline ever
asks "how much material is actually left outboard of this cut?"

### 1b. The right-hand plate has a 0.19 mm web between two openings

Same probe, sweeping the `panel-right` plate every 0.2 mm in z:

```
narrowest interior web:  0.19 mm at z = 8.5  (y 18.84 → 19.03)
narrowest edge band:     3.47 mm             (fine)
panel-left  narrowest web: 2.24 mm           (tight, but printable)
```

The 0.19 mm web is between the third **USB-A** cutout (`alongMm 14.745`, width 8.2 → ends at
18.845) and the **dual-RJ45** shell (`alongMm 35.83`, width 33.6 → starts at 19.03) in
`presets/boards.ts`. A 0.4 mm nozzle cannot produce it; the slicer drops it and the two openings
merge into one 42 mm slot, which removes the plate's only mid-span material and leaves the whole
lower half of the plate hanging off two thin strips. This is a second, independent contributor to
the print failing.

The three USB-A ports are on a 10.39 mm pitch with 8.2 mm openings → 2.19 mm webs. Those are fine.
It is specifically the USB-A/RJ45 neighbour pair that collides.

### 1c. Wall-mount tabs: 0.5 mm between the slot end and the tab tip

`CM4_WALL_TAB` is `protrusion 10`, `hole 'slot'`, `holeDiameter 5`, `slotLength 9`.
`flangeHoleCrossSection()` centres the slot at `protrusion / 2` and gives it the full requested
overall length, with no edge check at all:

```
tab spans      local y  0 → 10  (plus the embed into the wall)
slot spans     local y  0.5 → 9.5
tip material   0.5 mm, across a 3 mm thick × 16 mm wide ear
```

Probed and confirmed: material exists in the band `y 66.9 → 67.4` (0.5 mm) at the tab tips. That is
the thin bit you noticed on the wall mounts. Nothing stops a user setting `slotLength ≥ protrusion`
and getting an open-ended fork instead of a slot.

### 1d. Secondary observation

`SCREW_HOLE_SPECS[*].heatSetDepth` is used directly as the bore depth for heat-set pockets
(`csg/primitives.ts:522,602`). A heat-set insert displaces a slug of molten plastic that needs
somewhere to go; the accepted rule is bore 1–2 mm deeper than the insert. Not what broke here, but
it belongs on the same cleanup list.

---

## 2. The rule we are missing

There is currently no single place in the generator that knows how much material a feature is
allowed to leave behind. Every clamp is local (`MIN_PANEL_SKIN = 0.8` in `parts.ts`,
`thickness - 0.8` for the lip, `diameter - 0.8` for a boss bore) and none of them compose.

**Proposal — one exported constant, applied everywhere:**

```ts
// csg/printRules.ts
export const NOZZLE = 0.4;               // the assumption every other number is derived from
export const MIN_SKIN = 3 * NOZZLE;      // 1.2 mm — material left between any cut and a free surface
export const MIN_WEB  = 3 * NOZZLE;      // 1.2 mm — material left between two cuts
export const MIN_RIB  = 4 * NOZZLE;      // 1.6 mm — free-standing feature taller than ~5× its width
```

You asked for "at least a mm". 1.2 mm rather than 1.0 mm because wall thickness on an FDM printer
should be a whole multiple of the extrusion width — a 1.0 mm wall on a 0.4 mm nozzle gets two
perimeters and a 0.2 mm void the slicer cannot fill, so it is *weaker* than a deliberate 0.8 mm
wall and much weaker than 1.2 mm. Three perimeters is the usual structural floor. If we ever want
to support other nozzle sizes, this is the one place that changes.

**How each rule should be enforced** — and this distinction matters:

| Geometry | Enforcement | Why |
|---|---|---|
| Groove depth, lip thickness, channel ends vs. the corner arc | **Hard clamp**, silently | Machine-chosen dimensions. The user asked for a working panel, not for 1.2 mm specifically. |
| Slot/keyhole ends vs. flange tip, boss bore vs. boss wall | **Hard clamp**, silently | Same. |
| Port cutout vs. plate edge, port vs. port | **Warn, never move** | A connector's position is functional. Silently shifting an RJ45 to buy 1 mm of web produces a case that does not fit the board. |

The warning path already exists and is the right home: `runDesignChecks()` in
`state/designChecks.ts` (rendered by `PrintabilityCard`). It needs a new rule that, per printed
part, walks that part's cutouts and reports any pair closer than `MIN_WEB`, and any cutout closer
than `MIN_SKIN` to that part's own boundary. On the Waveshare preset it would fire immediately on
the USB-A/RJ45 pair — before the print, which is the whole point.

---

## 3. Options for holding a side panel in

The fundamental constraint: **the plate's outer face is flush with the case's outer surface**, so
anything that stops it falling outward has to overlap it from outside, and that overlap has to come
out of either the wall thickness or the plate thickness. On a 2.4 mm wall with a 2.4 mm plate there
is nothing to spend. Every fix below is a different answer to "where does the overlap material come
from?"

### Option A — keep the lip, but cut the groove into added material, not into the wall

Add a **pilaster**: a vertical post on the *inside* of the case at each end of the panel opening,
running the plate's full height, ~6 mm across the face × ~3 mm deep. Cut the channel and the
retaining lip into the pilaster instead of into the 2.4 mm wall.

- Groove depth and outboard skin both stop depending on `wallThickness`. A 1.2 mm groove with a
  1.6 mm skin and a 1.2 mm lip fits comfortably in a 3 mm-deep post.
- The post sits inboard of the corner arc by construction, so the arc stops eating the lip.
- Prints as part of the wall — it is a thicker wall region, not an overhang.
- Bonus structural fix: with panels on left *and* right, the Waveshare base's front and back walls
  are currently joined **only through the floor slab** until the lid is screwed on. Four corner
  pilasters stiffen exactly the joint that is missing.
- Cost: ~6 mm of interior width at each end of a panelled face.

Lowest-risk change; keeps the slide-in workflow exactly as it is.

### Option B — dovetail / T-slot channel

Undercut the groove so retention lives *inside* the wall and there is no external lip at all. Prints
acceptably when the slot runs vertically (the 45° flanks self-support).

Rejected as a default: on a 2.4 mm plate the dovetail tips end up ~1 mm and the fit is very
sensitive to printer calibration — it trades a fragile case feature for a fragile plate feature and
a much fussier tolerance. Worth revisiting for plates ≥ 3 mm.

### Option C — surface-mounted cover plate

Plate sits *on* the outside of the wall, overlapping a smaller opening by 2–3 mm all round, screwed
into bosses behind. The wall stays full thickness everywhere; nothing is thin anywhere. Strongest
and simplest option, and it is removable without opening the lid.

Cost: the plate stands proud by its own thickness, and every connector sits that much further out.

### Option D — inset (rebated) plate + screws ← **recommended**

Option C with the plate dropped into a shallow picture-frame rebate so it finishes flush:

```
        outside                              outside
   ┌──────────────────┐                 ┌────┬────────┬────┐
   │ wall 2.4         │                 │2.4 │  1.2   │2.4 │   ← frame: 1.2 mm of wall left
   │                  │      →          │    ├────────┤    │      behind the plate, full width,
   │                  │                 │    │ plate  │    │      not a rib
   └──────────────────┘                 └────┴────────┴────┘
                                          ↑ pilaster with M2 pilot holes
```

- **Rebate** (the "inlay"): a pocket in the wall's outer face, `rebateDepth` deep, extending
  `frameOverlap` beyond the port opening on all four sides. The plate's outer face finishes flush
  with the wall.
- **Frame:** `wallThickness − rebateDepth` of material stays behind the plate's perimeter, as a
  broad flat frame rather than a rib — it is supported along its whole length by the wall it is part
  of. At 2.4 − 1.2 = 1.2 mm it is exactly `MIN_SKIN`.
- **Retention:** the frame stops the plate moving *inward*. Two **M2** screws per end, through the
  plate into the pilasters from Option A, stop it moving outward. No lip, no rebated plate ends, no
  thin feature anywhere in the load path.
- **Serviceable without opening the case** — undo four M2s and the connector panel comes off. That
  is strictly better than today, where `captureInLid: true` means the lid has to come off first.
- The screw axis is horizontal (normal to the wall), so the pilot hole is a horizontal bore in a
  vertically-printed post: a 1.6 mm hole bridges cleanly at that size, and a teardrop or 45°-chamfer
  top is available if we want to be careful about droop.

Assembly is the same "drop it in from the top" as today, plus two screws per panel.

### Recommendation

**Ship Option A as the fix, and Option D as the new default retention mode.** They share the
pilaster, so it is one piece of geometry serving both: existing projects keep the slide-in lip (now
cut into a post that can actually carry it), and new projects get the screwed inset panel.

---

## 4. Proposed parameters

Grounded in the FDM references in §7 and in `csg/screwLibrary.ts`, which already carries correct M2
numbers (clearance 2.4, self-tap pilot 1.6, heat-set bore 3.2).

| Parameter | Default | Floor | Note |
|---|---|---|---|
| `post.width` (across the face) | 6.0 mm | 5.0 mm | ≥ 1.6 mm of plastic around a 1.6 mm M2 pilot; 8 mm if heat-set inserts are selected |
| `post.depth` (inward from wall) | 3.0 mm | 2.4 mm | must clear `grooveDepth + MIN_SKIN` in lip mode |
| `rebateDepth` | 1.2 mm | — | clamped to `wallThickness − MIN_SKIN` |
| `frameOverlap` | 2.5 mm | 2.0 mm | picture-frame width around the opening |
| plate `thickness` (inset mode) | = `rebateDepth` | 1.2 mm | flush finish; a thinner plate is fine and better for connectors |
| `fitClearance` (inset mode) | 0.3 mm | 0.2 mm | screws locate the plate, so it can be looser than a slide fit |
| M2 clearance hole in plate | 2.4 mm | — | from `SCREW_HOLE_SPECS` |
| M2 self-tap pilot in post | 1.6 mm × 5 mm deep | — | 80–90 % of major diameter |
| M2 heat-set bore in post | 3.2 mm × (insert + 1.5 mm) | — | needs relief for displaced plastic — see §1d |
| screw inset from plate edge | 4.0 mm | — | keeps ≥ 1 mm of plate around a 3.8 mm head |
| screws per panel | 4 (2 per end) | 2 | 2 is enough on plates under ~40 mm |

And the guard rails that would have caught this print:

| Clamp | Today | Proposed |
|---|---|---|
| `MIN_PANEL_SKIN` | 0.8 mm | 1.2 mm, measured **against the corner arc**, not against the flat wall |
| `retainLip` | `≤ thickness − 0.8` | `≤ thickness − 1.2`, **and** `≥ 0.8` effective at its thinnest point after the arc trim, or retention falls back to screws with a design-check warning |
| channel end vs. wall | `acrossHalf − wall + groove` | additionally stop `cornerInset + MIN_SKIN` clear of a rounded/chamfered corner |
| flange hole | unbounded | slot/keyhole/round hole clamped to keep `MIN_SKIN` from the flange tip and sides |

---

## 5. Implementation sketch

Additive, in the shape `AGENTS.md` prescribes for a new feature variant.

1. **`csg/printRules.ts`** (new) — `NOZZLE`, `MIN_SKIN`, `MIN_WEB`, `MIN_RIB`, plus
   `effectiveCornerInset(cornerStyle)`. Nothing else hardcodes 0.8 after this.
2. **`types/project.ts`** — `PanelSpec.retention?: 'lip' | 'screw' | 'none'` (undefined = `'lip'`,
   so every saved project keeps its current geometry), `PanelSpec.post?: PanelPostSpec`,
   `PanelSpec.screw?: PanelScrewSpec`.
3. **`csg/parts.ts`** — `panelMetrics()` gains `postWidth`, `postDepth`, `rebateDepth`,
   `frameOverlap`, `screwPositions`, and applies the §4 clamps. This is the single place the new
   numbers get resolved, exactly like today.
4. **`csg/panels.ts`** — `panelPosts()` (union into the base), `panelRebateCut()`, and a
   `retention`-aware `panelChannelCut()` / `panelPlate()`. The lip path stays as-is apart from now
   cutting into a post.
5. **`csg/featurePrimitives.ts`** — clamp `flangeHoleCrossSection()` against the plate outline.
6. **`state/designChecks.ts`** — per-part cutout↔cutout and cutout↔edge margin rule; extend the
   existing panel-lip finding to say *why* retention was downgraded.
7. **`components/InspectorPanel.tsx`** — retention mode selector in the Panels section; post/screw
   controls behind it.
8. **`presets/boards.ts`** — move the Waveshare preset to `retention: 'screw'`, and fix the
   USB-A/RJ45 collision (§1b) independently, since that is a preset data bug, not a generator bug.
9. **Tests** — `test/panels.test.ts`: the probe from §1 as a permanent regression check (measure the
   minimum material at the channel corner across corner styles and wall thicknesses, assert
   `≥ MIN_SKIN`), plus a check that a screwed plate is blocked from moving outward and that its
   pilot holes land inside the posts.
10. **Browser verification** before calling it done, per `CLAUDE.md` — this is geometry the viewport
    has to render and the export has to split correctly.

---

## 6. Decisions worth your call before implementation

1. **Default retention for new projects** — `'screw'` (safest, needs hardware) or stay `'lip'` (no
   hardware, now printable thanks to the post)?
2. **Existing saved projects and presets**: leave them on `'lip'` with the tightened clamps, or
   migrate them to `'screw'`?
3. **M2 self-tapping vs. heat-set inserts** as the default for panel screws. Self-tap needs no tool
   and no extra BOM line; heat-set survives repeated disassembly, which matters more on the one part
   of the case you take off to change a connector.
4. **Wall-mount tabs (§1c)** — when a requested slot does not fit the tab, clamp the slot or grow
   the tab? Clamping is silent and safe; growing preserves the adjustment travel the user asked for
   and changes the case's footprint.

---

## 7. Sources

FDM design rules:
- [Design Rules & Best Practices for FFF 3D Printing — Hydra Research](https://www.hydraresearch3d.com/design-rules)
- [Wall Thickness in 3D Printing — Raise3D](https://www.raise3d.com/blog/3d-printing-wall-thickness/)
- [Designing Wall Thickness for 3D Printing — BigRep](https://bigrep.com/posts/designing-wall-thickness-for-3d-printing/)
- [FDM Design Rules: Wall Thickness, Overhangs, Bridging and Tolerances — Layer X](https://layerx3d.in/blog/fdm-design-rules-wall-thickness-overhangs-bridging-tolerances)
- [Design rules for plastic parts in 3D printing — 3D Formtech](https://3dformtech.fi/en/design-rules-for-plastic-parts/)
- [SLS Design Tips: Holes — Stratasys Direct](https://www.stratasys.com/en/stratasysdirect/resources/articles/ls-design-tips-holes/) (hole-to-edge spacing)

Fasteners in printed plastic:
- [Tips & Tricks for Heat-Set Inserts — CNC Kitchen](https://www.cnckitchen.com/blog/tipps-amp-tricks-fr-gewindeeinstze-im-3d-druck-3awey)
- [Heat-set inserts: hole sizes and how to design the boss — Meshra](https://meshra.ai/blog/heat-set-inserts-3d-printing)
- [M2 Heat Set Insert Hole Size — InsertGuide](https://insertguide.com/m2-heat-set-insert-hole-size-for-3d-printed-parts/)
- [Threaded Insert Hole Size Guide for 3D Printing — Accu](https://accu-components.com/us/p/488-threaded-insert-hole-size-charts-for-3d-printing-pla-petg-resin)
- [Using self-tapping screws with a 3D print — Rikesh Patel](https://www.rikeshkkpatel.co.uk/wip/using-self-tapping-screws-with-a-3d-print/)

Enclosure panel practice:
- [3D Printed Electronics Enclosures: Design Tips for Makers — Zbotic](https://zbotic.in/3d-printed-electronics-enclosures-design-tips-for-makers/)
- [3D Printed Snap-Fit Joints: How to Design Clips That Work — Sovol](https://www.sovol3d.com/blogs/news/3d-printed-snap-fit-joints-how-to-design-clips-that-work)

---

## 8. What shipped, and where it differs from §3–§5

Implemented in one pass on 2026-08-15. The owner's calls on §6: **keep the lip as the default**
retention with the screw options layered on as toggles; **leave** existing projects and presets on
the lip; **self-tapping** M2 as the screw default; **clamp** an oversized flange slot rather than
growing the tab.

### The lip fix is geometric, not a pilaster (deviates from Option A)

§3's Option A proposed adding a post so the groove could be cut into thick material. What actually
fixed it is simpler and costs no interior volume: the channel's end slots are **intersected with a
copy of the outer shell shrunk inward by `retainLip`** (`PanelShells` in `csg/panels.ts`), and the
plate's rebated ends are cut against the same shell shrunk by `retainLip + clearance/2`. The lip
then follows the corner instead of running into it, so it is its nominal thickness everywhere.

The measured result on the same probe that found the original defect: **0.40 mm → 1.2 mm**, and the
plate does not get any shorter.

Where a corner treatment is so large that there is no material for a lip at all — a 5 mm chamfer on
a 3 mm wall, say — the clipping produces *no* lip rather than a fragile one, and
`PanelMetrics.cornerLipRoom` drives a new `panels:corner-eats-lip` finding that says so. That
all-or-nothing property is the invariant `test/panels.test.ts` pins down across every corner style.

### Posts came in with the screws, not with the lip

`PanelSpec.screw` (off by default) adds a vertical post in each interior corner behind the plate,
bored for the fastener, with matching counterbored clearance holes in the plate. Posts are unioned
*after* the channel is cut and bored after that, so neither the channel nor a solid post can end up
where the screw has to pass. Because the lip fix no longer needs added material, the posts exist
only where they earn their keep — and a plate can carry both, which is the combination worth
printing on a case that gets opened.

### MIN_WALL joined MIN_SKIN

§2 proposed one target. There are two: `MIN_SKIN`/`MIN_WEB` (1.2 mm, three perimeters) is what the
clamps aim for, and `MIN_WALL` (0.8 mm, two perimeters) is the floor a *result* is allowed to reach
before the design checks speak up. This matters for the lip/ear budget: a plate needs
`2 × MIN_SKIN + clearance/2` of thickness before both halves of the joint are at target, and below
that the two now split what there is evenly rather than one being starved to keep the other whole.
A 2.4 mm plate at 0.2 mm clearance lands both at 1.15 mm — three times what broke, and quiet.

### Eight presets were wrong, not one

The margin checks fired on far more than the Waveshare case. All fixed:

| Preset | Was | Fix |
|---|---|---|
| `waveshare-cm4-dual-eth-wifi6` | 0.19 mm between USB-A #3 and the RJ45 shell | cut as the single window it physically has to be |
| `waveshare-cm4-dual-eth-wifi6` | left louvres 0.70 mm off the DSI slot | raised 0.5 mm |
| `beaglebone-black` | Ethernet and Mini-USB openings overlap outright | one window for the pair |
| `beaglebone-black` | 1.06 mm / 1.05 mm webs on the right wall | USB-A opening trimmed 0.4 mm; microSD dropped 0.2 mm |
| `pi-cm4-io` | 0.25 mm between the DC jack and rpiboot port | one window for the power/boot pair |
| `cyd-esp32-2432s028` | rear vent landed exactly on the lid seam | split 18 → 19.5 mm |
| `raspberry-pi-3/4/5`, `raspberry-pi-hat-stack` | USB stacks 0.60 mm under the seam | split 24 → 25 mm |

### Also done

- `flangeHoleCrossSection()` now clamps every hole style to keep `MIN_SKIN` from the flange's tip,
  root and side edges. The stock CM4 wall tab's 0.5 mm tip is 1.2 mm.
- Heat-set bores get `HEAT_SET_RELIEF` (1.5 mm) beyond the insert length, for the plastic the
  insert displaces.
- The lateral-wall edge check deliberately measures **only** against the floor and the lid seam. A
  box's side wall has no edge in the other direction — it turns the corner and carries on as the
  next wall — so flagging a cutout for being near a corner would have been a false positive.

### Verification

`npm run lint`, `npm run build` and 286 vitest tests (was 271) all pass. New coverage:
`test/panels.test.ts` (11 tests — the lip probe across corner styles, the all-or-nothing invariant,
post presence, a clear screw axis through both pieces, and that a screwed plate still lifts out to
be assembled) and `test/flangeHoles.test.ts` (4). Browser-verified with Playwright: the Waveshare
preset applies clean, the screw toggle regenerates with visible counterbored holes in both plates,
and Export produces `case_base`/`case_lid`/`panel_left`/`panel_right` STLs plus a BOM listing
8 × M2 × 6 mm screws. Zero console errors throughout.
