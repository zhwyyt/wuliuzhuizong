import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import { Activity, AlertTriangle, BarChart3, Building2, CheckCircle2, Crosshair, LocateFixed, LogIn, MapPin, MonitorUp, Plus, Radio, Route, ShieldCheck, Smartphone } from 'lucide-react';
import { api, realtimeUrl } from './api/client';
import './styles.css';

const AMAP_KEY = import.meta.env.VITE_AMAP_KEY || '';
const AMAP_SECURITY_CODE = import.meta.env.VITE_AMAP_SECURITY_CODE || '';
let amapLoader;

const statusText = {
  online: '在线',
  idle: '空闲',
  offline: '离线',
  alert: '异常',
};

const alertStatusText = {
  open: '待处理',
  acknowledged: '已确认',
  resolved: '已解决',
};

function Stat({ label, value, tone = 'default' }) {
  return (
    <div className={`stat stat-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MiniMap({ points, track = [], selectedProject }) {
  const mapRef = useRef(null);
  const amapRef = useRef(null);
  const overlayRef = useRef([]);
  const [amapError, setAmapError] = useState('');
  const useAmap = Boolean(AMAP_KEY && AMAP_SECURITY_CODE);
  const getLng = (point) => point.lng ?? point.longitude;
  const getLat = (point) => point.lat ?? point.latitude;

  const bounds = useMemo(() => {
    const all = [...points, ...track];
    if (!all.length) return { minLng: 119.8, maxLng: 121.8, minLat: 30, maxLat: 31.6 };
    return {
      minLng: Math.min(...all.map((p) => getLng(p))) - 0.05,
      maxLng: Math.max(...all.map((p) => getLng(p))) + 0.05,
      minLat: Math.min(...all.map((p) => getLat(p))) - 0.05,
      maxLat: Math.max(...all.map((p) => getLat(p))) + 0.05,
    };
  }, [points, track]);

  const projectPoints = selectedProject ? points.filter((point) => point.projectId === selectedProject) : points;
  const projectTrack = selectedProject ? track.filter((point) => point.projectId === selectedProject) : track;
  const mapMode = useAmap && !amapError ? '高德地图 JS API' : '内置坐标图层';
  const toXY = (point) => ({
    x: ((getLng(point) - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100,
    y: 100 - ((getLat(point) - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * 100,
  });

  useEffect(() => {
    if (!useAmap || !mapRef.current) return undefined;
    let cancelled = false;
    window._AMapSecurityConfig = { securityJsCode: AMAP_SECURITY_CODE };
    amapLoader ||= new Promise((resolve, reject) => {
      if (window.AMap) {
        resolve(window.AMap);
        return;
      }
      const script = document.createElement('script');
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}`;
      script.async = true;
      script.onload = () => resolve(window.AMap);
      script.onerror = () => reject(new Error('高德地图脚本加载失败'));
      document.head.appendChild(script);
    });

    amapLoader
      .then((AMap) => {
        if (cancelled || !mapRef.current) return;
        if (!amapRef.current) {
          amapRef.current = new AMap.Map(mapRef.current, {
            zoom: 10,
            center: [121.4737, 31.2304],
            viewMode: '2D',
          });
        }

        overlayRef.current.forEach((overlay) => overlay.setMap(null));
        overlayRef.current = [];
        const visiblePoints = [...projectPoints, ...projectTrack];
        if (projectTrack.length > 1) {
          const path = projectTrack.map((point) => [getLng(point), getLat(point)]);
          const polylineOverlay = new AMap.Polyline({
            path,
            strokeColor: '#0f9f6e',
            strokeWeight: 5,
          });
          polylineOverlay.setMap(amapRef.current);
          overlayRef.current.push(polylineOverlay);
        }
        projectPoints.forEach((point) => {
          const marker = new AMap.Marker({
            position: [getLng(point), getLat(point)],
            title: point.deviceName || point.deviceId,
          });
          marker.setMap(amapRef.current);
          overlayRef.current.push(marker);
        });
        if (visiblePoints.length) {
          amapRef.current.setFitView(overlayRef.current, false, [48, 48, 48, 48]);
        }
        setAmapError('');
      })
      .catch((err) => setAmapError(err.message));

    return () => {
      cancelled = true;
    };
  }, [projectPoints, projectTrack, useAmap]);

  const polyline = projectTrack.map((point) => {
    const { x, y } = toXY(point);
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="map-shell">
      <div className="map-toolbar">
        <span><MapPin size={16} /> {mapMode}</span>
        <span>{projectPoints.length} 个实时点</span>
      </div>
      {useAmap && !amapError ? <div ref={mapRef} className="amap-canvas" aria-label="高德实时位置地图" /> : <svg className="map-canvas" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="实时位置地图">
        <defs>
          <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(80,105,130,0.18)" strokeWidth="0.35" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#grid)" />
        {polyline && <polyline points={polyline} fill="none" stroke="#0f9f6e" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />}
        {projectPoints.map((point) => {
          const { x, y } = toXY(point);
          return <circle key={point.deviceId} cx={x} cy={y} r="2.6" className={`pin pin-${point.status}`} vectorEffect="non-scaling-stroke" />;
        })}
      </svg>}
      <div className="map-legend">
        <span>坐标范围：华东演示数据</span>
        <span>{useAmap && !amapError ? '高德地图已启用' : (amapError || '未配置高德 Web Key 和安全密钥，当前使用内置坐标图层')}</span>
      </div>
    </div>
  );
}

function Login({ onLogin }) {
  const [name, setName] = useState('调度管理员');
  return (
    <main className="login-screen">
      <section className="login-panel">
        <div className="brand-line"><Radio size={26} /> 物流跟踪监控系统</div>
        <h1>项目化实时位置监控</h1>
        <form onSubmit={(event) => { event.preventDefault(); onLogin(name); }}>
          <label>
            账号名称
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <button type="submit"><LogIn size={18} /> 登录演示系统</button>
        </form>
      </section>
    </main>
  );
}

function ConsolePage({ user, data, selectedProject, setSelectedProject, onRefresh }) {
  const [projectForm, setProjectForm] = useState({ name: '', region: '', description: '' });
  const [deviceForm, setDeviceForm] = useState({ name: '', owner: '', phone: '' });
  const [geofenceForm, setGeofenceForm] = useState({ name: '', longitude: '120.1569', latitude: '30.7964', radiusMeters: '1000' });
  const [trackDevice, setTrackDevice] = useState('d-1001');
  const [track, setTrack] = useState([]);
  const [routeName, setRouteName] = useState('');
  const [routeText, setRouteText] = useState('120.1569,30.7964\n120.1580,30.7970');
  const [routeTolerance, setRouteTolerance] = useState('200');
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [routeResult, setRouteResult] = useState(null);

  const filteredLatest = selectedProject ? data.latest.filter((point) => point.projectId === selectedProject) : data.latest;
  const filteredDevices = selectedProject ? data.devices.filter((device) => device.projectId === selectedProject) : data.devices;
  const filteredGeofences = selectedProject ? data.geofences.filter((geofence) => geofence.projectId === selectedProject) : data.geofences;
  const filteredAlerts = selectedProject ? data.alerts.filter((alert) => alert.projectId === selectedProject) : data.alerts;
  const filteredRoutes = selectedProject ? data.routes.filter((route) => route.projectId === selectedProject) : data.routes;
  const routeNameById = useMemo(() => new Map(data.routes.map((route) => [route.id, route.name])), [data.routes]);

  async function addProject(event) {
    event.preventDefault();
    await api.createProject(projectForm);
    setProjectForm({ name: '', region: '', description: '' });
    onRefresh();
  }

  async function addDevice(event) {
    event.preventDefault();
    await api.createDevice({ ...deviceForm, projectId: selectedProject || data.projects[0]?.id });
    setDeviceForm({ name: '', owner: '', phone: '' });
    onRefresh();
  }

  async function addGeofence(event) {
    event.preventDefault();
    await api.createGeofence({ ...geofenceForm, projectId: selectedProject || data.projects[0]?.id });
    setGeofenceForm({ name: '', longitude: '120.1569', latitude: '30.7964', radiusMeters: '1000' });
    onRefresh();
  }

  async function loadTrack(deviceId = trackDevice) {
    if (!deviceId) return;
    setTrackDevice(deviceId);
    setTrack(await api.track(deviceId, selectedProject));
  }

  async function checkRoute(event) {
    event.preventDefault();
    const deviceId = trackDevice || filteredDevices[0]?.id || data.devices[0]?.id;
    if (!deviceId) return;
    setRouteResult(await api.routeDeviation({
      projectId: selectedProject || undefined,
      deviceId,
      routeId: selectedRouteId || undefined,
      toleranceMeters: routeTolerance,
      route: selectedRouteId ? undefined : parseRouteText(routeText),
    }));
  }

  async function saveRoute(event) {
    event.preventDefault();
    const route = await api.createRoute({
      projectId: selectedProject || data.projects[0]?.id,
      name: routeName,
      toleranceMeters: routeTolerance,
      route: parseRouteText(routeText),
    });
    setRouteName('');
    setSelectedRouteId(route.id);
    onRefresh();
  }

  async function assignRouteToDevice() {
    const deviceId = trackDevice || filteredDevices[0]?.id || data.devices[0]?.id;
    if (!deviceId) return;
    await api.assignDeviceRoute(deviceId, selectedRouteId || null);
    onRefresh();
  }

  async function handleAlert(alertId, status) {
    await api.updateAlert(alertId, {
      status,
      handledBy: user?.name || '调度员',
      handledNote: status === 'resolved' ? '现场状态已恢复' : '已联系设备人员',
    });
    onRefresh();
  }

  function selectRoute(routeId) {
    setSelectedRouteId(routeId);
    const route = filteredRoutes.find((item) => item.id === routeId);
    if (!route) return;
    setRouteTolerance(String(route.toleranceMeters));
    setRouteText(route.route.map((point) => `${point.longitude},${point.latitude}`).join('\n'));
  }

  async function simulateUpload() {
    const device = filteredDevices[0] || data.devices[0];
    if (!device) return;
    const latest = data.latest.find((point) => point.deviceId === device.id);
    await api.ingestLocation({
      projectId: device.projectId,
      deviceId: device.id,
      longitude: (latest?.longitude ?? latest?.lng ?? 121.47) + (Math.random() - 0.35) * 0.04,
      latitude: (latest?.latitude ?? latest?.lat ?? 31.23) + (Math.random() - 0.35) * 0.025,
      speed: Math.round(20 + Math.random() * 45),
      heading: Math.round(Math.random() * 359),
      battery: Math.round(45 + Math.random() * 50),
      source: 'web-simulator',
      status: 'online',
      capturedAt: new Date().toISOString(),
    });
    onRefresh();
  }

  return (
    <div className="console-grid">
      <section className="panel map-panel">
        <div className="panel-title">
          <h2><Crosshair size={20} /> 实时位置</h2>
          <button onClick={simulateUpload}><Activity size={16} /> 模拟 App 上报</button>
        </div>
        <MiniMap points={filteredLatest} track={track} selectedProject={selectedProject} />
      </section>

      <section className="panel">
        <div className="panel-title"><h2><Building2 size={20} /> 项目</h2></div>
        <div className="filter-row">
          <button className={!selectedProject ? 'active' : ''} onClick={() => setSelectedProject('')}>全部项目</button>
          {data.projects.map((project) => (
            <button key={project.id} className={selectedProject === project.id ? 'active' : ''} onClick={() => setSelectedProject(project.id)}>{project.name}</button>
          ))}
        </div>
        <form className="inline-form" onSubmit={addProject}>
          <input placeholder="项目名称" value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} />
          <input placeholder="区域" value={projectForm.region} onChange={(e) => setProjectForm({ ...projectForm, region: e.target.value })} />
          <input placeholder="描述" value={projectForm.description} onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })} />
          <button><Plus size={16} /> 新建</button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-title"><h2><Smartphone size={20} /> 人员/设备</h2></div>
        <div className="device-list">
          {filteredDevices.map((device) => (
            <button key={device.id} className="device-row" onClick={() => loadTrack(device.id)}>
              <span>{device.owner}</span>
              <strong>{device.name}</strong>
              <span>{device.routeId ? routeNameById.get(device.routeId) || '已分配路线' : '未分配路线'}</span>
              <em className={`badge badge-${device.status}`}>{statusText[device.status]}</em>
            </button>
          ))}
        </div>
        <form className="inline-form" onSubmit={addDevice}>
          <input placeholder="设备名" value={deviceForm.name} onChange={(e) => setDeviceForm({ ...deviceForm, name: e.target.value })} />
          <input placeholder="人员" value={deviceForm.owner} onChange={(e) => setDeviceForm({ ...deviceForm, owner: e.target.value })} />
          <input placeholder="手机号" value={deviceForm.phone} onChange={(e) => setDeviceForm({ ...deviceForm, phone: e.target.value })} />
          <button><Plus size={16} /> 绑定</button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-title"><h2><Route size={20} /> 轨迹回放</h2></div>
        <div className="track-list">
          {track.length ? track.map((point) => (
            <div key={point.id} className="track-row">
              <span>{new Date(point.timestamp).toLocaleTimeString()}</span>
              <strong>{(point.lng ?? point.longitude).toFixed(4)}, {(point.lat ?? point.latitude).toFixed(4)}</strong>
              <em>{point.speed} km/h</em>
            </div>
          )) : <p className="muted">点击设备加载历史轨迹。</p>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-title"><h2><ShieldCheck size={20} /> 电子围栏</h2></div>
        <div className="fence-list">
          {filteredGeofences.length ? filteredGeofences.map((geofence) => (
            <div key={geofence.id} className="fence-row">
              <strong>{geofence.name}</strong>
              <span>{geofence.longitude.toFixed(4)}, {geofence.latitude.toFixed(4)}</span>
              <em>{Math.round(geofence.radiusMeters)}m</em>
            </div>
          )) : <p className="muted">暂无电子围栏。</p>}
        </div>
        <form className="inline-form geofence-form" onSubmit={addGeofence}>
          <input placeholder="围栏名称" value={geofenceForm.name} onChange={(e) => setGeofenceForm({ ...geofenceForm, name: e.target.value })} />
          <input placeholder="经度" value={geofenceForm.longitude} onChange={(e) => setGeofenceForm({ ...geofenceForm, longitude: e.target.value })} />
          <input placeholder="纬度" value={geofenceForm.latitude} onChange={(e) => setGeofenceForm({ ...geofenceForm, latitude: e.target.value })} />
          <input placeholder="半径米" value={geofenceForm.radiusMeters} onChange={(e) => setGeofenceForm({ ...geofenceForm, radiusMeters: e.target.value })} />
          <button><Plus size={16} /> 新建</button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-title"><h2><AlertTriangle size={20} /> 告警事件</h2></div>
        <div className="alert-list">
          {filteredAlerts.length ? filteredAlerts.map((alert) => (
            <div key={alert.id} className="alert-row">
              <strong>{alert.geofenceName}</strong>
              <span>{alert.deviceId}</span>
              <span className={`alert-status alert-status-${alert.status}`}>{alertStatusText[alert.status] || alert.status}</span>
              <em>{alert.distanceMeters}m</em>
              {alert.status === 'open' && <button type="button" onClick={() => handleAlert(alert.id, 'acknowledged')}><CheckCircle2 size={15} /> 确认</button>}
              {alert.status !== 'resolved' && <button type="button" onClick={() => handleAlert(alert.id, 'resolved')}><ShieldCheck size={15} /> 解决</button>}
            </div>
          )) : <p className="muted">暂无告警事件。</p>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-title"><h2><BarChart3 size={20} /> 运营报表</h2></div>
        <div className="report-grid">
          <Stat label="待处理告警" value={data.summary.openAlertTotal ?? 0} tone="bad" />
          <Stat label="已确认" value={data.summary.acknowledgedAlertTotal ?? 0} />
          <Stat label="已解决" value={data.summary.resolvedAlertTotal ?? 0} tone="good" />
          <Stat label="路线覆盖" value={`${data.summary.routeAssignedTotal ?? 0}/${data.summary.deviceTotal ?? 0}`} />
          <Stat label="电子围栏" value={data.summary.activeGeofenceTotal ?? 0} />
          <Stat label="保存路线" value={data.summary.activeRouteTotal ?? 0} />
        </div>
      </section>

      <section className="panel route-panel">
        <div className="panel-title"><h2><LocateFixed size={20} /> 路线偏离</h2></div>
        <div className="route-saved-row">
          <select value={selectedRouteId} onChange={(event) => selectRoute(event.target.value)}>
            <option value="">临时路线</option>
            {filteredRoutes.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}
          </select>
          <input placeholder="路线名称" value={routeName} onChange={(event) => setRouteName(event.target.value)} />
          <button type="button" onClick={saveRoute}><Plus size={16} /> 保存路线</button>
          <button type="button" onClick={assignRouteToDevice}><Smartphone size={16} /> 分配设备</button>
        </div>
        <form className="route-form" onSubmit={checkRoute}>
          <label>
            路线坐标
            <textarea value={routeText} onChange={(event) => { setSelectedRouteId(''); setRouteText(event.target.value); }} />
          </label>
          <label>
            容差米
            <input value={routeTolerance} onChange={(event) => setRouteTolerance(event.target.value)} />
          </label>
          <button><Route size={16} /> 检测</button>
        </form>
        {routeResult && (
          <div className="route-result">
            <span>检查 {routeResult.checkedPoints} 点</span>
            <strong>{routeResult.deviatedPoints.length} 个偏离</strong>
            <em>最远 {routeResult.maxDistanceMeters}m</em>
          </div>
        )}
      </section>
    </div>
  );
}

function parseRouteText(routeText) {
  return routeText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [longitude, latitude] = line.split(',').map((item) => item.trim());
      return { longitude, latitude };
    });
}

function ScreenPage({ data, selectedProject, setSelectedProject }) {
  return (
    <div className="screen-page">
      <header className="screen-header">
        <div>
          <span>全项目实时分布</span>
          <h1>物流运行大屏</h1>
        </div>
        <select value={selectedProject} onChange={(event) => setSelectedProject(event.target.value)}>
          <option value="">全部项目</option>
          {data.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </header>
      <div className="screen-stats">
        <Stat label="项目总数" value={data.overview.projectTotal} />
        <Stat label="在线人数" value={data.overview.onlineTotal} tone="good" />
        <Stat label="今日活跃" value={data.overview.todayActive} />
        <Stat label="待处理告警" value={data.summary.openAlertTotal ?? data.overview.alertTotal} tone="bad" />
      </div>
      <div className="screen-layout">
        <MiniMap points={data.overview.latest || []} selectedProject={selectedProject} />
        <section className="screen-side">
          {data.overview.projects?.map((project) => (
            <div key={project.id} className="project-metric">
              <strong>{project.name}</strong>
              <span>{project.region} / {project.description || '暂无描述'}</span>
              <div>
                <em>{project.onlineCount} 在线</em>
                <em>{project.alertCount} 异常</em>
                <em>{project.deviceCount} 设备</em>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('console');
  const [selectedProject, setSelectedProject] = useState('');
  const [data, setData] = useState({ projects: [], devices: [], latest: [], overview: {}, geofences: [], alerts: [], routes: [], summary: {} });
  const [error, setError] = useState('');

  const refresh = useCallback(async (projectId = selectedProject) => {
    try {
      const [projects, devices, latest, overview, geofences, alerts, routes, summary] = await Promise.all([
        api.projects(),
        api.devices(),
        api.latest(projectId),
        api.overview(projectId),
        api.geofences(projectId),
        api.alerts({ projectId, limit: 50 }),
        api.routes(projectId),
        api.reportSummary(projectId),
      ]);
      setData({ projects, devices, latest, overview, geofences, alerts, routes, summary });
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [selectedProject]);

  useEffect(() => {
    if (user) refresh();
  }, [refresh, user]);

  useEffect(() => {
    if (user) refresh(selectedProject);
  }, [refresh, selectedProject, user]);

  useEffect(() => {
    if (!user) return undefined;
    const socket = io(realtimeUrl);
    socket.on('location:update', () => refresh());
    return () => socket.close();
  }, [refresh, user, selectedProject]);

  async function login(name) {
    const result = await api.login(name);
    setUser(result.user);
  }

  if (!user) {
    return <Login onLogin={login} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo"><Radio size={24} /> 物流跟踪</div>
        <button className={view === 'console' ? 'active' : ''} onClick={() => setView('console')}><BarChart3 size={18} /> 管理端</button>
        <button className={view === 'screen' ? 'active' : ''} onClick={() => setView('screen')}><MonitorUp size={18} /> 大屏</button>
        <div className="sidebar-user">{user.name}<span>{user.role}</span></div>
      </aside>
      <main className="workspace">
        {error && <div className="error"><AlertTriangle size={16} /> {error}</div>}
        {view === 'console' ? (
          <ConsolePage user={user} data={data} selectedProject={selectedProject} setSelectedProject={setSelectedProject} onRefresh={() => refresh()} />
        ) : (
          <ScreenPage data={data} selectedProject={selectedProject} setSelectedProject={setSelectedProject} />
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
