# Logistics Tracking MVP Design

## Status

Approved design direction from brainstorming: build a demoable MVP first, with production upgrade paths preserved.

This spec was produced through the Superpowers brainstorming workflow after restoring the missing Superpowers skill repository.

## Goal

Build a runnable logistics tracking MVP that proves the core loop: create/select a project, bind a device, upload a location from Android or Web simulation, view latest positions in a management console, inspect a device track, and show project/global status on a large-screen view.

## Non-Goals

- Production PostgreSQL/PostGIS persistence.
- Complex user, tenant, role, audit, or permission management.
- Formal driver app UX, background location hardening, or device vendor battery-policy handling.
- Electronic fences, alert rules, dispatch tasks, report exports, notifications, HTTPS, domain setup, or deployment automation.
- Rebuilding or embedding an upstream open-source project such as Traccar directly.

## Recommended Approach

Use a demo-first architecture:

- Backend: NestJS API with an in-memory repository for the first version.
- Web: React management console and independent large-screen route in one frontend project.
- Android: Native Android Studio test collection app.
- Map: adapter layer that works without an AMap key and switches to AMap when a key is configured.

This gives the fastest path to validate the main product loop without blocking on database setup, map credentials, or Android background-location edge cases.

## System Architecture

The MVP has four modules:

- `backend/`: NestJS API for authentication, projects, devices, location ingestion, latest locations, device tracks, overview metrics, and optional realtime updates.
- `web/`: React application with two entrances: a management console and a large-screen display.
- `mobile/`: Android Studio native app for test location collection and upload.
- `docs/`: project memory, architecture notes, Superpowers specs, and implementation plans.

Primary data flow:

1. Android test app or Web simulator submits a `LocationPoint` to the backend.
2. Backend validates project/device identifiers and stores the point in memory.
3. Backend updates latest device state and exposes track history.
4. Web management console queries projects, devices, latest locations, and tracks.
5. Large-screen page queries overview metrics and latest position distribution.
6. WebSocket updates may be emitted, but the Web UI must also work through polling.

## Core Entities

### Project

Represents a logistics project or job grouping.

Fields:

- `id`: stable project identifier.
- `name`: display name.
- `region`: optional area or site label.
- `description`: optional notes.
- `status`: active or archived.
- `createdAt`: creation timestamp.

### Device

Represents one phone, vehicle, or tracker associated with a project.

Fields:

- `id`: stable device identifier.
- `name`: display name.
- `projectId`: owning project.
- `type`: phone, vehicle, or tracker.
- `online`: derived from recent reporting.
- `lastSeenAt`: last accepted location timestamp.

### LocationPoint

Represents one uploaded position sample.

Fields:

- `deviceId`: reporting device.
- `projectId`: associated project.
- `latitude`: WGS84 latitude.
- `longitude`: WGS84 longitude.
- `speed`: optional speed.
- `heading`: optional direction.
- `battery`: optional battery percentage.
- `source`: android, web-simulator, or seed.
- `capturedAt`: timestamp from the collector.
- `receivedAt`: backend receipt timestamp.

### Overview

Derived response for the large-screen route. It is not stored independently.

Fields:

- total projects.
- total devices.
- online devices.
- offline devices.
- active devices today.
- latest locations filtered by all projects or one project.

## API Design

### Authentication

- `POST /api/auth/login`
- Purpose: demo login only.
- Behavior: accepts a known demo credential and returns a simple token.
- Production upgrade path: replace with real user/session or JWT flow.

### Projects

- `GET /api/projects`
- `POST /api/projects`
- Purpose: list and create projects for demonstration.

### Devices

- `GET /api/devices`
- `POST /api/devices`
- Purpose: list and create devices.
- Filtering: `projectId` query parameter limits results to one project.

### Location Ingestion

- `POST /api/locations`
- Purpose: accept location uploads from Android test app and Web simulator.
- Required fields: `projectId`, `deviceId`, `latitude`, `longitude`.
- Optional fields: `speed`, `heading`, `battery`, `source`, `capturedAt`.
- MVP authorization: a simple test token or known demo code is enough. The first version should not require the Android app to complete a formal user login flow.
- Production upgrade path: replace with device secret, signed upload token, or app login.

### Latest Locations

- `GET /api/locations/latest`
- Purpose: return each device's latest known location.
- Filtering: `projectId` query parameter supports all-project and single-project views.

### Device Track

- `GET /api/devices/:id/track`
- Purpose: return historical points for a device.
- MVP behavior: return recent in-memory points in timestamp order.

### Overview

- `GET /api/overview`
- Purpose: return large-screen metrics and latest positions.
- Filtering: `projectId` query parameter supports all-project and single-project large-screen modes.

### Realtime Updates

- WebSocket event: `location:update`
- Purpose: allow the Web UI to react to new location uploads.
- Requirement: polling must remain available so the demo works even if WebSocket setup fails.

## Web UX

### Management Console

Target user: dispatcher or internal operator.

Design:

- Login opens the workbench.
- Project filter supports all projects and individual projects.
- Main view contains status metrics, map/coordinate view, and device list.
- Selecting a device shows its latest status and track history.
- Web simulator can upload sample points to verify the backend without a phone.

Style:

- Dense, practical, work-focused layout.
- Avoid marketing-style hero pages.
- Prioritize scanning, filtering, and repeated operation.

### Large-Screen Page

Target user: leader, customer, or monitoring display.

Design:

- Independent `/screen` route.
- Full-screen display with project/device metrics, position distribution, and project status list.
- Supports all-project mode and single-project mode.
- Uses the same backend data as the management console.

Style:

- More presentation-oriented than the management console.
- Still data-forward and readable from a distance.

### Map Adapter

The Web app must not require an AMap key to run.

Modes:

- Fallback mode: built-in coordinate or simplified map panel.
- AMap mode: real AMap Web map when a valid key is configured.

The UI should clearly remain usable in fallback mode. AMap support is an enhancement, not a blocker for the MVP.

## Android Test App UX

Target user: developer or tester validating mobile location upload.

Screens and controls:

- Backend address input.
- Project ID input.
- Device ID input.
- Device name input.
- Save configuration.
- Get current location.
- Upload once.
- Start timed upload.
- Stop timed upload.

Displayed state:

- Location permission status.
- Current latitude and longitude.
- Latest upload success or failure.
- Last upload time.
- Error message when permission, network, or server validation fails.

Location behavior:

- Request Android location permission.
- Support manual upload.
- Support fixed-interval foreground timed upload.
- Do not implement robust background survival in the MVP.
- Allow LAN backend addresses so a real phone can reach the development machine.

## Testing And Verification

The MVP is complete when:

- Backend starts locally and serves project, device, location, track, and overview APIs.
- Web management console logs in with demo credentials.
- Web can create or display demo projects and devices.
- Web simulator uploads a location and the latest-location view updates.
- Device track view shows uploaded historical points.
- Large-screen route switches between all projects and one project.
- Web works without an AMap key through the fallback map panel.
- Android Studio app can upload at least one real or simulated location to the backend.
- Documentation explains local startup, Android Studio debugging, AMap key configuration, and the PostgreSQL/PostGIS upgrade path.

## Upgrade Path

After the MVP loop is validated:

1. Replace the in-memory repository with PostgreSQL/PostGIS.
2. Add real authentication, project permissions, and device upload credentials.
3. Improve Android app background upload reliability and production UX.
4. Add AMap production configuration and map interaction polish.
5. Add geofencing, alerts, dispatch workflow, reporting, and deployment hardening as separate specs.

## Decisions From Brainstorming

- MVP shape: demoable MVP first.
- Map: fallback mode plus optional AMap mode.
- Android: test collection app first.
- Web: separate management console and large-screen entrance.
- Implementation style: preserve production upgrade paths without building production infrastructure in the first version.
