# 物流跟踪监控系统 MVP

这是一个从零实现的 GPS/物流位置监控 MVP，参考 Traccar 的产品结构和交互思路，但代码独立于参考项目。

## 本地运行

安装依赖：

```powershell
npm install
```

同时启动后端和 Web：

```powershell
npm run dev
```

默认地址：

- Web 管理端：http://localhost:5174
- 大屏入口：登录后点击左侧“大屏”
- 后端接口：http://localhost:4000/api
- 健康检查：http://localhost:4000/api/health

## 演示账号

登录页输入任意账号名称即可进入，默认使用 `调度管理员`。

## 核心能力

- 用户登录演示。
- 项目列表、新建项目、按项目查看。
- 人员/设备列表、绑定设备。
- Android App 位置上报接口。
- Web 实时位置展示。
- 所有项目实时分布。
- 单项目筛选。
- 大屏总览页。
- 基础轨迹回放。
- WebSocket 位置更新推送。

## Android Studio 运行方式

1. 用 Android Studio 打开 `mobile/` 目录。
2. 等待 Gradle Sync 完成。
3. 启动后端服务。
4. 模拟器默认后端地址使用 `http://10.0.2.2:4000/api`。
5. 真机调试时把 App 内后端地址改为电脑局域网 IP，例如 `http://192.168.1.10:4000/api`。
6. 点击“开始定位上报”或“立即上报一次”。

## Android Studio Verification

Open `mobile/` in Android Studio.

Use these default values for emulator testing:

- Backend address: `http://10.0.2.2:4000/api`
- Project ID: `p-shanghai`
- Device ID: `d-1001`

For a physical Android phone on the same LAN, replace `10.0.2.2` with the computer's LAN IP address and keep port `4000`.

## AMap Key

The Web app runs without an AMap key. In that mode it shows the built-in coordinate fallback map.

To prepare for AMap integration, set this environment variable before starting the Web app:

```powershell
$env:VITE_AMAP_KEY="your-amap-web-js-key"
npm run dev -w web
```

The current MVP only exposes the configuration surface and fallback behavior. The production AMap JS SDK layer is a follow-up task after the demo loop is verified.

## 目录结构

- `backend/` NestJS REST API 和 WebSocket 推送。
- `web/` React 管理端和大屏页面。
- `mobile/` Android Studio 原生 Android 采集端。
- `docs/` 架构和设计文档。
- `scripts/` 本地辅助脚本预留。
- `STATUS.md` 当前进度和风险。
- `TASKLIST.md` 任务清单。

## 当前简化

- 后端使用内存数据，便于本地零依赖演示。
- 地图以坐标画布展示实时点和轨迹，保留高德地图接入边界。
- 权限模型为演示登录，后续需要接入真实账号、角色和项目权限。

## 下一阶段建议

- 接入 PostgreSQL + PostGIS 并迁移内存仓库。
- 接入高德 Web JS API 和 Android 高德定位 SDK。
- 增加后台保活、定位服务通知和 Android 任务管理。
- 增加项目成员角色、告警规则、电子围栏和报表。
