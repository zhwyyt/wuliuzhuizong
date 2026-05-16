export type ProjectStatus = 'active' | 'paused' | 'archived';
export type DeviceStatus = 'online' | 'idle' | 'offline' | 'alert';
export type DeviceType = 'phone' | 'vehicle' | 'tracker';
export type LocationSource = 'android' | 'web-simulator' | 'seed';
export type GeofenceStatus = 'active' | 'paused';
export type AlertEventType = 'geofence_enter';
export type AlertEventStatus = 'open' | 'acknowledged' | 'resolved';

export interface User {
  id: string;
  name: string;
  role: 'admin' | 'operator';
}

export interface Project {
  id: string;
  name: string;
  region: string;
  description: string;
  status: ProjectStatus;
  createdAt: string;
}

export type ProjectMemberRole = 'owner' | 'manager' | 'dispatcher' | 'viewer';

export interface ProjectMember {
  id: string;
  projectId: string;
  name: string;
  role: ProjectMemberRole;
  phone: string;
  createdAt: string;
}

export interface ProjectMemberInput {
  projectId?: string;
  name?: string;
  role?: ProjectMemberRole;
  phone?: string;
}

export interface Device {
  id: string;
  projectId: string;
  name: string;
  type: DeviceType;
  owner: string;
  phone: string;
  status: DeviceStatus;
  lastSeenAt?: string;
  routeId?: string;
}

export interface DeviceRouteAssignmentInput {
  routeId?: string | null;
}

export interface LocationPoint {
  id: string;
  projectId: string;
  deviceId: string;
  longitude: number;
  latitude: number;
  lng: number;
  lat: number;
  speed: number;
  heading: number;
  battery?: number;
  accuracy?: number;
  provider?: string;
  mock?: boolean;
  appVersion?: string;
  appVersionCode?: number;
  source: LocationSource;
  status: DeviceStatus;
  capturedAt: string;
  receivedAt: string;
  timestamp: string;
}

export interface LatestLocation extends LocationPoint {
  projectName: string;
  deviceName: string;
  owner: string;
}

export interface NearbyLocation extends LatestLocation {
  distanceMeters: number;
}

export interface Geofence {
  id: string;
  projectId: string;
  name: string;
  longitude: number;
  latitude: number;
  lng: number;
  lat: number;
  radiusMeters: number;
  status: GeofenceStatus;
  createdAt: string;
}

export interface GeofenceInput {
  projectId?: string;
  name?: string;
  longitude?: number | string;
  latitude?: number | string;
  lng?: number | string;
  lat?: number | string;
  radiusMeters?: number | string;
  status?: GeofenceStatus;
}

export interface AlertEvent {
  id: string;
  type: AlertEventType;
  projectId: string;
  deviceId: string;
  locationId: string;
  geofenceId: string;
  geofenceName: string;
  longitude: number;
  latitude: number;
  distanceMeters: number;
  message: string;
  status: AlertEventStatus;
  assignedTo?: string;
  assignedToName?: string;
  handledBy?: string;
  handledNote?: string;
  handledAt?: string;
  createdAt: string;
}

export interface AlertEventUpdateInput {
  status?: AlertEventStatus;
  assignedTo?: string | null;
  handledBy?: string;
  handledNote?: string;
}

export interface ReportSummary {
  projectId?: string;
  generatedAt: string;
  deviceTotal: number;
  onlineTotal: number;
  routeAssignedTotal: number;
  routeUnassignedTotal: number;
  alertTotal: number;
  openAlertTotal: number;
  acknowledgedAlertTotal: number;
  resolvedAlertTotal: number;
  geofenceTotal: number;
  activeGeofenceTotal: number;
  routeTotal: number;
  activeRouteTotal: number;
}

export interface RoutePointInput {
  longitude?: number | string;
  latitude?: number | string;
  lng?: number | string;
  lat?: number | string;
}

export interface RouteDeviationInput {
  deviceId?: string;
  projectId?: string;
  routeId?: string;
  toleranceMeters?: number | string;
  route?: RoutePointInput[];
}

export interface RouteDeviationPoint extends LocationPoint {
  distanceMeters: number;
}

export interface RouteDeviationResult {
  deviceId: string;
  projectId?: string;
  routeId?: string;
  toleranceMeters: number;
  checkedPoints: number;
  deviatedPoints: RouteDeviationPoint[];
  maxDistanceMeters: number;
}

export interface RouteCorridor {
  id: string;
  projectId: string;
  name: string;
  route: Array<{ longitude: number; latitude: number; lng: number; lat: number }>;
  toleranceMeters: number;
  status: 'active' | 'paused';
  createdAt: string;
}

export interface RouteCorridorInput {
  projectId?: string;
  name?: string;
  route?: RoutePointInput[];
  toleranceMeters?: number | string;
  status?: 'active' | 'paused';
}

export interface LocationInput {
  projectId?: string;
  deviceId?: string;
  deviceName?: string;
  owner?: string;
  phone?: string;
  longitude?: number | string;
  latitude?: number | string;
  lng?: number | string;
  lat?: number | string;
  speed?: number | string;
  heading?: number | string;
  battery?: number | string;
  accuracy?: number | string;
  provider?: string;
  mock?: boolean | string;
  appVersion?: string;
  appVersionCode?: number | string;
  source?: LocationSource;
  status?: DeviceStatus;
  capturedAt?: string;
  timestamp?: string;
}
