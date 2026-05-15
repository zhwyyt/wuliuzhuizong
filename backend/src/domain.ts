export type ProjectStatus = 'active' | 'paused' | 'archived';
export type DeviceStatus = 'online' | 'idle' | 'offline' | 'alert';
export type DeviceType = 'phone' | 'vehicle' | 'tracker';
export type LocationSource = 'android' | 'web-simulator' | 'seed';
export type GeofenceStatus = 'active' | 'paused';

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

export interface Device {
  id: string;
  projectId: string;
  name: string;
  type: DeviceType;
  owner: string;
  phone: string;
  status: DeviceStatus;
  lastSeenAt?: string;
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
