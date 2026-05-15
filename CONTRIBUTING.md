# Collaboration Conventions

## Branch Naming

- `feature/<short-topic>` for new product capabilities.
- `fix/<short-topic>` for bug fixes.
- `docs/<short-topic>` for documentation-only work.
- `chore/<short-topic>` for tooling, dependency, or maintenance work.

## Commit Messages

Use concise conventional-style messages:

- `feat: add project live map`
- `fix: correct location ingest validation`
- `docs: update local run guide`
- `chore: adjust workspace scripts`

## Pull Request Scope

- Keep one PR focused on one user-visible outcome or one technical maintenance goal.
- Avoid mixing unrelated refactors with feature work.
- Include verification notes for the smallest checks that prove the change.

## Documentation Sync

- Update `README.md` when run steps, ports, environment variables, or major capabilities change.
- Update `docs/ARCHITECTURE.md` when service boundaries, data flow, or persistence strategy changes.
- Update `STATUS.md` and `TASKLIST.md` whenever project stage, completed work, blockers, or next tasks change.

## Definition of Done

- The requested flow works locally or the remaining blocker is documented.
- Code follows the existing project style and keeps changes surgical.
- Relevant docs and live project memory files are updated.
- At least one practical verification command has been run for changed code.

## Recommended Repository Structure

- `backend/` NestJS REST and realtime API.
- `web/` React management console and big-screen dashboard.
- `mobile/` Flutter Android client source.
- `docs/` durable design notes and implementation decisions.
- `scripts/` local helper scripts.
