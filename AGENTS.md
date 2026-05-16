# Project Agent Instructions

This project follows the Superpowers logistics tracking workflow from `I:\githubtemple\superpowers 物流跟踪项目模板.md`.

## Operating Mode

- Continue executing without stopping after a stage report.
- Prefer direct implementation over asking for confirmation.
- Move from requirements, design, implementation, debugging, local verification, documentation, commit, and push into the next queued task.
- Give short progress updates while working, but do not pause work just because an update was sent.
- Only ask the user when deleting large amounts of existing files, writing outside `I:\githubtemple\wuliugenzong`, needing credentials or paid resources, facing incompatible key technical paths, or finding conflicting requirements.

## Scope

- Work only inside `I:\githubtemple\wuliugenzong` for new code, config, docs, scripts, and runtime artifacts.
- `I:\githubtemple\traccar-server` and `I:\githubtemple\traccar-web` are read-only references.
- The system must remain independently runnable as a logistics/GPS tracking MVP.

## Product Direction

- Data source priority: Android app location uploads.
- Core domains: users, projects, members, devices, locations, realtime map, track playback, geofences, alerts, route corridors, big-screen overview, reports.
- Web: React business monitoring console, not a marketing page.
- Backend: NestJS REST-first API with WebSocket realtime updates.
- Database: PostgreSQL + PostGIS when configured, local JSON fallback for demo use.
- Map strategy: Gaode/Amap-oriented design with local fallback for development.

## Continuation Queue

When a phase is complete, update `TASKLIST.md`, `STATUS.md`, and relevant docs, then continue with the next unchecked item. Current productionization direction:

- Project member roles.
- Alert dispatch ownership.
- Exportable reports.
- Real authentication, project permissions, and device upload credentials.
