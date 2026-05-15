import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { DataService } from './data.service';
import { Device, LocationPoint, Project } from './domain';
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
  login(@Body() body: { name?: string }) {
    return {
      token: 'demo-token',
      user: this.data.login(body.name),
    };
  }

  @Get('projects')
  projects() {
    return this.data.listProjects();
  }

  @Post('projects')
  createProject(@Body() body: Partial<Project>) {
    return this.data.createProject(body);
  }

  @Get('devices')
  devices(@Query('projectId') projectId?: string) {
    return this.data.listDevices(projectId);
  }

  @Post('devices')
  createDevice(@Body() body: Partial<Device>) {
    return this.data.createDevice(body);
  }

  @Post('locations')
  ingestLocation(@Body() body: Partial<LocationPoint>) {
    const point = this.data.ingestLocation(body);
    this.realtime.publishLocation(point);
    return point;
  }

  @Get('locations/latest')
  latest(@Query('projectId') projectId?: string) {
    return this.data.latest(projectId);
  }

  @Get('tracks')
  tracks(@Query('deviceId') deviceId: string, @Query('projectId') projectId?: string) {
    return this.data.track(deviceId, projectId);
  }

  @Get('overview')
  overview(@Query('projectId') projectId?: string) {
    return this.data.overview(projectId);
  }
}
