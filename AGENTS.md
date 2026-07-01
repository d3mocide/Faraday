# AGENTS.md

Rules for any coding agent (or human) working in this repo. Tool-agnostic — `CLAUDE.md` just
points here. If something here conflicts with `DESIGN.md` or `PROGRESS.md`, those two win on
*what to build*; this file governs *how to work in the repo*.

## Read order, every session

1. [`DESIGN.md`](./DESIGN.md) — the spec. What Faraday is and why. Written once, treated as
   mostly-frozen; deviations get called out in PROGRESS.md rather than silently edited in.
2. [`PROGRESS.md`](./PROGRESS.md) — the living tracker. What's actually built, what's known-broken,
   what's next. Trust this over your assumptions about repo state.
3. This file — how to work here.

## Repo structure

```
/
├── DESIGN.md          spec, written once — see "Design-doc discipline" below
├── PROGRESS.md         living status tracker — update every session
├── AGENTS.md            this file
├── CLAUDE.md             thin pointer to this file
├── README.md
├── docker-compose.yml   builds ./frontend, serves on :8090
└── frontend/            the entire app (static Vite/React SPA, no backend)
    ├── Dockerfile, Caddyfile
    ├── package.json, vite.config.ts, tsconfig*.json, .oxlintrc.json
    └── src/
        ├── state/       Zustand store, single EnclosureProject source of truth
        ├── types/       project.ts — the data model, discriminated unions
        ├── csg/         Web Worker + manifold-3d pipeline, primitives, worker protocol
        ├── connectors/  ConnectorLibraryEntry data (Phase 2+)
        ├── presets/     board presets (Phase 4+)
        ├── components/  React UI
        └── export/      STL/ZIP export
```

Root stays docs + deploy orchestration only. If a backend or other top-level concern is ever
added, it's a sibling of `frontend/`, never nested inside it.

**Adding a new feature type** (`Feature.type` in `types/project.ts`): add the variant to the
discriminated union, add its spec interface, extend `buildFeaturePrimitive`-equivalent logic in
`csg/`, add a palette entry. This should be additive — see DESIGN.md §9 on why the data model is
shaped this way.

**Adding a connector**: append to the typed array in `connectors/library.ts` (once it exists —
Phase 2). Never hardcode connector dimensions inline in a component; the library is the single
source of truth.

## Coding conventions

- **TypeScript strict, no `any`.** Model states as discriminated unions (see `LidType`,
  `FeatureType`, `EnclosureBody.shape`) rather than optional-field soup.
- **Units are always canonical mm internally.** `units: 'mm' | 'in'` on `EnclosureProject` is
  display-only — never store or compute in inches. Convert at the display boundary only.
- **Immutable state updates.** Store actions build a new object via spread, never mutate in place.
  Every mutation goes through `touch()` (stamps `updatedAt`) — see `state/projectStore.ts`.
- **Comments explain WHY, not WHAT.** Default to none. Write one only for a non-obvious constraint
  or gotcha (see the StrictMode/Web-Worker comment in `csg/useLiveGeometry.ts`, or the mm-unit
  annotations in `types/project.ts`). Don't restate what a well-named function already says.
- **No premature abstraction.** Three similar `setX` store actions are fine as three functions;
  don't generalize into a generic field-setter until a real second use case demands it.
- **Manifold-3d specifics**: rotation APIs take **degrees**, not radians. Every function that
  returns a `Manifold` the caller must eventually `.delete()` — say so in a doc comment if it's not
  obvious from context (see `generateEnclosure.ts`). All CSG boolean ops happen inside the Web
  Worker (`csg/worker.ts`) — never call into `manifold-3d` from a React component or the main
  thread.
- **Two tessellation qualities**: `'live'` (coarse, used while editing) and `'export'` (full res,
  only on Export click). New geometry-generating code must respect whichever `CsgQuality` it's
  called with, not hardcode one.

## Design-doc discipline

`DESIGN.md` is the spec but not gospel — Phase 0/1 already deviated once (no ×1000 integer
coordinate scaling; see PROGRESS.md's "Deviation from DESIGN.md" section for the precedent). The
pattern to follow:

1. Prefer implementing the spec as written.
2. If you deviate, do it deliberately and document it in PROGRESS.md under a clearly-labeled
   subsection, with the reasoning — not as a silent departure discovered later in a diff.
3. Don't edit DESIGN.md itself to match reality after the fact; it stays the historical record of
   intent. PROGRESS.md is where "what we actually did" lives.

## Workflow

- Work the phases in `DESIGN.md` §13 in order (0 → 5) unless the user directs otherwise. Default
  to finishing and verifying one phase before starting the next — don't let partial phases pile up.
- **Verify before calling a phase done.** This is a UI-heavy app; run the dev server and exercise
  the golden path (and the obvious edge cases) in a real browser before reporting success. Type
  checking (`tsc -b`) and lint (`oxlint`) catch correctness of code, not correctness of behavior.
- Before considering any change complete: `cd frontend && npm run lint && npm run build`. There is
  no automated test suite yet (Phase 0-1 verification was manual/Playwright-driven, see
  PROGRESS.md) — flag this explicitly rather than claiming test coverage that doesn't exist.
- **Update `PROGRESS.md` at the end of every session/phase**: the status table at the top, and a
  new dated entry *appended* to the Session log (don't rewrite old entries — it's a history, not a
  snapshot). Note any new known issues/gotchas future sessions need.
- Branch/PR flow: one feature branch per unit of work, draft PRs, don't push straight to a default
  branch. Match whatever branch-naming/PR conventions are already in use in the repo's history.

## Non-goals (don't reintroduce scope DESIGN.md explicitly excluded)

No auth/accounts, no cloud sync, no server-side rendering or computation, no general-purpose CAD
scripting surface. See DESIGN.md §1 and §14 before adding anything that smells like one of these.
