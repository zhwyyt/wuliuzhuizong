import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import { Activity, AlertTriangle, BarChart3, Building2, Crosshair, LogIn, MapPin, MonitorUp, Plus, Radio, Route, Smartphone } from 'lucide-react';
import { api, realtimeUrl } from './api/client';
import './styles.css';

const statusText = {
  online: '在线',
  idle: '空闲',
  offline: '离线',
  alert: '异常',
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
  const all = [...points, ...track];
  const bounds = useMemo(() => {
    if (!all.length) return { minLng: 119.8, maxLng: 121.8, minLat: 30, maxLat: 31.6 };
    return {
      minLng: Math.min(...all.map((p) => p.lng)) - 0.05,
      maxLng: Math.max(...all.map((p) => p.lng)) + 0.05,
      minLat: Math.min(...all.map((p) => p.lat)) - 0.05,
      maxLat: Math.max(...all.map((p) => p.lat)) + 0.05,
    };
  }, [all]);

  const projectPoints = selectedProject ? points.filter((point) => point.projectId === selectedProject) : points;
  const projectTrack = selectedProject ? track.filter((point) => point.projectId === selectedProject) : track;
  const toXY = (point) => ({
    x: ((point.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100,
    y: 100 - ((point.lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * 100,
  });

  const polyline = projectTrack.map((point) => {
    const { x, y } = toXY(point);
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="map-shell">
      <div className="map-toolbar">
        <span><MapPin size={16} /> 高德地图接入位</span>
        <span>{projectPoints.length} 个实时点</span>
      </div>
      <svg className="map-canvas" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="实时位置地图">
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
      </svg>
      <div className="map-legend">
        <span>坐标范围：华东演示数据</span>
        <span>生产环境替换为 AMap JS SDK 图层</span>
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

function ConsolePage({ data, selectedProject, setSelectedProject, onRefresh }) {
  const [projectForm, setProjectForm] = useState({ name: '', region: '', description: '' });
  const [deviceForm, setDeviceForm] = useState({ name: '', owner: '', phone: '' });
  const [trackDevice, setTrackDevice] = useState('d-1001');
  const [track, setTrack] = useState([]);

  const filteredLatest = selectedProject ? data.latest.filter((point) => point.projectId === selectedProject) : data.latest;
  const filteredDevices = selectedProject ? data.devices.filter((device) => device.projectId === selectedProject) : data.devices;

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

  async function loadTrack(deviceId = trackDevice) {
    if (!deviceId) return;
    setTrackDevice(deviceId);
    setTrack(await api.track(deviceId, selectedProject));
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
              <strong>{point.lng.toFixed(4)}, {point.lat.toFixed(4)}</strong>
              <em>{point.speed} km/h</em>
            </div>
          )) : <p className="muted">点击设备加载历史轨迹。</p>}
        </div>
      </section>
    </div>
  );
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
        <Stat label="异常数量" value={data.overview.alertTotal} tone="bad" />
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
  const [data, setData] = useState({ projects: [], devices: [], latest: [], overview: {} });
  const [error, setError] = useState('');

  async function refresh(projectId = selectedProject) {
    try {
      const [projects, devices, latest, overview] = await Promise.all([
        api.projects(),
        api.devices(),
        api.latest(projectId),
        api.overview(projectId),
      ]);
      setData({ projects, devices, latest, overview });
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (user) refresh();
  }, [user]);

  useEffect(() => {
    if (user) refresh(selectedProject);
  }, [selectedProject]);

  useEffect(() => {
    if (!user) return undefined;
    const socket = io(realtimeUrl);
    socket.on('location:update', () => refresh());
    return () => socket.close();
  }, [user, selectedProject]);

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
          <ConsolePage data={data} selectedProject={selectedProject} setSelectedProject={setSelectedProject} onRefresh={() => refresh()} />
        ) : (
          <ScreenPage data={data} selectedProject={selectedProject} setSelectedProject={setSelectedProject} />
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
