# GPS Logistics Monitoring MVP Architecture

## Product Shape

The MVP is a project-based GPS monitoring system. Android phones are treated as primary location devices. The Web console supports management, realtime viewing, project filtering, track replay, and a big-screen overview.

## Applications

- `backend`: NestJS REST API with a simple realtime WebSocket gateway.
- `web`: React single-page app for operators and display screens.
- `mobile`: Android Studio native Android client skeleton for login, project binding, status, and location upload.

## Core Domain

- User: simplified operator account for MVP login.
- Project: logistics or field operation unit.
- Device: mobile phone or tracker assigned to one project.
- Location point: longitude, latitude, speed, heading, timestamp, and status.

## API Strategy

REST is the default API style:

- `POST /api/auth/login`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/members`
- `POST /api/members`
- `GET /api/devices`
- `POST /api/devices`
- `PATCH /api/devices/:id/route`
- `POST /api/locations`
- `GET /api/locations/latest`
- `GET /api/locations/nearby`
- `GET /api/geofences`
- `POST /api/geofences`
- `GET /api/geofences/:id/devices`
- `GET /api/alerts`
- `PATCH /api/alerts/:id`
- `GET /api/routes`
- `POST /api/routes`
- `POST /api/routes/deviation`
- `GET /api/tracks`
- `GET /api/overview`
- `GET /api/reports/summary`
- `GET /api/reports/export`

## Web Console

- Project filtering.
- Device/person management.
- Live location map with built-in fallback and optional AMap JS SDK mode.
- Track replay.
- Geofence creation and alert triage.
- Saved route corridors, device route assignments, and route deviation checks.
- Alert acknowledgement/resolution and operations summary reporting.
- Project member roles, alert dispatch ownership, and CSV report export.
- Simulated App upload.

WebSocket namespace:

- `/realtime`
- emits `location:update` when a device uploads a new point.

## Persistence Plan

The backend now supports two runtime persistence modes:

- PostgreSQL mode is enabled when `DB_HOST`, `DB_USERNAME`, and `DB_DATABASE` are configured. The app creates the database if needed and owns `wuliu_*` tables inside it.
- If the PostgreSQL server has PostGIS installed, the app automatically enables the extension, adds a `geog geography(Point, 4326)` column, and creates a GiST spatial index.
- Local JSON mode stores runtime data at `backend/data/runtime.json` when database configuration is absent.
- Automated tests run against memory-only state.

Spatial query API:

- `GET /api/locations/nearby` accepts `longitude`, `latitude`, optional `radiusMeters`, optional `projectId`, and optional `limit`.
- PostgreSQL/PostGIS mode uses `ST_DWithin` and the `wuliu_locations.geog` GiST index against each Android device's latest point.
- Circle geofence APIs store fence centers as `geography(Point, 4326)` when PostGIS is available, and evaluate latest project devices by distance.
- Android uploads generate `geofence_enter` alert events when a point falls inside an active circle geofence.
- Alert events carry `open`, `acknowledged`, or `resolved` status plus handling operator, note, and timestamp.
- Project members carry owner/manager/dispatcher/viewer roles and can be assigned as alert owners.
- Saved route corridors are stored in `wuliu_route_corridors` with JSON route points and a project index.
- Devices can store an optional `route_id` assignment; assigned route projects must match the device project.
- `POST /api/routes/deviation` compares a device track against an inline route polyline, a saved `routeId`, or the device assigned route, and reports points outside the configured tolerance.
- JSON/test mode uses the same latest-point semantics with Haversine distance calculation.

The next persistence upgrade is to expand spatial business logic:

- Add real authentication, project permissions, and device upload credentials.
- Index by `device_id`, `project_id`, and timestamp.
- Use spatial indexes for route corridor checks and large-screen aggregation.

## Map Strategy

The Web UI is designed around Gaode/Amap. In local demo mode it uses a lightweight coordinate canvas so the system remains runnable without a map key. When `VITE_AMAP_KEY` is provided, the map component can be replaced by an AMap SDK adapter without changing API contracts.
