---
name: octopus-rum
description: Octopus 大前端观测（RUM）与 Web SDK 使用指南。涵盖 RUM 核心概念（Session/View/Action/Resource/Error）、Web 端接入、用户行为追踪、页面性能监控（LCP/INP/CLS）、RUM 查询语法、Browser Logs SDK（@octopus-sdk/browser-logs）完整接入与配置、RUM SDK（@octopus-sdk/browser-rum）、Source Map 上传、部署事件关联。用于指导前端项目接入 Octopus RUM 和日志 SDK。
version: 1.0.0
tags:
  - octopus
  - rum
  - frontend
  - web-sdk
  - browser-logs
  - monitoring
  - performance
---

# Octopus 大前端观测（RUM）与 Web SDK

## 概述

Octopus RUM（Real User Monitoring）专为 Web 端场景设计，通过采集真实用户行为数据分析前端应用性能，提供端到端可见性。

### RUM 核心概念

| 概念 | 说明 |
|------|------|
| **Session** | 用户一段时间内的浏览过程。超过 15 分钟无活动结束，最长持续 4 小时 |
| **View** | 用户每次访问一个页面生成一个 View，resource/error/action 通过 `view.id` 关联 |
| **Resource** | 所有 HTTP 网络请求，含静态资源加载和接口请求，包含加载时间明细 |
| **Action** | 用户交互事件，可自动采集或开发者主动上报 |
| **Error** | 端侧应用运行时报错信息 |

### 已支持功能

- RUM 事件详情分析
- JavaScript 错误聚合与告警
- trace 打通前端请求 → 后端调用
- 全链路拓扑图
- 服务端日志自动关联 RUM 用户侧信息

---

## 一、Web 端观测

### 1.1 追踪用户行为

RUM 自动检测用户交互，无需手动埋点。可实现：
- 了解关键交互性能（如点击"添加到购物车"按钮）
- 量化功能使用率
- 确定导致浏览器错误的步骤

#### 自定义 Action 名称

在可点击元素上定义 `data-oc-action-name` 属性：

```html
<a class="btn btn-default" href="#" role="button" data-oc-action-name="Login button">
  Try it out!
</a>

<div class="alert alert-danger" role="alert" data-oc-action-name="Dismiss alert">
    <span class="glyphicon glyphicon-exclamation-sign" aria-hidden="true"></span>
    Enter a valid email address
</div>
```

使用自定义属性名：

```javascript
octopusRum.init({
  trackUserInteractions: true,
  actionNameAttribute: 'data-custom-name',
});
```

#### 操作名称计算策略

1. 优先使用 `data-oc-action-name` 或自定义属性
2. 其次使用 `label`、`placeholder`、`aria-label`
3. 最后使用内部文本

#### 发送自定义操作

使用 `addAction` API 发送自定义操作。

### 1.2 监控页面性能

核心 Web 指标（Core Web Vitals）：

| 指标 | 说明 |
|------|------|
| **LCP** (Largest Contentful Paint) | 加载性能 |
| **INP** (Interaction to Next Paint) | 交互性 |
| **CLS** (Cumulative Layout Shift) | 视觉稳定性 |

#### SPA 监控

使用 `loading_type` 区分 `initial_load` 和 `route_change`。通过 History API 跟踪 URL 更改。

#### Loading Time 计算

- **初始加载**：取网络请求和 DOM 变更中较长者
- **SPA 路由更改**：URL 更改到首次无活动时间的差值

页面活动判定：`xhr`/`fetch` 进行中、Resource 指标变更、DOM 变更（MutationObserver）。100ms 内无活动视为结束。

#### Hash SPA 导航

SDK 自动监控 Hash (`#`) 导航，通过 `HashChangeEvent` 发出新视图。

---

## 二、RUM 查询语法

### 事件类型

查询前需选择事件类型（Session/View/Action/Resource/Error），默认 Session。

### 字段搜索

| 匹配符 | 含义 | 举例 |
|--------|------|------|
| `=` | 等于 | `view.name = 任务列表` |
| `!=` | 不等于 | `view.name != 任务列表` |
| `>` | 大于 | `view.loading_time > 136000000` |
| `>=` | 大于等于 | `view.loading_time >= 136000000` |
| `<` | 小于 | `view.loading_time < 136000000` |
| `<=` | 小于等于 | `view.loading_time <= 136000000` |
| `in` | 包含 | `view.name in (任务列表,任务管理)` |
| `not in` | 不包含 | `view.name not in (任务列表,任务管理)` |

**注意**：key 和 value **严格区分大小写**，匹配符大小写不敏感。仅分析字段支持 `>`/`>=`/`<`/`<=`。

### 逻辑运算

| 运算符 | 说明 |
|--------|------|
| `AND` | 满足所有条件（基础模式默认） |
| `OR` | 满足任一条件（仅高级模式） |
| `NOT` | 不满足该条件 |

优先级：**NOT > AND > OR**，可用括号 `()` 提升优先级。运算符大小写不敏感。

### 模糊匹配

仅适用于字段搜索，严格区分大小写。支持 `*`（任意字符任意多次）和 `?`（单字符）。

### 特殊字符处理

含 `= > < ~ ' " * + ? ( ) [ ] { } ! ^ | / % \` 及空格的值需用双引号包裹。双引号和反斜杠需用 `\` 转义。

```
browser.name in ("Chrome Mobile WebView","Mobile Safari")
```

### 两种模式

- **基础模式**（推荐）：图形化输入，提供输入建议，不支持 OR
- **高级模式**：文本输入，支持完整搜索语法

---

## 三、Browser Logs SDK（@octopus-sdk/browser-logs）

新版日志 SDK，可独立于 RUM SDK 使用。

### 3.1 安装

#### NPM

```bash
npm install @octopus-sdk/browser-logs
```

#### 初始化

```typescript
import { octopusLogs } from '@octopus-sdk/browser-logs';

octopusLogs.init({
  clientToken: '<OCTOPUS_CLIENT_TOKEN>',
  service: '<SERVICE_NAME>',
  env: '<ENV>',
});
```

#### CDN

```html
<script src="https://octopus.zhenguanyu.com/octopus-sdk/logs/1.3.2/browser-logs.min.js"></script>
<script>
if (typeof octopusLogs !== 'undefined') {
  octopusLogs.init({
    clientToken: '<OCTOPUS_CLIENT_TOKEN>',
    service: '<SERVICE_NAME>',
    env: '<ENV>',
  });
}
</script>
```

#### 全局对象

SDK 初始化后可通过 `window.OC_LOGS` 访问：

```javascript
if (window.OC_LOGS) {
  window.OC_LOGS.setUser({ id: 'user123', name: 'John' });
}
```

### 3.2 自定义日志

```typescript
octopusLogs.logger.info('Button clicked', { name: 'buttonName', id: 123 });
```

SDK 默认添加字段：`timestamp`、`view.url`、`view.referrer`、`rum.session.id`、`sdk.name`、`sdk.version`。Octopus 接入层添加 `user.ip`。

### 3.3 User Context

```typescript
octopusLogs.setUser({ id: "1234", name: "John Doe", email: "john@doe.com" });
octopusLogs.setUserProperty("type", "customer");
octopusLogs.getUser();
octopusLogs.removeUserProperty('type');
octopusLogs.clearUser();
```

### 3.4 通用 Logger

```typescript
octopusLogs.logger.log(<MESSAGE>, <JSON_ATTRIBUTES>, <LEVEL>);
```

### 3.5 关键配置参数

| 参数 | 说明 |
|------|------|
| `alwaysUseXhr` | 默认 false。部分 iOS WebView 不支持 Blob/fetch，需设为 true |
| `batchMessagesLimit` | 批量发送条数上限。高频场景设 10-20，实时性要求高设 1 |
| `sendImmediately` | 设为 true 自动将 `batchMessagesLimit` 设为 1（优先级高于 batchMessagesLimit） |
| `beforeSend` | 回调函数，在日志发送前修改/过滤，可用于剥离敏感数据 |

---

## 四、RUM 数据关联部署事件

SDK 配置 `version` 字段与部署事件 `service.version` 保持一致即可关联。

### 推荐：使用 Git HEAD Commit Hash

构建阶段获取 Hash（Rspack 示例）：

```javascript
const cp = require('child_process');
const commitHash = cp.execSync('git rev-parse HEAD').toString('utf-8').trim();

new rspack.DefinePlugin({
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
    __COMMIT_HASH__: JSON.stringify(commitHash),
});
```

SDK 中使用：

```typescript
import { octopusLogs } from '@octopus-sdk/browser-logs';
import { octopusRum } from '@octopus-sdk/browser-rum';

octopusLogs.init({
  version: __COMMIT_HASH__,
});

octopusRum.init({
  version: __COMMIT_HASH__,
});
```

Console 平台发布的项目会自动采集 HEAD Commit Hash 作为 `service.version`。

---

## 五、旧版日志 SDK（@deprecated）

> 已停止维护，推荐迁移到 `@octopus-sdk/browser-logs`。

```bash
npm install @yuanfudao/octopus-browser-logs
```

```typescript
import {
  initializeLogs,
  ProtoLogRecordProcessor,
} from '@yuanfudao/octopus-browser-logs';

export const octopusLogs = initializeLogs({
  service: 'my-service',
  env: 'test',
  session: { enable: true, manualLifecycle: true },
  trace: {
    enable: true,
    protocol: 'skywalking',
    allowUrlPatterns: ['https://example.com/api'],
    skywalkingNamespace: 'default',
    collectHttpRequestLog: 'detailed',
    collectHttpResponseLog: 'detailed',
  },
  logRecordProcessors(sharedState) {
    return [
      new ProtoLogRecordProcessor(
        { scheduledDelayMillis: 500 },
        { apiKey: 'YOUR_API_KEY', sharedState },
      ),
    ];
  },
});

octopusLogs.logger.info('log content', { attr1: 'value' });
```

### Session 跨页面传递

A 页面：

```typescript
octopusLogs.session.startSession();
const sessionId = octopusLogs.session.getSessionId();
window.open(`page-b?session_id=${sessionId}`, '_blank');
```

B 页面：

```typescript
const sessionId = new URLSearchParams(location.search).get('session_id');
octopusLogs.session.startSession(sessionId);
```

---

## NPM 包汇总

| 包名 | 用途 |
|------|------|
| `@octopus-sdk/browser-logs` | 新版日志 SDK（支持 RUM） |
| `@octopus-sdk/browser-rum` | RUM SDK |
| `@octopus-sdk/octopus-cli` | Octopus CLI（Source Map 上传等） |
