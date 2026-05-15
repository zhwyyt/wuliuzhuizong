import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DataService } from './data.service';

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
