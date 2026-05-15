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

- Web 管理端：http://localhost:5175
- 大屏入口：登录后点击左侧“大屏”
- 后端接口：http://localhost:4000/api
- 健康检查：http://localhost:4000/api/health
- 真机/Tailscale 后端地址格式：http://电脑IP:4000/api
- 附近设备查询示例：http://localhost:4000/api/locations/nearby?longitude=120.1569&latitude=30.7964&radiusMeters=5000
- 围栏内设备查询示例：http://localhost:4000/api/geofences/{id}/devices
- 告警事件查询示例：http://localhost:4000/api/alerts?projectId=p-shanghai
- 保存路线查询示例：http://localhost:4000/api/routes?projectId=p-shanghai
- 设备路线分配接口：`PATCH /api/devices/{id}/route`
- 路线偏离检测接口：`POST /api/routes/deviation`

## PostgreSQL 持久化

后端会自动读取 `backend/.env`。如果配置了 `DB_HOST`、`DB_USERNAME` 和 `DB_DATABASE`，后端会使用 PostgreSQL，并自动创建数据库和 `wuliu_*` 业务表。

复制示例配置：

```powershell
Copy-Item backend/.env.example backend/.env
```

本地没有数据库配置时，后端会继续使用 `backend/data/runtime.json` 作为轻量持久化。

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
- 电子围栏创建与告警事件查看。
- 保存路线走廊、设备路线分配与路线偏离检测。
- WebSocket 位置更新推送。

## Android Studio 运行方式

1. 用 Android Studio 打开 `mobile/` 目录。
2. 等待 Gradle Sync 完成。
3. 启动后端服务。
4. 模拟器默认后端地址使用 `http://10.0.2.2:4000/api`。
5. 真机调试时把 App 内后端地址改为电脑局域网 IP 或 Tailscale IP，例如 `http://192.168.1.10:4000/api` 或 `http://100.101.3.116:4000/api`。
6. 点击“开始定位上报”或“立即上报一次”。

## Android Studio Verification

Open `mobile/` in Android Studio.

Use these default values for emulator testing:

- Backend address: `http://10.0.2.2:4000/api`
- Project ID: `p-shanghai`
- Device ID: `d-android-001`

For a physical Android phone on the same LAN or Tailscale network, replace `10.0.2.2` with the computer's LAN/Tailscale IP address and keep port `4000`.

Example for Tailscale:

```text
http://100.101.3.116:4000/api
```

Before using the APK on a phone, open this health check in the phone browser:

```text
http://100.101.3.116:4000/api/health
```

If the health check opens, the APK can upload locations to the local backend through Tailscale.

## AMap Key

The Web app runs without an AMap key. In that mode it shows the built-in coordinate fallback map.

For local Web AMap JS API integration, create `web/.env.local` from `web/.env.example`:

```dotenv
VITE_AMAP_KEY="your-amap-web-js-key"
VITE_AMAP_SECURITY_CODE="your-amap-web-js-security-code"
```

Then restart the Web dev server:

```powershell
npm run dev -w web
```

For Android AMap location SDK integration, create `mobile/local.properties` from `mobile/local.properties.example`:

```properties
AMAP_ANDROID_KEY=your-android-platform-key
```

Then open `mobile/` in Android Studio and run Gradle Sync. The Android debug package name is:

```text
com.example.wuliugenzong
```

The current Android app uses AMap location first and falls back to system location if AMap is unavailable. It no longer uploads demo coordinates.

## 目录结构

- `backend/` NestJS REST API 和 WebSocket 推送。
- `web/` React 管理端和大屏页面。
- `mobile/` Android Studio 原生 Android 采集端。
- `docs/` 架构和设计文档。
- `scripts/` 本地辅助脚本预留。
- `STATUS.md` 当前进度和风险。
- `TASKLIST.md` 任务清单。

## 当前简化

- 后端优先使用 PostgreSQL；未配置数据库时使用本地 JSON 文件持久化运行数据，文件位置为 `backend/data/runtime.json`。
- 地图以坐标画布展示实时点和轨迹，保留高德地图接入边界。
- 权限模型为演示登录，后续需要接入真实账号、角色和项目权限。

## 已验证

- `npm run build`
- `npm test -w backend`
- `npm run lint -w web`（当前仍会提示单文件 demo 的 Fast Refresh warning）
- 后端 API smoke check：`/health`、`/projects`、`/locations/latest`、`POST /locations`、`/devices/d-1001/track`、`/overview`
- Web dev server HTTP 200：`http://127.0.0.1:5175`
- Android Gradle `assembleDebug`
- PostgreSQL/PostGIS 模式 API smoke check：自动建库/建表、位置上报、最新位置查询、附近设备查询、电子围栏查询、围栏告警事件、保存路线走廊、设备路线分配、路线偏离检测

测试环境会自动使用内存仓库；如果本地临时需要禁用落盘，可以设置 `WULIU_DATA_FILE=memory`。

## 下一阶段建议

- 增加 Web 端围栏/告警管理界面和更完整的权限模型。
- 接入高德 Web JS API 和 Android 高德定位 SDK。
- 增加后台保活、定位服务通知和 Android 任务管理。
- 增加项目成员角色、告警处置流和报表。
