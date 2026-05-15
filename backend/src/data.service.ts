import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Pool } from 'pg';
import { Device, DeviceStatus, LatestLocation, LocationInput, LocationPoint, Project, User } from './domain';

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

interface DataState {
  users: User[];
  projects: Project[];
  devices: Device[];
  locations: LocationPoint[];
}

type ProjectRow = {
  id: string;
  name: string;
  region: string;
  description: string;
  status: Project['status'];
  created_at: Date | string;
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

  constructor() {
    if (this.shouldUsePostgres()) {
      this.ready = this.initializePostgres();
      return;
    }
    this.loadPersistedState();
    this.saveState();
  }

  async login(name?: string): Promise<User> {
    const user = { ...this.users[0], name: name?.trim() || this.users[0].name };
    this.users[0] = user;
    if (this.pool) {
      await this.ready;
      await this.pool.query(
        'insert into wuliu_users (id, name, role) values ($1, $2, $3) on conflict (id) do update set name = excluded.name, role = excluded.role',
        [user.id, user.name, user.role],
      );
    } else {
      this.saveState();
    }
    return user;
  }

  async listProjects() {
    if (!this.pool) {
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

    await this.ready;
    const result = await this.pool.query(
      `
      with visible_devices as (
        select d.*
        from wuliu_devices d
        where exists (
          select 1 from wuliu_locations l where l.device_id = d.id and l.source = 'android'
        )
      )
      select p.id, p.name, p.region, p.description, p.status, p.created_at,
             count(vd.id)::int as device_count,
             count(vd.id) filter (where vd.status = 'online')::int as online_count,
             count(vd.id) filter (where vd.status = 'alert')::int as alert_count
      from wuliu_projects p
      join visible_devices vd on vd.project_id = p.id
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
    };

    if (this.pool) {
      await this.ready;
      const result = await this.pool.query<DeviceRow>(
        'insert into wuliu_devices (id, project_id, name, type, owner, phone, status) values ($1, $2, $3, $4, $5, $6, $7) returning *',
        [device.id, device.projectId, device.name, device.type, device.owner, device.phone, device.status],
      );
      return this.deviceFromRow(result.rows[0]);
    }

    this.devices.unshift(device);
    this.saveState();
    return device;
  }

  async ingestLocation(input: LocationInput): Promise<LatestLocation> {
    const device = await this.resolveIngestDevice(input);
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
      return {
        ...location,
        projectName: project.rows[0]?.name ?? '未知项目',
        deviceName: device.name,
        owner: device.owner,
      };
    }

    device.status = status;
    device.lastSeenAt = receivedAt;
    this.locations.push(point);
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
    return {
      projectTotal: visibleProjects.length,
      deviceTotal: visibleDevices.length,
      onlineTotal: visibleDevices.filter((device) => device.status === 'online').length,
      todayActive: latest.length,
      alertTotal: visibleDevices.filter((device) => device.status === 'alert').length,
      projects: visibleProjects,
      latest,
    };
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

      create table if not exists wuliu_devices (
        id text primary key,
        project_id text not null references wuliu_projects(id),
        name text not null,
        type text not null,
        owner text not null,
        phone text not null default '',
        status text not null,
        last_seen_at timestamptz
      );

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

      create index if not exists idx_wuliu_locations_device_timestamp on wuliu_locations(device_id, timestamp desc);
      create index if not exists idx_wuliu_locations_project_timestamp on wuliu_locations(project_id, timestamp desc);
      create index if not exists idx_wuliu_locations_source on wuliu_locations(source);
      create index if not exists idx_wuliu_devices_project on wuliu_devices(project_id);
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
    for (const device of this.devices) {
      await this.pool.query(
        `
        insert into wuliu_devices (id, project_id, name, type, owner, phone, status, last_seen_at)
        values ($1, $2, $3, $4, $5, $6, $7, $8)
        on conflict (id) do nothing
        `,
        [device.id, device.projectId, device.name, device.type, device.owner, device.phone, device.status, device.lastSeenAt],
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
      };
      const inserted = await this.pool.query<DeviceRow>(
        'insert into wuliu_devices (id, project_id, name, type, owner, phone, status) values ($1, $2, $3, $4, $5, $6, $7) returning *',
        [device.id, device.projectId, device.name, device.type, device.owner, device.phone, device.status],
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
      if (Array.isArray(parsed.devices)) this.devices = parsed.devices;
      if (Array.isArray(parsed.locations)) this.locations = parsed.locations;
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
      devices: this.devices,
      locations: this.locations,
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
