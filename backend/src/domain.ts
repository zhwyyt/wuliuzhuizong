export type DeviceStatus = 'online' | 'idle' | 'offline' | 'alert';

export interface User {
  id: string;
  name: string;
  role: 'admin' | 'operator';
}

export interface Project {
  id: string;
  name: string;
  city: string;
  manager: string;
  status: 'active' | 'paused';
  createdAt: string;
}

export interface Device {
  id: string;
  projectId: string;
  name: string;
  owner: string;
  phone: string;
  status: DeviceStatus;
}

export interface LocationPoint {
  id: string;
  projectId: string;
  deviceId: string;
  lng: number;
  lat: number;
  speed: number;
  heading: number;
  status: DeviceStatus;
  timestamp: string;
}

export interface LatestLocation extends LocationPoint {
  projectName: string;
  deviceName: string;
  owner: string;
}
