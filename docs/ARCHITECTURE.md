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
- `GET /api/devices`
- `POST /api/devices`
- `POST /api/locations`
- `GET /api/locations/latest`
- `GET /api/tracks`
- `GET /api/overview`

WebSocket namespace:

- `/realtime`
- emits `location:update` when a device uploads a new point.

## Persistence Plan

The first runnable MVP uses an in-memory repository seeded with demo data so it can run without external services. The intended production persistence is PostgreSQL + PostGIS:

- Store location geometry as `geography(Point, 4326)`.
- Index by `device_id`, `project_id`, and timestamp.
- Use spatial indexes for project distribution and large-screen aggregation.

## Map Strategy

The Web UI is designed around Gaode/Amap. In local demo mode it uses a lightweight coordinate canvas so the system remains runnable without a map key. When `VITE_AMAP_KEY` is provided, the map component can be replaced by an AMap SDK adapter without changing API contracts.
