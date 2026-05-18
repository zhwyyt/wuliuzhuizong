# Project Status

## Current Stage

Superpowers MVP plan is complete. Phase 7 productionization has started with local runtime persistence.

## Completed

- Created repository collaboration conventions.
- Created live memory files required for multi-session work.
- Added requirements brainstorming output in `docs/REQUIREMENTS.md` after correcting the workflow order.
- Added staged implementation plan in `docs/IMPLEMENTATION_PLAN.md` after correcting the workflow order.
- Restored the missing Superpowers repository at `C:\Users\Administrator\.codex\superpowers`; the existing junction at `C:\Users\Administrator\.agents\skills\superpowers` now resolves correctly.
- Read the real Superpowers `using-superpowers`, `brainstorming`, and `writing-plans` skill instructions.
- Completed official Superpowers brainstorming for the demoable logistics tracking MVP.
- Wrote the official design spec at `docs/superpowers/specs/2026-05-15-logistics-tracking-mvp-design.md`.
- Self-reviewed the design spec for placeholders, contradictions, scope drift, and ambiguity.
- User approved the official Superpowers design spec.
- Wrote the official implementation plan at `docs/superpowers/plans/2026-05-15-logistics-tracking-mvp-implementation-plan.md`.
- Self-reviewed the implementation plan for spec coverage, placeholders, and type consistency.
- Implemented NestJS API for login, projects, devices, location ingest, latest locations, tracks, and overview.
- Implemented React Web console with project filtering, device management, live map, simulated App upload, and track replay.
- Implemented big-screen overview page for all projects or one selected project.
- Added Android Studio native Android app for location upload.
- Added README with local run and Android Studio instructions.
- Executed the official Superpowers implementation plan inline.
- Aligned backend API contracts with project/device/location spec fields.
- Added backend repository tests for Android/Web location ingestion and tracks.
- Aligned Web API usage, simulator payload, and map fallback configuration.
- Aligned Android test collector payload, controls, and default project/device fields.
- Verified `npm run build`, `npm test -w backend`, `npm run lint -w web`, and backend API smoke checks.
- Verified Android Gradle `assembleDebug`.
- Added PostgreSQL runtime persistence with automatic database/table initialization using `wuliu_*` tables.
- Added optional PostGIS initialization for geography point storage and GiST indexing when the extension is installed.
- Added `/api/locations/nearby` for distance-filtered latest device lookup backed by PostGIS `ST_DWithin`.
- Added circle geofence APIs for creating/listing fences and querying latest devices inside a fence.
- Added geofence alert events on Android uploads and route-deviation detection APIs.
- Added Web management surfaces for geofence creation, alert triage, and route-deviation checks.
- Added saved route corridor persistence with `GET/POST /api/routes`, `routeId` deviation checks, and Web save/select controls.
- Added device route assignment with `PATCH /api/devices/:id/route`; route deviation uses the assigned route by default.
- Added alert acknowledgement/resolution with `PATCH /api/alerts/:id` and operations summary reporting at `GET /api/reports/summary`.
- Added project member roles, alert dispatch ownership, and CSV report export at `GET /api/reports/export`.
- Added session token login, scoped project-member permissions, and device upload token validation.
- Upgraded the Android app to phone/password login, auto-bind the phone as a device after login, save the returned device credential, and send `X-Device-Token` on uploads.
- Added Android foreground tracking service with a persistent notification and 30-second background location upload loop.
- Refactored the Android app into a PDA-style experience with a dedicated login page, workspace dashboard, and a single live collection module.
- Aligned Android identity with Web-managed project members so the phone no longer invents local member ownership; Web now pre-configures member phone/password accounts for App login.
- Added local JSON persistence fallback at `backend/data/runtime.json`; tests continue to use memory-only state.
- Verified PostgreSQL connection to the configured `wms` database and API location ingest/latest-location smoke checks.
- Started local dev services successfully with backend on `http://localhost:4000/api` and Web on `http://127.0.0.1:5175`.
- Verified the Android flow on a physical phone, including phone login, automatic device binding, and live location uploads.

## In Progress

- Superpowers phase 7 productionization.

## Blockers

- PostgreSQL and PostGIS are verified locally. `wuliu_locations.geog` is enabled as `geography(Point, 4326)` with a GiST index.

## Risks

- Current local PostgreSQL storage keeps scalar longitude/latitude columns and a PostGIS geography column/index for spatial queries.
- 高德地图 production usage requires a valid API key configured by the deployer.
- In-app browser verification timed out repeatedly in the current shell; frontend was verified by independent Playwright, build, lint, dev server HTTP 200, and backend smoke checks.
- Android background tracking is verified on a physical phone, but a longer soak test across OEM battery policies is still worth doing before wider rollout.

## Next Steps

- Decide whether the Android workspace should later expose more modules beyond the current collection entry.
