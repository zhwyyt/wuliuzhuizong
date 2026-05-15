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

@Injectable()
export class DataService {
  private users: User[] = [{ id: 'u-admin', name: '调度管理员', role: 'admin' }];

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

  private locations: LocationPoint[] = [
    this.point('d-1001', 121.4737, 31.2304, 42, 80, 'online', -36),
    this.point('d-1001', 121.493, 31.235, 45, 86, 'online', -18),
    this.point('d-1001', 121.512, 31.241, 38, 91, 'online', -2),
    this.point('d-1002', 121.42, 31.19, 0, 20, 'alert', -5),
    this.point('d-2001', 120.1551, 30.2741, 36, 120, 'online', -8),
    this.point('d-3001', 120.5853, 31.2989, 8, 15, 'idle', -12),
  ];

  login(name?: string): User {
    const user = { ...this.users[0], name: name?.trim() || this.users[0].name };
    this.users[0] = user;
    return user;
  }

  listProjects() {
    const visibleDevices = this.visibleDevices();
    return this.projects
      .map((project) => ({
        ...project,
        deviceCount: visibleDevices.filter((device) => device.projectId === project.id).length,
        onlineCount: visibleDevices.filter((device) => device.projectId === project.id && device.status === 'online').length,
        alertCount: visibleDevices.filter((device) => device.projectId === project.id && device.status === 'alert').length,
      }))
      .filter((project) => project.deviceCount > 0);
  }

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

  listDevices(projectId?: string): Device[] {
    return this.visibleDevices().filter((device) => !projectId || device.projectId === projectId);
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

  ingestLocation(input: LocationInput): LatestLocation {
    const device = this.resolveIngestDevice(input);
    if (input.projectId && input.projectId !== device.projectId) {
      throw new BadRequestException('projectId does not match device project');
    }

    const longitude = toNumber(input.longitude ?? input.lng, 'longitude');
    const latitude = toNumber(input.latitude ?? input.lat, 'latitude');
    if (this.isKnownMockCoordinate(longitude, latitude)) {
      throw new BadRequestException('mock location is not accepted');
    }
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

  private isKnownMockCoordinate(longitude: number, latitude: number): boolean {
    return Math.abs(longitude - -122.084) < 0.000001 && Math.abs(latitude - 37.421998333333335) < 0.000001;
  }

  private resolveIngestDevice(input: LocationInput): Device {
    if (!input.deviceId?.trim()) {
      throw new BadRequestException('deviceId is required');
    }
    const existing = this.devices.find((item) => item.id === input.deviceId);
    if (existing) {
      return existing;
    }
    const projectId = input.projectId || this.projects[0]?.id;
    if (!this.projects.some((project) => project.id === projectId)) {
      throw new NotFoundException('Project not found');
    }
    const device: Device = {
      id: input.deviceId,
      projectId,
      name: input.deviceName?.trim() || input.deviceId,
      type: 'phone',
      owner: input.owner?.trim() || 'Android 采集端',
      phone: input.phone?.trim() || '',
      status: input.status ?? 'online',
    };
    this.devices.unshift(device);
    return device;
  }

  latest(projectId?: string): LatestLocation[] {
    const byDevice = new Map<string, LocationPoint>();
    for (const point of this.visibleLocations()) {
      if (!projectId || point.projectId === projectId) {
        byDevice.set(point.deviceId, point);
      }
    }
    return [...byDevice.values()].map((point) => this.toLatest(point));
  }

  track(deviceId: string, projectId?: string): LocationPoint[] {
    return this.visibleLocations()
      .filter((point) => point.deviceId === deviceId && (!projectId || point.projectId === projectId))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  overview(projectId?: string) {
    const visibleProjectIds = new Set(this.visibleDevices().map((device) => device.projectId));
    const projects = (projectId ? this.projects.filter((project) => project.id === projectId) : this.projects).filter((project) =>
      visibleProjectIds.has(project.id),
    );
    const projectIds = new Set(projects.map((project) => project.id));
    const devices = this.visibleDevices().filter((device) => projectIds.has(device.projectId));
    const latest = this.latest(projectId);
    return {
      projectTotal: projects.length,
      deviceTotal: devices.length,
      onlineTotal: devices.filter((device) => device.status === 'online').length,
      todayActive: latest.length,
      alertTotal: devices.filter((device) => device.status === 'alert').length,
      projects: this.listProjects().filter((project) => projectIds.has(project.id)),
      latest,
    };
  }

  private visibleLocations(): LocationPoint[] {
    return this.locations.filter((point) => point.source === 'android');
  }

  private visibleDevices(): Device[] {
    const visibleDeviceIds = new Set(this.visibleLocations().map((point) => point.deviceId));
    return this.devices.filter((device) => visibleDeviceIds.has(device.id));
  }

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

  private toLatest(point: LocationPoint): LatestLocation {
    const project = this.projects.find((item) => item.id === point.projectId);
    const device = this.devices.find((item) => item.id === point.deviceId);
    return {
      ...point,
      projectName: project?.name ?? '未知项目',
      deviceName: device?.name ?? '未知设备',
      owner: device?.owner ?? '未知人员',
    };
  }
}
