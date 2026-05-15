import { Injectable, NotFoundException } from '@nestjs/common';
import { Device, DeviceStatus, LatestLocation, LocationPoint, Project, User } from './domain';

const now = () => new Date().toISOString();

@Injectable()
export class DataService {
  private users: User[] = [{ id: 'u-admin', name: '调度管理员', role: 'admin' }];

  private projects: Project[] = [
    { id: 'p-shanghai', name: '上海冷链配送', city: '上海', manager: '周经理', status: 'active', createdAt: now() },
    { id: 'p-hangzhou', name: '杭州同城运输', city: '杭州', manager: '林经理', status: 'active', createdAt: now() },
    { id: 'p-suzhou', name: '苏州仓配项目', city: '苏州', manager: '陈经理', status: 'paused', createdAt: now() },
  ];

  private devices: Device[] = [
    { id: 'd-1001', projectId: 'p-shanghai', name: '沪A-手机-001', owner: '王师傅', phone: '13800000001', status: 'online' },
    { id: 'd-1002', projectId: 'p-shanghai', name: '沪A-手机-002', owner: '李师傅', phone: '13800000002', status: 'alert' },
    { id: 'd-2001', projectId: 'p-hangzhou', name: '浙A-手机-001', owner: '赵师傅', phone: '13800000003', status: 'online' },
    { id: 'd-3001', projectId: 'p-suzhou', name: '苏E-手机-001', owner: '孙师傅', phone: '13800000004', status: 'idle' },
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
    return this.projects.map((project) => ({
      ...project,
      deviceCount: this.devices.filter((device) => device.projectId === project.id).length,
      onlineCount: this.devices.filter((device) => device.projectId === project.id && device.status === 'online').length,
      alertCount: this.devices.filter((device) => device.projectId === project.id && device.status === 'alert').length,
    }));
  }

  createProject(input: Partial<Project>): Project {
    const project: Project = {
      id: `p-${Date.now()}`,
      name: input.name?.trim() || '新建物流项目',
      city: input.city?.trim() || '未设置',
      manager: input.manager?.trim() || '未设置',
      status: input.status ?? 'active',
      createdAt: now(),
    };
    this.projects.unshift(project);
    return project;
  }

  listDevices(projectId?: string): Device[] {
    return this.devices.filter((device) => !projectId || device.projectId === projectId);
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
      owner: input.owner?.trim() || '未绑定人员',
      phone: input.phone?.trim() || '',
      status: input.status ?? 'offline',
    };
    this.devices.unshift(device);
    return device;
  }

  ingestLocation(input: Partial<LocationPoint>): LatestLocation {
    const device = this.devices.find((item) => item.id === input.deviceId);
    if (!device) {
      throw new NotFoundException('Device not found');
    }
    const status = input.status ?? 'online';
    device.status = status;
    const point: LocationPoint = {
      id: `l-${Date.now()}`,
      projectId: device.projectId,
      deviceId: device.id,
      lng: Number(input.lng),
      lat: Number(input.lat),
      speed: Number(input.speed ?? 0),
      heading: Number(input.heading ?? 0),
      status,
      timestamp: input.timestamp || now(),
    };
    this.locations.push(point);
    return this.toLatest(point);
  }

  latest(projectId?: string): LatestLocation[] {
    const byDevice = new Map<string, LocationPoint>();
    for (const point of this.locations) {
      if (!projectId || point.projectId === projectId) {
        byDevice.set(point.deviceId, point);
      }
    }
    return [...byDevice.values()].map((point) => this.toLatest(point));
  }

  track(deviceId: string, projectId?: string): LocationPoint[] {
    return this.locations
      .filter((point) => point.deviceId === deviceId && (!projectId || point.projectId === projectId))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  overview(projectId?: string) {
    const projects = projectId ? this.projects.filter((project) => project.id === projectId) : this.projects;
    const projectIds = new Set(projects.map((project) => project.id));
    const devices = this.devices.filter((device) => projectIds.has(device.projectId));
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

  private point(deviceId: string, lng: number, lat: number, speed: number, heading: number, status: DeviceStatus, minutesOffset: number): LocationPoint {
    const device = this.devices.find((item) => item.id === deviceId);
    if (!device) {
      throw new Error(`Missing seed device ${deviceId}`);
    }
    return {
      id: `seed-${deviceId}-${minutesOffset}`,
      projectId: device.projectId,
      deviceId,
      lng,
      lat,
      speed,
      heading,
      status,
      timestamp: new Date(Date.now() + minutesOffset * 60_000).toISOString(),
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
