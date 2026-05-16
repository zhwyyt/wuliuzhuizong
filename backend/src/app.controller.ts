import { Body, Controller, ForbiddenException, Get, Header, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { DataService } from './data.service';
import { AlertEventUpdateInput, Device, DeviceRouteAssignmentInput, GeofenceInput, LocationInput, Project, ProjectMemberInput, RouteCorridorInput, RouteDeviationInput, User } from './domain';
import { RealtimeGateway } from './realtime.gateway';

@Controller()
export class AppController {
  constructor(
    private readonly data: DataService,
    private readonly realtime: RealtimeGateway,
  ) {}

  @Get('health')
  health() {
    return { ok: true, service: 'wuliugenzong-api' };
  }

  @Post('auth/login')
  async login(@Body() body: { name?: string }) {
    return this.data.login(body.name);
  }

  @Get('projects')
  async projects(@Headers('authorization') authorization?: string) {
    const user = this.currentUser(authorization);
    const projects = await this.data.listProjects();
    if (user.role === 'admin') return projects;
    return projects.filter((project) => user.projectIds?.includes(project.id));
  }

  @Post('projects')
  async createProject(@Headers('authorization') authorization: string | undefined, @Body() body: Partial<Project>) {
    this.requireAdmin(authorization);
    return this.data.createProject(body);
  }

  @Get('members')
  async members(@Headers('authorization') authorization: string | undefined, @Query('projectId') projectId?: string) {
    const user = this.currentUser(authorization);
    const scopedProjectId = this.scopedProjectId(user, projectId);
    return this.data.listMembers(scopedProjectId);
  }

  @Post('members')
  async createMember(@Headers('authorization') authorization: string | undefined, @Body() body: ProjectMemberInput) {
    const user = this.currentUser(authorization);
    this.assertProjectAccess(user, body.projectId);
    return this.data.createMember(body);
  }

  @Get('devices')
  async devices(@Headers('authorization') authorization: string | undefined, @Query('projectId') projectId?: string) {
    const user = this.currentUser(authorization);
    return this.data.listDevices(this.scopedProjectId(user, projectId));
  }

  @Post('devices')
  async createDevice(@Headers('authorization') authorization: string | undefined, @Body() body: Partial<Device>) {
    const user = this.currentUser(authorization);
    this.assertProjectAccess(user, body.projectId);
    return this.data.createDevice(body);
  }

  @Patch('devices/:id/route')
  async assignDeviceRoute(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: DeviceRouteAssignmentInput) {
    this.currentUser(authorization);
    return this.data.assignDeviceRoute(id, body.routeId);
  }

  @Post('locations')
  async ingestLocation(@Headers('x-device-token') deviceToken: string | undefined, @Body() body: LocationInput) {
    const source = body.source ?? 'android';
    const point = await this.data.ingestLocation(body, { deviceToken, requireDeviceToken: source === 'android' });
    this.realtime.publishLocation(point);
    return point;
  }

  @Get('locations/latest')
  async latest(@Headers('authorization') authorization: string | undefined, @Query('projectId') projectId?: string) {
    const user = this.currentUser(authorization);
    return this.data.latest(this.scopedProjectId(user, projectId));
  }

  @Get('locations/nearby')
  async nearby(
    @Headers('authorization') authorization: string | undefined,
    @Query('longitude') longitude?: string,
    @Query('latitude') latitude?: string,
    @Query('radiusMeters') radiusMeters?: string,
    @Query('projectId') projectId?: string,
    @Query('limit') limit?: string,
  ) {
    const user = this.currentUser(authorization);
    return this.data.nearby({ longitude, latitude, radiusMeters, projectId: this.scopedProjectId(user, projectId), limit });
  }

  @Get('devices/:id/track')
  async deviceTrack(@Headers('authorization') authorization: string | undefined, @Param('id') deviceId: string, @Query('projectId') projectId?: string) {
    const user = this.currentUser(authorization);
    return this.data.track(deviceId, this.scopedProjectId(user, projectId));
  }

  @Get('geofences')
  async geofences(@Headers('authorization') authorization: string | undefined, @Query('projectId') projectId?: string) {
    const user = this.currentUser(authorization);
    return this.data.listGeofences(this.scopedProjectId(user, projectId));
  }

  @Post('geofences')
  async createGeofence(@Headers('authorization') authorization: string | undefined, @Body() body: GeofenceInput) {
    const user = this.currentUser(authorization);
    this.assertProjectAccess(user, body.projectId);
    return this.data.createGeofence(body);
  }

  @Get('geofences/:id/devices')
  async geofenceDevices(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Query('limit') limit?: string) {
    this.currentUser(authorization);
    return this.data.geofenceDevices(id, limit);
  }

  @Get('alerts')
  async alerts(@Headers('authorization') authorization: string | undefined, @Query('projectId') projectId?: string, @Query('deviceId') deviceId?: string, @Query('status') status?: string, @Query('limit') limit?: string) {
    const user = this.currentUser(authorization);
    return this.data.listAlerts({ projectId: this.scopedProjectId(user, projectId), deviceId, status, limit });
  }

  @Patch('alerts/:id')
  async updateAlert(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: AlertEventUpdateInput) {
    this.currentUser(authorization);
    return this.data.updateAlert(id, body);
  }

  @Post('routes/deviation')
  async routeDeviation(@Headers('authorization') authorization: string | undefined, @Body() body: RouteDeviationInput) {
    const user = this.currentUser(authorization);
    this.assertProjectAccess(user, body.projectId);
    return this.data.routeDeviation(body);
  }

  @Get('routes')
  async routes(@Headers('authorization') authorization: string | undefined, @Query('projectId') projectId?: string) {
    const user = this.currentUser(authorization);
    return this.data.listRouteCorridors(this.scopedProjectId(user, projectId));
  }

  @Post('routes')
  async createRoute(@Headers('authorization') authorization: string | undefined, @Body() body: RouteCorridorInput) {
    const user = this.currentUser(authorization);
    this.assertProjectAccess(user, body.projectId);
    return this.data.createRouteCorridor(body);
  }

  @Get('tracks')
  async tracks(@Headers('authorization') authorization: string | undefined, @Query('deviceId') deviceId: string, @Query('projectId') projectId?: string) {
    const user = this.currentUser(authorization);
    return this.data.track(deviceId, this.scopedProjectId(user, projectId));
  }

  @Get('overview')
  async overview(@Headers('authorization') authorization: string | undefined, @Query('projectId') projectId?: string) {
    const user = this.currentUser(authorization);
    return this.data.overview(this.scopedProjectId(user, projectId));
  }

  @Get('reports/summary')
  async reportSummary(@Headers('authorization') authorization: string | undefined, @Query('projectId') projectId?: string) {
    const user = this.currentUser(authorization);
    return this.data.reportSummary(this.scopedProjectId(user, projectId));
  }

  @Get('reports/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async reportExport(@Headers('authorization') authorization: string | undefined, @Query('projectId') projectId?: string, @Query('token') token?: string) {
    const user = this.currentUser(authorization || token);
    return this.data.exportReport(this.scopedProjectId(user, projectId), 'csv');
  }

  private currentUser(authorization?: string): User {
    return this.data.authenticate(authorization);
  }

  private requireAdmin(authorization?: string): User {
    const user = this.currentUser(authorization);
    if (user.role !== 'admin') {
      throw new ForbiddenException('Admin permission is required');
    }
    return user;
  }

  private scopedProjectId(user: User, projectId?: string): string | undefined {
    if (user.role === 'admin') {
      return projectId;
    }
    const allowed = user.projectIds ?? [];
    if (projectId) {
      this.assertProjectAccess(user, projectId);
      return projectId;
    }
    return allowed[0];
  }

  private assertProjectAccess(user: User, projectId?: string): void {
    if (user.role === 'admin') {
      return;
    }
    const allowed = user.projectIds ?? [];
    if (!projectId || !allowed.includes(projectId)) {
      throw new ForbiddenException('Project permission is required');
    }
  }
}
