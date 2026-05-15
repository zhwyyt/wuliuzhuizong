const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

export const api = {
  login: (name) => request('/auth/login', { method: 'POST', body: JSON.stringify({ name }) }),
  projects: () => request('/projects'),
  createProject: (project) => request('/projects', { method: 'POST', body: JSON.stringify(project) }),
  devices: (projectId) => request(`/devices${projectId ? `?projectId=${projectId}` : ''}`),
  createDevice: (device) => request('/devices', { method: 'POST', body: JSON.stringify(device) }),
  latest: (projectId) => request(`/locations/latest${projectId ? `?projectId=${projectId}` : ''}`),
  track: (deviceId, projectId) => request(`/devices/${deviceId}/track${projectId ? `?projectId=${projectId}` : ''}`),
  overview: (projectId) => request(`/overview${projectId ? `?projectId=${projectId}` : ''}`),
  ingestLocation: (point) => request('/locations', { method: 'POST', body: JSON.stringify(point) }),
  geofences: (projectId) => request(`/geofences${projectId ? `?projectId=${projectId}` : ''}`),
  createGeofence: (geofence) => request('/geofences', { method: 'POST', body: JSON.stringify(geofence) }),
  alerts: ({ projectId, deviceId, limit } = {}) => {
    const params = new URLSearchParams();
    if (projectId) params.set('projectId', projectId);
    if (deviceId) params.set('deviceId', deviceId);
    if (limit) params.set('limit', limit);
    const query = params.toString();
    return request(`/alerts${query ? `?${query}` : ''}`);
  },
  routeDeviation: (input) => request('/routes/deviation', { method: 'POST', body: JSON.stringify(input) }),
};

export const realtimeUrl = (import.meta.env.VITE_API_BASE || 'http://localhost:4000/api').replace('/api', '/realtime');
