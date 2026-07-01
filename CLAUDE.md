# CLAUDE.md

See [`AGENTS.md`](./AGENTS.md) for repo structure, coding conventions, design-doc discipline, and
workflow rules — it applies fully here. This file only adds notes specific to Claude Code.

- Read [`DESIGN.md`](./DESIGN.md) then [`PROGRESS.md`](./PROGRESS.md) then `AGENTS.md`, in that
  order, at the start of a session before making changes.
- This is a UI-heavy app with no test suite: use a real browser (dev server + Playwright, or the
  `/run` skill) to verify behavior before reporting a phase complete, per the top-level "For UI or
  frontend changes..." instruction. `tsc -b` / `oxlint` passing is necessary, not sufficient.
- Update `PROGRESS.md`'s status table and append a dated Session log entry before ending a session
  that changed app behavior — that file is how the next session (agent or human) picks this back
  up with full context.
