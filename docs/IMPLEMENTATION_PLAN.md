# Implementation Plan

## 阶段 0：项目协作约定

目标：先建立可持续协作规则，避免关键决策只留在聊天记录里。

交付：

- `CONTRIBUTING.md`
- `STATUS.md`
- `TASKLIST.md`
- `docs/REQUIREMENTS.md`
- `docs/IMPLEMENTATION_PLAN.md`

验收：

- 分支、提交、PR 范围、文档同步、Definition of Done 已写入仓库。
- 当前状态和任务清单可作为后续会话入口。

## 阶段 1：MVP 架构设计

目标：确定最小闭环，不被完整生产架构拖慢。

决策：

- Monorepo：`backend/`、`web/`、`mobile/`、`docs/`。
- 后端：NestJS REST 为主，WebSocket 做实时位置推送。
- 前端：React 管理端和大屏在同一个 Vite 应用内。
- 移动端：Android Studio 原生 Android 工程。
- 数据：MVP 使用内存仓库，后续替换 PostgreSQL + PostGIS。
- 地图：MVP 先做地图适配层和坐标展示，后续接高德 SDK。

验收：

- 架构边界写入 `docs/ARCHITECTURE.md`。
- API、数据实体、移动端上报路径清晰。

## 阶段 2：后端最小闭环

目标：提供 Web 和 Android 都能调用的核心 API。

任务：

- 初始化 NestJS 应用。
- 实现演示登录。
- 实现项目列表和创建。
- 实现设备列表和创建。
- 实现位置上报。
- 实现最新位置查询。
- 实现设备轨迹查询。
- 实现大屏统计接口。
- 实现 WebSocket `location:update` 推送。

验收：

- `GET /api/health` 返回成功。
- `POST /api/locations` 后能在 `GET /api/locations/latest` 查到最新位置。
- `GET /api/overview` 返回大屏指标。

## 阶段 3：Web 管理端

目标：让调度员能完成日常监控的主流程。

任务：

- 登录页。
- 项目筛选：全部项目/单项目。
- 项目创建。
- 设备列表和设备绑定。
- 实时位置展示。
- 模拟 App 位置上报按钮。
- 轨迹回放列表和地图路径展示。

验收：

- 登录后可进入管理端。
- 可按项目查看设备和最新位置。
- 点击设备可看到轨迹。
- 模拟上报后地图和列表能刷新。

## 阶段 4：大屏总览

目标：满足电视/会议室展示。

任务：

- 展示项目总数、在线人数、今日活跃、异常数量。
- 展示全项目位置分布。
- 展示项目列表和项目级指标。
- 支持切换某个项目视图。

验收：

- 大屏页面不是营销页，视觉偏业务监控。
- 全项目和单项目切换后指标、位置点同步变化。

## 阶段 5：Android Studio 采集端

目标：建立手机作为定位数据源的主路径。

任务：

- 创建 Android Studio 原生工程。
- 请求定位和网络权限。
- 配置后端地址和设备 ID。
- 获取 GPS/网络定位。
- 支持手动上报一次。
- 支持定时上报。

验收：

- Android Studio 能打开 `mobile/`。
- 模拟器可使用 `10.0.2.2` 访问本机后端。
- 真机可改为局域网 IP 调用后端。

## 阶段 6：本地验证与修正

目标：用最小检查确认闭环可用。

任务：

- 安装依赖。
- 构建后端。
- 构建 Web。
- 启动后端。
- 启动 Web。
- 调用 API 健康检查、总览、位置上报和最新位置。
- 记录本地端口问题和解决方案。

验收：

- 能给出 Web 管理端入口、大屏入口、后端接口入口。
- 未完成项和风险写入 `STATUS.md`。

## 阶段 7：下一阶段生产化

目标：把可演示 MVP 逐步替换为可落地系统。

任务：

- 引入 PostgreSQL + PostGIS。
- 设计 migration 和索引。
- 接入高德 Web JS API。
- 接入 Android 高德定位 SDK。
- 增加真实认证和项目权限。
- 增加告警、电子围栏、报表、任务和签到。
