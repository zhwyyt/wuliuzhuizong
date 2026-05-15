import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
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
  assert.equal(service.latest().length, 0);
  assert.equal(service.listDevices().length, 0);
});

test('seed demo data is hidden from public lists', () => {
  const service = new DataService();

  assert.equal(service.latest().length, 0);
  assert.equal(service.listDevices().length, 0);
  assert.equal(service.listProjects().length, 0);
  assert.equal(service.overview().deviceTotal, 0);
  assert.equal(service.overview().projectTotal, 0);
  assert.equal(service.overview().todayActive, 0);
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

test('ingestLocation creates unknown Android devices from payload metadata', () => {
  const service = new DataService();

  const point = service.ingestLocation({
    projectId: 'p-shanghai',
    deviceId: 'd-android-001',
    deviceName: 'Android 测试手机',
    longitude: 121.5,
    latitude: 31.2,
  });

  assert.equal(point.deviceId, 'd-android-001');
  assert.equal(point.deviceName, 'Android 测试手机');
  assert.ok(service.listDevices('p-shanghai').some((device) => device.id === 'd-android-001'));
  assert.ok(service.listProjects().some((project) => project.id === 'p-shanghai'));
});

test('ingestLocation rejects known Android emulator mock coordinate', () => {
  const service = new DataService();

  assert.throws(
    () => service.ingestLocation({
      projectId: 'p-shanghai',
      deviceId: 'd-android-001',
      deviceName: 'Android 测试手机',
      longitude: -122.084,
      latitude: 37.421998333333335,
    }),
    BadRequestException,
  );
});
