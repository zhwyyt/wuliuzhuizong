import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { DataService } from './data.service';
import { Device, GeofenceInput, LocationInput, Project } from './domain';
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
    return {
      token: 'demo-token',
      user: await this.data.login(body.name),
    };
  }

  @Get('projects')
  async projects() {
    return this.data.listProjects();
  }

  @Post('projects')
  async createProject(@Body() body: Partial<Project>) {
    return this.data.createProject(body);
  }

  @Get('devices')
  async devices(@Query('projectId') projectId?: string) {
    return this.data.listDevices(projectId);
  }

  @Post('devices')
  async createDevice(@Body() body: Partial<Device>) {
    return this.data.createDevice(body);
  }

  @Post('locations')
  async ingestLocation(@Body() body: LocationInput) {
    const point = await this.data.ingestLocation(body);
    this.realtime.publishLocation(point);
    return point;
  }

  @Get('locations/latest')
  async latest(@Query('projectId') projectId?: string) {
    return this.data.latest(projectId);
  }

  @Get('locations/nearby')
  async nearby(
    @Query('longitude') longitude?: string,
    @Query('latitude') latitude?: string,
    @Query('radiusMeters') radiusMeters?: string,
    @Query('projectId') projectId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.data.nearby({ longitude, latitude, radiusMeters, projectId, limit });
  }

  @Get('devices/:id/track')
  async deviceTrack(@Param('id') deviceId: string, @Query('projectId') projectId?: string) {
    return this.data.track(deviceId, projectId);
  }

  @Get('geofences')
  async geofences(@Query('projectId') projectId?: string) {
    return this.data.listGeofences(projectId);
  }

  @Post('geofences')
  async createGeofence(@Body() body: GeofenceInput) {
    return this.data.createGeofence(body);
  }

  @Get('geofences/:id/devices')
  async geofenceDevices(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.data.geofenceDevices(id, limit);
  }

  @Get('tracks')
  async tracks(@Query('deviceId') deviceId: string, @Query('projectId') projectId?: string) {
    return this.data.track(deviceId, projectId);
  }

  @Get('overview')
  async overview(@Query('projectId') projectId?: string) {
    return this.data.overview(projectId);
  }
}
