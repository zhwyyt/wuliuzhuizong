import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Pool } from 'pg';
import {
  AlertEvent,
  AlertEventStatus,
  AlertEventUpdateInput,
  AuthResult,
  Device,
  DeviceStatus,
  Geofence,
  GeofenceInput,
  LatestLocation,
  LocationInput,
  LocationPoint,
  NearbyLocation,
  Project,
  ProjectMember,
  ProjectMemberInput,
  ProjectMemberRole,
  ReportSummary,
  RouteCorridor,
  RouteCorridorInput,
  RouteDeviationInput,
  RouteDeviationPoint,
  RouteDeviationResult,
  RoutePointInput,
  User,
} from './domain';

const now = () => new Date().toISOString();
const toNumber = (value: number | string | undefined, field: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new BadRequestException(`${field} must be a valid number`);
  }
  return parsed;
};

const toIso = (value: Date | string | null | undefined): string | undefined => {
  if (value === null || value === undefined) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

const DEFAULT_NEARBY_RADIUS_METERS = 5_000;
const DEFAULT_NEARBY_LIMIT = 50;
const DEFAULT_ALERT_LIMIT = 100;
const DEFAULT_ROUTE_TOLERANCE_METERS = 150;
const EARTH_RADIUS_METERS = 6_371_000;

type NearbyInput = {
  longitude?: number | string;
  latitude?: number | string;
  radiusMeters?: number | string;
  projectId?: string;
  limit?: number | string;
};

interface DataState {
  users: User[];
  projects: Project[];
  members: ProjectMemberRecord[];
  devices: Device[];
  locations: LocationPoint[];
  geofences: Geofence[];
  alerts: AlertEvent[];
  routeCorridors: RouteCorridor[];
}

type AuthSession = {
  token: string;
  user: User;
  expiresAt: string;
};

type AlertListInput = {
  projectId?: string;
  deviceId?: string;
  status?: string;
  limit?: number | string;
};

type ReportExportFormat = 'csv' | 'json';

type ProjectRow = {
  id: string;
  name: string;
  region: string;
  description: string;
  status: Project['status'];
  created_at: Date | string;
};

type ProjectMemberRow = {
  id: string;
  project_id: string;
  name: string;
  role: ProjectMemberRole;
  phone: string;
  password?: string | null;
  created_at: Date | string;
};

type ProjectMemberRecord = ProjectMember & {
  password: string;
};

type DeviceRow = {
  id: string;
  project_id: string;
  name: string;
  type: Device['type'];
  owner: string;
  phone: string;
  status: DeviceStatus;
  last_seen_at?: Date | string | null;
  route_id?: string | null;
  device_token?: string | null;
};

type LocationRow = {
  id: string;
  project_id: string;
  device_id: string;
  longitude: number;
  latitude: number;
  lng: number;
  lat: number;
  speed: number;
  heading: number;
  battery?: number | null;
  accuracy?: number | null;
  provider?: string | null;
  mock?: boolean | null;
  app_version?: string | null;
  app_version_code?: number | null;
  source: LocationPoint['source'];
  status: DeviceStatus;
  captured_at: Date | string;
  received_at: Date | string;
  timestamp: Date | string;
};

type GeofenceRow = {
  id: string;
  project_id: string;
  name: string;
  longitude: number;
  latitude: number;
  lng: number;
  lat: number;
  radius_meters: number;
  status: Geofence['status'];
  created_at: Date | string;
};

type NearbyLocationRow = LocationRow & {
  project_name?: string | null;
  device_name?: string | null;
  owner?: string | null;
  distance_meters: number;
};

type AlertEventRow = {
  id: string;
  type: AlertEvent['type'];
  project_id: string;
  device_id: string;
  location_id: string;
  geofence_id: string;
  geofence_name: string;
  longitude: number;
  latitude: number;
  distance_meters: number;
  message: string;
  status: AlertEventStatus;
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  handled_by?: string | null;
  handled_note?: string | null;
  handled_at?: Date | string | null;
  created_at: Date | string;
};

type RouteCorridorRow = {
  id: string;
  project_id: string;
  name: string;
  route_points: unknown;
  tolerance_meters: number;
  status: RouteCorridor['status'];
  created_at: Date | string;
};

@Injectable()
export class DataService {
  private pool?: Pool;
  private ready: Promise<void> = Promise.resolve();
  private postgisReady = false;
  private users: User[] = [{ id: 'u-admin', name: '调度管理员', role: 'admin' }];

  private projects: Project[] = [
    { id: 'p-shanghai', name: '上海冷链配送', region: '上海', description: '市内冷链配送演示项目', status: 'active', createdAt: now() },
    { id: 'p-hangzhou', name: '杭州同城运输', region: '杭州', description: '同城干线运输演示项目', status: 'active', createdAt: now() },
    { id: 'p-suzhou', name: '苏州仓配项目', region: '苏州', description: '仓配一体化演示项目', status: 'paused', createdAt: now() },
  ];

  private members: ProjectMemberRecord[] = [
    { id: 'm-sh-admin', projectId: 'p-shanghai', name: '上海项目经理', role: 'manager', phone: '13900001001', password: '123456', createdAt: now() },
    { id: 'm-sh-dispatch', projectId: 'p-shanghai', name: '上海调度员', role: 'dispatcher', phone: '13900001002', password: '123456', createdAt: now() },
    { id: 'm-hz-dispatch', projectId: 'p-hangzhou', name: '杭州调度员', role: 'dispatcher', phone: '13900002001', password: '123456', createdAt: now() },
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

  private geofences: Geofence[] = [];
  private alerts: AlertEvent[] = [];
  private routeCorridors: RouteCorridor[] = [];
  private sessions = new Map<string, AuthSession>();

  constructor() {
    if (this.shouldUsePostgres()) {
      this.ready = this.initializePostgres();
      return;
    }
    this.loadPersistedState();
    this.saveState();
  }

  async login(credentials: { name?: string; phone?: string; password?: string } = {}): Promise<AuthResult> {
    const loginName = credentials.name?.trim();
    const loginPhone = credentials.phone?.trim();
    const loginPassword = credentials.password?.trim();
    let matchedMembers: ProjectMemberRecord[] = [];

    if (loginPhone) {
      matchedMembers = this.members.filter((member) => member.phone === loginPhone);
      if (this.pool) {
        await this.ready;
        const result = await this.pool.query<ProjectMemberRow>('select * from wuliu_project_members where phone = $1', [loginPhone]);
        matchedMembers = result.rows.map((row) => this.memberRecordFromRow(row));
      }
      matchedMembers = matchedMembers.filter((member) => member.password === (loginPassword || ''));
      if (!matchedMembers.length) {
        throw new UnauthorizedException('Invalid phone or password');
      }
    } else if (loginName) {
      matchedMembers = this.members.filter((member) => member.name === loginName);
      if (this.pool) {
        await this.ready;
        const result = await this.pool.query<ProjectMemberRow>('select * from wuliu_project_members where name = $1', [loginName]);
        matchedMembers = result.rows.map((row) => this.memberRecordFromRow(row));
      }
    }

    const projects = matchedMembers.length ? await this.projectsByIds([...new Set(matchedMembers.map((member) => member.projectId))]) : undefined;
    const primaryMember = matchedMembers[0];
    const user: User = matchedMembers.length
      ? {
          id: loginPhone ? `u-phone-${loginPhone}` : `u-member-${primaryMember.id}`,
          name: primaryMember.name,
          role: 'operator',
          projectIds: projects?.map((project) => project.id) ?? [...new Set(matchedMembers.map((member) => member.projectId))],
          phone: primaryMember.phone,
          memberId: primaryMember.id,
        }
      : { ...this.users[0], name: loginName || this.users[0].name, projectIds: undefined, phone: undefined, memberId: undefined };
    if (user.role === 'admin') {
      this.users[0] = user;
    }
    if (this.pool) {
      await this.ready;
      await this.pool.query(
        'insert into wuliu_users (id, name, role) values ($1, $2, $3) on conflict (id) do update set name = excluded.name, role = excluded.role',
        [user.id, user.name, user.role],
      );
    } else if (user.role === 'admin') {
      this.saveState();
    }
    const token = `session-${randomUUID()}`;
    this.sessions.set(token, {
      token,
      user,
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    });
    return {
      token,
      user,
      projects,
      member: primaryMember ? this.toProjectMember(primaryMember) : undefined,
    };
  }

  authenticate(token?: string): User {
    const normalized = token?.replace(/^Bearer\s+/i, '').trim();
    if (!normalized) {
      throw new UnauthorizedException('Missing authorization token');
    }
    const session = this.sessions.get(normalized);
    if (!session || Date.parse(session.expiresAt) <= Date.now()) {
      if (session) this.sessions.delete(normalized);
      throw new UnauthorizedException('Invalid or expired authorization token');
    }
    return session.user;
  }

  verifyDeviceToken(device: Device, token?: string): void {
    const expected = device.deviceToken?.trim();
    if (!expected) {
      return;
    }
    if (!token?.trim() || token.trim() !== expected) {
      throw new UnauthorizedException('Invalid device token');
    }
  }

  private async projectsByIds(projectIds: string[]): Promise<Project[]> {
    if (!projectIds.length) {
      return [];
    }
    if (!this.pool) {
      return this.projects.filter((project) => projectIds.includes(project.id));
    }
    await this.ready;
    const result = await this.pool.query<ProjectRow>(
      'select * from wuliu_projects where id = any($1::text[]) order by created_at desc',
      [projectIds],
    );
    return result.rows.map((row) => this.projectFromRow(row));
  }

  async listProjects() {
    if (!this.pool) {
      const visibleDevices = this.visibleDevices();
      const openAlerts = this.alerts.filter((alert) => alert.status === 'open');
      return this.projects
        .map((project) => ({
          ...project,
          deviceCount: visibleDevices.filter((device) => device.projectId === project.id).length,
          onlineCount: visibleDevices.filter((device) => device.projectId === project.id && device.status === 'online').length,
          alertCount: openAlerts.filter((alert) => alert.projectId === project.id).length,
        }))
        .filter((project) => project.deviceCount > 0);
    }

    await this.ready;
    const result = await this.pool.query(
      `
      with visible_devices as (
        select d.*
        from wuliu_devices d
        where exists (
          select 1 from wuliu_locations l where l.device_id = d.id and l.source = 'android'
        )
      ), open_alerts as (
        select project_id, count(*)::int as alert_count
        from wuliu_alert_events
        where status = 'open'
        group by project_id
      )
      select p.id, p.name, p.region, p.description, p.status, p.created_at,
             count(vd.id)::int as device_count,
             count(vd.id) filter (where vd.status = 'online')::int as online_count,
             coalesce(max(oa.alert_count), 0)::int as alert_count
      from wuliu_projects p
      join visible_devices vd on vd.project_id = p.id
      left join open_alerts oa on oa.project_id = p.id
      group by p.id
      order by p.created_at desc
      `,
    );
    return result.rows.map((row) => ({
      ...this.projectFromRow(row),
      deviceCount: row.device_count,
      onlineCount: row.online_count,
      alertCount: row.alert_count,
    }));
  }

  async createProject(input: Partial<Project>): Promise<Project> {
    const project: Project = {
      id: `p-${Date.now()}`,
      name: input.name?.trim() || '新建物流项目',
      region: input.region?.trim() || '未设置',
      description: input.description?.trim() || '',
      status: input.status ?? 'active',
      createdAt: now(),
    };

    if (this.pool) {
      await this.ready;
      const result = await this.pool.query<ProjectRow>(
        'insert into wuliu_projects (id, name, region, description, status, created_at) values ($1, $2, $3, $4, $5, $6) returning *',
        [project.id, project.name, project.region, project.description, project.status, project.createdAt],
      );
      return this.projectFromRow(result.rows[0]);
    }

    this.projects.unshift(project);
    this.saveState();
    return project;
  }

  async listMembers(projectId?: string): Promise<ProjectMember[]> {
    if (this.pool) {
      await this.ready;
      const params: string[] = [];
      const where = projectId ? 'where project_id = $1' : '';
      if (projectId) params.push(projectId);
      const result = await this.pool.query<ProjectMemberRow>(
        `select * from wuliu_project_members ${where} order by created_at desc`,
        params,
      );
      return result.rows.map((row) => this.memberFromRow(row));
    }

    return this.members
      .filter((member) => !projectId || member.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((member) => this.toProjectMember(member));
  }

  async createMember(input: ProjectMemberInput): Promise<ProjectMember> {
    const projectId = input.projectId || this.projects[0]?.id;
    await this.ensureProjectExists(projectId);
    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException('name is required');
    }
    const phone = input.phone?.trim();
    if (!phone) {
      throw new BadRequestException('phone is required');
    }
    const role = input.role ?? 'dispatcher';
    this.assertMemberRole(role);

    if (this.pool) {
      await this.ready;
      const existing = await this.pool.query<ProjectMemberRow>(
        'select * from wuliu_project_members where project_id = $1 and phone = $2 limit 1',
        [projectId, phone],
      );
      if (existing.rows[0]) {
        throw new BadRequestException('member phone already exists in project');
      }
    } else if (this.members.some((member) => member.projectId === projectId && member.phone === phone)) {
      throw new BadRequestException('member phone already exists in project');
    }

    const member: ProjectMemberRecord = {
      id: `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      projectId,
      name,
      role,
      phone,
      password: input.password?.trim() || '123456',
      createdAt: now(),
    };

    if (this.pool) {
      const result = await this.pool.query<ProjectMemberRow>(
        'insert into wuliu_project_members (id, project_id, name, role, phone, password, created_at) values ($1, $2, $3, $4, $5, $6, $7) returning *',
        [member.id, member.projectId, member.name, member.role, member.phone, member.password, member.createdAt],
      );
      return this.memberFromRow(result.rows[0]);
    }

    this.members.unshift(member);
    this.saveState();
    return this.toProjectMember(member);
  }

  async listDevices(projectId?: string): Promise<Device[]> {
    if (!this.pool) {
      return this.visibleDevices().filter((device) => !projectId || device.projectId === projectId);
    }

    await this.ready;
    const params = projectId ? [projectId] : [];
    const result = await this.pool.query<DeviceRow>(
      `
      select d.*
      from wuliu_devices d
      where exists (
        select 1 from wuliu_locations l where l.device_id = d.id and l.source = 'android'
      )
      ${projectId ? 'and d.project_id = $1' : ''}
      order by d.last_seen_at desc nulls last, d.id
      `,
      params,
    );
    return result.rows.map((row) => this.deviceFromRow(row));
  }

  async createDevice(input: Partial<Device>): Promise<Device> {
    const projectId = input.projectId || this.projects[0]?.id;
    await this.ensureProjectExists(projectId);
    const device: Device = {
      id: `d-${Date.now()}`,
      projectId,
      name: input.name?.trim() || '新手机设备',
      type: input.type ?? 'phone',
      owner: input.owner?.trim() || '未绑定人员',
      phone: input.phone?.trim() || '',
      status: input.status ?? 'offline',
      routeId: input.routeId,
      deviceToken: input.deviceToken?.trim() || `device-${randomUUID()}`,
    };

    if (this.pool) {
      await this.ready;
      const result = await this.pool.query<DeviceRow>(
        'insert into wuliu_devices (id, project_id, name, type, owner, phone, status, route_id, device_token) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *',
        [device.id, device.projectId, device.name, device.type, device.owner, device.phone, device.status, device.routeId ?? null, device.deviceToken],
      );
      return this.deviceFromRow(result.rows[0]);
    }

    this.devices.unshift(device);
    this.saveState();
    return device;
  }

  async assignDeviceRoute(deviceId: string, routeId?: string | null): Promise<Device> {
    const device = await this.findDevice(deviceId);
    const normalizedRouteId = routeId?.trim() || undefined;
    if (normalizedRouteId) {
      const corridor = await this.findRouteCorridor(normalizedRouteId);
      if (corridor.projectId !== device.projectId) {
        throw new BadRequestException('route projectId does not match device project');
      }
    }

    if (this.pool) {
      await this.ready;
      const result = await this.pool.query<DeviceRow>(
        'update wuliu_devices set route_id = $2 where id = $1 returning *',
        [deviceId, normalizedRouteId ?? null],
      );
      return this.deviceFromRow(result.rows[0]);
    }

    device.routeId = normalizedRouteId;
    this.saveState();
    return device;
  }

  async ingestLocation(input: LocationInput, options: { deviceToken?: string; requireDeviceToken?: boolean } = {}): Promise<LatestLocation> {
    const device = await this.resolveIngestDevice(input);
    if (options.requireDeviceToken) {
      this.verifyDeviceToken(device, options.deviceToken ?? input.deviceToken);
    }
    if (input.projectId && input.projectId !== device.projectId) {
      throw new BadRequestException('projectId does not match device project');
    }

    const longitude = toNumber(input.longitude ?? input.lng, 'longitude');
    const latitude = toNumber(input.latitude ?? input.lat, 'latitude');
    const source = input.source ?? 'android';
    const isMock = input.mock === true || input.mock === 'true';
    if (source === 'android' && !input.appVersion?.trim()) {
      throw new BadRequestException('Android app is too old; please install the latest APK');
    }
    if (this.isKnownMockCoordinate(longitude, latitude) || isMock) {
      throw new BadRequestException('mock location is not accepted');
    }
    const status = input.status ?? 'online';
    const capturedAt = input.capturedAt || input.timestamp || now();
    const receivedAt = now();

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
      accuracy: input.accuracy === undefined || input.accuracy === null ? undefined : Number(input.accuracy),
      provider: input.provider,
      mock: isMock,
      appVersion: input.appVersion,
      appVersionCode: input.appVersionCode === undefined ? undefined : Number(input.appVersionCode),
      source,
      status,
      capturedAt,
      receivedAt,
      timestamp: capturedAt,
    };

    if (this.pool) {
      await this.ready;
      await this.pool.query('update wuliu_devices set status = $1, last_seen_at = $2 where id = $3', [status, receivedAt, device.id]);
      const result = await this.pool.query<LocationRow>(
        `
        insert into wuliu_locations (
          id, project_id, device_id, longitude, latitude, lng, lat, speed, heading, battery,
          accuracy, provider, mock, app_version, app_version_code, source, status,
          captured_at, received_at, timestamp
        ) values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
        ) returning *
        `,
        [
          point.id,
          point.projectId,
          point.deviceId,
          point.longitude,
          point.latitude,
          point.lng,
          point.lat,
          point.speed,
          point.heading,
          point.battery,
          point.accuracy,
          point.provider,
          point.mock,
          point.appVersion,
          point.appVersionCode,
          point.source,
          point.status,
          point.capturedAt,
          point.receivedAt,
          point.timestamp,
        ],
      );
      const location = this.locationFromRow(result.rows[0]);
      if (this.postgisReady) {
        await this.pool.query(
          'update wuliu_locations set geog = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography where id = $1',
          [location.id],
        );
      }
      const project = await this.pool.query<{ name: string }>('select name from wuliu_projects where id = $1', [location.projectId]);
      const latest = {
        ...location,
        projectName: project.rows[0]?.name ?? '未知项目',
        deviceName: device.name,
        owner: device.owner,
      };
      await this.evaluateGeofenceAlerts(location, device);
      return latest;
    }

    device.status = status;
    device.lastSeenAt = receivedAt;
    this.locations.push(point);
    await this.evaluateGeofenceAlerts(point, device);
    this.saveState();
    return this.toLatest(point);
  }

  async latest(projectId?: string): Promise<LatestLocation[]> {
    if (!this.pool) {
      const byDevice = new Map<string, LocationPoint>();
      for (const point of this.visibleLocations()) {
        if (!projectId || point.projectId === projectId) {
          byDevice.set(point.deviceId, point);
        }
      }
      return [...byDevice.values()].map((point) => this.toLatest(point));
    }

    await this.ready;
    const params = projectId ? [projectId] : [];
    const result = await this.pool.query(
      `
      with ranked as (
        select l.*, row_number() over (partition by l.device_id order by l.timestamp desc, l.received_at desc) as rank
        from wuliu_locations l
        where l.source = 'android'
        ${projectId ? 'and l.project_id = $1' : ''}
      )
      select ranked.*, p.name as project_name, d.name as device_name, d.owner as owner
      from ranked
      left join wuliu_projects p on p.id = ranked.project_id
      left join wuliu_devices d on d.id = ranked.device_id
      where ranked.rank = 1
      order by ranked.timestamp desc
      `,
      params,
    );
    return result.rows.map((row) => ({
      ...this.locationFromRow(row),
      projectName: row.project_name ?? '未知项目',
      deviceName: row.device_name ?? '未知设备',
      owner: row.owner ?? '未知人员',
    }));
  }

  async nearby(input: NearbyInput): Promise<NearbyLocation[]> {
    const longitude = toNumber(input.longitude, 'longitude');
    const latitude = toNumber(input.latitude, 'latitude');
    this.assertCoordinateRange(longitude, latitude);
    const radiusMeters = input.radiusMeters === undefined ? DEFAULT_NEARBY_RADIUS_METERS : toNumber(input.radiusMeters, 'radiusMeters');
    const limit = input.limit === undefined ? DEFAULT_NEARBY_LIMIT : Math.trunc(toNumber(input.limit, 'limit'));
    if (radiusMeters <= 0) {
      throw new BadRequestException('radiusMeters must be greater than 0');
    }
    if (limit <= 0 || limit > 500) {
      throw new BadRequestException('limit must be between 1 and 500');
    }

    if (!this.pool) {
      return (await this.latest(input.projectId))
        .map((point) => ({
          ...point,
          distanceMeters: this.distanceMeters(latitude, longitude, point.latitude, point.longitude),
        }))
        .filter((point) => point.distanceMeters <= radiusMeters)
        .sort((a, b) => a.distanceMeters - b.distanceMeters)
        .slice(0, limit)
        .map((point) => ({ ...point, distanceMeters: Math.round(point.distanceMeters) }));
    }

    await this.ready;
    if (this.postgisReady) {
      const params: Array<string | number> = [longitude, latitude, radiusMeters, limit];
      if (input.projectId) params.push(input.projectId);
      const result = await this.pool.query<NearbyLocationRow>(
        `
        with origin as (
          select ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography as geog
        ),
        ranked as (
          select l.*, row_number() over (partition by l.device_id order by l.timestamp desc, l.received_at desc) as rank
          from wuliu_locations l
          where l.source = 'android'
          ${input.projectId ? 'and l.project_id = $5' : ''}
        )
        select ranked.*, p.name as project_name, d.name as device_name, d.owner as owner,
               ST_Distance(ranked.geog, origin.geog)::double precision as distance_meters
        from ranked
        cross join origin
        left join wuliu_projects p on p.id = ranked.project_id
        left join wuliu_devices d on d.id = ranked.device_id
        where ranked.rank = 1
          and ranked.geog is not null
          and ST_DWithin(ranked.geog, origin.geog, $3)
        order by distance_meters asc
        limit $4
        `,
        params,
      );
      return result.rows.map((row) => this.nearbyFromRow(row));
    }

    const params: Array<string | number> = [longitude, latitude, radiusMeters, limit];
    if (input.projectId) params.push(input.projectId);
    const result = await this.pool.query<NearbyLocationRow>(
      `
      with ranked as (
        select l.*, row_number() over (partition by l.device_id order by l.timestamp desc, l.received_at desc) as rank
        from wuliu_locations l
        where l.source = 'android'
        ${input.projectId ? 'and l.project_id = $5' : ''}
      ),
      measured as (
        select ranked.*, p.name as project_name, d.name as device_name, d.owner as owner,
               6371000 * 2 * asin(sqrt(least(1,
                 power(sin(radians((ranked.latitude - $2) / 2)), 2) +
                 cos(radians($2)) * cos(radians(ranked.latitude)) *
                 power(sin(radians((ranked.longitude - $1) / 2)), 2)
               ))) as distance_meters
        from ranked
        left join wuliu_projects p on p.id = ranked.project_id
        left join wuliu_devices d on d.id = ranked.device_id
        where ranked.rank = 1
      )
      select *
      from measured
      where distance_meters <= $3
      order by distance_meters asc
      limit $4
      `,
      params,
    );
    return result.rows.map((row) => this.nearbyFromRow(row));
  }

  async listGeofences(projectId?: string): Promise<Geofence[]> {
    if (!this.pool) {
      return this.geofences.filter((geofence) => !projectId || geofence.projectId === projectId);
    }

    await this.ready;
    const params = projectId ? [projectId] : [];
    const result = await this.pool.query<GeofenceRow>(
      `
      select *
      from wuliu_geofences
      ${projectId ? 'where project_id = $1' : ''}
      order by created_at desc
      `,
      params,
    );
    return result.rows.map((row) => this.geofenceFromRow(row));
  }

  async createGeofence(input: GeofenceInput): Promise<Geofence> {
    const projectId = input.projectId || this.projects[0]?.id;
    await this.ensureProjectExists(projectId);
    const longitude = toNumber(input.longitude ?? input.lng, 'longitude');
    const latitude = toNumber(input.latitude ?? input.lat, 'latitude');
    this.assertCoordinateRange(longitude, latitude);
    const radiusMeters = input.radiusMeters === undefined ? DEFAULT_NEARBY_RADIUS_METERS : toNumber(input.radiusMeters, 'radiusMeters');
    if (radiusMeters <= 0) {
      throw new BadRequestException('radiusMeters must be greater than 0');
    }

    const geofence: Geofence = {
      id: `gf-${Date.now()}`,
      projectId,
      name: input.name?.trim() || '新电子围栏',
      longitude,
      latitude,
      lng: longitude,
      lat: latitude,
      radiusMeters,
      status: input.status ?? 'active',
      createdAt: now(),
    };

    if (this.pool) {
      await this.ready;
      const result = await this.pool.query<GeofenceRow>(
        `
        insert into wuliu_geofences (
          id, project_id, name, longitude, latitude, lng, lat, radius_meters, status, created_at
        ) values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        )
        returning *
        `,
        [
          geofence.id,
          geofence.projectId,
          geofence.name,
          geofence.longitude,
          geofence.latitude,
          geofence.lng,
          geofence.lat,
          geofence.radiusMeters,
          geofence.status,
          geofence.createdAt,
        ],
      );
      const created = this.geofenceFromRow(result.rows[0]);
      if (this.postgisReady) {
        await this.pool.query(
          'update wuliu_geofences set geog = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography where id = $1',
          [created.id],
        );
      }
      return created;
    }

    this.geofences.unshift(geofence);
    this.saveState();
    return geofence;
  }

  async geofenceDevices(id: string, limit?: number | string): Promise<{ geofence: Geofence; devices: NearbyLocation[] }> {
    const parsedLimit = limit === undefined ? DEFAULT_NEARBY_LIMIT : Math.trunc(toNumber(limit, 'limit'));
    if (parsedLimit <= 0 || parsedLimit > 500) {
      throw new BadRequestException('limit must be between 1 and 500');
    }
    const geofence = await this.findGeofence(id);
    if (geofence.status !== 'active') {
      return { geofence, devices: [] };
    }
    const devices = await this.nearby({
      longitude: geofence.longitude,
      latitude: geofence.latitude,
      radiusMeters: geofence.radiusMeters,
      projectId: geofence.projectId,
      limit: parsedLimit,
    });
    return { geofence, devices };
  }

  async listAlerts(input: AlertListInput = {}): Promise<AlertEvent[]> {
    const limit = input.limit === undefined ? DEFAULT_ALERT_LIMIT : Math.trunc(toNumber(input.limit, 'limit'));
    if (limit <= 0 || limit > 500) {
      throw new BadRequestException('limit must be between 1 and 500');
    }
    if (input.status) {
      this.assertAlertStatus(input.status);
    }

    if (!this.pool) {
      return this.alerts
        .filter((event) => !input.projectId || event.projectId === input.projectId)
        .filter((event) => !input.deviceId || event.deviceId === input.deviceId)
        .filter((event) => !input.status || event.status === input.status)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit);
    }

    await this.ready;
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (input.projectId) {
      params.push(input.projectId);
      clauses.push(`project_id = $${params.length}`);
    }
    if (input.deviceId) {
      params.push(input.deviceId);
      clauses.push(`device_id = $${params.length}`);
    }
    if (input.status) {
      params.push(input.status);
      clauses.push(`status = $${params.length}`);
    }
    params.push(limit);
    const result = await this.pool.query<AlertEventRow>(
      `
      select *
      from wuliu_alert_events
      ${clauses.length ? `where ${clauses.join(' and ')}` : ''}
      order by created_at desc
      limit $${params.length}
      `,
      params,
    );
    return result.rows.map((row) => this.alertFromRow(row));
  }

  async updateAlert(id: string, input: AlertEventUpdateInput): Promise<AlertEvent> {
    const status = input.status ?? 'acknowledged';
    this.assertAlertStatus(status);
    const assignment = await this.resolveAlertAssignment(input.assignedTo);
    const handledAt = status === 'open' ? undefined : now();
    const handledBy = status === 'open' ? undefined : (input.handledBy?.trim() || this.users[0]?.name || '调度员');
    const handledNote = status === 'open' ? undefined : input.handledNote?.trim();

    if (this.pool) {
      await this.ready;
      const result = await this.pool.query<AlertEventRow>(
        `
        update wuliu_alert_events
        set status = $2,
            assigned_to = case when $3::boolean then $4 else assigned_to end,
            assigned_to_name = case when $3::boolean then $5 else assigned_to_name end,
            handled_by = $6,
            handled_note = $7,
            handled_at = $8
        where id = $1
        returning *
        `,
        [id, status, input.assignedTo !== undefined, assignment.assignedTo ?? null, assignment.assignedToName ?? null, handledBy ?? null, handledNote ?? null, handledAt ?? null],
      );
      if (!result.rows[0]) {
        throw new NotFoundException('Alert event not found');
      }
      return this.alertFromRow(result.rows[0]);
    }

    const alert = this.alerts.find((event) => event.id === id);
    if (!alert) {
      throw new NotFoundException('Alert event not found');
    }
    alert.status = status;
    if (input.assignedTo !== undefined) {
      alert.assignedTo = assignment.assignedTo;
      alert.assignedToName = assignment.assignedToName;
    }
    alert.handledBy = handledBy;
    alert.handledNote = handledNote;
    alert.handledAt = handledAt;
    this.saveState();
    return alert;
  }

  async routeDeviation(input: RouteDeviationInput): Promise<RouteDeviationResult> {
    if (!input.deviceId?.trim()) {
      throw new BadRequestException('deviceId is required');
    }
    const routeId = input.routeId || (input.route ? undefined : (await this.findDevice(input.deviceId)).routeId);
    const corridor = routeId ? await this.findRouteCorridor(routeId) : undefined;
    const route = input.route ? this.parseRoute(input.route) : this.routePointsForCalculation(corridor);
    const toleranceMeters = input.toleranceMeters === undefined
      ? (corridor?.toleranceMeters ?? DEFAULT_ROUTE_TOLERANCE_METERS)
      : toNumber(input.toleranceMeters, 'toleranceMeters');
    if (toleranceMeters <= 0) {
      throw new BadRequestException('toleranceMeters must be greater than 0');
    }

    const track = await this.track(input.deviceId, input.projectId);
    if (this.pool && this.postgisReady && track.length) {
      const lineWkt = `SRID=4326;LINESTRING(${route.map((point) => `${point.longitude} ${point.latitude}`).join(',')})`;
      const params = input.projectId ? [input.deviceId, input.projectId, lineWkt] : [input.deviceId, lineWkt];
      const lineParam = input.projectId ? '$3' : '$2';
      const result = await this.pool.query<LocationRow & { distance_meters: number }>(
        `
        select l.*, ST_Distance(l.geog, ST_GeogFromText(${lineParam}))::double precision as distance_meters
        from wuliu_locations l
        where l.source = 'android'
          and l.device_id = $1
          ${input.projectId ? 'and l.project_id = $2' : ''}
        order by l.timestamp asc
        `,
        params,
      );
      const measured = result.rows.map((row) => ({
        ...this.locationFromRow(row),
        distanceMeters: Math.round(Number(row.distance_meters)),
      }));
      return this.toRouteDeviationResult(input.deviceId, input.projectId, routeId, toleranceMeters, measured);
    }

    const measured = track.map((point) => ({
      ...point,
      distanceMeters: Math.round(this.distanceToRouteMeters(point.latitude, point.longitude, route)),
    }));
    return this.toRouteDeviationResult(input.deviceId, input.projectId, routeId, toleranceMeters, measured);
  }

  async listRouteCorridors(projectId?: string): Promise<RouteCorridor[]> {
    if (!this.pool) {
      return this.routeCorridors.filter((corridor) => !projectId || corridor.projectId === projectId);
    }

    await this.ready;
    const params = projectId ? [projectId] : [];
    const result = await this.pool.query<RouteCorridorRow>(
      `
      select *
      from wuliu_route_corridors
      ${projectId ? 'where project_id = $1' : ''}
      order by created_at desc
      `,
      params,
    );
    return result.rows.map((row) => this.routeCorridorFromRow(row));
  }

  async createRouteCorridor(input: RouteCorridorInput): Promise<RouteCorridor> {
    const projectId = input.projectId || this.projects[0]?.id;
    await this.ensureProjectExists(projectId);
    const route = this.normalizeRoute(input.route);
    const toleranceMeters = input.toleranceMeters === undefined ? DEFAULT_ROUTE_TOLERANCE_METERS : toNumber(input.toleranceMeters, 'toleranceMeters');
    if (toleranceMeters <= 0) {
      throw new BadRequestException('toleranceMeters must be greater than 0');
    }
    const corridor: RouteCorridor = {
      id: `route-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      projectId,
      name: input.name?.trim() || '新路线走廊',
      route,
      toleranceMeters,
      status: input.status ?? 'active',
      createdAt: now(),
    };

    if (this.pool) {
      await this.ready;
      const result = await this.pool.query<RouteCorridorRow>(
        `
        insert into wuliu_route_corridors (
          id, project_id, name, route_points, tolerance_meters, status, created_at
        ) values (
          $1, $2, $3, $4::jsonb, $5, $6, $7
        )
        returning *
        `,
        [corridor.id, corridor.projectId, corridor.name, JSON.stringify(corridor.route), corridor.toleranceMeters, corridor.status, corridor.createdAt],
      );
      return this.routeCorridorFromRow(result.rows[0]);
    }

    this.routeCorridors.unshift(corridor);
    this.saveState();
    return corridor;
  }

  async track(deviceId: string, projectId?: string): Promise<LocationPoint[]> {
    if (!this.pool) {
      return this.visibleLocations()
        .filter((point) => point.deviceId === deviceId && (!projectId || point.projectId === projectId))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    }

    await this.ready;
    const params = projectId ? [deviceId, projectId] : [deviceId];
    const result = await this.pool.query<LocationRow>(
      `
      select *
      from wuliu_locations
      where source = 'android' and device_id = $1
      ${projectId ? 'and project_id = $2' : ''}
      order by timestamp asc
      `,
      params,
    );
    return result.rows.map((row) => this.locationFromRow(row));
  }

  async overview(projectId?: string) {
    const [projects, devices, latest] = await Promise.all([this.listProjects(), this.listDevices(projectId), this.latest(projectId)]);
    const projectIds = new Set(projects.map((project) => project.id));
    const visibleProjects = projectId ? projects.filter((project) => project.id === projectId) : projects;
    const visibleDevices = devices.filter((device) => projectIds.has(device.projectId));
    const openAlerts = await this.listAlerts({ projectId, status: 'open', limit: 500 });
    return {
      projectTotal: visibleProjects.length,
      deviceTotal: visibleDevices.length,
      onlineTotal: visibleDevices.filter((device) => device.status === 'online').length,
      todayActive: latest.length,
      alertTotal: openAlerts.length,
      projects: visibleProjects,
      latest,
    };
  }

  async reportSummary(projectId?: string): Promise<ReportSummary> {
    const [devices, alerts, geofences, routes] = await Promise.all([
      this.listDevices(projectId),
      this.listAlerts({ projectId, limit: 500 }),
      this.listGeofences(projectId),
      this.listRouteCorridors(projectId),
    ]);
    const routeAssignedTotal = devices.filter((device) => Boolean(device.routeId)).length;
    return {
      projectId,
      generatedAt: now(),
      deviceTotal: devices.length,
      onlineTotal: devices.filter((device) => device.status === 'online').length,
      routeAssignedTotal,
      routeUnassignedTotal: devices.length - routeAssignedTotal,
      alertTotal: alerts.length,
      openAlertTotal: alerts.filter((alert) => alert.status === 'open').length,
      acknowledgedAlertTotal: alerts.filter((alert) => alert.status === 'acknowledged').length,
      resolvedAlertTotal: alerts.filter((alert) => alert.status === 'resolved').length,
      geofenceTotal: geofences.length,
      activeGeofenceTotal: geofences.filter((geofence) => geofence.status === 'active').length,
      routeTotal: routes.length,
      activeRouteTotal: routes.filter((route) => route.status === 'active').length,
    };
  }

  async exportReport(projectId?: string, format: ReportExportFormat = 'csv'): Promise<string | ReportSummary> {
    const summary = await this.reportSummary(projectId);
    if (format === 'json') {
      return summary;
    }
    if (format !== 'csv') {
      throw new BadRequestException('format must be csv or json');
    }
    const rows = [
      ['metric', 'value'],
      ['projectId', summary.projectId ?? 'all'],
      ['generatedAt', summary.generatedAt],
      ['deviceTotal', String(summary.deviceTotal)],
      ['onlineTotal', String(summary.onlineTotal)],
      ['routeAssignedTotal', String(summary.routeAssignedTotal)],
      ['routeUnassignedTotal', String(summary.routeUnassignedTotal)],
      ['alertTotal', String(summary.alertTotal)],
      ['openAlertTotal', String(summary.openAlertTotal)],
      ['acknowledgedAlertTotal', String(summary.acknowledgedAlertTotal)],
      ['resolvedAlertTotal', String(summary.resolvedAlertTotal)],
      ['geofenceTotal', String(summary.geofenceTotal)],
      ['activeGeofenceTotal', String(summary.activeGeofenceTotal)],
      ['routeTotal', String(summary.routeTotal)],
      ['activeRouteTotal', String(summary.activeRouteTotal)],
    ];
    return rows.map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(',')).join('\n');
  }

  private async initializePostgres(): Promise<void> {
    await this.ensureDatabase();
    this.pool = this.createPool(this.databaseName());
    await this.pool.query(this.schemaSql());
    await this.enablePostgisIfAvailable();
    await this.seedPostgres();
  }

  private async ensureDatabase(): Promise<void> {
    const dbName = this.databaseName();
    if (!/^[a-zA-Z0-9_-]+$/.test(dbName)) {
      throw new Error('DB_DATABASE contains unsupported characters');
    }
    const adminPool = this.createPool(process.env.DB_ADMIN_DATABASE || 'postgres');
    try {
      const existing = await adminPool.query('select 1 from pg_database where datname = $1', [dbName]);
      if (!existing.rowCount) {
        await adminPool.query(`create database "${dbName}"`);
      }
    } finally {
      await adminPool.end();
    }
  }

  private createPool(database: string): Pool {
    return new Pool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database,
    });
  }

  private databaseName(): string {
    return process.env.DB_DATABASE?.trim() || 'wms';
  }

  private schemaSql(): string {
    return `
      create table if not exists wuliu_users (
        id text primary key,
        name text not null,
        role text not null
      );

      create table if not exists wuliu_projects (
        id text primary key,
        name text not null,
        region text not null,
        description text not null default '',
        status text not null,
        created_at timestamptz not null
      );

      create table if not exists wuliu_project_members (
        id text primary key,
        project_id text not null references wuliu_projects(id),
        name text not null,
        role text not null,
        phone text not null default '',
        password text not null default '123456',
        created_at timestamptz not null
      );

      alter table wuliu_project_members
      add column if not exists password text not null default '123456';

      create table if not exists wuliu_devices (
        id text primary key,
        project_id text not null references wuliu_projects(id),
        name text not null,
        type text not null,
        owner text not null,
        phone text not null default '',
        status text not null,
        last_seen_at timestamptz,
        route_id text,
        device_token text
      );

      alter table wuliu_devices
      add column if not exists route_id text;

      alter table wuliu_devices
      add column if not exists device_token text;

      create table if not exists wuliu_locations (
        id text primary key,
        project_id text not null references wuliu_projects(id),
        device_id text not null references wuliu_devices(id),
        longitude double precision not null,
        latitude double precision not null,
        lng double precision not null,
        lat double precision not null,
        speed double precision not null default 0,
        heading double precision not null default 0,
        battery double precision,
        accuracy double precision,
        provider text,
        mock boolean not null default false,
        app_version text,
        app_version_code integer,
        source text not null,
        status text not null,
        captured_at timestamptz not null,
        received_at timestamptz not null,
        timestamp timestamptz not null
      );

      create table if not exists wuliu_geofences (
        id text primary key,
        project_id text not null references wuliu_projects(id),
        name text not null,
        longitude double precision not null,
        latitude double precision not null,
        lng double precision not null,
        lat double precision not null,
        radius_meters double precision not null,
        status text not null,
        created_at timestamptz not null
      );

      create table if not exists wuliu_alert_events (
        id text primary key,
        type text not null,
        project_id text not null references wuliu_projects(id),
        device_id text not null references wuliu_devices(id),
        location_id text not null references wuliu_locations(id),
        geofence_id text not null references wuliu_geofences(id),
        geofence_name text not null,
        longitude double precision not null,
        latitude double precision not null,
        distance_meters double precision not null,
        message text not null,
        status text not null default 'open',
        assigned_to text,
        assigned_to_name text,
        handled_by text,
        handled_note text,
        handled_at timestamptz,
        created_at timestamptz not null
      );

      alter table wuliu_alert_events
      add column if not exists status text not null default 'open';

      alter table wuliu_alert_events
      add column if not exists assigned_to text;

      alter table wuliu_alert_events
      add column if not exists assigned_to_name text;

      alter table wuliu_alert_events
      add column if not exists handled_by text;

      alter table wuliu_alert_events
      add column if not exists handled_note text;

      alter table wuliu_alert_events
      add column if not exists handled_at timestamptz;

      create table if not exists wuliu_route_corridors (
        id text primary key,
        project_id text not null references wuliu_projects(id),
        name text not null,
        route_points jsonb not null,
        tolerance_meters double precision not null,
        status text not null,
        created_at timestamptz not null
      );

      create index if not exists idx_wuliu_locations_device_timestamp on wuliu_locations(device_id, timestamp desc);
      create index if not exists idx_wuliu_locations_project_timestamp on wuliu_locations(project_id, timestamp desc);
      create index if not exists idx_wuliu_locations_source on wuliu_locations(source);
      create index if not exists idx_wuliu_project_members_project on wuliu_project_members(project_id);
      create index if not exists idx_wuliu_project_members_phone on wuliu_project_members(phone);
      create index if not exists idx_wuliu_devices_project on wuliu_devices(project_id);
      create index if not exists idx_wuliu_devices_route on wuliu_devices(route_id);
      create index if not exists idx_wuliu_geofences_project on wuliu_geofences(project_id);
      create index if not exists idx_wuliu_alert_events_project_created on wuliu_alert_events(project_id, created_at desc);
      create index if not exists idx_wuliu_alert_events_device_created on wuliu_alert_events(device_id, created_at desc);
      create index if not exists idx_wuliu_alert_events_status on wuliu_alert_events(status);
      create index if not exists idx_wuliu_alert_events_assigned_to on wuliu_alert_events(assigned_to);
      create index if not exists idx_wuliu_route_corridors_project on wuliu_route_corridors(project_id);
    `;
  }

  private async enablePostgisIfAvailable(): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query('create extension if not exists postgis');
      await this.pool.query(`
        alter table wuliu_locations
        add column if not exists geog geography(Point, 4326)
      `);
      await this.pool.query(`
        update wuliu_locations
        set geog = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
        where geog is null
      `);
      await this.pool.query('create index if not exists idx_wuliu_locations_geog on wuliu_locations using gist(geog)');
      await this.pool.query(`
        alter table wuliu_geofences
        add column if not exists geog geography(Point, 4326)
      `);
      await this.pool.query(`
        update wuliu_geofences
        set geog = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
        where geog is null
      `);
      await this.pool.query('create index if not exists idx_wuliu_geofences_geog on wuliu_geofences using gist(geog)');
      this.postgisReady = true;
    } catch {
      this.postgisReady = false;
      console.warn('PostGIS is not available; continuing with scalar longitude/latitude storage.');
    }
  }

  private async seedPostgres(): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(
      'insert into wuliu_users (id, name, role) values ($1, $2, $3) on conflict (id) do nothing',
      [this.users[0].id, this.users[0].name, this.users[0].role],
    );
    for (const project of this.projects) {
      await this.pool.query(
        'insert into wuliu_projects (id, name, region, description, status, created_at) values ($1, $2, $3, $4, $5, $6) on conflict (id) do nothing',
        [project.id, project.name, project.region, project.description, project.status, project.createdAt],
      );
    }
    for (const member of this.members) {
      await this.pool.query(
        'insert into wuliu_project_members (id, project_id, name, role, phone, password, created_at) values ($1, $2, $3, $4, $5, $6, $7) on conflict (id) do nothing',
        [member.id, member.projectId, member.name, member.role, member.phone, member.password, member.createdAt],
      );
    }
    for (const device of this.devices) {
      await this.pool.query(
        `
        insert into wuliu_devices (id, project_id, name, type, owner, phone, status, last_seen_at, device_token)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        on conflict (id) do nothing
        `,
        [device.id, device.projectId, device.name, device.type, device.owner, device.phone, device.status, device.lastSeenAt, device.deviceToken ?? null],
      );
    }
  }

  private isKnownMockCoordinate(longitude: number, latitude: number): boolean {
    return Math.abs(longitude - -122.084) < 0.000001 && Math.abs(latitude - 37.421998333333335) < 0.000001;
  }

  private async resolveIngestDevice(input: LocationInput): Promise<Device> {
    if (!input.deviceId?.trim()) {
      throw new BadRequestException('deviceId is required');
    }

    if (this.pool) {
      await this.ready;
      const existing = await this.pool.query<DeviceRow>('select * from wuliu_devices where id = $1', [input.deviceId]);
      if (existing.rows[0]) {
        return this.deviceFromRow(existing.rows[0]);
      }
      const projectId = input.projectId || this.projects[0]?.id;
      await this.ensureProjectExists(projectId);
      const device: Device = {
        id: input.deviceId,
        projectId,
        name: input.deviceName?.trim() || input.deviceId,
        type: 'phone',
        owner: input.owner?.trim() || 'Android 采集端',
        phone: input.phone?.trim() || '',
        status: input.status ?? 'online',
        deviceToken: input.deviceToken?.trim() || `device-${randomUUID()}`,
      };
      const inserted = await this.pool.query<DeviceRow>(
        'insert into wuliu_devices (id, project_id, name, type, owner, phone, status, device_token) values ($1, $2, $3, $4, $5, $6, $7, $8) returning *',
        [device.id, device.projectId, device.name, device.type, device.owner, device.phone, device.status, device.deviceToken],
      );
      return this.deviceFromRow(inserted.rows[0]);
    }

    const existing = this.devices.find((item) => item.id === input.deviceId);
    if (existing) {
      return existing;
    }
    const projectId = input.projectId || this.projects[0]?.id;
    await this.ensureProjectExists(projectId);
    const device: Device = {
      id: input.deviceId,
      projectId,
      name: input.deviceName?.trim() || input.deviceId,
      type: 'phone',
      owner: input.owner?.trim() || 'Android 采集端',
      phone: input.phone?.trim() || '',
      status: input.status ?? 'online',
      deviceToken: input.deviceToken?.trim() || `device-${randomUUID()}`,
    };
    this.devices.unshift(device);
    this.saveState();
    return device;
  }

  private async ensureProjectExists(projectId?: string): Promise<void> {
    if (!projectId) {
      throw new NotFoundException('Project not found');
    }
    if (this.pool) {
      await this.ready;
      const result = await this.pool.query('select 1 from wuliu_projects where id = $1', [projectId]);
      if (!result.rowCount) {
        throw new NotFoundException('Project not found');
      }
      return;
    }
    if (!this.projects.some((project) => project.id === projectId)) {
      throw new NotFoundException('Project not found');
    }
  }

  private visibleLocations(): LocationPoint[] {
    return this.locations.filter((point) => point.source === 'android');
  }

  private visibleDevices(): Device[] {
    const visibleDeviceIds = new Set(this.visibleLocations().map((point) => point.deviceId));
    return this.devices.filter((device) => visibleDeviceIds.has(device.id));
  }

  private loadPersistedState(): void {
    if (!this.shouldPersistJson()) {
      return;
    }
    const file = this.dataFilePath();
    if (!existsSync(file)) {
      return;
    }
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<DataState>;
      if (Array.isArray(parsed.users)) this.users = parsed.users;
      if (Array.isArray(parsed.projects)) this.projects = parsed.projects;
      if (Array.isArray(parsed.members)) this.members = parsed.members.map((member) => this.normalizeMemberRecord(member));
      if (Array.isArray(parsed.devices)) this.devices = parsed.devices;
      if (Array.isArray(parsed.locations)) this.locations = parsed.locations;
      if (Array.isArray(parsed.geofences)) this.geofences = parsed.geofences;
      if (Array.isArray(parsed.alerts)) this.alerts = parsed.alerts.map((alert) => ({ ...alert, status: alert.status ?? 'open' }));
      if (Array.isArray(parsed.routeCorridors)) this.routeCorridors = parsed.routeCorridors;
    } catch (error) {
      console.warn(`Could not load persisted data from ${file}:`, error);
    }
  }

  private saveState(): void {
    if (!this.shouldPersistJson()) {
      return;
    }
    const file = this.dataFilePath();
    const tempFile = `${file}.tmp`;
    const state: DataState = {
      users: this.users,
      projects: this.projects,
      members: this.members,
      devices: this.devices,
      locations: this.locations,
      geofences: this.geofences,
      alerts: this.alerts,
      routeCorridors: this.routeCorridors,
    };
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf8');
    renameSync(tempFile, file);
  }

  private shouldUsePostgres(): boolean {
    return (
      !this.isTestRun() &&
      process.env.WULIU_STORAGE !== 'json' &&
      Boolean(process.env.DB_HOST && process.env.DB_DATABASE && process.env.DB_USERNAME)
    );
  }

  private shouldPersistJson(): boolean {
    return !this.isTestRun() && process.env.WULIU_DATA_FILE !== 'memory' && !this.shouldUsePostgres();
  }

  private isTestRun(): boolean {
    return process.env.NODE_ENV === 'test' || process.env.npm_lifecycle_event === 'test';
  }

  private dataFilePath(): string {
    return process.env.WULIU_DATA_FILE?.trim() || join(process.cwd(), 'data', 'runtime.json');
  }

  private projectFromRow(row: ProjectRow): Project {
    return {
      id: row.id,
      name: row.name,
      region: row.region,
      description: row.description,
      status: row.status,
      createdAt: toIso(row.created_at) ?? now(),
    };
  }

  private memberFromRow(row: ProjectMemberRow): ProjectMember {
    return this.toProjectMember(this.memberRecordFromRow(row));
  }

  private memberRecordFromRow(row: ProjectMemberRow): ProjectMemberRecord {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      role: row.role,
      phone: row.phone,
      password: row.password ?? '123456',
      createdAt: toIso(row.created_at) ?? now(),
    };
  }

  private toProjectMember(member: ProjectMemberRecord): ProjectMember {
    return {
      id: member.id,
      projectId: member.projectId,
      name: member.name,
      role: member.role,
      phone: member.phone,
      createdAt: member.createdAt,
    };
  }

  private normalizeMemberRecord(member: Partial<ProjectMemberRecord>): ProjectMemberRecord {
    return {
      id: member.id ?? `m-${Date.now().toString(36)}`,
      projectId: member.projectId ?? this.projects[0]?.id ?? '',
      name: member.name ?? '未命名成员',
      role: member.role ?? 'dispatcher',
      phone: member.phone ?? '',
      password: member.password ?? '123456',
      createdAt: member.createdAt ?? now(),
    };
  }

  private deviceFromRow(row: DeviceRow): Device {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      type: row.type,
      owner: row.owner,
      phone: row.phone,
      status: row.status,
      lastSeenAt: toIso(row.last_seen_at),
      routeId: row.route_id ?? undefined,
      deviceToken: row.device_token ?? undefined,
    };
  }

  private locationFromRow(row: LocationRow): LocationPoint {
    return {
      id: row.id,
      projectId: row.project_id,
      deviceId: row.device_id,
      longitude: Number(row.longitude),
      latitude: Number(row.latitude),
      lng: Number(row.lng),
      lat: Number(row.lat),
      speed: Number(row.speed),
      heading: Number(row.heading),
      battery: row.battery === null || row.battery === undefined ? undefined : Number(row.battery),
      accuracy: row.accuracy === null || row.accuracy === undefined ? undefined : Number(row.accuracy),
      provider: row.provider ?? undefined,
      mock: Boolean(row.mock),
      appVersion: row.app_version ?? undefined,
      appVersionCode: row.app_version_code === null || row.app_version_code === undefined ? undefined : Number(row.app_version_code),
      source: row.source,
      status: row.status,
      capturedAt: toIso(row.captured_at) ?? now(),
      receivedAt: toIso(row.received_at) ?? now(),
      timestamp: toIso(row.timestamp) ?? now(),
    };
  }

  private geofenceFromRow(row: GeofenceRow): Geofence {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      longitude: Number(row.longitude),
      latitude: Number(row.latitude),
      lng: Number(row.lng),
      lat: Number(row.lat),
      radiusMeters: Number(row.radius_meters),
      status: row.status,
      createdAt: toIso(row.created_at) ?? now(),
    };
  }

  async findAlertEvent(id: string): Promise<AlertEvent> {
    if (this.pool) {
      await this.ready;
      const result = await this.pool.query<AlertEventRow>('select * from wuliu_alert_events where id = $1', [id]);
      if (!result.rows[0]) {
        throw new NotFoundException('Alert event not found');
      }
      return this.alertFromRow(result.rows[0]);
    }

    const alert = this.alerts.find((event) => event.id === id);
    if (!alert) {
      throw new NotFoundException('Alert event not found');
    }
    return alert;
  }

  async findGeofence(id: string): Promise<Geofence> {
    if (this.pool) {
      await this.ready;
      const result = await this.pool.query<GeofenceRow>('select * from wuliu_geofences where id = $1', [id]);
      if (!result.rows[0]) {
        throw new NotFoundException('Geofence not found');
      }
      return this.geofenceFromRow(result.rows[0]);
    }

    const geofence = this.geofences.find((item) => item.id === id);
    if (!geofence) {
      throw new NotFoundException('Geofence not found');
    }
    return geofence;
  }

  async findDevice(id: string): Promise<Device> {
    if (this.pool) {
      await this.ready;
      const result = await this.pool.query<DeviceRow>('select * from wuliu_devices where id = $1', [id]);
      if (!result.rows[0]) {
        throw new NotFoundException('Device not found');
      }
      return this.deviceFromRow(result.rows[0]);
    }

    const device = this.devices.find((item) => item.id === id);
    if (!device) {
      throw new NotFoundException('Device not found');
    }
    return device;
  }

  async findRouteCorridor(id: string): Promise<RouteCorridor> {
    if (this.pool) {
      await this.ready;
      const result = await this.pool.query<RouteCorridorRow>('select * from wuliu_route_corridors where id = $1', [id]);
      if (!result.rows[0]) {
        throw new NotFoundException('Route corridor not found');
      }
      return this.routeCorridorFromRow(result.rows[0]);
    }

    const corridor = this.routeCorridors.find((item) => item.id === id);
    if (!corridor) {
      throw new NotFoundException('Route corridor not found');
    }
    return corridor;
  }

  private nearbyFromRow(row: NearbyLocationRow): NearbyLocation {
    return {
      ...this.locationFromRow(row),
      projectName: row.project_name ?? '未知项目',
      deviceName: row.device_name ?? '未知设备',
      owner: row.owner ?? '未知人员',
      distanceMeters: Math.round(Number(row.distance_meters)),
    };
  }

  private alertFromRow(row: AlertEventRow): AlertEvent {
    return {
      id: row.id,
      type: row.type,
      projectId: row.project_id,
      deviceId: row.device_id,
      locationId: row.location_id,
      geofenceId: row.geofence_id,
      geofenceName: row.geofence_name,
      longitude: Number(row.longitude),
      latitude: Number(row.latitude),
      distanceMeters: Math.round(Number(row.distance_meters)),
      message: row.message,
      status: row.status ?? 'open',
      assignedTo: row.assigned_to ?? undefined,
      assignedToName: row.assigned_to_name ?? undefined,
      handledBy: row.handled_by ?? undefined,
      handledNote: row.handled_note ?? undefined,
      handledAt: toIso(row.handled_at),
      createdAt: toIso(row.created_at) ?? now(),
    };
  }

  private routeCorridorFromRow(row: RouteCorridorRow): RouteCorridor {
    const points = Array.isArray(row.route_points) ? row.route_points : JSON.parse(String(row.route_points));
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      route: this.normalizeRoute(points as RoutePointInput[]),
      toleranceMeters: Number(row.tolerance_meters),
      status: row.status,
      createdAt: toIso(row.created_at) ?? now(),
    };
  }

  private async evaluateGeofenceAlerts(point: LocationPoint, device: Device): Promise<void> {
    if (point.source !== 'android') {
      return;
    }

    if (this.pool) {
      await this.ready;
      if (!this.postgisReady) {
        return;
      }
      const geofences = await this.pool.query<GeofenceRow & { distance_meters: number }>(
        `
        select gf.*, ST_Distance(gf.geog, l.geog)::double precision as distance_meters
        from wuliu_geofences gf
        join wuliu_locations l on l.id = $1
        where gf.project_id = $2
          and gf.status = 'active'
          and gf.geog is not null
          and l.geog is not null
          and ST_DWithin(gf.geog, l.geog, gf.radius_meters)
        order by distance_meters asc
        `,
        [point.id, point.projectId],
      );
      for (const geofence of geofences.rows) {
        await this.insertAlertEvent(point, device, this.geofenceFromRow(geofence), Math.round(Number(geofence.distance_meters)));
      }
      return;
    }

    for (const geofence of this.geofences.filter((item) => item.projectId === point.projectId && item.status === 'active')) {
      const distanceMeters = Math.round(this.distanceMeters(geofence.latitude, geofence.longitude, point.latitude, point.longitude));
      if (distanceMeters <= geofence.radiusMeters) {
        await this.insertAlertEvent(point, device, geofence, distanceMeters);
      }
    }
  }

  private async insertAlertEvent(point: LocationPoint, device: Device, geofence: Geofence, distanceMeters: number): Promise<AlertEvent> {
    const event: AlertEvent = {
      id: `alert-${Date.now()}-${point.id}-${geofence.id}`,
      type: 'geofence_enter',
      projectId: point.projectId,
      deviceId: point.deviceId,
      locationId: point.id,
      geofenceId: geofence.id,
      geofenceName: geofence.name,
      longitude: point.longitude,
      latitude: point.latitude,
      distanceMeters,
      message: `${device.name} entered ${geofence.name}`,
      status: 'open',
      createdAt: now(),
    };

    if (this.pool) {
      await this.pool.query(
        `
        insert into wuliu_alert_events (
          id, type, project_id, device_id, location_id, geofence_id, geofence_name,
          longitude, latitude, distance_meters, message, status, created_at
        ) values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
        )
        on conflict (id) do nothing
        `,
        [
          event.id,
          event.type,
          event.projectId,
          event.deviceId,
          event.locationId,
          event.geofenceId,
          event.geofenceName,
          event.longitude,
          event.latitude,
          event.distanceMeters,
          event.message,
          event.status,
          event.createdAt,
        ],
      );
      return event;
    }

    this.alerts.unshift(event);
    this.saveState();
    return event;
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

  private normalizeRoute(route: RoutePointInput[] | undefined): RouteCorridor['route'] {
    return this.parseRoute(route).map((point) => ({
      ...point,
      lng: point.longitude,
      lat: point.latitude,
    }));
  }

  private parseRoute(route: RoutePointInput[] | undefined): Array<{ longitude: number; latitude: number }> {
    if (!Array.isArray(route) || route.length < 2) {
      throw new BadRequestException('route must include at least two points');
    }
    return route.map((point, index) => {
      const longitude = toNumber(point.longitude ?? point.lng, `route[${index}].longitude`);
      const latitude = toNumber(point.latitude ?? point.lat, `route[${index}].latitude`);
      this.assertCoordinateRange(longitude, latitude);
      return { longitude, latitude };
    });
  }

  private routePointsForCalculation(corridor: RouteCorridor | undefined): Array<{ longitude: number; latitude: number }> {
    if (!corridor) {
      throw new BadRequestException('route or routeId is required');
    }
    if (corridor.status !== 'active') {
      throw new BadRequestException('route corridor is paused');
    }
    return corridor.route.map((point) => ({ longitude: point.longitude, latitude: point.latitude }));
  }

  private assertAlertStatus(status: string): asserts status is AlertEventStatus {
    if (!['open', 'acknowledged', 'resolved'].includes(status)) {
      throw new BadRequestException('status must be open, acknowledged, or resolved');
    }
  }

  private assertMemberRole(role: string): asserts role is ProjectMemberRole {
    if (!['owner', 'manager', 'dispatcher', 'viewer'].includes(role)) {
      throw new BadRequestException('role must be owner, manager, dispatcher, or viewer');
    }
  }

  private async resolveAlertAssignment(memberId: string | null | undefined): Promise<{ assignedTo?: string; assignedToName?: string }> {
    if (memberId === undefined) {
      return {};
    }
    if (memberId === null || memberId.trim() === '') {
      return { assignedTo: undefined, assignedToName: undefined };
    }
    const id = memberId.trim();
    const member = this.pool
      ? (await this.pool.query<ProjectMemberRow>('select * from wuliu_project_members where id = $1', [id])).rows[0]
      : undefined;
    if (this.pool) {
      if (!member) {
        throw new NotFoundException('Project member not found');
      }
      return { assignedTo: member.id, assignedToName: member.name };
    }
    const memoryMember = this.members.find((item) => item.id === id);
    if (!memoryMember) {
      throw new NotFoundException('Project member not found');
    }
    return { assignedTo: memoryMember.id, assignedToName: memoryMember.name };
  }

  private toRouteDeviationResult(
    deviceId: string,
    projectId: string | undefined,
    routeId: string | undefined,
    toleranceMeters: number,
    measured: RouteDeviationPoint[],
  ): RouteDeviationResult {
    const deviatedPoints = measured.filter((point) => point.distanceMeters > toleranceMeters);
    return {
      deviceId,
      projectId,
      routeId,
      toleranceMeters,
      checkedPoints: measured.length,
      deviatedPoints,
      maxDistanceMeters: measured.reduce((max, point) => Math.max(max, point.distanceMeters), 0),
    };
  }

  private assertCoordinateRange(longitude: number, latitude: number): void {
    if (longitude < -180 || longitude > 180) {
      throw new BadRequestException('longitude must be between -180 and 180');
    }
    if (latitude < -90 || latitude > 90) {
      throw new BadRequestException('latitude must be between -90 and 90');
    }
  }

  private distanceMeters(fromLatitude: number, fromLongitude: number, toLatitude: number, toLongitude: number): number {
    const fromLatRad = this.toRadians(fromLatitude);
    const toLatRad = this.toRadians(toLatitude);
    const deltaLat = this.toRadians(toLatitude - fromLatitude);
    const deltaLng = this.toRadians(toLongitude - fromLongitude);
    const a =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(fromLatRad) * Math.cos(toLatRad) * Math.sin(deltaLng / 2) ** 2;
    const clamped = Math.min(1, a);
    return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped));
  }

  private distanceToRouteMeters(latitude: number, longitude: number, route: Array<{ longitude: number; latitude: number }>): number {
    let best = Number.POSITIVE_INFINITY;
    for (let index = 0; index < route.length - 1; index += 1) {
      best = Math.min(best, this.distanceToSegmentMeters(latitude, longitude, route[index], route[index + 1]));
    }
    return best;
  }

  private distanceToSegmentMeters(
    latitude: number,
    longitude: number,
    start: { longitude: number; latitude: number },
    end: { longitude: number; latitude: number },
  ): number {
    const referenceLatRad = this.toRadians(latitude);
    const x = (point: { longitude: number; latitude: number }) => EARTH_RADIUS_METERS * this.toRadians(point.longitude - longitude) * Math.cos(referenceLatRad);
    const y = (point: { longitude: number; latitude: number }) => EARTH_RADIUS_METERS * this.toRadians(point.latitude - latitude);
    const ax = x(start);
    const ay = y(start);
    const bx = x(end);
    const by = y(end);
    const dx = bx - ax;
    const dy = by - ay;
    if (dx === 0 && dy === 0) {
      return Math.hypot(ax, ay);
    }
    const projection = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy)));
    return Math.hypot(ax + projection * dx, ay + projection * dy);
  }

  private toRadians(value: number): number {
    return (value * Math.PI) / 180;
  }
}
