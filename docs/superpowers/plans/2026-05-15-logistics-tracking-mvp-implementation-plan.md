# Logistics Tracking MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the existing logistics tracking scaffold with the approved MVP spec so backend, Web, and Android prove the project/device/location/large-screen loop.

**Architecture:** Keep the current NestJS + React + native Android structure. Strengthen the shared data contract first, then update backend APIs, Web client/UI, Android upload payloads, tests, and documentation against that contract.

**Tech Stack:** NestJS 11, TypeScript, Socket.IO, React 19, Vite, lucide-react, native Android Java, Gradle.

---

## File Structure

- `backend/src/domain.ts`: shared backend types for `Project`, `Device`, `LocationPoint`, `LatestLocation`, and API input contracts.
- `backend/src/data.service.ts`: in-memory repository, seed data, validation, derived overview metrics, track lookup.
- `backend/src/app.controller.ts`: HTTP API routes matching the approved spec.
- `backend/src/data.service.spec.ts`: focused unit tests for repository behavior and API contract compatibility.
- `backend/package.json`: backend test script and test dependencies.
- `backend/tsconfig.spec.json`: TypeScript config for backend tests.
- `web/src/api/client.js`: API path helpers matching backend routes.
- `web/src/main.jsx`: management console, large-screen route, simulator payload, track route usage, map adapter wiring.
- `web/src/styles.css`: layout refinements for management console, large-screen page, and map fallback.
- `mobile/app/src/main/java/com/example/wuliugenzong/MainActivity.java`: Android test collection UI and upload payload.
- `README.md`: local run, Android Studio verification, AMap fallback, and GitHub repository notes.
- `STATUS.md`: implementation status and known verification limits.
- `TASKLIST.md`: official Superpowers plan tracking.

## Task 1: Backend Contract Alignment

**Files:**
- Modify: `backend/src/domain.ts`
- Modify: `backend/src/data.service.ts`
- Modify: `backend/src/app.controller.ts`

- [ ] **Step 1: Replace backend domain types with spec-aligned contracts**

Replace `backend/src/domain.ts` with:

```ts
export type ProjectStatus = 'active' | 'paused' | 'archived';
export type DeviceStatus = 'online' | 'idle' | 'offline' | 'alert';
export type DeviceType = 'phone' | 'vehicle' | 'tracker';
export type LocationSource = 'android' | 'web-simulator' | 'seed';

export interface User {
  id: string;
  name: string;
  role: 'admin' | 'operator';
}

export interface Project {
  id: string;
  name: string;
  region: string;
  description: string;
  status: ProjectStatus;
  createdAt: string;
}

export interface Device {
  id: string;
  projectId: string;
  name: string;
  type: DeviceType;
  owner: string;
  phone: string;
  status: DeviceStatus;
  lastSeenAt?: string;
}

export interface LocationPoint {
  id: string;
  projectId: string;
  deviceId: string;
  longitude: number;
  latitude: number;
  lng: number;
  lat: number;
  speed: number;
  heading: number;
  battery?: number;
  source: LocationSource;
  status: DeviceStatus;
  capturedAt: string;
  receivedAt: string;
  timestamp: string;
}

export interface LatestLocation extends LocationPoint {
  projectName: string;
  deviceName: string;
  owner: string;
}

export interface LocationInput {
  projectId?: string;
  deviceId?: string;
  longitude?: number | string;
  latitude?: number | string;
  lng?: number | string;
  lat?: number | string;
  speed?: number | string;
  heading?: number | string;
  battery?: number | string;
  source?: LocationSource;
  status?: DeviceStatus;
  capturedAt?: string;
  timestamp?: string;
}
```

- [ ] **Step 2: Update seed data and repository inputs**

In `backend/src/data.service.ts`, update the imports and seed objects to use `region`, `description`, `type`, and `lastSeenAt`:

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Device, DeviceStatus, LatestLocation, LocationInput, LocationPoint, Project, User } from './domain';

const now = () => new Date().toISOString();
const toNumber = (value: number | string | undefined, field: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new BadRequestException(`${field} must be a valid number`);
  }
  return parsed;
};
```

Use these seed arrays:

```ts
private projects: Project[] = [
  { id: 'p-shanghai', name: '上海冷链配送', region: '上海', description: '市内冷链配送演示项目', status: 'active', createdAt: now() },
  { id: 'p-hangzhou', name: '杭州同城运输', region: '杭州', description: '同城干线运输演示项目', status: 'active', createdAt: now() },
  { id: 'p-suzhou', name: '苏州仓配项目', region: '苏州', description: '仓配一体化演示项目', status: 'paused', createdAt: now() },
];

private devices: Device[] = [
  { id: 'd-1001', projectId: 'p-shanghai', name: '沪A-手机-001', type: 'phone', owner: '王师傅', phone: '13800000001', status: 'online' },
  { id: 'd-1002', projectId: 'p-shanghai', name: '沪A-手机-002', type: 'phone', owner: '李师傅', phone: '13800000002', status: 'alert' },
  { id: 'd-2001', projectId: 'p-hangzhou', name: '浙A-手机-001', type: 'phone', owner: '赵师傅', phone: '13800000003', status: 'online' },
  { id: 'd-3001', projectId: 'p-suzhou', name: '苏E-手机-001', type: 'phone', owner: '孙师傅', phone: '13800000004', status: 'idle' },
];
```

- [ ] **Step 3: Update create project and create device behavior**

Replace `createProject` and `createDevice` in `backend/src/data.service.ts` with:

```ts
createProject(input: Partial<Project>): Project {
  const project: Project = {
    id: `p-${Date.now()}`,
    name: input.name?.trim() || '新建物流项目',
    region: input.region?.trim() || '未设置',
    description: input.description?.trim() || '',
    status: input.status ?? 'active',
    createdAt: now(),
  };
  this.projects.unshift(project);
  return project;
}

createDevice(input: Partial<Device>): Device {
  const projectId = input.projectId || this.projects[0]?.id;
  if (!this.projects.some((project) => project.id === projectId)) {
    throw new NotFoundException('Project not found');
  }
  const device: Device = {
    id: `d-${Date.now()}`,
    projectId,
    name: input.name?.trim() || '新手机设备',
    type: input.type ?? 'phone',
    owner: input.owner?.trim() || '未绑定人员',
    phone: input.phone?.trim() || '',
    status: input.status ?? 'offline',
  };
  this.devices.unshift(device);
  return device;
}
```

- [ ] **Step 4: Update location ingestion to accept both Web and Android field names**

Replace `ingestLocation` in `backend/src/data.service.ts` with:

```ts
ingestLocation(input: LocationInput): LatestLocation {
  const device = this.devices.find((item) => item.id === input.deviceId);
  if (!device) {
    throw new NotFoundException('Device not found');
  }
  if (input.projectId && input.projectId !== device.projectId) {
    throw new BadRequestException('projectId does not match device project');
  }

  const longitude = toNumber(input.longitude ?? input.lng, 'longitude');
  const latitude = toNumber(input.latitude ?? input.lat, 'latitude');
  const status = input.status ?? 'online';
  const capturedAt = input.capturedAt || input.timestamp || now();
  const receivedAt = now();

  device.status = status;
  device.lastSeenAt = receivedAt;

  const point: LocationPoint = {
    id: `l-${Date.now()}`,
    projectId: device.projectId,
    deviceId: device.id,
    longitude,
    latitude,
    lng: longitude,
    lat: latitude,
    speed: Number(input.speed ?? 0),
    heading: Number(input.heading ?? 0),
    battery: input.battery === undefined ? undefined : Number(input.battery),
    source: input.source ?? 'android',
    status,
    capturedAt,
    receivedAt,
    timestamp: capturedAt,
  };
  this.locations.push(point);
  return this.toLatest(point);
}
```

- [ ] **Step 5: Update seed point helper**

Replace `private point(...)` in `backend/src/data.service.ts` with:

```ts
private point(deviceId: string, longitude: number, latitude: number, speed: number, heading: number, status: DeviceStatus, minutesOffset: number): LocationPoint {
  const device = this.devices.find((item) => item.id === deviceId);
  if (!device) {
    throw new Error(`Missing seed device ${deviceId}`);
  }
  const timestamp = new Date(Date.now() + minutesOffset * 60_000).toISOString();
  device.lastSeenAt = timestamp;
  return {
    id: `seed-${deviceId}-${minutesOffset}`,
    projectId: device.projectId,
    deviceId,
    longitude,
    latitude,
    lng: longitude,
    lat: latitude,
    speed,
    heading,
    source: 'seed',
    status,
    capturedAt: timestamp,
    receivedAt: timestamp,
    timestamp,
  };
}
```

- [ ] **Step 6: Add spec route for device tracks**

Modify `backend/src/app.controller.ts` imports and routes:

```ts
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { DataService } from './data.service';
import { Device, LocationInput, Project } from './domain';
import { RealtimeGateway } from './realtime.gateway';
```

Replace the location and track route methods with:

```ts
@Post('locations')
ingestLocation(@Body() body: LocationInput) {
  const point = this.data.ingestLocation(body);
  this.realtime.publishLocation(point);
  return point;
}

@Get('devices/:id/track')
deviceTrack(@Param('id') deviceId: string, @Query('projectId') projectId?: string) {
  return this.data.track(deviceId, projectId);
}

@Get('tracks')
tracks(@Query('deviceId') deviceId: string, @Query('projectId') projectId?: string) {
  return this.data.track(deviceId, projectId);
}
```

Keep `/tracks` temporarily so the current Web client keeps working until Task 3.

- [ ] **Step 7: Build backend**

Run:

```bash
npm run build -w backend
```

Expected: TypeScript compilation succeeds and exits with code 0.

- [ ] **Step 8: Commit backend contract alignment**

Run:

```bash
git add backend/src/domain.ts backend/src/data.service.ts backend/src/app.controller.ts
git commit -m "feat: align backend contract with tracking spec"
```

Expected: commit succeeds.

## Task 2: Backend Tests

**Files:**
- Modify: `backend/package.json`
- Create: `backend/tsconfig.spec.json`
- Create: `backend/src/data.service.spec.ts`

- [ ] **Step 1: Add backend test script and dependencies**

In `backend/package.json`, add this script:

```json
"test": "tsc -p tsconfig.spec.json && node --test dist-spec/**/*.spec.js"
```

Add these dev dependencies:

```json
"@types/node": "^24.3.0",
"typescript": "^5.9.2"
```

The backend already has these dev dependencies, so only add the `test` script if the dependency keys are present.

- [ ] **Step 2: Create backend test TypeScript config**

Create `backend/tsconfig.spec.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist-spec",
    "module": "commonjs",
    "types": ["node"],
    "noEmitOnError": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Write repository behavior tests**

Create `backend/src/data.service.spec.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataService } from './data.service';

test('ingestLocation accepts longitude and latitude fields from Android clients', () => {
  const service = new DataService();

  const point = service.ingestLocation({
    projectId: 'p-shanghai',
    deviceId: 'd-1001',
    longitude: 121.5,
    latitude: 31.2,
    speed: 36,
    heading: 90,
    battery: 88,
    source: 'android',
    capturedAt: '2026-05-15T06:00:00.000Z',
  });

  assert.equal(point.projectId, 'p-shanghai');
  assert.equal(point.deviceId, 'd-1001');
  assert.equal(point.longitude, 121.5);
  assert.equal(point.latitude, 31.2);
  assert.equal(point.lng, 121.5);
  assert.equal(point.lat, 31.2);
  assert.equal(point.battery, 88);
  assert.equal(point.source, 'android');
  assert.equal(point.timestamp, '2026-05-15T06:00:00.000Z');
});

test('ingestLocation still accepts lng and lat fields from the Web simulator', () => {
  const service = new DataService();

  const point = service.ingestLocation({
    deviceId: 'd-1001',
    lng: 121.61,
    lat: 31.31,
    source: 'web-simulator',
  });

  assert.equal(point.longitude, 121.61);
  assert.equal(point.latitude, 31.31);
  assert.equal(point.source, 'web-simulator');
});

test('ingestLocation rejects mismatched projectId', () => {
  const service = new DataService();

  assert.throws(
    () => service.ingestLocation({
      projectId: 'p-hangzhou',
      deviceId: 'd-1001',
      longitude: 121.5,
      latitude: 31.2,
    }),
    BadRequestException,
  );
});

test('track returns timestamp-sorted points for one device', () => {
  const service = new DataService();

  service.ingestLocation({ deviceId: 'd-1001', longitude: 121.7, latitude: 31.4, capturedAt: '2026-05-15T06:10:00.000Z' });
  service.ingestLocation({ deviceId: 'd-1001', longitude: 121.6, latitude: 31.3, capturedAt: '2026-05-15T06:05:00.000Z' });

  const track = service.track('d-1001');
  const timestamps = track.map((point) => point.timestamp);

  assert.deepEqual([...timestamps].sort(), timestamps);
  assert.ok(track.every((point) => point.deviceId === 'd-1001'));
});

test('unknown device throws NotFoundException', () => {
  const service = new DataService();

  assert.throws(
    () => service.ingestLocation({ deviceId: 'missing-device', longitude: 121.5, latitude: 31.2 }),
    NotFoundException,
  );
});
```

- [ ] **Step 4: Run backend tests**

Run:

```bash
npm test -w backend
```

Expected: Node test runner reports 5 passing tests.

- [ ] **Step 5: Commit backend tests**

Run:

```bash
git add backend/package.json backend/tsconfig.spec.json backend/src/data.service.spec.ts package-lock.json
git commit -m "test: cover backend location repository"
```

Expected: commit succeeds.

## Task 3: Web API And Interaction Alignment

**Files:**
- Modify: `web/src/api/client.js`
- Modify: `web/src/main.jsx`

- [ ] **Step 1: Update Web track API route**

Replace the `track` function in `web/src/api/client.js` with:

```js
track: (deviceId, projectId) => request(`/devices/${deviceId}/track${projectId ? `?projectId=${projectId}` : ''}`),
```

- [ ] **Step 2: Update project form fields to match backend contract**

In `web/src/main.jsx`, replace the project form state:

```js
const [projectForm, setProjectForm] = useState({ name: '', region: '', description: '' });
```

Replace the project submit reset:

```js
setProjectForm({ name: '', region: '', description: '' });
```

Replace the project form inputs:

```jsx
<input placeholder="项目名称" value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} />
<input placeholder="区域" value={projectForm.region} onChange={(e) => setProjectForm({ ...projectForm, region: e.target.value })} />
<input placeholder="描述" value={projectForm.description} onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })} />
```

- [ ] **Step 3: Update Web simulator payload**

Replace `simulateUpload` payload in `web/src/main.jsx` with:

```js
await api.ingestLocation({
  projectId: device.projectId,
  deviceId: device.id,
  longitude: (latest?.longitude ?? latest?.lng ?? 121.47) + (Math.random() - 0.35) * 0.04,
  latitude: (latest?.latitude ?? latest?.lat ?? 31.23) + (Math.random() - 0.35) * 0.025,
  speed: Math.round(20 + Math.random() * 45),
  heading: Math.round(Math.random() * 359),
  battery: Math.round(45 + Math.random() * 50),
  source: 'web-simulator',
  status: 'online',
  capturedAt: new Date().toISOString(),
});
```

- [ ] **Step 4: Update screen project metadata display**

In `ScreenPage`, replace:

```jsx
<span>{project.city} / {project.manager}</span>
```

with:

```jsx
<span>{project.region} / {project.description || '暂无描述'}</span>
```

- [ ] **Step 5: Build Web**

Run:

```bash
npm run build -w web
```

Expected: Vite build succeeds and creates `web/dist`.

- [ ] **Step 6: Commit Web alignment**

Run:

```bash
git add web/src/api/client.js web/src/main.jsx
git commit -m "feat: align web client with tracking API"
```

Expected: commit succeeds.

## Task 4: Map Adapter Fallback And AMap Configuration Surface

**Files:**
- Modify: `web/src/main.jsx`
- Modify: `web/src/styles.css`
- Modify: `README.md`

- [ ] **Step 1: Add map mode detection**

In `web/src/main.jsx`, add this constant near the imports:

```js
const AMAP_KEY = import.meta.env.VITE_AMAP_KEY || '';
```

- [ ] **Step 2: Update map toolbar to show active mode**

Inside `MiniMap`, add:

```js
const mapMode = AMAP_KEY ? 'AMap key configured' : 'Fallback coordinate map';
```

Replace the first toolbar label:

```jsx
<span><MapPin size={16} /> {mapMode}</span>
```

Replace the map legend:

```jsx
<div className="map-legend">
  <span>坐标范围：华东演示数据</span>
  <span>{AMAP_KEY ? '高德 Key 已配置，下一阶段接入 AMap JS SDK 图层' : '未配置 VITE_AMAP_KEY，当前使用内置坐标图层'}</span>
</div>
```

- [ ] **Step 3: Add stable map mode style**

Append to `web/src/styles.css`:

```css
.map-toolbar span:first-child {
  min-width: 210px;
}

.map-legend span:last-child {
  text-align: right;
}
```

- [ ] **Step 4: Document AMap environment variable**

Add this section to `README.md`:

```md
## AMap Key

The Web app runs without an AMap key. In that mode it shows the built-in coordinate fallback map.

To prepare for AMap integration, set this environment variable before starting the Web app:

```powershell
$env:VITE_AMAP_KEY="your-amap-web-js-key"
npm run dev -w web
```

The current MVP only exposes the configuration surface and fallback behavior. The production AMap JS SDK layer is a follow-up task after the demo loop is verified.
```

- [ ] **Step 5: Build Web**

Run:

```bash
npm run build -w web
```

Expected: Vite build succeeds.

- [ ] **Step 6: Commit map fallback work**

Run:

```bash
git add web/src/main.jsx web/src/styles.css README.md
git commit -m "feat: expose map fallback mode"
```

Expected: commit succeeds.

## Task 5: Android Test Collection App Alignment

**Files:**
- Modify: `mobile/app/src/main/java/com/example/wuliugenzong/MainActivity.java`
- Modify: `README.md`

- [ ] **Step 1: Add project and device name inputs**

In `MainActivity.java`, add fields beside the existing inputs:

```java
private EditText projectIdInput;
private EditText deviceNameInput;
```

After the backend address input block, add:

```java
projectIdInput = new EditText(this);
projectIdInput.setHint("项目 ID");
projectIdInput.setSingleLine(true);
projectIdInput.setText("p-shanghai");
root.addView(projectIdInput, fullWidth());
```

After the device ID input block, add:

```java
deviceNameInput = new EditText(this);
deviceNameInput.setHint("设备名称");
deviceNameInput.setSingleLine(true);
deviceNameInput.setText("Android 测试手机");
root.addView(deviceNameInput, fullWidth());
```

- [ ] **Step 2: Add stop upload button**

After the start button, add:

```java
Button stopButton = new Button(this);
stopButton.setText("停止定时上报");
stopButton.setOnClickListener(v -> stopCollecting());
root.addView(stopButton, fullWidth());
```

Add this method:

```java
private void stopCollecting() {
    handler.removeCallbacks(uploadLoop);
    if (locationManager != null) {
        locationManager.removeUpdates(locationListener);
    }
    statusView.setText("已停止定时上报。");
}
```

- [ ] **Step 3: Add permission result handling**

Add this method to `MainActivity.java`:

```java
@Override
public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    if (requestCode == LOCATION_PERMISSION) {
        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (granted) {
            statusView.setText("定位权限已授权，请再次点击开始定位上报。");
        } else {
            statusView.setText("定位权限未授权，当前只能使用演示坐标上报。");
        }
    }
}
```

- [ ] **Step 4: Update Android upload payload**

Replace the JSON body assembly in `postLocation` with:

```java
JSONObject body = new JSONObject();
body.put("projectId", projectIdInput.getText().toString().trim());
body.put("deviceId", deviceIdInput.getText().toString().trim());
body.put("deviceName", deviceNameInput.getText().toString().trim());
body.put("longitude", location.getLongitude());
body.put("latitude", location.getLatitude());
body.put("speed", Math.max(0, location.getSpeed() * 3.6));
body.put("heading", location.hasBearing() ? location.getBearing() : 0);
body.put("battery", JSONObject.NULL);
body.put("source", "android");
body.put("status", "online");
body.put("capturedAt", new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).format(new java.util.Date()));
```

- [ ] **Step 5: Document Android verification**

Add this section to `README.md`:

```md
## Android Studio Verification

Open `mobile/` in Android Studio.

Use these default values for emulator testing:

- Backend address: `http://10.0.2.2:4000/api`
- Project ID: `p-shanghai`
- Device ID: `d-1001`

For a physical Android phone on the same LAN, replace `10.0.2.2` with the computer's LAN IP address and keep port `4000`.
```

- [ ] **Step 6: Compile Android from Android Studio or Gradle**

Run from Android Studio: `Build > Make Project`.

Expected: Android project compiles. If local Gradle is available, this command is also valid:

```bash
cd mobile
./gradlew assembleDebug
```

Expected: debug APK builds successfully.

- [ ] **Step 7: Commit Android test app alignment**

Run:

```bash
git add mobile/app/src/main/java/com/example/wuliugenzong/MainActivity.java README.md
git commit -m "feat: align android test collector payload"
```

Expected: commit succeeds.

## Task 6: End-To-End Verification And Project Memory

**Files:**
- Modify: `README.md`
- Modify: `STATUS.md`
- Modify: `TASKLIST.md`

- [ ] **Step 1: Run full workspace build**

Run:

```bash
npm run build
```

Expected: backend and Web builds both succeed.

- [ ] **Step 2: Run backend tests**

Run:

```bash
npm test -w backend
```

Expected: 5 backend tests pass.

- [ ] **Step 3: Start local services**

Run:

```bash
npm run dev
```

Expected:

- Backend listens on `http://localhost:4000/api`.
- Web listens on the Vite URL printed by the terminal, usually `http://localhost:5173`.

- [ ] **Step 4: Verify API manually**

Run these commands in a second terminal:

```bash
curl http://localhost:4000/api/health
curl http://localhost:4000/api/projects
curl http://localhost:4000/api/locations/latest
curl -X POST http://localhost:4000/api/locations -H "Content-Type: application/json" -d "{\"projectId\":\"p-shanghai\",\"deviceId\":\"d-1001\",\"longitude\":121.56,\"latitude\":31.28,\"speed\":42,\"heading\":90,\"source\":\"web-simulator\",\"capturedAt\":\"2026-05-15T06:00:00.000Z\"}"
curl http://localhost:4000/api/devices/d-1001/track
curl http://localhost:4000/api/overview
```

Expected:

- `/health` returns `{"ok":true,"service":"wuliugenzong-api"}`.
- `/projects` returns the seeded projects.
- `POST /locations` returns a latest-location object with `longitude`, `latitude`, `lng`, and `lat`.
- `/devices/d-1001/track` includes the posted point.
- `/overview` returns project and device metrics.

- [ ] **Step 5: Verify Web UI**

Open the Vite URL in a browser and perform this sequence:

1. Login with `调度管理员`.
2. Select `全部项目`.
3. Click `模拟 App 上报`.
4. Click device `沪A-手机-001`.
5. Confirm the track list shows points.
6. Switch to `大屏`.
7. Switch the project dropdown between `全部项目` and `上海冷链配送`.

Expected: the management console and large-screen page update without requiring an AMap key.

- [ ] **Step 6: Update STATUS.md**

Set `STATUS.md` current stage to:

```md
## Current Stage

Official Superpowers implementation plan written and MVP alignment in progress.
```

Add under `Completed`:

```md
- Approved the official Superpowers MVP design spec.
- Wrote the official Superpowers implementation plan at `docs/superpowers/plans/2026-05-15-logistics-tracking-mvp-implementation-plan.md`.
```

If all verification commands pass, add:

```md
- Verified backend build, Web build, backend tests, and local API smoke checks.
```

If Android was not built from this shell, keep this blocker:

```md
- Android Studio/Android Gradle runtime is not verified in the current shell, so Android device verification may need to be completed from Android Studio.
```

- [ ] **Step 7: Update TASKLIST.md**

Mark these lines complete:

```md
- [x] User review and approval of official design spec.
- [x] Write official Superpowers implementation plan from approved spec.
```

Add these implementation checklist lines:

```md
- [ ] Align backend API contract with approved spec.
- [ ] Add backend repository tests.
- [ ] Align Web API usage and simulator payload.
- [ ] Expose map fallback and AMap configuration mode.
- [ ] Align Android test collector payload and controls.
- [ ] Run full local verification.
```

- [ ] **Step 8: Commit plan and memory updates**

Run:

```bash
git add docs/superpowers/plans/2026-05-15-logistics-tracking-mvp-implementation-plan.md STATUS.md TASKLIST.md README.md
git commit -m "docs: add official MVP implementation plan"
```

Expected: commit succeeds.

- [ ] **Step 9: Push changes**

Run:

```bash
git push
```

Expected: commits are pushed to `https://github.com/zhwyyt/wuliuzhuizong`.

## Self-Review

Spec coverage:

- Project/device/location/latest/track/overview loop is covered by Tasks 1, 2, 3, and 6.
- Management console and large-screen split is covered by Task 3 and Task 6.
- Map fallback plus AMap configuration surface is covered by Task 4.
- Android test collection app is covered by Task 5.
- Documentation and verification are covered by Task 6.
- PostgreSQL/PostGIS, production authentication, formal driver UI, geofencing, alerts, deployment, and notifications remain outside this MVP plan by design.

Placeholder scan:

- This plan contains concrete file paths, code snippets, commands, and expected outputs for each implementation task.

Type consistency:

- Backend accepts both `longitude/latitude` and `lng/lat`.
- Backend responses keep `longitude/latitude` and `lng/lat` so current Web map code continues to work.
- Web simulator sends `longitude/latitude`.
- Android app sends `longitude/latitude`.
- Track route is standardized to `/api/devices/:id/track`, with `/api/tracks` kept during migration.
