import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DataService } from './data.service';

test('login issues session tokens and maps project members to scoped operators', async () => {
  const service = new DataService();

  const admin = await service.login('控制台管理员');
  assert.match(admin.token, /^session-/);
  assert.equal(service.authenticate(`Bearer ${admin.token}`).role, 'admin');

  const member = await service.login('上海调度员');
  assert.equal(member.user.role, 'operator');
  assert.deepEqual(member.user.projectIds, ['p-shanghai']);
  assert.equal(service.authenticate(member.token).name, '上海调度员');
  assert.throws(() => service.authenticate('bad-token'), UnauthorizedException);
});

test('Android device uploads require the matching device token when requested', async () => {
  const service = new DataService();
  const device = await service.createDevice({ projectId: 'p-shanghai', name: '凭证测试设备' });

  await assert.rejects(
    () => service.ingestLocation({
      projectId: 'p-shanghai',
      deviceId: device.id,
      longitude: 121.47,
      latitude: 31.23,
      appVersion: '0.2.0',
    }, { requireDeviceToken: true, deviceToken: 'wrong-token' }),
    UnauthorizedException,
  );

  const point = await service.ingestLocation({
    projectId: 'p-shanghai',
    deviceId: device.id,
    longitude: 121.47,
    latitude: 31.23,
    appVersion: '0.2.0',
  }, { requireDeviceToken: true, deviceToken: device.deviceToken });
  assert.equal(point.deviceId, device.id);
});

test('ingestLocation accepts longitude and latitude fields from Android clients', async () => {
  const service = new DataService();

  const point = await service.ingestLocation({
    projectId: 'p-shanghai',
    deviceId: 'd-1001',
    longitude: 121.5,
    latitude: 31.2,
    speed: 36,
    heading: 90,
    battery: 88,
    source: 'android',
    appVersion: '0.2.0',
    appVersionCode: 2,
    provider: 'amap',
    accuracy: 12,
    capturedAt: '2026-05-15T06:00:00.000Z',
  });

  assert.equal(point.projectId, 'p-shanghai');
  assert.equal(point.deviceId, 'd-1001');
  assert.equal(point.longitude, 121.5);
  assert.equal(point.latitude, 31.2);
  assert.equal(point.lng, 121.5);
  assert.equal(point.lat, 31.2);
  assert.equal(point.battery, 88);
  assert.equal(point.appVersion, '0.2.0');
  assert.equal(point.provider, 'amap');
  assert.equal(point.accuracy, 12);
  assert.equal(point.source, 'android');
  assert.equal(point.timestamp, '2026-05-15T06:00:00.000Z');
});

test('ingestLocation still accepts lng and lat fields from the Web simulator', async () => {
  const service = new DataService();

  const point = await service.ingestLocation({
    deviceId: 'd-1001',
    lng: 121.61,
    lat: 31.31,
    source: 'web-simulator',
  });

  assert.equal(point.longitude, 121.61);
  assert.equal(point.latitude, 31.31);
  assert.equal(point.source, 'web-simulator');
  assert.equal((await service.latest()).length, 0);
  assert.equal((await service.listDevices()).length, 0);
});

test('seed demo data is hidden from public lists', async () => {
  const service = new DataService();

  assert.equal((await service.latest()).length, 0);
  assert.equal((await service.listDevices()).length, 0);
  assert.equal((await service.listProjects()).length, 0);
  assert.equal((await service.overview()).deviceTotal, 0);
  assert.equal((await service.overview()).projectTotal, 0);
  assert.equal((await service.overview()).todayActive, 0);
});

test('ingestLocation rejects mismatched projectId', async () => {
  const service = new DataService();

  await assert.rejects(
    () => service.ingestLocation({
      projectId: 'p-hangzhou',
      deviceId: 'd-1001',
      longitude: 121.5,
      latitude: 31.2,
    }),
    BadRequestException,
  );
});

test('track returns timestamp-sorted points for one device', async () => {
  const service = new DataService();

  await service.ingestLocation({ deviceId: 'd-1001', longitude: 121.7, latitude: 31.4, appVersion: '0.2.0', capturedAt: '2026-05-15T06:10:00.000Z' });
  await service.ingestLocation({ deviceId: 'd-1001', longitude: 121.6, latitude: 31.3, appVersion: '0.2.0', capturedAt: '2026-05-15T06:05:00.000Z' });

  const track = await service.track('d-1001');
  const timestamps = track.map((point) => point.timestamp);

  assert.deepEqual([...timestamps].sort(), timestamps);
  assert.ok(track.every((point) => point.deviceId === 'd-1001'));
});

test('nearby returns latest device locations ordered by distance', async () => {
  const service = new DataService();

  await service.ingestLocation({
    projectId: 'p-shanghai',
    deviceId: 'd-nearby-1',
    deviceName: '附近测试手机 1',
    longitude: 120.1569,
    latitude: 30.7964,
    appVersion: '0.2.0',
    capturedAt: '2026-05-15T06:00:00.000Z',
  });
  await service.ingestLocation({
    projectId: 'p-shanghai',
    deviceId: 'd-nearby-2',
    deviceName: '附近测试手机 2',
    longitude: 120.18,
    latitude: 30.81,
    appVersion: '0.2.0',
    capturedAt: '2026-05-15T06:01:00.000Z',
  });
  await service.ingestLocation({
    projectId: 'p-hangzhou',
    deviceId: 'd-nearby-hz',
    deviceName: '杭州测试手机',
    longitude: 120.1551,
    latitude: 30.2741,
    appVersion: '0.2.0',
    capturedAt: '2026-05-15T06:02:00.000Z',
  });

  const nearby = await service.nearby({ longitude: 120.1569, latitude: 30.7964, radiusMeters: 5_000 });

  assert.deepEqual(nearby.map((point) => point.deviceId), ['d-nearby-1', 'd-nearby-2']);
  assert.equal(nearby[0].distanceMeters, 0);
  assert.ok(nearby[1].distanceMeters > nearby[0].distanceMeters);
});

test('nearby supports project filtering and validates query bounds', async () => {
  const service = new DataService();

  await service.ingestLocation({
    projectId: 'p-shanghai',
    deviceId: 'd-nearby-project',
    deviceName: '上海附近测试手机',
    longitude: 120.1569,
    latitude: 30.7964,
    appVersion: '0.2.0',
  });

  assert.equal((await service.nearby({ longitude: 120.1569, latitude: 30.7964, radiusMeters: 500, projectId: 'p-hangzhou' })).length, 0);
  await assert.rejects(() => service.nearby({ longitude: 181, latitude: 30.7964 }), BadRequestException);
  await assert.rejects(() => service.nearby({ longitude: 120.1569, latitude: 30.7964, radiusMeters: 0 }), BadRequestException);
  await assert.rejects(() => service.nearby({ longitude: 120.1569, latitude: 30.7964, limit: 501 }), BadRequestException);
});

test('geofences can be created, listed, and evaluated against latest devices', async () => {
  const service = new DataService();

  await service.ingestLocation({
    projectId: 'p-shanghai',
    deviceId: 'd-geofence-inside',
    deviceName: '围栏内测试手机',
    longitude: 120.1569,
    latitude: 30.7964,
    appVersion: '0.2.0',
  });
  await service.ingestLocation({
    projectId: 'p-shanghai',
    deviceId: 'd-geofence-outside',
    deviceName: '围栏外测试手机',
    longitude: 120.25,
    latitude: 30.9,
    appVersion: '0.2.0',
  });

  const geofence = await service.createGeofence({
    projectId: 'p-shanghai',
    name: '杭州北测试围栏',
    longitude: 120.1569,
    latitude: 30.7964,
    radiusMeters: 500,
  });

  assert.equal(geofence.name, '杭州北测试围栏');
  assert.ok((await service.listGeofences('p-shanghai')).some((item) => item.id === geofence.id));

  const result = await service.geofenceDevices(geofence.id);
  assert.equal(result.geofence.id, geofence.id);
  assert.deepEqual(result.devices.map((point) => point.deviceId), ['d-geofence-inside']);
});

test('paused geofences return no devices and invalid geofence inputs are rejected', async () => {
  const service = new DataService();

  const geofence = await service.createGeofence({
    projectId: 'p-shanghai',
    longitude: 120.1569,
    latitude: 30.7964,
    radiusMeters: 500,
    status: 'paused',
  });

  assert.equal((await service.geofenceDevices(geofence.id)).devices.length, 0);
  await assert.rejects(() => service.createGeofence({ projectId: 'p-shanghai', longitude: 120.1569, latitude: 91 }), BadRequestException);
  await assert.rejects(() => service.createGeofence({ projectId: 'p-shanghai', longitude: 120.1569, latitude: 30.7964, radiusMeters: 0 }), BadRequestException);
  await assert.rejects(() => service.geofenceDevices('missing-geofence'), /Geofence not found/);
});

test('android location uploads create geofence alert events', async () => {
  const service = new DataService();

  const geofence = await service.createGeofence({
    projectId: 'p-shanghai',
    name: '告警测试围栏',
    longitude: 120.1569,
    latitude: 30.7964,
    radiusMeters: 500,
  });

  await service.ingestLocation({
    projectId: 'p-shanghai',
    deviceId: 'd-alert-inside',
    deviceName: '告警测试手机',
    longitude: 120.1569,
    latitude: 30.7964,
    appVersion: '0.2.0',
  });
  await service.ingestLocation({
    projectId: 'p-shanghai',
    deviceId: 'd-alert-outside',
    deviceName: '围栏外手机',
    longitude: 120.25,
    latitude: 30.9,
    appVersion: '0.2.0',
  });

  const alerts = await service.listAlerts({ projectId: 'p-shanghai' });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].type, 'geofence_enter');
  assert.equal(alerts[0].geofenceId, geofence.id);
  assert.equal(alerts[0].deviceId, 'd-alert-inside');
  assert.equal(alerts[0].distanceMeters, 0);
  assert.equal(alerts[0].status, 'open');
});

test('alert events can be acknowledged and resolved', async () => {
  const service = new DataService();
  const geofence = await service.createGeofence({
    projectId: 'p-shanghai',
    name: '处置测试围栏',
    longitude: 120.1569,
    latitude: 30.7964,
    radiusMeters: 300,
  });
  await service.ingestLocation({
    projectId: 'p-shanghai',
    deviceId: 'd-alert-handle',
    deviceName: '告警处置测试手机',
    longitude: geofence.longitude,
    latitude: geofence.latitude,
    appVersion: '0.2.0',
  });

  const [alert] = await service.listAlerts({ projectId: 'p-shanghai', status: 'open' });
  const acknowledged = await service.updateAlert(alert.id, {
    status: 'acknowledged',
    handledBy: '调度甲',
    handledNote: '已电话确认',
  });
  assert.equal(acknowledged.status, 'acknowledged');
  assert.equal(acknowledged.handledBy, '调度甲');
  assert.equal(acknowledged.handledNote, '已电话确认');
  assert.ok(acknowledged.handledAt);
  assert.equal((await service.listAlerts({ projectId: 'p-shanghai', status: 'open' })).length, 0);

  const resolved = await service.updateAlert(alert.id, { status: 'resolved', handledBy: '调度乙' });
  assert.equal(resolved.status, 'resolved');
  assert.equal((await service.listAlerts({ projectId: 'p-shanghai', status: 'resolved' })).length, 1);
});

test('project members can own alert dispatch', async () => {
  const service = new DataService();
  const member = await service.createMember({
    projectId: 'p-shanghai',
    name: '派单调度甲',
    role: 'dispatcher',
    phone: '13900009999',
  });
  const geofence = await service.createGeofence({
    projectId: 'p-shanghai',
    name: '派单测试围栏',
    longitude: 120.1569,
    latitude: 30.7964,
    radiusMeters: 300,
  });
  await service.ingestLocation({
    projectId: 'p-shanghai',
    deviceId: 'd-alert-dispatch',
    deviceName: '派单测试手机',
    longitude: geofence.longitude,
    latitude: geofence.latitude,
    appVersion: '0.2.0',
  });

  assert.ok((await service.listMembers('p-shanghai')).some((item) => item.id === member.id));
  const [alert] = await service.listAlerts({ projectId: 'p-shanghai', status: 'open' });
  const dispatched = await service.updateAlert(alert.id, {
    status: 'acknowledged',
    assignedTo: member.id,
    handledBy: '值班主管',
    handledNote: '派单处理',
  });
  assert.equal(dispatched.assignedTo, member.id);
  assert.equal(dispatched.assignedToName, member.name);
  assert.equal(dispatched.status, 'acknowledged');

  await assert.rejects(() => service.createMember({ projectId: 'p-shanghai', name: '坏角色', role: 'bad' as never }), BadRequestException);
  await assert.rejects(() => service.updateAlert(alert.id, { assignedTo: 'missing-member' }), /Project member not found/);
});

test('reportSummary aggregates alerts, routes, geofences, and device assignments', async () => {
  const service = new DataService();
  const route = await service.createRouteCorridor({
    projectId: 'p-shanghai',
    name: '报表路线',
    route: [
      { longitude: 120.1569, latitude: 30.7964 },
      { longitude: 120.158, latitude: 30.797 },
    ],
  });
  const device = await service.createDevice({ projectId: 'p-shanghai', name: '报表设备' });
  await service.assignDeviceRoute(device.id, route.id);
  const geofence = await service.createGeofence({
    projectId: 'p-shanghai',
    name: '报表围栏',
    longitude: 120.1569,
    latitude: 30.7964,
    radiusMeters: 300,
  });
  await service.ingestLocation({
    projectId: 'p-shanghai',
    deviceId: device.id,
    longitude: geofence.longitude,
    latitude: geofence.latitude,
    appVersion: '0.2.0',
  });

  const summary = await service.reportSummary('p-shanghai');
  assert.equal(summary.deviceTotal, 1);
  assert.equal(summary.routeAssignedTotal, 1);
  assert.equal(summary.geofenceTotal, 1);
  assert.equal(summary.routeTotal, 1);
  assert.equal(summary.openAlertTotal, 1);
  assert.equal(summary.alertTotal, 1);
});

test('report export returns csv metrics', async () => {
  const service = new DataService();
  const exported = await service.exportReport('p-shanghai');

  assert.equal(typeof exported, 'string');
  const csv = String(exported);
  assert.match(csv, /"metric","value"/);
  assert.match(csv, /"projectId","p-shanghai"/);
  assert.match(csv, /"deviceTotal","0"/);
});

test('routeDeviation reports points outside the route corridor', async () => {
  const service = new DataService();

  await service.ingestLocation({
    projectId: 'p-shanghai',
    deviceId: 'd-route-check',
    deviceName: '路线偏离测试手机',
    longitude: 120.1569,
    latitude: 30.7964,
    appVersion: '0.2.0',
    capturedAt: '2026-05-15T06:00:00.000Z',
  });
  await service.ingestLocation({
    projectId: 'p-shanghai',
    deviceId: 'd-route-check',
    longitude: 120.1574,
    latitude: 30.7967,
    appVersion: '0.2.0',
    capturedAt: '2026-05-15T06:01:00.000Z',
  });
  await service.ingestLocation({
    projectId: 'p-shanghai',
    deviceId: 'd-route-check',
    longitude: 120.18,
    latitude: 30.83,
    appVersion: '0.2.0',
    capturedAt: '2026-05-15T06:02:00.000Z',
  });

  const result = await service.routeDeviation({
    projectId: 'p-shanghai',
    deviceId: 'd-route-check',
    toleranceMeters: 200,
    route: [
      { longitude: 120.1569, latitude: 30.7964 },
      { longitude: 120.158, latitude: 30.797 },
    ],
  });

  assert.equal(result.checkedPoints, 3);
  assert.equal(result.deviatedPoints.length, 1);
  assert.equal(result.deviatedPoints[0].deviceId, 'd-route-check');
  assert.ok(result.maxDistanceMeters > 200);
});

test('routeDeviation validates route input', async () => {
  const service = new DataService();

  await assert.rejects(() => service.routeDeviation({ route: [{ longitude: 120.1569, latitude: 30.7964 }] }), BadRequestException);
  await assert.rejects(() => service.routeDeviation({ deviceId: 'd-route-check', route: [{ longitude: 120.1569, latitude: 30.7964 }] }), BadRequestException);
  await assert.rejects(
    () => service.routeDeviation({
      deviceId: 'd-route-check',
      toleranceMeters: 0,
      route: [
        { longitude: 120.1569, latitude: 30.7964 },
        { longitude: 120.158, latitude: 30.797 },
      ],
    }),
    BadRequestException,
  );
});

test('route corridors can be saved, listed, and reused for deviation checks', async () => {
  const service = new DataService();
  const corridor = await service.createRouteCorridor({
    projectId: 'p-shanghai',
    name: '上海测试路线',
    toleranceMeters: 200,
    route: [
      { longitude: 120.1569, latitude: 30.7964 },
      { longitude: 120.158, latitude: 30.797 },
    ],
  });

  await service.createRouteCorridor({
    projectId: 'p-hangzhou',
    name: '杭州测试路线',
    route: [
      { longitude: 120.1, latitude: 30.1 },
      { longitude: 120.2, latitude: 30.2 },
    ],
  });

  await service.ingestLocation({
    projectId: 'p-shanghai',
    deviceId: 'd-saved-route',
    deviceName: '保存路线测试手机',
    longitude: 120.18,
    latitude: 30.83,
    appVersion: '0.2.0',
  });

  const routes = await service.listRouteCorridors('p-shanghai');
  assert.equal(routes.length, 1);
  assert.equal(routes[0].id, corridor.id);
  assert.equal(routes[0].route[0].lng, 120.1569);

  const result = await service.routeDeviation({ projectId: 'p-shanghai', deviceId: 'd-saved-route', routeId: corridor.id });
  assert.equal(result.routeId, corridor.id);
  assert.equal(result.toleranceMeters, 200);
  assert.equal(result.deviatedPoints.length, 1);
});

test('paused route corridors cannot be used for deviation checks', async () => {
  const service = new DataService();
  const corridor = await service.createRouteCorridor({
    projectId: 'p-shanghai',
    name: '暂停路线',
    status: 'paused',
    route: [
      { longitude: 120.1569, latitude: 30.7964 },
      { longitude: 120.158, latitude: 30.797 },
    ],
  });

  await assert.rejects(() => service.routeDeviation({ deviceId: 'd-route-check', routeId: corridor.id }), /route corridor is paused/);
});

test('devices can be assigned to saved route corridors', async () => {
  const service = new DataService();
  const corridor = await service.createRouteCorridor({
    projectId: 'p-shanghai',
    name: '设备分配路线',
    toleranceMeters: 120,
    route: [
      { longitude: 120.1569, latitude: 30.7964 },
      { longitude: 120.158, latitude: 30.797 },
    ],
  });
  const device = await service.createDevice({
    projectId: 'p-shanghai',
    name: '分配路线测试设备',
    owner: '测试人员',
  });
  await service.ingestLocation({
    projectId: 'p-shanghai',
    deviceId: device.id,
    longitude: 120.18,
    latitude: 30.83,
    appVersion: '0.2.0',
  });

  const assigned = await service.assignDeviceRoute(device.id, corridor.id);
  assert.equal(assigned.routeId, corridor.id);

  const result = await service.routeDeviation({ projectId: 'p-shanghai', deviceId: device.id });
  assert.equal(result.routeId, corridor.id);
  assert.equal(result.toleranceMeters, 120);
  assert.equal(result.deviatedPoints.length, 1);

  const cleared = await service.assignDeviceRoute(device.id, null);
  assert.equal(cleared.routeId, undefined);
  await assert.rejects(() => service.routeDeviation({ projectId: 'p-shanghai', deviceId: device.id }), /route or routeId is required/);
});

test('device route assignment validates project ownership', async () => {
  const service = new DataService();
  const route = await service.createRouteCorridor({
    projectId: 'p-hangzhou',
    route: [
      { longitude: 120.1, latitude: 30.1 },
      { longitude: 120.2, latitude: 30.2 },
    ],
  });
  const device = await service.createDevice({ projectId: 'p-shanghai' });

  await assert.rejects(() => service.assignDeviceRoute(device.id, route.id), /route projectId does not match device project/);
});

test('ingestLocation creates unknown Android devices from payload metadata', async () => {
  const service = new DataService();

  const point = await service.ingestLocation({
    projectId: 'p-shanghai',
    deviceId: 'd-android-001',
    deviceName: 'Android 测试手机',
    longitude: 121.5,
    latitude: 31.2,
    appVersion: '0.2.0',
  });

  assert.equal(point.deviceId, 'd-android-001');
  assert.equal(point.deviceName, 'Android 测试手机');
  assert.ok((await service.listDevices('p-shanghai')).some((device) => device.id === 'd-android-001'));
  assert.ok((await service.listProjects()).some((project) => project.id === 'p-shanghai'));
});

test('ingestLocation rejects known Android emulator mock coordinate', async () => {
  const service = new DataService();

  await assert.rejects(
    () => service.ingestLocation({
      projectId: 'p-shanghai',
      deviceId: 'd-android-001',
      deviceName: 'Android 测试手机',
      longitude: -122.084,
      latitude: 37.421998333333335,
      appVersion: '0.2.0',
    }),
    BadRequestException,
  );
});

test('ingestLocation rejects old Android APK uploads without appVersion', async () => {
  const service = new DataService();

  await assert.rejects(
    () => service.ingestLocation({
      projectId: 'p-shanghai',
      deviceId: 'd-android-001',
      deviceName: 'Android 测试手机',
      longitude: 121.504,
      latitude: 31.234,
      speed: 43.2,
      source: 'android',
    }),
    BadRequestException,
  );
});

test('ingestLocation rejects Android mock flag', async () => {
  const service = new DataService();

  await assert.rejects(
    () => service.ingestLocation({
      projectId: 'p-shanghai',
      deviceId: 'd-android-001',
      deviceName: 'Android 测试手机',
      longitude: 120.16,
      latitude: 30.79,
      appVersion: '0.2.0',
      source: 'android',
      mock: true,
    }),
    BadRequestException,
  );
});

test('DataService persists Android locations across service instances', async () => {
  const previousDataFile = process.env.WULIU_DATA_FILE;
  const previousLifecycle = process.env.npm_lifecycle_event;
  const directory = mkdtempSync(join(tmpdir(), 'wuliu-data-'));
  process.env.WULIU_DATA_FILE = join(directory, 'runtime.json');
  delete process.env.npm_lifecycle_event;

  try {
    const first = new DataService();
    await first.ingestLocation({
      projectId: 'p-shanghai',
      deviceId: 'd-android-persist',
      deviceName: '持久化测试手机',
      longitude: 121.7,
      latitude: 31.4,
      source: 'android',
      appVersion: '0.2.0',
    });

    const second = new DataService();
    assert.ok((await second.listDevices()).some((device) => device.id === 'd-android-persist'));
    assert.ok((await second.latest()).some((point) => point.deviceId === 'd-android-persist'));
  } finally {
    if (previousDataFile === undefined) {
      delete process.env.WULIU_DATA_FILE;
    } else {
      process.env.WULIU_DATA_FILE = previousDataFile;
    }
    if (previousLifecycle === undefined) {
      delete process.env.npm_lifecycle_event;
    } else {
      process.env.npm_lifecycle_event = previousLifecycle;
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
